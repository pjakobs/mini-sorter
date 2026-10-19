// Uses the real page's controls in headless Chrome (tests/ui.html, see browser.js) and checks
// what the panels showed at each point.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startServer, stopServer, runPage } from './browser.js';

before(startServer);
after(stopServer);

/** @param {{ count: string }} chute */
const inBin = chute => parseInt(chute.count, 10);
/** @type {import('./ui-harness.js').UiResult} filled by the first test, read by the rest */
let r;

test('the page starts with two parcels on the infeed and empty, open chutes', { skip }, async () => {
  r = await runPage('tests/ui.html');
  assert.deepEqual(r.errors, []);
  const s = r.start;
  assert.equal(s.belt, '2');
  assert.equal(s.loop, '0');
  assert.equal(s.sorted, '0 / 0');
  assert.equal(s.robot, 'Idle');
  assert.equal(s.A.pill, 'Open');
  assert.equal(s.B.pill, 'Open');
  assert.equal(s.info.mode, 'Last scanned');
  assert.ok(s.info.followHidden);
});

test('the speed slider updates the speed and tray rate', { skip }, () => {
  assert.equal(r.speed.out, '2.0 m/s');
  assert.match(r.speed.cap, /^[\d,]+ trays\/h · 44 trays/);
});

test('clicking the belt queues a pick, and a sixth pick is refused with a message', { skip }, () => {
  assert.equal(r.beltClick, 'Idle · 1 queued');
  assert.equal(r.queueFull.robot, 'Idle · 5 queued');
  assert.equal(r.queueFull.toastHidden, false);
  assert.match(r.queueFull.toast, /already has 5 parcels queued/);
});

test('clicking a parcel selects it, and the follow button goes back to the last scanned one', { skip }, () => {
  assert.equal(r.selected.mode, 'Selected parcel');
  assert.equal(r.selected.id, r.selected.expect);
  assert.equal(r.selected.followHidden, false);
  assert.equal(r.followed.mode, 'Last scanned');
  assert.ok(r.followed.followHidden);
});

test('closing a chute shows at once, and its parcels go round instead of in', { skip }, () => {
  assert.equal(r.closedA.A.pill, 'Closed');
  assert.equal(r.closedA.A.toggle, 'Open');
  assert.match(r.closedA.A.count, /parcels recirculate/);
  assert.equal(inBin(r.minute.A), inBin(r.closedA.A), 'nothing entered chute A while closed');
  assert.ok(+r.minute.recirc > 0, 'parcels went round again');
  assert.ok(+r.minute.loop > 0, 'and are still on the loop');
  assert.ok(r.minute.history > 0, 'scans are listed');
});

test('emptying a bin clears it, and emptying it again shows a message', { skip }, () => {
  assert.ok(inBin(r.minute.B) > 0, 'chute B had parcels');
  assert.equal(r.emptiedB.B.count, '0 / 9 in bin');
  assert.equal(r.emptyAgain.toastHidden, false);
  assert.equal(r.emptyAgain.toast, 'Chute B bin is already empty.');
});

test('reopening a chute lets the waiting parcels in', { skip }, () => {
  assert.notEqual(r.end.A.pill, 'Closed');
  assert.equal(r.end.A.toggle, 'Close');
  assert.ok(inBin(r.end.A) > inBin(r.minute.A));
  assert.deepEqual(r.errors, []);
});
