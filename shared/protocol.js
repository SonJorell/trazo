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
