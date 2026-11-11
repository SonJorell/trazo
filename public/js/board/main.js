import { createElement } from '/shared/elements.js';
import { hitTest } from '/shared/geometry.js';
import { Scene } from '../core/scene.js';
import { History, Transaction } from '../core/history.js';
import { Viewport } from '../core/viewport.js';
import { Renderer } from '../render/renderer.js';
import { measureText, LINE_HEIGHT, drawElement } from '../render/draw.js';
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
  backgroundDialog,
} from '../ui/dialogs.js';
import { CameraSender, CameraReceiver } from '../media/cameras.js';
import { CameraBubbles } from '../ui/cameraBubbles.js';
import { Reactions } from '../ui/reactions.js';
import { LaserLayer } from '../render/laser.js';
import { exportPdf } from '../render/exportPdf.js';
import { LiveStrokes } from '../net/liveStrokes.js';
import { onAssetLoad } from '../render/assets.js';
import { drawPattern, paperColors, PATTERN_LABELS, COLOR_LABELS } from '../render/background.js';
import { setupAttachments } from '../attach/attachments.js';
import { createDocBar } from '../attach/docBar.js';
import { createClipboard } from '../core/clipboard.js';
import { setupParticipants } from '../ui/participants.js';
import { Avatars } from '../avatars/avatars.js';
import { avatarDialog } from '../avatars/dialog.js';
import { getBounds } from '/shared/geometry.js';
import { NOTE_PADDING } from '../render/draw.js';
import { setupSession } from '../session/session.js';
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
    window.history.replaceState(null, '', location.pathname + location.search);
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
  stamp: '✓',
  noteColor: '#ffec99',
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
const live = new LiveStrokes();
const renderer = new Renderer(canvas, { scene, viewport, overlay, transparent: OVERLAY, live });
const render = () => renderer.requestRender();
onAssetLoad(render);
// Gancho para las pruebas de punta a punta (?e2e=1): permite inspeccionar la escena.
if (params.has('e2e')) window.__trazo = { scene, live, viewport };
scene.on('live', render);
// Al cambiar de página no queda seleccionado nada de la página anterior.
scene.on('page', () => {
  if (overlay.selection.size) ctx.select([]);
  paintBackground();
});
// Fondo de hoja: uno general y, opcionalmente, uno propio por página (igual para todos).
let background = { pattern: 'dots', color: 'white' };
let pageBackgrounds = {};
const backgroundFor = (page) => pageBackgrounds[String(page)] ?? background;
let uploadToken = null;
if (!OVERLAY) {
  viewport.x = -renderer.width / 2;
  viewport.y = -renderer.height / 2;
}

let roomHasPin = false;
let steerGranted = false; // el anfitrión me dejó pasar diapositivas / cambiar de página
let overlaySession = null;
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
  /** Propiedades de trazo actuales para crear un elemento nuevo (anclado si se dibuja sobre un documento). */
  strokeProps: (p) => ({
    ...anchorAt(p),
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    brush: style.brush,
    dash: style.dash,
    opacity: style.opacity,
    author: AUTHOR_ID,
    page: scene.page,
  }),
  render,
  /** Doble toque en un adjunto: documento/imagen → encuadrar; archivo → descargar. */
  openMedia(el) {
    if (el.type === 'file') {
      const a = h('a', { href: `${el.src}?name=${encodeURIComponent(el.name || 'archivo')}`, download: el.name || 'archivo' });
      document.body.append(a);
      a.click();
      a.remove();
    } else focusElement(el);
  },
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
    if (el?.type === 'note') {
      overlay.editingId = el.id;
      textEditor.open({
        id: el.id,
        note: true,
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h,
        padding: NOTE_PADDING,
        text: el.text,
        fontSize: el.fontSize,
        color: el.stroke,
      });
    } else if (el) {
      overlay.editingId = el.id;
      textEditor.open({ id: el.id, x: el.x, y: el.y, text: el.text, fontSize: el.fontSize, color: el.stroke });
    } else {
      const y = p.y - (style.fontSize * LINE_HEIGHT) / 2;
      textEditor.open({ id: null, x: p.x, y, text: '', fontSize: style.fontSize, color: style.stroke });
    }
    render();
  },
};

/** Documento bajo el punto: lo que se dibuje ahí queda anclado a su página actual. */
function anchorAt(p) {
  if (!p) return {};
  const list = scene.alive();
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    if (el.type !== 'doc') continue;
    const b = getBounds(el);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { anchor: el.id, anchorPage: el.docPage ?? 0 };
  }
  return {};
}

