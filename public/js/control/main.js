import { MSG, ERR, CONTROL_KEY_RE } from '/shared/protocol.js';
import { Connection } from '../net/connection.js';
import { askJoin, fatalDialog } from '../ui/dialogs.js';
import { toast } from '../ui/toast.js';
import { api, parseRoomCode } from '../util/api.js';
import { local, savedName, saveName, savedPin, savePin, forgetPin } from '../util/storage.js';

/**
 * Control remoto desde el celular: pasa diapositivas en el PC y maneja la lupa.
 * La clave viene en el fragmento del enlace (#k=…), que el navegador no envía en la URL.
 */
const $ = (sel) => document.querySelector(sel);
const room = parseRoomCode(new URLSearchParams(location.search).get('room'));
const key = new URLSearchParams(location.hash.slice(1)).get('k') ?? '';

const statusEl = $('#ctl-status');
const setStatus = (state, text) => {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
};
$('#ctl-room').textContent = room.toUpperCase();

let connection = null;
let pcOnline = false;

function send(action, extra = {}) {
  if (!connection?.online) {
    toast('Sin conexión con el servidor');
    return;
  }
  if (!pcOnline) {
    toast('El PC presentador no está conectado: abre la app de overlay');
    return;
  }
  connection.send({ t: MSG.CONTROL, key, action, ...extra });
}

const buzz = () => navigator.vibrate?.(12);

// ---------- Diapositivas ----------
let style = local.get('trazo:ctl:style', 'arrows');
const segButtons = [...document.querySelectorAll('.ctl-seg button')];
const paintStyle = () =>
  segButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === style)));
segButtons.forEach((b) =>
  b.addEventListener('click', () => {
    style = b.dataset.style;
    local.set('trazo:ctl:style', style);
    paintStyle();
  }),
);
paintStyle();

for (const btn of document.querySelectorAll('[data-action]')) {
  btn.addEventListener('click', () => {
    buzz();
    const action = btn.dataset.action;
    send(action, action === 'next' || action === 'prev' ? { style } : {});
  });
}

// Deslizar sobre la zona grande: izquierda = siguiente, derecha = anterior.
{
  const area = $('#ctl-swipe');
  let start = null;
  area.addEventListener('pointerdown', (e) => (start = { x: e.clientX, y: e.clientY }));
  area.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      buzz();
      send(dx < 0 ? 'next' : 'prev', { style });
    }
  });
}

// ---------- Lupa ----------
const pad = $('#ctl-pad');
const preview = $('#ctl-preview');
const rectEl = $('#ctl-zoom-rect');
const levelEl = $('#ctl-zoom-level');
const zoom = { nx: 0.5, ny: 0.5, scale: 1 };
let level = 2; // zoom que se aplica al tocar
let screenRatio = 16 / 9;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function paintZoom() {
  levelEl.textContent = `${(zoom.scale > 1 ? zoom.scale : level).toFixed(1).replace('.0', '')}×`;
  rectEl.hidden = zoom.scale <= 1;
  $('#ctl-pad-hint').hidden = zoom.scale > 1;
  if (zoom.scale > 1) {
    const w = 1 / zoom.scale;
    const left = clamp(zoom.nx - w / 2, 0, 1 - w);
    const top = clamp(zoom.ny - w / 2, 0, 1 - w);
    Object.assign(rectEl.style, {
      left: `${left * 100}%`,
      top: `${top * 100}%`,
      width: `${w * 100}%`,
      height: `${w * 100}%`,
    });
  }
}

let zoomTimer = null;
let zoomPending = false;
function sendZoom() {
  paintZoom();
  if (zoomTimer) {
    zoomPending = true;
    return;
  }
  const flush = () => {
    if (zoom.scale <= 1) send('zoom-reset');
    else send('zoom', { nx: zoom.nx, ny: zoom.ny, scale: zoom.scale });
  };
  flush();
  zoomTimer = setTimeout(() => {
    zoomTimer = null;
    if (zoomPending) {
      zoomPending = false;
      flush();
    }
  }, 70);
}

const norm = (e) => {
  const r = pad.getBoundingClientRect();
  return { nx: clamp((e.clientX - r.left) / r.width, 0, 1), ny: clamp((e.clientY - r.top) / r.height, 0, 1) };
};

