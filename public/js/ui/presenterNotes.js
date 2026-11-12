import { MSG } from '/shared/protocol.js';
import { h } from './dom.js';
import { ICONS } from './icons.js';

/**
 * Notas del presentador: texto privado por página que solo ven los anfitriones.
 * Se guardan en la sala (sobreviven a recargas) y se sincronizan entre las ventanas del anfitrión.
 */
export function setupPresenterNotes({ connection, scene, isHost, button }) {
  let notes = {};
  let page = -1;
  let timer = null;
  const label = h('strong', {});
  const area = h('textarea', {
    rows: '7',
    maxlength: '4000',
    placeholder: 'Escribe aquí lo que quieres recordar en esta página. Solo lo ves tú.',
    'aria-label': 'Notas del presentador',
  });
  const status = h('span', { class: 'muted small' });
  const panel = h(
    'section',
    { class: 'notes-panel', hidden: true, 'aria-label': 'Notas del presentador' },
    h('div', { class: 'row between' }, h('span', { class: 'with-icon' }, h('span', { html: ICONS.notes }), label), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar notas', html: ICONS.close, onclick: () => toggle(false) })),
    area,
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, 'Privadas: solo para el anfitrión'), status),
  );
  document.body.append(panel);

  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (page < 0) return;
    const text = area.value;
    if ((notes[String(page)] ?? '') === text) return;
    notes = { ...notes, [String(page)]: text };
    if (!text.trim()) delete notes[String(page)];
    connection.send({ t: MSG.NOTES, n: page, text });
    status.textContent = 'Guardado';
  };
  area.addEventListener('input', () => {
    status.textContent = 'Escribiendo…';
    clearTimeout(timer);
    timer = setTimeout(save, 600);
  });
  area.addEventListener('blur', save);

  const show = () => {
    if (timer) save();
    page = scene.page;
    label.textContent = `Notas de la página ${page + 1}`;
    if (document.activeElement !== area) area.value = notes[String(page)] ?? '';
    status.textContent = '';
    button.classList.toggle('has-notes', Object.keys(notes).length > 0);
  };
  const toggle = (open = panel.hidden) => {
    panel.hidden = !open;
    button.classList.toggle('active', open);
    if (open) show();
  };
  button.addEventListener('click', () => toggle());
  scene.on('page', show);

  connection.on('message', (msg) => {
    if (msg.t === MSG.WELCOME) {
      button.hidden = !isHost();
      if (!isHost()) panel.hidden = true;
      notes = msg.notes ?? {};
      show();
    } else if (msg.t === MSG.NOTES) {
      if (msg.all) notes = { ...msg.all };
      else {
        notes = { ...notes, [String(msg.n)]: msg.text };
        if (!msg.text.trim()) delete notes[String(msg.n)];
      }
      show();
    }
  });
  return { toggle };
}
