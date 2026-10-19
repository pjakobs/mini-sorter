// Runs the real app (index.html's markup and js/main.js), uses the controls the way a person
// would and records what the panels show. The simulation is stepped directly, as in
// sim-harness.js, because headless Chrome barely runs the animation loop.
const out = document.getElementById('result');
const report = obj => { out.textContent = JSON.stringify(obj); };

try {
  const html = await (await fetch('../index.html')).text();
  const page = new DOMParser().parseFromString(html, 'text/html');
  page.querySelectorAll('script').forEach(s => s.remove());
  document.body.insertAdjacentHTML('afterbegin', page.body.innerHTML);

  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message)));
  await import('../js/main.js');
  const THREE = await import('three');
  const { scene, camera, canvas } = await import('../js/scene.js');
  const { step } = await import('../js/simulation.js');
  const { refreshUI } = await import('../js/ui.js');
  const { allParcels } = await import('../js/parcels.js');
  const { beltPoint } = await import('../js/infeed.js');
  const { BY } = await import('../js/layout.js');

  const $ = id => document.getElementById(id);
  const run = secs => { for (let i = 0; i < secs * 60; i++) step(1 / 60); };
  const chute = (key, role) => $('chute' + key).querySelector(`[data-role="${role}"]`);
  const text = id => $(id).textContent;
  // The app refreshes the panel every 0.15 s; here it is refreshed before each reading
  const panel = () => (refreshUI(), {
    belt: text('stBelt'), loop: text('stLoop'), sorted: text('stSorted'), recirc: text('stRecirc'), robot: text('robotOut'),
    A: { pill: chute('A', 'pill').textContent, count: chute('A', 'count').textContent, toggle: chute('A', 'toggle').textContent },
    B: { pill: chute('B', 'pill').textContent, count: chute('B', 'count').textContent },
    info: { mode: text('infoMode'), id: text('lgId'), status: text('kStatus'), kg: text('wKg'), length: text('lgL'), followHidden: $('follow').hidden },
    history: $('lgHist').rows.length,
  });
  // A left click (press and release without moving) at a 3D point. Rendering normally updates
  // the meshes' world positions that clicks are tested against, so do that first.
  const clickAt = point => {
    scene.updateMatrixWorld();
    const v = point.clone().project(camera), r = canvas.getBoundingClientRect();
    const opts = { bubbles: true, button: 0, clientX: r.left + (v.x + 1) / 2 * r.width, clientY: r.top + (1 - v.y) / 2 * r.height };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
  };
  const pid = p => 'P-' + String(p.id).padStart(5, '0');
  const r = {};

  r.start = panel();

  $('speed').value = '2';
  $('speed').dispatchEvent(new Event('input'));
  r.speed = { out: text('speedOut'), cap: text('capOut') };
  $('speed').value = '1.2';
  $('speed').dispatchEvent(new Event('input'));

  // Clicking an empty spot on the belt queues a robot pick
  clickAt(beltPoint(5).setY(BY));
  r.beltClick = panel().robot;

  // The robot takes at most 5 picks; the sixth shows a message
  for (let i = 0; i < 5; i++) $('place').click();
  r.queueFull = { robot: panel().robot, toastHidden: $('toast').hidden, toast: text('toast') };
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
  r.emptyAgain = { toastHidden: $('toast').hidden, toast: text('toast') };

  // Reopening A lets its parcels out; with auto-feed off everything drains
  chute('A', 'toggle').click();
  $('auto').click();
  run(60);
  r.end = panel();

  r.errors = errors;
  report({ ok: true, result: r });
} catch (e) {
  report({ ok: false, error: String(e && e.stack || e) });
}