/** Encuadra un elemento en la pantalla. */
function focusElement(el) {
  if (OVERLAY) return;
  followScreen = false;
  viewport.fit(getBounds(el), renderer.width, renderer.height, 40, 4);
  afterViewChange();
}

const clipboard = createClipboard({
  scene,
  begin: () => ctx.begin(),
  select: (ids) => {
    if (tool.name !== 'select') setTool('select');
    ctx.select(ids);
  },
});
const docBar = createDocBar({ scene, viewport, ctx, onFit: (el) => focusElement(el) });
renderer.onDraw = () => docBar.update();

// ---------- Texto ----------
const textEditor = new TextEditor($('#editor-layer'), {
  viewport,
  onCommit({ id, x, y, text, fontSize, color, note }) {
    overlay.editingId = null;
    const tx = ctx.begin();
    if (note) {
      if (scene.get(id) && scene.get(id).text !== text) tx.update(id, { text });
    } else if (id) {
      if (!scene.get(id)) return render();
      if (!text) tx.update(id, { isDeleted: true });
      else tx.update(id, { text, ...measureText(text, fontSize) });
    } else if (text) {
      const el = createElement('text', {
        x,
        y,
        text,
        fontSize,
        ...ctx.strokeProps({ x, y }),
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

/** Las visitas solo pueden mover la vista (y reaccionar/votar desde sus botones). */
let readOnly = false;
function setTool(name) {
  if (readOnly && name !== 'hand') name = 'hand';
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
  h('button', {
    class: 'tool',
    id: 'attach-btn',
    title: 'Adjuntar foto, PDF, PowerPoint o archivo (también puedes arrastrarlo o pegarlo)',
    'aria-label': 'Adjuntar archivo',
    html: ICONS.attach,
    onclick: () => attachments.pick(),
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
  if (partial.stamp) return setTool('stamp');
  if (partial.noteColor) return setTool('note');
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
  $('#dup-btn').hidden = overlay.selection.size === 0;
  // La barra del documento sigue al último documento seleccionado.
  if (overlay.selection.size === 1) {
    const el = scene.get([...overlay.selection][0]);
    docBar.setActive(el?.type === 'doc' ? el.id : null);
  } else if (overlay.selection.size > 1) docBar.setActive(null);
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
  const ok = await exportPng(scene, `trazo-${room}.png`, backgroundFor(scene.page));
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
  $('#dup-btn').hidden = overlay.selection.size === 0;
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
bind('#dup-btn', 'copy', () => clipboard.duplicate(overlay.selection));
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
const menuItem = (icon, label, fn, extraClass = '') =>
  h('button', { class: `menu-item ${extraClass}`, onclick: () => ((menu.hidden = true), fn()) }, h('span', { html: ICONS[icon] }), label);
let openParticipants = () => {};
const participantsItem = menuItem('users', 'Participantes y permisos', () => openParticipants());
let openAvatarDialog = () => {};
const avatarItem = menuItem('camera', 'Mi cámara y avatar (monigote)', () => openAvatarDialog());
avatarItem.classList.add('needs-edit');

/** Para el modo «en un lugar de la pizarra»: el próximo toque ubica la cámara. */
function placeAnchorOnce() {
  const done = toast('Toca la pizarra donde quieres dejar tu cámara', { sticky: true });
  const onDown = (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    canvas.removeEventListener('pointerdown', onDown, true);
    done();
    const rect = canvas.getBoundingClientRect();
    const p = viewport.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    avatars?.setLook({ mode: 'anchor', anchor: { x: Math.round(p.x), y: Math.round(p.y), p: scene.page } });
    toast('Listo: tu cámara quedó en ese lugar');
  };
  canvas.addEventListener('pointerdown', onDown, true);
}
participantsItem.hidden = true;
menu.append(
  menuItem('home', 'Inicio', () => (location.href = '/')),
  menuItem('download', 'Exportar imagen PNG', doExport),
  menuItem('fit', 'Ajustar a la pantalla', fitToContent),
  menuItem('pdf', 'Exportar PDF (todas las páginas)', async () => {
    const ok = await exportPdf(scene, `trazo-${room}.pdf`, { backgroundFor, titleFor: (n) => session?.titleOf(n) ?? '' });
    if (!ok) toast('La pizarra está vacía');
  }),
  menuItem('attach', 'Adjuntar archivo (foto, PDF, PowerPoint…)', () => attachments.pick(), 'needs-edit'),
  menuItem('paper', 'Fondo de la hoja', openBackgroundDialog, 'needs-edit'),
  participantsItem,
  avatarItem,
  menuItem('simple', 'Modo simple (celular)', () => setSimple(!document.body.classList.contains('simple'))),
  menuItem('eraser', 'Borrar mis trazos', clearMine, 'needs-edit'),
  menuItem('trash', 'Limpiar pizarra', () => clearBoard(), 'needs-edit'),
);

// ---------- Pantalla compartida en vivo (fondo) ----------
let stopMyCamera = () => {};
let getSelfVideo = () => null;
let camBubbles = null; // burbujas de cámaras (solo en la presentación principal)
let avatars = null;
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

/** Zona que muestra el anfitrión (o la pantalla transmitida): lo que «seguir» encuadra. */
let presenterView = null;
function followTarget() {
  if (presenterView) return presenterView;
  const s = overlay.screen;
  return s ? { x: 0, y: 0, w: s.w, h: s.h } : null;
}

function fitScreen() {
  const target = followTarget();
  if (!target) return;
  viewport.fitInto(target, screenBox());
  afterViewChange();
  paintFollow();
}

const followBtn = $('#follow-btn');
function paintFollow() {
  followBtn.hidden = OVERLAY || !followTarget() || followScreen;
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
let session = null;
const timerItem = menuItem('timer', 'Temporizador', () => session?.timerDialog());
const pollItem = menuItem('poll', 'Votación rápida', () => session?.pollDialog());
timerItem.hidden = true;
pollItem.hidden = true;
menu.insertBefore(pollItem, menu.children[1]);
menu.insertBefore(timerItem, menu.children[1]);

/** Modo simple: solo las herramientas esenciales para anotar desde el celular. */
function setSimple(on) {
  document.body.classList.toggle('simple', on);
  local.set('trazo:simple', on);
  if (on && !['pen', 'laser', 'eraser', 'note', 'stamp'].includes(tool.name)) setTool('pen');
}

followBtn.innerHTML = `${ICONS.follow}<span>Seguir</span>`;
followBtn.addEventListener('click', () => {
  followScreen = true;
  fitScreen();
});
const requestItem = menuItem('hand', 'Pedir pasar diapositivas', () => requestControl());
requestItem.hidden = true;
menu.insertBefore(requestItem, menu.children[1]);

$('#room-code').textContent = room.toUpperCase();
document.title = `Trazo · ${room.toUpperCase()}`;
updateHistoryButtons();
afterViewChange();

// ---------- Adjuntos y fondo de hoja ----------
const attachments = setupAttachments({
  room,
  getToken: () => uploadToken,
  ctx,
  viewport,
  getViewSize: () => (OVERLAY ? { width: window.innerWidth, height: window.innerHeight } : { width: renderer.width, height: renderer.height }),
  goToPage: (n) => session?.goTo(n),
  canEdit: () => !readOnly,
  onPasteElements: () => clipboard.size > 0 && clipboard.paste() > 0,
  select: (ids) => {
    if (tool.name !== 'select') setTool('select');
    ctx.select(ids);
  },
});

let canEditBackground = () => false;
function paintBackground() {
  const bg = backgroundFor(scene.page);
  renderer.setBackground(bg);
  document.body.dataset.paper = bg.color;
  stylePanel.refresh(); // la vista previa del trazo usa el color del papel
}
/** Aplica un fondo recibido (o elegido): de una página o de todas. */
function applyBackground(bg) {
  const clean = { pattern: bg.pattern, color: bg.color };
  if (Number.isInteger(bg.page)) pageBackgrounds = { ...pageBackgrounds, [String(bg.page)]: clean };
  else {
    background = clean;
    pageBackgrounds = {};
  }
  paintBackground();
}

/** Miniatura de una página (con su fondo) para la vista de páginas. */
function paintPageThumb(cnv, page) {
  const c2d = cnv.getContext('2d');
  const bg = backgroundFor(page);
  c2d.fillStyle = paperColors(bg).paper;
  c2d.fillRect(0, 0, cnv.width, cnv.height);
  const els = scene.allAlive().filter((el) => (el.page ?? 0) === page && scene.anchorVisible(el));
  let box = null;
  for (const el of els) {
    const b = getBounds(el);
    box = box
      ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), r: Math.max(box.r, b.x + b.w), b: Math.max(box.b, b.y + b.h) }
      : { x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h };
  }
  if (!box) box = { x: -400, y: -250, r: 400, b: 250 };
  const pad = 24;
  const s = Math.min(cnv.width / (box.r - box.x + pad * 2), cnv.height / (box.b - box.y + pad * 2));
  const ox = (cnv.width - (box.r - box.x) * s) / 2 - box.x * s;
  const oy = (cnv.height - (box.b - box.y) * s) / 2 - box.y * s;
  c2d.setTransform(s, 0, 0, s, ox, oy);
  drawPattern(c2d, { x: -ox / s, y: -oy / s, w: cnv.width / s, h: cnv.height / s }, s, bg);
  for (const el of els) drawElement(c2d, el);
  c2d.setTransform(1, 0, 0, 1, 0, 0);
}

/** Miniatura de un fondo para el selector. */
function paintBackgroundPreview(cnv, bg) {
  const c2d = cnv.getContext('2d');
  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.fillStyle = paperColors(bg).paper;
  c2d.fillRect(0, 0, cnv.width, cnv.height);
  const zoom = 0.5;
  c2d.setTransform(zoom, 0, 0, zoom, 0, 0);
  drawPattern(c2d, { x: 0, y: 0, w: cnv.width / zoom, h: cnv.height / zoom }, 1.4, bg);
}

function openBackgroundDialog() {
  backgroundDialog({
    current: backgroundFor(scene.page),
    page: scene.page,
    pageHasOwn: Boolean(pageBackgrounds[String(scene.page)]),
    patterns: PATTERN_LABELS,
    colors: COLOR_LABELS,
    paint: paintBackgroundPreview,
    canEdit: canEditBackground(),
    onPick: (bg, onlyThisPage) => {
      const msg = onlyThisPage ? { ...bg, page: scene.page } : { pattern: bg.pattern, color: bg.color };
      applyBackground(msg);
      sync?.conn.send({ t: 'background', ...msg });
    },
  });
}

// ---------- Teclado ----------
const TOOL_KEYS = new Map(TOOL_DEFS.map((d) => [d.key, d.name]));
window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (readOnly && e.code !== 'Space') return; // visitas: sin atajos de edición
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
  } else if (mod && key === 'c' && overlay.selection.size) {
    e.preventDefault();
    toast(`Copiado (${clipboard.copy(overlay.selection)})`, { ms: 1200 });
  } else if (mod && key === 'x' && overlay.selection.size) {
    e.preventDefault();
    clipboard.copy(overlay.selection);
    deleteSelection();
  } else if (mod && key === 'd' && overlay.selection.size) {
    e.preventDefault();
    clipboard.duplicate(overlay.selection);
  } else if (mod && key === 'a') {
    e.preventDefault();
    setTool('select');
    ctx.select(scene.alive().map((el) => el.id));
  } else if (key === 'delete' || key === 'backspace') {
    deleteSelection();
  } else if (key === 'escape') {
    ctx.select([]);
  } else if (!mod && docBar.active && ['arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(key)) {
    e.preventDefault();
    docBar.turn(key === 'arrowleft' || key === 'pageup' ? -1 : 1);
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
  onCursor: (p) => {
    sync?.sendCursor(p);
    avatars?.setPointer(p);
  },
  isSpaceDown: () => spaceDown,
  lockView: OVERLAY,
  onUserView: () => {
    if (followScreen) {
      followScreen = false;
      paintFollow();
    }
  },
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
  const connection = new Connection({ room, getJoin: () => ({ name, pin, hostKey, display: isDisplay, clientId: AUTHOR_ID }) });
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
  // Roles: visita (mira, reacciona, vota), editor y presentador. El anfitrión los administra.
  const participants = setupParticipants({
    connection,
    presence,
    isHost: () => isHost,
    onRoleChange: (role) => {
      readOnly = role === 'visita';
      avatars?.setEnabled(!readOnly);
      if (readOnly) {
        setTool('hand');
        $('#style-panel').classList.remove('open');
        stopMyCamera();
        if (textEditor.active) textEditor.commit();
      } else if (tool.name === 'hand' && !OVERLAY) setTool('pen');
    },
  });
  participantsItem.hidden = !isHost;

  // Cámaras y monigotes de cada persona.
  avatars = new Avatars({
    scene,
    viewport,
    overlay,
    render,
    toast,
    send: (msg) => connection.send(msg),
    getMe: () => presence.me,
    getPeers: () => presence.peers,
    getFloor: () => {
      const view = presenterView ?? (OVERLAY ? viewport.visibleRect(window.innerWidth, window.innerHeight) : viewport.visibleRect(renderer.width, renderer.height));
      return { y: view.y + view.h - 12, view };
    },
    onLookChange: (id, look) => camBubbles?.setLook(id, look),
    addChair: (el) => {
      const tx = ctx.begin();
      tx.add({ ...el, page: scene.page, author: AUTHOR_ID });
      tx.commit();
    },
  });
  avatars.videoFor = (id) => camBubbles?.videoOf(id) ?? null;
  avatars.selfVideo = () => getSelfVideo();
  renderer.avatars = avatars;
  if (window.__trazo) window.__trazo.avatars = avatars;
  connection.on('message', (msg) => avatars.handle(msg));
  openAvatarDialog = () => {
    if (readOnly) return toast('Como visita no puedes mostrar tu cámara ni un monigote');
    avatarDialog({ avatars, cameraOn: Boolean(getSelfVideo()), onPlaceAnchor: placeAnchorOnce });
  };
  openParticipants = () => participants.open();
  $('#presence').addEventListener('click', () => isHost && participants.open());
  const latencyEl = $('#latency');
  sync = new Sync({
    scene,
    connection,
    presence,
    live,
    onLatency: (ms) => {
      if (!latencyEl) return;
      latencyEl.hidden = ms === null;
      latencyEl.textContent = ms === null ? '' : `${ms} ms`;
      latencyEl.dataset.level = ms === null ? '' : ms < 80 ? 'good' : ms < 200 ? 'ok' : 'bad';
      latencyEl.title = ms === null ? '' : `Latencia con el servidor: ${ms} ms (ida y vuelta)`;
    },
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
    if (msg.t === 'welcome') {
      myColor = msg.you.color;
      uploadToken = msg.uploadToken ?? null;
      if (msg.background) background = msg.background;
      pageBackgrounds = msg.pageBackgrounds ?? {};
      paintBackground();
    }
    if (msg.t === 'background') applyBackground(msg);
  });
  canEditBackground = () => isHost || steerGranted;

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
        goToPage: (n) => overlaySession?.goTo(n),
        currentPage: () => scene.page,
        timerDialog: () => overlaySession?.timerDialog(),
        pollDialog: () => overlaySession?.pollDialog(),
        invite: () => shareDialog({ room, hasPin: roomHasPin }),
        commitText: () => textEditor.active && textEditor.commit(),
      },
    });
  }

  setupCamerasAndControl({ connection, presence, isDisplay });

  // Páginas, temporizador y votación.
  session = setupSession({
    connection,
    scene,
    canSteer: () => isHost || steerGranted,
    isHost: () => isHost,
    paintThumb: paintPageThumb,
  });
  timerItem.hidden = !isHost;
  pollItem.hidden = !isHost;
  overlaySession = session;

  // Modo simple por defecto en celulares de participantes (se puede cambiar en el menú).
  const simplePref = local.get('trazo:simple', null);
  setSimple(simplePref ?? (!isHost && isNarrow()));

  // El anfitrión comparte qué zona está mostrando; los demás pueden seguirla.
  if (isHost) {
    let lastView = '';
    setInterval(() => {
      if (!connection.online) return;
      const r = OVERLAY
        ? viewport.visibleRect(window.innerWidth, window.innerHeight)
        : viewport.visibleRect(renderer.width, renderer.height);
      const view = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
      const key = JSON.stringify(view);
      if (key !== lastView) {
        lastView = key;
        connection.send({ t: 'view', ...view });
      }
    }, 300);
    connection.on('message', (msg) => msg.t === 'welcome' && (lastView = ''));
  } else {
    connection.on('message', (msg) => {
      if ((msg.t === 'welcome' && msg.view) || msg.t === 'view') {
        presenterView = msg.t === 'view' ? { x: msg.x, y: msg.y, w: msg.w, h: msg.h } : msg.view;
        if (followScreen) fitScreen();
        else paintFollow();
      }
    });
  }

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
    camBubbles = bubbles;
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
  $('#cam-look').innerHTML = ICONS.smile;
  $('#cam-look').addEventListener('click', () => openAvatarDialog());
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
    if (readOnly) return toast('Como visita no puedes encender la cámara');
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
  stopMyCamera = () => camera.active && camera.stop();
  getSelfVideo = () => (camera.active ? selfVideo : null);

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
        granted = Boolean(msg.canSteer) && !msg.you.host;
        steerGranted = granted;
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
        steerGranted = granted;
        paintControl();
        session?.paintPages();
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
