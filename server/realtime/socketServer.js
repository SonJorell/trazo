import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import {
  MSG,
  ERR,
  cleanName,
  validateScreenFrame,
  validateControl,
  CONTROL_KEY_RE,
  GRANTED_ACTIONS,
  MAX_RTC_CHARS,
  REACTIONS,
  validateLaser,
  validatePoll,
  validateView,
  MAX_TIMER_MS,
} from '../../shared/protocol.js';
import { randomId, MAX_PAGE } from '../../shared/elements.js';
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

  /** Acepta conexiones /ws de un servidor HTTP o HTTPS (se pueden sumar varios). */
  wss.attach = (srv) =>
    srv.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url, 'http://x');
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
  wss.attach(httpServer);

  wss.on('connection', (ws) => {
    const client = {
      id: randomId(10),
      room: null,
      peer: null,
      bucket: new TokenBucket(config.rateLimit),
      lastControlRequest: 0,
      lastReaction: 0,
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
        else if (msg.t === MSG.CONTROL_REQUEST) requestControl();
        else if (msg.t === MSG.CONTROL_GRANT) grantControl(msg);
        else if (msg.t === MSG.RTC) relayRtc(msg);
        else if (msg.t === MSG.LASER) relayLaser(msg);
        else if (msg.t === MSG.REACTION) relayReaction(msg);
        else if (msg.t === MSG.PAGE) setPage(msg);
        else if (msg.t === MSG.VIEW) setView(msg);
        else if (msg.t === MSG.TIMER) setTimer(msg);
        else if (msg.t === MSG.POLL) openPoll(msg);
        else if (msg.t === MSG.VOTE) vote(msg);
        else if (msg.t === MSG.POLL_CLOSE) closePoll(msg);
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
      // Solo el anfitrión (con su clave) puede ser la presentación principal.
      const host = room.isHostKey(msg.hostKey);
      client.peer = room.addPeer({
        id: client.id,
        name: cleanName(msg.name),
        send,
        host,
        display: host && msg.display === true,
      });
      const { id, name, color, display } = client.peer;
      send({
        t: MSG.WELCOME,
        you: { id, name, color, host, display },
        peers: room.publicPeers().filter((p) => p.id !== id),
        elements: room.snapshot(),
        screen: room.screen,
        controller: Boolean(room.controller),
        page: room.page,
        view: room.view,
        timer: room.timer,
        poll: room.publicPoll(),
        canSteer: room.canSteer(client.peer),
      });
      room.broadcast({ t: MSG.PEER_JOIN, peer: { id, name, color, display, host } }, id);
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
      if (!client.peer.host) return fail(ERR.NOT_HOST, 'Solo el anfitrión puede transmitir su pantalla');
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
      if (!client.peer.host) {
        return fail(ERR.NOT_HOST, 'Esta ventana no es la presentación principal: ábrela desde el PC del anfitrión');
      }
      if (typeof msg.key !== 'string' || !CONTROL_KEY_RE.test(msg.key)) {
        return fail(ERR.BAD_REQUEST, 'Clave de control inválida');
      }
      client.room.controller = { id: client.id, key: msg.key };
      client.room.broadcast({ t: MSG.CONTROLLER, online: true }, client.id);
    }

    function handleControl(msg) {
      const ctl = client.room.controller;
      if (!ctl) return fail(ERR.NO_CONTROLLER, 'El PC presentador no está conectado');
      const order = validateControl(msg);
      if (!order) return fail(ERR.BAD_REQUEST, 'Orden de control inválida');
      const given = Buffer.from(typeof msg.key === 'string' ? msg.key : '');
      const expected = Buffer.from(ctl.key);
      const hasKey = given.length === expected.length && crypto.timingSafeEqual(given, expected);
      // Sin clave, solo quien recibió permiso del anfitrión, y solo para pasar diapositivas.
      const granted = client.room.canSteer(client.peer) && GRANTED_ACTIONS.includes(order.action);
      if (!hasKey && !granted) {
        return fail(ERR.CONTROL_DENIED, msg.key ? 'Clave de control incorrecta: vuelve a escanear el QR de control' : 'No tienes permiso para controlar la presentación');
      }
      client.room.peers.get(ctl.id)?.send(JSON.stringify({ t: MSG.CONTROL, from: client.id, ...order }));
    }

    function requestControl() {
      const ctl = client.room.controller;
      if (!ctl) return fail(ERR.NO_CONTROLLER, 'El PC presentador no está conectado');
      const now = Date.now();
      if (now - client.lastControlRequest < 5000) return; // evita insistir en ráfaga
      client.lastControlRequest = now;
      client.room.peers
        .get(ctl.id)
        ?.send(JSON.stringify({ t: MSG.CONTROL_REQUEST, from: client.id, name: client.peer.name }));
    }

    function grantControl(msg) {
      const room = client.room;
      if (room.controller?.id !== client.id) return fail(ERR.CONTROL_DENIED, 'Solo el PC presentador da permisos');
      if (msg.all === true || msg.all === false) {
        // Permitir (o dejar de permitir) a todos los participantes.
        room.grantAll = msg.all;
        for (const peer of room.peers.values()) {
          if (peer.host) continue;
          peer.send(JSON.stringify({ t: MSG.CONTROL_GRANTED, granted: room.canSteer(peer), all: room.grantAll }));
        }
        return;
      }
      const target = room.peers.get(msg.to);
      if (!target) return;
      if (msg.granted === true) room.grants.add(target.id);
      else room.grants.delete(target.id);
      target.send(JSON.stringify({ t: MSG.CONTROL_GRANTED, granted: room.grants.has(target.id) }));
    }

    function relayLaser(msg) {
      const laser = validateLaser(msg);
      if (!laser) return;
      client.room.broadcast({ t: MSG.LASER, from: client.id, ...laser }, client.id, { volatile: true });
    }

    function relayReaction(msg) {
      if (!REACTIONS.includes(msg.e)) return fail(ERR.BAD_REQUEST, 'Reacción no permitida');
      const now = Date.now();
      if (now - client.lastReaction < 600) return; // sin lluvias de emojis
      client.lastReaction = now;
      client.room.broadcast({ t: MSG.REACTION, from: client.id, name: client.peer.name, e: msg.e }, client.id);
    }

    const requireHost = (what) => {
      if (client.peer.host) return true;
      fail(ERR.NOT_HOST, `Solo el anfitrión puede ${what}`);
      return false;
    };

    function setPage(msg) {
      const room = client.room;
      if (!room.canSteer(client.peer)) return fail(ERR.CONTROL_DENIED, 'No tienes permiso para cambiar de página');
      if (!Number.isInteger(msg.n) || msg.n < 0 || msg.n > MAX_PAGE) return fail(ERR.BAD_REQUEST, 'Página inválida');
      if (room.page === msg.n) return;
      room.page = msg.n;
      room.onChange(room);
      room.broadcast({ t: MSG.PAGE, n: room.page, from: client.id });
    }

    function setView(msg) {
      if (!client.peer.host) return;
      const view = validateView(msg);
      if (!view) return;
      client.room.view = view;
      client.room.broadcast({ t: MSG.VIEW, ...view }, client.id, { volatile: true });
    }

    function setTimer(msg) {
      if (!requireHost('usar el temporizador')) return;
      const now = Date.now();
      let timer = null;
      if (msg.endsAt !== null) {
        if (!Number.isFinite(msg.endsAt) || msg.endsAt <= now || msg.endsAt > now + MAX_TIMER_MS) {
          return fail(ERR.BAD_REQUEST, 'Temporizador inválido');
        }
        timer = { endsAt: Math.round(msg.endsAt) };
      }
      client.room.timer = timer;
      client.room.broadcast({ t: MSG.TIMER, timer });
    }

    const broadcastPoll = () => client.room.broadcast({ t: MSG.POLL, poll: client.room.publicPoll() });

    function openPoll(msg) {
      if (!requireHost('abrir votaciones')) return;
      const poll = validatePoll(msg);
      if (!poll) return fail(ERR.BAD_REQUEST, 'La votación necesita al menos 2 opciones');
      client.room.poll = { id: randomId(8), ...poll, votes: new Map(), open: true };
      broadcastPoll();
    }

    function vote(msg) {
      const poll = client.room.poll;
      if (!poll || !poll.open) return fail(ERR.BAD_REQUEST, 'No hay una votación abierta');
      if (!Number.isInteger(msg.option) || msg.option < 0 || msg.option >= poll.options.length) {
        return fail(ERR.BAD_REQUEST, 'Opción inválida');
      }
      poll.votes.set(client.id, msg.option); // un voto por persona (se puede cambiar)
      broadcastPoll();
    }

    function closePoll(msg) {
      if (!requireHost('cerrar votaciones') || !client.room.poll) return;
      if (msg.clear === true) client.room.poll = null;
      else client.room.poll.open = false;
      broadcastPoll();
    }

    /** Reenvía señalización WebRTC (ofertas, respuestas, candidatos) a un participante concreto. */
    function relayRtc(msg) {
      const target = client.room.peers.get(msg.to);
      if (!target || target.id === client.id) return;
      const data = JSON.stringify(msg.data ?? null);
      if (data.length > MAX_RTC_CHARS) return fail(ERR.BAD_REQUEST, 'Señal WebRTC demasiado grande');
      target.send(`{"t":"${MSG.RTC}","from":"${client.id}","data":${data}}`);
    }

    ws.on('close', () => {
      const { room, peer } = client;
      if (!room) return;
      stopScreen();
      if (room.controller?.id === client.id) {
        room.controller = null;
        // Sin presentador, los permisos dados dejan de valer.
        const affected = room.grantAll ? [...room.peers.keys()] : [...room.grants];
        for (const id of affected) room.peers.get(id)?.send(JSON.stringify({ t: MSG.CONTROL_GRANTED, granted: false, all: false }));
        room.grants.clear();
        room.grantAll = false;
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
