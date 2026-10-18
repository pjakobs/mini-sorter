// Startup and the animation loop.
import { renderer, scene, camera, controls, resize } from './scene.js';
import { step } from './simulation.js';
import { placeOnBelt } from './infeed.js';
import { initUI, refreshUI } from './ui.js';

window.addEventListener('resize', resize);
resize();

// Opening state: a few parcels already waiting on the infeed
[0.3, 1.2].forEach((t, i) => placeOnBelt(t, i % 2 ? 'B' : 'A'));
initUI();

let last = performance.now(), uiTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  uiTimer += dt;
  if (uiTimer > 0.15) { uiTimer = 0; refreshUI(); }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.sorterStarted = true;
