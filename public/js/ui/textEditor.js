import { fontFor, LINE_HEIGHT } from '../render/draw.js';

/**
 * Editor de texto superpuesto al lienzo (un <textarea> posicionado sobre el mundo).
 * Confirma al perder el foco, con Ctrl/Cmd+Enter o con Escape.
 */
export class TextEditor {
  constructor(host, { viewport, onCommit }) {
    this.host = host;
    this.viewport = viewport;
    this.onCommit = onCommit;
    this.area = null;
    this.state = null;
  }

  get active() {
    return this.area !== null;
  }

  /** @param {{ x, y, text, fontSize, color, id }} state  id = null para texto nuevo */
  open(state) {
    this.commit();
    this.state = state;
    const area = document.createElement('textarea');
    area.className = 'text-editor';
    area.value = state.text;
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Texto');
    this.area = area;
    this.reposition();
    this.host.append(area);

    const grow = () => {
      area.style.height = 'auto';
      area.style.height = `${area.scrollHeight}px`;
      area.style.width = 'auto';
      area.style.width = `${Math.max(area.scrollWidth + 4, 40)}px`;
    };
    area.addEventListener('input', grow);
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        this.commit();
      }
    });
    area.addEventListener('blur', () => this.commit());
    requestAnimationFrame(() => {
      grow();
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    });
  }

  reposition() {
    if (!this.area) return;
    const { x, y, fontSize, color } = this.state;
    const p = this.viewport.toScreen(x, y);
    const size = fontSize * this.viewport.zoom;
    Object.assign(this.area.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      font: fontFor(size),
      lineHeight: String(LINE_HEIGHT),
      color,
    });
  }

  commit() {
    if (!this.area) return;
    const area = this.area;
    const state = this.state;
    this.area = null;
    this.state = null;
    area.remove();
    this.onCommit({ ...state, text: area.value.replace(/\s+$/, '') });
  }
}