const pointers = new Map();
let gesture = null;
pad.addEventListener('pointerdown', (e) => {
  pad.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, norm(e));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { dist: Math.hypot(a.nx - b.nx, a.ny - b.ny), scale: zoom.scale > 1 ? zoom.scale : 1, moved: true };
  } else {
    gesture = { start: norm(e), moved: false };
  }
});
pad.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, norm(e));
  if (pointers.size === 2 && gesture.dist) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.nx - b.nx, a.ny - b.ny);
    zoom.scale = clamp(gesture.scale * (dist / gesture.dist), 1, 8);
    zoom.nx = (a.nx + b.nx) / 2;
    zoom.ny = (a.ny + b.ny) / 2;
    if (zoom.scale > 1) level = zoom.scale;
    sendZoom();
  } else if (pointers.size === 1 && gesture.start) {
    const p = norm(e);
    if (!gesture.moved && Math.hypot(p.nx - gesture.start.nx, p.ny - gesture.start.ny) < 0.02) return;
    gesture.moved = true;
    if (zoom.scale > 1) {
      zoom.nx = p.nx;
      zoom.ny = p.ny;
      sendZoom();
    }
  }
});
const endPointer = (e) => {
  const wasTap = pointers.size === 1 && gesture && !gesture.moved;
  pointers.delete(e.pointerId);
  if (wasTap && e.type === 'pointerup') {
    const p = norm(e);
    zoom.nx = p.nx;
    zoom.ny = p.ny;
    zoom.scale = zoom.scale > 1 ? zoom.scale : level;
    buzz();
    sendZoom();
  }
  if (pointers.size === 0) gesture = null;
};
pad.addEventListener('pointerup', endPointer);
pad.addEventListener('pointercancel', endPointer);

$('#ctl-zoom-in').addEventListener('click', () => {
  level = clamp(Math.round((zoom.scale > 1 ? zoom.scale : level) + 1), 2, 8);
  if (zoom.scale > 1) zoom.scale = level;
  sendZoom();
});
$('#ctl-zoom-out').addEventListener('click', () => {
  level = clamp(Math.round((zoom.scale > 1 ? zoom.scale : level) - 1), 2, 8);
  if (zoom.scale > 1) zoom.scale = level;
  sendZoom();
});
$('#ctl-zoom-reset').addEventListener('click', () => {
  buzz();
  zoom.scale = 1;
  sendZoom();
});

// Vista previa de la pantalla del PC (pide al PC que transmita).
$('#ctl-preview-toggle').addEventListener('change', (e) => send(e.target.checked ? 'share-on' : 'share-off'));

function showFrame(frame) {
  if (!frame) {
    preview.hidden = true;
    return;
  }
  screenRatio = frame.w / frame.h;
  pad.style.aspectRatio = String(screenRatio);
  preview.src = frame.data;
  preview.hidden = false;
}

// ---------- Conexión ----------
async function start() {
  if (!room || !CONTROL_KEY_RE.test(key)) {
    fatalDialog('Este enlace de control no es válido. En el PC abre el overlay, pulsa «Control remoto» y escanea el QR.');
    return;
  }
  let info;
  try {
    info = await api.getRoom(room);
  } catch (err) {
    fatalDialog(err.status === 404 ? 'La sala ya no existe. Vuelve a escanear el QR de control.' : 'No se pudo contactar con el PC.');
    return;
  }
  let name = savedName() || 'Control';
  let pin = info.hasPin ? savedPin(room) : null;
  if (info.hasPin && !pin) {
    const answer = await askJoin({ room, defaultName: name, needPin: true });
    name = answer.name;
    pin = answer.pin;
    saveName(name);
    savePin(room, pin);
  }

  connection = new Connection({ room, getJoin: () => ({ name: `${name} (control)`, pin }) });
  connection.on('status', (s) => {
    if (s !== 'online') setStatus('offline', s === 'connecting' ? 'Conectando…' : 'Sin conexión');
  });
  connection.on('message', (msg) => {
    if (msg.t === MSG.WELCOME) {
      pcOnline = msg.controller;
      showFrame(msg.screen);
    } else if (msg.t === MSG.CONTROLLER) {
      pcOnline = msg.online;
    } else if (msg.t === MSG.SCREEN) {
      showFrame(msg);
    } else if (msg.t === MSG.SCREEN_STOP) {
      showFrame(null);
      $('#ctl-preview-toggle').checked = false;
    } else if (msg.t === MSG.ERROR) {
      toast(msg.message);
      if (msg.code === ERR.NO_CONTROLLER) pcOnline = false;
    }
    if (msg.t === MSG.WELCOME || msg.t === MSG.CONTROLLER) {
      setStatus(pcOnline ? 'online' : 'waiting', pcOnline ? 'PC conectado' : 'Esperando al PC…');
    }
  });
  connection.on('fatal', async (err) => {
    if (err.code === ERR.PIN_INVALID || err.code === ERR.PIN_REQUIRED) {
      forgetPin(room);
      const answer = await askJoin({ room, defaultName: name, needPin: true, error: err.message });
      pin = answer.pin;
      savePin(room, pin);
      connection.connect();
    } else {
      fatalDialog(err.message);
    }
  });
  connection.connect();
}

paintZoom();
start();
