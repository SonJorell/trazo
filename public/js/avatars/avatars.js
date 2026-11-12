import { MSG } from '/shared/protocol.js';
import { createElement } from '/shared/elements.js';
import { drawFigure, drawHead, drawName, chairSeat } from './figure.js';
import { local } from '../util/storage.js';

const PREFS_KEY = 'trazo:avatar';
const SEND_MS = 50; // 20 posiciones por segundo
const GRAVITY = 2400;
const MAX_SPEED = 330;
const JUMP = 1050;
const STRIDE = 130; // unidades recorridas por ciclo de caminata (dos pasos)
/** Tipos de elemento sobre los que el monigote puede pararse. */
const SOLID = new Set(['rect', 'note', 'image', 'doc', 'file', 'chair', 'text', 'stamp']);

export const DEFAULT_LOOK = { mode: 'fixed', shape: 'auto', color: '#4263eb', figure: 'neutro', acc: 'none', anchor: null };
const GESTURE_MS = 1800;

/** Suavizado exponencial independiente de los cuadros por segundo. */
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Variables de animación que se derivan del movimiento (las calcula cada equipo, así es fluido). */
function animate(state, dx, speed, airborne, dt) {
  state.phase = ((state.phase ?? 0) + Math.abs(dx) / STRIDE) % 1;
  state.amp += (clamp(speed / 220, 0, 1) - (state.amp ?? 0)) * ease(8, dt);
  state.air += ((airborne ? 1 : 0) - (state.air ?? 0)) * ease(12, dt);
  state.lean += (clamp(state.vx / 700, -1, 1) - (state.lean ?? 0)) * ease(6, dt);
  state.t = (state.t ?? 0) + dt;
}

/**
 * Cámaras y avatares de cada persona:
 *  - fixed: burbuja en la presentación (la ubica el anfitrión).
 *  - pointer: la cámara sigue el puntero de su dueño (con un leve retraso elástico).
 *  - anchor: queda fija en un lugar de la pizarra (se mueve y escala con ella).
 *  - body: monigote con la cámara como cabeza; camina hacia el puntero con gravedad,
 *          se para sobre figuras, notas e imágenes, salta para subirse y se sienta en sillas.
 * La física la calcula el dueño en cada cuadro y comparte posición y velocidad 20 veces por
 * segundo; los demás predicen con la velocidad y suavizan, y animan piernas y brazos según el
 * movimiento que ven (por eso se mueve fluido aunque la red tenga saltos).
 */
export class Avatars {
  constructor({ scene, viewport, overlay, render, send, getMe, getPeers, getFloor, onLookChange = () => {}, toast = () => {}, addChair }) {
    Object.assign(this, { scene, viewport, overlay, render, send, getMe, getPeers, getFloor, onLookChange, toast, addChair });
    this.mine = { ...DEFAULT_LOOK, ...local.get(PREFS_KEY, {}) };
    this.others = new Map(); // id → { look, pos, shown, at }
    this.followers = new Map(); // id → posición suavizada de la cámara que sigue al puntero
    this.sim = null; // física del monigote propio
    this.pointer = null; // último punto del mundo donde estuvo mi puntero
    this.videoFor = () => null; // (id) → <video> con la cámara de esa persona (en la presentación principal)
    this.selfVideo = () => null; // mi propia cámara, si está encendida
    this.enabled = true; // false para las visitas
    this._lastSent = 0;
    this._lastKey = '';
    this._lastFrame = 0;
    this._raf = 0;
    this._loop = this._loop.bind(this);
    this._ensureLoop();
  }

  // ---------------- Mi configuración ----------------
  setLook(partial) {
    this.mine = { ...this.mine, ...partial };
    local.set(PREFS_KEY, this.mine);
    if (this.mine.mode !== 'body') this.sim = null;
    this.publish();
    this._ensureLoop();
    this.render();
  }

  /** Envía mi configuración a la sala. */
  publish() {
    if (!this.enabled) return;
    const { mode, shape, color, figure, acc, anchor } = this.mine;
    this.send({ t: MSG.AVATAR, mode, shape, color, figure, acc, ...(anchor ? { anchor } : {}) });
    this._lastKey = '';
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.sim = null;
    this._ensureLoop();
    this.render();
  }

  setPointer(p) {
    this.pointer = { x: p.x, y: p.y };
  }

  /** ¿Esta persona lleva su cámara junto al puntero? */
  followsPointer(id) {
    return this.others.get(id)?.look.mode === 'pointer' && Boolean(this.videoFor(id));
  }

  /** Su nombre ya se ve junto a su cámara o sobre su monigote: el cursor va sin etiqueta. */
  hidesLabel(id) {
    return this.followsPointer(id) || this.others.get(id)?.look.mode === 'body';
  }

