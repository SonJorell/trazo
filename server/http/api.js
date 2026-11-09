import QRCode from 'qrcode';
import { getLanAddresses } from '../util/network.js';

const MAX_BODY = 4 * 1024;

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Rutas de la API:
 *   GET  /api/info           → URLs de la red local y puerto.
 *   POST /api/rooms          → crea sala { pin?, mode? } → { id, hasPin, mode }
 *   GET  /api/rooms/:id      → { id, hasPin, mode, live } o 404 (no existe o se cerró)
 *   GET  /api/qr.svg?text=   → código QR en SVG (solo para URLs de este servidor)
 */
export function createApiHandler({ rooms, config }) {
  const lanUrls = () => getLanAddresses().map((ip) => `http://${ip}:${config.port}`);

  return async function handleApi(req, res, url) {
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) return false;

    try {
      if (req.method === 'GET' && pathname === '/api/info') {
        sendJson(res, 200, {
          port: config.port,
          lanUrls: lanUrls(),
          emptyRoomTtlMin: Math.round(config.emptyRoomTtlMs / 60_000),
        });
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/rooms') {
        const body = await readJson(req);
        const room = await rooms.create({ pin: body.pin, mode: body.mode ?? 'blank' });
        sendJson(res, 201, { id: room.id, hasPin: room.hasPin, mode: room.mode });
        return true;
      }

      const match = pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (req.method === 'GET' && match) {
        const room = await rooms.get(match[1]);
        if (!room) sendJson(res, 404, { error: 'La sala no existe o se cerró por quedar vacía' });
        else sendJson(res, 200, { id: room.id, hasPin: room.hasPin, mode: room.mode, live: Boolean(room.screen) });
        return true;
      }

      if (req.method === 'GET' && pathname === '/api/qr.svg') {
        const text = url.searchParams.get('text') ?? '';
        const host = req.headers.host ?? '';
        const allowed = [...lanUrls(), `http://${host}`, `http://localhost:${config.port}`];
        if (!allowed.some((u) => text.startsWith(`${u}/`) || text === u) || text.length > 300) {
          sendJson(res, 400, { error: 'Solo se generan QR de enlaces de este servidor' });
          return true;
        }
        const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 240 });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
        res.end(svg);
        return true;
      }

      sendJson(res, 404, { error: 'Ruta no encontrada' });
      return true;
    } catch (err) {
      sendJson(res, err.status ?? 500, { error: err.status ? err.message : 'Error interno' });
      if (!err.status) throw err;
      return true;
    }
  };
}
