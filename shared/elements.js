/**
 * Modelo de elementos de la pizarra.
 * Compartido por el servidor (Node) y el cliente (navegador): no usar APIs específicas de ninguno.
 */

export const ELEMENT_TYPES = Object.freeze(['pen', 'rect', 'ellipse', 'line', 'arrow', 'text', 'note', 'image', 'doc', 'file', 'chair', 'stamp']);
/** Sellos vectoriales disponibles (ver public/js/render/stampIcons.js). */
export const STAMP_KEYS = Object.freeze(['check', 'x', 'star', 'heart', 'exclaim', 'question', 'arrow', 'warning', 'n1', 'n2', 'n3', 'n4']);

/** URL de un archivo subido a la sala: /assets/<sala>/<id>.<ext> */
export const ASSET_URL_RE = /^\/assets\/[a-z0-9]{4,24}\/[A-Za-z0-9_-]{8,40}\.[a-z0-9]{1,5}$/;
export const MAX_DOC_PAGES = 300;
export const MAX_PAGE = 999;

/** Pinceles: cambian cómo se dibuja el trazo (grosor efectivo, transparencia, brillo). */
export const BRUSHES = Object.freeze(['pen', 'marker', 'highlighter', 'neon']);
/** Multiplicador de grosor de cada pincel (también para detectar clics sobre el trazo). */
export const BRUSH_WIDTH = Object.freeze({ pen: 1, marker: 2.5, highlighter: 5, neon: 1.6 });
export const DASHES = Object.freeze(['solid', 'dashed', 'dotted']);

/** Grosor efectivo de un elemento según su pincel. */
export const effectiveWidth = (el) => (el.strokeWidth || 0) * (BRUSH_WIDTH[el.brush] ?? 1);

export const LIMITS = Object.freeze({
  maxPoints: 5000,
  maxText: 2000,
  maxCoord: 1e7,
  maxStrokeWidth: 64,
  minFontSize: 8,
  maxFontSize: 200,
  maxElementsPerRoom: 20000,
});

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const AUTHOR_RE = /^[A-Za-z0-9_-]{4,40}$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const coord = (v) => clamp(isNum(v) ? v : 0, -LIMITS.maxCoord, LIMITS.maxCoord);

