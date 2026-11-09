import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import {
  MSG,
  ERR,
  cleanName,
  validateScreenFrame,
  validateControl,
  CONTROL_KEY_RE,
} from '../../shared/protocol.js';
import { randomId } from '../../shared/elements.js';
import { TokenBucket } from './rateLimiter.js';

const HEARTBEAT_MS = 30_000;
const MAX_OPS_PER_MESSAGE = 500;
const MAX_BUFFERED_FOR_VOLATILE = 1024 * 1024; // si hay >1 MB pendiente, se saltan cuadros

/**
 * Canal en tiempo real en la ruta `/ws`.
 * Cada conexión debe enviar primero `join`; luego puede enviar `ops` y `cursor`.
 */
export function attachSocketServer(httpServer, { rooms, config, logger }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const client = {
      id: randomId(10),
      room: null,
      peer: null,
      bucket: new TokenBucket(config.rateLimit),
    };
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    const send = (msg, { volatile = false } = {}) => {
      if (ws.readyState !== ws.OPEN) return;
      if (volatile && ws.bufferedAmount > MAX_BUFFERED_FOR_VOLATILE) return;
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    };
    const fail = (code, message, close = false) => {
      send({ t: MSG.ERROR, code, message });
      if (close) ws.close(4000, code);
    };

    ws.on('message', async (data) => {
      if (!client.bucket.take()) {
        fail(ERR.RATE_LIMITED, 'Demasiados mensajes; espera un momento');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        fail(ERR.BAD_REQUEST, 'Mensaje no es JSON');
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;

      try {
        if (msg.t === MSG.JOIN) await handleJoin(msg);
        else if (!client.room) fail(ERR.NOT_JOINED, 'Primero debes unirte a una sala');
        else if (msg.t === MSG.OPS) handleOps(msg);
        else if (msg.t === MSG.CURSOR) handleCursor(msg);
        else if (msg.t === MSG.SCREEN) handleScreen(msg);
        else if (msg.t === MSG.SCREEN_STOP) stopScreen();
        else if (msg.t === MSG.CONTROL_REGISTER) registerController(msg);
        else if (msg.t === MSG.CONTROL) handleControl(msg);
      } catch (err) {
        logger.error('Error procesando mensaje:', err);
        fail(ERR.BAD_REQUEST, 'Error procesando el mensaje');
      }
    });

    async function handleJoin(msg) {
      if (client.room) return; // ya está unido
      const room = await rooms.get(msg.room);
      if (!room) return fail(ERR.ROOM_NOT_FOUND, 'La sala no existe o se cerró por quedar vacía', true);
      if (room.hasPin) {
        if (!msg.pin) return fail(ERR.PIN_REQUIRED, 'Esta sala requiere PIN', true);
        if (!rooms.checkPin(room, String(msg.pin))) return fail(ERR.PIN_INVALID, 'PIN incorrecto', true);
      }
      if (ws.readyState !== ws.OPEN) return;
      client.room = room;
      client.peer = room.addPeer({ id: client.id, name: cleanName(msg.name), send });
      const { id, name, color } = client.peer;
      send({
        t: MSG.WELCOME,
        you: { id, name, color },
        peers: room.publicPeers().filter((p) => p.id !== id),
        elements: room.snapshot(),
        screen: room.screen,
        controller: Boolean(room.controller),
      });
      room.broadcast({ t: MSG.PEER_JOIN, peer: { id, name, color } }, id);
      logger.info(`${name} entró a la sala ${room.id} (${room.peers.size} conectados)`);
    }

    function handleOps(msg) {
      if (!Array.isArray(msg.ops) || msg.ops.length > MAX_OPS_PER_MESSAGE) {
        return fail(ERR.BAD_REQUEST, 'Lista de operaciones inválida');
      }
      const { accepted, full } = client.room.applyOps(msg.ops);
      if (accepted.length) client.room.broadcast({ t: MSG.OPS, from: client.id, ops: accepted }, client.id);
      if (full) fail(ERR.ROOM_FULL, 'La sala alcanzó el máximo de elementos');
    }

    function handleCursor(msg) {
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      client.room.broadcast({ t: MSG.CURSOR, id: client.id, x: msg.x, y: msg.y }, client.id);
    }

    function handleScreen(msg) {
      const frame = validateScreenFrame(msg);
      if (!frame) return fail(ERR.BAD_REQUEST, 'Cuadro de pantalla inválido');
      client.room.setScreen(client.id, frame);
      client.room.broadcast({ t: MSG.SCREEN, from: client.id, ...frame }, client.id, { volatile: true });
    }

    function stopScreen() {
      if (client.room?.clearScreen(client.id)) {
        client.room.broadcast({ t: MSG.SCREEN_STOP, from: client.id }, client.id);
      }
    }

    function registerController(msg) {
      if (typeof msg.key !== 'string' || !CONTROL_KEY_RE.test(msg.key)) {
        return fail(ERR.BAD_REQUEST, 'Clave de control inválida');
      }
      client.room.controller = { id: client.id, key: msg.key };
      client.room.broadcast({ t: MSG.CONTROLLER, online: true }, client.id);
    }

    function handleControl(msg) {
      const ctl = client.room.controller;
      if (!ctl) return fail(ERR.NO_CONTROLLER, 'El PC presentador no está conectado');
      const given = Buffer.from(typeof msg.key === 'string' ? msg.key : '');
      const expected = Buffer.from(ctl.key);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return fail(ERR.CONTROL_DENIED, 'Clave de control incorrecta: vuelve a escanear el QR de control');
      }
      const order = validateControl(msg);
      if (!order) return fail(ERR.BAD_REQUEST, 'Orden de control inválida');
      client.room.peers.get(ctl.id)?.send(JSON.stringify({ t: MSG.CONTROL, from: client.id, ...order }));
    }

    ws.on('close', () => {
      const { room, peer } = client;
      if (!room) return;
      stopScreen();
      if (room.controller?.id === client.id) {
        room.controller = null;
        room.broadcast({ t: MSG.CONTROLLER, online: false }, client.id);
      }
      room.removePeer(client.id);
      room.broadcast({ t: MSG.PEER_LEAVE, id: client.id });
      logger.info(`${peer.name} salió de la sala ${room.id} (${room.peers.size} conectados)`);
      rooms.releaseIfEmpty(room).catch((err) => logger.error(err));
    });
  });

  // Latido: cierra conexiones muertas (p. ej. celular que perdió la Wi-Fi).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
