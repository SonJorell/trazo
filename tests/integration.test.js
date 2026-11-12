import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { MemoryStore } from '../server/storage/MemoryStore.js';
import { createLogger } from '../server/util/logger.js';

let app;
let base;

before(async () => {
  const config = loadConfig({
    port: 0,
    host: '127.0.0.1',
    saveDelayMs: 10,
    logLevel: 'silent',
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'trazo-it-')), // el certificado de prueba va aquí
  });
  app = await createApp(config, { store: new MemoryStore(), logger: createLogger('silent') });
  const { port } = await app.listen(0, '127.0.0.1');
  config.port = port;
  base = `http://127.0.0.1:${port}`;
});

after(() => app.close());

/** Cliente WebSocket de prueba que acumula mensajes y permite esperar uno por tipo. */
function connect() {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const i = waiters.findIndex((w) => w.t === msg.t);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (t) =>
    new Promise((resolve, reject) => {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
      waiters.push({ t, resolve });
      setTimeout(() => reject(new Error(`timeout esperando ${t}`)), 2000);
    });
  const opened = new Promise((r) => ws.on('open', r));
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  return { ws, next, opened, closed, send: (m) => ws.send(JSON.stringify(m)) };
}

const createRoom = async (body = {}) =>
  (await fetch(`${base}/api/rooms`, { method: 'POST', body: JSON.stringify(body) })).json();

test('sirve la página de inicio y los módulos compartidos', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const shared = await fetch(`${base}/shared/elements.js`);
  assert.equal(shared.status, 200);
  const control = await fetch(`${base}/control?room=abc`);
  assert.equal(control.status, 200);
  assert.match(await control.text(), /Control remoto/);
  const evil = await fetch(`${base}/shared/..%2f..%2fpackage.json`);
  assert.equal(evil.status, 404);
});

test('API: crear y consultar salas', async () => {
  const { id, hasPin } = await createRoom({ pin: '2468' });
  assert.equal(hasPin, true);
  const info = await (await fetch(`${base}/api/rooms/${id}`)).json();
  assert.deepEqual(info, { id, hasPin: true, mode: 'blank', live: false });
  const live = await createRoom({ mode: 'live' });
  assert.equal(live.mode, 'live');
  assert.equal((await fetch(`${base}/api/rooms`, { method: 'POST', body: '{"mode":"otro"}' })).status, 400);
  assert.equal((await fetch(`${base}/api/rooms/zzzzzz`)).status, 404);
  assert.equal((await fetch(`${base}/api/rooms`, { method: 'POST', body: '{"pin":"1"}' })).status, 400);
});

test('dos clientes se sincronizan en tiempo real', async () => {
  const { id } = await createRoom();
  const a = connect();
  const b = connect();
  await Promise.all([a.opened, b.opened]);

  a.send({ t: 'join', room: id, name: 'Ana' });
  const wa = await a.next('welcome');
  assert.equal(wa.you.name, 'Ana');

  b.send({ t: 'join', room: id, name: 'Beto' });
  const wb = await b.next('welcome');
  assert.equal(wb.peers.length, 1);
  assert.equal((await a.next('peer-join')).peer.name, 'Beto');

  const el = { id: 'stroke0001', type: 'pen', version: 1, nonce: 1, x: 0, y: 0, points: [[0, 0], [5, 5]] };
  a.send({ t: 'ops', ops: [el] });
  const ops = await b.next('ops');
  assert.equal(ops.ops[0].id, 'stroke0001');

  b.send({ t: 'cursor', x: 10, y: 20 });
  assert.deepEqual(await a.next('cursor'), { t: 'cursor', id: wb.you.id, x: 10, y: 20 });

  // Un tercer cliente recibe el estado completo al entrar.
  const c = connect();
  await c.opened;
  c.send({ t: 'join', room: id, name: 'Caro' });
  const wc = await c.next('welcome');
  assert.equal(wc.elements.length, 1);

  b.ws.close();
  assert.equal((await a.next('peer-leave')).id, wb.you.id);
  a.ws.close();
  c.ws.close();
});