/** Genera un identificador aleatorio corto. */
export function randomId(len = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** Nonce aleatorio para desempatar versiones iguales. */
export const randomNonce = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Valida y normaliza un elemento recibido. Devuelve `null` si no es válido.
 * Nunca confía en la forma del objeto de entrada: copia solo campos conocidos.
 */
export function sanitizeElement(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  if (!ELEMENT_TYPES.includes(raw.type)) return null;
  if (!isNum(raw.version) || raw.version < 1) return null;

  const el = {
    id: raw.id,
    type: raw.type,
    version: Math.floor(raw.version),
    nonce: isNum(raw.nonce) ? Math.floor(raw.nonce) : 0,
    isDeleted: raw.isDeleted === true,
    locked: raw.locked === true, // bloqueado: no se selecciona, mueve ni borra con las herramientas
    z: isNum(raw.z) ? raw.z : 0,
    x: coord(raw.x),
    y: coord(raw.y),
    stroke: COLOR_RE.test(raw.stroke) ? raw.stroke : '#1e1e1e',
    fill: raw.fill === 'transparent' || COLOR_RE.test(raw.fill) ? raw.fill : 'transparent',
    strokeWidth: clamp(isNum(raw.strokeWidth) ? raw.strokeWidth : 2, 1, LIMITS.maxStrokeWidth),
    brush: BRUSHES.includes(raw.brush) ? raw.brush : 'pen',
    dash: DASHES.includes(raw.dash) ? raw.dash : 'solid',
    opacity: clamp(isNum(raw.opacity) ? raw.opacity : 1, 0.05, 1),
    page: Number.isInteger(raw.page) ? clamp(raw.page, 0, MAX_PAGE) : 0,
  };
  if (typeof raw.author === 'string' && AUTHOR_RE.test(raw.author)) el.author = raw.author;
  // Anotación sobre una página de un documento: solo se ve cuando el documento muestra esa página.
  if (typeof raw.anchor === 'string' && ID_RE.test(raw.anchor) && Number.isInteger(raw.anchorPage)) {
    el.anchor = raw.anchor;
    el.anchorPage = clamp(raw.anchorPage, 0, MAX_DOC_PAGES - 1);
  }

  if (el.type === 'rect' || el.type === 'ellipse') {
    el.w = coord(raw.w);
    el.h = coord(raw.h);
  }

  if (el.type === 'pen' || el.type === 'line' || el.type === 'arrow') {
    if (!Array.isArray(raw.points)) return null;
    const pts = [];
    for (const p of raw.points.slice(0, LIMITS.maxPoints)) {
      if (Array.isArray(p) && isNum(p[0]) && isNum(p[1])) pts.push([coord(p[0]), coord(p[1])]);
    }
    if (pts.length === 0) return null;
    el.points = pts;
    // Flechas y líneas pegadas a formas (id de la forma en cada extremo).
    if (el.type !== 'pen') {
      if (typeof raw.startBind === 'string' && ID_RE.test(raw.startBind)) el.startBind = raw.startBind;
      if (typeof raw.endBind === 'string' && ID_RE.test(raw.endBind)) el.endBind = raw.endBind;
    }
  }

  if (el.type === 'stamp') {
    if (!STAMP_KEYS.includes(raw.icon)) return null;
    el.icon = raw.icon;
    el.w = clamp(Math.abs(coord(raw.w)) || 64, 12, 1200);
    el.h = clamp(Math.abs(coord(raw.h)) || 64, 12, 1200);
  }
  if (el.type === 'chair') {
    // Silla donde los monigotes se pueden sentar.
    el.w = clamp(Math.abs(coord(raw.w)) || 90, 30, 600);
    el.h = clamp(Math.abs(coord(raw.h)) || 110, 30, 600);
  }
  if (el.type === 'image' || el.type === 'doc' || el.type === 'file') {
    el.w = clamp(Math.abs(coord(raw.w)) || 400, 20, 20000);
    el.h = clamp(Math.abs(coord(raw.h)) || 300, 20, 20000);
    el.name = typeof raw.name === 'string' ? raw.name.replace(/[<>]/g, '').slice(0, 120) : '';
  }
  if (el.type === 'image') {
    if (typeof raw.src !== 'string' || !ASSET_URL_RE.test(raw.src)) return null;
    el.src = raw.src;
  }
  if (el.type === 'doc') {
    if (!Array.isArray(raw.pages) || !raw.pages.length) return null;
    const pages = raw.pages.slice(0, MAX_DOC_PAGES).filter((u) => typeof u === 'string' && ASSET_URL_RE.test(u));
    if (!pages.length) return null;
    el.pages = pages;
    el.docPage = Number.isInteger(raw.docPage) ? clamp(raw.docPage, 0, pages.length - 1) : 0;
    if (typeof raw.source === 'string' && ASSET_URL_RE.test(raw.source)) el.source = raw.source;
  }
  if (el.type === 'file') {
    if (typeof raw.src !== 'string' || !ASSET_URL_RE.test(raw.src)) return null;
    el.src = raw.src;
    el.size = isNum(raw.size) ? Math.max(0, Math.floor(raw.size)) : 0;
  }

  if (el.type === 'note') {
    el.text = typeof raw.text === 'string' ? raw.text.slice(0, LIMITS.maxText) : '';
    el.fontSize = clamp(isNum(raw.fontSize) ? raw.fontSize : 20, LIMITS.minFontSize, LIMITS.maxFontSize);
    el.w = clamp(Math.abs(coord(raw.w)) || 200, 60, 2000);
    el.h = clamp(Math.abs(coord(raw.h)) || 160, 40, 2000);
    if (el.fill === 'transparent') el.fill = '#ffec99';
  }

  if (el.type === 'text') {
    el.text = typeof raw.text === 'string' ? raw.text.slice(0, LIMITS.maxText) : '';
    el.fontSize = clamp(isNum(raw.fontSize) ? raw.fontSize : 24, LIMITS.minFontSize, LIMITS.maxFontSize);
    el.w = Math.abs(coord(raw.w));
    el.h = Math.abs(coord(raw.h));
  }

  return el;
}

/**
 * Regla last-writer-wins: ¿debe `incoming` reemplazar a `current`?
 * Gana la versión mayor; a igual versión, el nonce mayor (desempate determinista).
 */
export function shouldReplace(current, incoming) {
  if (!current) return true;
  if (incoming.version !== current.version) return incoming.version > current.version;
  return incoming.nonce > current.nonce;
}

/** Devuelve una copia del elemento con versión incrementada y nonce nuevo. */
export function bump(el, changes = {}) {
  return { ...el, ...changes, version: el.version + 1, nonce: randomNonce() };
}

/** Crea un elemento nuevo con los campos comunes rellenados. */
export function createElement(type, props) {
  return {
    id: randomId(),
    type,
    version: 1,
    nonce: randomNonce(),
    isDeleted: false,
    z: Date.now() + Math.random(),
    stroke: '#1e1e1e',
    fill: 'transparent',
    strokeWidth: 2,
    brush: 'pen',
    dash: 'solid',
    opacity: 1,
    x: 0,
    y: 0,
    ...props,
  };
}
