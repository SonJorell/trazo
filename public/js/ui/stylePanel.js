import { h } from './dom.js';

export const STROKE_COLORS = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'];
export const FILL_COLORS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];
export const WIDTHS = [
  { value: 2, label: 'Fino' },
  { value: 4, label: 'Medio' },
  { value: 8, label: 'Grueso' },
];
export const FONT_SIZES = [
  { value: 20, label: 'S' },
  { value: 28, label: 'M' },
  { value: 40, label: 'L' },
];

/**
 * Panel de estilo: color de trazo, relleno, grosor y tamaño de texto.
 * `onChange(partialStyle)` se llama con cada cambio.
 */
export function createStylePanel(container, style, onChange) {
  const groups = [];

  const swatchGroup = (title, key, values) => {
    const buttons = values.map((value) =>
      h('button', {
        class: `swatch${value === 'transparent' ? ' none' : ''}`,
        style: value === 'transparent' ? undefined : `--c:${value}`,
        title: value === 'transparent' ? 'Sin relleno' : value,
        'aria-label': value === 'transparent' ? 'Sin relleno' : `Color ${value}`,
        onclick: () => onChange({ [key]: value }),
      }),
    );
    const custom = h('input', {
      type: 'color',
      class: 'swatch custom',
      title: 'Otro color',
      'aria-label': 'Otro color',
      oninput: (e) => onChange({ [key]: e.target.value }),
    });
    groups.push(() => {
      buttons.forEach((b, i) => b.classList.toggle('active', values[i] === style[key]));
      custom.classList.toggle('active', !values.includes(style[key]));
      if (style[key] !== 'transparent') custom.value = style[key];
    });
    return h('section', {}, h('h3', {}, title), h('div', { class: 'swatches' }, buttons, custom));
  };

  const optionGroup = (title, key, options, render) => {
    const buttons = options.map((o) =>
      h('button', { class: 'opt', title: o.label, onclick: () => onChange({ [key]: o.value }) }, render(o)),
    );
    groups.push(() => buttons.forEach((b, i) => b.classList.toggle('active', options[i].value === style[key])));
    return h('section', {}, h('h3', {}, title), h('div', { class: 'opts' }, buttons));
  };

  container.replaceChildren(
    swatchGroup('Trazo', 'stroke', STROKE_COLORS),
    swatchGroup('Relleno', 'fill', FILL_COLORS),
    optionGroup('Grosor', 'strokeWidth', WIDTHS, (o) => h('span', { class: 'bar', style: `height:${o.value}px` })),
    optionGroup('Texto', 'fontSize', FONT_SIZES, (o) => o.label),
  );

  const refresh = () => groups.forEach((g) => g());
  refresh();
  return { refresh };
}
