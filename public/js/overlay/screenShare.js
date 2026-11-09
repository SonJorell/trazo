import { MSG } from '/shared/protocol.js';

const FPS = 6;
const MAX_WIDTH = 1600;
const TARGET_CHARS = 300_000; // tamaño objetivo del cuadro en base64
const MAX_CHARS = 460_000;

/**
 * Captura la pantalla y envía cuadros JPEG a la sala para que los demás vean
 * la pantalla de este PC de fondo. Ajusta la calidad para no pasar del límite
 * y no envía si nadie está mirando o la red va atrasada.
 */
export class ScreenSharer {
  /**
   * @param {{ connection, hasViewers: () => boolean, getSize: () => {w,h}, onState: (on:boolean) => void }} deps
   */
  constructor({ connection, hasViewers, getSize, onState }) {
    this.connection = connection;
    this.hasViewers = hasViewers;
    this.getSize = getSize;
    this.onState = onState;
    this.stream = null;
    this.video = null;
    this.canvas = document.createElement('canvas');
    this.timer = null;
    this.quality = 0.6;
    this.busy = false;
  }

  get active() {
    return this.stream !== null;
  }

  async toggle() {
    if (this.active) this.stop();
    else await this.start();
  }

  async start() {
    if (this.active) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador no permite capturar la pantalla');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    this.stream = stream;
    this.video = video;
    this.timer = setInterval(() => this._tick(), 1000 / FPS);
    this.onState(true);
  }

  stop() {
    if (!this.active) return;
    clearInterval(this.timer);
    this.timer = null;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.video = null;
    this.connection.send({ t: MSG.SCREEN_STOP });
    this.onState(false);
  }

  _tick() {
    const { video, canvas } = this;
    if (this.busy || !video?.videoWidth) return;
    if (!this.connection.online || !this.hasViewers()) return;
    if (this.connection.bufferedAmount > 300_000) return; // la red va atrasada: saltar cuadro
    this.busy = true;
    try {
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', this.quality);

      // Calidad adaptativa: baja si el cuadro es grande, sube si sobra margen.
      if (data.length > TARGET_CHARS && this.quality > 0.3) this.quality -= 0.05;
      else if (data.length < TARGET_CHARS * 0.6 && this.quality < 0.8) this.quality += 0.02;
      if (data.length > MAX_CHARS) return;

      const { w, h } = this.getSize();
      this.connection.send({ t: MSG.SCREEN, w, h, data });
    } finally {
      this.busy = false;
    }
  }
}
