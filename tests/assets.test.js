import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/storage/MemoryStore.js';
import { loadConfig } from '../server/config.js';
import { safeExt, safeName } from '../server/assets/AssetStore.js';
import { sanitizeElement } from '../shared/elements.js';
import { validateBackground, validateStroke } from '../shared/protocol.js';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

async function startApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-assets-'));
  const app = await createApp(loadConfig({ dataDir, httpsPort: 0, sweepIntervalMs: 3_600_000 }), { store: new MemoryStore(), logger: silent });
  const addr = await app.listen(0, '127.0.0.1');
  return { app, base: `http://127.0.0.1:${addr.port}`, dataDir };
}

const createRoom = async (base) => (await fetch(`${base}/api/rooms`, { method: 'POST', body: '{}' })).json();

test('nombres y extensiones de adjuntos se sanean', () => {
  assert.equal(safeExt('Clase 1.PPTX'), 'pptx');
  assert.equal(safeExt('sin-extension'), 'bin');
  assert.equal(safeExt('raro.ex e'), 'bin');
  assert.equal(safeName('../../etc/<passwd>'), '....etcpasswd');
  assert.equal(safeName(''), 'archivo');
});

test('elementos de imagen, documento y archivo solo aceptan URLs de la sala', () => {
  const base = { id: 'abcd1234', version: 1, x: 0, y: 0, w: 100, h: 80 };
  assert.ok(sanitizeElement({ ...base, type: 'image', src: '/assets/abcd/AAAAAAAAAAAA.png' }));
  assert.equal(sanitizeElement({ ...base, type: 'image', src: 'https://malo.example/x.png' }), null);
  assert.equal(sanitizeElement({ ...base, type: 'image', src: 'javascript:alert(1)' }), null);
  const doc = sanitizeElement({ ...base, type: 'doc', pages: ['/assets/abcd/AAAAAAAAAAAA.jpg', 'http://x/y.jpg', '/assets/abcd/BBBBBBBBBBBB.jpg'], docPage: 9 });
  assert.equal(doc.pages.length, 2);
  assert.equal(doc.docPage, 1);
  const pen = sanitizeElement({ id: 'pen12345', type: 'pen', version: 1, points: [[0, 0]], anchor: 'abcd1234', anchorPage: 3 });
  assert.equal(pen.anchor, 'abcd1234');
  assert.equal(pen.anchorPage, 3);
});

test('validadores de fondo y de trazo en vivo', () => {
  assert.deepEqual(validateBackground({ pattern: 'grid', color: 'dark' }), { pattern: 'grid', color: 'dark' });
  assert.equal(validateBackground({ pattern: 'grid', color: 'rojo' }), null);
  assert.equal(validateBackground({ pattern: 'x', color: 'white' }), null);
  assert.ok(validateStroke({ id: 'abcd1234', from: 0, pts: [[1, 2]] }));
  assert.equal(validateStroke({ id: 'abcd1234', from: -1, pts: [[1, 2]] }), null);
  assert.equal(validateStroke({ id: 'abcd1234', from: 0, pts: [] }), null);
  assert.equal(validateStroke({ id: 'abcd1234', from: 0, pts: Array(201).fill([0, 0]) }), null);
});

test('subir, servir y borrar adjuntos', async () => {
  const { app, base, dataDir } = await startApp();
  try {
    const room = await createRoom(base);
    const up = (body, headers = {}) =>
      fetch(`${base}/api/rooms/${room.id}/assets`, { method: 'POST', body, headers: { 'X-Trazo-Name': encodeURIComponent('foto.png'), ...headers } });

    assert.equal((await up('hola')).status, 403, 'sin permiso no se sube');
    assert.equal((await up('hola', { 'X-Trazo-Token': 'falso' })).status, 403);

    const token = app.assets.tokenFor(room.id);
    const res = await up(Buffer.from('PNGDATA'), { 'X-Trazo-Token': token });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.url, new RegExp(`^/assets/${room.id}/[A-Za-z0-9_-]+\\.png$`));
    const got = await fetch(base + body.url);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await got.text(), 'PNGDATA');

    // Un archivo cualquiera se descarga (no se muestra en el navegador).
    const html = await (await up('<script>alert(1)</script>', { 'X-Trazo-Token': token, 'X-Trazo-Name': 'x.html' })).json();
    const dl = await fetch(`${base}${html.url}?name=pagina.html`);
    assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
    assert.match(dl.headers.get('content-disposition'), /^attachment/);

    // Rutas peligrosas o inexistentes
    assert.equal((await fetch(`${base}/assets/${room.id}/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/assets/${room.id}/noexiste12345.png`)).status, 404);

    // El permiso de una sala no sirve para otra.
    const other = await createRoom(base);
    const cross = await fetch(`${base}/api/rooms/${other.id}/assets`, { method: 'POST', body: 'x', headers: { 'X-Trazo-Token': token } });
    assert.equal(cross.status, 403);

    // Al cerrarse la sala se borran sus archivos.
    await app.rooms.store.delete(room.id);
    app.rooms.rooms.delete(room.id);
    await app.rooms.sweep();
    await assert.rejects(fs.stat(path.join(dataDir, 'assets', room.id)));
  } finally {
    await app.close();
  }
});

test('límite de tamaño por archivo', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trazo-assets-'));
  const app = await createApp(loadConfig({ dataDir, httpsPort: 0, sweepIntervalMs: 3_600_000, assets: { maxFileBytes: 1000 } }), {
    store: new MemoryStore(),
    logger: silent,
  });
  const addr = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const room = await createRoom(base);
    const res = await fetch(`${base}/api/rooms/${room.id}/assets`, {
      method: 'POST',
      body: Buffer.alloc(5000),
      headers: { 'X-Trazo-Token': app.assets.tokenFor(room.id), 'X-Trazo-Name': 'grande.bin' },
    });
    assert.equal(res.status, 413);
  } finally {
    await app.close();
  }
});

const hasSoffice = (() => {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore', timeout: 20000 });
    return true;
  } catch {
    return false;
  }
})();

test('PowerPoint/Word se convierten a PDF (LibreOffice)', { skip: !hasSoffice && 'LibreOffice no instalado', timeout: 180000 }, async () => {
  const { app, base } = await startApp();
  try {
    const room = await createRoom(base);
    // Documento RTF mínimo (Word lo abre; LibreOffice también).
    const rtf = '{\\rtf1\\ansi Hola desde Trazo\\par}';
    const res = await fetch(`${base}/api/rooms/${room.id}/assets`, {
      method: 'POST',
      body: rtf,
      headers: { 'X-Trazo-Token': app.assets.tokenFor(room.id), 'X-Trazo-Name': 'nota.rtf' },
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.ok(body.pdf, body.convertError);
    const pdf = Buffer.from(await (await fetch(base + body.pdf)).arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  } finally {
    await app.close();
  }
});
