import { BG_COLORS, DEFAULT_BACKGROUND } from '/shared/protocol.js';

/** Fondos de hoja: nombre visible de cada diseño y de cada papel. */
export const PATTERN_LABELS = {
  dots: 'Puntos',
  grid: 'Cuadriculada',
  lines: 'Rayada',
  graph: 'Milimetrada',
  iso: 'Isométrica',
  music: 'Pentagrama',
  blank: 'Lisa',
};
export const COLOR_LABELS = {
  white: 'Blanco',
  cream: 'Crema',
  blue: 'Celeste',
  dark: 'Pizarra negra',
  chalk: 'Pizarra verde',
};

/** ¿El papel es oscuro? (la tinta negra se muestra clara para que se vea). */
export const isDarkPaper = (bg) => bg?.color === 'dark' || bg?.color === 'chalk';

/** Colores de papel y líneas para un fondo. */
export function paperColors(bg = DEFAULT_BACKGROUND) {
  const dark = isDarkPaper(bg);
  return {
    paper: BG_COLORS[bg.color] ?? '#ffffff',
    line: dark ? 'rgba(255,255,255,0.13)' : 'rgba(30,60,110,0.13)',
    strong: dark ? 'rgba(255,255,255,0.26)' : 'rgba(30,60,110,0.24)',
    dot: dark ? 'rgba(255,255,255,0.28)' : '#ced4da',
    margin: dark ? 'rgba(255,120,120,0.35)' : 'rgba(224,49,49,0.35)',
  };
}

/**
 * Dibuja el diseño de la hoja en coordenadas del mundo (se mueve y escala con la pizarra).
 * @param {CanvasRenderingContext2D} ctx con la transformación del mundo ya aplicada
 * @param {{x,y,w,h}} view rectángulo visible del mundo
 * @param {number} zoom escala actual (para grosores de 1 píxel y para ocultar líneas muy densas)
 */
export function drawPattern(ctx, view, zoom, bg = DEFAULT_BACKGROUND) {
  const c = paperColors(bg);
  const x0 = view.x;
  const y0 = view.y;
  const x1 = view.x + view.w;
  const y1 = view.y + view.h;
  const px = 1 / zoom; // un píxel de pantalla
  ctx.save();
  ctx.lineWidth = px;

  const hLines = (step, color, from = y0, filter = null) => {
    if (step * zoom < 5) return;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let y = Math.floor(from / step) * step; y <= y1; y += step) {
      if (filter && !filter(y)) continue;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  };
  const vLines = (step, color, filter = null) => {
    if (step * zoom < 5) return;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      if (filter && !filter(x)) continue;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
  };
  const mod = (v, m) => ((Math.round(v) % m) + m) % m;

  switch (bg.pattern) {
    case 'dots': {
      const step = 24;
      if (step * zoom < 10) break;
      ctx.fillStyle = c.dot;
      const r = Math.max(0.8, Math.min(1.5, zoom)) / zoom;
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      break;
    }
    case 'grid':
      hLines(24, c.line);
      vLines(24, c.line);
      break;
    case 'graph':
      // Milimetrada: líneas finas cada 8, medianas cada 40 (5 cuadros).
      hLines(8, c.line, y0, (y) => mod(y, 40) !== 0);
      vLines(8, c.line, (x) => mod(x, 40) !== 0);
      hLines(40, c.strong);
      vLines(40, c.strong);
      break;
    case 'lines':
      hLines(36, c.strong);
      // Margen rojo de cuaderno en x = 0.
      if (x0 <= 0 && x1 >= 0) {
        ctx.strokeStyle = c.margin;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(0, y1);
        ctx.stroke();
      }
      break;
    case 'iso': {
      // Isométrica: horizontales + diagonales a ±60°, formando triángulos equiláteros.
      const side = 32;
      const hgt = side * Math.sqrt(3) / 2;
      if (hgt * zoom < 6) break;
      hLines(hgt, c.line);
      ctx.strokeStyle = c.line;
      ctx.beginPath();
      const k = Math.tan(Math.PI / 3); // pendiente de las diagonales
      // Rectas x = a ± y/k que pasan por los vértices (a múltiplo del lado en y = 0).
      const reach = Math.max(Math.abs(y0), Math.abs(y1)) / k;
      for (let a = Math.floor((x0 - reach) / side) * side; a <= x1 + reach; a += side) {
        ctx.moveTo(a + y0 / k, y0);
        ctx.lineTo(a + y1 / k, y1);
        ctx.moveTo(a - y0 / k, y0);
        ctx.lineTo(a - y1 / k, y1);
      }
      ctx.stroke();
      break;
    }
    case 'music': {
      // Pentagrama: grupos de 5 líneas (separación 10) cada 90 unidades.
      const gap = 10;
      const period = 90;
      if (gap * zoom < 3) break;
      ctx.strokeStyle = c.strong;
      ctx.beginPath();
      for (let base = Math.floor(y0 / period) * period; base <= y1; base += period) {
        for (let i = 0; i < 5; i++) {
          const y = base + 30 + i * gap;
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
      }
      ctx.stroke();
      break;
    }
    default:
      break; // lisa
  }
  ctx.restore();
}