test('una sala con PIN rechaza a quien no lo tiene', async () => {
  const { id } = await createRoom({ pin: '1357' });

  const noPin = connect();
  await noPin.opened;
  noPin.send({ t: 'join', room: id, name: 'X' });
  assert.equal((await noPin.next('error')).code, 'pin_required');
  assert.equal(await noPin.closed, 4000);

  const wrong = connect();
  await wrong.opened;
  wrong.send({ t: 'join', room: id, name: 'X', pin: '0000' });
  assert.equal((await wrong.next('error')).code, 'pin_invalid');

  const ok = connect();
  await ok.opened;
  ok.send({ t: 'join', room: id, name: 'Y', pin: '1357' });
  assert.ok((await ok.next('welcome')).you);
  ok.ws.close();
});

test('no se aceptan operaciones antes de unirse', async () => {
  const c = connect();
  await c.opened;
  c.send({ t: 'ops', ops: [] });
  assert.equal((await c.next('error')).code, 'not_joined');
  c.ws.close();
});

test('retransmite la pantalla compartida y avisa al terminar', async () => {
  const { id, hostKey } = await createRoom();
  const pc = connect();
  const cel = connect();
  await Promise.all([pc.opened, cel.opened]);
  pc.send({ t: 'join', room: id, name: 'PC', hostKey });
  await pc.next('welcome');
  cel.send({ t: 'join', room: id, name: 'Cel' });
  await cel.next('welcome');

  const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
  pc.send({ t: 'screen', w: 1920, h: 1080, data });
  const frame = await cel.next('screen');
  assert.equal(frame.w, 1920);
  assert.equal(frame.data, data);

  // Quien entra después recibe el último cuadro en el welcome.
  const late = connect();
  await late.opened;
  late.send({ t: 'join', room: id, name: 'Tarde' });
  assert.equal((await late.next('welcome')).screen.h, 1080);

  // Cuadros inválidos se rechazan.
  pc.send({ t: 'screen', w: 10, h: 10, data: 'data:text/html,<script>' });
  assert.equal((await pc.next('error')).code, 'bad_request');

  // Al desconectarse quien transmite, los demás reciben screen-stop.
  pc.ws.close();
  assert.equal((await cel.next('screen-stop')).from, frame.from);
  cel.ws.close();
  late.ws.close();
});

test('control remoto: solo con la clave correcta y solo llega al PC registrado', async () => {
  const { id, hostKey } = await createRoom();
  const pc = connect();
  const cel = connect();
  const otro = connect();
  await Promise.all([pc.opened, cel.opened, otro.opened]);
  for (const [c, n] of [[pc, 'PC'], [cel, 'Cel'], [otro, 'Otro']]) {
    c.send({ t: 'join', room: id, name: n, hostKey: c === pc ? hostKey : undefined });
    await c.next('welcome');
  }

  // Sin PC registrado no hay a quién mandar.
  cel.send({ t: 'control', key: 'x', action: 'next' });
  assert.equal((await cel.next('error')).code, 'no_controller');

  const key = 'ClaveSecreta1234567890';
  pc.send({ t: 'control-register', key });
  assert.equal((await cel.next('controller')).online, true);

  // Clave incorrecta: rechazada.
  cel.send({ t: 'control', key: 'ClaveMala1234567890xx', action: 'next' });
  assert.equal((await cel.next('error')).code, 'control_denied');

  // Clave correcta: llega al PC, sin la clave, y saneada.
  cel.send({ t: 'control', key, action: 'zoom', nx: 0.5, ny: 0.25, scale: 99, extra: 'x' });
  const order = await pc.next('control');
  assert.deepEqual({ action: order.action, nx: order.nx, ny: order.ny, scale: order.scale }, { action: 'zoom', nx: 0.5, ny: 0.25, scale: 8 });
  assert.equal('key' in order, false);
  assert.equal('extra' in order, false);

  // Acciones fuera de la lista blanca: rechazadas.
  cel.send({ t: 'control', key, action: 'rm -rf' });
  assert.equal((await cel.next('error')).code, 'bad_request');

  // Un tercero nunca recibe órdenes ni la clave.
  await assert.rejects(otro.next('control'));

  // Si el PC se va, el control queda desconectado.
  pc.ws.close();
  assert.equal((await cel.next('controller')).online, false);
  cel.ws.close();
  otro.ws.close();
});

