import crypto from 'node:crypto';
import { sanitizeElement, shouldReplace, LIMITS, bump, randomId, randomNonce, MAX_PAGE } from '../../shared/elements.js';
import { ROLES, CLIENT_ID_RE } from '../../shared/protocol.js';

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
    this.notes = plainMap(data.notes); // notas privadas del presentador por página
    // Roles: rol con que entra la gente nueva y el de cada persona (por su id de navegador).
    this.defaultRole = ROLES.includes(data.defaultRole) ? data.defaultRole : 'editor';
    this.roles = {};
    for (const [k, v] of Object.entries(data.roles ?? {})) if (CLIENT_ID_RE.test(k) && ROLES.includes(v)) this.roles[k] = v;
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

  addPeer({ id, name, send, display = false, host = false, clientId = null }) {
    const color = PEER_COLORS[this._colorIndex++ % PEER_COLORS.length];
    const cid = typeof clientId === 'string' && CLIENT_ID_RE.test(clientId) ? clientId : null;
    const role = host ? 'host' : (cid && this.roles[cid]) || this.defaultRole;
    const peer = { id, name, color, send, display, host, clientId: cid, role, avatar: null, avatarPos: null, watch: false };
    this.peers.set(id, peer);
    if (role === 'presentador') this.grants.add(id);
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
    return [...this.peers.values()].map((p) => this.publicPeer(p));
  }

  publicPeer({ id, name, color, display, host, role, avatar, avatarPos, watch }) {
    return { id, name, color, display, host, role, avatar, avatarPos, watch };
  }

  /** Cambia el rol de un participante (y lo recuerda para cuando vuelva a entrar). */
  setRole(peer, role) {
    if (!peer || peer.host || !ROLES.includes(role)) return false;
    peer.role = role;
    if (peer.clientId) this.roles[peer.clientId] = role;
    if (role === 'presentador') this.grants.add(peer.id);
    else this.grants.delete(peer.id);
    if (role === 'visita') {
      peer.avatar = null; // las visitas no muestran cámara ni monigote
      peer.avatarPos = null;
    }
    this.onChange(this);
    return true;
  }

  /** ¿Puede dibujar, escribir, adjuntar, usar láser y cámara? (todos menos las visitas) */
  canEdit(peer) {
    return Boolean(peer && (peer.host || peer.role !== 'visita'));
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

  /** Cantidad de páginas: la última con contenido, la visible o la última con título/fondo/notas. */
  pageCount() {
    let count = this.page + 1;
    for (const el of this.elements.values()) if (!el.isDeleted) count = Math.max(count, (el.page ?? 0) + 1);
    for (const map of [this.pageTitles, this.pageBackgrounds, this.notes]) for (const k of Object.keys(map)) count = Math.max(count, Number(k) + 1);
    return count;
  }

  /**
   * Mueve, duplica o borra una página completa (elementos, título, fondo y notas) de una vez.
   * @returns {{ changed: object[], page: number } | null}
   */
  pageOp({ op, n, to }) {
    const count = this.pageCount();
    if (n >= count) return null;
    if (op === 'duplicate' && count > MAX_PAGE) return null;
    // Nueva posición de cada página antigua (-1 = borrada).
    const newIndex = [];
    if (op === 'move') {
      const order = [...Array(count).keys()];
      order.splice(n, 1);
      order.splice(Math.min(to, count - 1), 0, n);
      order.forEach((old, pos) => (newIndex[old] = pos));
    } else if (op === 'delete') {
      for (let i = 0; i < count; i++) newIndex[i] = i < n ? i : i === n ? -1 : i - 1;
    } else {
      for (let i = 0; i < count; i++) newIndex[i] = i <= n ? i : i + 1;
    }
    const changed = [];
    const copies = new Map(); // id original → id de la copia (para re-anclar anotaciones)
    for (const el of [...this.elements.values()]) {
      if (el.isDeleted) continue;
      const old = el.page ?? 0;
      const ni = newIndex[old] ?? old;
      if (ni === -1) changed.push(bump(el, { isDeleted: true }));
      else if (ni !== old) changed.push(bump(el, { page: ni }));
      if (op === 'duplicate' && old === n) copies.set(el.id, randomId());
    }
    if (op === 'duplicate') {
      for (const [id, copyId] of copies) {
        const el = this.elements.get(id);
        const copy = { ...el, id: copyId, version: 1, nonce: randomNonce(), page: n + 1 };
        if (el.anchor && copies.has(el.anchor)) copy.anchor = copies.get(el.anchor);
        changed.push(copy);
      }
    }
    if (this.elements.size + (op === 'duplicate' ? copies.size : 0) > LIMITS.maxElementsPerRoom) return null;
    for (const el of changed) this.elements.set(el.id, el);
    // Títulos, fondos y notas siguen a su página.
    const remap = (map, dupSuffix = '') => {
      const out = {};
      for (const [k, v] of Object.entries(map)) {
        const ni = newIndex[Number(k)] ?? Number(k);
        if (ni !== -1) out[String(ni)] = v;
        if (op === 'duplicate' && Number(k) === n) out[String(n + 1)] = typeof v === 'string' && dupSuffix ? `${v}${dupSuffix}`.slice(0, 60) : v;
      }
      return out;
    };
    this.pageTitles = remap(this.pageTitles, ' (copia)');
    this.pageBackgrounds = remap(this.pageBackgrounds);
    this.notes = remap(this.notes);
    const np = newIndex[this.page];
    this.page = op === 'duplicate' && this.page === n ? n + 1 : np === -1 ? Math.max(0, n - 1) : np ?? this.page;
    this.onChange(this);
    return { changed, page: this.page };
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
    if (peer?.role === 'visita') return false;
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
      notes: this.notes,
      defaultRole: this.defaultRole,
      roles: this.roles,
      hostKey: this.hostKeyHash,
      pin: this.pin,
      elements: this.snapshot(),
    };
  }
}
