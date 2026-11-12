/** Borrador: elimina todo elemento que toque mientras se arrastra. */
export function createEraserTool(ctx) {
  let tx = null;

  const eraseAt = (p) => {
    const tol = ctx.tol(10);
    for (const el of ctx.scene.alive()) {
      if (!el.locked && ctx.hit(el, p, tol)) tx.update(el.id, { isDeleted: true });
    }
  };

  return {
    name: 'eraser',
    cursor: 'cell',
    down(p) {
      tx = ctx.begin();
      eraseAt(p);
    },
    move(p) {
      if (tx) eraseAt(p);
    },
    up() {
      tx?.commit();
      tx = null;
    },
    cancel() {
      tx?.rollback();
      tx = null;
    },
  };
}
