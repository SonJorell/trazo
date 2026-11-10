import { h } from './dom.js';
import { ICONS } from './icons.js';
import { api } from '../util/api.js';

/** Abre un modal con `content`; devuelve { close, node }. */
function modal(content, { dismissable = true, onDismiss } = {}) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content);
  backdrop.append(box);
  const close = () => backdrop.remove();
  if (dismissable) {
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) {
        close();
        onDismiss?.();
      }
    });
  }
  document.body.append(backdrop);
  return { close, node: box };
}

/** Pide nombre y/o PIN para entrar a la sala. */
export function askJoin({ room, defaultName = '', needPin = false, error = '' }) {
  return new Promise((resolve) => {
    const name = h('input', { type: 'text', maxlength: 24, value: defaultName, placeholder: 'Tu nombre', autocomplete: 'nickname', required: true });
    const pin = needPin
      ? h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]{4,8}', maxlength: 8, placeholder: 'PIN de la sala', required: true, autocomplete: 'off' })
      : null;
    const form = h(
      'form',
      { class: 'stack' },
      h('h2', {}, 'Entrar a la sala'),
      h('p', { class: 'muted' }, 'Código: ', h('strong', { class: 'code' }, room.toUpperCase())),
      error ? h('p', { class: 'error' }, error) : null,
      h('label', {}, 'Nombre', name),
      pin ? h('label', {}, 'PIN', pin) : null,
      h('button', { class: 'btn primary', type: 'submit' }, 'Entrar'),
      h('a', { class: 'btn ghost', href: '/' }, 'Volver al inicio'),
    );
    const { close } = modal(form, { dismissable: false });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      close();
      resolve({ name: n, pin: pin ? pin.value.trim() : null });
    });
    (defaultName && pin ? pin : name).focus();
  });
}

export function confirmDialog(message, { okLabel = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    const done = (v) => {
      close();
      resolve(v);
    };
    const { close } = modal(
      h(
        'div',
        { class: 'stack' },
        h('p', {}, message),
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancelar'),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okLabel),
        ),
      ),
      { onDismiss: () => resolve(false) },
    );
  });
}

export function fatalDialog(message) {
  modal(
    h(
      'div',
      { class: 'stack' },
      h('h2', {}, 'No se pudo abrir la sala'),
      h('p', {}, message),
      h('a', { class: 'btn primary', href: '/' }, 'Ir al inicio'),
    ),
    { dismissable: false },
  );
}

/** Muestra el enlace de la sala para la red local, con QR y botón copiar. */
export async function shareDialog({ room, hasPin }) {
  let urls = [];
  let secure = [];
  let ttlMin = 0;
  try {
    const info = await api.info();
    urls = info.lanUrls;
    secure = info.secureUrls ?? [];
    ttlMin = info.emptyRoomTtlMin;
  } catch {
    /* sin info: se usa la dirección actual */
  }
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Se comparte la versión HTTPS: es la que permite usar la cámara en el celular.
  const httpsBase = location.protocol === 'https:' && !isLocalhost ? location.origin : secure[0];
  const baseUrl = httpsBase ?? (!isLocalhost ? location.origin : urls[0] ?? location.origin);
  const link = `${baseUrl}/sala?room=${room}`;
  const plainLink = urls[0] ? `${urls[0]}/sala?room=${room}` : null;

  const input = h('input', { type: 'text', readonly: true, value: link, class: 'mono' });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      btn.textContent = '¡Copiado!';
    } catch {
      input.select();
      document.execCommand?.('copy');
      btn.textContent = 'Seleccionado';
    }
    setTimeout(() => (btn.innerHTML = `${ICONS.copy} Copiar`), 1500);
  };
  const btn = h('button', { class: 'btn', onclick: copy, html: `${ICONS.copy} Copiar` });

  const { close } = modal(
    h(
      'div',
      { class: 'stack center' },
      h('h2', {}, 'Invitar a la sala'),
      h('p', { class: 'muted' }, 'Escanea con el celular conectado a la misma Wi-Fi'),
      h('img', { class: 'qr', src: api.qrUrl(link), alt: 'Código QR del enlace', width: 220, height: 220 }),
      h('div', { class: 'row' }, input, btn),
      h('p', {}, 'Código de sala: ', h('strong', { class: 'code' }, room.toUpperCase())),
      httpsBase
        ? h(
            'p',
            { class: 'muted small' },
            'La primera vez el celular avisará que la conexión «no es privada»: es tu propio PC. Toca ',
            h('strong', {}, 'Avanzado → Continuar'),
            ' (lo necesita la cámara).',
            plainLink ? h('span', {}, ' Sin cámara: ', h('span', { class: 'mono' }, plainLink)) : null,
          )
        : null,
      hasPin ? h('p', { class: 'muted' }, 'Esta sala tiene PIN: compártelo por separado.') : null,
      ttlMin ? h('p', { class: 'muted small' }, `La sala se cierra y se borra ${ttlMin} min después de que salga el último participante.`) : null,
      isLocalhost && !urls.length
        ? h('p', { class: 'error' }, 'No se detectó la red local. Conecta el PC a la Wi-Fi.')
        : null,
      h('button', { class: 'btn primary', onclick: () => close() }, 'Listo'),
    ),
  );
}

