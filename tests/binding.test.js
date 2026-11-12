import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundPoint, routeArrow, arrowsBoundTo, BIND_GAP } from '../shared/binding.js';
import { sanitizeElement } from '../shared/elements.js';

const rect = (id, x, y, w, h, extra = {}) => ({ id, type: 'rect', version: 1, x, y, w, h, page: 0, ...extra });
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

test('boundPoint cae en el borde del rectángulo y de la elipse, con margen', () => {
  const r = rect('r1', 0, 0, 100, 50);
  const p = boundPoint(r, { x: 500, y: 25 });
  assert.ok(near(p.x, 100 + BIND_GAP) && near(p.y, 25), JSON.stringify(p));
  const top = boundPoint(r, { x: 50, y: -300 });
  assert.ok(near(top.x, 50) && near(top.y, -BIND_GAP));
  const e = { ...r, type: 'ellipse' };
  const q = boundPoint(e, { x: 50 + 1000, y: 25 + 1000 }); // 45°
  // A 45° el punto (sin el margen) está sobre la elipse: (x/rx)² + (y/ry)² = 1
  const back = { x: q.x - 50 - BIND_GAP / Math.SQRT2, y: q.y - 25 - BIND_GAP / Math.SQRT2 };
  assert.ok(near((back.x / 50) ** 2 + (back.y / 25) ** 2, 1, 1e-6));
});

test('routeArrow une dos formas apuntando de centro a centro y sigue a la que se mueve', () => {
  const a = rect('aaaa', 0, 0, 100, 100);
  const b = rect('bbbb', 300, 0, 100, 100);
  const arrow = { id: 'arr1', type: 'arrow', x: 50, y: 50, points: [[0, 0], [300, 0]], startBind: 'aaaa', endBind: 'bbbb', page: 0 };
  const els = { aaaa: a, bbbb: b };
  const r = routeArrow(arrow, (id) => els[id]);
  assert.ok(near(r.x, 100 + BIND_GAP) && near(r.y, 50));
  assert.ok(near(r.x + r.points[1][0], 300 - BIND_GAP) && near(r.points[1][1], 0));

  els.bbbb = rect('bbbb', 300, 300, 100, 100); // se movió hacia abajo
  const moved = routeArrow({ ...arrow, ...r }, (id) => els[id]);
  const end = { x: moved.x + moved.points[1][0], y: moved.y + moved.points[1][1] };
  assert.ok(end.x > 300 - BIND_GAP - 0.01 && end.y > 300 - BIND_GAP - 0.01, 'la punta llega a la forma nueva');
  assert.equal(routeArrow({ ...arrow, ...moved }, (id) => els[id]), null, 'si nada cambió no hay cambios');
});

test('un extremo suelto se mantiene; formas borradas u otra página no atan', () => {
  const a = rect('aaaa', 0, 0, 100, 100);
  const arrow = { id: 'arr1', type: 'line', x: 200, y: 50, points: [[0, 0], [100, 0]], startBind: 'aaaa', page: 0 };
  const r = routeArrow(arrow, () => a);
  assert.ok(near(r.x, 100 + BIND_GAP));
  assert.ok(near(r.x + r.points[1][0], 300), 'el extremo libre no se mueve');
  assert.equal(routeArrow(arrow, () => ({ ...a, isDeleted: true })), null);
  assert.equal(routeArrow(arrow, () => ({ ...a, page: 2 })), null);
  assert.deepEqual(arrowsBoundTo([arrow, a], 'aaaa').map((e) => e.id), ['arr1']);
});

test('sanitizeElement conserva los enlaces válidos solo en líneas y flechas', () => {
  const base = { id: 'arr1', version: 1, x: 0, y: 0, points: [[0, 0], [1, 1]] };
  const ok = sanitizeElement({ ...base, type: 'arrow', startBind: 'abcd1234', endBind: 'efgh5678' });
  assert.equal(ok.startBind, 'abcd1234');
  assert.equal(ok.endBind, 'efgh5678');
  const bad = sanitizeElement({ ...base, type: 'arrow', startBind: '<script>', endBind: 5 });
  assert.equal(bad.startBind, undefined);
  assert.equal(bad.endBind, undefined);
  assert.equal(sanitizeElement({ ...base, type: 'pen', startBind: 'abcd1234' }).startBind, undefined);
});