test('señalización de cámaras: rtc se entrega solo al destinatario', async () => {
  const { id, hostKey } = await createRoom();
  const pc = connect();
  const cel = connect();
  const otro = connect();
  await Promise.all([pc.opened, cel.opened, otro.opened]);
  pc.send({ t: 'join', room: id, name: 'Proyector', display: true, hostKey });
  const wpc = await pc.next('welcome');
  cel.send({ t: 'join', room: id, name: 'Cel' });
  const wcel = await cel.next('welcome');
  assert.equal(wcel.peers.find((p) => p.id === wpc.you.id).display, true, 'el celular sabe quién proyecta');
  otro.send({ t: 'join', room: id, name: 'Otro' });
  await otro.next('welcome');

  cel.send({ t: 'rtc', to: wpc.you.id, data: { type: 'offer', sdp: 'v=0...' } });
  const sig = await pc.next('rtc');
  assert.equal(sig.from, wcel.you.id);
  assert.deepEqual(sig.data, { type: 'offer', sdp: 'v=0...' });
  await assert.rejects(otro.next('rtc'));

  cel.send({ t: 'rtc', to: wpc.you.id, data: { sdp: 'x'.repeat(70_000) } });
  assert.equal((await cel.next('error')).code, 'bad_request');
  for (const c of [pc, cel, otro]) c.ws.close();
});

test('permiso de diapositivas: pedir, aprobar, usar y quitar', async () => {
  const { id, hostKey } = await createRoom();
  const pc = connect();
  const ana = connect();
  await Promise.all([pc.opened, ana.opened]);
  pc.send({ t: 'join', room: id, name: 'PC', display: true, hostKey });
  await pc.next('welcome');
  ana.send({ t: 'join', room: id, name: 'Ana' });
  const wana = await ana.next('welcome');
  pc.send({ t: 'control-register', key: 'ClaveSecreta1234567890' });
  await ana.next('controller');

  // Sin permiso: denegado.
  ana.send({ t: 'control', action: 'next' });
  assert.equal((await ana.next('error')).code, 'control_denied');

  // Pide control → le llega al PC con su nombre.
  ana.send({ t: 'control-request' });
  const req = await pc.next('control-request');
  assert.deepEqual({ from: req.from, name: req.name }, { from: wana.you.id, name: 'Ana' });

  // Un participante no puede darse permisos.
  ana.send({ t: 'control-grant', to: wana.you.id, granted: true });
  assert.equal((await ana.next('error')).code, 'control_denied');

  // El PC aprueba → puede pasar diapositivas, pero no usar la lupa.
  pc.send({ t: 'control-grant', to: wana.you.id, granted: true });
  assert.equal((await ana.next('control-granted')).granted, true);
  ana.send({ t: 'control', action: 'next', style: 'arrows' });
  assert.equal((await pc.next('control')).action, 'next');
  ana.send({ t: 'control', action: 'zoom', nx: 0.5, ny: 0.5, scale: 2 });
  assert.equal((await ana.next('error')).code, 'control_denied');

  // El PC quita el permiso.
  pc.send({ t: 'control-grant', to: wana.you.id, granted: false });
  assert.equal((await ana.next('control-granted')).granted, false);
  ana.send({ t: 'control', action: 'prev' });
  assert.equal((await ana.next('error')).code, 'control_denied');

  // Si el PC se va, se avisa que el permiso terminó.
  pc.send({ t: 'control-grant', to: wana.you.id, granted: true });
  await ana.next('control-granted');
  pc.ws.close();
  assert.equal((await ana.next('control-granted')).granted, false);
  ana.ws.close();
});

