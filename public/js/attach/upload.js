/** Sube un archivo (Blob/File) a la sala. Devuelve { url, name, size, ext, pdf?, convertError? }. */
export async function uploadAsset({ room, token, blob, name }) {
  const res = await fetch(`/api/rooms/${room}/assets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Trazo-Token': token,
      'X-Trazo-Name': encodeURIComponent(name),
    },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status} al subir`), { status: res.status });
  return data;
}

let pdfjsPromise = null;

/** Carga pdf.js (solo cuando se adjunta un PDF por primera vez). */
export function loadPdfjs() {
  pdfjsPromise ??= import('/vendor/pdfjs/legacy/build/pdf.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/legacy/build/pdf.worker.mjs';
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Abre un PDF y entrega cada página como JPEG listo para subir.
 * @param {ArrayBuffer} data
 * @param {{ maxPages, width, onPage(i, total) }} opts
 * @returns {AsyncGenerator<{ index, total, blob, w, h }>}
 */
export async function* renderPdfPages(data, { maxPages = 300, width = 1600 } = {}) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data,
    standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    cMapUrl: '/vendor/pdfjs/cmaps/',
    cMapPacked: true,
    wasmUrl: '/vendor/pdfjs/wasm/',
    isEvalSupported: false,
  });
  const doc = await task.promise;
  const total = Math.min(doc.numPages, maxPages);
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, width / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const c2d = canvas.getContext('2d');
      c2d.fillStyle = '#ffffff';
      c2d.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: c2d, viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      page.cleanup();
      yield { index: i - 1, total, pages: doc.numPages, blob, w: base.width, h: base.height };
    }
  } finally {
    await task.destroy();
  }
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_SIDE = 2400;

/**
 * Prepara una foto para subir: si es enorme (fotos del celular) la reduce y la pasa a JPEG.
 * Devuelve { blob, name, w, h } con el tamaño natural final.
 */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const { width, height } = bitmap;
  const big = Math.max(width, height) > MAX_IMAGE_SIDE || file.size > 4 * 1024 * 1024;
  if (!big && IMAGE_TYPES.has(file.type)) {
    bitmap.close?.();
    return { blob: file, name: file.name || 'imagen.png', w: width, h: height };
  }
  const s = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * s);
  canvas.height = Math.round(height * s);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  const base = (file.name || 'foto').replace(/\.[^.]+$/, '');
  return { blob, name: `${base}.jpg`, w: canvas.width, h: canvas.height };
}

export const isImageFile = (file) => file.type.startsWith('image/') && !/svg/.test(file.type);
export const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
export const isOfficeFile = (file) => /\.(pptx?|ppsx?|odp|docx?|odt|rtf|xlsx?|ods)$/i.test(file.name);
