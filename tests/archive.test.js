import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RoomManager } from '../server/rooms/RoomManager.js';
import { MemoryStore } from '../server/storage/MemoryStore.js';
import { AssetStore } from '../server/assets/AssetStore.js';
import { exportRoom, importRoom, assetUrls } from '../server/rooms/archive.js';

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-arch-'));
  const assets = new AssetStore(dir);
  await assets.init();
  const rooms = new RoomManager({ store: new MemoryStore(), saveDelayMs: 0, assets });
  return { rooms, assets };
}

test('guardar y abrir una sala conserva páginas, notas, elementos y adjuntos', async () => {
  const { rooms, assets } = await setup();
  const room = await rooms.create();
  await fs.mkdir(assets.roomDir(room.id), { recursive: true });
  const file = 'abcdEFGH1234.png';
  await fs.writeFile(path.join(assets.roomDir(room.id), file), Buffer.from('PNGDATA'));
  room.applyOps([
    { id: 'rect0001', type: 'rect', version: 1, x: 10, y: 20, w: 30, h: 40, page: 1 },
    { id: 'img00001', type: 'image', version: 1, x: 0, y: 0, w: 100, h: 80, src: `/assets/${room.id}/${file}` },
    { id: 'gone0001', type: 'rect', version: 2, isDeleted: true, x: 0, y: 0, w: 5, h: 5 },
  ]);
  room.pageTitles = { 1: 'Resultados' };
  room.notes = { 0: 'Saludar y presentar el objetivo' };
  room.pageBackgrounds = { 1: { pattern: 'grid', color: 'white' } };
  room.page = 1;

  const archive = JSON.parse(JSON.stringify(await exportRoom(room, assets)));
  assert.equal(archive.format, 'trazo-sala');
  assert.equal(archive.elements.length, 2, 'los borrados no se guardan');
  assert.deepEqual(Object.keys(archive.files), [file]);

  const copy = await importRoom(rooms, assets, archive);
  assert.notEqual(copy.id, room.id);
  assert.ok(copy.issuedHostKey, 'quien abre el archivo queda como anfitrión');
  assert.equal(copy.page, 1);
  assert.equal(copy.pageTitles[1], 'Resultados');
  assert.equal(copy.notes[0], 'Saludar y presentar el objetivo');
  assert.deepEqual(copy.pageBackgrounds[1], { pattern: 'grid', color: 'white' });
  const img = copy.elements.get('img00001');
  assert.equal(img.src, `/assets/${copy.id}/${file}`, 'el adjunto apunta a la sala nueva');
  assert.equal(await fs.readFile(assets.filePath(copy.id, file), 'utf8'), 'PNGDATA');
  assert.equal(copy.elements.get('rect0001').page, 1);
  assert.deepEqual([...assetUrls(copy.snapshot())], [img.src]);
});

test('abrir un archivo inválido o con adjuntos peligrosos no deja salas a medias', async () => {
  const { rooms, assets } = await setup();
  await assert.rejects(() => importRoom(rooms, assets, { format: 'otro' }), /No es un archivo/);
  await assert.rejects(() => importRoom(rooms, assets, { format: 'trazo-sala', version: 99, elements: [] }), /más nueva/);

  // Nombres de archivo con rutas se ignoran; un elemento que apunta a un adjunto ausente se descarta.
  const room = await importRoom(rooms, assets, {
    format: 'trazo-sala',
    version: 1,
    elements: [
      { id: 'img00001', type: 'image', version: 1, x: 0, y: 0, w: 10, h: 10, src: '/assets/zzzzzz/faltante0001.png' },
      { id: 'note0001', type: 'note', version: 1, x: 0, y: 0, w: 200, h: 120, text: 'Hola <b>', fill: '#ffec99' },
    ],
    files: { '../../escape.txt': Buffer.from('x').toString('base64') },
    room: { background: { pattern: 'evil', color: 'white' }, pageTitles: { 0: '<script>Título' }, notes: { abc: 'x' } },
  });
  assert.equal(room.elements.size, 1);
  assert.equal(room.elements.get('note0001').text, 'Hola <b>');
  assert.deepEqual(room.background, { pattern: 'dots', color: 'white' });
  assert.equal(room.pageTitles[0], 'scriptTítulo');
  assert.deepEqual(room.notes, {});
  await assert.rejects(fs.access(path.join(assets.dir, '..', 'escape.txt')));

  // Si los adjuntos superan el límite, la sala creada se descarta.
  const small = new AssetStore(path.dirname(assets.dir), { maxFileBytes: 4, maxRoomBytes: 4 });
  const before = rooms.rooms.size;
  await assert.rejects(
    () => importRoom(rooms, small, { format: 'trazo-sala', version: 1, elements: [], files: { 'abcdEFGH1234.png': Buffer.from('demasiado').toString('base64') } }),
    /límite/,
  );
  assert.equal(rooms.rooms.size, before);
});
