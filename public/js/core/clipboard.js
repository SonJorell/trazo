import { randomId, randomNonce } from '/shared/elements.js';
import { stripMeta } from './history.js';

/**
 * Copiar, pegar y duplicar elementos (portapapeles interno de la pestaña).
 * Al pegar se crean copias con ids nuevos, desplazadas y en la página actual; las
 * anotaciones de un documento copiado siguen ancladas a la copia del documento.
 */
export function createClipboard({ scene, begin, select }) {
  let items = [];
  let pastes = 0;

  const copy = (ids) => {
    items = [...ids].map((id) => scene.get(id)).filter((el) => el && !el.isDeleted).map((el) => structuredClone(el));
    // Si se copia un documento, sus anotaciones (de todas sus páginas) van con él.
    for (const el of [...items]) {
      if (el.type !== 'doc') continue;
      for (const a of scene.anchoredTo(el.id)) if (!items.some((i) => i.id === a.id)) items.push(structuredClone(a));
    }
    pastes = 0;
    return items.length;
  };

  const paste = (offset = null) => {
    if (!items.length) return 0;
    pastes++;
    const d = offset ?? 24 * pastes;
    const ids = new Map(items.map((el) => [el.id, randomId()]));
    const tx = begin();
    const created = [];
    let z = Date.now();
    for (const el of items) {
      const copyEl = {
        ...stripMeta(el),
        id: ids.get(el.id),
        version: 1,
        nonce: randomNonce(),
        x: el.x + d,
        y: el.y + d,
        z: z++,
        page: scene.page,
      };
      if (el.anchor) {
        if (ids.has(el.anchor)) copyEl.anchor = ids.get(el.anchor);
        else {
          delete copyEl.anchor;
          delete copyEl.anchorPage;
        }
      }
      tx.add(copyEl);
      created.push(copyEl.id);
    }
    tx.commit();
    select(created.filter((id) => !items.find((el) => ids.get(el.id) === id)?.anchor));
    return created.length;
  };

  return {
    copy,
    paste,
    get size() {
      return items.length;
    },
    /** Duplica la selección sin tocar el portapapeles. */
    duplicate(ids) {
      const saved = items;
      const savedPastes = pastes;
      copy(ids);
      const n = paste(24);
      items = saved;
      pastes = savedPastes;
      return n;
    },
  };
}
