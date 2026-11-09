import { sanitizeElement, shouldReplace, LIMITS } from '../../shared/elements.js';

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
    this.elements = new Map();
    for (const raw of data.elements ?? []) {
      const el = sanitizeElement(raw);
      if (el) this.elements.set(el.id, el);
    }
    this.peers = new Map(); // id -> { id, name, color, send }
    this.screen = null; // { from, w, h, data } — pantalla compartida en vivo (no se guarda en disco)
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

  addPeer({ id, name, send }) {
    const color = PEER_COLORS[this._colorIndex++ % PEER_COLORS.length];
    const peer = { id, name, color, send };
    this.peers.set(id, peer);
    return peer;
  }

  removePeer(id) {
    return this.peers.delete(id);
  }

  publicPeers() {
    return [...this.peers.values()].map(({ id, name, color }) => ({ id, name, color }));
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
    return { id: this.id, createdAt: this.createdAt, pin: this.pin, elements: this.snapshot() };
  }
}
