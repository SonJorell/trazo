/** Emisor de eventos mínimo. `on` devuelve una función para desuscribirse. */
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn);
  }

  emit(type, ...args) {
    for (const fn of this._handlers.get(type) ?? []) fn(...args);
  }
}
