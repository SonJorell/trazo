import { h } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { local } from '../util/storage.js';
import { api } from '../util/api.js';
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
  // Qué pasa con las marcas al pasar de diapositiva (desde el control remoto o con permiso):
  //   keep  → se quedan     pages → cada diapositiva tiene su propia página     clear → se borran
  const MARK_MODES = {
    keep: { next: 'pages', label: 'Marcas: se quedan' },
    pages: { next: 'clear', label: 'Marcas: por diapositiva' },
    clear: { next: 'keep', label: 'Marcas: se borran' },
  };
  let markMode = local.get('trazo:markmode', 'pages');
  if (!MARK_MODES[markMode]) markMode = 'pages';
  const markModeBtn = h('button', {
    class: 'ov-btn',
    title: 'Qué hacer con las marcas al pasar de diapositiva',
    onclick: () => {
      markMode = MARK_MODES[markMode].next;
      local.set('trazo:markmode', markMode);
      paintMarkMode();
      toast(MARK_MODES[markMode].label);
    },
  });
  const paintMarkMode = () => {
    markModeBtn.classList.toggle('on', markMode !== 'keep');
    markModeBtn.innerHTML = `${ICONS.pages}<span>${MARK_MODES[markMode].label}</span>`;
  };
  paintMarkMode();
  const onSlideChange = (action) => {
    if (markMode === 'clear') actions.clearAll();
    if (markMode !== 'pages') return;
    const page = actions.currentPage();
    if (action === 'next') actions.goToPage(page + 1);
    else if (action === 'prev') actions.goToPage(Math.max(0, page - 1));
    else if (action === 'first') actions.goToPage(0);
  };

  // QR grande de invitación para el público (visible en el proyector, no en la transmisión).
  const inviteCard = h('div', { class: 'invite-card ov-hit', hidden: true });
  const showInvite = async (on) => {
    inviteCard.hidden = !on;
    if (!on) return;
    let base = location.origin;
    try {
      const info = await api.info();
      base = info.secureUrls?.[0] ?? info.lanUrls?.[0] ?? base;
    } catch {
      /* dirección actual */
    }
    const link = `${base}/sala?room=${room}`;
    inviteCard.replaceChildren(
      h('button', { class: 'invite-close', title: 'Ocultar', 'aria-label': 'Ocultar', html: ICONS.close, onclick: () => showInvite(false) }),
      h('div', { class: 'invite-title' }, 'Únete a la presentación'),
      h('img', { src: api.qrUrl(link), alt: 'QR para unirse', width: 260, height: 260 }),
      h('div', { class: 'invite-code' }, room.toUpperCase()),
      h('div', { class: 'invite-url' }, link.replace(/^https?:\/\//, '')),
    );
  };
  document.body.append(inviteCard);
  const inviteBtn = h('button', { class: 'ov-btn', title: 'Mostrar el QR grande para el público', html: ICONS.qr, onclick: () => showInvite(inviteCard.hidden) });
  showInvite(true); // al empezar, el QR queda a la vista para que todos se unan

  const remote = setupRemoteControl({
    room,
    connection,
    bridge,
    magnifier,
    sharer,
    onSlideChange,
  });

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
    h(
      'span',
      { class: 'ov-room code', title: 'Presentación principal de la sala (recibe cámaras y control)' },
      h('span', { class: 'ov-star', html: ICONS.star }),
      room.toUpperCase(),
    ),
    shareBtn,
    zoomBtn,
    markModeBtn,
    inviteBtn,
    h('button', { class: 'ov-btn', title: 'Temporizador', html: ICONS.timer, onclick: () => actions.timerDialog() }),
    h('button', { class: 'ov-btn', title: 'Votación rápida', html: ICONS.poll, onclick: () => actions.pollDialog() }),
    h('button', { class: 'ov-btn', title: 'Invitar (QR)', html: ICONS.share, onclick: actions.invite }),
    h('button', {
      class: 'ov-btn',
      title: 'Quién puede pasar diapositivas',
      html: ICONS.users,
      onclick: () => remote.showPermissions(),
    }),
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