/**
 * Pide al anfitrión que inicie la transmisión. El navegador exige un clic del usuario
 * antes de capturar la pantalla, por eso es un diálogo con botón.
 * Devuelve true si eligió transmitir.
 */
export function liveStartDialog() {
  return new Promise((resolve) => {
    const done = (v) => {
      close();
      resolve(v);
    };
    const { close } = modal(
      h(
        'div',
        { class: 'stack center' },
        h('h2', {}, 'Pizarra en directo'),
        h('p', {}, 'Comparte tu pantalla o una ventana: los demás la verán de fondo y podrán marcar encima.'),
        h(
          'p',
          { class: 'muted small' },
          'Consejo: elige otra ventana u otra pantalla (no esta pestaña). Para dibujar directamente sobre tu pantalla usa ',
          h('strong', {}, 'iniciar-overlay.bat'),
          '.',
        ),
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Más tarde'),
          h('button', { class: 'btn primary', html: `${ICONS.screen} Transmitir pantalla`, onclick: () => done(true) }),
        ),
      ),
      { onDismiss: () => resolve(false) },
    );
  });
}

/** La cámara exige HTTPS: ofrece abrir la misma sala en la dirección segura. */
export async function cameraHttpsDialog(room) {
  let secure = [];
  try {
    secure = (await api.info()).secureUrls ?? [];
  } catch {
    /* sin info */
  }
  const link = secure[0] ? `${secure[0]}/sala?room=${room}` : null;
  const { close } = modal(
    h(
      'div',
      { class: 'stack center' },
      h('h2', {}, 'Para usar la cámara'),
      link
        ? h(
            'p',
            {},
            'El navegador solo permite la cámara en páginas seguras. Abre la sala en la dirección HTTPS y, si avisa que la conexión «no es privada», toca ',
            h('strong', {}, 'Avanzado → Continuar'),
            ' (es tu propio PC).',
          )
        : h('p', {}, 'El servidor no tiene HTTPS activo, así que la cámara no está disponible.'),
      link ? h('img', { class: 'qr', src: api.qrUrl(link), alt: 'QR de la dirección segura', width: 200, height: 200 }) : null,
      link ? h('a', { class: 'btn primary', href: link }, 'Abrir versión segura') : null,
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Cerrar'),
    ),
  );
}

/** El PC presentador decide si alguien puede pasar diapositivas. Devuelve true si acepta. */
export function grantDialog(name) {
  return new Promise((resolve) => {
    const done = (v) => {
      close();
      resolve(v);
    };
    const { close } = modal(
      h(
        'div',
        { class: 'stack center' },
        h('h2', {}, 'Control de diapositivas'),
        h('p', {}, h('strong', {}, name), ' quiere pasar las diapositivas de tu presentación.'),
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Rechazar'),
          h('button', { class: 'btn primary', onclick: () => done(true) }, 'Permitir'),
        ),
      ),
      { onDismiss: () => resolve(false) },
    );
  });
}

/** Lista de personas con permiso para pasar diapositivas, con botón para quitarlo. */
export function permissionsDialog(grants, onRevoke) {
  const list = h('ul', { class: 'perm-list' });
  const paint = () => {
    list.replaceChildren(
      ...(grants.size
        ? [...grants].map(([id, name]) =>
            h(
              'li',
              {},
              h('span', {}, name),
              h('button', { class: 'btn small danger', onclick: () => (onRevoke(id), paint()) }, 'Quitar'),
            ),
          )
        : [h('li', { class: 'muted' }, 'Nadie más tiene control. Los participantes pueden pedirlo desde su menú.')]),
    );
  };
  paint();
  const { close } = modal(
    h(
      'div',
      { class: 'stack' },
      h('h2', {}, 'Quién puede pasar diapositivas'),
      list,
      h('button', { class: 'btn primary', onclick: () => close() }, 'Listo'),
    ),
  );
}
