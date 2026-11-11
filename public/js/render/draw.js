import { normalizeRect } from '/shared/geometry.js';
import { effectiveWidth } from '/shared/elements.js';
import { getImage, imageUrlOf } from './assets.js';

/** Papel oscuro (pizarra negra/verde): la tinta negra por defecto se muestra clara. */
let darkPaper = false;
export function setDarkPaper(on) {
  darkPaper = Boolean(on);
}
const DEFAULT_INK = '#1e1e1e';
const inkOf = (el) => (darkPaper && el.stroke === DEFAULT_INK && el.type !== 'note' ? '#f1f3f5' : el.stroke);

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

export const NOTE_PADDING = 12;

/** Parte un texto en líneas que quepan en `maxWidth` (respeta los saltos de línea). */
export function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const BRUSH_ALPHA = { pen: 1, marker: 0.85, highlighter: 0.38, neon: 1 };

function applyDash(ctx, el, width) {
  if (el.dash === 'dashed') ctx.setLineDash([width * 3, width * 2.2]);
  else if (el.dash === 'dotted') ctx.setLineDash([0.01, width * 2.2]);
  else ctx.setLineDash([]);
}

/** Geometría del elemento con un grosor y color dados (una pasada). */
function drawShape(ctx, el, width, color, { fill = true } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  applyDash(ctx, el, width);
  const hasFill = fill && el.fill && el.fill !== 'transparent';

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
        ctx.fillStyle = color;
        ctx.arc(el.x + el.points[0][0], el.y + el.points[0][1], width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else strokePath(ctx, el);
      break;
    case 'line':
      strokePath(ctx, el);
      break;
    case 'arrow':
      strokePath(ctx, el);
      ctx.setLineDash([]);
      drawArrowHead(ctx, el);
      break;
    case 'note': {
      const r = normalizeRect(el.x, el.y, el.w, el.h);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = el.fill;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 6);
      else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = fontFor(el.fontSize);
      ctx.textBaseline = 'top';
      const pad = NOTE_PADDING;
      const lh = el.fontSize * LINE_HEIGHT;
      wrapText(ctx, el.text, r.w - pad * 2).forEach((line, i) => {
        if (pad + (i + 1) * lh <= r.h) ctx.fillText(line, r.x + pad, r.y + pad + i * lh);
      });
      break;
    }
    case 'text': {
      ctx.fillStyle = color;
      ctx.font = fontFor(el.fontSize);
      ctx.textBaseline = 'top';
      const lh = el.fontSize * LINE_HEIGHT;
      el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lh + (lh - el.fontSize) / 2));
      break;
    }
  }
}

/**
 * Dibuja un elemento en el contexto (ya transformado a coordenadas del mundo).
 * Pinceles: lápiz (normal), marcador (grueso), resaltador (translúcido, se mezcla con el fondo)
 * y neón (halo brillante del color + núcleo claro).
 */
export function drawElement(ctx, el) {
  if (el.type === 'image' || el.type === 'doc' || el.type === 'file') return drawMedia(ctx, el);
  const brush = el.brush ?? 'pen';
  const ink = inkOf(el);
  const width = effectiveWidth(el);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const flat = el.type === 'text' || el.type === 'note';
  ctx.globalAlpha = (el.opacity ?? 1) * (flat ? 1 : BRUSH_ALPHA[brush] ?? 1);
  // El resaltador se mezcla con lo de abajo; en papel oscuro «multiplicar» lo haría invisible.
  if (brush === 'highlighter' && !flat) ctx.globalCompositeOperation = darkPaper ? 'screen' : 'multiply';

  if (brush === 'neon' && el.type !== 'note') {
    ctx.shadowColor = ink;
    ctx.shadowBlur = Math.max(10, el.strokeWidth * 5);
    drawShape(ctx, el, width, ink);
    drawShape(ctx, el, width, ink, { fill: false }); // segunda pasada: halo más intenso
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.9;
    drawShape(ctx, el, Math.max(1, el.strokeWidth * 0.45), '#ffffff', { fill: false });
  } else {
    drawShape(ctx, el, width, ink);
  }
  ctx.restore();
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

export const formatSize = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Extensión en mayúsculas para la etiqueta de la tarjeta de archivo. */
const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().slice(0, 5).toUpperCase() : 'ARCHIVO');

/** Imágenes, documentos (página actual + contador) y tarjetas de archivo. */
function drawMedia(ctx, el) {
  const r = normalizeRect(el.x, el.y, el.w, el.h);
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  if (el.type === 'file') {
    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.stroke();
    const icon = Math.min(r.h - 24, 56);
    ctx.fillStyle = '#4263eb';
    roundRect(ctx, r.x + 12, r.y + (r.h - icon) / 2, icon, icon, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(icon * 0.26)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(extOf(el.name), r.x + 12 + icon / 2, r.y + r.h / 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1e1e1e';
    ctx.font = `600 16px ${FONT_FAMILY}`;
    const tx = r.x + icon + 24;
    const maxW = r.w - icon - 36;
    let name = el.name || 'archivo';
    while (name.length > 4 && ctx.measureText(name).width > maxW) name = `${name.slice(0, -2)}…`.replace(/……$/, '…');
    ctx.fillText(name, tx, r.y + r.h / 2 - 10);
    ctx.fillStyle = '#868e96';
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.fillText(`${formatSize(el.size || 0)} · doble toque para descargar`, tx, r.y + r.h / 2 + 12);
    ctx.restore();
    return;
  }

  const entry = getImage(imageUrlOf(el));
  if (el.type === 'doc') {
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.shadowColor = 'transparent';
  }
  if (entry.ok) {
    ctx.drawImage(entry.img, r.x, r.y, r.w, r.h);
  } else {
    ctx.fillStyle = '#f1f3f5';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#868e96';
    ctx.font = `${Math.max(12, Math.min(28, r.w / 18))}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.failed ? 'No se pudo cargar' : 'Cargando…', r.x + r.w / 2, r.y + r.h / 2);
  }
  if (el.type === 'doc' && el.pages.length > 1) {
    // Contador de página en la esquina (se ve en la presentación y al exportar).
    const fs = Math.max(11, Math.min(26, r.w * 0.022));
    const label = `${(el.docPage ?? 0) + 1} / ${el.pages.length}`;
    ctx.font = `600 ${fs}px ${FONT_FAMILY}`;
    const w = ctx.measureText(label).width + fs * 1.2;
    const hgt = fs * 1.7;
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = '#212529';
    roundRect(ctx, r.x + r.w - w - fs * 0.6, r.y + r.h - hgt - fs * 0.6, w, hgt, hgt / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w - w / 2 - fs * 0.6, r.y + r.h - hgt / 2 - fs * 0.6);
  }
  ctx.restore();
}
