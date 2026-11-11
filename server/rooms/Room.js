import crypto from 'node:crypto';
import { sanitizeElement, shouldReplace, LIMITS } from '../../shared/elements.js';

/** Copia un objeto «página → valor» descartando claves que no sean números de página. */
function plainMap(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (/^\d{1,3}$/.test(k) && v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

const PEER_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599', '#e8590c', '#5c940d'];

/**
 * Estado de una sala: elementos y participantes conectados.
 * No sabe nada de WebSocket ni de disco: recibe callbacks.
 */
export class Room {
  /**
   * @param {object} data   { id, createdAt, pin?, elements? }
   * @param {object} hooks  { onChange(room) } — se llama tras cada cambio aceptado.
   */
  constructor(data, hooks = {}) {
    this.id = data.id;
    this.createdAt = data.createdAt ?? Date.now();
    this.pin = data.pin ?? null; // { salt, hash } o null
    this.mode = data.mode === 'live' ? 'live' : 'blank';
    this.hostKeyHash = typeof data.hostKey === 'string' ? data.hostKey : null; // sha256 de la clave de anfitrión
    this.lastActiveAt = data.lastActiveAt ?? this.createdAt; // última entrada o salida de alguien
    this.elements = new Map();
    for (const raw of data.elements ?? []) {
      const el = sanitizeElement(raw);
      if (el) this.elements.set(el.id, el);
    }
    this.peers = new Map(); // id -> { id, name, color, send }
    this.screen = null; // { from, w, h, data } — pantalla compartida en vivo (no se guarda en disco)
    this.controller = null; // { id, key } — PC que acepta control remoto (la clave solo vive en memoria)
    this.grants = new Set(); // participantes a los que el anfitrión dejó pasar diapositivas
    this.grantAll = false; // el anfitrión permitió a todos pasar diapositivas
    this.page = Number.isInteger(data.page) ? data.page : 0; // página/diapositiva visible
    this.background = data.background ?? { pattern: 'dots', color: 'white' }; // fondo de hoja (todas las páginas)
    this.pageBackgrounds = plainMap(data.pageBackgrounds); // fondo propio de algunas páginas { "2": {...} }
    this.pageTitles = plainMap(data.pageTitles); // títulos de página { "0": "Introducción" }
    this.view = null; // zona que muestra el anfitrión { x, y, w, h }
    this.timer = null; // { endsAt }
    this.poll = null; // { id, question, options, votes: Map(peerId → índice), open }
    this.onChange = hooks.onChange ?? (() => {});
    this._colorIndex = 0;
  }

  get hasPin() {
    return this.pin !== null;
  }

  /** Lista de elementos (incluye borrados: los clientes los necesitan para converger). */
  snapshot() {
    return [...this.elements.values()];
  }

  /** ¿Esta clave es la del anfitrión? (comparación en tiempo constante) */
  isHostKey(key) {
    if (!this.hostKeyHash || typeof key !== 'string' || !key) return false;
    const given = Buffer.from(crypto.createHash('sha256').update(key).digest('hex'));
    const expected = Buffer.from(this.hostKeyHash);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  addPeer({ id, name, send, display = false, host = false }) {
    const color = PEER_COLORS[this._colorIndex++ % PEER_COLORS.length];
    const peer = { id, name, color, send, display, host };
    this.peers.set(id, peer);
    this.lastActiveAt = Date.now();
    return peer;
  }

  removePeer(id) {
    const removed = this.peers.delete(id);
    this.grants.delete(id);
    this.poll?.votes.delete(id);
    if (removed) this.lastActiveAt = Date.now();
    return removed;
  }

  /**
   * ¿Lleva vacía más de `ttlMs`? `notBefore` da un plazo de gracia (p. ej. desde que arrancó
   * el servidor, para que la gente alcance a reconectarse antes de cerrar su sala).
   */
  isExpired(now, ttlMs, notBefore = 0) {
    return this.peers.size === 0 && now - Math.max(this.lastActiveAt, notBefore) >= ttlMs;
  }

  publicPeers() {
    return [...this.peers.values()].map(({ id, name, color, display, host }) => ({ id, name, color, display, host }));
  }

  /**
   * Aplica una lista de elementos entrantes con la regla LWW.
   * @returns {{ accepted: object[], rejected: number, full: boolean }}
   */
  applyOps(rawOps) {
    const accepted = [];
    let rejected = 0;
    let full = false;
    for (const raw of rawOps) {
      const el = sanitizeElement(raw);
      if (!el) {
        rejected++;
        continue;
      }
      const current = this.elements.get(el.id);
      if (!current && this.elements.size >= LIMITS.maxElementsPerRoom) {
        full = true;
        rejected++;
        continue;
      }
      if (shouldReplace(current, el)) {
        this.elements.set(el.id, el);
        accepted.push(el);
      }
    }
    if (accepted.length) this.onChange(this);
    return { accepted, rejected, full };
  }

  /**
   * Envía un mensaje a todos los participantes salvo `exceptId`.
   * `volatile`: el mensaje se puede descartar si la conexión de un participante va atrasada
   * (cuadros de pantalla: importa el más reciente, no todos).
   */
  broadcast(message, exceptId = null, { volatile = false } = {}) {
    const payload = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.id !== exceptId) peer.send(payload, { volatile });
    }
  }

  /** ¿Puede este participante pasar diapositivas / cambiar de página? */
  canSteer(peer) {
    return Boolean(peer?.host || this.grantAll || this.grants.has(peer?.id));
  }

  /** Estado público de la votación (sin saber quién votó qué). */
  publicPoll() {
    if (!this.poll) return null;
    const counts = this.poll.options.map(() => 0);
    for (const i of this.poll.votes.values()) counts[i]++;
    const { id, question, options, open } = this.poll;
    return { id, question, options, open, counts, total: this.poll.votes.size };
  }

  /** Guarda el último cuadro de la pantalla compartida por `from`. */
  setScreen(from, frame) {
    this.screen = { from, ...frame };
  }

  /** Detiene la transmisión si la hacía `from`. Devuelve true si había una activa. */
  clearScreen(from) {
    if (!this.screen || this.screen.from !== from) return false;
    this.screen = null;
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      mode: this.mode,
      page: this.page,
      background: this.background,
      pageBackgrounds: this.pageBackgrounds,
      pageTitles: this.pageTitles,
      hostKey: this.hostKeyHash,
      pin: this.pin,
      elements: this.snapshot(),
    };
  }
}
