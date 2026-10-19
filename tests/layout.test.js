// Unit tests for the loop geometry. layout.js has no Three.js or DOM, so these run straight in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { L, R, P, BACK0, IND, INDUCT_ANGLE, pathAt, crossed, mod } from '../js/layout.js';

/** @type {(a: number, b: number, eps: number, msg: string) => void} */
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('loop length is two straights plus two half circles', () => {
  close(P, 2 * L + 2 * Math.PI * R, 1e-9, 'P');
});

test('path is continuous and travelled at unit speed, including the joins', () => {
  const ds = 0.005;
  let prev = pathAt(0);
  for (let s = ds; s <= P + 1e-9; s += ds) {
    const cur = pathAt(s);
    close(Math.hypot(cur.x - prev.x, cur.z - prev.z), ds, 1e-4, `step length at s=${s.toFixed(3)}`);
    prev = cur;
  }
});

test('heading is a unit vector along the direction of travel', () => {
  const ds = 1e-4;
  for (let s = 0; s < P; s += 0.37) {
    const a = pathAt(s), b = pathAt(s + ds);
    close(Math.hypot(a.hx, a.hz), 1, 1e-9, `|heading| at s=${s}`);
    close((b.x - a.x) / ds, a.hx, 1e-3, `hx at s=${s}`);
    close((b.z - a.z) / ds, a.hz, 1e-3, `hz at s=${s}`);
  }
});

test('outward normal points away from the loop centre', () => {
  for (let s = 0; s < P; s += 0.5) {
    const p = pathAt(s);
    const cx = Math.max(-L / 2, Math.min(L / 2, p.x)); // nearest point on the centre line
    assert.ok((p.x - cx) * p.ox + p.z * p.oz > 0, `outward at s=${s}`);
  }
});

test('front straight runs +x at z=R, back straight runs -x at z=-R', () => {
  const f = pathAt(L / 2), b = pathAt(BACK0 + L / 2);
  [[f.x, 0], [f.z, R], [f.hx, 1], [f.hz, 0]].forEach(([a, e], i) => close(a, e, 1e-9, `front ${i}`));
  [[b.x, 0], [b.z, -R], [b.hx, -1], [b.hz, 0]].forEach(([a, e], i) => close(a, e, 1e-9, `back ${i}`));
});

test('mod wraps negative and overflowing distances', () => {
  close(mod(-1), P - 1, 1e-9, 'mod(-1)');
  close(mod(P + 2), 2, 1e-9, 'mod(P+2)');
});

test('crossed detects passing a point, including across the wrap-around', () => {
  assert.equal(crossed(1, 2, 1.5), true);
  assert.equal(crossed(1, 2, 2), true, 'landing exactly on the target counts');
  assert.equal(crossed(1, 2, 1), false, 'starting on the target does not');
  assert.equal(crossed(1, 2, 3), false);
  assert.equal(crossed(P - 0.1, 0.1, 0), true, 'target at the seam');
  assert.equal(crossed(P - 0.1, 0.1, P - 0.05), true);
  assert.equal(crossed(P - 0.1, 0.1, 0.2), false);
  assert.equal(crossed(2, 2, 2), false, 'no movement');
});

test('infeed joins the front straight at 45 degrees', () => {
  close(IND.z, R, 1e-9, 'induction point on front straight');
  close(INDUCT_ANGLE, Math.PI / 4, 1e-9, 'induction angle');
});
