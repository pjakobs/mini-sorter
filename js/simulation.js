// One simulation step: everything that moves, in order. Used by the animation loop and the tests.
import { settings } from './state.js';
import { moveCarriers, updateSorterParcels } from './sorter.js';
import { updateInfeed } from './infeed.js';
import { rob, updateRobot } from './robot.js';

export function step(dt) {
  moveCarriers(dt);
  updateInfeed(dt);
  updateSorterParcels(dt);
  // Auto-feed: hands the robot a new pick when it has nothing queued
  if (settings.auto) {
    settings.autoTimer += dt;
    if (settings.autoTimer >= 60 / settings.rate && rob.queue.length === 0) { rob.queue.push(settings.dest); settings.autoTimer = 0; }
  }
  updateRobot(dt);
}
