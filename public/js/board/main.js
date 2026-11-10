import { createElement } from '/shared/elements.js';
import { hitTest } from '/shared/geometry.js';
import { Scene } from '../core/scene.js';
import { History, Transaction } from '../core/history.js';
import { Viewport } from '../core/viewport.js';
import { Renderer } from '../render/renderer.js';
import { measureText, LINE_HEIGHT } from '../render/draw.js';
import { exportPng } from '../render/exportPng.js';
import { attachPointerInput } from '../input/pointer.js';
import { createTools, TOOL_DEFS } from '../tools/index.js';
import { Connection } from '../net/connection.js';
import { Sync } from '../net/sync.js';
import { Presence } from '../ui/presence.js';
import { TextEditor } from '../ui/textEditor.js';
import { createStylePanel } from '../ui/stylePanel.js';
import {
  askJoin,
  cameraHttpsDialog,
  confirmDialog,
  fatalDialog,
  liveStartDialog,
  shareDialog,
} from '../ui/dialogs.js';
import { CameraSender, CameraReceiver } from '../media/cameras.js';
import { CameraBubbles } from '../ui/cameraBubbles.js';
import { Reactions } from '../ui/reactions.js';
import { LaserLayer } from '../render/laser.js';
import { toast } from '../ui/toast.js';
import { ICONS } from '../ui/icons.js';
import { h } from '../ui/dom.js';
import { setupOverlay } from '../overlay/overlayMode.js';
import { ScreenSharer } from '../overlay/screenShare.js';
import { api, parseRoomCode } from '../util/api.js';
import {
  local,
  rememberRoom,
  savedName,
  saveName,
  savedPin,
  savePin,
  forgetPin,
  forgetRoom,
  saveHostKey,
  hostKeyOf,
} from '../util/storage.js';

const $ = (sel) => document.querySelector(sel);

const params = new URLSearchParams(location.search);
const room = parseRoomCode(params.get('room'));
if (!room) location.replace('/');
/** Modo «sobre la pantalla»: fondo transparente y vista fija 1:1 con la pantalla del PC. */
const OVERLAY = params.get('overlay') === '1';
// La app de overlay pasa la clave de anfitrión en el fragmento (#host=…), que no viaja al servidor.
{
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('host');
  if (fromHash && room) {
    saveHostKey(room, fromHash);
    history.replaceState(null, '', location.pathname + location.search);
  }
}
const STYLE_KEY = OVERLAY ? 'trazo:style:overlay' : 'trazo:style';

// ---------- Estado ----------
const scene = new Scene();
const history = new History(scene);
const viewport = new Viewport();
const overlay = {
  selection: new Set(),
  marquee: null,
  cursors: new Map(),
  editingId: null,
  screen: null,
  laser: new LaserLayer(),
};
let myColor = '#ff2d55'; // color del láser propio (el de cada participante, al conectar)
const style = {
  stroke: OVERLAY ? '#e03131' : '#1e1e1e',
  fill: 'transparent',
  strokeWidth: OVERLAY ? 4 : 2,
  fontSize: 28,
  brush: 'pen',
  dash: 'solid',
  opacity: 1,
  ...local.get(STYLE_KEY, {}),
};

/** Identificador estable de este navegador: marca los trazos propios («Borrar mis trazos»). */
const AUTHOR_ID = (() => {
  let id = local.get('trazo:author', null);
  if (!id) {
    id = createElement('pen', {}).id; // reutiliza el generador de ids aleatorios
    local.set('trazo:author', id);
  }
  return id;
})();

const canvas = $('#board');
const renderer = new Renderer(canvas, { scene, viewport, overlay, transparent: OVERLAY });
const render = () => renderer.requestRender();
if (!OVERLAY) {
  viewport.x = -renderer.width / 2;
  viewport.y = -renderer.height / 2;
}

let roomHasPin = false;
let sync = null;
let spaceDown = false;

