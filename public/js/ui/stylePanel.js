import { h } from './dom.js';
import { STAMPS } from '../tools/stamp.js';
import { drawElement } from '../render/draw.js';
import { createElement } from '/shared/elements.js';
import { local } from '../util/storage.js';

export const NOTE_COLORS = ['#ffec99', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#d0bfff', '#ffd8a8'];

/**
 * Una sola paleta para todos los pinceles (el neón brilla con cualquier color):
 * neutros, clásicos y vivos.
 */
export const PALETTE = [
  '#1e1e1e', '#868e96', '#ffffff', '#e03131', '#f76707', '#f59f00',
  '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#8d5524',
  '#39ff14', '#00f0ff', '#ff2bd6', '#fff01f', '#ff5e00', '#b026ff',
];
export const FILL_COLORS = ['transparent', '#ffc9c9', '#ffd8a8', '#ffec99', '#b2f2bb', '#a5d8ff', '#d0bfff', '#e9ecef'];
export const BRUSH_OPTIONS = [
  { value: 'pen', label: 'Lápiz', icon: '✎' },
  { value: 'marker', label: 'Marcador', icon: '▬' },
  { value: 'highlighter', label: 'Resaltador', icon: '▮' },
  { value: 'neon', label: 'Neón', icon: '✦' },
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

/** Grosor en porcentaje (1–100 %) ↔ grosor real (1–48). */
const MAX_WIDTH = 48;
export const widthToPct = (w) => Math.round(((Math.min(MAX_WIDTH, Math.max(1, w)) - 1) / (MAX_WIDTH - 1)) * 99 + 1);
export const pctToWidth = (p) => Math.round((1 + ((Math.min(100, Math.max(1, p)) - 1) / 99) * (MAX_WIDTH - 1)) * 10) / 10;
const WIDTH_PRESETS = [3, 8, 20, 45]; // % rápidos

const RECENT_KEY = 'trazo:colors:recent';
const MAX_RECENT = 6;

/**
 * Panel de estilo: vista previa, pincel, color (paleta única + personalizados recientes),
 * grosor y opacidad en %, relleno, tipo de línea, sellos, notas y tamaño de texto.
 * `onChange(partialStyle)` se llama con cada cambio.
 */
export function createStylePanel(container, style, onChange) {
  const refreshers = [];
  let recent = local.get(RECENT_KEY, []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));

  // ---- Vista previa del trazo con el estilo actual ----
  const preview = h('canvas', { class: 'style-preview', width: 360, height: 72, 'aria-hidden': 'true' });
  const paintPreview = () => {
    const dpr = 2;
    const c2d = preview.getContext('2d');
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, preview.width, preview.height);
    const dark = document.body.dataset.paper === 'dark' || document.body.dataset.paper === 'chalk';
    c2d.fillStyle = dark ? '#1f2328' : '#f8f9fa';
    c2d.fillRect(0, 0, preview.width, preview.height);
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push([i * 6.5, Math.sin(i / 3.2) * 9]);
    drawElement(
      c2d,
      createElement('pen', {
        x: 14,
        y: 18,
        points: pts,
        stroke: style.stroke,
        strokeWidth: Math.min(style.strokeWidth, 22),
        brush: style.brush,
        dash: style.dash,
        opacity: style.opacity,
      }),
    );
  };
  refreshers.push(paintPreview);

  const swatchGroup = (key, values, { label = (v) => `Color ${v}` } = {}) => {
    const buttons = values.map((value) =>
      h('button', {
        class: `swatch${value === 'transparent' ? ' none' : ''}`,
        style: value === 'transparent' ? undefined : `--c:${value}`,
        title: value === 'transparent' ? 'Sin relleno' : value,
        'aria-label': value === 'transparent' ? 'Sin relleno' : label(value),
        onclick: () => onChange({ [key]: value }),
      }),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', values[i] === style[key])));
    return buttons;
  };

  const colorSection = () => {
    const palette = swatchGroup('stroke', PALETTE);
    const recentBox = h('div', { class: 'swatches recent' });
    const paintRecent = () => {
      recentBox.replaceChildren(
        ...recent.map((c) =>
          h('button', {
            class: `swatch${c === style.stroke ? ' active' : ''}`,
            style: `--c:${c}`,
            title: c,
            'aria-label': `Color personalizado ${c}`,
            onclick: () => onChange({ stroke: c }),
          }),
        ),
      );
      recentBox.hidden = recent.length === 0;
    };
    const custom = h('input', {
      type: 'color',
      class: 'swatch custom',
      title: 'Color personalizado',
      'aria-label': 'Color personalizado',
      oninput: (e) => onChange({ stroke: e.target.value }),
      // Al cerrar el selector se guarda entre los recientes.
      onchange: (e) => {
        const c = e.target.value.toLowerCase();
        if (PALETTE.includes(c)) return;
        recent = [c, ...recent.filter((x) => x !== c)].slice(0, MAX_RECENT);
        local.set(RECENT_KEY, recent);
        paintRecent();
      },
    });
    const hex = h('span', { class: 'hex' });
    refreshers.push(() => {
      custom.value = /^#[0-9a-f]{6}$/i.test(style.stroke) ? style.stroke : '#000000';
      custom.classList.toggle('active', !PALETTE.includes(style.stroke));
      hex.textContent = style.stroke.toUpperCase();
      paintRecent();
    });
    return h(
      'section',
      {},
      h('h3', {}, 'Color ', hex),
      h('div', { class: 'swatches palette' }, palette, custom),
      recentBox,
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
        { class: `opt brush brush-${o.value}`, title: o.label, onclick: () => onChange({ brush: o.value }) },
        h('span', { class: 'brush-icon' }, o.icon),
        h('span', { class: 'brush-label' }, o.label),
      ),
    );
    refreshers.push(() => {
      buttons.forEach((b, i) => b.classList.toggle('active', BRUSH_OPTIONS[i].value === style.brush));
      container.classList.toggle('neon-on', style.brush === 'neon'); // la paleta brilla con el neón
    });
    return h('section', {}, h('h3', {}, 'Pincel'), h('div', { class: 'opts brushes' }, buttons));
  };

  /** Control deslizante en % con valor visible y botones rápidos opcionales. */
  const slider = ({ title, min, max, get, set, presets = [] }) => {
    const value = h('span', { class: 'slider-value' });
    const input = h('input', { type: 'range', min, max, step: 1, 'aria-label': title, oninput: (e) => set(Number(e.target.value)) });
    const chips = presets.map((p) => h('button', { class: 'chip', onclick: () => set(p), title: `${p}%` }, `${p}%`));
    refreshers.push(() => {
      const v = get();
      input.value = String(v);
      value.textContent = `${v}%`;
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
      chips.forEach((c, i) => c.classList.toggle('active', presets[i] === v));
    });
    return h(
      'section',
      {},
      h('h3', {}, title, value),
      input,
      chips.length ? h('div', { class: 'chips' }, chips) : null,
    );
  };

  const widthSection = slider({
    title: 'Tamaño ',
    min: 1,
    max: 100,
    get: () => widthToPct(style.strokeWidth),
    set: (p) => onChange({ strokeWidth: pctToWidth(p) }),
    presets: WIDTH_PRESETS,
  });
  const opacitySection = slider({
    title: 'Opacidad ',
    min: 5,
    max: 100,
    get: () => Math.round(style.opacity * 100),
    set: (p) => onChange({ opacity: p / 100 }),
    presets: [25, 50, 75, 100],
  });

  const fill = swatchGroup('fill', FILL_COLORS);

  const stampSection = () => {
    const buttons = STAMPS.map((s) =>
      h('button', { class: 'opt stamp-opt', title: `Sello ${s}`, 'aria-label': `Sello ${s}`, onclick: () => onChange({ stamp: s }) }, s),
    );
    refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', STAMPS[i] === style.stamp)));
    return h('section', { class: 'sec-stamps' }, h('h3', {}, 'Sellos'), h('div', { class: 'opts stamps' }, buttons));
  };
  const noteSection = () =>
    h('section', { class: 'sec-notes' }, h('h3', {}, 'Notas adhesivas'), h('div', { class: 'swatches' }, swatchGroup('noteColor', NOTE_COLORS)));

  const tag = (node, cls) => (node.classList.add(cls), node);
  container.replaceChildren(
    h('div', { class: 'sec-preview' }, preview),
    tag(brushSection(), 'sec-brush'),
    tag(colorSection(), 'sec-color'),
    tag(widthSection, 'sec-width'),
    tag(opacitySection, 'sec-opacity'),
    tag(h('section', {}, h('h3', {}, 'Relleno'), h('div', { class: 'swatches' }, fill)), 'sec-fill'),
    tag(optionGroup('Línea', 'dash', DASH_OPTIONS, (o) => h('span', { class: `dash-sample ${o.value}` })), 'sec-dash'),
    stampSection(),
    noteSection(),
    tag(optionGroup('Texto', 'fontSize', FONT_SIZES, (o) => o.label), 'sec-text'),
  );

  const refresh = () => refreshers.forEach((r) => r());
  refresh();
  return { refresh };
}
