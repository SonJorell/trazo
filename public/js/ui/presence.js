import { h } from './dom.js';

const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/**
 * Participantes conectados: avatares en la barra superior y cursores remotos
 * (los cursores se guardan en `overlay.cursors` para que el renderizador los dibuje).
 */
export class Presence {
  constructor(container, { overlay, render }) {
    this.container = container;
    this.overlay = overlay;
    this.render = render;
    this.me = null;
    this.peers = new Map();
  }

  get peerCount() {
    return this.peers.size;
  }

  reset(me, peers) {
    this.me = me;
    this.peers = new Map(peers.map((p) => [p.id, p]));
    this.overlay.cursors.clear();
    this._paint();
  }

  add(peer) {
    this.peers.set(peer.id, peer);
    this._paint();
  }

  remove(id) {
    this.peers.delete(id);
    this.overlay.cursors.delete(id);
    this._paint();
    this.render();
  }

  moveCursor(id, x, y) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.overlay.cursors.set(id, { x, y, name: peer.name, color: peer.color, at: Date.now() });
    this.render();
  }

  _paint() {
    const people = [this.me, ...this.peers.values()].filter(Boolean);
    const nodes = people.slice(0, 5).map((p, i) =>
      h(
        'span',
        {
          class: `avatar${p.host ? ' host' : ''}`,
          style: `background:${p.color}`,
          title: `${p.name}${i === 0 ? ' (tú)' : ''}${p.host ? ' — presentación principal' : ''}`,
        },
        initials(p.name),
      ),
    );
    if (people.length > 5) nodes.push(h('span', { class: 'avatar more' }, `+${people.length - 5}`));
    this.container.replaceChildren(...nodes);
  }
}
