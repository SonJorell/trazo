/**
 * Protocolo de mensajes WebSocket (JSON). Campo `t` = tipo de mensaje.
 *
 * Cliente → servidor
 *   join    { room, name, pin? }        Entrar a una sala.
 *   ops     { ops: Element[] }          Altas/cambios/bajas lógicas de elementos.
 *   cursor  { x, y }                    Posición del puntero en coordenadas del mundo.
 *   screen  { w, h, data }              Cuadro JPEG (data URL) de la pantalla de quien transmite.
 *   screen-stop {}                      Deja de transmitir la pantalla.
 *
 * Servidor → cliente
 *   welcome { you, peers, elements, screen? }  Respuesta a `join` con el estado completo.
 *   screen  { from, w, h, data }        Último cuadro de la pantalla compartida.
 *   screen-stop { from }                La transmisión terminó.
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
});

/** Códigos de sala: 6 caracteres sin letras ni números ambiguos. */
export const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const ROOM_ID_RE = /^[a-z0-9]{4,24}$/;
export const PIN_RE = /^[0-9]{4,8}$/;
export const MAX_NAME = 24;

/** Limpia el nombre visible de un participante. */
export function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/[<>]/g, '').replace(/\p{Cc}/gu, '').trim() : '';
  return s.slice(0, MAX_NAME) || 'Invitado';
}
