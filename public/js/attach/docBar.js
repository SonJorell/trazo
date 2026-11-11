import { getBounds } from '/shared/geometry.js';
import { getImage } from '../render/assets.js';
import { h } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';

/**
 * Barra flotante del documento activo: ‹ página › · encuadrar · descargar · cerrar.
 * Se activa al seleccionar (o insertar) un documento y se queda aunque cambies de
 * herramienta, para poder hojear mientras anotas.
 */
export function createDocBar({ scene, viewport, ctx, onFit }) {
  let docId = null;
  const prev = h('button', { class: 'icon-btn', title: 'Página anterior del documento (←)', 'aria-label': 'Página anterior', html: ICONS.chevronLeft });
  const next = h('button', { class: 'icon-btn', title: 'Página siguiente del documento (→)', 'aria-label': 'Página siguiente', html: ICONS.chevronRight });
  const label = h('span', { class: 'doc-label' });
  const fit = h('button', { class: 'icon-btn', title: 'Encuadrar el documento', 'aria-label': 'Encuadrar', html: ICONS.fit });
  const download = h('a', { class: 'icon-btn', title: 'Descargar el archivo original', 'aria-label': 'Descargar', target: '_blank', rel: 'noopener', html: ICONS.download });
  const close = h('button', { class: 'icon-btn', title: 'Ocultar esta barra', 'aria-label': 'Ocultar', html: ICONS.close });
  const bar = h('div', { class: 'doc-bar ov-hit', hidden: true }, prev, label, next, h('span', { class: 'sep' }), fit, download, close);
  document.body.append(bar);

  const doc = () => {
    const el = docId ? scene.get(docId) : null;
    return el && !el.isDeleted && el.type === 'doc' && (el.page ?? 0) === scene.page ? el : null;
  };

  /** Cambia de página del documento (para todos). */
  const turn = (delta) => {
    const el = doc();
    if (!el) return false;
    const n = Math.max(0, Math.min(el.pages.length - 1, (el.docPage ?? 0) + delta));
    if (n === (el.docPage ?? 0)) return true;
    const tx = ctx.begin();
    tx.update(el.id, { docPage: n });
    tx.commit();
    // Precarga la siguiente para que el cambio sea instantáneo.
    const ahead = el.pages[n + Math.sign(delta)];
    if (ahead) getImage(ahead);
    return true;
  };

  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  fit.addEventListener('click', () => doc() && onFit(doc()));
  close.addEventListener('click', () => {
    docId = null;
    update();
  });

  /** Recoloca la barra bajo el documento (se llama tras cada dibujo). */
  function update() {
    const el = doc();
    if (!el) {
      bar.hidden = true;
      return;
    }
    const b = getBounds(el);
    const p1 = viewport.toScreen(b.x, b.y + b.h);
    const p2 = viewport.toScreen(b.x + b.w, b.y + b.h);
    const n = el.docPage ?? 0;
    label.textContent = `${n + 1} / ${el.pages.length}`;
    prev.disabled = n === 0;
    next.disabled = n >= el.pages.length - 1;
    download.href = el.source ?? el.pages[n];
    download.setAttribute('download', el.name || 'documento');
    bar.hidden = false;
    const rect = bar.getBoundingClientRect();
    const cx = (p1.x + p2.x) / 2;
    // No tapar las barras de abajo (en el celular son dos: zoom/páginas y herramientas).
    let bottom = window.innerHeight - 8;
    for (const node of document.querySelectorAll('.bottombar, #toolbar')) {
      const r = node.getBoundingClientRect();
      if (r.height && r.top > window.innerHeight / 2) bottom = Math.min(bottom, r.top - 8);
    }
    const maxY = bottom - rect.height;
    const x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, cx - rect.width / 2));
    const y = Math.max(56, Math.min(maxY, p1.y + 10));
    bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  return {
    get active() {
      return doc();
    },
    /** Hace activo un documento (o ninguno con null). */
    setActive(id) {
      docId = id;
      update();
    },
    turn,
    update,
  };
}
