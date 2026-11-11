import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOM_ID_RE } from '../../shared/protocol.js';

/** Tipos que el navegador puede mostrar en línea; todo lo demás se descarga como adjunto. */
const INLINE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
export const OFFICE_EXT = new Set(['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods']);
const FILE_RE = /^[A-Za-z0-9_-]{8,40}\.[a-z0-9]{1,5}$/;

/** Extensión segura (minúsculas, alfanumérica) a partir del nombre original. */
export function safeExt(name) {
  const ext = String(name ?? '').split('.').pop().toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) && ext !== String(name).toLowerCase() ? ext : 'bin';
}

/** Nombre visible saneado (sin rutas ni caracteres de control). */
export function safeName(name) {
  return String(name ?? 'archivo')
    .replace(/[\p{Cc}<>"\\/]/gu, '')
    .trim()
    .slice(0, 120) || 'archivo';
}

/**
 * Archivos adjuntos de cada sala: data/assets/<sala>/<aleatorio>.<ext>.
 * Se borran junto con la sala. Los nombres son aleatorios (no adivinables).
 */
export class AssetStore {
  constructor(dataDir, { maxFileBytes = 40 * 1024 * 1024, maxRoomBytes = 300 * 1024 * 1024 } = {}) {
    this.dir = path.join(dataDir, 'assets');
    this.maxFileBytes = maxFileBytes;
    this.maxRoomBytes = maxRoomBytes;
    this.secret = crypto.randomBytes(32); // firma de los permisos de subida (válidos hasta reiniciar)
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /** Permiso de subida para una sala: se entrega a quien entra a la sala. */
  tokenFor(roomId) {
    return crypto.createHmac('sha256', this.secret).update(`upload:${roomId}`).digest('base64url');
  }

  checkToken(roomId, token) {
    if (typeof token !== 'string') return false;
    const a = Buffer.from(this.tokenFor(roomId));
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  roomDir(roomId) {
    if (!ROOM_ID_RE.test(roomId)) throw new Error('Sala inválida');
    return path.join(this.dir, roomId);
  }

  filePath(roomId, file) {
    if (!FILE_RE.test(file)) return null;
    return path.join(this.roomDir(roomId), file);
  }

  url(roomId, file) {
    return `/assets/${roomId}/${file}`;
  }

  async usage(roomId) {
    let total = 0;
    try {
      for (const f of await fs.readdir(this.roomDir(roomId))) {
        total += (await fs.stat(path.join(this.roomDir(roomId), f))).size;
      }
    } catch {
      /* sin archivos aún */
    }
    return total;
  }

  /**
   * Guarda el cuerpo de una petición como archivo nuevo de la sala, respetando los límites.
   * @returns {Promise<{ file, path, size }>}
   */
  async saveStream(roomId, req, ext) {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > this.maxFileBytes) throw httpError(413, 'El archivo supera el tamaño máximo (40 MB)');
    const used = await this.usage(roomId);
    if (used + declared > this.maxRoomBytes) throw httpError(413, 'La sala alcanzó su límite de archivos (300 MB)');

    await fs.mkdir(this.roomDir(roomId), { recursive: true });
    const file = `${crypto.randomBytes(12).toString('base64url')}.${ext}`;
    const dest = path.join(this.roomDir(roomId), file);
    const handle = await fs.open(dest, 'wx');
    let size = 0;
    try {
      await new Promise((resolve, reject) => {
        const chunks = [];
        let writing = Promise.resolve();
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > this.maxFileBytes || used + size > this.maxRoomBytes) {
            req.destroy();
            reject(httpError(413, 'El archivo supera el tamaño máximo'));
            return;
          }
          chunks.push(chunk);
          writing = writing.then(() => handle.write(chunk));
        });
        req.on('end', () => writing.then(resolve, reject));
        req.on('error', reject);
        req.on('aborted', () => reject(httpError(400, 'Subida interrumpida')));
      });
    } catch (err) {
      await handle.close();
      await fs.rm(dest, { force: true });
      throw err;
    }
    await handle.close();
    if (size === 0) {
      await fs.rm(dest, { force: true });
      throw httpError(400, 'Archivo vacío');
    }
    return { file, path: dest, size };
  }

  /** Ruta nueva (aún no creada) para un archivo derivado, p. ej. el PDF convertido. */
  newPath(roomId, ext) {
    const file = `${crypto.randomBytes(12).toString('base64url')}.${ext}`;
    return { file, path: path.join(this.roomDir(roomId), file) };
  }

  /** Sirve GET /assets/<sala>/<archivo>. Devuelve true si atendió la petición. */
  async serve(req, res, pathname) {
    const m = pathname.match(/^\/assets\/([a-z0-9]{4,24})\/([^/]+)$/);
    if (!m || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    const file = this.filePath(m[1], m[2]);
    let stat = null;
    if (file) stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return true;
    }
    const ext = path.extname(file).slice(1);
    const type = INLINE_TYPES[ext];
    const headers = {
      'Content-Type': type ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'private, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };
    if (!type) {
      const name = safeName(new URL(req.url, 'http://x').searchParams.get('name') ?? m[2]);
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  }

  /** Borra todos los archivos de una sala (al cerrarse). */
  async removeRoom(roomId) {
    await fs.rm(this.roomDir(roomId), { recursive: true, force: true });
  }

  /** Salas que tienen carpeta de archivos (para limpiar huérfanas). */
  async rooms() {
    try {
      return (await fs.readdir(this.dir)).filter((d) => ROOM_ID_RE.test(d));
    } catch {
      return [];
    }
  }
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
