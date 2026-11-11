import { MSG } from '/shared/protocol.js';
import { createElement } from '/shared/elements.js';
import { drawFigure, drawHead, drawName, chairSeat } from './figure.js';
import { local } from '../util/storage.js';

const PREFS_KEY = 'trazo:avatar';
const TICK_MS = 33;
const SEND_MS = 66;
const GRAVITY = 2400;
const MAX_SPEED = 340;
const JUMP = 1050;
/** Tipos de elemento sobre los que el monigote puede pararse. */
const SOLID = new Set(['rect', 'note', 'image', 'doc', 'file', 'chair', 'text']);

export const DEFAULT_LOOK = { mode: 'fixed', shape: 'auto', color: '#4263eb', figure: 'neutro', anchor: null };

/**
 * Cámaras y avatares de cada persona:
 *  - fixed: burbuja en la presentación (la ubica el anfitrión).
 *  - pointer: la cámara sigue el puntero de su dueño.
 *  - anchor: queda fija en un lugar de la pizarra (se mueve y escala con ella).
 *  - body: monigote con la cámara como cabeza; camina hacia el puntero con gravedad,
 *          se para sobre figuras, notas e imágenes, salta y se sienta en sillas.
 * La física del monigote la calcula su dueño y la comparte (~15 veces por segundo);
 * los demás interpolan. El video solo se ve donde existe (la presentación principal y el propio).
 */
export class Avatars {
  constructor({ scene, viewport, overlay, render, send, getMe, getPeers, getFloor, onLookChange = () => {}, toast = () => {}, addChair }) {
    Object.assign(this, { scene, viewport, overlay, render, send, getMe, getPeers, getFloor, onLookChange, toast, addChair });
    this.mine = { ...DEFAULT_LOOK, ...local.get(PREFS_KEY, {}) };
    this.others = new Map(); // id → { look, pos, shown }
    this.sim = null; // física del monigote propio
    this.pointer = null; // último punto del mundo donde estuvo mi puntero
    this.videoFor = () => null; // (id) → <video> con la cámara de esa persona (en la presentación principal)
    this.selfVideo = () => null; // mi propia cámara, si está encendida
    this.enabled = true; // false para las visitas
    this._lastSent = 0;
    this._lastPos = '';
    this._tick = setInterval(() => this._step(), TICK_MS);
  }

  // ---------------- Mi configuración ----------------
  setLook(partial) {
    this.mine = { ...this.mine, ...partial };
    local.set(PREFS_KEY, this.mine);
    if (this.mine.mode !== 'body') {
      this.sim = null;
    }
    this.publish();
    this.render();
  }

  /** Envía mi configuración a la sala. */
  publish() {
    if (!this.enabled) return;
    const { mode, shape, color, figure, anchor } = this.mine;
    this.send({ t: MSG.AVATAR, mode, shape, color, figure, ...(anchor ? { anchor } : {}) });
    this._lastPos = '';
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.sim = null;
    this.render();
  }

  setPointer(p) {
    this.pointer = { x: p.x, y: p.y };
  }

  // ---------------- Mensajes ----------------
  handle(msg) {
    switch (msg.t) {
      case MSG.WELCOME:
        this.others.clear();
        for (const p of msg.peers) if (p.avatar) this._setOther(p.id, p.avatar, p.avatarPos);
        this.publish();
        break;
      case MSG.PEER_JOIN:
        if (msg.peer.avatar) this._setOther(msg.peer.id, msg.peer.avatar, msg.peer.avatarPos);
        break;
      case MSG.AVATAR:
        if (msg.mode === 'off') {
          this.others.delete(msg.id);
          this.onLookChange(msg.id, null);
        } else this._setOther(msg.id, msg, this.others.get(msg.id)?.pos);
        this.render();
        break;
      case MSG.AVATAR_POS: {
        const o = this.others.get(msg.id);
        if (!o) return;
        o.pos = msg;
        if (!o.shown || o.shown.p !== msg.p || Math.hypot(o.shown.x - msg.x, o.shown.y - msg.y) > 800) o.shown = { ...msg };
        this.render();
        break;
      }
      case MSG.PEER_LEAVE:
        this.others.delete(msg.id);
        break;
    }
  }

