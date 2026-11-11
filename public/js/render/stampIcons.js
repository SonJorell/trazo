/**
 * Sellos e íconos vectoriales (24×24, trazo redondeado). Se usan tanto en el lienzo (Path2D)
 * como en la interfaz (SVG), así el sistema no depende de emojis ni de fuentes del equipo.
 */
const CIRCLE = 'M12 3a9 9 0 1 0 0.01 0z';

export const STAMP_ICONS = {
  check: { label: 'Visto bueno', d: 'M5 12.5l4.5 4.5L19 7' },
  x: { label: 'Incorrecto', d: 'M6 6l12 12M18 6L6 18' },
  star: { label: 'Estrella', d: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z', fill: true },
  heart: { label: 'Corazón', d: 'M12 20s-7-4.4-9-8.6C1.6 8.3 3.6 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.2 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z', fill: true },
  exclaim: { label: 'Atención', d: 'M12 4v10M12 19v.4' },
  question: { label: 'Pregunta', d: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18.6v.4' },
  arrow: { label: 'Flecha', d: 'M4 12h15M13 6l6 6-6 6' },
  warning: { label: 'Advertencia', d: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.4v.4' },
  n1: { label: 'Número 1', d: CIRCLE, num: '1' },
  n2: { label: 'Número 2', d: CIRCLE, num: '2' },
  n3: { label: 'Número 3', d: CIRCLE, num: '3' },
  n4: { label: 'Número 4', d: CIRCLE, num: '4' },
};

const cache = new Map();
const pathOf = (d) => {
  if (!cache.has(d)) cache.set(d, new Path2D(d));
  return cache.get(d);
};

/** Dibuja un sello en su caja (x, y, w, h) con el color del elemento. */
export function drawStamp(ctx, el, color) {
  const icon = STAMP_ICONS[el.icon] ?? STAMP_ICONS.check;
  const s = Math.min(el.w, el.h) / 24;
  ctx.save();
  ctx.translate(el.x + (el.w - 24 * s) / 2, el.y + (el.h - 24 * s) / 2);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color;
  const p = pathOf(icon.d);
  if (icon.fill) {
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = color;
    ctx.fill(p);
    ctx.globalAlpha /= 0.9;
  }
  ctx.stroke(p);
  if (icon.num) {
    ctx.fillStyle = color;
    ctx.font = '700 12px system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.num, 12, 12.6);
  }
  ctx.restore();
}

/** SVG de un sello para botones de la interfaz. */
export function stampSvg(key, size = 22) {
  const icon = STAMP_ICONS[key] ?? STAMP_ICONS.check;
  const num = icon.num
    ? `<text x="12" y="16.2" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui, sans-serif">${icon.num}</text>`
    : '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${icon.fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon.d}"/>${num}</svg>`;
}
