import { getBounds } from '/shared/geometry.js';
import { drawElement, setDarkPaper, isDarkPaperSet, FONT_FAMILY } from './draw.js';
import { buildPdf } from './pdfWriter.js';
import { preloadElements } from './assets.js';
import { drawPattern, paperColors, isDarkPaper } from './background.js';

const TITLE_H = 72; // franja del título de página (unidades del mundo)

const MAX_SIDE = 2000;
const PAD = 32;

/**
 * Exporta todas las páginas con contenido a un PDF (una página PDF por página de Trazo).
 * Sin librerías: cada página se dibuja en un lienzo, se comprime a JPEG y se inserta
 * como imagen en un PDF mínimo escrito a mano.
 */
export async function exportPdf(scene, fileName, { backgroundFor = () => null, titleFor = () => '' } = {}) {
  const byPage = new Map();
  // Las anotaciones de documentos se exportan con la página que el documento muestra ahora.
  for (const el of scene.allAlive().filter((e) => scene.anchorVisible(e))) {
    const p = el.page ?? 0;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(el);
  }
  if (!byPage.size) return false;

  const images = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    images.push(await renderPage(byPage.get(page), backgroundFor(page), titleFor(page)));
  }
  const blob = buildPdf(images);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

async function renderPage(elements, background, title = '') {
  await preloadElements(elements);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getBounds(el);
    const pad = (el.strokeWidth || 0) * 3;
    minX = Math.min(minX, b.x - pad);
    minY = Math.min(minY, b.y - pad);
    maxX = Math.max(maxX, b.x + b.w + pad);
    maxY = Math.max(maxY, b.y + b.h + pad);
  }
  const top = title ? TITLE_H : 0;
  const w = Math.max(maxX - minX + PAD * 2, title ? 600 : 0);
  const h = maxY - minY + PAD * 2 + top;
  const scale = Math.min(2, MAX_SIDE / w, MAX_SIDE / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background ? paperColors(background).paper : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const dark = isDarkPaper(background);
  if (title) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = dark ? '#f1f3f5' : '#1e1e1e';
    ctx.font = `700 34px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(title, PAD, TITLE_H / 2 + 8, w - PAD * 2);
  }
  ctx.setTransform(scale, 0, 0, scale, (PAD - minX) * scale, (PAD - minY + top) * scale);
  if (background) drawPattern(ctx, { x: minX - PAD, y: minY - PAD, w, h: h - top }, scale, background);
  const before = isDarkPaperSet();
  setDarkPaper(dark);
  for (const el of elements) drawElement(ctx, el);
  setDarkPaper(before);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(await blob.arrayBuffer()) };
}
