import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distToSegment, getBounds, hitTest, normalizeRect, rectsIntersect, rectContains } from '../shared/geometry.js';

test('distToSegment calcula la distancia perpendicular y a los extremos', () => {
  assert.equal(distToSegment(5, 5, 0, 0, 10, 0), 5);
  assert.equal(distToSegment(13, 4, 0, 0, 10, 0), 5);
});

test('normalizeRect invierte ancho/alto negativos', () => {
  assert.deepEqual(normalizeRect(10, 10, -4, -6), { x: 6, y: 4, w: 4, h: 6 });
});

test('getBounds de un trazo usa sus puntos relativos', () => {
  const el = { type: 'pen', x: 100, y: 100, points: [[0, 0], [10, -5], [20, 5]] };
  assert.deepEqual(getBounds(el), { x: 100, y: 95, w: 20, h: 10 });
});

test('hitTest de rectángulo sin relleno solo toca el borde', () => {
  const el = { type: 'rect', x: 0, y: 0, w: 100, h: 100, fill: 'transparent', strokeWidth: 2 };
  assert.equal(hitTest(el, 0, 50), true);
  assert.equal(hitTest(el, 50, 50), false);
  assert.equal(hitTest({ ...el, fill: '#ff0000' }, 50, 50), true);
});

test('hitTest de elipse detecta el borde', () => {
  const el = { type: 'ellipse', x: 0, y: 0, w: 100, h: 50, fill: 'transparent', strokeWidth: 2 };
  assert.equal(hitTest(el, 50, 0), true);
  assert.equal(hitTest(el, 50, 25), false);
  assert.equal(hitTest(el, 200, 200), false);
});

test('hitTest de línea y texto', () => {
  const line = { type: 'line', x: 0, y: 0, points: [[0, 0], [100, 100]], strokeWidth: 2 };
  assert.equal(hitTest(line, 50, 52), true);
  assert.equal(hitTest(line, 50, 80), false);
  const text = { type: 'text', x: 10, y: 10, w: 50, h: 20, strokeWidth: 0 };
  assert.equal(hitTest(text, 30, 20), true);
});

test('intersección y contención de rectángulos', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsIntersect(a, { x: 20, y: 20, w: 1, h: 1 }), false);
  assert.equal(rectContains(a, { x: 2, y: 2, w: 3, h: 3 }), true);
});
