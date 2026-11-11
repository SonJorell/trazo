import { REACTIONS } from '/shared/protocol.js';
import { h } from './dom.js';

const icon = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Íconos y colores de cada reacción. */
export const REACTION_ICONS = {
  like: { label: 'Me gusta', color: '#1971c2', svg: icon('<path d="M7 10v10H4V10z"/><path d="M7 10l4-7c1.6 0 2.6 1.1 2.3 2.7L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>') },
  love: { label: 'Me encanta', color: '#e03131', svg: icon('<path d="M12 20s-7-4.4-9-8.6C1.6 8.3 3.6 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.2 0 5.2 3.3 3.8 6.4C19 15.6 12 20 12 20z"/>', 'currentColor') },
  laugh: { label: 'Divertido', color: '#f08c00', svg: icon('<circle cx="12" cy="12" r="9"/><path d="M7.5 13h9a4.5 4.5 0 0 1-9 0z"/><path d="M8 9.5l1.5-1 1.5 1M13 9.5l1.5-1 1.5 1"/>') },
  wow: { label: 'Sorprendente', color: '#7048e8', svg: icon('<circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r=".8" fill="currentColor"/><circle cx="15" cy="9.5" r=".8" fill="currentColor"/><ellipse cx="12" cy="15" rx="2" ry="2.6"/>') },
  party: { label: 'Celebrar', color: '#d6336c', svg: icon('<path d="M4 20l4.5-11.5 7 7z"/><path d="M13 4.5v2M18.5 6.5L17 8M20 11.5h-2M15.5 3.5l.5 1.5M20.5 15l-1.5-.5"/>') },
  idea: { label: 'Buena idea', color: '#f59f00', svg: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>') },
  question: { label: 'Tengo una duda', color: '#0c8599', svg: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2 1-1.2 1.8M12 16.6v.4"/>') },
  hand: { label: 'Levantar la mano', color: '#2f9e44', svg: icon('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 11.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a6.5 6.5 0 0 1-5.4-2.9L4 15.5a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/>') },
};

/**
 * Reacciones: un botón abre los íconos; al elegir uno, flota sobre la pantalla de todos
 * (y sobre la presentación proyectada) con el nombre de quien reaccionó.
 */
export class Reactions {
  constructor({ button, onSend }) {
    this.layer = document.body.appendChild(h('div', { class: 'reaction-layer', 'aria-live': 'polite' }));
    this.pop = h(
      'div',
      { class: 'react-pop ov-hit', hidden: true, role: 'menu' },
      REACTIONS.map((key) =>
        h('button', {
          class: 'react-opt',
          role: 'menuitem',
          title: REACTION_ICONS[key].label,
          'aria-label': REACTION_ICONS[key].label,
          style: `color:${REACTION_ICONS[key].color}`,
          html: REACTION_ICONS[key].svg,
          onclick: () => {
            this.pop.hidden = true;
            onSend(key);
            this.show(key, 'Tú');
          },
        }),
      ),
    );
    document.body.append(this.pop);
    button?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const r = button.getBoundingClientRect();
      this.pop.style.top = `${r.bottom + 8}px`;
      this.pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
      this.pop.hidden = !this.pop.hidden;
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.pop.hidden && !this.pop.contains(e.target) && e.target !== button) this.pop.hidden = true;
    });
  }

  /** Muestra una reacción flotando desde abajo a la derecha. */
  show(key, name) {
    const r = REACTION_ICONS[key];
    if (!r) return;
    const left = 60 + Math.random() * 30; // % del ancho
    const node = h(
      'div',
      { class: 'reaction', style: `left:${left}%` },
      h('span', { class: 'reaction-icon', style: `background:${r.color}`, html: r.svg }),
      h('span', { class: 'reaction-name' }, name),
    );
    this.layer.append(node);
    setTimeout(() => node.remove(), 3200);
  }
}
