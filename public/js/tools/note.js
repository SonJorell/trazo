import { createElement } from '/shared/elements.js';

/** Nota adhesiva: toca donde quieras pegarla y escribe. Tocar una nota existente la edita. */
export function createNoteTool(ctx) {
  return {
    name: 'note',
    cursor: 'copy',
    down() {},
    move() {},
    up(p) {
      const hit = ctx.scene.hitTop(p.x, p.y, ctx.tol(4));
      if (hit?.type === 'note') return ctx.editText(hit);
      const tx = ctx.begin();
      const { stroke: _s, brush: _b, dash: _d, ...rest } = ctx.strokeProps(p);
      const el = tx.add(
        createElement('note', {
          ...rest,
          x: p.x - 100,
          y: p.y - 80,
          w: 200,
          h: 160,
          text: '',
          fontSize: 20,
          stroke: '#1e1e1e',
          fill: ctx.style.noteColor ?? '#ffec99',
        }),
      );
      tx.commit();
      ctx.editText(el);
    },
    cancel() {},
  };
}
