/** Almacén en memoria con la misma interfaz que FileStore (para pruebas). */
export class MemoryStore {
  constructor() {
    this.data = new Map();
  }

  async init() {}

  async exists(id) {
    return this.data.has(id);
  }

  async load(id) {
    const raw = this.data.get(id);
    return raw ? JSON.parse(raw) : null;
  }

  async list() {
    return [...this.data.keys()];
  }

  async delete(id) {
    this.data.delete(id);
  }

  async save(id, data) {
    this.data.set(id, JSON.stringify(data));
  }
}
