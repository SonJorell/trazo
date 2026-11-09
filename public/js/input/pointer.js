/**
 * Entrada de puntero unificada (ratón, lápiz y táctil) sobre el lienzo.
 * - 1 dedo / botón izquierdo: herramienta activa.
 * - 2 dedos: zoom con pellizco y desplazamiento (cancela el trazo en curso).
 * - Botón central, barra espaciadora o herramienta Mano: desplazar.
 * - Rueda: desplazar; Ctrl + rueda (o pellizco en trackpad): zoom.
 * Con `lockView` (modo sobre la pantalla) la vista queda fija 1:1: sin zoom ni desplazamiento.
 */
export function attachPointerInput(
  canvas,
  { viewport, getTool, render, onCursor, isSpaceDown, lockView = false, onUserView = () => {} },
) {
  const pointers = new Map(); // pointerId → { x, y }
  let drawingId = null; // puntero que controla la herramienta
  let panningId = null;
  let gesture = null; // { dist, mid }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (pt) => viewport.toWorld(pt.x, pt.y);

  const twoFinger = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const pt = local(e);
    pointers.set(e.pointerId, pt);
    canvas.setPointerCapture?.(e.pointerId);

    if (pointers.size === 2 && !lockView) {
      if (drawingId !== null) getTool().cancel();
      drawingId = null;
      panningId = null;
      gesture = twoFinger();
      return;
    }
    if (pointers.size > 2) return;

    const tool = getTool();
    if (!lockView && (e.button === 1 || isSpaceDown() || tool.pans)) {
      panningId = e.pointerId;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    drawingId = e.pointerId;
    tool.down(world(pt), e);
    render();
  });

  canvas.addEventListener('pointermove', (e) => {
    const pt = local(e);
    const prev = pointers.get(e.pointerId);
    if (prev) pointers.set(e.pointerId, pt);

    if (gesture && pointers.size === 2) {
      const next = twoFinger();
      onUserView();
      if (gesture.dist > 0) viewport.zoomAt(next.mid.x, next.mid.y, next.dist / gesture.dist);
      viewport.pan(next.mid.x - gesture.mid.x, next.mid.y - gesture.mid.y);
      gesture = next;
      render();
      return;
    }

    if (panningId === e.pointerId && prev) {
      onUserView();
      viewport.pan(pt.x - prev.x, pt.y - prev.y);
      render();
      return;
    }

    if (drawingId === e.pointerId) {
      const tool = getTool();
      const events = e.getCoalescedEvents?.() ?? [];
      if (events.length > 1) for (const ce of events) tool.move(world(local(ce)), e);
      else tool.move(world(pt), e);
      render();
    }
    onCursor(world(pt));
  });

  const end = (e) => {
    const pt = pointers.get(e.pointerId) ?? local(e);
    pointers.delete(e.pointerId);
    if (drawingId === e.pointerId) {
      drawingId = null;
      if (e.type === 'pointercancel') getTool().cancel();
      else getTool().up(world(pt), e);
      render();
    }
    if (panningId === e.pointerId) {
      panningId = null;
      canvas.style.cursor = getTool().cursor;
    }
    if (pointers.size < 2) gesture = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (lockView) return;
      onUserView();
      const pt = local(e);
      if (e.ctrlKey || e.metaKey) viewport.zoomAt(pt.x, pt.y, Math.exp(-e.deltaY * 0.01));
      else viewport.pan(-e.deltaX, -e.deltaY);
      render();
    },
    { passive: false },
  );

  // Evita el menú contextual al mantener pulsado en móviles.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
