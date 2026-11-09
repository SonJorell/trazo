/** Mano: desplaza la vista. El desplazamiento real lo hace el módulo de entrada. */
export function createHandTool() {
  return {
    name: 'hand',
    cursor: 'grab',
    pans: true,
    down() {},
    move() {},
    up() {},
    cancel() {},
  };
}
