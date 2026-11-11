import { h } from '../ui/dom.js';
import { modal } from '../ui/dialogs.js';

const SHAPES = { auto: 'Automática', circle: 'Círculo', rounded: 'Redondeada', square: 'Cuadrada' };
const MODES = {
  fixed: { label: 'Fija en la presentación', desc: 'Una burbuja que ubica el anfitrión.' },
  pointer: { label: 'Sigue mi puntero', desc: 'Tu cámara acompaña tu cursor por la pizarra.' },
  anchor: { label: 'En un lugar de la pizarra', desc: 'Queda fija donde toques (se mueve con la pizarra).' },
  body: { label: 'Monigote', desc: 'Tu cámara es la cabeza de un personaje que camina hacia tu puntero, salta y se sienta.' },
};
const FIGURES = { hombre: 'Hombre', mujer: 'Mujer', neutro: 'Neutro' };
const COLORS = ['#4263eb', '#e03131', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599', '#c2255c', '#1e1e1e'];

/**
 * «Mi cámara y avatar»: forma, dónde se ve y, para el monigote, color, figura y silla.
 * @param {{ avatars, cameraOn: boolean, onPlaceAnchor(): void }} opts
 */
export function avatarDialog({ avatars, cameraOn, onPlaceAnchor }) {
  const body = h('div', { class: 'stack' });
  const { close } = modal(body);
  body.closest('.modal')?.classList.add('wide');

  const seg = (options, current, pick) =>
    h(
      'div',
      { class: 'segmented wrap' },
      Object.entries(options).map(([v, label]) =>
        h('button', { class: `seg${v === current ? ' active' : ''}`, onclick: () => (pick(v), paint()) }, typeof label === 'string' ? label : label.label),
      ),
    );

  const paint = () => {
    const look = avatars.mine;
    const modeCards = h(
      'div',
      { class: 'choice-list two' },
      Object.entries(MODES).map(([v, m]) =>
        h(
          'button',
          {
            class: `choice-card${look.mode === v ? ' selected' : ''}`,
            onclick: () => {
              avatars.setLook({ mode: v });
              if (v === 'anchor' && !avatars.mine.anchor) {
                close();
                onPlaceAnchor();
                return;
              }
              paint();
            },
          },
          h('strong', {}, m.label),
          h('span', { class: 'muted' }, m.desc),
        ),
      ),
    );
    const bodyOptions =
      look.mode === 'body'
        ? h(
            'div',
            { class: 'stack small-gap avatar-body' },
            h('h4', {}, 'Color'),
            h(
              'div',
              { class: 'swatches' },
              COLORS.map((c) =>
                h('button', { class: `swatch${c === look.color ? ' active' : ''}`, style: `--c:${c}`, 'aria-label': `Color ${c}`, onclick: () => (avatars.setLook({ color: c }), paint()) }),
              ),
              h('input', { type: 'color', class: 'swatch custom', value: look.color, 'aria-label': 'Otro color', onchange: (e) => (avatars.setLook({ color: e.target.value }), paint()) }),
            ),
            h('h4', {}, 'Figura'),
            seg(FIGURES, look.figure, (v) => avatars.setLook({ figure: v })),
            h(
              'div',
              { class: 'row wrap' },
              h('button', { class: 'btn small', onclick: () => avatars.placeChair() }, '🪑 Agregar silla'),
              avatars.seated
                ? h('button', { class: 'btn small primary', onclick: () => (avatars.standUp(), paint()) }, 'Levantarme')
                : h('button', { class: 'btn small primary', onclick: () => (avatars.sitDown(), paint()) }, 'Sentarme en la silla más cercana'),
            ),
            h('p', { class: 'muted small' }, 'Mueve tu puntero para que camine; si lo subes mucho, salta. Se para sobre figuras, notas, imágenes y documentos.'),
          )
        : null;
    const anchorOptions =
      look.mode === 'anchor'
        ? h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => (close(), onPlaceAnchor()) }, '📍 Cambiar de lugar'))
        : null;
    body.replaceChildren(
      h('h2', {}, 'Mi cámara y avatar'),
      cameraOn ? null : h('p', { class: 'muted small' }, 'Tu cámara está apagada: el monigote se verá con tus iniciales. Enciéndela con el botón 📷.'),
      h('h4', {}, 'Dónde se ve'),
      modeCards,
      anchorOptions,
      bodyOptions,
      h('h4', {}, 'Forma de la cámara'),
      seg(SHAPES, look.shape, (v) => avatars.setLook({ shape: v })),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: close }, 'Listo')),
    );
  };
  paint();
}
