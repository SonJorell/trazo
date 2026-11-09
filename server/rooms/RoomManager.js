import crypto from 'node:crypto';
import { Room } from './Room.js';
import { hashPin, verifyPin } from './pin.js';
import { ROOM_ALPHABET, ROOM_ID_RE, PIN_RE } from '../../shared/protocol.js';

/**
 * Crea, carga y guarda salas. Depende solo de la interfaz del almacén:
 *   store.exists(id) → Promise<boolean>
 *   store.load(id)   → Promise<object|null>
 *   store.save(id, data) → Promise<void>
 */
export class RoomManager {
  constructor({ store, saveDelayMs = 1000, logger }) {
    this.store = store;
    this.saveDelayMs = saveDelayMs;
    this.logger = logger;
    this.rooms = new Map(); // salas cargadas en memoria
    this._timers = new Map();
    this._loading = new Map();
  }

  static isValidId(id) {
    return typeof id === 'string' && ROOM_ID_RE.test(id);
  }

  _newId() {
    const bytes = crypto.randomBytes(6);
    let id = '';
    for (const b of bytes) id += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
    return id;
  }

  /** Crea una sala nueva, opcionalmente protegida con PIN. */
  async create({ pin } = {}) {
    if (pin !== undefined && pin !== null && pin !== '' && !PIN_RE.test(String(pin))) {
      throw Object.assign(new Error('El PIN debe tener entre 4 y 8 dígitos'), { status: 400 });
    }
    let id;
    do id = this._newId();
    while (this.rooms.has(id) || (await this.store.exists(id)));

    const room = this._wrap({ id, createdAt: Date.now(), pin: pin ? hashPin(String(pin)) : null });
    this.rooms.set(id, room);
    await this.store.save(id, room.toJSON());
    this.logger?.info(`Sala creada: ${id}${room.hasPin ? ' (con PIN)' : ''}`);
    return room;
  }

  /** Obtiene una sala (de memoria o disco). Devuelve null si no existe. */
  async get(id) {
    if (!RoomManager.isValidId(id)) return null;
    if (this.rooms.has(id)) return this.rooms.get(id);
    if (this._loading.has(id)) return this._loading.get(id);

    const promise = (async () => {
      const data = await this.store.load(id);
      if (!data) return null;
      const room = this._wrap(data);
      this.rooms.set(id, room);
      return room;
    })().finally(() => this._loading.delete(id));
    this._loading.set(id, promise);
    return promise;
  }

  checkPin(room, pin) {
    return verifyPin(pin, room.pin);
  }

  _wrap(data) {
    return new Room(data, { onChange: (room) => this.scheduleSave(room) });
  }

  /** Guardado diferido: agrupa ráfagas de cambios en una sola escritura. */
  scheduleSave(room) {
    if (this._timers.has(room.id)) return;
    const timer = setTimeout(() => {
      this._timers.delete(room.id);
      this.store.save(room.id, room.toJSON()).catch((err) => {
        this.logger?.error(`No se pudo guardar la sala ${room.id}:`, err.message);
      });
    }, this.saveDelayMs);
    timer.unref?.();
    this._timers.set(room.id, timer);
  }

  /** Libera de memoria una sala sin participantes (sigue en disco). */
  async releaseIfEmpty(room) {
    if (room.peers.size > 0) return;
    await this.flush(room.id);
    if (room.peers.size === 0) this.rooms.delete(room.id);
  }

  /** Fuerza el guardado pendiente de una sala o de todas. */
  async flush(id = null) {
    const ids = id ? [id] : [...this._timers.keys()];
    await Promise.all(
      ids.map(async (rid) => {
        const timer = this._timers.get(rid);
        if (!timer) return;
        clearTimeout(timer);
        this._timers.delete(rid);
        const room = this.rooms.get(rid);
        if (room) await this.store.save(rid, room.toJSON());
      }),
    );
  }
}
