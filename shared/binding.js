import { getBounds } from './geometry.js';

/**
 * Flechas y líneas pegadas a formas. Un extremo puede guardar `startBind` / `endBind` con el id
 * de la forma; su posición se recalcula sobre el borde de la forma, apuntando hacia el otro
 * extremo (o hacia el centro de la otra forma si ambos están pegados).
 * Lo usan el cliente (al dibujar y al mover) y el servidor (para validar los datos).
 */
export const BINDABLE = new Set(['rect', 'ellipse', 'note', 'text', 'image', 'doc', 'stamp', 'chair', 'file']);
/** Separación entre la punta de la flecha y el borde de la forma. */
export const BIND_GAP = 6;

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Punto del borde de `target` en la dirección de `toward` (desde su centro), con un margen. */
export function boundPoint(target, toward, gap = BIND_GAP) {
  const b = getBounds(target);
  const c = center(b);
  let dx = toward.x - c.x;
  let dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: c.x, y: b.y - gap };
  dx /= len;
  dy /= len;
  const rx = b.w / 2;
  const ry = b.h / 2;
  let t;
  if (target.type === 'ellipse') {
    // Intersección del rayo con la elipse: (t·dx/rx)² + (t·dy/ry)² = 1
    t = 1 / Math.sqrt((dx * dx) / (rx * rx || 1) + (dy * dy) / (ry * ry || 1));
  } else {
    const tx = Math.abs(dx) > 1e-9 ? rx / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 1e-9 ? ry / Math.abs(dy) : Infinity;
    t = Math.min(tx, ty);
  }
  // Si el otro extremo queda dentro de la forma, la punta se queda en el borde igual.
  t += gap;
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Extremos absolutos de una línea/flecha. */
export function endpoints(el) {
  const pts = el.points ?? [];
  const first = pts[0] ?? [0, 0];
  const last = pts[pts.length - 1] ?? first;
  return { start: { x: el.x + first[0], y: el.y + first[1] }, end: { x: el.x + last[0], y: el.y + last[1] } };
}

/** ¿Este elemento puede ser destino de un enlace? (vivo, en la misma página que la flecha) */
export function canBind(target, arrow) {
  return Boolean(target && !target.isDeleted && BINDABLE.has(target.type) && (target.page ?? 0) === (arrow.page ?? 0) && target.id !== arrow.id);
}

/**
 * Nueva geometría de una flecha según sus enlaces, o null si no hay nada que cambiar.
 * @param {object} arrow  elemento line/arrow
 * @param {(id: string) => object|undefined} getEl
 * @returns {{ x, y, points }|null}
 */
export function routeArrow(arrow, getEl) {
  if (arrow.type !== 'line' && arrow.type !== 'arrow') return null;
  const a = arrow.startBind ? getEl(arrow.startBind) : null;
  const b = arrow.endBind ? getEl(arrow.endBind) : null;
  const A = canBind(a, arrow) ? a : null;
  const B = canBind(b, arrow) ? b : null;
  if (!A && !B) return null;
  const { start, end } = endpoints(arrow);
  let s = start;
  let e = end;
  if (A && B) {
    s = boundPoint(A, center(getBounds(B)));
    e = boundPoint(B, center(getBounds(A)));
  } else if (A) s = boundPoint(A, end);
  else e = boundPoint(B, start);

  const pts = arrow.points;
  const mid = pts.slice(1, -1).map(([px, py]) => [arrow.x + px - s.x, arrow.y + py - s.y]);
  const points = [[0, 0], ...mid, [e.x - s.x, e.y - s.y]];
  const same =
    Math.abs(s.x - start.x) < 0.01 && Math.abs(s.y - start.y) < 0.01 && Math.abs(e.x - end.x) < 0.01 && Math.abs(e.y - end.y) < 0.01;
  return same ? null : { x: s.x, y: s.y, points };
}

/** Flechas de la lista que están pegadas a `id`. */
export function arrowsBoundTo(elements, id) {
  return elements.filter((el) => (el.type === 'line' || el.type === 'arrow') && !el.isDeleted && (el.startBind === id || el.endBind === id));
}
