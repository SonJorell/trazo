import { createElement } from '/shared/elements.js';
import { measureText } from '../render/draw.js';

export const STAMPS = ['✓', '✗', '★', '❤', '!', '?', '➜', '⚠', '①', '②', '③', '④'];

/** Sello: un toque pone el símbolo elegido (✓, ✗, ★, números…) en el color actual. */
export function createStampTool(ctx) {
  return {
    name: 'stamp',
    cursor: 'copy',
    down() {},
    move() {},
    up(p) {
      const symbol = ctx.style.stamp ?? '✓';
      const fontSize = 56;
      const size = measureText(symbol, fontSize);
      const tx = ctx.begin();
      tx.add(
        createElement('text', {
          ...ctx.strokeProps(),
          dash: 'solid',
          text: symbol,
          fontSize,
          x: p.x - size.w / 2,
          y: p.y - size.h / 2,
          ...size,
        }),
      );
      tx.commit();
    },
    cancel() {},
  };
}
