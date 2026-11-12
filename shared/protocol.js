/**
 * Protocolo de mensajes WebSocket (JSON). Campo `t` = tipo de mensaje.
 *
 * Cliente → servidor
 *   join    { room, name, pin? }        Entrar a una sala.
 *   ops     { ops: Element[] }          Altas/cambios/bajas lógicas de elementos.
 *   cursor  { x, y }                    Posición del puntero en coordenadas del mundo.
 *   screen  { w, h, data }              Cuadro JPEG (data URL) de la pantalla de quien transmite.
 *   screen-stop {}                      Deja de transmitir la pantalla.
 *   control-register { key }            (PC presentador) Se registra como destino del control remoto.
 *   control-request {}                  (participante) Pide permiso para pasar diapositivas.
 *   control-grant { to, granted }       (PC presentador) Da o quita ese permiso.
 *   rtc { to, data }                    Señalización WebRTC (cámaras) dirigida a un participante.
 *   laser { pts, c, end? }              Estela del puntero láser (efímera).
 *   reaction { e }                      Emoji de reacción (de una lista permitida).
 *   page { n }                          Cambia la página/diapositiva visible (anfitrión o con permiso).
 *   view { x, y, w, h }                 (anfitrión) Zona que está mostrando: los demás pueden seguirla.
 *   timer { endsAt | null }             (anfitrión) Inicia o detiene una cuenta regresiva.
 *   poll { question, options }          (anfitrión) Abre una votación rápida.
 *   vote { option }                     (participante) Vota en la votación abierta.
 *   poll-close { clear? }               (anfitrión) Cierra (o quita) la votación.
 *   background { pattern, color, page? } Fondo de hoja (anfitrión o con permiso). Con `page`
 *                                       solo esa página; sin `page`, todas (y se borran los propios).
 *   page-title { n, title }             Título de una página (anfitrión o con permiso).
 *   role { to, role } | { all } | { default }  (anfitrión) Cambia el rol de alguien, de todos o el
 *                                       rol con que entra la gente nueva → peer-role / room-roles.
 *   role-request {}                     (visita) Pide permiso para dibujar → llega al anfitrión.
 *   avatar { mode, shape, color, figure, anchor? }  Cómo se muestra mi cámara/monigote.
 *   avatar-pos { x, y, f, w, s, p }     Posición del monigote (efímero).
 *   cam-watch { on }                    Quiero ver las cámaras de los demás → peer-watch { id, on }.
 *   page-op { op, n, to? }              Mover/duplicar/borrar una página (anfitrión o con permiso)
 *                                       → ops + page-meta { pageTitles, pageBackgrounds } + page.
 *   notes { n, text }                   (anfitrión) Notas privadas de una página; solo las reciben
 *                                       los anfitriones.
 *   stroke { id, from, pts, s? }        Trazo en vivo: puntos nuevos desde el índice `from` (efímero; llega con `by`).
 *   ping { ts } → pong { ts }           Medición de latencia.
 *   control { key, action, ... }        (celular) Orden para el PC: diapositivas o lupa.
 *
 * Servidor → cliente
 *   welcome { you, peers, elements, screen? }  Respuesta a `join` con el estado completo.
 *   screen  { from, w, h, data }        Último cuadro de la pantalla compartida.
 *   screen-stop { from }                La transmisión terminó.
 *   controller  { online }              Hay (o ya no hay) un PC que acepta control remoto.
 *   control { from, action, ... }       (solo al PC registrado) Orden validada.
 *   control-request { from, name }      (solo al PC registrado) Alguien pide control.
 *   control-granted { granted }         (al participante) Ahora puede / ya no puede pasar diapositivas.
 *   rtc { from, data }                  Señalización WebRTC de otro participante.
 *
 * `join` acepta además `hostKey` (clave que recibe quien crea la sala) y `display: true`.
 * Solo el anfitrión —quien tiene la clave— es la «presentación principal»: puede proyectar
 * (recibir cámaras), registrarse para el control remoto y transmitir su pantalla.
 *   ops     { from, ops }               Cambios aceptados de otro participante.
 *   peer-join  { peer }                 Alguien entró.
 *   peer-leave { id }                   Alguien salió.
 *   cursor  { id, x, y }                Cursor de otro participante.
 *   error   { code, message }           Error; si `code` es fatal el servidor cierra la conexión.
 */