// ---------- Contexto que reciben las herramientas ----------
const ctx = {
  scene,
  viewport,
  overlay,
  get style() {
    return style;
  },
  get selection() {
    return overlay.selection;
  },
  begin: () => new Transaction(scene, history),
  /** Puntero láser: estela local inmediata + envío a la sala. */
  laser(p, end) {
    overlay.laser.add('me', myColor, [[p.x, p.y]], end);
    render();
    sync?.sendLaser(p, end, myColor);
  },
  /** Propiedades de trazo actuales para crear un elemento nuevo. */
  strokeProps: () => ({
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    brush: style.brush,
    dash: style.dash,
    opacity: style.opacity,
    author: AUTHOR_ID,
  }),
  render,
  tol: (px) => px / viewport.zoom,
  hit: (el, p, tol) => hitTest(el, p.x, p.y, tol),
  select(ids) {
    overlay.selection.clear();
    for (const id of ids) overlay.selection.add(id);
    onSelectionChange();
  },
  toggleSelect(id) {
    if (overlay.selection.has(id)) overlay.selection.delete(id);
    else overlay.selection.add(id);
    onSelectionChange();
  },
  editText(el, p) {
    if (el) {
      overlay.editingId = el.id;
      textEditor.open({ id: el.id, x: el.x, y: el.y, text: el.text, fontSize: el.fontSize, color: el.stroke });
    } else {
      const y = p.y - (style.fontSize * LINE_HEIGHT) / 2;
      textEditor.open({ id: null, x: p.x, y, text: '', fontSize: style.fontSize, color: style.stroke });
    }
    render();
  },
};

// ---------- Texto ----------
const textEditor = new TextEditor($('#editor-layer'), {
  viewport,
  onCommit({ id, x, y, text, fontSize, color }) {
    overlay.editingId = null;
    const tx = ctx.begin();
    if (id) {
      if (!scene.get(id)) return render();
      if (!text) tx.update(id, { isDeleted: true });
      else tx.update(id, { text, ...measureText(text, fontSize) });
    } else if (text) {
      const el = createElement('text', {
        x,
        y,
        text,
        fontSize,
        ...ctx.strokeProps(),
        stroke: color,
        dash: 'solid',
        ...measureText(text, fontSize),
      });
      tx.add(el);
    }
    tx.commit();
    render();
  },
});

// ---------- Herramientas y barra ----------
const tools = createTools(ctx);
let tool = tools.get('pen');
const toolButtons = new Map();

function setTool(name) {
  if (textEditor.active) textEditor.commit();
  tool.cancel();
  tool = tools.get(name);
  canvas.style.cursor = tool.cursor;
  for (const [n, btn] of toolButtons) btn.classList.toggle('active', n === name);
  if (name !== 'select') ctx.select([]);
}

const toolbar = $('#toolbar');
for (const def of TOOL_DEFS) {
  const btn = h('button', {
    class: 'tool',
    'data-tool': def.name,
    title: `${def.label} (${def.key.toUpperCase()})`,
    'aria-label': def.label,
    html: ICONS[def.name],
    onclick: () => setTool(def.name),
  });
  toolButtons.set(def.name, btn);
  toolbar.append(btn);
}
toolbar.append(
  h('span', { class: 'sep' }),
  h('button', {
    class: 'tool',
    id: 'style-toggle',
    title: 'Colores y grosor',
    'aria-label': 'Colores y grosor',
    html: ICONS.palette,
    onclick: () => $('#style-panel').classList.toggle('open'),
  }),
);
setTool('pen');

// ---------- Estilo ----------
const STYLE_TARGETS = {
  stroke: () => true,
  fill: (el) => el.type === 'rect' || el.type === 'ellipse',
  strokeWidth: (el) => el.type !== 'text',
  fontSize: (el) => el.type === 'text',
  brush: () => true,
  dash: (el) => el.type !== 'text',
  opacity: () => true,
};

const stylePanel = createStylePanel($('#style-panel'), style, (partial) => {
  Object.assign(style, partial);
  local.set(STYLE_KEY, style);
  stylePanel.refresh();
  if (!overlay.selection.size) return;
  const tx = ctx.begin();
  for (const id of overlay.selection) {
    const el = scene.get(id);
    if (!el) continue;
    const changes = {};
    for (const [key, value] of Object.entries(partial)) if (STYLE_TARGETS[key](el)) changes[key] = value;
    if (changes.fontSize) Object.assign(changes, measureText(el.text, changes.fontSize));
    if (Object.keys(changes).length) tx.update(id, changes);
  }
  tx.commit();
});

