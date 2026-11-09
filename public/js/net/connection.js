import { MSG, ERR } from '/shared/protocol.js';
import { Emitter } from '../util/emitter.js';

const FATAL = new Set([ERR.ROOM_NOT_FOUND, ERR.PIN_REQUIRED, ERR.PIN_INVALID]);

/**
 * Conexión WebSocket con reconexión automática (espera exponencial).
 * Eventos: status ('connecting' | 'online' | 'offline'), message (msg), fatal (error).
 */
export class Connection extends Emitter {
  constructor({ room, getJoin }) {
    super();
    this.room = room;
    this.getJoin = getJoin; // () => { name, pin }
    this.ws = null;
    this.status = 'offline';
    this._retry = 0;
    this._stopped = false;
    this._timer = null;
  }

  get online() {
    return this.status === 'online';
  }

  connect() {
    this._stopped = false;
    clearTimeout(this._timer);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this._setStatus('connecting');

    ws.onopen = () => ws.send(JSON.stringify({ t: MSG.JOIN, room: this.room, ...this.getJoin() }));
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === MSG.WELCOME) {
        this._retry = 0;
        this._setStatus('online');
      }
      if (msg.t === MSG.ERROR && FATAL.has(msg.code)) {
        this._stopped = true;
        this.emit('fatal', msg);
        return;
      }
      this.emit('message', msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this._setStatus('offline');
      if (this._stopped) return;
      const delay = Math.min(8000, 500 * 2 ** this._retry++);
      this._timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {}; // el cierre se gestiona en onclose
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN && this.online) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._timer);
    this.ws?.close();
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }
}