test('HTTPS local: sirve la app y el WebSocket con certificado propio', async () => {
  const { port } = await app.listenSecure(0, '127.0.0.1');
  const { default: https } = await import('node:https');
  const body = await new Promise((resolve, reject) => {
    https
      .get(`https://127.0.0.1:${port}/api/info`, { rejectUnauthorized: false }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(JSON.parse(d)));
      })
      .on('error', reject);
  });
  assert.ok(Array.isArray(body.secureUrls));
  const ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { rejectUnauthorized: false });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.close();
});

test('solo el anfitrión es la presentación principal', async () => {
  const created = await createRoom();
  assert.equal(typeof created.hostKey, 'string');
  const info = await (await fetch(`${base}/api/rooms/${created.id}`)).json();
  assert.equal('hostKey' in info, false, 'la clave no se vuelve a entregar');

  const intruso = connect();
  const host = connect();
  await Promise.all([intruso.opened, host.opened]);

  // Sin clave: entra como participante aunque pida ser proyector.
  intruso.send({ t: 'join', room: created.id, name: 'Intruso', display: true, hostKey: 'inventada' });
  const wi = await intruso.next('welcome');
  assert.deepEqual({ host: wi.you.host, display: wi.you.display }, { host: false, display: false });
  intruso.send({ t: 'control-register', key: 'ClaveSecreta1234567890' });
  assert.equal((await intruso.next('error')).code, 'not_host');
  intruso.send({ t: 'screen', w: 10, h: 10, data: 'data:image/jpeg;base64,/9j/4AAQ' });
  assert.equal((await intruso.next('error')).code, 'not_host');

  // Con la clave: es anfitrión y proyector.
  host.send({ t: 'join', room: created.id, name: 'Anfitrión', display: true, hostKey: created.hostKey });
  const wh = await host.next('welcome');
  assert.deepEqual({ host: wh.you.host, display: wh.you.display }, { host: true, display: true });
  const joined = await intruso.next('peer-join');
  assert.equal(joined.peer.host, true);
  intruso.ws.close();
  host.ws.close();
});

test('puntero láser y reacciones se reenvían validados', async () => {
  const { id } = await createRoom();
  const a = connect();
  const b = connect();
  await Promise.all([a.opened, b.opened]);
  a.send({ t: 'join', room: id, name: 'Ana' });
  await a.next('welcome');
  b.send({ t: 'join', room: id, name: 'Beto' });
  await b.next('welcome');

  a.send({ t: 'laser', pts: [[1.4, 2.6], [10, 20]], c: '#00ff00' });
  const laser = await b.next('laser');
  assert.deepEqual(laser.pts, [[1, 3], [10, 20]]);
  assert.equal(laser.c, '#00ff00');

  a.send({ t: 'reaction', e: 'party' });
  const r = await b.next('reaction');
  assert.deepEqual({ e: r.e, name: r.name }, { e: 'party', name: 'Ana' });
  a.send({ t: 'reaction', e: '<script>' });
  assert.equal((await a.next('error')).code, 'bad_request');
  a.ws.close();
  b.ws.close();
});

