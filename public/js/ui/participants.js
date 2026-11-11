import { MSG, ROLES, ROLE_LABELS } from '/shared/protocol.js';
import { h } from './dom.js';
import { toast } from './toast.js';
import { ICONS } from './icons.js';

const ROLE_HELP = {
  visita: 'Mira, reacciona y vota',
  editor: 'Dibuja, escribe, adjunta y usa cámara',
  presentador: 'Además pasa páginas, fondo y títulos',
};

/**
 * Roles y permisos:
 * - El anfitrión abre «Participantes» (menú o tocando los avatares) y elige el rol de cada
 *   persona, de todos a la vez, y el rol con que entra la gente nueva.
 * - Una visita ve una barra «Visita» con «Pedir permiso para dibujar».
 * @returns {{ role, isVisitor(), open() }}
 */
export function setupParticipants({ connection, presence, isHost, onRoleChange }) {
  let myRole = 'editor';
  let defaultRole = 'editor';
  let panel = null; // modal abierto (para repintarlo con cambios)

  // ---- Barra para visitas ----
  const askBtn = h('button', { class: 'btn small primary with-icon', onclick: () => ask() }, h('span', { html: ICONS.raiseHand }), 'Pedir permiso para dibujar');
  const visitorBar = h(
    'div',
    { class: 'visitor-bar', hidden: true, role: 'status' },
    h('span', { class: 'with-icon' }, h('span', { html: ICONS.eye }), h('span', {}, 'Estás como ', h('strong', {}, 'visita'), ': puedes reaccionar y votar.')),
    askBtn,
  );
  document.body.append(visitorBar);
  let asked = 0;
  const ask = () => {
    if (Date.now() - asked < 10_000) return toast('Ya pediste permiso; espera la respuesta del anfitrión');
    asked = Date.now();
    connection.send({ t: MSG.ROLE_REQUEST });
    toast('Solicitud enviada al anfitrión');
  };

  const applyMyRole = (role, announce = false) => {
    const before = myRole;
    myRole = role;
    document.body.dataset.role = role;
    visitorBar.hidden = role !== 'visita';
    if (announce && before !== role) {
      toast(
        role === 'visita'
          ? 'El anfitrión te dejó como visita: puedes reaccionar y votar'
          : `El anfitrión te dio el rol de ${ROLE_LABELS[role].toLowerCase()}`,
      );
    }
    onRoleChange(role);
  };

  // ---- Panel del anfitrión ----
  const roleButtons = (current, onPick, { small = false } = {}) =>
    h(
      'div',
      { class: `segmented${small ? ' small' : ''}`, role: 'group' },
      ROLES.map((r) =>
        h('button', { class: `seg${r === current ? ' active' : ''}`, title: ROLE_HELP[r], onclick: () => onPick(r) }, ROLE_LABELS[r]),
      ),
    );

  const render = () => {
    if (!panel) return;
    const people = [...presence.peers.values()].filter((p) => !p.host).sort((a, b) => a.name.localeCompare(b.name));
    const counts = Object.fromEntries(ROLES.map((r) => [r, people.filter((p) => p.role === r).length]));
    panel.body.replaceChildren(
      h('h2', {}, 'Participantes y permisos'),
      h('div', { class: 'stack small-gap' }, h('h4', {}, 'Quien entre desde ahora será'), roleButtons(defaultRole, (r) => connection.send({ t: MSG.ROLE, default: r }))),
      h(
        'div',
        { class: 'row wrap' },
        h('span', { class: 'muted small' }, 'Todos a la vez:'),
        ROLES.map((r) => h('button', { class: 'btn small', onclick: () => connection.send({ t: MSG.ROLE, all: r }) }, ROLE_LABELS[r])),
      ),
      h('p', { class: 'muted small' }, `${people.length} conectados · ${counts.visita} visitas · ${counts.editor} editores · ${counts.presentador} presentadores`),
      people.length
        ? h(
            'ul',
            { class: 'people-list' },
            people.map((p) =>
              h(
                'li',
                {},
                h('span', { class: 'avatar', style: `background:${p.color}` }, p.name.slice(0, 2).toUpperCase()),
                h('span', { class: 'person-name' }, p.name),
                roleButtons(p.role, (r) => connection.send({ t: MSG.ROLE, to: p.id, role: r }), { small: true }),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Aún no hay nadie más en la sala. Comparte el QR para invitar.'),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: close }, 'Listo')),
    );
  };
  const close = () => {
    panel?.backdrop.remove();
    panel = null;
  };
  const open = () => {
    if (!isHost()) return;
    close();
    const body = h('div', { class: 'stack' });
    const box = h('div', { class: 'modal wide', role: 'dialog', 'aria-modal': 'true' }, body);
    const backdrop = h('div', { class: 'modal-backdrop' }, box);
    backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());
    document.body.append(backdrop);
    panel = { backdrop, body };
    render();
  };

  // Solicitudes de visitas: aviso con botones (no bloquea la presentación).
  const showRequest = (msg) => {
    const node = h(
      'div',
      { class: 'role-request ov-hit', role: 'alert' },
      h('span', {}, h('strong', {}, msg.name), ' pide permiso para dibujar'),
      h('button', { class: 'btn small ghost', onclick: () => node.remove() }, 'Ahora no'),
      h('button', { class: 'btn small primary', onclick: () => (connection.send({ t: MSG.ROLE, to: msg.from, role: 'editor' }), node.remove()) }, 'Permitir'),
    );
    document.querySelector('.role-requests')?.append(node) ??
      document.body.append(h('div', { class: 'role-requests' }, node));
    setTimeout(() => node.remove(), 30_000);
  };

  connection.on('message', (msg) => {
    switch (msg.t) {
      case MSG.WELCOME:
        defaultRole = msg.defaultRole ?? 'editor';
        applyMyRole(msg.you.role ?? (msg.you.host ? 'host' : 'editor'));
        render();
        break;
      case MSG.PEER_ROLE: {
        const peer = presence.peers.get(msg.id);
        if (peer) peer.role = msg.role;
        if (msg.id === presence.me?.id) applyMyRole(msg.role, true);
        render();
        break;
      }
      case MSG.ROOM_ROLES:
        defaultRole = msg.defaultRole;
        render();
        break;
      case MSG.ROLE_REQUEST:
        if (isHost()) showRequest(msg);
        break;
      case MSG.PEER_JOIN:
      case MSG.PEER_LEAVE:
        setTimeout(render, 0); // después de que Presence actualice la lista
        break;
    }
  });

  return {
    get role() {
      return myRole;
    },
    isVisitor: () => myRole === 'visita',
    open,
  };
}
