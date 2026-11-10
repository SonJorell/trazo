import { normalizeRect } from '/shared/geometry.js';

/** Tipos que se pueden redimensionar con el tirador. */
export const RESIZABLE = new Set(['rect', 'ellipse', 'note']);

/** Posición del tirador de redimensión (esquina inferior derecha) en el mundo. */
export function resizeHandle(el, zoom) {
  const r = normalizeRect(el.x, el.y, el.w, el.h);
  const pad = 6 / zoom;
  const size = 12 / zoom;
  return { x: r.x + r.w + pad, y: r.y + r.h + pad, size };
}

export function hitHandle(el, zoom, px, py) {
  const h = resizeHandle(el, zoom);
  const reach = h.size; // área táctil generosa
  return Math.abs(px - h.x) <= reach && Math.abs(py - h.y) <= reach;
}
