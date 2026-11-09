import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Configuración leída de variables de entorno (ver `.env.example`).
 * Se puede sobrescribir pasando un objeto parcial (útil en pruebas).
 */
export function loadConfig(overrides = {}) {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3080),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(ROOT, env.DATA_DIR ?? 'data'),
    publicDir: path.join(ROOT, 'public'),
    sharedDir: path.join(ROOT, 'shared'),
    saveDelayMs: Number(env.SAVE_DELAY_MS ?? 1000),
    maxPayloadBytes: 512 * 1024,
    rateLimit: { capacity: 200, refillPerSec: 120 },
    logLevel: env.LOG_LEVEL ?? 'info',
    ...overrides,
  };
}
