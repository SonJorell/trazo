/**
 * Dibujo de cámaras/avatares: cabeza (video o iniciales) con forma elegida, monigote con
 * caminata y pose sentada, y la silla.
 */
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

/** Trazado de la forma de la cabeza/burbuja centrada en (cx, cy) con radio r. */
export function headPath(ctx, cx, cy, r, shape) {
  ctx.beginPath();
  if (shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else if (shape === 'rounded' && ctx.roundRect) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.45);
  else ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

/**
 * Cabeza: el video recortado al centro (si hay) o un disco de color con iniciales.
 * @param {{ video?: HTMLVideoElement, mirror?: boolean, color, name, shape, ring? }} o
 */
export function drawHead(ctx, cx, cy, r, o) {
  const shape = o.shape === 'auto' || !o.shape ? 'circle' : o.shape;
  ctx.save();
  headPath(ctx, cx, cy, r, shape);
  ctx.save();
  ctx.clip();
  const v = o.video;
  if (v && v.readyState >= 2 && v.videoWidth) {
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    if (o.mirror) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.drawImage(v, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = o.color;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(r * 0.8)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(o.name), cx, cy + r * 0.04);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = o.ring ?? '#ffffff';
  headPath(ctx, cx, cy, r, shape);
  ctx.stroke();
  ctx.restore();
}

/** Etiqueta con el nombre (centrada en x, con la parte superior en y). */
export function drawName(ctx, x, y, name, color, size = 13) {
  ctx.save();
  ctx.font = `600 ${size}px ${FONT}`;
  const w = ctx.measureText(name).width + size;
  const hgt = size * 1.6;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y, w, hgt, hgt / 2);
  else ctx.rect(x - w / 2, y, w, hgt);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, y + hgt / 2);
  ctx.restore();
}

const darker = (hex, k = 0.65) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

export const FIGURE = { height: 160, head: 27 }; // medidas del monigote (unidades del mundo)

const TAU = Math.PI * 2;

/** Extremidad de dos tramos (muslo/pierna o brazo/antebrazo) desde (x, y) con ángulos acumulados. */
function limb(ctx, x, y, a1, l1, a2, l2) {
  const kx = x + Math.sin(a1) * l1;
  const ky = y + Math.cos(a1) * l1;
  const ex = kx + Math.sin(a1 + a2) * l2;
  const ey = ky + Math.cos(a1 + a2) * l2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(kx, ky, (kx + ex) / 2, (ky + ey) / 2); // articulación suave
  ctx.lineTo(ex, ey);
  ctx.stroke();
  return { x: ex, y: ey };
}

/**
 * Monigote con los pies en (x, y). La cabeza es la cámara (o las iniciales).
 * pose = { f: dirección (1/-1), phase: ciclo de la caminata (0–1), amp: cuánto camina (0–1),
 *          air: en el aire (0–1), lean: inclinación (-1–1), s: sentado, t: tiempo (respiración) }.
 */
