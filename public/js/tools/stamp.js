import { createElement, STAMP_KEYS } from '/shared/elements.js';

export const STAMPS = STAMP_KEYS;
const SIZE = 64;

/** Sello: un toque pone el ícono elegido (visto bueno, estrella, números…) en el color actual. */
export function createStampTool(ctx) {
  return {
    name: 'stamp',
    cursor: 'copy',
    down() {},
    move() {},
    up(p) {
      const icon = STAMP_KEYS.includes(ctx.style.stamp) ? ctx.style.stamp : 'check';
      const tx = ctx.begin();
      tx.add(createElement('stamp', { ...ctx.strokeProps(p), dash: 'solid', icon, x: p.x - SIZE / 2, y: p.y - SIZE / 2, w: SIZE, h: SIZE }));
      tx.commit();
    },
    cancel() {},
  };
}
