// One simulation step: everything that moves, in order. Used by the animation loop and the tests.
import { settings } from './state.js';
import { moveCarriers, updateSorterParcels } from './sorter.js';
import { updateInfeed } from './infeed.js';
import { requestPick, robotStatus, updateRobot } from './robot.js';

let autoTimer = 0, wasAuto = false;

/** @param {number} dt seconds */
export function step(dt) {
  moveCarriers(dt);
  updateInfeed(dt);
  updateSorterParcels(dt);
  // Auto-feed: hands the robot a new pick when it has nothing queued; the first one straight away
  if (settings.auto) {
    if (!wasAuto) autoTimer = 60 / settings.rate;
    autoTimer += dt;
    if (autoTimer >= 60 / settings.rate && robotStatus().queued === 0) { requestPick(settings.dest); autoTimer = 0; }
  }
  wasAuto = settings.auto;
  updateRobot(dt);
}
