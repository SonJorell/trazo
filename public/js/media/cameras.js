import { MSG } from '/shared/protocol.js';

/**
 * Cámaras con WebRTC (solo video) dentro de la red local.
 *
 * - CameraSender (celular / participante): envía su cámara a cada participante que proyecta
 *   (`display: true`, p. ej. la app de overlay o el anfitrión).
 * - CameraReceiver (quien proyecta): acepta esas conexiones y muestra burbujas de video.
 *
 * La señalización (ofertas, respuestas y candidatos) viaja por el WebSocket de la sala con
 * mensajes `rtc` dirigidos. No se usan servidores STUN/TURN: en la misma red no hacen falta.
 */
const RTC_CONFIG = { iceServers: [] };

const sendSignal = (connection, to, data) => connection.send({ t: MSG.RTC, to, data });

export class CameraSender {
  /**
   * @param {{ connection, getDisplays: () => string[], onState: (on:boolean) => void, onPreview: (stream|null) => void }} deps
   */
  constructor({ connection, getDisplays, onState = () => {}, onPreview = () => {} }) {
    this.connection = connection;
    this.getDisplays = getDisplays;
    this.onState = onState;
    this.onPreview = onPreview;
    this.stream = null;
    this.facing = 'user';
    this.pcs = new Map(); // id del que proyecta → RTCPeerConnection
  }

  get active() {
    return this.stream !== null;
  }

  static supported() {
    return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function';
  }

  async _open(facing) {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
      audio: false,
    });
  }

  async start() {
    if (this.active) return;
    this.stream = await this._open(this.facing);
    this.onPreview(this.stream);
    this.onState(true);
    for (const id of this.getDisplays()) this.connectTo(id);
  }

  stop() {
    if (!this.active) return;
    for (const [id, pc] of this.pcs) {
      sendSignal(this.connection, id, { type: 'bye' });
      pc.close();
    }
    this.pcs.clear();
    for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.onPreview(null);
    this.onState(false);
  }

  /** Cambia entre cámara frontal y trasera sin cortar las conexiones. */
  async switchCamera() {
    if (!this.active) return;
    const next = this.facing === 'user' ? 'environment' : 'user';
    const stream = await this._open(next);
    const track = stream.getVideoTracks()[0];
    for (const pc of this.pcs.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      await sender?.replaceTrack(track);
    }
    for (const t of this.stream.getTracks()) t.stop();
    this.stream = stream;
    this.facing = next;
    this.onPreview(stream);
  }

  async connectTo(id, retry = true) {
    if (!this.active || this.pcs.has(id)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pcs.set(id, pc);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = (e) => e.candidate && sendSignal(this.connection, id, { type: 'candidate', candidate: e.candidate });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.disconnect(id);
        if (retry) setTimeout(() => this.connectTo(id, false), 2000);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(this.connection, id, { type: 'offer', sdp: pc.localDescription.sdp });
  }

  disconnect(id) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
  }

  /** @returns {boolean} true si la señal era para este emisor */
  handles(from) {
    return this.pcs.has(from);
  }

  /** Las señales se procesan en orden (un candidato no puede adelantarse a la respuesta). */
  handleSignal(from, data) {
    this._queue = (this._queue ?? Promise.resolve()).then(() => this._handle(from, data)).catch(() => {});
    return this._queue;
  }

  async _handle(from, data) {
    const pc = this.pcs.get(from);
    if (!pc) return false;
    if (data?.type === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    else if (data?.type === 'candidate') await pc.addIceCandidate(data.candidate).catch(() => {});
    else if (data?.type === 'bye') this.disconnect(from);
    return true;
  }
}

export class CameraReceiver {
  /**
   * @param {{ connection, onStream: (id, stream) => void, onEnd: (id) => void }} deps
   */
  constructor({ connection, onStream, onEnd }) {
    this.connection = connection;
    this.onStream = onStream;
    this.onEnd = onEnd;
    this.pcs = new Map(); // id del participante → RTCPeerConnection
  }

  /** Las señales se procesan en orden (un candidato no puede adelantarse a la oferta). */
  handleSignal(from, data) {
    this._queue = (this._queue ?? Promise.resolve()).then(() => this._handle(from, data)).catch(() => {});
    return this._queue;
  }

  async _handle(from, data) {
    if (data?.type === 'offer') {
      this.close(from);
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.pcs.set(from, pc);
      pc.ontrack = (e) => this.onStream(from, e.streams[0] ?? new MediaStream([e.track]));
      pc.onicecandidate = (e) => e.candidate && sendSignal(this.connection, from, { type: 'candidate', candidate: e.candidate });
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(pc.connectionState)) this.close(from);
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(this.connection, from, { type: 'answer', sdp: pc.localDescription.sdp });
    } else if (data?.type === 'candidate') {
      await this.pcs.get(from)?.addIceCandidate(data.candidate).catch(() => {});
    } else if (data?.type === 'bye') {
      this.close(from);
    }
  }

  /** Corta una cámara; `notify` avisa al participante para que deje de enviarla. */
  close(id, notify = false) {
    const pc = this.pcs.get(id);
    if (!pc) return;
    if (notify) sendSignal(this.connection, id, { type: 'bye' });
    pc.close();
    this.pcs.delete(id);
    this.onEnd(id);
  }
}
