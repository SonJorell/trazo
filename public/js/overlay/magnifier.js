/**
 * Lupa de Trazo: amplía una zona de la pantalla del PC dentro de la capa transparente.
 *
 * Captura la pantalla en vivo (la capa está excluida de la captura, así no se ve a sí misma),
 * la dibuja como fondo en coordenadas 1:1 y acerca la vista. Como las marcas también están en
 * esas coordenadas, se amplían junto con la pantalla y siguen alineadas.
 */
const ANIM_MS = 220;
const IDLE_STOP_MS = 15_000; // se suelta la captura si la lupa no se usa en un rato

export class Magnifier {
  constructor({ viewport, overlayState, render, onChange = () => {} }) {
    this.viewport = viewport;
    this.state = overlayState;
    this.render = render;
    this.onChange = onChange;
    this.video = null;
    this.stream = null;
    this.loop = null;
    this.anim = null;
    this.idleTimer = null;
    this.active = false;
  }

  async _ensureVideo() {
    clearTimeout(this.idleTimer);
    if (this.video) return this.video;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    this.stream = stream;
    this.video = video;
    return video;
  }

  _releaseVideo() {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.video = null;
  }

  /** Amplía `scale` veces centrando el punto normalizado (nx, ny) de la pantalla. */
  async zoomTo(nx, ny, scale) {
    if (scale <= 1.05) return this.reset();
    const video = await this._ensureVideo();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const vw = W / scale;
    const vh = H / scale;
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const target = {
      zoom: scale,
      x: clamp(nx * W - vw / 2, W - vw),
      y: clamp(ny * H - vh / 2, H - vh),
    };
    this.state.screen = { img: video, w: W, h: H };
    if (!this.active) {
      this.active = true;
      this.loop = setInterval(this.render, 33); // la pantalla de fondo está en vivo
      this.onChange(true);
    }
    this._animate(target);
  }

  reset() {
    if (!this.active) return;
    this._animate({ zoom: 1, x: 0, y: 0 }, () => {
      this.active = false;
      clearInterval(this.loop);
      this.loop = null;
      this.state.screen = null;
      this.render();
      this.onChange(false);
      this.idleTimer = setTimeout(() => this._releaseVideo(), IDLE_STOP_MS);
    });
  }

  _animate(target, done) {
    cancelAnimationFrame(this.anim);
    const vp = this.viewport;
    const from = { zoom: vp.zoom, x: vp.x, y: vp.y };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ANIM_MS);
      const e = 1 - (1 - t) ** 3; // desaceleración suave
      vp.zoom = from.zoom + (target.zoom - from.zoom) * e;
      vp.x = from.x + (target.x - from.x) * e;
      vp.y = from.y + (target.y - from.y) * e;
      this.render();
      if (t < 1) this.anim = requestAnimationFrame(step);
      else done?.();
    };
    this.anim = requestAnimationFrame(step);
  }
}