test('páginas, vista, temporizador, votación y permitir a todos', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const ana = connect();
  await Promise.all([host.opened, ana.opened]);
  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey, display: true });
  await host.next('welcome');
  ana.send({ t: 'join', room: id, name: 'Ana' });
  const wa = await ana.next('welcome');
  assert.deepEqual([wa.page, wa.timer, wa.poll, wa.canSteer], [0, null, null, false]);

  // Páginas: el anfitrión cambia; Ana sin permiso no puede.
  host.send({ t: 'page', n: 3 });
  assert.equal((await ana.next('page')).n, 3);
  ana.send({ t: 'page', n: 1 });
  assert.equal((await ana.next('error')).code, 'control_denied');

  // Vista del anfitrión: solo él la publica.
  host.send({ t: 'view', x: 0, y: 0, w: 1920, h: 1080 });
  assert.equal((await ana.next('view')).w, 1920);

  // Temporizador.
  const endsAt = Date.now() + 60_000;
  host.send({ t: 'timer', endsAt });
  assert.equal((await ana.next('timer')).timer.endsAt, endsAt);
  ana.send({ t: 'timer', endsAt });
  assert.equal((await ana.next('error')).code, 'not_host');

  // Votación: un voto por persona, se cuenta y se cierra.
  host.send({ t: 'poll', question: '¿Seguimos?', options: ['Sí', 'No', ''] });
  const opened = await ana.next('poll');
  assert.deepEqual(opened.poll.options, ['Sí', 'No']);
  await host.next('poll'); // el anfitrión también recibe la apertura
  ana.send({ t: 'vote', option: 0 });
  assert.deepEqual((await host.next('poll')).poll.counts, [1, 0]);
  ana.send({ t: 'vote', option: 1 }); // cambia su voto
  assert.deepEqual((await host.next('poll')).poll.counts, [0, 1]);
  host.send({ t: 'poll-close' });
  for (let i = 0; i < 2; i++) await ana.next('poll'); // los dos recuentos anteriores
  assert.equal((await ana.next('poll')).poll.open, false);
  ana.send({ t: 'vote', option: 0 });
  assert.equal((await ana.next('error')).code, 'bad_request');

  // Permitir a todos: Ana puede cambiar de página y pasar diapositivas.
  host.send({ t: 'control-register', key: 'ClaveSecreta1234567890' });
  await ana.next('controller');
  host.send({ t: 'control-grant', all: true });
  assert.deepEqual(await ana.next('control-granted'), { t: 'control-granted', granted: true, all: true });
  ana.send({ t: 'page', n: 4 });
  // A quien cambia la página no se le devuelve su propio cambio; el de Ana sí le llega al anfitrión.
  assert.equal((await host.next('page')).n, 4);
  ana.send({ t: 'control', action: 'next' });
  assert.equal((await host.next('control')).action, 'next');
  host.ws.close();
  ana.ws.close();
});

test('el tipo nota y la página se validan', async () => {
  const { sanitizeElement } = await import('../shared/elements.js');
  const note = sanitizeElement({ id: 'nota1234', type: 'note', version: 1, x: 0, y: 0, text: 'Hola', page: 2, w: 5, h: 5000 });
  assert.deepEqual([note.page, note.w, note.h, note.fill], [2, 60, 2000, '#ffec99']);
  assert.equal(sanitizeElement({ id: 'nota1234', type: 'note', version: 1, page: -3 }).page, 0);
});

test('v2.1: trazos en vivo, fondo de hoja, ping y permiso de subida', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const guest = connect();
  await Promise.all([host.opened, guest.opened]);

  // El ping responde incluso antes de entrar.
  host.send({ t: 'ping', ts: 1234 });
  assert.equal((await host.next('pong')).ts, 1234);

  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey });
  const wh = await host.next('welcome');
  assert.deepEqual(wh.background, { pattern: 'dots', color: 'white' });
  assert.match(wh.uploadToken, /^[A-Za-z0-9_-]{20,}$/);
  guest.send({ t: 'join', room: id, name: 'Invitada' });
  const wg = await guest.next('welcome');
  assert.equal(wg.uploadToken, wh.uploadToken, 'mismo permiso de subida para la sala');
  await host.next('peer-join');

  // Trazo en vivo: se retransmite al resto con el autor (no al remitente).
  host.send({ t: 'stroke', id: 'live00001', from: 0, pts: [[1, 1], [2, 2]], s: { stroke: '#e03131' } });
  const st = await guest.next('stroke');
  assert.equal(st.by, wh.you.id);
  assert.equal(st.from, 0);
  assert.equal(st.id, 'live00001');
  assert.deepEqual(st.pts, [[1, 1], [2, 2]]);
  guest.send({ t: 'stroke', id: 'x', from: 0, pts: [[0, 0]] }); // id inválido: se ignora

  // La invitada no puede cambiar el fondo; el anfitrión sí y llega a todos.
  guest.send({ t: 'background', pattern: 'grid', color: 'dark' });
  assert.equal((await guest.next('error')).code, 'control_denied');
  host.send({ t: 'background', pattern: 'grid', color: 'dark' });
  const bg = await guest.next('background');
  assert.deepEqual([bg.pattern, bg.color], ['grid', 'dark']);
  await host.next('background');
  host.send({ t: 'background', pattern: 'grid', color: 'neon' });
  assert.equal((await host.next('error')).code, 'bad_request');

  // Quien entra después recibe el fondo actual.
  const late = connect();
  await late.opened;
  late.send({ t: 'join', room: id, name: 'Tarde' });
  assert.deepEqual((await late.next('welcome')).background, { pattern: 'grid', color: 'dark' });

  for (const c of [host, guest, late]) c.ws.close();
});

