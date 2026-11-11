import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeElement, shouldReplace, bump, createElement, LIMITS } from '../shared/elements.js';

const base = { id: 'abcd1234', type: 'rect', version: 1, nonce: 5, x: 10, y: 20, w: 30, h: 40 };

test('sanitizeElement acepta un rectángulo válido y descarta campos desconocidos', () => {
  const el = sanitizeElement({ ...base, hacker: '<script>' });
  assert.equal(el.type, 'rect');
  assert.equal(el.w, 30);
  assert.equal('hacker' in el, false);
});

test('sanitizeElement rechaza tipos, ids y versiones inválidas', () => {
  assert.equal(sanitizeElement({ ...base, type: 'image' }), null);
  assert.equal(sanitizeElement({ ...base, id: '../x' }), null);
  assert.equal(sanitizeElement({ ...base, version: 0 }), null);
  assert.equal(sanitizeElement(null), null);
});

test('sanitizeElement normaliza colores y limita grosor y texto', () => {
  const el = sanitizeElement({ ...base, stroke: 'red', fill: 'javascript:', strokeWidth: 999 });
  assert.equal(el.stroke, '#1e1e1e');
  assert.equal(el.fill, 'transparent');
  assert.equal(el.strokeWidth, LIMITS.maxStrokeWidth);
  const t = sanitizeElement({ ...base, type: 'text', text: 'x'.repeat(5000) });
  assert.equal(t.text.length, LIMITS.maxText);
});

test('sanitizeElement exige puntos en trazos y recorta los inválidos', () => {
  assert.equal(sanitizeElement({ ...base, type: 'pen' }), null);
  const el = sanitizeElement({ ...base, type: 'pen', points: [[0, 0], ['a', 1], [2, Infinity], [3, 3]] });
  assert.deepEqual(el.points, [[0, 0], [3, 3]]);
});

test('shouldReplace: gana la versión mayor y desempata el nonce', () => {
  const a = { version: 2, nonce: 10 };
  assert.equal(shouldReplace(null, a), true);
  assert.equal(shouldReplace(a, { version: 3, nonce: 0 }), true);
  assert.equal(shouldReplace(a, { version: 1, nonce: 99 }), false);
  assert.equal(shouldReplace(a, { version: 2, nonce: 11 }), true);
  assert.equal(shouldReplace(a, { version: 2, nonce: 9 }), false);
});

test('bump incrementa la versión sin mutar el original', () => {
  const el = createElement('rect', { w: 1, h: 1 });
  const next = bump(el, { x: 5 });
  assert.equal(el.version, 1);
  assert.equal(next.version, 2);
  assert.equal(next.x, 5);
  assert.ok(sanitizeElement(next));
});

test('pinceles, líneas, opacidad y autor se validan', () => {
  const ok = sanitizeElement({ ...base, type: 'pen', points: [[0, 0]], brush: 'neon', dash: 'dotted', opacity: 0.5, author: 'yo123456' });
  assert.deepEqual([ok.brush, ok.dash, ok.opacity, ok.author], ['neon', 'dotted', 0.5, 'yo123456']);
  const bad = sanitizeElement({ ...base, brush: 'lanzallamas', dash: '<x>', opacity: 9, author: '../etc' });
  assert.deepEqual([bad.brush, bad.dash, bad.opacity, 'author' in bad], ['pen', 'solid', 1, false]);
});

test('el grosor efectivo del pincel cuenta para tocar el trazo', async () => {
  const { hitTest } = await import('../shared/geometry.js');
  const line = { type: 'line', x: 0, y: 0, points: [[0, 0], [100, 0]], strokeWidth: 4 };
  assert.equal(hitTest(line, 50, 8, 0), false);
  assert.equal(hitTest({ ...line, brush: 'highlighter' }, 50, 8, 0), true);
});

test('sellos vectoriales: solo íconos conocidos', () => {
  const base = { id: 'sello0001', type: 'stamp', version: 1, x: 0, y: 0, w: 64, h: 64 };
  assert.equal(sanitizeElement({ ...base, icon: 'star' }).icon, 'star');
  assert.equal(sanitizeElement({ ...base, icon: '★' }), null);
  assert.equal(sanitizeElement({ ...base, icon: 'check', w: 99999 }).w, 1200);
});
