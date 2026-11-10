/** Texto: toca o haz clic donde quieras escribir. Tocar un texto existente lo edita. */
export function createTextTool(ctx) {
  return {
    name: 'text',
    cursor: 'text',
    down() {},
    move() {},
    up(p) {
      const hit = ctx.scene.hitTop(p.x, p.y, ctx.tol(4));
      if (hit && (hit.type === 'text' || hit.type === 'note')) ctx.editText(hit);
      else ctx.editText(null, p);
    },
    cancel() {},
  };
}
