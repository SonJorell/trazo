import { sanitizeElement } from '/shared/elements.js';

const STALE_MS = 5000;

/**
 * Trazos que otros están dibujando en este momento. Llegan por trozos (solo los puntos
 * nuevos) y se dibujan al vuelo; cuando llega el trazo definitivo se descartan.
 */
export class LiveStrokes {
  constructor() {
    this.map = new Map(); // id → { el, at }
  }

  /** Aplica un trozo { id, from, pts, s? }. Devuelve true si hay algo nuevo que dibujar. */
  apply(msg, scene) {
    if (scene.get(msg.id)) return false; // ya llegó el trazo completo
    let entry = this.map.get(msg.id);
    if (!entry) {
      if (msg.from !== 0 || !msg.s) return false; // llegamos a mitad del trazo: esperar al final
      const el = sanitizeElement({ ...msg.s, id: msg.id, type: 'pen', version: 1, points: msg.pts });
      if (!el) return false;
      entry = { el, at: Date.now() };
      this.map.set(msg.id, entry);
      return true;
    }
    const pts = entry.el.points;
    if (msg.from > pts.length) return false; // se perdió un trozo: se verá al terminar
    entry.el = { ...entry.el, points: pts.slice(0, msg.from).concat(msg.pts) };
    entry.at = Date.now();
    return true;
  }

  /** Quita los que ya tienen versión definitiva en la escena o llevan rato sin moverse. */
  prune(scene) {
    const now = Date.now();
    for (const [id, { at }] of this.map) {
      if (scene.get(id) || now - at > STALE_MS) this.map.delete(id);
    }
  }

  forget(id) {
    this.map.delete(id);
  }

  *visible(page) {
    for (const { el } of this.map.values()) if ((el.page ?? 0) === page) yield el;
  }
}
