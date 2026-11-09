import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOM_ID_RE } from '../../shared/protocol.js';

/**
 * Almacén de salas en archivos JSON: `<dir>/rooms/<id>.json`.
 * - Escritura atómica (archivo temporal + rename) para no corromper datos si se corta la luz.
 * - Las operaciones sobre una misma sala se encolan: dos guardados simultáneos no chocan.
 */
export class FileStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'rooms');
    this._queues = new Map(); // id → promesa de la última operación
    this._seq = 0;
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  _file(id) {
    if (!ROOM_ID_RE.test(id)) throw new Error(`Código de sala inválido: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  /** Ejecuta `task` después de las operaciones pendientes de la misma sala. */
  _enqueue(id, task) {
    const prev = this._queues.get(id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    this._queues.set(id, next);
    next.finally(() => {
      if (this._queues.get(id) === next) this._queues.delete(id);
    }).catch(() => {});
    return next;
  }

  async exists(id) {
    try {
      await fs.access(this._file(id));
      return true;
    } catch {
      return false;
    }
  }

  async load(id) {
    try {
      return JSON.parse(await fs.readFile(this._file(id), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async list() {
    const files = await fs.readdir(this.dir).catch(() => []);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .filter((id) => ROOM_ID_RE.test(id));
  }

  delete(id) {
    const file = this._file(id);
    return this._enqueue(id, () => fs.rm(file, { force: true }));
  }

  save(id, data) {
    const file = this._file(id);
    const json = JSON.stringify(data);
    return this._enqueue(id, async () => {
      const tmp = `${file}.${process.pid}.${++this._seq}.tmp`;
      await fs.writeFile(tmp, json);
      await fs.rename(tmp, file);
    });
  }
}
