// Runs the real app (index.html's markup and js/main.js), uses the controls the way a person
// would and records what the panels show. The simulation is stepped directly, as in
// sim-harness.js, because headless Chrome barely runs the animation loop.

// What the page reports; ui.test.js reads it with these types
/**
 * @typedef {{ mode: string, id: string, status: string, kg: string, length: string, followHidden: boolean }} InfoPanel
 * @typedef {object} Panel what the panels show
 * @property {string} belt
 * @property {string} loop
 * @property {string} sorted
 * @property {string} recirc
 * @property {string} robot
 * @property {{ pill: string, count: string, toggle: string }} A
 * @property {{ pill: string, count: string }} B
 * @property {InfoPanel} info
 * @property {number} history rows in Recent scans
 * @typedef {{ toastHidden: boolean, toast: string }} Toast
 * @typedef {object} UiResult
 * @property {Panel} start
 * @property {{ out: string, cap: string }} speed
 * @property {string} beltClick
 * @property {{ robot: string } & Toast} queueFull
 * @property {InfoPanel & { expect: string }} selected
 * @property {InfoPanel} followed
 * @property {Panel} closedA
 * @property {Panel} minute
 * @property {Panel} emptiedB
 * @property {Toast} emptyAgain
 * @property {Panel} end
 * @property {string[]} errors
 */

const out = /** @type {HTMLElement} */ (document.getElementById('result'));
/** @param {{ ok: true, result: UiResult } | { ok: false, error: string }} obj */
const report = obj => { out.textContent = JSON.stringify(obj); };

try {
  const html = await (await fetch('../index.html')).text();
  const page = new DOMParser().parseFromString(html, 'text/html');
  page.querySelectorAll('script').forEach(s => s.remove());
  document.body.insertAdjacentHTML('afterbegin', page.body.innerHTML);

  /** @type {string[]} */
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message)));
  await import('../js/main.js');
  const { scene, camera, canvas } = await import('../js/scene.js');
  const { step } = await import('../js/simulation.js');
  const { refreshUI } = await import('../js/ui.js');
  const { allParcels } = await import('../js/parcels.js');
  const { beltPoint } = await import('../js/infeed.js');
  const { BY } = await import('../js/layout.js');

  /** @param {string} id */
  const $ = id => {
    const el = document.getElementById(id);
    if (!el) throw new Error('No #' + id);
    return el;
  };
  /** @param {string} id */
  const input = id => {
    const el = $(id);
    if (!(el instanceof HTMLInputElement)) throw new Error('#' + id + ' is not an input');
    return el;
  };
  /** @param {number} secs */
  const run = secs => { for (let i = 0; i < secs * 60; i++) step(1 / 60); };
  /** @param {'A' | 'B'} key @param {string} role */
  const chute = (key, role) => {
    const el = $('chute' + key).querySelector(`[data-role="${role}"]`);
    if (!(el instanceof HTMLElement)) throw new Error(`No ${role} in chute ${key}`);
    return el;
  };
  /** @param {string} id */
  const text = id => $(id).textContent ?? '';
  const hist = $('lgHist');
  if (!(hist instanceof HTMLTableSectionElement || hist instanceof HTMLTableElement)) throw new Error('#lgHist is not a table');
  // The app refreshes the panel every 0.15 s; here it is refreshed before each reading
  /** @returns {Panel} */
  const panel = () => (refreshUI(), {
    belt: text('stBelt'), loop: text('stLoop'), sorted: text('stSorted'), recirc: text('stRecirc'), robot: text('robotOut'),
    A: { pill: chute('A', 'pill').textContent ?? '', count: chute('A', 'count').textContent ?? '', toggle: chute('A', 'toggle').textContent ?? '' },
    B: { pill: chute('B', 'pill').textContent ?? '', count: chute('B', 'count').textContent ?? '' },
    info: { mode: text('infoMode'), id: text('lgId'), status: text('kStatus'), kg: text('wKg'), length: text('lgL'), followHidden: $('follow').hidden === true },
    history: hist.rows.length,
  });
  // A left click (press and release without moving) at a 3D point. Rendering normally updates
  // the meshes' world positions that clicks are tested against, so do that first.
  /** @param {ReturnType<typeof beltPoint>} point a THREE.Vector3 */
  const clickAt = point => {
    scene.updateMatrixWorld();
    const v = point.clone().project(camera), r = canvas.getBoundingClientRect();
    const opts = { bubbles: true, button: 0, clientX: r.left + (v.x + 1) / 2 * r.width, clientY: r.top + (1 - v.y) / 2 * r.height };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
  };
  /** @param {import('../js/parcels.js').Parcel} p */
  const pid = p => 'P-' + String(p.id).padStart(5, '0');
  /** @type {Partial<UiResult>} */
  const r = {};

  r.start = panel();

  input('speed').value = '2';
  input('speed').dispatchEvent(new Event('input'));
  r.speed = { out: text('speedOut'), cap: text('capOut') };
  input('speed').value = '1.2';
  input('speed').dispatchEvent(new Event('input'));

  // Clicking an empty spot on the belt queues a robot pick
  clickAt(beltPoint(5).setY(BY));
  r.beltClick = panel().robot;

  // The robot takes at most 5 picks; the sixth shows a message
  for (let i = 0; i < 5; i++) $('place').click();
  r.queueFull = { robot: panel().robot, toastHidden: $('toast').hidden === true, toast: text('toast') };
  run(30);

  // Clicking a parcel selects it; the follow button returns to the last scanned one
  const target = allParcels().find(p => p.state === 'belt' && p.scanned) || allParcels()[0];
  clickAt(target.mesh.position);
  r.selected = { expect: pid(target), ...panel().info };
  $('follow').click();
  r.followed = panel().info;

  // Auto-feed A parcels with chute A closed: they go round; the opening B parcel is sorted
  $('destA').click();
  $('auto').click();
  chute('A', 'toggle').click();
  r.closedA = panel();
  run(60);
  r.minute = panel();

  chute('B', 'empty').click();
  run(1);
  r.emptiedB = panel();
  chute('B', 'empty').click();
  r.emptyAgain = { toastHidden: $('toast').hidden === true, toast: text('toast') };

  // Reopening A lets its parcels out; with auto-feed off everything drains
  chute('A', 'toggle').click();
  $('auto').click();
  run(60);
  r.end = panel();

  r.errors = errors;
  report({ ok: true, result: /** @type {UiResult} every field is set above */ (r) });
} catch (e) {
  report({ ok: false, error: String(e instanceof Error && e.stack || e) });
}
