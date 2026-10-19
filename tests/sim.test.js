// End-to-end simulation tests: runs each scenario in tests/sim.html with headless Chrome
// (see browser.js) and checks the outcome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startServer, stopServer, runPage } from './browser.js';

before(startServer);
after(stopServer);
const runScenario = name => runPage(`tests/sim.html?scenario=${name}`);

const sortedInto = (r, key) => r.bins[key].length;

test('six parcels are weighed, scanned, measured and sorted to their own chute', { skip }, async () => {
  const r = await runScenario('flow');
  assert.equal(r.parcels.length, 6);
  for (const p of r.parcels) {
    assert.ok(p.weighed && p.scanned && p.measured, `every parcel passes all three stations: ${JSON.stringify(p)}`);
    assert.equal(p.state, 'bin');
  }
  assert.equal(r.stats.A + r.stats.B, 6);
  assert.ok(r.bins.A.every(d => d === 'A') && r.bins.B.every(d => d === 'B'), 'no parcel in the wrong chute');
  assert.equal(r.stats.recirc, 0);
  assert.equal(r.belt, 0);
  assert.equal(r.robot, 'Idle');
});

test('a closed chute makes its parcels go round again until it reopens', { skip }, async () => {
  const { whileClosed, reopened } = await runScenario('closed');
  assert.equal(sortedInto(whileClosed, 'A'), 0, 'nothing enters a closed chute');
  assert.equal(whileClosed.parcels.filter(p => p.state === 'carrier').length, 3, 'all three stay on the loop');
  assert.ok(whileClosed.stats.recirc >= 3, 'each parcel passed its chute at least once');
  assert.equal(sortedInto(reopened, 'A'), 3, 'all three sorted after reopening');
});

test('a full bin stops taking parcels and the extra one keeps circulating', { skip }, async () => {
  const r = await runScenario('full');
  assert.equal(sortedInto(r, 'B'), 9, 'bin holds 9');
  assert.equal(r.count.B, 9);
  const left = r.parcels.filter(p => p.state === 'carrier');
  assert.equal(left.length, 1, 'tenth parcel still on the loop');
  assert.ok(left[0].recirc > 0, 'and it has gone round again');
});

test('with the sorter stopped nothing reaches the loop and the robot waits for space', { skip }, async () => {
  const r = await runScenario('stopped');
  assert.equal(r.parcels.filter(p => p.state === 'carrier' || p.state === 'inducting').length, 0);
  assert.equal(r.stats.A + r.stats.B, 0);
  assert.equal(r.robot, 'Waiting for space');
});
