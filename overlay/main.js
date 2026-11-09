/**
 * Trazo Overlay — ventana transparente, siempre encima, para dibujar sobre la pantalla.
 *
 * - Usa el servidor de Trazo si ya está corriendo; si no, lo inicia dentro de este proceso.
 * - Modo «dibujar»: la ventana recibe el ratón. Modo «usar el PC»: los clics la atraviesan.
 * - La ventana se excluye de las capturas, así la pantalla transmitida no la duplica.
 *
 * Atajos globales:
 *   Ctrl+Shift+D  alternar dibujar / usar el PC
 *   Ctrl+Shift+X  limpiar marcas
 *   Ctrl+Shift+S  transmitir / detener pantalla
 *   Ctrl+Shift+H  ocultar / mostrar
 *   Ctrl+Shift+Q  salir
 */
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3080);
const BASE = `http://localhost:${PORT}`;
const STATE_FILE = () => path.join(app.getPath('userData'), 'overlay.json');

let win = null;
let tray = null;
let embedded = null;
let mode = 'pass';
let sharing = false;
let room = null;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- Servidor ----------
async function serverIsUp() {
  try {
    const res = await fetch(`${BASE}/api/info`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverIsUp()) return;
  const { loadConfig } = await import('../server/config.js');
  const { createApp } = await import('../server/app.js');
  embedded = await createApp(loadConfig({ port: PORT }));
  await embedded.listen();
  console.log(`Servidor de Trazo iniciado en ${BASE}`);
}

// ---------- Sala ----------
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(state));
  } catch (err) {
    console.error('No se pudo guardar el estado:', err.message);
  }
}

async function createRoom() {
  const res = await fetch(`${BASE}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`No se pudo crear la sala (${res.status})`);
  return (await res.json()).id;
}

/** Reutiliza la última sala del overlay si sigue existiendo; si no, crea una. */
async function resolveRoom(forceNew = false) {
  const argRoom = process.argv.find((a) => a.startsWith('--room='))?.slice(7);
  const candidate = forceNew ? null : (argRoom ?? readState().room);
  if (candidate) {
    const res = await fetch(`${BASE}/api/rooms/${encodeURIComponent(candidate)}`).catch(() => null);
    if (res?.ok) return candidate;
  }
  return createRoom();
}

// ---------- Ventana ----------
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    title: 'Trazo — sobre la pantalla',
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // No aparece en capturas ni en la transmisión (TRAZO_OVERLAY_CAPTURABLE=1 lo desactiva para depurar).
  win.setContentProtection(process.env.TRAZO_OVERLAY_CAPTURABLE !== '1');

  // Captura de pantalla sin diálogo: la pantalla principal.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    callback(source ? { video: source } : {});
  });

  // Solo se permite navegar dentro de Trazo.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(BASE)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadURL(`${BASE}/sala?room=${room}&overlay=1`);
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => (win = null));
}

function setMode(next) {
  mode = next === 'draw' ? 'draw' : 'pass';
  if (!win) return;
  if (mode === 'pass') {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
    if (!win.isVisible()) win.show();
    win.focus();
  }
  win.webContents.send('overlay:mode', mode);
  refreshTray();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.showInactive();
    setMode(mode);
  }
  refreshTray();
}

const command = (cmd) => win?.webContents.send('overlay:command', cmd);

async function newRoom() {
  room = await resolveRoom(true);
  writeState({ room });
  win?.loadURL(`${BASE}/sala?room=${room}&overlay=1`);
  refreshTray();
}

// ---------- Bandeja del sistema ----------
function refreshTray() {
  if (!tray) return;
  tray.setToolTip(`Trazo — sala ${room?.toUpperCase() ?? ''}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Sala ${room?.toUpperCase() ?? ''}`, enabled: false },
      { type: 'separator' },
      { label: 'Dibujar', type: 'radio', checked: mode === 'draw', accelerator: 'Ctrl+Shift+D', click: () => setMode('draw') },
      { label: 'Usar el PC', type: 'radio', checked: mode === 'pass', click: () => setMode('pass') },
      { type: 'separator' },
      { label: 'Transmitir pantalla a la sala', type: 'checkbox', checked: sharing, accelerator: 'Ctrl+Shift+S', click: () => command('share-toggle') },
      { label: 'Invitar (mostrar QR)', click: () => (setMode('draw'), command('invite')) },
      { label: 'Limpiar marcas', accelerator: 'Ctrl+Shift+X', click: () => command('clear') },
      { label: 'Nueva sala', click: () => newRoom().catch((err) => console.error(err)) },
      { type: 'separator' },
      { label: win?.isVisible() ? 'Ocultar' : 'Mostrar', accelerator: 'Ctrl+Shift+H', click: toggleVisible },
      { label: 'Salir', accelerator: 'Ctrl+Shift+Q', click: () => app.quit() },
    ]),
  );
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(HERE, 'icon.png')));
  tray.on('click', () => setMode(mode === 'draw' ? 'pass' : 'draw'));
  refreshTray();
}

// ---------- IPC ----------
ipcMain.on('overlay:ready', () => setMode(mode));
ipcMain.on('overlay:set-mode', (_e, m) => setMode(m));
ipcMain.on('overlay:set-interactive', (_e, on) => {
  if (win && mode === 'pass') win.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('overlay:sharing', (_e, on) => {
  sharing = on;
  refreshTray();
});
ipcMain.on('overlay:hide', toggleVisible);
ipcMain.on('overlay:quit', () => app.quit());

// ---------- Ciclo de vida ----------
app.on('second-instance', () => setMode('draw'));

app.whenReady().then(async () => {
  try {
    await ensureServer();
    room = await resolveRoom();
    writeState({ room });
  } catch (err) {
    console.error('No se pudo iniciar Trazo:', err);
    app.quit();
    return;
  }
  createWindow();
  setMode('pass'); // arranca dejando pasar los clics hasta que el usuario pida dibujar
  createTray();

  const shortcuts = {
    'CommandOrControl+Shift+D': () => setMode(mode === 'draw' ? 'pass' : 'draw'),
    'CommandOrControl+Shift+X': () => command('clear'),
    'CommandOrControl+Shift+S': () => command('share-toggle'),
    'CommandOrControl+Shift+H': toggleVisible,
    'CommandOrControl+Shift+Q': () => app.quit(),
  };
  for (const [accel, fn] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accel, fn)) console.warn(`Atajo ocupado por otra app: ${accel}`);
  }
  console.log(`Overlay listo. Sala: ${room.toUpperCase()} — Ctrl+Shift+D para dibujar.`);
});

let closing = false;
app.on('before-quit', (e) => {
  // Guardar las salas antes de salir si el servidor corre dentro de este proceso.
  if (!embedded || closing) return;
  e.preventDefault();
  closing = true;
  embedded.close().finally(() => app.quit());
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => app.quit());
