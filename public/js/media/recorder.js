/**
 * Grabación local de la sesión (el archivo queda en este equipo; no pasa por el servidor).
 *  - «board»: la pizarra tal como se ve (dibujos, fondo, monigotes, cursores) más las burbujas de
 *    cámara, compuestas en un lienzo a 30 cuadros por segundo. Funciona también en el celular.
 *  - «screen»: una pantalla, ventana o pestaña elegida por el usuario (solo en computadores).
 * Opcionalmente mezcla el micrófono.
 */
const FPS = 30;
const MAX_WIDTH = 1920;

export function pickMimeType() {
  // Sin fijar el perfil H.264: «avc1.42E01E» (nivel 3.0) falla en Safari/WebKit sobre ~720p.
  const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
}

export const canRecord = () => typeof window.MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
export const canRecordScreen = () => canRecord() && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export class SessionRecorder {
  constructor({ boardCanvas, onState = () => {} }) {
    this.boardCanvas = boardCanvas;
    this.onState = onState;
    this.recorder = null;
    this.chunks = [];
    this.tracks = [];
    this.startedAt = 0;
    this._loop = null;
  }

  get active() {
    return this.recorder !== null;
  }

  /** Lienzo compuesto: pizarra + burbujas de cámara visibles (con su forma redondeada). */
  _composite() {
    const src = this.boardCanvas;
    const scale = Math.min(1, MAX_WIDTH / src.width);
    const out = document.createElement('canvas');
    out.width = Math.round(src.width * scale);
    out.height = Math.round(src.height * scale);
    const g = out.getContext('2d');
    const rect = src.getBoundingClientRect();
    const k = out.width / rect.width; // píxeles de salida por píxel CSS
    const draw = () => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, out.width, out.height);
      g.drawImage(src, 0, 0, out.width, out.height);
      for (const bubble of document.querySelectorAll('.cam-bubble:not(.on-board)')) {
        const video = bubble.querySelector('video');
        const r = bubble.getBoundingClientRect();
        if (!video || video.readyState < 2 || !r.width) continue;
        const x = (r.left - rect.left) * k;
        const y = (r.top - rect.top) * k;
        const w = r.width * k;
        const hgt = r.height * k;
        const radius = parseFloat(getComputedStyle(bubble).borderTopLeftRadius) * k || 0;
        g.save();
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, hgt, Math.min(radius, w / 2, hgt / 2));
        else g.rect(x, y, w, hgt);
        g.clip();
        // Recorte tipo «cover» (como object-fit en la burbuja).
        const vr = video.videoWidth / video.videoHeight;
        const br = w / hgt;
        let sw = video.videoWidth;
        let sh = video.videoHeight;
        if (vr > br) sw = sh * br;
        else sh = sw / br;
        g.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, x, y, w, hgt);
        g.restore();
      }
    };
    draw();
    // Un intervalo (no requestAnimationFrame) para que siga grabando aunque la pestaña quede atrás.
    this._loop = setInterval(draw, 1000 / FPS);
    return out.captureStream(FPS);
  }

  /**
   * @param {'board'|'screen'} kind
   * @param {{ mic?: boolean }} opts
   */
  async start(kind, { mic = false } = {}) {
    if (this.active) return;
    let video;
    if (kind === 'screen') {
      video = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: FPS }, audio: true });
    } else {
      video = this._composite();
    }
    const tracks = [...video.getVideoTracks()];
    const audioTracks = [...video.getAudioTracks()];
    if (mic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audioTracks.push(...micStream.getAudioTracks());
        this.tracks.push(...micStream.getTracks());
      } catch {
        /* sin micrófono: se graba solo la imagen */
      }
    }
    // Mezcla de audio (pantalla + micrófono) en una sola pista.
    if (audioTracks.length > 1) {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      for (const t of audioTracks) ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
      this._audio = ac;
    } else tracks.push(...audioTracks);
    this.tracks.push(...video.getTracks());

    const stream = new MediaStream(tracks);
    this.mimeType = pickMimeType();
    this.recorder = new MediaRecorder(stream, { mimeType: this.mimeType || undefined, videoBitsPerSecond: 4_000_000 });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.onstop = () => this._finish();
    // Si el usuario deja de compartir desde el navegador, se termina la grabación.
    video.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());
    this.recorder.start(1000);
    this.startedAt = Date.now();
    this.onState(true);
  }

  stop() {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    this.recorder.stop();
  }

  _finish() {
    clearInterval(this._loop);
    for (const t of this.tracks) t.stop();
    this._audio?.close();
    this._audio = null;
    this.tracks = [];
    const type = this.recorder.mimeType || this.mimeType || 'video/webm';
    const blob = new Blob(this.chunks, { type });
    this.recorder = null;
    this.chunks = [];
    this.onState(false, blob, type.includes('mp4') ? 'mp4' : 'webm');
  }

  get elapsed() {
    return this.active ? Date.now() - this.startedAt : 0;
  }
}
