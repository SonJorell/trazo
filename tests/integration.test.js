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
