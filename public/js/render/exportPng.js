import { drawElement } from './draw.js';
import { preloadElements } from './assets.js';
import { drawPattern, paperColors } from './background.js';

const MAX_SIDE = 8000;

/** Genera un PNG con todos los elementos visibles y lo descarga. */
export async function exportPng(scene, fileName, background = null) {
  const bounds = scene.bounds();
  if (!bounds) return false;
  await preloadElements(scene.alive());
  const pad = 32;
  let scale = 2;
  const w = bounds.w + pad * 2;
  const h = bounds.h + pad * 2;
  scale = Math.min(scale, MAX_SIDE / w, MAX_SIDE / h);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background ? paperColors(background).paper : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, (pad - bounds.x) * scale, (pad - bounds.y) * scale);
  if (background) drawPattern(ctx, { x: bounds.x - pad, y: bounds.y - pad, w, h }, scale, background);
  for (const el of scene.alive()) drawElement(ctx, el);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
