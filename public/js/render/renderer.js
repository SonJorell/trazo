import { getBounds, rectsIntersect } from '/shared/geometry.js';
import { effectiveWidth } from '/shared/elements.js';
import { drawElement, setDarkPaper } from './draw.js';
import { drawPattern, paperColors, isDarkPaper } from './background.js';
import { RESIZABLE, resizeHandle } from '../core/handles.js';

const SELECTION_COLOR = '#4263eb';

/**
 * Dibuja la escena y las capas de interfaz (selección, recuadro, cursores remotos).
 * Solo redibuja cuando algo pidió `requestRender()`.
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ scene, viewport, overlay, transparent? }} deps
   *   overlay = { selection:Set, marquee, cursors:Map, editingId, screen: { img, w, h } | null }
   *   transparent = true en el modo «sobre la pantalla»: sin fondo ni cuadrícula.
   */
  constructor(canvas, { scene, viewport, overlay, transparent = false, live = null }) {
    this.transparent = transparent;
    this.live = live; // trazos ajenos a medio dibujar
    this.background = { pattern: 'dots', color: 'white' };
    this.onDraw = null; // aviso tras cada dibujo (p. ej. para colocar la barra del documento)
    this.avatars = null; // cámaras y monigotes ({ drawWorld(ctx), drawScreen(ctx) } → ¿hay animación?)
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = scene;
    this.viewport = viewport;
    this.overlay = overlay;
    this.width = 0;
    this.height = 0;
    this._pending = false;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.requestRender();
  }

  /** Cambia el fondo de hoja de la sala. */
  setBackground(bg) {
    this.background = bg;
    setDarkPaper(!this.transparent && isDarkPaper(bg));
    this.requestRender();
  }

  requestRender() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      this.draw();
    });
  }

  draw() {
    const { ctx, viewport: vp, overlay } = this;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.transparent) {
      ctx.clearRect(0, 0, this.width, this.height);
    } else if (this.overlay.screen && document.body.classList.contains('immersive')) {
      ctx.fillStyle = '#111111'; // pantalla completa: fondo oscuro alrededor de la transmisión
      ctx.fillRect(0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = paperColors(this.background).paper;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    const z = vp.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, -vp.x * z, -vp.y * z);
    const view = vp.visibleRect(this.width, this.height);
    // El fondo de hoja es el mismo para todos; solo se omite alrededor de una pantalla en vivo a pantalla completa.
    if (!this.transparent && !(this.overlay.screen && document.body.classList.contains('immersive'))) {
      drawPattern(ctx, view, vp.zoom, this.background);
    }
    this._drawScreen();
    for (const el of this.scene.alive()) {
      if (el.id === overlay.editingId) continue;
      const b = getBounds(el);
      const pad = effectiveWidth(el) * 2 + 40; // incluye el halo del neón
      if (!rectsIntersect(view, { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 })) continue;
      drawElement(ctx, el);
    }
    if (this.live) {
      this.live.prune(this.scene);
      for (const el of this.live.visible(this.scene.page)) drawElement(ctx, el);
    }
    if (this.avatars?.drawWorld(ctx)) this.requestRender();
    this._drawSelection();
    this._drawMarquee();
    // Puntero láser: mientras haya estelas, se sigue animando.
    if (overlay.laser?.draw(ctx, vp.zoom)) this.requestRender();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawCursors();
    if (this.avatars?.drawScreen(ctx)) this.requestRender();
    this.onDraw?.();
  }

  /** Pantalla compartida en vivo: se dibuja en (0,0) con el tamaño de la pantalla de origen. */
  _drawScreen() {
    const s = this.overlay.screen;
    if (!s?.img) return;
    const { ctx, viewport: vp } = this;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12 / vp.zoom;
    ctx.drawImage(s.img, 0, 0, s.w, s.h);
    ctx.restore();
  }

  _drawSelection() {
    const { ctx, overlay, viewport: vp } = this;
    if (!overlay.selection.size) return;
    const pad = 4 / vp.zoom;
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5 / vp.zoom;
    ctx.setLineDash([6 / vp.zoom, 4 / vp.zoom]);
    let single = null;
    for (const id of overlay.selection) {
      const el = this.scene.get(id);
      if (!el || el.isDeleted) continue;
      single = overlay.selection.size === 1 ? el : null;
      const b = getBounds(el);
      const sw = el.strokeWidth / 2;
      ctx.strokeRect(b.x - pad - sw, b.y - pad - sw, b.w + (pad + sw) * 2, b.h + (pad + sw) * 2);
    }
    ctx.setLineDash([]);
    if (single && RESIZABLE.has(single.type)) {
      const h = resizeHandle(single, vp.zoom);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x - h.size / 2, h.y - h.size / 2, h.size, h.size);
      ctx.strokeRect(h.x - h.size / 2, h.y - h.size / 2, h.size, h.size);
    }
    ctx.restore();
  }

  _drawMarquee() {
    const { ctx, overlay, viewport: vp } = this;
    const m = overlay.marquee;
    if (!m) return;
    ctx.save();
    ctx.fillStyle = 'rgba(66, 99, 235, 0.08)';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1 / vp.zoom;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.restore();
  }

  _drawCursors() {
    const { ctx, overlay, viewport: vp } = this;
    const now = Date.now();
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    let moving = false;
    for (const [id, c] of overlay.cursors) {
      if (now - c.at > 6000) continue;
      if (c.page !== undefined && c.page !== this.scene.page) continue;
      // Interpolación suave hacia la última posición recibida.
      if (c.tx !== undefined && (Math.abs(c.tx - c.x) > 0.5 || Math.abs(c.ty - c.y) > 0.5)) {
        c.x += (c.tx - c.x) * 0.35;
        c.y += (c.ty - c.y) * 0.35;
        moving = true;
      } else if (c.tx !== undefined) {
        c.x = c.tx;
        c.y = c.ty;
      }
      const p = vp.toScreen(c.x, c.y);
      if (p.x < -20 || p.y < -20 || p.x > this.width + 20 || p.y > this.height + 20) continue;
      ctx.fillStyle = c.color;
      if (this.avatars?.hidesLabel(id)) {
        // Su cámara (con su nombre) va junto al puntero: solo se dibuja la flecha.
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 3, p.y + 15);
        ctx.lineTo(p.x + 7, p.y + 10);
        ctx.lineTo(p.x + 14, p.y + 9);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3, p.y + 15);
      ctx.lineTo(p.x + 7, p.y + 10);
      ctx.lineTo(p.x + 14, p.y + 9);
      ctx.closePath();
      ctx.fill();
      const w = ctx.measureText(c.name).width + 10;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x + 12, p.y + 14, w, 18, 6);
      else ctx.rect(p.x + 12, p.y + 14, w, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.name, p.x + 17, p.y + 23);
    }
    ctx.restore();
    if (moving) this.requestRender();
  }
}
