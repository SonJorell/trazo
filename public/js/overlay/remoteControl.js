import { MSG } from '/shared/protocol.js';
import { h } from '../ui/dom.js';
import { api } from '../util/api.js';
import { local } from '../util/storage.js';
import { toast } from '../ui/toast.js';
import { grantDialog, permissionsDialog } from '../ui/dialogs.js';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Clave secreta de control de esta sala (se conserva para no tener que reescanear). */
function controlKey(room) {
  const storeKey = `trazo:ctrlkey:${room}`;
  let key = local.get(storeKey, null);
  if (!key) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    key = Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
    local.set(storeKey, key);
  }
  return key;
}

/**
 * Lado del PC presentador: se registra como destino del control remoto y ejecuta
 * las órdenes que llegan del celular (teclas para las diapositivas, lupa, transmisión).
 */
const SLIDE_ACTIONS = new Set(['next', 'prev', 'first', 'last']);

export function setupRemoteControl({ room, connection, bridge, magnifier, sharer, onSlideChange = () => {} }) {
  const key = controlKey(room);
  const grants = new Map(); // id → nombre de quienes pueden pasar diapositivas

  const setGrant = (id, granted) => {
    connection.send({ t: MSG.CONTROL_GRANT, to: id, granted });
    if (!granted) grants.delete(id);
  };

  connection.on('message', async (msg) => {
    if (msg.t === MSG.WELCOME) {
      connection.send({ t: MSG.CONTROL_REGISTER, key });
      grants.clear(); // tras reconectar, el servidor ya no recuerda los permisos
      grantAll = false;
    }
    if (msg.t === MSG.PEER_LEAVE) grants.delete(msg.id);
    if (msg.t === MSG.CONTROL_REQUEST) {
      if (grants.has(msg.from) || grantAll) return;
      const ok = await grantDialog(msg.name);
      if (ok) {
        grants.set(msg.from, msg.name);
        setGrant(msg.from, true);
        toast(`${msg.name} puede pasar las diapositivas`);
      } else {
        setGrant(msg.from, false);
      }
    }
    if (msg.t !== MSG.CONTROL) return;
    try {
      switch (msg.action) {
        case 'zoom':
          await magnifier.zoomTo(msg.nx, msg.ny, msg.scale);
          break;
        case 'zoom-reset':
          magnifier.reset();
          break;
        case 'share-on':
          if (!sharer.active) await sharer.start();
          break;
        case 'share-off':
          sharer.stop();
          break;
        default:
          if (!bridge?.pressKey) toast('Las teclas remotas solo funcionan en la app de overlay');
          else await bridge.pressKey(msg.action, msg.style);
          if (SLIDE_ACTIONS.has(msg.action)) onSlideChange(msg.action);
      }
    } catch (err) {
      toast(`No se pudo ejecutar la orden: ${err.message}`);
    }
  });

  /** Diálogo con el QR del control remoto (contiene la clave: solo para tu celular). */
  async function showControlQr() {
    let base = location.origin;
    try {
      const { lanUrls } = await api.info();
      if (lanUrls[0]) base = lanUrls[0];
    } catch {
      /* se usa la dirección actual */
    }
    const link = `${base}/control?room=${room}#k=${key}`;
    const backdrop = h('div', { class: 'modal-backdrop' });
    const close = () => backdrop.remove();
    backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());
    backdrop.append(
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h(
          'div',
          { class: 'stack center' },
          h('h2', {}, 'Control remoto'),
          h('p', { class: 'muted' }, 'Escanea con tu celular (misma Wi-Fi) para pasar diapositivas y hacer zoom.'),
          h('img', { class: 'qr', src: api.qrUrl(link), alt: 'QR del control remoto', width: 220, height: 220 }),
          h('p', { class: 'error small' }, 'Este QR lleva una clave: no lo compartas con el público.'),
          h('button', { class: 'btn primary', onclick: close }, 'Listo'),
        ),
      ),
    );
    document.body.append(backdrop);
  }

  let grantAll = false;
  const setGrantAll = (on) => {
    grantAll = on;
    connection.send({ t: MSG.CONTROL_GRANT, all: on });
    toast(on ? 'Todos pueden pasar diapositivas' : 'Solo quienes tú apruebes pueden pasar diapositivas');
  };
  const showPermissions = () =>
    permissionsDialog(grants, (id) => setGrant(id, false), { all: () => grantAll, setAll: setGrantAll });

  return { showControlQr, showPermissions };
}
