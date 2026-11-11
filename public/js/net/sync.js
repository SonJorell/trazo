import { MSG } from '/shared/protocol.js';
import { shouldReplace } from '/shared/elements.js';

const FLUSH_MS = 20;
const CURSOR_MS = 33;
const STROKE_MS = 16;
const PING_MS = 4000;
/** Campos de estilo que viajan con el primer trozo de un trazo en vivo. */
const STROKE_STYLE = ['x', 'y', 'stroke', 'strokeWidth', 'brush', 'dash', 'opacity', 'page', 'z', 'author', 'anchor', 'anchorPage'];
const CHUNK = 400;

/**
 * Puente entre la escena y la red:
 * - Envía los cambios locales agrupados cada 40 ms (los demás ven el trazo mientras se dibuja).
 * - Aplica los cambios remotos.
 * - Al (re)conectar fusiona el estado del servidor y reenvía lo hecho sin conexión.
 */
export class Sync {
  constructor({ scene, connection, presence, onScreen = () => {}, onLaser = () => {}, live = null, onLatency = () => {} }) {
    this.live = live; // LiveStrokes: trazos ajenos a medio dibujar
    this.onLatency = onLatency;
    this._strokes = new Map(); // id → puntos ya enviados del trazo propio en curso
    this._strokeTimer = null;
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

    scene.on('local', (el) => {
      this._strokes.delete(el.id);
      this._queue(el);
    });
    scene.on('local-transient', (el) => this._queueStroke(el));
    connection.on('message', (msg) => this._onMessage(msg));

    // Latencia: ida y vuelta de un ping cada pocos segundos.
    this._pingTimer = setInterval(() => this.ping(), PING_MS);
    connection.on('status', (s) => s === 'online' ? this.ping() : this.onLatency(null));
  }

  ping() {
    if (this.conn.online) this.conn.send({ t: MSG.PING, ts: Math.round(performance.now()) });
  }

  /** Trazo propio a medio dibujar: se envían solo los puntos nuevos, ~60 veces por segundo. */
  _queueStroke(el) {
    if (el.type !== 'pen') return;
    if (!this._strokes.has(el.id)) this._strokes.set(el.id, { sent: 0, el });
    else this._strokes.get(el.id).el = el;
    if (!this._strokeTimer) this._strokeTimer = setTimeout(() => this._flushStrokes(), STROKE_MS);
  }

  _flushStrokes() {
    this._strokeTimer = null;
    if (!this.conn.online) return;
    for (const [id, st] of this._strokes) {
      const pts = st.el.points;
      if (pts.length <= st.sent) continue;
      const msg = { t: MSG.STROKE, id, from: st.sent, pts: pts.slice(st.sent, st.sent + 200) };
      if (st.sent === 0) msg.s = Object.fromEntries(STROKE_STYLE.filter((k) => st.el[k] !== undefined).map((k) => [k, st.el[k]]));
      this.conn.send(msg);
      st.sent += msg.pts.length;
    }
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
        if (this.live) for (const op of msg.ops) this.live.forget(op.id);
        break;
      case MSG.STROKE:
        if (this.live?.apply(msg, this.scene)) this.scene.emit('live');
        break;
      case MSG.PONG:
        if (Number.isFinite(msg.ts) && msg.ts > 0) this.onLatency(Math.max(0, Math.round(performance.now() - msg.ts)));
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
