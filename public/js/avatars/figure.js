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

export const FIGURE = { height: 150, head: 28 }; // medidas del monigote (unidades del mundo)

/**
 * Monigote con los pies en (x, y). pose = { f: dirección, w: fase de caminata, m: se mueve, s: sentado }.
 * La cabeza es la cámara (o las iniciales).
 */
export function drawFigure(ctx, x, y, pose, look) {
  const { color, figure } = look;
  const hair = darker(color, 0.45);
  const r = FIGURE.head;
  const swing = pose.m && !pose.s ? Math.sin(pose.w * Math.PI * 2) * 0.6 : 0;
  const hip = { x, y: y - (pose.s ? 46 : 62) };
  const neck = { x, y: hip.y - 50 };
  const head = { x, y: neck.y - r - 2 };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const limb = darker(color, 0.78); // brazos y piernas un poco más oscuros que la ropa
  ctx.strokeStyle = limb;
  ctx.lineWidth = 9;

  // Piernas
  const leg = (angle, back) => {
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    if (pose.s) {
      // Sentado: muslo hacia adelante y pierna hacia abajo.
      const kx = hip.x + pose.f * 40;
      ctx.lineTo(kx, hip.y + (back ? 2 : 0));
      ctx.lineTo(kx + pose.f * 4, y);
    } else {
      ctx.lineTo(hip.x + Math.sin(angle) * 34, hip.y + Math.cos(angle) * 62);
    }
    ctx.stroke();
  };
  ctx.globalAlpha = 0.85;
  leg(-swing, true);
  ctx.globalAlpha = 1;
  leg(swing, false);

  // Cabello largo (detrás de la cabeza)
  if (figure === 'mujer') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y + r * 0.35, r * 1.18, r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cuerpo: vestido (mujer) o torso
  if (figure === 'mujer') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(neck.x - 10, neck.y + 4);
    ctx.lineTo(neck.x + 10, neck.y + 4);
    ctx.lineTo(hip.x + 30, hip.y + 14);
    ctx.lineTo(hip.x - 30, hip.y + 14);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = figure === 'hombre' ? 16 : 11;
    ctx.beginPath();
    ctx.moveTo(neck.x, neck.y + 4);
    ctx.lineTo(hip.x, hip.y);
    ctx.stroke();
    ctx.lineWidth = 9;
  }
  ctx.strokeStyle = limb;

  // Brazos (se balancean al caminar; saludan un poco cuando está quieto)
  const arm = (angle) => {
    ctx.beginPath();
    ctx.moveTo(neck.x, neck.y + 10);
    ctx.lineTo(neck.x + Math.sin(angle) * 36, neck.y + 10 + Math.cos(angle) * 40);
    ctx.stroke();
  };
  arm(0.95 + swing * 0.7);
  arm(-0.95 - swing * 0.7);

  // Cabello corto (hombre): gorrito sobre la cabeza
  if (figure === 'hombre') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - r * 0.55, r * 0.95, r * 0.6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawHead(ctx, head.x, head.y, r, look);
  drawName(ctx, x, head.y - r - 26, look.name, color, 12); // sobre la cabeza: siempre visible
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