  _setOther(id, look, pos) {
    const clean = { mode: look.mode, shape: look.shape, color: look.color, figure: look.figure, anchor: look.anchor ?? null };
    const prev = this.others.get(id);
    this.others.set(id, { look: clean, pos: pos ?? prev?.pos ?? null, shown: prev?.shown ?? (pos ? { ...pos } : null) });
    this.onLookChange(id, clean);
  }

  // ---------------- Física del monigote propio ----------------
  _surfaces() {
    const out = [];
    for (const el of this.scene.alive()) {
      if (!SOLID.has(el.type)) continue;
      const x1 = Math.min(el.x, el.x + (el.w || 0));
      const x2 = Math.max(el.x, el.x + (el.w || 0));
      const top = el.type === 'chair' ? chairSeat(el).seatY : Math.min(el.y, el.y + (el.h || 0));
      out.push({ x1, x2, y: top });
    }
    return out;
  }

  _spawn() {
    const floor = this.getFloor();
    const view = floor.view;
    const x = this.pointer?.x ?? view.x + view.w / 2;
    this.sim = { x, y: view.y + 40, vx: 0, vy: 0, f: 1, w: 0, m: true, s: false, chair: null, onGround: false, p: this.scene.page };
  }

  _step() {
    if (!this.enabled || this.mine.mode !== 'body') return;
    if (!this.sim || this.sim.p !== this.scene.page) this._spawn();
    const sim = this.sim;
    const dt = TICK_MS / 1000;
    if (sim.s) {
      const chair = this.scene.get(sim.chair);
      if (!chair || chair.isDeleted || (chair.page ?? 0) !== this.scene.page) this.standUp();
      else {
        const seat = chairSeat(chair);
        sim.x = seat.x;
        sim.y = seat.seatY + 46; // la cadera queda sobre el asiento
        sim.f = 1;
        sim.m = false;
      }
    } else {
      const { y: floorY } = this.getFloor();
      const target = this.pointer ?? { x: sim.x, y: sim.y };
      const dx = target.x - sim.x;
      const want = Math.abs(dx) < 12 ? 0 : Math.sign(dx) * Math.min(MAX_SPEED, Math.abs(dx) * 3);
      sim.vx += (want - sim.vx) * 0.25;
      sim.vy = Math.min(sim.vy + GRAVITY * dt, 1800);
      const prevY = sim.y;
      sim.x += sim.vx * dt;
      sim.y += sim.vy * dt;
      let ground = floorY;
      const surfaces = this._surfaces();
      for (const s of surfaces) {
        if (sim.x >= s.x1 && sim.x <= s.x2 && s.y >= prevY - 2 && s.y < ground) ground = s.y;
      }
      if (sim.y >= ground) {
        sim.y = ground;
        sim.vy = 0;
        sim.onGround = true;
      } else sim.onGround = false;
      // Salta para subirse a algo: si el puntero está sobre una superficie más alta y cercana.
      if (sim.onGround && target.y < sim.y - 40 && Math.abs(dx) < 280) {
        const step = surfaces.some((s) => target.x >= s.x1 - 20 && target.x <= s.x2 + 20 && s.y < sim.y - 10 && s.y > sim.y - 260 && s.y >= target.y - 40);
        if (step) sim.vy = -JUMP;
      }
      sim.m = Math.abs(sim.vx) > 25 || !sim.onGround;
      if (sim.m) sim.w = (sim.w + (Math.abs(sim.vx) * dt) / 110) % 1;
      if (Math.abs(sim.vx) > 8) sim.f = Math.sign(sim.vx);
    }
    sim.p = this.scene.page;
    this.render();
    const now = performance.now();
    if (now - this._lastSent < SEND_MS) return;
    const pos = { x: sim.x, y: sim.y, f: sim.f, w: sim.w, m: sim.m, s: sim.s, p: sim.p };
    const key = `${Math.round(pos.x)},${Math.round(pos.y)},${pos.f},${pos.m},${pos.s},${pos.p}`;
    if (key === this._lastPos && !pos.m) return;
    this._lastPos = key;
    this._lastSent = now;
    this.send({ t: MSG.AVATAR_POS, ...pos });
  }

