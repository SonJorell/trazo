import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RoomManager } from '../server/rooms/RoomManager.js';
import { MemoryStore } from '../server/storage/MemoryStore.js';
import { FileStore } from '../server/storage/FileStore.js';
import { hashPin, verifyPin } from '../server/rooms/pin.js';
import { TokenBucket } from '../server/realtime/rateLimiter.js';

const el = (id, version, extra = {}) => ({ id, type: 'rect', version, nonce: 1, x: 0, y: 0, w: 5, h: 5, ...extra });

test('PIN: hash con sal y verificación', () => {
  const stored = hashPin('1234');
  assert.notEqual(stored.hash, '1234');
  assert.equal(verifyPin('1234', stored), true);
  assert.equal(verifyPin('0000', stored), false);
  assert.equal(verifyPin(undefined, stored), false);
  assert.equal(verifyPin('cualquiera', null), true);
});

test('RoomManager crea salas con código válido y rechaza PIN mal formado', async () => {
  const rooms = new RoomManager({ store: new MemoryStore(), saveDelayMs: 0 });
  const room = await rooms.create();
  assert.match(room.id, /^[a-z0-9]{6}$/);
  assert.equal(room.hasPin, false);
  await assert.rejects(() => rooms.create({ pin: '12' }), /PIN/);
  const locked = await rooms.create({ pin: '4321' });
  assert.equal(rooms.checkPin(locked, '4321'), true);
});

test('Room.applyOps aplica last-writer-wins y descarta basura', async () => {
  const rooms = new RoomManager({ store: new MemoryStore(), saveDelayMs: 0 });
  const room = await rooms.create();
  let r = room.applyOps([el('elem0001', 2), { basura: true }]);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected, 1);
  r = room.applyOps([el('elem0001', 1, { x: 99 })]);
  assert.equal(r.accepted.length, 0, 'versión vieja no reemplaza');
  r = room.applyOps([el('elem0001', 3, { x: 99 })]);
  assert.equal(room.elements.get('elem0001').x, 99);
});

test('las salas persisten en disco y se recargan', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-'));
  try {
    const store = new FileStore(dir);
    await store.init();
    const rooms = new RoomManager({ store, saveDelayMs: 10 });
    const room = await rooms.create({ pin: '9999' });
    room.applyOps([el('persist01', 1)]);
    await rooms.flush();

    const fresh = new RoomManager({ store, saveDelayMs: 10 });
    const loaded = await fresh.get(room.id);
    assert.ok(loaded.elements.has('persist01'));
    assert.equal(fresh.checkPin(loaded, '9999'), true);
    const raw = await fs.readFile(path.join(dir, 'rooms', `${room.id}.json`), 'utf8');
    assert.equal(raw.includes('9999'), false, 'el PIN no se guarda en texto plano');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('get() rechaza códigos con rutas peligrosas', async () => {
  const rooms = new RoomManager({ store: new MemoryStore() });
  assert.equal(await rooms.get('../../etc'), null);
  assert.equal(await rooms.get('NOEXISTE'), null);
});

test('TokenBucket limita ráfagas y se recarga con el tiempo', () => {
  let now = 0;
  const b = new TokenBucket({ capacity: 3, refillPerSec: 1 }, () => now);
  assert.equal(b.take(), true);
  assert.equal(b.take(), true);
  assert.equal(b.take(), true);
  assert.equal(b.take(), false);
  now = 1000;
  assert.equal(b.take(), true);
});

test('las salas vacías se cierran y borran pasado el plazo', async () => {
  const store = new MemoryStore();
  const rooms = new RoomManager({ store, saveDelayMs: 0, emptyRoomTtlMs: 60_000 });
  const t0 = Date.now();
  const empty = await rooms.create();
  const busy = await rooms.create({ mode: 'live' });
  busy.addPeer({ id: 'p1', name: 'Ana', send: () => {} });

  // Antes del plazo no se cierra nada.
  assert.deepEqual(await rooms.sweep(t0 + 30_000), []);

  // Pasado el plazo se cierra solo la vacía; la que tiene gente sigue.
  assert.deepEqual(await rooms.sweep(t0 + 61_000), [empty.id]);
  assert.equal(await rooms.get(empty.id), null);
  assert.equal(await store.exists(empty.id), false);
  assert.ok(await rooms.get(busy.id));

  // Cuando se va el último, el plazo cuenta desde su salida.
  busy.removePeer('p1');
  await rooms.releaseIfEmpty(busy);
  const left = busy.lastActiveAt;
  assert.deepEqual(await rooms.sweep(left + 59_000), []);
  assert.deepEqual(await rooms.sweep(left + 60_000), [busy.id]);
});

test('el barrido también cierra salas viejas que solo están en disco', async () => {
  const store = new MemoryStore();
  await store.save('viejo1', { id: 'viejo1', createdAt: 0, lastActiveAt: 0, elements: [] });
  const rooms = new RoomManager({ store, emptyRoomTtlMs: 60_000 });
  // Recién arrancado el servidor hay gracia para que la gente se reconecte.
  assert.deepEqual(await rooms.sweep(Date.now()), []);
  assert.deepEqual(await rooms.sweep(Date.now() + 61_000), ['viejo1']);
  assert.deepEqual(await store.list(), []);
});

test('FileStore: guardados simultáneos de la misma sala no chocan', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-'));
  try {
    const store = new FileStore(dir);
    await store.init();
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.save('carrera', { id: 'carrera', n: i })));
    assert.equal((await store.load('carrera')).n, 19, 'gana el último guardado');
    const leftovers = (await fs.readdir(path.join(dir, 'rooms'))).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
    await store.delete('carrera');
    assert.equal(await store.exists('carrera'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
