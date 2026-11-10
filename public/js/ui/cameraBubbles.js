import { h } from './dom.js';
import { ICONS } from './icons.js';

const SIZES = [160, 240, 360];

/**
 * Burbujas de cámara sobre la pizarra o sobre la pantalla proyectada.
 * Se pueden arrastrar, cambiar de tamaño (doble clic) y cerrar.
 */
export class CameraBubbles {
  constructor({ getName, onClose }) {
    this.getName = getName;
    this.onClose = onClose;
    this.bubbles = new Map(); // id → { node, video }
    this.layer = document.body.appendChild(h('div', { class: 'cam-layer' }));
  }

  show(id, stream) {
    let b = this.bubbles.get(id);
    if (!b) {
      const video = h('video', { autoplay: true, playsinline: true, muted: true });
      video.muted = true;
      const label = h('span', { class: 'cam-name' });
      const close = h('button', { class: 'cam-close', title: 'Quitar esta cámara', 'aria-label': 'Quitar cámara', html: ICONS.close });
      const node = h('div', { class: 'cam-bubble ov-hit', 'data-size': '1' }, video, label, close);
      close.addEventListener('pointerdown', (e) => e.stopPropagation());
      close.addEventListener('click', () => this.onClose(id));
      node.addEventListener('dblclick', () => {
        node.dataset.size = String((Number(node.dataset.size) + 1) % SIZES.length);
        this._applySize(node);
      });
      this._makeDraggable(node);
      this.layer.append(node);
      b = { node, video, label };
      this.bubbles.set(id, b);
      this._placeNew(node);
    }
    b.label.textContent = this.getName(id);
    b.video.srcObject = stream;
    b.video.play?.().catch(() => {});
  }

  remove(id) {
    this.bubbles.get(id)?.node.remove();
    this.bubbles.delete(id);
  }

  rename(id) {
    const b = this.bubbles.get(id);
    if (b) b.label.textContent = this.getName(id);
  }

  _applySize(node) {
    const w = SIZES[Number(node.dataset.size)];
    node.style.width = `${w}px`;
  }

  /** Coloca las burbujas nuevas en fila desde la esquina inferior derecha. */
  _placeNew(node) {
    this._applySize(node);
    const i = this.bubbles.size - 1;
    const w = SIZES[1];
    const perRow = Math.max(1, Math.floor((window.innerWidth - 24) / (w + 12)));
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    node.style.left = `${window.innerWidth - (col + 1) * (w + 12)}px`;
    node.style.top = `${window.innerHeight - (row + 1) * (w * 0.75 + 40) - 70}px`;
  }

  _makeDraggable(node) {
    let start = null;
    node.addEventListener('pointerdown', (e) => {
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
