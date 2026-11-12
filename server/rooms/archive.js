import fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeElement, ASSET_URL_RE } from '../../shared/elements.js';
import { validateBackground, validatePageTitle, validateNotes } from '../../shared/protocol.js';
import { httpError } from '../assets/AssetStore.js';

/**
 * Archivo de sala «.trazo»: un JSON con las páginas, fondos, títulos, notas del presentador,
 * los elementos vivos y los adjuntos incrustados en base64. Sirve para guardar una sala antes
 * de que se cierre y reabrirla después (en este u otro PC) como sala nueva.
 */
export const ARCHIVE_FORMAT = 'trazo-sala';
export const ARCHIVE_VERSION = 1;
/** Tamaño máximo de un archivo .trazo que se acepta al abrirlo. */
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const FILE_RE = /^[A-Za-z0-9_-]{8,40}\.[a-z0-9]{1,5}$/;

/** URLs de adjuntos que usan los elementos (imágenes, documentos y sus páginas, archivos). */
export function assetUrls(elements) {
  const urls = new Set();
  for (const el of elements) {
    for (const u of [el.src, el.source, ...(el.pages ?? [])]) if (typeof u === 'string' && ASSET_URL_RE.test(u)) urls.add(u);
  }
  return urls;
}

/** Arma el archivo de una sala (solo elementos vigentes: los borrados no hacen falta). */
export async function exportRoom(room, assets) {
  const elements = room.snapshot().filter((el) => !el.isDeleted);
  const files = {};
  for (const url of assetUrls(elements)) {
    const file = url.split('/').pop();
    const p = assets?.filePath(room.id, file);
    if (!p) continue;
    const data = await fs.readFile(p).catch(() => null);
    if (data) files[file] = data.toString('base64');
  }
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    room: {
      page: room.page,
      background: room.background,
      pageBackgrounds: room.pageBackgrounds,
      pageTitles: room.pageTitles,
      notes: room.notes,
      defaultRole: room.defaultRole,
    },
    elements,
    files,
  };
}

/**
 * Crea una sala nueva a partir de un archivo. Los adjuntos se copian a la carpeta de la sala
 * nueva con el mismo nombre y las URLs de los elementos se re-apuntan a ella.
 * @returns {Promise<import('./Room.js').Room>} la sala creada (con `issuedHostKey`)
 */
export async function importRoom(rooms, assets, archive) {
  if (!archive || archive.format !== ARCHIVE_FORMAT || !Number.isInteger(archive.version)) {
    throw httpError(400, 'No es un archivo de sala de Trazo');
  }
  if (archive.version > ARCHIVE_VERSION) throw httpError(400, 'El archivo es de una versión más nueva de Trazo');
  if (!Array.isArray(archive.elements)) throw httpError(400, 'El archivo de sala está dañado');

  const room = await rooms.create({ mode: 'blank' });
  try {
    const files = archive.files && typeof archive.files === 'object' ? archive.files : {};
    const kept = new Set();
    if (assets) {
      let total = 0;
      const dir = assets.roomDir(room.id);
      for (const [file, b64] of Object.entries(files)) {
        if (!FILE_RE.test(file) || typeof b64 !== 'string') continue;
        const data = Buffer.from(b64, 'base64');
        total += data.length;
        if (data.length > assets.maxFileBytes || total > assets.maxRoomBytes) throw httpError(413, 'Los adjuntos superan el límite de la sala');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, file), data, { flag: 'wx' });
        kept.add(file);
      }
    }
    const remap = (u) => {
      if (typeof u !== 'string' || !ASSET_URL_RE.test(u)) return u;
      const file = u.split('/').pop();
      return kept.has(file) ? `/assets/${room.id}/${file}` : null;
    };
    const ops = [];
    for (const raw of archive.elements) {
      if (!raw || typeof raw !== 'object') continue;
      const el = { ...raw };
      if ('src' in el) el.src = remap(el.src);
      if ('source' in el) el.source = remap(el.source) ?? undefined;
      if (Array.isArray(el.pages)) el.pages = el.pages.map(remap).filter(Boolean);
      const clean = sanitizeElement(el);
      if (clean && !clean.isDeleted) ops.push(clean);
    }
    for (const el of ops) room.elements.set(el.id, el);

    const meta = archive.room ?? {};
    if (Number.isInteger(meta.page) && meta.page >= 0) room.page = meta.page;
    if (meta.background && typeof meta.background === 'object') room.background = sanitizeBackground(meta.background) ?? room.background;
    room.pageBackgrounds = pageMap(meta.pageBackgrounds, sanitizeBackground);
    room.pageTitles = pageMap(meta.pageTitles, (t) => validatePageTitle({ n: 0, title: t })?.title);
    room.notes = pageMap(meta.notes, (t) => validateNotes({ n: 0, text: t })?.text);
    if (['visita', 'editor', 'presentador'].includes(meta.defaultRole)) room.defaultRole = meta.defaultRole;
    room.onChange(room);
    return room;
  } catch (err) {
    // Si algo falla, no queda una sala a medias.
    await rooms.discard?.(room.id);
    throw err;
  }
}

function sanitizeBackground(bg) {
  const v = validateBackground({ pattern: bg?.pattern, color: bg?.color });
  return v ? { pattern: v.pattern, color: v.color } : null;
}

function pageMap(obj, fn) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (!/^\d{1,4}$/.test(k)) continue;
    const val = fn(v);
    if (val !== null && val !== undefined && val !== '') out[k] = val;
  }
  return out;
}