export function drawFigure(ctx, x, y, pose, look) {
  const { color, figure } = look;
  const f = pose.f || 1;
  const amp = pose.amp ?? 0;
  const air = pose.air ?? 0;
  const ph = (pose.phase ?? 0) * TAU;
  const breath = Math.sin((pose.t ?? 0) * 2.2) * 1.2 * (1 - amp);
  const limbColor = darker(color, 0.72);
  const r = FIGURE.head;

  // Cadera: baja un poco en cada paso (rebote) y al estar sentado.
  const bob = Math.abs(Math.sin(ph)) * 4 * amp;
  const hip = { x, y: y - (pose.s ? 40 : 66) + bob };
  const lean = (pose.lean ?? 0) * 0.16;
  const torsoLen = 46 + breath;
  const shoulder = { x: hip.x + Math.sin(lean) * torsoLen, y: hip.y - Math.cos(lean) * torsoLen };
  const head = { x: shoulder.x + Math.sin(lean) * (r + 6), y: shoulder.y - r - 6 };

  ctx.save();
  // Sombra en el suelo (más chica en el aire).
  if (!pose.s) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 26 * (1 - air * 0.45), 6 * (1 - air * 0.45), 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const backColor = darker(color, 0.55);
  const spread = (1 - amp) * (1 - air) * 6; // de pie, las piernas se separan un poco (vista de frente)

  /** Pierna: `side` 0 = la de adelante, 1 = la de atrás. */
  const leg = (side) => {
    const p = ph + side * Math.PI;
    const hx = hip.x + (side ? -spread : spread);
    let foot;
    if (pose.s) {
      // Sentado: muslo horizontal hacia adelante y pierna hacia abajo.
      foot = limb(ctx, hx, hip.y, (Math.PI / 2) * f, 32, (-Math.PI / 2) * f, 36);
    } else {
      const thigh = Math.sin(p) * 0.55 * amp * f + air * (side ? -0.2 : 0.6) * f;
      // La rodilla se dobla al avanzar la pierna (fase de balanceo) y al saltar.
      const knee = -(Math.max(0, Math.cos(p)) * 0.95 * amp + air * 0.9) * f;
      foot = limb(ctx, hx, hip.y, thigh, 34, knee, 33);
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.ellipse(foot.x + 5 * f, foot.y - 2, 9, 5, 0, 0, TAU);
    ctx.fill();
  };

  /** Brazo: se balancea al revés que la pierna del mismo lado; arriba al saltar. */
  const arm = (side) => {
    const p = ph + (side ? 0 : Math.PI);
    const idleOut = (1 - amp) * 0.22 * (side ? -1 : 1);
    const upper = Math.sin(p) * 0.6 * amp * f + idleOut + (pose.s ? 0.5 * f : 0) + air * (side ? -2.4 : 2.4) * 0.5;
    const fore = (0.25 + 0.45 * amp) * f;
    const hand = limb(ctx, shoulder.x, shoulder.y + 6, upper, 25, fore, 23);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, 5, 0, TAU);
    ctx.fill();
  };

  // Extremidades de atrás (más oscuras), luego el cuerpo y al final las de adelante.
  ctx.strokeStyle = backColor;
  ctx.lineWidth = 11;
  leg(1);
  ctx.lineWidth = 9;
  arm(1);

  // Cabello largo (detrás)
  if (figure === 'mujer') {
    ctx.fillStyle = darker(color, 0.4);
    ctx.beginPath();
    ctx.ellipse(head.x, head.y + r * 0.45, r * 1.15, r * 1.3, 0, 0, TAU);
    ctx.fill();
  }

  // Torso: cápsula redondeada (falda acampanada para «mujer»).
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(lean);
  ctx.fillStyle = color;
  ctx.beginPath();
  const tw = figure === 'hombre' ? 34 : 30;
  if (figure === 'mujer') {
    ctx.moveTo(-tw / 2 + 2, -torsoLen);
    ctx.lineTo(tw / 2 - 2, -torsoLen);
    ctx.lineTo(tw / 2 + 10, 8);
    ctx.lineTo(-tw / 2 - 10, 8);
    ctx.closePath();
  } else if (ctx.roundRect) {
    ctx.roundRect(-tw / 2, -torsoLen - 4, tw, torsoLen + 12, tw / 2.2);
  } else {
    ctx.rect(-tw / 2, -torsoLen - 4, tw, torsoLen + 12);
  }
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = limbColor;
  ctx.lineWidth = 11;
  leg(0);
  ctx.lineWidth = 9;
  arm(0);

  // Cabello corto (hombre)
  if (figure === 'hombre') {
    ctx.fillStyle = darker(color, 0.4);
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - r * 0.5, r * 1.02, r * 0.68, 0, Math.PI, TAU);
    ctx.fill();
  }
  ctx.restore();

  drawHead(ctx, head.x, head.y, r, look);
  drawName(ctx, head.x, head.y - r - 26, look.name, look.ring ?? color, 12); // sobre la cabeza
  return head;
}

/** Silla (vista lateral): respaldo, asiento y patas. */
export function drawChair(ctx, el) {
  const { x, y, w, h } = el;
  const wood = el.fill && el.fill !== 'transparent' ? el.fill : '#a9714b';
  const seatY = y + h * 0.55;
  ctx.save();
  ctx.fillStyle = wood;
  ctx.strokeStyle = darker(wood, 0.6);
  ctx.lineWidth = 2;
  const box = (bx, by, bw, bh) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, Math.min(4, bw / 3, bh / 3));
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
  };
  box(x, y, w * 0.14, h * 0.62); // respaldo
  box(x, seatY - h * 0.06, w, h * 0.12); // asiento
  box(x + w * 0.03, seatY + h * 0.06, w * 0.1, h * 0.39); // pata trasera
  box(x + w * 0.85, seatY + h * 0.06, w * 0.1, h * 0.39); // pata delantera
  ctx.restore();
}

/** Punto donde se sienta un monigote en una silla (pies en el suelo de la silla). */
export const chairSeat = (el) => ({ x: el.x + el.w * 0.55, y: el.y + el.h, seatY: el.y + el.h * 0.49 });
