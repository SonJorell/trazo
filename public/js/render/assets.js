/**
 * Caché de imágenes de los archivos subidos (fotos y páginas de documentos).
 * Cuando una imagen termina de cargar se avisa para redibujar.
 */
const cache = new Map();
let listener = () => {};

export function onAssetLoad(fn) {
  listener = fn;
}

/** Devuelve { img, ok, failed } y empieza a cargarla si hace falta. */
export function getImage(url) {
  let entry = cache.get(url);
  if (!entry) {
    const img = new Image();
    img.decoding = 'async';
    entry = { img, ok: false, failed: false };
    entry.ready = new Promise((resolve) => {
      img.onload = () => {
        entry.ok = true;
        listener();
        resolve(entry);
      };
      img.onerror = () => {
        entry.failed = true;
        listener();
        resolve(entry);
      };
    });
    img.src = url;
    cache.set(url, entry);
    // Evita que la memoria crezca sin límite con documentos de muchas páginas.
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  return entry;
}

/** URL de la imagen que muestra un elemento (o null si no es de imagen). */
export function imageUrlOf(el) {
  if (el.type === 'image') return el.src;
  if (el.type === 'doc') return el.pages[el.docPage ?? 0] ?? el.pages[0];
  return null;
}

/** Espera a que estén cargadas las imágenes de estos elementos (antes de exportar). */
export async function preloadElements(elements) {
  const urls = elements.map(imageUrlOf).filter(Boolean);
  await Promise.all(urls.map((u) => getImage(u).ready));
}
