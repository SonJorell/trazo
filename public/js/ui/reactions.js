import { REACTIONS } from '/shared/protocol.js';
import { h } from './dom.js';

/**
 * Reacciones: un botón abre los emojis; al elegir uno, flota sobre la pantalla de todos
 * (y sobre la presentación proyectada) con el nombre de quien reaccionó.
 */
export class Reactions {
  constructor({ button, onSend }) {
    this.layer = document.body.appendChild(h('div', { class: 'reaction-layer', 'aria-live': 'polite' }));
    this.pop = h(
      'div',
      { class: 'react-pop ov-hit', hidden: true, role: 'menu' },
      REACTIONS.map((e) =>
        h(
          'button',
          {
            class: 'react-opt',
            role: 'menuitem',
            'aria-label': `Reaccionar ${e}`,
            onclick: () => {
              this.pop.hidden = true;
              onSend(e);
              this.show(e, 'Tú');
            },
          },
          e,
        ),
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

  /** Muestra un emoji flotando desde abajo a la derecha. */
  show(emoji, name) {
    const left = 60 + Math.random() * 30; // % del ancho
    const node = h(
      'div',
      { class: 'reaction', style: `left:${left}%` },
      h('span', { class: 'reaction-emoji' }, emoji),
      h('span', { class: 'reaction-name' }, name),
    );
    this.layer.append(node);
    setTimeout(() => node.remove(), 3200);
  }
}
