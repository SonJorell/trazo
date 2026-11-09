import { h } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { Magnifier } from './magnifier.js';
import { setupRemoteControl } from './remoteControl.js';

/** Zonas que reciben clics aunque la ventana esté en modo «usar el PC». */
const INTERACTIVE = '.ov-hit, .modal-backdrop, .toasts, .text-editor';

/**
 * Modo «sobre la pantalla» (`?overlay=1`). La página se dibuja transparente encima
 * del escritorio. Dos modos:
 *   draw — la ventana recibe el ratón: se dibuja sobre la pantalla.
 *   pass — los clics atraviesan la ventana hacia las aplicaciones de abajo;
 *          solo la píldora de control sigue siendo clicable.
 * Dentro de la app de escritorio (Electron), `window.trazoOverlay` controla la
 * ventana; en un navegador normal el modo se simula.
 */
export function setupOverlay({ room, sharer, actions, connection, viewport, overlayState, render }) {
  const bridge = window.trazoOverlay ?? null;
  document.body.classList.add('overlay-mode');

  const zoomBtn = h('button', {
    class: 'ov-btn ov-zoom',
    title: 'Quitar la lupa (Ctrl+Shift+0)',
    hidden: true,
    onclick: () => magnifier.reset(),
  });
  zoomBtn.innerHTML = `${ICONS.zoomOut}<span>Quitar zoom</span>`;
  const magnifier = new Magnifier({
    viewport,
    overlayState,
    render,
    onChange: (on) => (zoomBtn.hidden = !on),
  });
  const remote = setupRemoteControl({ room, connection, bridge, magnifier, sharer });

  const modeBtn = h('button', { class: 'ov-btn ov-mode' });
  const shareBtn = h('button', {
    class: 'ov-btn',
    title: 'Transmitir esta pantalla a la sala (se ve de fondo en el celular)',
    onclick: () => toggleShare(),
  });
  const bar = h(
    'div',
    { class: 'overlay-bar ov-hit', role: 'toolbar', 'aria-label': 'Control de la pantalla' },
    modeBtn,
    h('span', { class: 'ov-room code', title: 'Código de la sala' }, room.toUpperCase()),
    shareBtn,
    zoomBtn,
    h('button', { class: 'ov-btn', title: 'Invitar (QR)', html: ICONS.share, onclick: actions.invite }),
    h('button', {
      class: 'ov-btn',
      title: 'Control remoto desde el celular (diapositivas y zoom)',
      html: ICONS.remote,
      onclick: () => remote.showControlQr(),
    }),
    h('button', { class: 'ov-btn', title: 'Limpiar marcas (Ctrl+Shift+X)', html: ICONS.trash, onclick: () => actions.clear() }),
    bridge ? h('button', { class: 'ov-btn', title: 'Ocultar (Ctrl+Shift+H)', html: ICONS.eyeOff, onclick: () => bridge.hide() }) : null,
    bridge ? h('button', { class: 'ov-btn danger', title: 'Cerrar (Ctrl+Shift+Q)', html: ICONS.close, onclick: () => bridge.quit() }) : null,
  );
  document.body.append(bar);

  // Las demás barras también deben ser clicables en modo «usar el PC».
  for (const sel of ['#toolbar', '#style-panel', '.bottombar .group']) {
    document.querySelectorAll(sel).forEach((el) => el.classList.add('ov-hit'));
  }

  let mode = null;
  function applyMode(next) {
    if (next === mode) return;
    mode = next;
    document.body.dataset.mode = mode;
    const drawing = mode === 'draw';
    modeBtn.innerHTML = drawing ? `${ICONS.cursor}<span>Usar el PC</span>` : `${ICONS.pen}<span>Dibujar</span>`;
    modeBtn.title = `${drawing ? 'Volver a usar el PC' : 'Dibujar sobre la pantalla'} (Ctrl+Shift+D)`;
    if (!drawing) actions.commitText();
  }
  const requestMode = (next) => (bridge ? bridge.setMode(next) : applyMode(next));
  modeBtn.addEventListener('click', () => requestMode(mode === 'draw' ? 'pass' : 'draw'));

  function paintShare(on) {
    shareBtn.classList.toggle('live', on);
    shareBtn.innerHTML = `${ICONS.screen}<span>${on ? 'Transmitiendo' : 'Transmitir'}</span>`;
    bridge?.setSharing(on);
  }
  async function toggleShare() {
    try {
      await sharer.toggle();
    } catch (err) {
      toast(`No se pudo capturar la pantalla: ${err.message}`);
      paintShare(false);
    }
  }
  sharer.onState = (on) => {
    paintShare(on);
    toast(on ? 'Transmitiendo la pantalla a la sala' : 'Transmisión detenida');
  };
  paintShare(false);

  // En modo «usar el PC», la ventana ignora el ratón salvo sobre las zonas interactivas.
  let interactive = null;
  document.addEventListener('mousemove', (e) => {
    if (mode !== 'pass' || !bridge) return;
    const over = Boolean(e.target.closest?.(INTERACTIVE));
    if (over !== interactive) {
      interactive = over;
      bridge.setInteractive(over);
    }
  });

  if (bridge) {
    bridge.onMode((m) => {
      interactive = null;
      applyMode(m);
    });
    bridge.onCommand((cmd) => {
      if (cmd === 'clear') actions.clear();
      else if (cmd === 'share-toggle') toggleShare();
      else if (cmd === 'invite') actions.invite();
      else if (cmd === 'zoom-reset') magnifier.reset();
      else if (cmd === 'remote') remote.showControlQr();
    });
    bridge.ready();
  } else {
    applyMode('draw');
  }
}