function onSelectionChange() {
  $('#delete-btn').hidden = overlay.selection.size === 0;
  render();
}

// ---------- Acciones ----------
function deleteSelection() {
  if (!overlay.selection.size) return;
  const tx = ctx.begin();
  for (const id of overlay.selection) tx.update(id, { isDeleted: true });
  tx.commit();
  ctx.select([]);
}

function zoomBy(factor) {
  viewport.zoomAt(renderer.width / 2, renderer.height / 2, factor);
  afterViewChange();
}

function fitToContent() {
  if (overlay.screen) return fitScreen();
  const b = scene.bounds();
  if (b) viewport.fit(b, renderer.width, renderer.height, 60, 2);
  afterViewChange();
}

function afterViewChange() {
  $('#zoom-label').textContent = `${Math.round(viewport.zoom * 100)}%`;
  textEditor.reposition();
  render();
}

async function clearBoard({ ask = true } = {}) {
  if (!scene.alive().length) return;
  const ok = !ask || await confirmDialog('¿Borrar todo el contenido de la pizarra? Podrás deshacerlo.', {
    okLabel: 'Limpiar',
    danger: true,
  });
  if (!ok) return;
  const tx = ctx.begin();
  for (const el of scene.alive()) tx.update(el.id, { isDeleted: true });
  tx.commit();
  ctx.select([]);
}

/** Borra solo lo que dibujó este navegador (deshacible). */
function clearMine() {
  const mine = scene.alive().filter((el) => el.author === AUTHOR_ID);
  if (!mine.length) return toast('No tienes trazos en la pizarra');
  const tx = ctx.begin();
  for (const el of mine) tx.update(el.id, { isDeleted: true });
  tx.commit();
  ctx.select([]);
  toast(`Se borraron ${mine.length} trazos tuyos (puedes deshacer)`);
}

async function doExport() {
  const ok = await exportPng(scene, `trazo-${room}.png`);
  if (!ok) toast('La pizarra está vacía');
}

function updateHistoryButtons() {
  $('#undo-btn').disabled = !history.canUndo;
  $('#redo-btn').disabled = !history.canRedo;
}

// ---------- Eventos de la escena ----------
scene.on('change', () => {
  for (const id of overlay.selection) {
    const el = scene.get(id);
    if (!el || el.isDeleted) overlay.selection.delete(id);
  }
  $('#delete-btn').hidden = overlay.selection.size === 0;
  render();
});
history.on('change', updateHistoryButtons);

// ---------- Botones fijos ----------
const bind = (sel, icon, fn) => {
  const el = $(sel);
  if (icon) el.innerHTML = ICONS[icon];
  el.addEventListener('click', fn);
};
bind('#undo-btn', 'undo', () => history.undo());
bind('#redo-btn', 'redo', () => history.redo());
bind('#zoom-in', 'zoomIn', () => zoomBy(1.2));
bind('#zoom-out', 'zoomOut', () => zoomBy(1 / 1.2));
bind('#zoom-label', null, () => zoomBy(1 / viewport.zoom));
bind('#fit-btn', 'fit', fitToContent);
bind('#delete-btn', 'trash', deleteSelection);
bind('#share-btn', null, () => shareDialog({ room, hasPin: roomHasPin }));
$('#share-btn').insertAdjacentHTML('afterbegin', ICONS.share);

const menu = $('#menu');
bind('#menu-btn', 'menu', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && e.target !== $('#menu-btn')) menu.hidden = true;
});
const menuItem = (icon, label, fn) =>
  h('button', { class: 'menu-item', onclick: () => ((menu.hidden = true), fn()) }, h('span', { html: ICONS[icon] }), label);
menu.append(
  menuItem('home', 'Inicio', () => (location.href = '/')),
  menuItem('download', 'Exportar imagen PNG', doExport),
  menuItem('fit', 'Ajustar a la pantalla', fitToContent),
  menuItem('eraser', 'Borrar mis trazos', clearMine),
  menuItem('trash', 'Limpiar pizarra', () => clearBoard()),
);