  /** Se sienta en la silla más cercana de la página (si hay una a menos de 500 unidades). */
  sitDown() {
    if (this.mine.mode !== 'body' || !this.sim) return this.toast('Primero elige «Monigote»');
    let best = null;
    for (const el of this.scene.alive()) {
      if (el.type !== 'chair') continue;
      const seat = chairSeat(el);
      const d = Math.hypot(seat.x - this.sim.x, seat.y - this.sim.y);
      if (!best || d < best.d) best = { el, d };
    }
    if (!best || best.d > 500) return this.toast('No hay una silla cerca: acércate a una o agrega una');
    this.sim.s = true;
    this.sim.chair = best.el.id;
    this._lastPos = '';
  }

  standUp() {
    if (!this.sim) return;
    this.sim.s = false;
    this.sim.chair = null;
    this.sim.vy = -500;
    this._lastPos = '';
  }

  get seated() {
    return Boolean(this.sim?.s);
  }

  /** Agrega una silla junto al monigote (o en el centro de la vista). */
  placeChair() {
    const floor = this.getFloor();
    const x = this.sim ? this.sim.x + 70 * (this.sim.f || 1) : floor.view.x + floor.view.w / 2;
    const y = (this.sim?.onGround ? this.sim.y : floor.y) - 110;
    this.addChair(createElement('chair', { x: x - 45, y, w: 90, h: 110, fill: '#a9714b' }));
  }

  // ---------------- Dibujo ----------------
  _lookFor(id, look) {
    const peers = this.getPeers();
    const me = this.getMe();
    const isMe = id === me?.id;
    const person = isMe ? me : peers.get(id);
    const video = isMe ? this.selfVideo() : this.videoFor(id);
    return { ...look, name: person?.name ?? '', video, mirror: isMe, ring: person?.color ?? '#ffffff' };
  }

  /** Dibuja en coordenadas del mundo (monigotes y cámaras fijas en la pizarra). Devuelve true si hay animación. */
  drawWorld(ctx) {
    if (!this.enabled && !this.others.size) return false;
    let animate = false;
    const page = this.scene.page;
    const me = this.getMe();
    const list = [...this.others.entries()].map(([id, o]) => ({ id, ...o }));
    if (this.enabled && me) list.push({ id: me.id, look: this.mine, pos: this.sim, shown: this.sim, self: true });
    for (const a of list) {
      const look = this._lookFor(a.id, a.look);
      if (a.look.mode === 'body') {
        if (!a.pos || (a.pos.p ?? 0) !== page) continue;
        const s = a.shown;
        if (!a.self) {
          // Interpolación hacia la última posición recibida.
          s.x += (a.pos.x - s.x) * 0.35;
          s.y += (a.pos.y - s.y) * 0.35;
          s.f = a.pos.f;
          s.m = a.pos.m;
          s.s = a.pos.s;
          if (a.pos.m) s.w = ((s.w ?? 0) + 0.05) % 1;
          if (Math.abs(a.pos.x - s.x) > 0.5 || Math.abs(a.pos.y - s.y) > 0.5 || s.m) animate = true;
        } else animate = true;
        drawFigure(ctx, s.x, s.y, s, look);
        if (look.video) animate = true;
      } else if (a.look.mode === 'anchor' && a.look.anchor && (a.look.anchor.p ?? 0) === page && (look.video || a.self)) {
        const { x, y } = a.look.anchor;
        drawHead(ctx, x, y, 80, look);
        drawName(ctx, x, y + 88, look.name, look.ring, 16);
        if (look.video) animate = true;
      }
    }
    return animate;
  }

  /** Dibuja en coordenadas de pantalla (cámaras que siguen el puntero). */
  drawScreen(ctx) {
    let animate = false;
    const page = this.scene.page;
    const me = this.getMe();
    const items = [...this.others.entries()].map(([id, o]) => ({ id, look: o.look, cursor: this.overlay.cursors.get(id) }));
    if (this.enabled && me && this.mine.mode === 'pointer' && this.pointer) {
      items.push({ id: me.id, look: this.mine, cursor: { ...this.pointer, page }, self: true });
    }
    for (const it of items) {
      if (it.look.mode !== 'pointer' || !it.cursor) continue;
      if (it.cursor.page !== undefined && it.cursor.page !== page) continue;
      const look = this._lookFor(it.id, it.look);
      if (!look.video && !it.self) continue;
      const p = this.viewport.toScreen(it.cursor.x, it.cursor.y);
      drawHead(ctx, p.x + 46, p.y + 46, 36, look);
      if (look.video) animate = true;
    }
    return animate;
  }
}
