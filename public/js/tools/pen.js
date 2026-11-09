import { createElement } from '/shared/elements.js';

/** Lápiz a mano alzada. */
export function createPenTool(ctx) {
  let tx = null;
  let el = null;
  let points = null;

  return {
    name: 'pen',
    cursor: 'crosshair',
    down(p) {
      tx = ctx.begin();
      points = [[0, 0]];
      const { stroke, strokeWidth } = ctx.style;
      el = tx.add(createElement('pen', { x: p.x, y: p.y, points, stroke, strokeWidth }));
    },
    move(p) {
      if (!el) return;
      const nx = p.x - el.x;
      const ny = p.y - el.y;
      const last = points[points.length - 1];
      if (Math.hypot(nx - last[0], ny - last[1]) < 1.5 / ctx.viewport.zoom) return;
      points = [...points, [nx, ny]];
      el = tx.update(el.id, { points });
    },
    up() {
      if (!el) return;
      tx.commit();
      tx = el = points = null;
    },
    cancel() {
      tx?.rollback();
      tx = el = points = null;
    },
  };
}
