import { createElement } from '/shared/elements.js';
import { normalizeRect } from '/shared/geometry.js';

/**
 * Rectángulo, elipse, línea y flecha. Mantener Mayús: cuadrado/círculo o ángulos de 45°.
 */
export function createShapeTool(ctx, type) {
  const isLinear = type === 'line' || type === 'arrow';
  let tx = null;
  let el = null;
  let origin = null;

  return {
    name: type,
    cursor: 'crosshair',
    down(p) {
      tx = ctx.begin();
      origin = p;
      const { stroke, fill, strokeWidth } = ctx.style;
      const props = isLinear
        ? { x: p.x, y: p.y, points: [[0, 0], [0, 0]], stroke, strokeWidth }
        : { x: p.x, y: p.y, w: 0, h: 0, stroke, fill, strokeWidth };
      el = tx.add(createElement(type, props));
    },
    move(p, e) {
      if (!el) return;
      let dx = p.x - origin.x;
      let dy = p.y - origin.y;
      if (e.shiftKey) {
        if (isLinear) {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          dx = Math.cos(angle) * len;
          dy = Math.sin(angle) * len;
        } else {
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * s;
          dy = Math.sign(dy || 1) * s;
        }
      }
      el = tx.update(el.id, isLinear ? { points: [[0, 0], [dx, dy]] } : { w: dx, h: dy });
    },
    up() {
      if (!el) return;
      const minSize = 3 / ctx.viewport.zoom;
      const [, end] = el.points ?? [null, [el.w, el.h]];
      const tooSmall = isLinear ? Math.hypot(end[0], end[1]) < minSize : Math.abs(el.w) < minSize && Math.abs(el.h) < minSize;
      if (tooSmall) {
        tx.rollback();
      } else {
        if (!isLinear) tx.update(el.id, normalizeRect(el.x, el.y, el.w, el.h));
        tx.commit();
        ctx.select([el.id]);
      }
      tx = el = origin = null;
    },
    cancel() {
      tx?.rollback();
      tx = el = origin = null;
    },
  };
}