export const MSG = Object.freeze({
  JOIN: 'join',
  OPS: 'ops',
  CURSOR: 'cursor',
  WELCOME: 'welcome',
  PEER_JOIN: 'peer-join',
  PEER_LEAVE: 'peer-leave',
  SCREEN: 'screen',
  SCREEN_STOP: 'screen-stop',
  CONTROL_REGISTER: 'control-register',
  CONTROL: 'control',
  CONTROLLER: 'controller',
  CONTROL_REQUEST: 'control-request',
  CONTROL_GRANT: 'control-grant',
  CONTROL_GRANTED: 'control-granted',
  RTC: 'rtc',
  LASER: 'laser',
  REACTION: 'reaction',
  PAGE: 'page',
  VIEW: 'view',
  TIMER: 'timer',
  POLL: 'poll',
  VOTE: 'vote',
  POLL_CLOSE: 'poll-close',
  BACKGROUND: 'background',
  PAGE_TITLE: 'page-title',
  ROLE: 'role',
  PEER_ROLE: 'peer-role',
  ROLE_REQUEST: 'role-request',
  ROOM_ROLES: 'room-roles',
  AVATAR: 'avatar',
  AVATAR_POS: 'avatar-pos',
  PAGE_OP: 'page-op',
  CAM_WATCH: 'cam-watch',
  PEER_WATCH: 'peer-watch',
  PAGE_META: 'page-meta',
  NOTES: 'notes',
  STROKE: 'stroke',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
});

/** Límites de los cuadros de pantalla compartida. */
export const SCREEN_LIMITS = Object.freeze({
  maxDataChars: 480_000, // ~360 KB de JPEG en base64
  maxSide: 10_000,
  prefix: 'data:image/jpeg;base64,',
});

/** Valida un cuadro de pantalla. Devuelve { w, h, data } o null. */
export function validateScreenFrame(msg) {
  const { w, h, data } = msg ?? {};
  const okSide = (v) => Number.isFinite(v) && v >= 1 && v <= SCREEN_LIMITS.maxSide;
  if (!okSide(w) || !okSide(h)) return null;
  if (typeof data !== 'string' || !data.startsWith(SCREEN_LIMITS.prefix)) return null;
  if (data.length > SCREEN_LIMITS.maxDataChars) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(SCREEN_LIMITS.prefix.length, SCREEN_LIMITS.prefix.length + 64))) return null;
  return { w: Math.round(w), h: Math.round(h), data };
}

export const ERR = Object.freeze({
  BAD_REQUEST: 'bad_request',
  ROOM_NOT_FOUND: 'room_not_found',
  PIN_REQUIRED: 'pin_required',
  PIN_INVALID: 'pin_invalid',
  NOT_JOINED: 'not_joined',
  RATE_LIMITED: 'rate_limited',
  ROOM_FULL: 'room_full',
  CONTROL_DENIED: 'control_denied',
  NOT_HOST: 'not_host',
  READ_ONLY: 'read_only',
  NO_CONTROLLER: 'no_controller',
});

/**
 * Control remoto: órdenes permitidas (lista blanca). Las de teclado se traducen a teclas
 * en el PC; `zoom` usa coordenadas normalizadas (0–1) de la pantalla del PC.
 */
export const CONTROL_ACTIONS = Object.freeze([
  'next', 'prev', 'first', 'last', 'black', 'white', 'start', 'end',
  'zoom', 'zoom-reset', 'share-on', 'share-off',
]);
export const KEY_STYLES = Object.freeze(['arrows', 'pages', 'space']);
/** Lo único que puede hacer un participante al que el anfitrión le dio control. */
export const GRANTED_ACTIONS = Object.freeze(['next', 'prev', 'first', 'last', 'black', 'white']);
/** Fondos de hoja disponibles. */
export const BG_PATTERNS = Object.freeze(['dots', 'grid', 'lines', 'graph', 'iso', 'music', 'blank']);
export const BG_COLORS = Object.freeze({
  white: '#ffffff',
  cream: '#fbf7ec',
  dark: '#1f2328',
  chalk: '#21412f',
  blue: '#eaf2fb',
});
export const DEFAULT_BACKGROUND = Object.freeze({ pattern: 'dots', color: 'white' });

export function validateBackground(msg) {
  if (!BG_PATTERNS.includes(msg?.pattern) || !Object.hasOwn(BG_COLORS, msg?.color)) return null;
  const out = { pattern: msg.pattern, color: msg.color };
  if (msg.page !== undefined && msg.page !== null) {
    if (!Number.isInteger(msg.page) || msg.page < 0 || msg.page > 999) return null;
    out.page = msg.page;
  }
  return out;
}

