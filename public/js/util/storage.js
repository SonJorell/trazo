/**
 * Acceso seguro a localStorage/sessionStorage: puede no existir o lanzar
 * (modo privado, políticas del navegador). Nunca debe romper la app.
 */
function safe(kind) {
  const area = () => {
    try {
      return window[kind];
    } catch {
      return null;
    }
  };
  return {
    get(key, fallback = null) {
      try {
        const raw = area()?.getItem(key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        area()?.setItem(key, JSON.stringify(value));
      } catch {
        /* sin almacenamiento: se ignora */
      }
    },
    remove(key) {
      try {
        area()?.removeItem(key);
      } catch {
        /* se ignora */
      }
    },
  };
}

export const local = safe('localStorage');
export const session = safe('sessionStorage');

const RECENT_KEY = 'trazo:recent';

/** Recuerda las últimas salas visitadas (máx. 6). */
export function rememberRoom(id) {
  const list = local.get(RECENT_KEY, []).filter((r) => r.id !== id);
  list.unshift({ id, at: Date.now() });
  local.set(RECENT_KEY, list.slice(0, 6));
}

export const recentRooms = () => local.get(RECENT_KEY, []);
export const savedName = () => local.get('trazo:name', '');
export const saveName = (name) => local.set('trazo:name', name);
export const savedPin = (room) => session.get(`trazo:pin:${room}`, null);
export const savePin = (room, pin) => session.set(`trazo:pin:${room}`, pin);
export const forgetPin = (room) => session.remove(`trazo:pin:${room}`);
/** Este navegador creó la sala (es el anfitrión). */
export const markHost = (room) => local.set(`trazo:host:${room}`, true);
export const isHostOf = (room) => local.get(`trazo:host:${room}`, false) === true;
export const forgetRoom = (id) => {
  local.set(RECENT_KEY, recentRooms().filter((r) => r.id !== id));
  local.remove(`trazo:host:${id}`);
};