  /** Gesto del monigote al reaccionar (saludar, celebrar, corazones…). Lo anima cada equipo. */
  gesture(id, key) {
    const me = this.getMe();
    const target = id === me?.id || id === 'me' ? this.sim : this.others.get(id)?.shown;
    if (!target) return;
    target.gesture = { key, start: performance.now(), k: 0 };
    this._ensureLoop();
  }

  _tickGesture(state, now) {
    const g = state?.gesture;
    if (!g) return;
    g.k = (now - g.start) / GESTURE_MS;
    if (g.k >= 1) state.gesture = null;
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
        o.at = performance.now();
        if (!o.shown || o.shown.p !== msg.p || Math.hypot(o.shown.x - msg.x, o.shown.y - msg.y) > 900) {
          o.shown = { x: msg.x, y: msg.y, vx: 0, f: msg.f, amp: 0, air: 0, lean: 0, phase: 0, t: 0, p: msg.p };
        }
        this._ensureLoop();
        break;
      }
      case MSG.PEER_LEAVE:
        this.others.delete(msg.id);
        this.followers.delete(msg.id);
        break;
    }
  }

  _setOther(id, look, pos) {
    const clean = { mode: look.mode, shape: look.shape, color: look.color, figure: look.figure, acc: look.acc ?? 'none', anchor: look.anchor ?? null };
    const prev = this.others.get(id);
    const shown = prev?.shown ?? (pos ? { x: pos.x, y: pos.y, vx: 0, f: pos.f, amp: 0, air: 0, lean: 0, phase: 0, t: 0, p: pos.p } : null);
    this.others.set(id, { look: clean, pos: pos ?? prev?.pos ?? null, shown, at: performance.now() });
    this.onLookChange(id, clean);
    this._ensureLoop();
  }

  // ---------------- Bucle de animación ----------------
  /** Hay algo que animar: mi monigote, el de otros o cámaras que siguen punteros. */
  _busy() {
    if (this.enabled && (this.mine.mode === 'body' || this.mine.mode === 'pointer')) return true;
    for (const o of this.others.values()) if (o.look.mode === 'body' || o.look.mode === 'pointer') return true;
    return false;
  }

  _ensureLoop() {
    if (this._raf || !this._busy()) return;
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  _loop(now) {
    this._raf = 0;
    const dt = clamp((now - this._lastFrame) / 1000, 0.001, 0.05);
    this._lastFrame = now;
    if (this.enabled && this.mine.mode === 'body') this._stepSelf(dt, now);
    this._stepOthers(dt, now);
    this._tickGesture(this.sim, now);
    for (const o of this.others.values()) this._tickGesture(o.shown, now);
    this.render();
    if (this._busy()) this._raf = requestAnimationFrame(this._loop);
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
    const { view } = this.getFloor();
    const x = this.pointer?.x ?? view.x + view.w / 2;
    this.sim = { x, y: view.y + 40, vx: 0, vy: 0, f: 1, amp: 0, air: 1, lean: 0, phase: 0, t: 0, s: false, chair: null, onGround: false, p: this.scene.page };
  }

  _stepSelf(dt, now) {
    if (!this.sim || this.sim.p !== this.scene.page) this._spawn();
    const sim = this.sim;
    const prevX = sim.x;
    if (sim.s) {
      const chair = this.scene.get(sim.chair);
      if (!chair || chair.isDeleted || (chair.page ?? 0) !== this.scene.page) this.standUp();
      else {
        const seat = chairSeat(chair);
        sim.x += (seat.x - sim.x) * ease(14, dt);
        sim.y += (seat.seatY + 40 - sim.y) * ease(14, dt);
        sim.vx = 0;
        sim.vy = 0;
        sim.f = 1;
      }
    } else {
      const { y: floorY } = this.getFloor();
      const target = this.pointer ?? { x: sim.x, y: sim.y };
      const dx = target.x - sim.x;
      // Acelera y frena con suavidad hacia el puntero (se detiene antes de pisarlo).
      const want = Math.abs(dx) < 14 ? 0 : Math.sign(dx) * Math.min(MAX_SPEED, (Math.abs(dx) - 14) * 3.2);
      sim.vx += (want - sim.vx) * ease(9, dt);
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
      if (Math.abs(sim.vx) > 12) sim.f = Math.sign(sim.vx);
    }
    animate(sim, sim.x - prevX, Math.abs(sim.vx), !sim.onGround && !sim.s, dt);
    sim.p = this.scene.page;
    if (now - this._lastSent < SEND_MS) return;
    const key = `${Math.round(sim.x)},${Math.round(sim.y)},${sim.f},${sim.s},${sim.p}`;
    if (key === this._lastKey) return;
    this._lastKey = key;
    this._lastSent = now;
    this.send({ t: MSG.AVATAR_POS, x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy, f: sim.f, m: Math.abs(sim.vx) > 20, s: sim.s, p: sim.p });
  }

  /** Monigotes ajenos: predicción con la velocidad recibida + suavizado; animación local. */
  _stepOthers(dt, now) {
    for (const o of this.others.values()) {
      if (o.look.mode !== 'body' || !o.pos || !o.shown) continue;
      const s = o.shown;
      const age = Math.min(0.12, (now - (o.at ?? now)) / 1000);
      const tx = o.pos.x + (o.pos.vx ?? 0) * age;
      const ty = o.pos.y + Math.min(0, (o.pos.vy ?? 0) * age);
      const prevX = s.x;
      s.x += (tx - s.x) * ease(14, dt);
      s.y += (ty - s.y) * ease(16, dt);
      s.vx = (s.x - prevX) / dt;
      s.f = o.pos.f;
      s.s = o.pos.s;
      s.p = o.pos.p;
      animate(s, s.x - prevX, Math.abs(s.vx), Math.abs(o.pos.vy ?? 0) > 60, dt);
    }
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
    this._lastKey = '';
  }

  standUp() {
    if (!this.sim) return;
    this.sim.s = false;
    this.sim.chair = null;
    this.sim.vy = -500;
    this._lastKey = '';
  }

  get seated() {
    return Boolean(this.sim?.s);
  }

  /** Agrega una silla junto al monigote (o en el centro de la vista). */
  placeChair() {
    const floor = this.getFloor();
    const x = this.sim ? this.sim.x + 80 * (this.sim.f || 1) : floor.view.x + floor.view.w / 2;
    const y = (this.sim?.onGround ? this.sim.y : floor.y) - 110;
    this.addChair(createElement('chair', { x: x - 45, y, w: 90, h: 110, fill: '#a9714b' }));
  }

  // ---------------- Dibujo ----------------
  _lookFor(id, look) {
    const me = this.getMe();
    const isMe = id === me?.id;
    const person = isMe ? me : this.getPeers().get(id);
    const video = isMe ? this.selfVideo() : this.videoFor(id);
    return { ...look, name: person?.name ?? '', video, mirror: isMe, ring: person?.color ?? '#ffffff' };
  }

  /** Dibuja en coordenadas del mundo (monigotes y cámaras fijas en la pizarra). Devuelve true si hay video. */
  drawWorld(ctx) {
    let video = false;
    const page = this.scene.page;
    const me = this.getMe();
    const list = [...this.others.entries()].map(([id, o]) => ({ id, look: o.look, shown: o.shown }));
    if (this.enabled && me) list.push({ id: me.id, look: this.mine, shown: this.sim, self: true });
    for (const a of list) {
      const look = this._lookFor(a.id, a.look);
      if (a.look.mode === 'body') {
        if (!a.shown || (a.shown.p ?? 0) !== page) continue;
        drawFigure(ctx, a.shown.x, a.shown.y, a.shown, look);
        if (look.video) video = true;
      } else if (a.look.mode === 'anchor' && a.look.anchor && (a.look.anchor.p ?? 0) === page && (look.video || a.self)) {
        const { x, y } = a.look.anchor;
        drawHead(ctx, x, y, 80, look);
        drawName(ctx, x, y + 88, look.name, look.ring, 16);
        if (look.video) video = true;
      }
    }
    return video;
  }

  /** Cámaras que siguen el puntero (en pantalla, tamaño constante, con un leve retraso elástico). */
  drawScreen(ctx) {
    let video = false;
    const page = this.scene.page;
    const me = this.getMe();
    const items = [...this.others.entries()].map(([id, o]) => ({ id, look: o.look, cursor: this.overlay.cursors.get(id) }));
    if (this.enabled && me && this.mine.mode === 'pointer' && this.pointer) {
      items.push({ id: me.id, look: this.mine, cursor: { x: this.pointer.x, y: this.pointer.y, page }, self: true });
    }
    for (const it of items) {
      if (it.look.mode !== 'pointer' || !it.cursor) continue;
      if (it.cursor.page !== undefined && it.cursor.page !== page) continue;
      const look = this._lookFor(it.id, it.look);
      if (!look.video && !it.self) continue;
      // Posición objetivo: abajo a la derecha del puntero; la cámara la sigue con suavidad.
      const target = this.viewport.toScreen(it.cursor.tx ?? it.cursor.x, it.cursor.ty ?? it.cursor.y);
      let f = this.followers.get(it.id);
      if (!f) {
        f = { x: target.x, y: target.y, at: performance.now() };
        this.followers.set(it.id, f);
      }
      const now = performance.now();
      const dt = clamp((now - f.at) / 1000, 0.001, 0.05);
      f.at = now;
      f.x += (target.x - f.x) * ease(10, dt);
      f.y += (target.y - f.y) * ease(10, dt);
      const r = 38;
      const cx = f.x + r + 14;
      const cy = f.y + r + 14;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      drawHead(ctx, cx, cy, r, look);
      ctx.restore();
      drawName(ctx, cx, cy + r + 6, look.name, look.ring, 12);
      if (look.video) video = true;
    }
    return video;
  }
}

