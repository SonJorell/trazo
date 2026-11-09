import { normalizeRect } from '/shared/geometry.js';

export const FONT_FAMILY = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const LINE_HEIGHT = 1.25;

export const fontFor = (size) => `${size}px ${FONT_FAMILY}`;

let measureCtx = null;

/** Mide un texto multilínea → { w, h } en unidades del mundo. */
export function measureText(text, fontSize) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = fontFor(fontSize);
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => measureCtx.measureText(l || ' ').width));
  return { w: Math.ceil(w), h: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

function strokePath(ctx, el) {
  const pts = el.points;
  ctx.beginPath();
  ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
  if (el.type === 'pen' && pts.length > 2) {
    // Suavizado: curvas cuadráticas por los puntos medios.
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(el.x + pts[i][0], el.y + pts[i][1], el.x + mx, el.y + my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(el.x + last[0], el.y + last[1]);
  } else {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(el.x + pts[i][0], el.y + pts[i][1]);
  }
  ctx.stroke();
}

function drawArrowHead(ctx, el) {
  const pts = el.points;
  if (pts.length < 2) return;
  const [x2, y2] = pts[pts.length - 1];
  const [x1, y1] = pts[pts.length - 2];
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.min(Math.max(12, el.strokeWidth * 4), Math.hypot(x2 - x1, y2 - y1) * 0.6 || 12);
  const spread = Math.PI / 7;
  const tipX = el.x + x2;
  const tipY = el.y + y2;
  ctx.beginPath();
  ctx.moveTo(tipX - len * Math.cos(angle - spread), tipY - len * Math.sin(angle - spread));
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - len * Math.cos(angle + spread), tipY - len * Math.sin(angle + spread));
  ctx.stroke();
}

/** Dibuja un elemento en el contexto (ya transformado a coordenadas del mundo). */
export function drawElement(ctx, el) {
  ctx.save();
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const hasFill = el.fill && el.fill !== 'transparent';

  switch (el.type) {
    case 'rect': {
      const r = normalizeRect(el.x, el.y, el.w, el.h);
      const radius = Math.min(8, r.w / 4, r.h / 4);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, radius);
      else ctx.rect(r.x, r.y, r.w, r.h);
      if (hasFill) {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const r = normalizeRect(el.x, el.y, el.w, el.h);
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      if (hasFill) {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'pen':
      if (el.points.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = el.stroke;
        ctx.arc(el.x + el.points[0][0], el.y + el.points[0][1], el.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else strokePath(ctx, el);
      break;
    case 'line':
      strokePath(ctx, el);
      break;
    case 'arrow':
      strokePath(ctx, el);
      drawArrowHead(ctx, el);
      break;
    case 'text': {
      ctx.fillStyle = el.stroke;
      ctx.font = fontFor(el.fontSize);
      ctx.textBaseline = 'top';
      const lh = el.fontSize * LINE_HEIGHT;
      el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lh + (lh - el.fontSize) / 2));
      break;
    }
  }
  ctx.restore();
}
