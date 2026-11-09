import { api, parseRoomCode } from './util/api.js';
import { recentRooms, savedName, saveName, savePin, markHost, forgetRoom } from './util/storage.js';
import { h } from './ui/dom.js';

const $ = (sel) => document.querySelector(sel);
const nameInput = $('#name');
const pinInput = $('#pin');
const errorEl = $('#error');

nameInput.value = savedName();
nameInput.addEventListener('change', () => saveName(nameInput.value.trim()));

$('#use-pin').addEventListener('change', (e) => {
  pinInput.hidden = !e.target.checked;
  pinInput.required = e.target.checked;
  if (e.target.checked) pinInput.focus();
});

const showError = (msg) => {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
};

const goTo = (id) => {
  if (nameInput.value.trim()) saveName(nameInput.value.trim());
  location.href = `/sala?room=${id}`;
};

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const pin = $('#use-pin').checked ? pinInput.value.trim() : '';
  const mode = new FormData(e.target).get('mode') === 'live' ? 'live' : 'blank';
  if (pin && !/^[0-9]{4,8}$/.test(pin)) return showError('El PIN debe tener entre 4 y 8 dígitos.');
  const button = e.submitter ?? e.target.querySelector('button');
  button.disabled = true;
  try {
    const room = await api.createRoom({ pin: pin || undefined, mode });
    markHost(room.id);
    if (pin) savePin(room.id, pin);
    goTo(room.id);
  } catch (err) {
    showError(err.message);
    button.disabled = false;
  }
});

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const code = parseRoomCode($('#code').value);
  if (!code) return showError('Escribe el código de la pizarra.');
  try {
    await api.getRoom(code);
    goTo(code);
  } catch (err) {
    showError(err.status === 404 ? 'No existe una pizarra con ese código (o se cerró porque quedó vacía).' : err.message);
  }
});

// La transmisión en directo necesita getDisplayMedia (navegadores de PC).
if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => ($('#live-note').hidden = r.value !== 'live' || !r.checked)),
  );
}

/** Muestra las salas recientes que siguen abiertas; olvida las que ya se cerraron. */
async function showRecent() {
  const recent = recentRooms();
  if (!recent.length) return;
  const checks = await Promise.all(
    recent.map((r) =>
      api
        .getRoom(r.id)
        .then((info) => ({ ...r, info }))
        .catch((err) => {
          if (err.status === 404) forgetRoom(r.id);
          return null;
        }),
    ),
  );
  const open = checks.filter(Boolean);
  if (!open.length) return;
  $('#recent-card').hidden = false;
  const fmt = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });
  $('#recent').replaceChildren(
    ...open.map((r) =>
      h(
        'li',
        {},
        h(
          'a',
          { href: `/sala?room=${r.id}` },
          h('strong', { class: 'code' }, r.id.toUpperCase()),
          r.info.mode === 'live' ? h('span', { class: 'tag-live' }, r.info.live ? '● En vivo' : 'En directo') : null,
          h('span', { class: 'muted' }, fmt.format(r.at)),
        ),
      ),
    ),
  );
}
showRecent();
