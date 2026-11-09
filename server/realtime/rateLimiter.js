/**
 * Cubo de fichas (token bucket): permite ráfagas de `capacity` mensajes y luego
 * `refillPerSec` mensajes por segundo de forma sostenida.
 */
export class TokenBucket {
  constructor({ capacity, refillPerSec }, now = Date.now) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.now = now;
    this.last = now();
  }

  take(n = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
    this.last = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}