// ---------- Pantalla compartida en vivo (fondo) ----------
// Quien transmite envía cuadros; los demás la ven de fondo en (0,0,w,h) del mundo.
let screenSeq = 0;
let followScreen = true; // reajustar al girar o cambiar de tamaño mientras no se mueva la vista a mano
let roomMode = 'blank';
let hostSharer = null;
let previewTimer = null;
const hosting = () => Boolean(hostSharer?.active);
const canShareScreen =
  !OVERLAY && Boolean(hostKeyOf(room)) && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;
const isImmersive = () => document.body.classList.contains('immersive');

const screenBadge = $('#screen-badge');
const fsBtn = $('#fullscreen-btn');
const exitImmersiveBtn = $('#exit-immersive');
fsBtn.innerHTML = ICONS.maximize;
exitImmersiveBtn.innerHTML = ICONS.minimize;

/** Zona libre de la pantalla (sin barras) donde encajar la transmisión. */
function screenBox() {
  if (isImmersive()) return { x: 0, y: 0, w: renderer.width, h: renderer.height };
  const top = 60;
  const bottom = isNarrow() ? 124 : 64;
  return { x: 8, y: top, w: renderer.width - 16, h: renderer.height - top - bottom };
}

function fitScreen() {
  const s = overlay.screen;
  if (!s) return;
  viewport.fitInto({ x: 0, y: 0, w: s.w, h: s.h }, screenBox());
  afterViewChange();
}

function updateScreenUi() {
  const live = Boolean(overlay.screen);
  const waiting = !live && roomMode === 'live' && !hosting() && !OVERLAY;
  screenBadge.hidden = !live && !waiting;
  screenBadge.classList.toggle('waiting', waiting);
  const short = isNarrow();
  screenBadge.querySelector('.label').textContent = hosting()
    ? 'Transmitiendo'
    : live
      ? short
        ? 'En vivo'
        : 'Pantalla en vivo'
      : short
        ? 'Esperando…'
        : 'Esperando transmisión…';
  fsBtn.hidden = !live;
  if (!live && isImmersive()) exitImmersive();
}

function showScreen(frame) {
  if (OVERLAY || hosting()) return; // quien transmite no se dibuja su propio eco
  const seq = ++screenSeq;
  if (!frame) {
    overlay.screen = null;
    updateScreenUi();
    render();
    return;
  }
  const img = new Image();
  img.onload = () => {
    if (seq !== screenSeq) return; // llegó uno más nuevo
    const first = !overlay.screen;
    overlay.screen = { img, w: frame.w, h: frame.h };
    if (first) {
      followScreen = true;
      updateScreenUi();
      fitScreen();
      if (isNarrow() && !isImmersive()) toast('Toca ⛶ para ver la pantalla completa');
    } else render();
  };
  img.src = frame.data;
}

/** Vista previa local de la propia transmisión (el anfitrión ve lo mismo que los demás). */
function setHostPreview(video) {
  clearInterval(previewTimer);
  if (video) {
    const dpr = window.devicePixelRatio || 1;
    overlay.screen = { img: video, w: Math.round(video.videoWidth / dpr), h: Math.round(video.videoHeight / dpr) };
    previewTimer = setInterval(render, 100);
    followScreen = true;
    fitScreen();
  } else {
    overlay.screen = null;
    render();
  }
  updateScreenUi();
}

async function toggleHostShare() {
  if (!hostSharer) return;
  try {
    await hostSharer.toggle();
  } catch (err) {
    if (err.name !== 'NotAllowedError') toast(`No se pudo transmitir: ${err.message}`);
  }
}

// ---------- Pantalla completa (móvil) ----------
async function enterImmersive() {
  document.body.classList.add('immersive');
  followScreen = true;
  fitScreen();
  const el = document.documentElement;
  try {
    await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
  } catch {
    /* iPhone no permite pantalla completa en páginas: se usa el modo inmersivo igual */
  }
  let locked = false;
  try {
    await screen.orientation?.lock?.('landscape');
    locked = true;
  } catch {
    /* no soportado: se sugiere girar a mano */
  }
  const s = overlay.screen;
  if (!locked && s && s.w > s.h && window.innerHeight > window.innerWidth) {
    toast('Gira el teléfono para verla más grande');
  }
  setTimeout(fitScreen, 300);
}

