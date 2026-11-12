import crypto from 'node:crypto';
import { Room } from './Room.js';
import { hashPin, verifyPin } from './pin.js';
import { ROOM_ALPHABET, ROOM_ID_RE, PIN_RE, ROOM_MODES } from '../../shared/protocol.js';

/**
 * Crea, carga y guarda salas. Depende solo de la interfaz del almacén:
 *   store.exists(id) → Promise<boolean>
 *   store.load(id)   → Promise<object|null>
 *   store.save(id, data) → Promise<void>
 *   store.delete(id) → Promise<void>
 *   store.list()     → Promise<string[]>
 *
 * Las salas sin participantes se cierran (y se borran) tras `emptyRoomTtlMs`.
 */
export class RoomManager {
  constructor({ store, saveDelayMs = 1000, emptyRoomTtlMs = 120_000, logger, assets = null }) {
    this.store = store;
    this.assets = assets; // archivos adjuntos: se borran al cerrar la sala
    this.saveDelayMs = saveDelayMs;
    this.emptyRoomTtlMs = emptyRoomTtlMs;
    this.startedAt = Date.now(); // gracia tras reiniciar: nadie ha podido reconectarse aún
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
  async create({ pin, mode = 'blank' } = {}) {
    if (pin !== undefined && pin !== null && pin !== '' && !PIN_RE.test(String(pin))) {
      throw Object.assign(new Error('El PIN debe tener entre 4 y 8 dígitos'), { status: 400 });
    }
    if (!ROOM_MODES.includes(mode)) {
      throw Object.assign(new Error('Modo de sala inválido'), { status: 400 });
    }
    let id;
    do id = this._newId();
    while (this.rooms.has(id) || (await this.store.exists(id)));

    // Clave de anfitrión: se entrega una sola vez a quien crea la sala; en disco solo queda su hash.
    const hostKey = crypto.randomBytes(18).toString('base64url');
    const room = this._wrap({
      id,
      createdAt: Date.now(),
      mode,
      pin: pin ? hashPin(String(pin)) : null,
      hostKey: crypto.createHash('sha256').update(hostKey).digest('hex'),
    });
    room.issuedHostKey = hostKey; // solo en memoria, para responder a quien la creó
    this.rooms.set(id, room);
    await this.store.save(id, room.toJSON());
    this.logger?.info(`Sala creada: ${id} (${mode === 'live' ? 'en directo' : 'en blanco'}${room.hasPin ? ', con PIN' : ''})`);
    return room;
  }

  /** Borra de inmediato una sala recién creada (p. ej. si falló abrir un archivo .trazo). */
  async discard(id) {
    clearTimeout(this._timers.get(id));
    this._timers.delete(id);
    this.rooms.delete(id);
    await this.store.delete(id).catch(() => {});
    await this.assets?.removeRoom(id).catch(() => {});
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

  /** Libera de memoria una sala sin participantes (sigue en disco hasta que caduque). */
  async releaseIfEmpty(room) {
    if (room.peers.size > 0) return;
    room.screen = null;
    this.scheduleSave(room); // guarda lastActiveAt
    await this.flush(room.id);
    if (room.peers.size === 0 && this.rooms.get(room.id) === room) this.rooms.delete(room.id);
  }

  /**
   * Cierra las salas que llevan vacías más del plazo: las quita de memoria y borra su archivo.
   * Revisa tanto las cargadas como las que solo están en disco (p. ej. tras reiniciar).
   * @returns {Promise<string[]>} códigos de las salas cerradas
   */
  async sweep(now = Date.now()) {
    const closed = [];
    const ids = new Set([...this.rooms.keys(), ...(await this.store.list())]);
    for (const id of ids) {
      if (this._loading.has(id)) continue;
      let room = this.rooms.get(id);
      if (!room) {
        const data = await this.store.load(id).catch(() => null);
        if (!data || this.rooms.has(id)) continue; // alguien la cargó mientras leíamos
        room = new Room(data);
      }
      if (!room.isExpired(now, this.emptyRoomTtlMs, this.startedAt)) continue;
      clearTimeout(this._timers.get(id));
      this._timers.delete(id);
      this.rooms.delete(id);
      await this.store.delete(id);
      await this.assets?.removeRoom(id).catch(() => {});
      closed.push(id);
    }
    // Archivos de salas que ya no existen (p. ej. borradas a mano).
    if (this.assets) {
      for (const id of await this.assets.rooms()) {
        if (!ids.has(id) && !this.rooms.has(id)) await this.assets.removeRoom(id).catch(() => {});
      }
    }
    if (closed.length) this.logger?.info(`Salas cerradas por estar vacías: ${closed.join(', ')}`);
    return closed;
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
