import { h } from './dom.js';
import { ICONS } from './icons.js';
import { local } from '../util/storage.js';

const PREFS_KEY = 'trazo:cams';
export const CAM_SHAPES = { circle: 'Círculo', rounded: 'Redondeada', rect: 'Rectángulo' };
export const CAM_SIZES = { s: 'Pequeña', m: 'Mediana', l: 'Grande' };
export const CAM_LAYOUTS = {
  free: 'Libre (arrastrar)',
  'corner-br': 'Esquina inferior derecha',
  'corner-tr': 'Esquina superior derecha',
  row: 'Fila abajo',
  column: 'Columna a la derecha',
  grid: 'Cuadrícula a la derecha',
};
const DEFAULT_PREFS = { shape: 'rounded', size: 'm', layout: 'corner-br', names: true, mirror: false };
const SIZE_PX = { s: 150, m: 230, l: 340 };

/**
 * Burbujas de cámara sobre la pizarra o sobre la pantalla proyectada.
 * Forma, tamaño y disposición se eligen con el botón ⚙ y se recuerdan en este equipo.
 * En la disposición «Libre» se pueden arrastrar; doble clic cambia el tamaño de una sola.
 */
export class CameraBubbles {
  constructor({ getName, onClose }) {
    this.getName = getName;
    this.onClose = onClose;
    this.bubbles = new Map(); // id → { node, video, label }
    this.prefs = { ...DEFAULT_PREFS, ...local.get(PREFS_KEY, {}) };
    this.layer = document.body.appendChild(h('div', { class: 'cam-layer' }));
    this.settingsBtn = h('button', {
      class: 'cam-settings ov-hit',
      title: 'Cómo se ven las cámaras',
      'aria-label': 'Ajustes de las cámaras',
      html: ICONS.camera,
      hidden: true,
      onclick: () => this.openSettings(),
    });
    document.body.append(this.settingsBtn);
    this._applyPrefs();
    window.addEventListener('resize', () => this._clampAll());
  }

  show(id, stream) {
    let b = this.bubbles.get(id);
    if (!b) {
      const video = h('video', { autoplay: true, playsinline: true, muted: true });
      video.muted = true;
      const label = h('span', { class: 'cam-name' });
      const close = h('button', { class: 'cam-close', title: 'Quitar esta cámara', 'aria-label': 'Quitar cámara', html: ICONS.close });
      const node = h('div', { class: 'cam-bubble ov-hit' }, video, label, close);
      close.addEventListener('pointerdown', (e) => e.stopPropagation());
      close.addEventListener('click', () => this.onClose(id));
      node.addEventListener('dblclick', () => {
        const order = ['s', 'm', 'l'];
        const next = order[(order.indexOf(node.dataset.size || this.prefs.size) + 1) % order.length];
        node.dataset.size = next;
        if (this.prefs.layout === 'free') node.style.width = `${SIZE_PX[next]}px`;
      });
      this._makeDraggable(node);
      this.layer.append(node);
      b = { node, video, label };
      this.bubbles.set(id, b);
      if (this.prefs.layout === 'free') this._placeFree(node);
    }
    b.label.textContent = this.getName(id);
    b.video.srcObject = stream;
    b.video.play?.().catch(() => {});
    this.settingsBtn.hidden = false;
  }

  remove(id) {
    this.bubbles.get(id)?.node.remove();
    this.bubbles.delete(id);
    this.settingsBtn.hidden = this.bubbles.size === 0;
  }

  rename(id) {
    const b = this.bubbles.get(id);
    if (b) b.label.textContent = this.getName(id);
  }

  setPrefs(partial) {
    this.prefs = { ...this.prefs, ...partial };
    local.set(PREFS_KEY, this.prefs);
    this._applyPrefs();
  }

  _applyPrefs() {
    const p = this.prefs;
    this.layer.className = `cam-layer shape-${p.shape} size-${p.size} layout-${p.layout}${p.names ? '' : ' no-names'}${p.mirror ? ' mirror' : ''}`;
    for (const { node } of this.bubbles.values()) {
      delete node.dataset.size;
      if (p.layout === 'free') this._placeFree(node);
      else {
        node.style.left = '';
        node.style.top = '';
        node.style.width = '';
      }
    }
  }

  /** Panel de ajustes: forma, tamaño, disposición, nombres y espejo. */
  openSettings() {
    const existing = document.querySelector('.cam-settings-pop');
    if (existing) return existing.remove();
    const group = (title, key, options) => {
      const buttons = Object.entries(options).map(([value, label]) =>
        h('button', { class: `seg${this.prefs[key] === value ? ' active' : ''}`, onclick: () => (this.setPrefs({ [key]: value }), paint()) }, label),
      );
      const paint = () => buttons.forEach((b, i) => b.classList.toggle('active', Object.keys(options)[i] === this.prefs[key]));
      return h('div', { class: 'stack small-gap' }, h('h4', {}, title), h('div', { class: 'segmented wrap' }, buttons));
    };
    const toggle = (label, key) =>
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: this.prefs[key], onchange: (e) => this.setPrefs({ [key]: e.target.checked }) }), label);
    const pop = h(
      'div',
      { class: 'cam-settings-pop ov-hit', role: 'dialog', 'aria-label': 'Ajustes de las cámaras' },
      h('div', { class: 'row between' }, h('strong', {}, 'Cámaras'), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', html: ICONS.close, onclick: () => pop.remove() })),
      group('Forma', 'shape', CAM_SHAPES),
      group('Tamaño', 'size', CAM_SIZES),
      group('Ubicación', 'layout', CAM_LAYOUTS),
      toggle('Mostrar nombres', 'names'),
      toggle('Efecto espejo', 'mirror'),
    );
    document.body.append(pop);
  }

  /** Disposición libre: las nuevas se ordenan desde la esquina inferior derecha. */
  _placeFree(node) {
    const w = SIZE_PX[node.dataset.size || this.prefs.size];
    node.style.width = `${w}px`;
    if (node.style.left) return;
    const i = [...this.bubbles.values()].findIndex((b) => b.node === node);
    const perRow = Math.max(1, Math.floor((window.innerWidth - 24) / (w + 12)));
    const col = Math.max(0, i) % perRow;
    const row = Math.floor(Math.max(0, i) / perRow);
    node.style.left = `${window.innerWidth - (col + 1) * (w + 12)}px`;
    node.style.top = `${Math.max(60, window.innerHeight - (row + 1) * (w * 0.8 + 16) - 80)}px`;
  }

  _clampAll() {
    if (this.prefs.layout !== 'free') return;
    for (const { node } of this.bubbles.values()) {
      node.style.left = `${Math.min(window.innerWidth - 60, node.offsetLeft)}px`;
      node.style.top = `${Math.min(window.innerHeight - 60, node.offsetTop)}px`;
    }
  }

  _makeDraggable(node) {
    let start = null;
    node.addEventListener('pointerdown', (e) => {
      if (this.prefs.layout !== 'free') return;
      node.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, left: node.offsetLeft, top: node.offsetTop };
      node.classList.add('dragging');
    });
    node.addEventListener('pointermove', (e) => {
      if (!start) return;
      const left = Math.min(window.innerWidth - 40, Math.max(-node.offsetWidth + 40, start.left + e.clientX - start.x));
      const top = Math.min(window.innerHeight - 40, Math.max(0, start.top + e.clientY - start.y));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    });
    const end = () => {
      start = null;
      node.classList.remove('dragging');
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
}