test('v2.2: fondo por página, títulos de página, cursor con página y sin eco de página', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const guest = connect();
  await Promise.all([host.opened, guest.opened]);
  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey });
  const wh = await host.next('welcome');
  assert.deepEqual([wh.pageBackgrounds, wh.pageTitles], [{}, {}]);
  guest.send({ t: 'join', room: id, name: 'Invitada' });
  await guest.next('welcome');
  await host.next('peer-join');

  // Fondo solo para la página 2; luego uno general que reemplaza los propios.
  host.send({ t: 'background', pattern: 'lines', color: 'cream', page: 2 });
  assert.deepEqual(await guest.next('background'), { t: 'background', pattern: 'lines', color: 'cream', page: 2 });
  await host.next('background');
  host.send({ t: 'background', pattern: 'iso', color: 'dark', page: 5000 });
  assert.equal((await host.next('error')).code, 'bad_request');

  // Títulos: el anfitrión pone, la invitada no puede.
  host.send({ t: 'page-title', n: 0, title: '  Introducción <b>  ' });
  assert.deepEqual(await guest.next('page-title'), { t: 'page-title', n: 0, title: 'Introducción b' });
  await host.next('page-title');
  guest.send({ t: 'page-title', n: 0, title: 'x' });
  assert.equal((await guest.next('error')).code, 'control_denied');

  // Quien entra después recibe fondos y títulos por página.
  const late = connect();
  await late.opened;
  late.send({ t: 'join', room: id, name: 'Tarde' });
  const wl = await late.next('welcome');
  assert.deepEqual(wl.pageBackgrounds, { 2: { pattern: 'lines', color: 'cream' } });
  assert.deepEqual(wl.pageTitles, { 0: 'Introducción b' });

  host.send({ t: 'background', pattern: 'grid', color: 'white' });
  await guest.next('background');
  const late2 = connect();
  await late2.opened;
  late2.send({ t: 'join', room: id, name: 'Más tarde' });
  const wl2 = await late2.next('welcome');
  assert.deepEqual([wl2.background, wl2.pageBackgrounds], [{ pattern: 'grid', color: 'white' }, {}]);

  // El cursor viaja con su página.
  host.send({ t: 'cursor', x: 10, y: 20, p: 3 });
  const cur = await guest.next('cursor');
  assert.deepEqual([cur.x, cur.y, cur.p], [10, 20, 3]);

  // Cambio de página: llega a los demás, no vuelve a quien lo hizo.
  host.send({ t: 'page', n: 1 });
  assert.equal((await guest.next('page')).n, 1);
  host.send({ t: 'ping', ts: 7 });
  const first = await Promise.race([host.next('page').then(() => 'page', () => 'nada'), host.next('pong').then(() => 'pong')]);
  assert.equal(first, 'pong');

  for (const c of [host, guest, late, late2]) c.ws.close();
});

