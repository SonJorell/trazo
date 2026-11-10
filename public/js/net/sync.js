import { MSG } from '/shared/protocol.js';
import { shouldReplace } from '/shared/elements.js';

const FLUSH_MS = 40;
const CURSOR_MS = 50;
const CHUNK = 400;

/**
 * Puente entre la escena y la red:
 * - Envía los cambios locales agrupados cada 40 ms (los demás ven el trazo mientras se dibuja).
 * - Aplica los cambios remotos.
 * - Al (re)conectar fusiona el estado del servidor y reenvía lo hecho sin conexión.
 */
export class Sync {
  constructor({ scene, connection, presence, onScreen = () => {}, onLaser = () => {} }) {
    this.scene = scene;
    this.onLaser = onLaser;
    this._laserBuf = [];
    this._laserTimer = null;
    this.onScreen = onScreen; // (frame | null) => void
    this.conn = connection;
    this.presence = presence;
    this.pending = new Map();
    this._timer = null;
    this._lastCursor = 0;
    this._cursorTimer = null;

    scene.on('local', (el) => this._queue(el));
    connection.on('message', (msg) => this._onMessage(msg));
  }

  _queue(el) {
    this.pending.set(el.id, el);
    if (!this._timer) this._timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  flush() {
    this._timer = null;
    if (!this.pending.size || !this.conn.online) return;
    const ops = [...this.pending.values()];
    this.pending.clear();
    for (let i = 0; i < ops.length; i += CHUNK) {
      this.conn.send({ t: MSG.OPS, ops: ops.slice(i, i + CHUNK) });
    }
  }

  sendCursor(p) {
    const now = Date.now();
    const send = () => {
      this._lastCursor = Date.now();
      this.conn.send({ t: MSG.CURSOR, x: Math.round(p.x), y: Math.round(p.y) });
    };
    clearTimeout(this._cursorTimer);
    if (now - this._lastCursor >= CURSOR_MS) send();
    else this._cursorTimer = setTimeout(send, CURSOR_MS);
  }

  /** Envía la estela del láser en trozos (cada 40 ms, o enseguida al soltar). */
  sendLaser(p, end, color) {
    this._laserBuf.push([p.x, p.y]);
    const flush = () => {
      clearTimeout(this._laserTimer);
      this._laserTimer = null;
      if (!this._laserBuf.length) return;
      this.conn.send({ t: MSG.LASER, pts: this._laserBuf.splice(0, 64), c: color, end });
    };
    if (end) flush();
    else if (!this._laserTimer) this._laserTimer = setTimeout(flush, 40);
  }

  _onMessage(msg) {
    switch (msg.t) {
      case MSG.WELCOME: {
        const server = new Map(msg.elements.map((el) => [el.id, el]));
        this.scene.applyRemote(msg.elements);
        // Reenviar lo que tengamos más nuevo que el servidor (dibujado sin conexión).
        for (const el of this.scene.all()) {
          const srv = server.get(el.id);
          if (!srv || shouldReplace(srv, el)) this.pending.set(el.id, el);
        }
        this.flush();
        this.presence.reset(msg.you, msg.peers);
        this.onScreen(msg.screen && msg.screen.from !== msg.you.id ? msg.screen : null);
        break;
      }
      case MSG.SCREEN:
        this.onScreen(msg);
        break;
      case MSG.SCREEN_STOP:
        this.onScreen(null);
        break;
      case MSG.OPS:
        this.scene.applyRemote(msg.ops);
        break;
      case MSG.PEER_JOIN:
        this.presence.add(msg.peer);
        break;
      case MSG.PEER_LEAVE:
        this.presence.remove(msg.id);
        break;
      case MSG.LASER:
        this.onLaser(msg);
        break;
      case MSG.CURSOR:
        this.presence.moveCursor(msg.id, msg.x, msg.y);
        break;
    }
  }
}
