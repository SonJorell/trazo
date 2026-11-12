import { createElement } from '/shared/elements.js';
import { normalizeRect, getBounds } from '/shared/geometry.js';
import { BINDABLE, routeArrow } from '/shared/binding.js';

/** Forma pegable bajo el punto (la de más arriba), con un margen para que sea fácil acertar. */
function bindTargetAt(ctx, p, exclude) {
  const tol = ctx.tol(10);
  const list = ctx.scene.alive();
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    if (el.id === exclude || !BINDABLE.has(el.type)) continue;
    const b = getBounds(el);
    if (p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol) return el;
  }
  return null;
}

/**
 * Rectángulo, elipse, línea y flecha. Mantener Mayús: cuadrado/círculo o ángulos de 45°.
 * Las líneas y flechas que empiezan o terminan sobre una forma quedan pegadas a ella
 * (la siguen al moverla). Mantener Alt para no pegarlas.
 */
export function createShapeTool(ctx, type) {
  const isLinear = type === 'line' || type === 'arrow';
  let tx = null;
  let el = null;
  let origin = null;
  let startTarget = null;
  let endTarget = null;

  const setHint = () => {
    ctx.overlay.bindHint = [startTarget?.id, endTarget?.id].filter(Boolean);
  };

  return {
    name: type,
    cursor: 'crosshair',
    down(p, e) {
      tx = ctx.begin();
      origin = p;
      startTarget = isLinear && !e?.altKey ? bindTargetAt(ctx, p) : null;
      endTarget = null;
      const props = isLinear
        ? { x: p.x, y: p.y, points: [[0, 0], [0, 0]], ...ctx.strokeProps(p) }
        : { x: p.x, y: p.y, w: 0, h: 0, fill: ctx.style.fill, ...ctx.strokeProps(p) };
      el = tx.add(createElement(type, props));
      if (isLinear) setHint();
    },
    move(p, e) {
      if (!el) return;
      let dx = p.x - origin.x;
      let dy = p.y - origin.y;
      if (isLinear) {
        endTarget = e.altKey ? null : bindTargetAt(ctx, p, el.id);
        if (endTarget && endTarget.id === startTarget?.id) endTarget = null;
        if (e.altKey) startTarget = null;
        setHint();
      }
      if (e.shiftKey && !endTarget) {
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
      if (!isLinear) {
        el = tx.update(el.id, { w: dx, h: dy });
        return;
      }
      const draft = { ...el, x: origin.x, y: origin.y, points: [[0, 0], [dx, dy]], startBind: startTarget?.id, endBind: endTarget?.id };
      const route = Math.hypot(dx, dy) * ctx.viewport.zoom > 8 ? routeArrow(draft, (id) => ctx.scene.get(id)) : null;
      el = tx.update(el.id, {
        x: route?.x ?? origin.x,
        y: route?.y ?? origin.y,
        points: route?.points ?? [[0, 0], [dx, dy]],
        startBind: startTarget?.id,
        endBind: endTarget?.id,
      });
    },
    up() {
      if (!el) return;
      ctx.overlay.bindHint = null;
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
      tx = el = origin = startTarget = endTarget = null;
    },
    cancel() {
      ctx.overlay.bindHint = null;
      tx?.rollback();
      tx = el = origin = startTarget = endTarget = null;
    },
  };
}
