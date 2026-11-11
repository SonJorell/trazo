import { createElement, MAX_DOC_PAGES } from '/shared/elements.js';
import {
  uploadAsset,
  renderPdfPages,
  prepareImage,
  isImageFile,
  isPdfFile,
  isOfficeFile,
} from './upload.js';
import { choiceDialog } from '../ui/dialogs.js';
import { toast } from '../ui/toast.js';

const MAX_FILE = 40 * 1024 * 1024;

/**
 * Adjuntar archivos a la pizarra:
 *  - Fotos → imagen en la pizarra.
 *  - PDF / PowerPoint / Word / Excel → documento que se hojea (‹ ›) y se anota encima,
 *    o una diapositiva por página de Trazo.
 *  - Cualquier otro archivo → tarjeta que se descarga con doble toque.
 * Los archivos de Office se convierten a PDF en el PC anfitrión.
 */
export function setupAttachments({ room, getToken, ctx, viewport, getViewSize, goToPage, select, canEdit = () => true, onPasteElements = () => false }) {
  const busy = new Set();

  /** Rectángulo del mundo donde colocar algo de proporción w:h (centrado en la vista). */
  const placement = (w, h, fraction = 0.7) => {
    const { width, height } = getViewSize();
    const view = viewport.visibleRect(width, height);
    const s = Math.min((view.w * fraction) / w, (view.h * fraction) / h);
    const ww = w * s;
    const hh = h * s;
    return { x: view.x + (view.w - ww) / 2, y: view.y + (view.h - hh) / 2, w: ww, h: hh };
  };

  const base = () => {
    const { author, page } = ctx.strokeProps();
    return { author, page };
  };

  const add = (el) => {
    const tx = ctx.begin();
    tx.add(el);
    tx.commit();
    select([el.id]);
    return el;
  };

  const upload = (blob, name) => {
    const token = getToken();
    if (!token) throw new Error('Aún no hay conexión con la sala');
    return uploadAsset({ room, token, blob, name });
  };

  async function attachImage(file) {
    const img = await prepareImage(file);
    if (!img) return attachGeneric(file);
    const res = await upload(img.blob, img.name);
    add(createElement('image', { ...base(), ...placement(img.w, img.h, 0.6), src: res.url, name: res.name }));
  }

  async function attachGeneric(file, uploaded = null) {
    const res = uploaded ?? (await upload(file, file.name || 'archivo'));
    const p = placement(320, 84, 0.9);
    const w = Math.min(320, p.w * 3);
    add(createElement('file', { ...base(), x: p.x + (p.w - w) / 2, y: p.y, w, h: 84, src: res.url, name: res.name, size: res.size }));
  }

  /** Inserta un PDF (archivo local o ya convertido en el servidor). */
  async function attachPdf({ data, name, sourceUrl, progress }) {
    const how = await choiceDialog({
      title: `Insertar «${name}»`,
      message: 'Elige cómo quieres verlo en la pizarra.',
      options: [
        { value: 'doc', label: 'Documento para hojear', desc: 'Un solo bloque con flechas para cambiar de página. Lo que anotes encima queda en cada página.' },
        { value: 'slides', label: 'Una página por diapositiva', desc: 'Cada página va a una página de Trazo (se avanza con la barra de páginas o el control remoto).' },
      ],
    });
    if (!how) return;

    const urls = [];
    let size = null;
    let truncated = false;
    for await (const page of renderPdfPages(data, { maxPages: MAX_DOC_PAGES })) {
      progress(`Preparando «${name}»: página ${page.index + 1} de ${page.total}…`);
      size ??= { w: page.w, h: page.h };
      truncated = page.pages > page.total;
      const res = await upload(page.blob, `${name.replace(/\.[^.]+$/, '')}-p${page.index + 1}.jpg`);
      urls.push({ url: res.url, w: page.w, h: page.h });
    }
    if (!urls.length) throw new Error('El PDF no tiene páginas');
    if (truncated) toast(`Solo se insertaron las primeras ${MAX_DOC_PAGES} páginas`);

    if (how === 'doc') {
      add(
        createElement('doc', {
          ...base(),
          ...placement(size.w, size.h, 0.85),
          pages: urls.map((u) => u.url),
          docPage: 0,
          name,
          ...(sourceUrl ? { source: sourceUrl } : {}),
        }),
      );
      return;
    }

    // Diapositivas: a partir de la primera página vacía después del contenido actual.
    const { scene } = ctx;
    const first = scene.alive().length ? scene.pageCount() : scene.page;
    const frame = placement(size.w, size.h, 0.92);
    const tx = ctx.begin();
    urls.forEach((u, i) => {
      // Cada página conserva su proporción dentro del mismo marco.
      const s = Math.min(frame.w / u.w, frame.h / u.h);
      const w = u.w * s;
      const h = u.h * s;
      tx.add(
        createElement('image', {
          author: base().author,
          page: Math.min(first + i, 999),
          x: frame.x + (frame.w - w) / 2,
          y: frame.y + (frame.h - h) / 2,
          w,
          h,
          src: u.url,
          name: `${name} · ${i + 1}`,
          z: Date.now() - 1e6 + i, // al fondo: lo que se dibuje encima queda delante
        }),
      );
    });
    tx.commit();
    goToPage(first);
    toast(`Se insertaron ${urls.length} páginas desde la página ${first + 1}`);
  }

  async function attachOne(file) {
    if (file.size > MAX_FILE) throw new Error(`«${file.name}» supera los 40 MB`);
    const progress = toast(`Subiendo «${file.name || 'archivo'}»…`, { sticky: true });
    try {
      if (isImageFile(file)) await attachImage(file);
      else if (isPdfFile(file)) {
        const data = await file.arrayBuffer();
        const original = await upload(file, file.name);
        await attachPdf({ data, name: file.name, sourceUrl: original.url, progress: progress.update });
      } else if (isOfficeFile(file)) {
        progress.update(`Convirtiendo «${file.name}» a PDF en el PC anfitrión…`);
        const res = await upload(file, file.name);
        if (!res.pdf) {
          toast(res.convertError ?? 'No se pudo convertir el archivo; se adjuntó para descargar', { ms: 7000 });
          return attachGeneric(file, res);
        }
        const data = await (await fetch(res.pdf)).arrayBuffer();
        await attachPdf({ data, name: file.name, sourceUrl: res.url, progress: progress.update });
      } else {
        await attachGeneric(file);
      }
    } finally {
      progress();
    }
  }

  /** Adjunta una lista de archivos (de uno en uno, para no saturar la red). */
  async function attachFiles(list) {
    if (!canEdit()) return toast('Como visita no puedes adjuntar archivos');
    for (const file of list) {
      if (busy.has(file)) continue;
      busy.add(file);
      try {
        await attachOne(file);
      } catch (err) {
        toast(err.message || 'No se pudo adjuntar el archivo', { ms: 6000 });
      } finally {
        busy.delete(file);
      }
    }
  }

  // Selector de archivos (en el celular ofrece también la cámara para fotografiar).
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.accept = 'image/*,.pdf,.ppt,.pptx,.pps,.ppsx,.odp,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,*/*';
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.value = '';
    attachFiles(files);
  });
  document.body.append(input);

  // Arrastrar y soltar sobre la pizarra.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    document.body.classList.add('dropping');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) document.body.classList.remove('dropping');
  });
  window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dropping');
    attachFiles([...e.dataTransfer.files]);
  });

  // Pegar (Ctrl+V) imágenes o archivos copiados.
  window.addEventListener('paste', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) {
      // Sin archivos: pegar los elementos copiados en la pizarra (Ctrl+C / Ctrl+V).
      if (onPasteElements()) e.preventDefault();
      return;
    }
    e.preventDefault();
    attachFiles(files);
  });

  return {
    pick: () => input.click(),
    attachFiles,
  };
}
