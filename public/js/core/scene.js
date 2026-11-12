import { shouldReplace } from '/shared/elements.js';
import { hitTest, getBounds } from '/shared/geometry.js';
import { Emitter } from '../util/emitter.js';

/**
 * Colección de elementos de la pizarra.
 * Eventos: `change` (algo cambió) y `local` (cambio hecho por este usuario, para sincronizar).
 */
export class Scene extends Emitter {
  constructor() {
    super();
    this.map = new Map();
    this._alive = null;
    this.page = 0; // página/diapositiva visible
  }

  /** Cambia la página visible: solo se muestran (y se tocan) los elementos de esa página. */
  setPage(n) {
    if (n === this.page) return;
    this.page = n;
    this._alive = null;
    this.emit('change');
    this.emit('page', n);
  }

  /** Todos los elementos visibles de todas las páginas (para exportar). */
  allAlive() {
    return [...this.map.values()]
      .filter((el) => !el.isDeleted)
      .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
  }

  /** Cantidad de páginas usadas (al menos hasta la actual). */
  pageCount() {
    let max = this.page;
    for (const el of this.map.values()) if (!el.isDeleted && (el.page ?? 0) > max) max = el.page;
    return max + 1;
  }

  get(id) {
    return this.map.get(id) ?? null;
  }

  all() {
    return [...this.map.values()];
  }

  /** Elementos visibles ordenados de atrás hacia adelante. */
  alive() {
    if (!this._alive) {
      this._alive = [...this.map.values()]
        .filter((el) => !el.isDeleted && (el.page ?? 0) === this.page && this.anchorVisible(el))
        .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
    }
    return this._alive;
  }

  /**
   * Una anotación anclada a un documento solo se ve cuando ese documento muestra su página.
   * Si el documento se borró, la anotación queda visible (no se pierde nada).
   */
  anchorVisible(el) {
    if (!el.anchor) return true;
    const doc = this.map.get(el.anchor);
    if (!doc || doc.isDeleted) return true;
    return (doc.docPage ?? 0) === el.anchorPage;
  }

  /** Anotaciones (de cualquier página) ancladas a un documento. */
  anchoredTo(docId) {
    return [...this.map.values()].filter((el) => !el.isDeleted && el.anchor === docId);
  }

  /** Aplica cambios llegados de la red con la regla LWW. */
  applyRemote(list) {
    let changed = false;
    for (const el of list) {
      if (shouldReplace(this.map.get(el.id), el)) {
        this.map.set(el.id, el);
        changed = true;
      }
    }
    if (changed) {
      this._alive = null;
      this.emit('change');
    }
    return changed;
  }

  /**
   * Aplica un cambio propio (ya con la versión incrementada) y lo anuncia para sincronizar.
   * `transient`: cambio intermedio (un trazo a medio dibujar) que se transmite en vivo
   * por trozos y no como operación completa.
   */
  applyLocal(el, { transient = false } = {}) {
    this.map.set(el.id, el);
    this._alive = null;
    this.emit('change');
    this.emit(transient ? 'local-transient' : 'local', el);
  }

  /** Elemento visible más al frente bajo el punto (los bloqueados se ignoran salvo que se pidan). */
  hitTop(x, y, tol, { locked = false } = {}) {
    const list = this.alive();
    for (let i = list.length - 1; i >= 0; i--) {
      if (!locked && list[i].locked) continue;
      if (hitTest(list[i], x, y, tol)) return list[i];
    }
    return null;
  }

  /** Caja que abarca todos los elementos visibles. */
  bounds() {
    const list = this.alive();
    if (!list.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of list) {
      const b = getBounds(el);
      const pad = el.strokeWidth || 0;
      minX = Math.min(minX, b.x - pad);
      minY = Math.min(minY, b.y - pad);
      maxX = Math.max(maxX, b.x + b.w + pad);
      maxY = Math.max(maxY, b.y + b.h + pad);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
}