export const MAX_PAGE_TITLE = 60;

/** Título de página: texto corto sin caracteres de control (vacío = sin título). */
export function validatePageTitle(msg) {
  if (!Number.isInteger(msg?.n) || msg.n < 0 || msg.n > 999 || typeof msg.title !== 'string') return null;
  const title = msg.title.replace(/[\p{Cc}<>]/gu, '').trim().slice(0, MAX_PAGE_TITLE);
  return { n: msg.n, title };
}

/** Página (opcional) que acompaña a cursores y láser: así no se ven los de otra página. */
export const pageOf = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : undefined);

/** Trozo de trazo en vivo: puntos nuevos de un trazo que alguien está dibujando. */
export function validateStroke(msg) {
  if (typeof msg?.id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(msg.id)) return null;
  if (!Number.isInteger(msg.from) || msg.from < 0 || msg.from > 5000) return null;
  if (!Array.isArray(msg.pts) || msg.pts.length === 0 || msg.pts.length > 200) return null;
  const pts = [];
  for (const p of msg.pts) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    pts.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }
  const out = { id: msg.id, from: msg.from, pts };
  // Estilo del trazo: solo en el primer trozo (se valida como un elemento completo al recibirlo).
  if (msg.s && typeof msg.s === 'object') out.s = msg.s;
  return out;
}

/**
 * Roles de los participantes (el anfitrión siempre es «host»):
 *  - visita: mira, reacciona y vota (ideal para salas grandes o votaciones).
 *  - editor: además dibuja, escribe, adjunta, usa láser y cámara.
 *  - presentador: además pasa páginas/diapositivas y cambia fondo y títulos.
 */
export const ROLES = Object.freeze(['visita', 'editor', 'presentador']);
export const ROLE_LABELS = Object.freeze({ host: 'Anfitrión', visita: 'Visita', editor: 'Editor', presentador: 'Presentador' });
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