test('v2.3: roles (visita/editor/presentador), solicitud de permiso y avatares', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const ana = connect();
  await Promise.all([host.opened, ana.opened]);
  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey, clientId: 'host-cliente-1' });
  const wh = await host.next('welcome');
  assert.equal(wh.you.role, 'host');
  assert.equal(wh.defaultRole, 'editor');

  // La gente nueva entra como visita.
  host.send({ t: 'role', default: 'visita' });
  assert.equal((await host.next('room-roles')).defaultRole, 'visita');
  ana.send({ t: 'join', room: id, name: 'Ana', clientId: 'ana-cliente-1' });
  const wa = await ana.next('welcome');
  assert.equal(wa.you.role, 'visita');
  const joined = await host.next('peer-join');
  assert.equal(joined.peer.role, 'visita');

  // Una visita no dibuja, no usa láser ni avatar; sí vota y reacciona.
  ana.send({ t: 'ops', ops: [{ id: 'visita0001', type: 'pen', version: 1, x: 0, y: 0, points: [[0, 0]] }] });
  assert.equal((await ana.next('error')).code, 'read_only');
  ana.send({ t: 'avatar', mode: 'body', color: '#ff0000' });
  ana.send({ t: 'reaction', e: 'like' });
  assert.equal((await host.next('reaction')).e, 'like');
  ana.send({ t: 'role', to: ana.ws.id, role: 'editor' }); // no es anfitriona
  assert.equal((await ana.next('error')).code, 'not_host');

  // Pide permiso → le llega al anfitrión → la hace editora (y se recuerda al volver).
  ana.send({ t: 'role-request' });
  const req = await host.next('role-request');
  assert.equal(req.name, 'Ana');
  host.send({ t: 'role', to: req.from, role: 'editor' });
  assert.equal((await ana.next('peer-role')).role, 'editor');
  ana.send({ t: 'ops', ops: [{ id: 'editor0001', type: 'pen', version: 1, x: 0, y: 0, points: [[0, 0]] }] });
  assert.equal((await host.next('ops')).ops[0].id, 'editor0001');

  // Avatar monigote con posición.
  ana.send({ t: 'avatar', mode: 'body', shape: 'circle', color: '#e03131', figure: 'mujer' });
  const av = await host.next('avatar');
  assert.deepEqual([av.mode, av.shape, av.figure, av.id], ['body', 'circle', 'mujer', req.from]);
  ana.send({ t: 'avatar-pos', x: 10.4, y: 20, f: -1, w: 0.5, m: true, s: false, p: 0 });
  const pos = await host.next('avatar-pos');
  assert.deepEqual([pos.x, pos.f, pos.m], [10, -1, true]);
  ana.send({ t: 'avatar', mode: 'volar' });
  assert.equal((await ana.next('error')).code, 'bad_request');

  // Todos a visita: el avatar se apaga.
  host.send({ t: 'role', all: 'visita' });
  assert.equal((await ana.next('peer-role')).role, 'visita');
  assert.equal((await host.next('avatar')).mode, 'off');
  ana.ws.close();
  await host.next('peer-leave');

  // Al volver con el mismo navegador conserva su rol.
  host.send({ t: 'role', default: 'editor' });
  await host.next('room-roles');
  const again = connect();
  await again.opened;
  again.send({ t: 'join', room: id, name: 'Ana', clientId: 'ana-cliente-1' });
  assert.equal((await again.next('welcome')).you.role, 'visita');
  for (const c of [host, again]) c.ws.close();
});

