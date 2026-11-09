import crypto from 'node:crypto';

const KEY_LEN = 32;

/** Calcula el hash scrypt de un PIN con una sal nueva. */
export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, KEY_LEN).toString('hex');
  return { salt, hash };
}

/** Verifica un PIN en tiempo constante. */
export function verifyPin(pin, stored) {
  if (!stored) return true;
  if (typeof pin !== 'string') return false;
  const expected = Buffer.from(stored.hash, 'hex');
  const actual = crypto.scryptSync(pin, stored.salt, KEY_LEN);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
