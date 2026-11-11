import { h } from './dom.js';

let container = null;

/** Mensaje breve en pantalla. `sticky` lo deja visible hasta llamar a la función devuelta. */
export function toast(message, { sticky = false, ms = 2600 } = {}) {
  container ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const node = h('div', { class: 'toast' }, message);
  container.append(node);
  const close = () => {
    node.classList.add('hide');
    setTimeout(() => node.remove(), 250);
  };
  if (!sticky) setTimeout(close, ms);
  close.update = (text) => (node.textContent = text); // para mensajes de progreso
  return close;
}