function exitImmersive() {
  document.body.classList.remove('immersive');
  const fsEl = document.fullscreenElement ?? document.webkitFullscreenElement;
  if (fsEl) (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())?.catch?.(() => {});
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* sin soporte */
  }
  setTimeout(fitScreen, 300);
}

const onFullscreenChange = () => {
  const fsEl = document.fullscreenElement ?? document.webkitFullscreenElement;
  if (!fsEl && isImmersive()) exitImmersive();
};
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

screenBadge.addEventListener('click', () => {
  followScreen = true;
  fitScreen();
});
fsBtn.addEventListener('click', enterImmersive);
exitImmersiveBtn.addEventListener('click', exitImmersive);

const shareScreenItem = menuItem('screen', 'Transmitir mi pantalla', toggleHostShare);
shareScreenItem.hidden = true;
menu.insertBefore(shareScreenItem, menu.children[1]);
let requestControl = () => {};
const requestItem = menuItem('hand', 'Pedir pasar diapositivas', () => requestControl());
requestItem.hidden = true;
menu.insertBefore(requestItem, menu.children[1]);

$('#room-code').textContent = room.toUpperCase();
document.title = `Trazo · ${room.toUpperCase()}`;
updateHistoryButtons();
afterViewChange();

// ---------- Teclado ----------
const TOOL_KEYS = new Map(TOOL_DEFS.map((d) => [d.key, d.name]));
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (e.code === 'Space') {
    spaceDown = true;
    e.preventDefault();
  } else if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) history.redo();
    else history.undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    history.redo();
  } else if (key === 'delete' || key === 'backspace') {
    deleteSelection();
  } else if (key === 'escape') {
    ctx.select([]);
  } else if (!mod && !e.altKey && TOOL_KEYS.has(key)) {
    setTool(TOOL_KEYS.get(key));
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceDown = false;
});

// ---------- Entrada de puntero ----------
attachPointerInput(canvas, {
  viewport,
  getTool: () => tool,
  render: () => {
    $('#zoom-label').textContent = `${Math.round(viewport.zoom * 100)}%`;
    textEditor.reposition();
    render();
  },
  onCursor: (p) => sync?.sendCursor(p),
  isSpaceDown: () => spaceDown,
  lockView: OVERLAY,
  onUserView: () => (followScreen = false),
});

