import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { MemoryStore } from '../server/storage/MemoryStore.js';
import { createLogger } from '../server/util/logger.js';

let app;
let base;

before(async () => {
  const config = loadConfig({ port: 0, host: '127.0.0.1', saveDelayMs: 10, logLevel: 'silent' });
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
  const evil = await fetch(`${base}/shared/..%2f..%2fpackage.json`);
  assert.equal(evil.status, 404);
});

test('API: crear y consultar salas', async () => {
  const { id, hasPin } = await createRoom({ pin: '2468' });
  assert.equal(hasPin, true);
  const info = await (await fetch(`${base}/api/rooms/${id}`)).json();
  assert.deepEqual(info, { id, hasPin: true });
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
