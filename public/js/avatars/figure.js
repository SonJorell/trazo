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
  const g = pose.gesture; // gesto en curso { key, k: progreso 0–1 }
  const groundY = y;
  const hop = g && (g.key === 'party' || g.key === 'laugh') ? Math.abs(Math.sin(g.k * Math.PI * (g.key === 'party' ? 3 : 5))) * (g.key === 'party' ? 26 : 8) : 0;
  y -= hop; // saltitos al celebrar o reír (solo visual)
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
    const lift = Math.max(air, Math.min(1, (groundY - y) / 40));
    ctx.ellipse(x, groundY + 2, 26 * (1 - lift * 0.45), 6 * (1 - lift * 0.45), 0, 0, TAU);
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
    let upper = Math.sin(p) * 0.6 * amp * f + idleOut + (pose.s ? 0.5 * f : 0) + air * (side ? -2.4 : 2.4) * 0.5;
    let fore = (0.25 + 0.45 * amp) * f;
    if (g && side === 0) {
      // Brazo de adelante: saludar, levantar la mano o celebrar.
      const wave = Math.sin(g.k * Math.PI * 8) * 0.35;
      if (g.key === 'hand' || g.key === 'question') {
        upper = Math.PI * 0.66 * f;
        fore = (g.key === 'hand' ? 0.35 + wave : 0.25) * f;
      } else if (g.key === 'like' || g.key === 'idea') {
        upper = Math.PI * 0.55 * f;
        fore = 0.7 * f;
      }
    }
    if (g && (g.key === 'party' || g.key === 'wow')) {
      // Ambos brazos arriba.
      upper = Math.PI * (side ? -0.66 : 0.66) * f;
      fore = (side ? -0.3 : 0.3) * f;
    }
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
  drawAccessory(ctx, head.x, head.y, r, look.acc, f);
  if (g?.key === 'love') {
    // Corazones que suben sobre la cabeza.
    ctx.save();
    ctx.fillStyle = '#e03131';
    for (let i = 0; i < 3; i++) {
      const k = (g.k + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      heart(ctx, head.x + (i - 1) * 22, head.y - r - 20 - k * 50, 9);
    }
    ctx.restore();
  }
  drawName(ctx, head.x, head.y - r - (look.acc === 'hat' || look.acc === 'crown' ? 44 : 26), look.name, look.ring ?? color, 12);
  return head;
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  ctx.fill();
}

/** Accesorios sobre la cabeza: sombrero, gorra, lentes, audífonos, corona o moño. */
export function drawAccessory(ctx, x, y, r, acc, f = 1) {
  if (!acc || acc === 'none') return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (acc) {
    case 'hat':
      ctx.fillStyle = '#212529';
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.82, r * 1.25, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - r * 0.7, y - r * 1.6, r * 1.4, r * 0.8);
      ctx.fillStyle = '#e03131';
      ctx.fillRect(x - r * 0.7, y - r * 1.02, r * 1.4, r * 0.16);
      break;
    case 'cap':
      ctx.fillStyle = '#e03131';
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.78, r * 0.92, r * 0.5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + f * r * 0.75, y - r * 0.8, r * 0.62, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'glasses':
      ctx.strokeStyle = '#212529';
      ctx.lineWidth = Math.max(2, r * 0.1);
      for (const dx of [-0.42, 0.42]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y - r * 0.08, r * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x - r * 0.12, y - r * 0.1);
      ctx.lineTo(x + r * 0.12, y - r * 0.1);
      ctx.stroke();
      break;
    case 'headphones':
      ctx.strokeStyle = '#343a40';
      ctx.lineWidth = Math.max(3, r * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.08, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.fillStyle = '#343a40';
      for (const dx of [-1, 1]) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x + dx * r * 1.02 - r * 0.2, y - r * 0.3, r * 0.4, r * 0.62, r * 0.15);
        else ctx.rect(x + dx * r * 1.02 - r * 0.2, y - r * 0.3, r * 0.4, r * 0.62);
        ctx.fill();
      }
      break;
    case 'crown':
      ctx.fillStyle = '#fab005';
      ctx.strokeStyle = '#e67700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.75, y - r * 0.82);
      ctx.lineTo(x - r * 0.75, y - r * 1.45);
      ctx.lineTo(x - r * 0.38, y - r * 1.12);
      ctx.lineTo(x, y - r * 1.6);
      ctx.lineTo(x + r * 0.38, y - r * 1.12);
      ctx.lineTo(x + r * 0.75, y - r * 1.45);
      ctx.lineTo(x + r * 0.75, y - r * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'bow':
      ctx.fillStyle = '#e64980';
      for (const dx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + r * 0.45, y - r * 0.85);
        ctx.lineTo(x + r * 0.45 + dx * r * 0.45, y - r * 1.15);
        ctx.lineTo(x + r * 0.45 + dx * r * 0.45, y - r * 0.55);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x + r * 0.45, y - r * 0.85, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
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
