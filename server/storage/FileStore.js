import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOM_ID_RE } from '../../shared/protocol.js';

/**
 * Almacén de salas en archivos JSON: `<dir>/rooms/<id>.json`.
 * Escritura atómica (archivo temporal + rename) para no corromper datos si se corta la luz.
 */
export class FileStore {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'rooms');
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  _file(id) {
    if (!ROOM_ID_RE.test(id)) throw new Error(`Código de sala inválido: ${id}`);
    return path.join(this.dir, `${id}.json`);
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

  async save(id, data) {
    const file = this._file(id);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, file);
  }
}
