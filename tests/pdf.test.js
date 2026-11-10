import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf } from '../public/js/render/pdfWriter.js';

test('el PDF exportado tiene una página por imagen y una tabla xref válida', async () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const blob = buildPdf([
    { width: 800, height: 600, data: fakeJpeg },
    { width: 400, height: 300, data: fakeJpeg },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 600\.00 450\.00\]/);
  // Cada entrada de la tabla xref apunta exactamente al inicio de su objeto.
  const xrefAt = Number(text.match(/startxref\n(\d+)/)[1]);
  const entries = text.slice(xrefAt).split('\n').slice(3, 11);
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
});