test('v2.5: mover, duplicar y borrar páginas; notas privadas del presentador; bloqueo', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const ana = connect();
  await Promise.all([host.opened, ana.opened]);
  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey });
  const wh = await host.next('welcome');
  assert.deepEqual(wh.notes, {});
  ana.send({ t: 'join', room: id, name: 'Ana' });
  const wa = await ana.next('welcome');
  assert.equal(wa.notes, undefined, 'las notas no llegan a los participantes');
  await host.next('peer-join');

  // Tres páginas con un elemento cada una (la 1 con un documento y su anotación anclada).
  const el = (i, page, extra = {}) => ({ id: `pagina00${i}`, type: 'rect', version: 1, x: 0, y: 0, w: 10, h: 10, page, ...extra });
  host.send({
    t: 'ops',
    ops: [el(0, 0), el(1, 1, { locked: true }), { ...el(2, 1), anchor: 'pagina001', anchorPage: 0 }, el(3, 2)],
  });
  await ana.next('ops');
  host.send({ t: 'page-title', n: 1, title: 'Medio' });
  await ana.next('page-title');
  host.send({ t: 'notes', n: 1, text: 'Recordar\nla demo' });
  host.send({ t: 'ping', ts: 1 });
  await host.next('pong');

  // Duplicar la página 1 → copia en la 2 (con anclaje re-mapeado) y la antigua 2 pasa a 3.
  host.send({ t: 'page-op', op: 'duplicate', n: 1 });
  const dup = await ana.next('ops');
  const copies = dup.ops.filter((o) => o.version === 1);
  assert.equal(copies.length, 2);
  const copyDoc = copies.find((o) => !o.anchor);
  assert.ok(copyDoc.locked, 'la copia conserva el bloqueo');
  assert.equal(copies.find((o) => o.anchor).anchor, copyDoc.id);
  assert.ok(dup.ops.some((o) => o.id === 'pagina003' && o.page === 3));
  const meta = await ana.next('page-meta');
  assert.deepEqual(meta.pageTitles, { 1: 'Medio', 2: 'Medio (copia)' });
  const notes = await host.next('notes');
  assert.deepEqual(notes.all, { 1: 'Recordar\nla demo', 2: 'Recordar\nla demo' });
  assert.equal((await ana.next('page')).n, 0);

  // Mover la página 3 al principio.
  host.send({ t: 'page-op', op: 'move', n: 3, to: 0 });
  const moved = await ana.next('ops');
  assert.equal(moved.ops.find((o) => o.id === 'pagina003').page, 0);
  assert.equal(moved.ops.find((o) => o.id === 'pagina000').page, 1);
  await ana.next('page-meta');

  // Borrar la página 0 (la que se movió): sus elementos quedan borrados y el resto sube.
  host.send({ t: 'page-op', op: 'delete', n: 0 });
  const del = await ana.next('ops');
  assert.ok(del.ops.find((o) => o.id === 'pagina003').isDeleted);
  assert.equal(del.ops.find((o) => o.id === 'pagina000').page, 0);

  // Una participante sin permiso no puede organizar páginas ni escribir notas.
  ana.send({ t: 'page-op', op: 'delete', n: 0 });
  assert.equal((await ana.next('error')).code, 'control_denied');
  ana.send({ t: 'notes', n: 0, text: 'x' });
  assert.equal((await ana.next('error')).code, 'not_host');
  for (const c of [host, ana]) c.ws.close();
});

test('v2.6: ver las cámaras de todos (peer-watch) y señales de visitas que solo reciben', async () => {
  const { id, hostKey } = await createRoom();
  const host = connect();
  const ana = connect();
  const vale = connect();
  await Promise.all([host.opened, ana.opened, vale.opened]);
  host.send({ t: 'join', room: id, name: 'Anfitrión', hostKey });
  await host.next('welcome');
  host.send({ t: 'role', default: 'visita' });
  await host.next('room-roles');
  host.send({ t: 'role', default: 'editor' });
  await host.next('room-roles');
  ana.send({ t: 'join', room: id, name: 'Ana' });
  const wa = await ana.next('welcome');
  host.send({ t: 'role', default: 'visita' });
  await host.next('room-roles');
  vale.send({ t: 'join', room: id, name: 'Vale' });
  const wv = await vale.next('welcome');
  assert.equal(wv.you.role, 'visita');

  // Vale quiere ver las cámaras → Ana se entera.
  vale.send({ t: 'cam-watch', on: true });
  const watch = await ana.next('peer-watch');
  assert.deepEqual([watch.id, watch.on], [wv.you.id, true]);

  // Ana (editora) le envía su oferta; Vale (visita) puede responder como receptora…
  ana.send({ t: 'rtc', to: wv.you.id, data: { type: 'offer', sdp: 'v=0', role: 'send' } });
  assert.equal((await vale.next('rtc')).data.type, 'offer');
  vale.send({ t: 'rtc', to: wa.you.id, data: { type: 'answer', sdp: 'v=0', role: 'recv' } });
  assert.equal((await ana.next('rtc')).data.role, 'recv');
  // …pero no puede enviar su propia cámara.
  vale.send({ t: 'rtc', to: wa.you.id, data: { type: 'offer', sdp: 'v=0', role: 'send' } });
  ana.send({ t: 'ping', ts: 5 });
  assert.equal((await ana.next('pong')).ts, 5);
  for (const c of [host, ana, vale]) c.ws.close();
});