const onResize = () => {
  renderer.resize();
  textEditor.reposition();
  if (overlay.screen && followScreen) fitScreen();
  updateScreenUi();
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
window.visualViewport?.addEventListener('resize', onResize);

// Los cursores remotos se desvanecen: redibujar de vez en cuando.
setInterval(() => overlay.cursors.size && render(), 2000);

// ---------- Conexión ----------
async function start() {
  let info;
  try {
    info = await api.getRoom(room);
  } catch (err) {
    if (err.status === 404) forgetRoom(room);
    fatalDialog(
      err.status === 404
        ? `La sala ${room.toUpperCase()} no existe o se cerró porque quedó vacía. Crea una nueva desde el inicio.`
        : 'No se pudo contactar con el servidor. ¿Está encendido el PC?',
    );
    return;
  }
  roomHasPin = info.hasPin;
  roomMode = info.mode ?? 'blank';
  const hostKey = hostKeyOf(room);
  const isHost = Boolean(hostKey);
  updateScreenUi();
  rememberRoom(room);

  let name = savedName() || (OVERLAY ? 'Pantalla PC' : '');
  let pin = info.hasPin ? savedPin(room) : null;
  if (!name || (info.hasPin && !pin)) {
    const answer = await askJoin({ room, defaultName: name, needPin: info.hasPin && !pin });
    name = answer.name;
    pin = answer.pin ?? pin;
  }
  saveName(name);
  if (pin) savePin(room, pin);

  // Quien proyecta (overlay o anfitrión) recibe las cámaras de los demás.
  const isDisplay = isHost;
  const connection = new Connection({ room, getJoin: () => ({ name, pin, hostKey, display: isDisplay }) });
  const hostChip = $('#host-chip');
  connection.on('message', (msg) => {
    if (msg.t !== 'welcome') return;
    hostChip.hidden = !msg.you.host || OVERLAY;
    if (OVERLAY && !msg.you.host) {
      fatalDialog(
        'Esta ventana no es la presentación principal de la sala. Ábrela con iniciar-overlay.bat en el PC del anfitrión, o únete como participante desde el QR.',
      );
    }
  });
  const presence = new Presence($('#presence'), { overlay, render });
  sync = new Sync({
    scene,
    connection,
    presence,
    onScreen: showScreen,
    onLaser: (msg) => {
      overlay.laser.add(msg.from, msg.c, msg.pts, msg.end);
      render();
    },
  });

  // Reacciones (emojis que flotan para todos).
  const reactions = new Reactions({
    button: $('#react-btn'),
    onSend: (e) => connection.send({ t: 'reaction', e }),
  });
  $('#react-btn').innerHTML = ICONS.smile;
  connection.on('message', (msg) => {
    if (msg.t === 'reaction') reactions.show(msg.e, msg.name);
    if (msg.t === 'welcome') myColor = msg.you.color;
  });

  if (canShareScreen) {
    hostSharer = new ScreenSharer({
      connection,
      hasViewers: () => presence.peerCount > 0,
      getSize: (video) => {
        const dpr = window.devicePixelRatio || 1;
        return { w: Math.round(video.videoWidth / dpr), h: Math.round(video.videoHeight / dpr) };
      },
      onPreview: setHostPreview,
      onState: (on) => {
        shareScreenItem.lastChild.textContent = on ? 'Detener transmisión' : 'Transmitir mi pantalla';
        toast(on ? 'Transmitiendo tu pantalla a la sala' : 'Transmisión detenida');
        updateScreenUi();
      },
      displayMediaOptions: {
        video: { frameRate: 10 },
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      },
    });
    shareScreenItem.hidden = false;
  }

  if (OVERLAY) {
    const sharer = new ScreenSharer({
      connection,
      hasViewers: () => presence.peerCount > 0,
      getSize: () => ({ w: window.innerWidth, h: window.innerHeight }),
      onState: () => {},
    });
    setupOverlay({
      room,
      sharer,
      connection,
      viewport,
      overlayState: overlay,
      render,
      actions: {
        clear: () => clearBoard({ ask: false }),
        clearAll: () => clearBoard({ ask: false }),
        invite: () => shareDialog({ room, hasPin: roomHasPin }),
        commitText: () => textEditor.active && textEditor.commit(),
      },
    });
  }

  setupCamerasAndControl({ connection, presence, isDisplay });

  let firstWelcome = true;
  connection.on('message', (msg) => {
    if (msg.t === 'welcome' && firstWelcome) {
      firstWelcome = false;
      if (!OVERLAY && scene.alive().length && !overlay.screen) fitToContent();
      // El anfitrión de una sala en directo empieza a transmitir (requiere un clic suyo).
      if (roomMode === 'live' && isHost && !OVERLAY) {
        if (hostSharer) liveStartDialog().then((yes) => yes && toggleHostShare());
        else toast('Para transmitir la pantalla abre esta sala en el navegador del PC');
      }
    }
    if (msg.t === 'error') toast(msg.message);
  });

  let offlineToast = null;
  const statusEl = $('#status');
  connection.on('status', (status) => {
    statusEl.dataset.state = status;
    statusEl.title = { online: 'Conectado', connecting: 'Conectando…', offline: 'Sin conexión' }[status];
    if (status === 'online') {
      offlineToast?.();
      offlineToast = null;
    } else if (status === 'offline' && !offlineToast) {
      offlineToast = toast('Sin conexión. Reintentando… (puedes seguir dibujando)', { sticky: true });
    }
  });

  connection.on('fatal', async (err) => {
    if (err.code === 'pin_invalid' || err.code === 'pin_required') {
      forgetPin(room);
      const answer = await askJoin({ room, defaultName: name, needPin: true, error: err.message });
      name = answer.name;
      pin = answer.pin;
      saveName(name);
      savePin(room, pin);
      connection.connect();
    } else {
      fatalDialog(err.message);
    }
  });

  connection.connect();
}

/**
 * Cámaras (enviar la propia, o ver las de otros si se proyecta) y control de diapositivas
 * con permiso del anfitrión.
 */
function setupCamerasAndControl({ connection, presence, isDisplay }) {
  const getName = (id) => presence.peers.get(id)?.name ?? 'Invitado';

  // ----- Recibir cámaras (overlay / anfitrión) -----
  let receiver = null;
  if (isDisplay) {
    const bubbles = new CameraBubbles({ getName, onClose: (id) => receiver.close(id, true) });
    receiver = new CameraReceiver({
      connection,
      onStream: (id, stream) => bubbles.show(id, stream),
      onEnd: (id) => bubbles.remove(id),
    });
  }

  // ----- Enviar mi cámara (participantes) -----
  const camBtn = $('#cam-btn');
  const selfView = $('#self-view');
  const selfVideo = $('#self-video');
  $('#cam-flip').innerHTML = ICONS.flip;
  $('#cam-stop').innerHTML = ICONS.cameraOff;
  const displays = () => [...presence.peers.values()].filter((p) => p.display).map((p) => p.id);
  const camera = new CameraSender({
    connection,
    getDisplays: displays,
    onState: (on) => {
      camBtn.classList.toggle('on', on);
      camBtn.title = on ? 'Apagar mi cámara' : 'Encender mi cámara';
      camBtn.innerHTML = on ? ICONS.cameraOff : ICONS.camera;
    },
    onPreview: (stream) => {
      selfView.hidden = !stream;
      selfVideo.srcObject = stream;
    },
  });
  camBtn.innerHTML = ICONS.camera;
  camBtn.hidden = OVERLAY;
  camBtn.addEventListener('click', async () => {
    if (camera.active) return camera.stop();
    if (!CameraSender.supported()) return cameraHttpsDialog(room);
    try {
      await camera.start();
      toast(displays().length ? 'Tu cámara se ve en la presentación' : 'Cámara encendida: aparecerá cuando el anfitrión esté proyectando');
    } catch (err) {
      toast(err.name === 'NotAllowedError' ? 'Permiso de cámara denegado' : `No se pudo abrir la cámara: ${err.message}`);
    }
  });
  $('#cam-flip').addEventListener('click', () => camera.switchCamera().catch((err) => toast(err.message)));
  $('#cam-stop').addEventListener('click', () => camera.stop());

  // ----- Control de diapositivas con permiso -----
  let controllerOnline = false;
  let granted = false;
  const slidePad = $('#slide-pad');
  const paintControl = () => {
    requestItem.hidden = OVERLAY || !controllerOnline || granted;
    slidePad.hidden = OVERLAY || !granted;
  };
  requestControl = () => {
    connection.send({ t: 'control-request' });
    toast('Solicitud enviada al anfitrión');
  };
  for (const btn of slidePad.querySelectorAll('[data-slide]')) {
    btn.addEventListener('click', () => {
      navigator.vibrate?.(10);
      connection.send({ t: 'control', action: btn.dataset.slide, style: local.get('trazo:ctl:style', 'arrows') });
    });
  }

  connection.on('message', (msg) => {
    switch (msg.t) {
      case 'welcome':
        controllerOnline = msg.controller;
        granted = false;
        paintControl();
        if (camera.active) {
          for (const id of [...camera.pcs.keys()]) camera.disconnect(id);
          for (const id of displays()) camera.connectTo(id);
        }
        break;
      case 'controller':
        controllerOnline = msg.online;
        paintControl();
        break;
      case 'control-granted':
        if (msg.granted !== granted) toast(msg.granted ? 'El anfitrión te dio control de las diapositivas' : 'Ya no tienes control de las diapositivas');
        granted = msg.granted;
        paintControl();
        break;
      case 'peer-join':
        if (camera.active && msg.peer.display) camera.connectTo(msg.peer.id);
        break;
      case 'peer-leave':
        camera.disconnect(msg.id);
        receiver?.close(msg.id);
        break;
      case 'rtc':
        if (camera.handles(msg.from) || !receiver) camera.handleSignal(msg.from, msg.data);
        else receiver.handleSignal(msg.from, msg.data);
        break;
    }
  });
}

start();
