import { getBounds, rectsIntersect, normalizeRect } from '/shared/geometry.js';
import { RESIZABLE, KEEP_ASPECT, hitHandle } from '../core/handles.js';
import { scaleAbout } from '../core/transform.js';

const DOUBLE_TAP_MS = 350;

/**
 * Selección: tocar para seleccionar, arrastrar para mover, recuadro para
 * seleccionar varios, tirador para redimensionar, doble toque en un texto para editarlo.
 */
export function createSelectTool(ctx) {
  let mode = null; // 'move' | 'resize' | 'marquee'
  let start = null;
  let originals = null;
  let tx = null;
  let moved = false;
  let lastTap = { id: null, at: 0 };
  let anchored = null; // anotaciones de los documentos que se mueven/redimensionan

  /** Anotaciones ancladas (de todas sus páginas) a los documentos dados. */
  const anchoredOf = (ids) => {
    const out = new Map();
    for (const id of ids) {
      if (ctx.scene.get(id)?.type !== 'doc') continue;
      for (const el of ctx.scene.anchoredTo(id)) if (!ids.has(el.id)) out.set(el.id, el);
    }
    return out;
  };

  const single = () => {
    if (ctx.selection.size !== 1) return null;
    const el = ctx.scene.get([...ctx.selection][0]);
    return el && !el.isDeleted ? el : null;
  };

  return {
    name: 'select',
    cursor: 'default',

    down(p, e) {
      start = p;
      moved = false;
      const sel = single();
      if (sel && RESIZABLE.has(sel.type) && hitHandle(sel, ctx.viewport.zoom, p.x, p.y)) {
        mode = 'resize';
        tx = ctx.begin();
        originals = new Map([[sel.id, sel]]);
        anchored = anchoredOf(new Set([sel.id]));
        return;
      }

      const hit = ctx.scene.hitTop(p.x, p.y, ctx.tol(6));
      if (!hit) {
        // Un documento bloqueado no se selecciona, pero se puede hojear con su barra.
        const lockedHit = ctx.scene.hitTop(p.x, p.y, ctx.tol(6), { locked: true });
        if (lockedHit?.type === 'doc') ctx.activateDoc?.(lockedHit.id);
      }
      if (hit) {
        const now = Date.now();
        if (lastTap.id === hit.id && now - lastTap.at < DOUBLE_TAP_MS) {
          if (hit.type === 'text' || hit.type === 'note') {
            lastTap = { id: null, at: 0 };
            mode = null;
            ctx.editText(hit);
            return;
          }
          if (hit.type === 'image' || hit.type === 'doc' || hit.type === 'file') {
            lastTap = { id: null, at: 0 };
            mode = null;
            ctx.openMedia?.(hit); // documento/imagen: encuadrar · archivo: descargar
            return;
          }
        }
        lastTap = { id: hit.id, at: now };
        if (e.shiftKey) ctx.toggleSelect(hit.id);
        else if (!ctx.selection.has(hit.id)) ctx.select([hit.id]);
        mode = 'move';
        tx = ctx.begin();
        originals = new Map([...ctx.selection].map((id) => [id, ctx.scene.get(id)]).filter(([, el]) => el));
        anchored = anchoredOf(new Set(originals.keys()));
        for (const [id, el] of anchored) originals.set(id, el); // las notas del documento lo acompañan
        return;
      }

      lastTap = { id: null, at: 0 };
      if (!e.shiftKey) ctx.select([]);
      mode = 'marquee';
      ctx.overlay.marquee = { x: p.x, y: p.y, w: 0, h: 0 };
      ctx.render();
    },

    move(p) {
      if (!mode) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!moved && Math.hypot(dx, dy) * ctx.viewport.zoom < 2) return;
      moved = true;

      if (mode === 'move') {
        for (const [id, orig] of originals) tx.update(id, { x: orig.x + dx, y: orig.y + dy });
      } else if (mode === 'resize') {
        const [[id, orig]] = originals;
        if (KEEP_ASPECT.has(orig.type)) {
          const w = Math.max(40, orig.w + dx);
          const s = w / orig.w;
          tx.update(id, { w, h: orig.h * s });
          for (const [aid, a] of anchored) tx.update(aid, scaleAbout(a, orig.x, orig.y, s));
        } else {
          tx.update(id, { w: orig.w + dx, h: orig.h + dy });
        }
      } else if (mode === 'marquee') {
        const m = normalizeRect(start.x, start.y, dx, dy);
        ctx.overlay.marquee = m;
        const ids = ctx.scene
          .alive()
          .filter((el) => !el.locked && rectsIntersect(m, getBounds(el)))
          .map((el) => el.id);
        ctx.select(ids, true);
      }
    },

    up() {
      if (mode === 'resize' && moved) {
        const [[id]] = originals;
        const el = ctx.scene.get(id);
        tx.update(id, normalizeRect(el.x, el.y, el.w, el.h));
      }
      if (tx) {
        if (moved) tx.commit();
        tx = null;
      }
      if (mode === 'marquee') {
        ctx.overlay.marquee = null;
        ctx.render();
      }
      mode = start = originals = anchored = null;
    },

    cancel() {
      tx?.rollback();
      tx = null;
      ctx.overlay.marquee = null;
      mode = start = originals = null;
      ctx.render();
    },
  };
}