/** Cámara y avatar de cada persona. */
export const AVATAR_MODES = Object.freeze(['off', 'fixed', 'pointer', 'anchor', 'body']);
export const AVATAR_SHAPES = Object.freeze(['auto', 'circle', 'rounded', 'square']);
export const AVATAR_FIGURES = Object.freeze(['hombre', 'mujer', 'neutro']);
export const AVATAR_ACCESSORIES = Object.freeze(['none', 'hat', 'cap', 'glasses', 'headphones', 'crown', 'bow']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const coordOk = (v) => Number.isFinite(v) && Math.abs(v) <= 1e7;

export function validateAvatar(msg) {
  if (!AVATAR_MODES.includes(msg?.mode)) return null;
  const out = {
    mode: msg.mode,
    shape: AVATAR_SHAPES.includes(msg.shape) ? msg.shape : 'auto',
    color: HEX_RE.test(msg.color) ? msg.color : '#4263eb',
    figure: AVATAR_FIGURES.includes(msg.figure) ? msg.figure : 'neutro',
    acc: AVATAR_ACCESSORIES.includes(msg.acc) ? msg.acc : 'none',
  };
  const a = msg.anchor;
  if (a && coordOk(a.x) && coordOk(a.y)) out.anchor = { x: Math.round(a.x), y: Math.round(a.y), p: pageOf(a.p) ?? 0 };
  return out;
}

export function validateAvatarPos(msg) {
  if (!coordOk(msg?.x) || !coordOk(msg?.y)) return null;
  return {
    x: Math.round(msg.x),
    y: Math.round(msg.y),
    vx: Number.isFinite(msg.vx) ? Math.round(Math.max(-3000, Math.min(3000, msg.vx))) : 0, // velocidad (para predecir)
    vy: Number.isFinite(msg.vy) ? Math.round(Math.max(-3000, Math.min(3000, msg.vy))) : 0,
    f: msg.f === -1 ? -1 : 1, // hacia dónde mira
    w: Number.isFinite(msg.w) ? Math.round(Math.min(1, Math.max(0, msg.w)) * 100) / 100 : 0, // fase de la caminata
    m: msg.m === true, // ¿se está moviendo?
    s: msg.s === true, // ¿sentado?
    p: pageOf(msg.p) ?? 0,
  };
}

export const PAGE_OPS = Object.freeze(['move', 'duplicate', 'delete']);
export const MAX_NOTES = 4000;

export function validatePageOp(msg) {
  if (!PAGE_OPS.includes(msg?.op) || !Number.isInteger(msg.n) || msg.n < 0 || msg.n > 999) return null;
  const out = { op: msg.op, n: msg.n };
  if (msg.op === 'move') {
    if (!Number.isInteger(msg.to) || msg.to < 0 || msg.to > 999) return null;
    out.to = msg.to;
  }
  return out;
}

export function validateNotes(msg) {
  if (!Number.isInteger(msg?.n) || msg.n < 0 || msg.n > 999 || typeof msg.text !== 'string') return null;
  return { n: msg.n, text: msg.text.replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\t' ? c : '')).slice(0, MAX_NOTES) };
}

/** Valida una votación: pregunta corta y entre 2 y 6 opciones. */
export function validatePoll(msg) {
  const clean = (s, max) => (typeof s === 'string' ? s.replace(/[<>]/g, '').trim().slice(0, max) : '');
  const question = clean(msg?.question, 120);
  if (!Array.isArray(msg?.options)) return null;
  const options = msg.options.map((o) => clean(o, 30)).filter(Boolean).slice(0, 6);
  if (options.length < 2) return null;
  return { question, options };
}

/** Valida la zona que muestra el anfitrión. */
export function validateView(msg) {
  const ok = (v) => Number.isFinite(v) && Math.abs(v) <= 1e7;
  if (!ok(msg?.x) || !ok(msg?.y) || !ok(msg?.w) || !ok(msg?.h) || msg.w <= 0 || msg.h <= 0) return null;
  return { x: msg.x, y: msg.y, w: msg.w, h: msg.h };
}

export const MAX_TIMER_MS = 3 * 60 * 60 * 1000;

/** Reacciones permitidas (emojis que flotan sobre la presentación). */
/** Reacciones (íconos vectoriales, sin emojis). */
export const REACTIONS = Object.freeze(['like', 'love', 'laugh', 'wow', 'party', 'idea', 'question', 'hand']);
const LASER_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Puntero láser: trozo de estela { pts: [[x,y],...], c: color, end?: true }.
 * No se guarda en la sala: solo se reenvía y se desvanece.
 */
export function validateLaser(msg) {
  if (!Array.isArray(msg?.pts) || msg.pts.length === 0 || msg.pts.length > 64) return null;
  const pts = [];
  for (const p of msg.pts) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    if (Math.abs(p[0]) > 1e7 || Math.abs(p[1]) > 1e7) return null;
    pts.push([Math.round(p[0]), Math.round(p[1])]);
  }
  return { pts, c: LASER_COLOR_RE.test(msg.c) ? msg.c : '#ff2d55', end: msg.end === true, p: pageOf(msg.p) };
}

/** Tamaño máximo de un mensaje de señalización WebRTC (SDP o candidato). */
export const MAX_RTC_CHARS = 64_000;
export const CONTROL_KEY_RE = /^[A-Za-z0-9]{16,64}$/;

/** Valida una orden de control. Devuelve una copia limpia o null. */
export function validateControl(msg) {
  if (!msg || !CONTROL_ACTIONS.includes(msg.action)) return null;
  const out = { action: msg.action };
  if (msg.action === 'next' || msg.action === 'prev') {
    out.style = KEY_STYLES.includes(msg.style) ? msg.style : 'arrows';
  }
  if (msg.action === 'zoom') {
    const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
    if (!unit(msg.nx) || !unit(msg.ny) || !Number.isFinite(msg.scale)) return null;
    out.nx = msg.nx;
    out.ny = msg.ny;
    out.scale = Math.min(8, Math.max(1, msg.scale));
  }
  return out;
}

/** Códigos de sala: 6 caracteres sin letras ni números ambiguos. */
export const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const ROOM_ID_RE = /^[a-z0-9]{4,24}$/;
export const PIN_RE = /^[0-9]{4,8}$/;
/** Modo con el que el anfitrión crea la sala: pizarra en blanco o transmisión en directo. */
export const ROOM_MODES = Object.freeze(['blank', 'live']);
export const MAX_NAME = 24;

/** Limpia el nombre visible de un participante. */
export function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/[<>]/g, '').replace(/\p{Cc}/gu, '').trim() : '';
  return s.slice(0, MAX_NAME) || 'Invitado';
}
