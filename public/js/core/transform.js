const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Cambios para escalar un elemento respecto de un origen (ox, oy) por un factor s.
 * Se usa para que las anotaciones de un documento lo acompañen al agrandarlo o achicarlo.
 */
export function scaleAbout(el, ox, oy, s) {
  const ch = { x: ox + (el.x - ox) * s, y: oy + (el.y - oy) * s };
  if (Array.isArray(el.points)) ch.points = el.points.map(([x, y]) => [x * s, y * s]);
  if (typeof el.w === 'number') {
    ch.w = el.w * s;
    ch.h = el.h * s;
  }
  if (typeof el.fontSize === 'number') ch.fontSize = clamp(el.fontSize * s, 8, 200);
  if (typeof el.strokeWidth === 'number') ch.strokeWidth = clamp(el.strokeWidth * s, 1, 64);
  return ch;
}
