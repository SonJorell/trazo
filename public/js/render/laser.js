/**
 * Puntero láser: estelas brillantes que se desvanecen solas (no se guardan en la pizarra).
 * Sirve para señalar sobre la presentación sin ensuciarla.
 */
const LIFETIME_MS = 1300;

export class LaserLayer {
  constructor() {
    this.trails = new Map(); // clave → { color, pts: [{ x, y, t }] }
    this._seq = 0;
  }

  get active() {
    return this.trails.size > 0;
  }

  /** Agrega puntos a la estela `key`. `end` cierra la estela (el próximo trazo empieza otra). */
  add(key, color, points, end = false) {
    const now = performance.now();
    let trail = this.trails.get(key);
    if (!trail) {
      trail = { color, pts: [] };
      this.trails.set(key, trail);
    }
    for (const [x, y] of points) trail.pts.push({ x, y, t: now });
    if (end) {
      // Se renombra para que siga desvaneciéndose y el siguiente trazo no se una a este.
      this.trails.delete(key);
      this.trails.set(`${key}~${++this._seq}`, trail);
    }
  }

  /** Dibuja en coordenadas del mundo. Devuelve true si sigue habiendo algo que animar. */
  draw(ctx, zoom) {
    const now = performance.now();
    for (const [key, trail] of this.trails) {
      trail.pts = trail.pts.filter((p) => now - p.t < LIFETIME_MS);
      if (!trail.pts.length) {
        this.trails.delete(key);
        continue;
      }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = trail.pts;
      for (let i = 1; i < pts.length; i++) {
        const life = 1 - (now - pts[i].t) / LIFETIME_MS;
        ctx.globalAlpha = Math.max(0, life);
        ctx.strokeStyle = trail.color;
        ctx.shadowColor = trail.color;
        ctx.shadowBlur = 14 / zoom;
        ctx.lineWidth = (3 + 5 * life) / zoom;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      // Punta brillante.
      const tip = pts[pts.length - 1];
      ctx.globalAlpha = Math.max(0, 1 - (now - tip.t) / LIFETIME_MS);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 18 / zoom;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return this.active;
  }
}
