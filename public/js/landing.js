import { api, parseRoomCode } from './util/api.js';
import { recentRooms, savedName, saveName, savePin } from './util/storage.js';
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
  if (pin && !/^[0-9]{4,8}$/.test(pin)) return showError('El PIN debe tener entre 4 y 8 dígitos.');
  const button = e.submitter ?? e.target.querySelector('button');
  button.disabled = true;
  try {
    const room = await api.createRoom(pin || undefined);
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
    showError(err.status === 404 ? 'No existe una pizarra con ese código.' : err.message);
  }
});

const recent = recentRooms();
if (recent.length) {
  $('#recent-card').hidden = false;
  const fmt = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });
  $('#recent').replaceChildren(
    ...recent.map((r) =>
      h('li', {}, h('a', { href: `/sala?room=${r.id}` }, h('strong', { class: 'code' }, r.id.toUpperCase()), h('span', { class: 'muted' }, fmt.format(r.at)))),
    ),
  );
}
