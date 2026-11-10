import { h } from './dom.js';
import { STAMPS } from '../tools/stamp.js';

export const NOTE_COLORS = ['#ffec99', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#d0bfff', '#ffd8a8'];

/** Colores clásicos. */
export const STROKE_COLORS = [
  '#1e1e1e', '#868e96', '#ffffff', '#e03131', '#f76707', '#f59f00',
  '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#8d5524',
];
/** Colores neón (lucen mejor con el pincel Neón o sobre fondos oscuros). */
export const NEON_COLORS = ['#39ff14', '#00f0ff', '#ff2bd6', '#fff01f', '#ff5e00', '#b026ff'];
export const FILL_COLORS = ['transparent', '#ffc9c9', '#ffd8a8', '#ffec99', '#b2f2bb', '#a5d8ff', '#d0bfff', '#e9ecef'];
export const BRUSH_OPTIONS = [
  { value: 'pen', label: 'Lápiz', icon: '✎' },
  { value: 'marker', label: 'Marcador', icon: '▬' },
  { value: 'highlighter', label: 'Resaltador', icon: '▮' },
  { value: 'neon', label: 'Neón', icon: '✦' },
];
export const WIDTHS = [
  { value: 1, label: 'Muy fino' },
  { value: 2, label: 'Fino' },
  { value: 4, label: 'Medio' },
  { value: 8, label: 'Grueso' },
  { value: 14, label: 'Muy grueso' },
];
export const DASH_OPTIONS = [
  { value: 'solid', label: 'Continua' },
  { value: 'dashed', label: 'Discontinua' },
  { value: 'dotted', label: 'Punteada' },
];
export const FONT_SIZES = [
  { value: 20, label: 'S' },
  { value: 28, label: 'M' },
  { value: 40, label: 'L' },
  { value: 64, label: 'XL' },
];

/** Colores recomendados al elegir cada pincel, si el actual no le queda bien. */
const BRUSH_DEFAULT_COLOR = { highlighter: '#fff01f', neon: '#00f0ff' };

/**
 * Panel de estilo: pincel, color (clásicos, neón y personalizado), relleno, tipo de línea,
 * grosor, opacidad y tamaño de texto. `onChange(partialStyle)` se llama con cada cambio.
 */
export function createStylePanel(container, style, onChange) {
  const refreshers = [];

  const swatchGroup = (title, key, values, extraClass = '') => {
    const buttons = values.map((value) =>
      h('button', {
        class: `swatch${value === 'transparent' ? ' none' : ''}${extraClass}`,
        style: value === 'transparent' ? undefined : `--c:${value}`,
        title: value === 'transparent' ? 'Sin relleno' : value,
        'aria-label': value === 'transparent' ? 'Sin relleno' : `Color ${value}`,
        onclick: () => onChange({ [key]: value }),
      }),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', values[i] === style[key])));
    return { buttons, title };
  };

  const colorSection = () => {
    const classic = swatchGroup('Clásicos', 'stroke', STROKE_COLORS);
    const neon = swatchGroup('Neón', 'stroke', NEON_COLORS, ' neon');
    const custom = h('input', {
      type: 'color',
      class: 'swatch custom',
      title: 'Otro color',
      'aria-label': 'Otro color',
      oninput: (e) => onChange({ stroke: e.target.value }),
    });
    refreshers.push(() => {
      const known = [...STROKE_COLORS, ...NEON_COLORS].includes(style.stroke);
      custom.classList.toggle('active', !known);
      custom.value = style.stroke;
    });
    return h(
      'section',
      {},
      h('h3', {}, 'Color'),
      h('div', { class: 'swatches' }, classic.buttons, custom),
      h('h4', {}, 'Neón'),
      h('div', { class: 'swatches' }, neon.buttons),
    );
  };

  const optionGroup = (title, key, options, render, extraClass = '') => {
    const buttons = options.map((o) =>
      h('button', { class: `opt${extraClass}`, title: o.label, 'aria-label': o.label, onclick: () => onChange({ [key]: o.value }) }, render(o)),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', options[i].value === style[key])));
    return h('section', {}, h('h3', {}, title), h('div', { class: 'opts' }, buttons));
  };

  const brushSection = () => {
    const buttons = BRUSH_OPTIONS.map((o) =>
      h(
        'button',
        {
          class: `opt brush brush-${o.value}`,
          title: o.label,
          onclick: () => {
            const change = { brush: o.value };
            const suggested = BRUSH_DEFAULT_COLOR[o.value];
            if (suggested && ['#1e1e1e', '#868e96', '#8d5524'].includes(style.stroke)) change.stroke = suggested;
            onChange(change);
          },
        },
        h('span', { class: 'brush-icon' }, o.icon),
        h('span', { class: 'brush-label' }, o.label),
      ),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', BRUSH_OPTIONS[i].value === style.brush)));
    return h('section', {}, h('h3', {}, 'Pincel'), h('div', { class: 'opts brushes' }, buttons));
  };

  const opacitySection = () => {
    const label = h('span', { class: 'opacity-value' });
    const input = h('input', {
      type: 'range',
      min: 10,
      max: 100,
      step: 5,
      'aria-label': 'Opacidad',
      oninput: (e) => onChange({ opacity: Number(e.target.value) / 100 }),
    });
    refreshers.push(() => {
      input.value = String(Math.round(style.opacity * 100));
      label.textContent = `${Math.round(style.opacity * 100)}%`;
    });
    return h('section', {}, h('h3', {}, 'Opacidad ', label), input);
  };

  const fill = swatchGroup('Relleno', 'fill', FILL_COLORS);

  const stampSection = () => {
    const buttons = STAMPS.map((s) =>
      h('button', { class: 'opt stamp-opt', title: `Sello ${s}`, 'aria-label': `Sello ${s}`, onclick: () => onChange({ stamp: s }) }, s),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', STAMPS[i] === style.stamp)));
    return h('section', { class: 'sec-stamps' }, h('h3', {}, 'Sellos'), h('div', { class: 'opts stamps' }, buttons));
  };
  const noteSection = () => {
    const g = swatchGroup('Notas', 'noteColor', NOTE_COLORS);
    return h('section', { class: 'sec-notes' }, h('h3', {}, 'Notas adhesivas'), h('div', { class: 'swatches' }, g.buttons));
  };

  const tag = (node, cls) => (node.classList.add(cls), node);
  container.replaceChildren(
    tag(brushSection(), 'sec-brush'),
    tag(colorSection(), 'sec-color'),
    tag(h('section', {}, h('h3', {}, 'Relleno'), h('div', { class: 'swatches' }, fill.buttons)), 'sec-fill'),
    tag(optionGroup('Grosor', 'strokeWidth', WIDTHS, (o) => h('span', { class: 'bar', style: `height:${Math.min(o.value, 12)}px` })), 'sec-width'),
    tag(optionGroup('Línea', 'dash', DASH_OPTIONS, (o) => h('span', { class: `dash-sample ${o.value}` })), 'sec-dash'),
    tag(opacitySection(), 'sec-opacity'),
    stampSection(),
    noteSection(),
    tag(optionGroup('Texto', 'fontSize', FONT_SIZES, (o) => o.label), 'sec-text'),
  );

  const refresh = () => refreshers.forEach((r) => r());
  refresh();
  return { refresh };
}
