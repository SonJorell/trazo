/**
 * Geometría de elementos: límites y pruebas de impacto.
 * Compartido por servidor, cliente y pruebas.
 */
import { effectiveWidth } from './elements.js';

/** Distancia de un punto P al segmento AB. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Rectángulo normalizado {x, y, w, h} con ancho y alto positivos. */
export function normalizeRect(x, y, w, h) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    w: Math.abs(w),
    h: Math.abs(h),
  };
}

/** Caja delimitadora del elemento en coordenadas del mundo. */
export function getBounds(el) {
  if (el.points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of el.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return { x: el.x + minX, y: el.y + minY, w: maxX - minX, h: maxY - minY };
  }
  return normalizeRect(el.x, el.y, el.w || 0, el.h || 0);
}

/** ¿Se intersecan dos rectángulos normalizados? */
export function rectsIntersect(a, b) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** ¿El rectángulo `inner` está completamente dentro de `outer`? */
export function rectContains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function hitPolyline(el, px, py, tol) {
  const pts = el.points;
  if (pts.length === 1) return Math.hypot(px - (el.x + pts[0][0]), py - (el.y + pts[0][1])) <= tol;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegment(
      px, py,
      el.x + pts[i - 1][0], el.y + pts[i - 1][1],
      el.x + pts[i][0], el.y + pts[i][1],
    );
    if (d <= tol) return true;
  }
  return false;
}

function hitRect(el, px, py, tol) {
  const r = normalizeRect(el.x, el.y, el.w, el.h);
  const inside = px >= r.x - tol && px <= r.x + r.w + tol && py >= r.y - tol && py <= r.y + r.h + tol;
  if (!inside) return false;
  if (el.fill && el.fill !== 'transparent') return true;
  const innerX = px > r.x + tol && px < r.x + r.w - tol;
  const innerY = py > r.y + tol && py < r.y + r.h - tol;
  return !(innerX && innerY); // solo el borde si no tiene relleno
}

function hitEllipse(el, px, py, tol) {
  const r = normalizeRect(el.x, el.y, el.w, el.h);
  const rx = r.w / 2;
  const ry = r.h / 2;
  if (rx < 1 || ry < 1) return hitRect(el, px, py, tol);
  const cx = r.x + rx;
  const cy = r.y + ry;
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  const d = Math.sqrt(nx * nx + ny * ny); // 1 = sobre el borde
  const tolN = tol / Math.min(rx, ry);
  if (el.fill && el.fill !== 'transparent') return d <= 1 + tolN;
  return Math.abs(d - 1) <= tolN;
}

/**
 * ¿El punto (px, py) toca el elemento? `tol` es la tolerancia en unidades del mundo.
 */
export function hitTest(el, px, py, tol = 4) {
  const t = tol + effectiveWidth(el) / 2;
  switch (el.type) {
    case 'pen':
    case 'line':
    case 'arrow':
      return hitPolyline(el, px, py, t);
    case 'rect':
      return hitRect(el, px, py, t);
    case 'ellipse':
      return hitEllipse(el, px, py, t);
    case 'note':
    case 'chair':
    case 'stamp':
    case 'image':
    case 'doc':
    case 'file':
    case 'text': {
      const b = getBounds(el);
      return px >= b.x - t && px <= b.x + b.w + t && py >= b.y - t && py <= b.y + b.h + t;
    }
    default:
      return false;
  }
}
