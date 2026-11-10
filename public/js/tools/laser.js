/** Puntero láser: deja una estela que se desvanece y la comparte con la sala. */
export function createLaserTool(ctx) {
  let drawing = false;
  return {
    name: 'laser',
    cursor: 'crosshair',
    down(p) {
      drawing = true;
      ctx.laser(p, false);
    },
    move(p) {
      if (drawing) ctx.laser(p, false);
    },
    up(p) {
      if (!drawing) return;
      drawing = false;
      ctx.laser(p, true);
    },
    cancel() {
      drawing = false;
    },
  };
}
