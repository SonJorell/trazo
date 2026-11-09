const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/**
 * Cámara del lienzo. pantalla = (mundo - origen) * zoom.
 */
export class Viewport {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  toWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  toScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  /** Desplaza el contenido `dx, dy` píxeles de pantalla. */
  pan(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Aplica zoom manteniendo fijo el punto de pantalla (sx, sy). */
  zoomAt(sx, sy, factor) {
    const anchor = this.toWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.x = anchor.x - sx / this.zoom;
    this.y = anchor.y - sy / this.zoom;
  }

  /** Rectángulo del mundo visible para un lienzo de `w × h` píxeles CSS. */
  visibleRect(w, h) {
    return { x: this.x, y: this.y, w: w / this.zoom, h: h / this.zoom };
  }

  /** Centra la vista en un rectángulo del mundo, ajustando el zoom para que quepa. */
  fit(rect, w, h, padding = 40, maxZoom = 1) {
    if (!rect) return;
    const rw = Math.max(rect.w, 1);
    const rh = Math.max(rect.h, 1);
    const z = Math.min((w - padding * 2) / rw, (h - padding * 2) / rh, maxZoom);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    this.x = rect.x + rect.w / 2 - w / 2 / this.zoom;
    this.y = rect.y + rect.h / 2 - h / 2 / this.zoom;
  }
}
