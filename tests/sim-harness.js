// Runs one scenario in the browser and reports what happened. The simulation is stepped
// directly at 60 steps per simulated second, so a minute of sorting takes well under a second.

// What the page reports; sim.test.js reads it with these types
/**
 * @typedef {import('../js/parcels.js').Dest} Dest
 * @typedef {object} Summary
 * @property {{ A: number, B: number, recirc: number }} stats
 * @property {number} belt parcels on the infeed
 * @property {import('../js/robot.js').RobotState} robot
 * @property {number} queue robot picks waiting
 * @property {Record<Dest, number>} count parcels assigned to each chute
 * @property {Record<Dest, Dest[]>} bins destinations of the parcels in each bin
 * @property {{ dest: Dest, state: import('../js/parcels.js').ParcelState, recirc: number,
 *   weighed: boolean, scanned: boolean, measured: boolean }[]} parcels
 * @typedef {{ flow: Summary, closed: { whileClosed: Summary, reopened: Summary }, full: Summary, stopped: Summary }} SimResults
 */

const out = /** @type {HTMLElement} */ (document.getElementById('result'));
/** @param {{ ok: true, result: SimResults[keyof SimResults] } | { ok: false, error: string }} obj */
const report = obj => { out.textContent = JSON.stringify(obj); };

try {
  // Only the modules' public functions; the scenarios drive the sorter the way the UI does
  const { settings } = await import('../js/state.js');
  const { step } = await import('../js/simulation.js');
  const { chuteInfo, setChuteOpen, sortStats } = await import('../js/sorter.js');
  const { placeOnBelt, beltCount } = await import('../js/infeed.js');
  const { robotStatus, requestPick } = await import('../js/robot.js');
  const { allParcels } = await import('../js/parcels.js');

  /** @param {number} secs */
  const run = secs => { for (let i = 0; i < secs * 60; i++) step(1 / 60); };
  // Keeps asking the robot for picks until n have been accepted, simulating as it goes
  /** @param {number} n @param {import('../js/parcels.js').DestChoice} dest */
  const feed = (n, dest) => {
    let asked = 0;
    while (asked < n) { if (requestPick(dest)) asked++; else run(1); }
  };
  /** @returns {Summary} */
  const summary = () => ({
    stats: sortStats(),
    belt: beltCount(),
    robot: robotStatus().status,
    queue: robotStatus().queued,
    count: { A: chuteInfo('A').count, B: chuteInfo('B').count },
    bins: { A: chuteInfo('A').bin, B: chuteInfo('B').bin },
    parcels: allParcels().map(p => ({ dest: p.dest, state: p.state, recirc: p.recirc, weighed: !!p.weighed, scanned: !!p.scanned, measured: !!p.measured })),
  });

  /** @type {{ [K in keyof SimResults]: () => SimResults[K] }} */
  const scenarios = {
    // Two starting parcels plus four from the robot all get measured and sorted
    flow() {
      placeOnBelt(0.3, 'A');
      placeOnBelt(1.2, 'B');
      feed(4, 'R');
      run(60);
      return summary();
    },
    // A closed chute sends its parcels round again; reopening it lets them out
    closed() {
      setChuteOpen('A', false);
      feed(3, 'A');
      run(60);
      const whileClosed = summary();
      setChuteOpen('A', true);
      run(30);
      return { whileClosed, reopened: summary() };
    },
    // A full bin stops taking parcels; the extra one keeps circulating
    full() {
      feed(10, 'B');
      run(90);
      return summary();
    },
    // With the sorter stopped nothing reaches the loop and the robot waits for space
    stopped() {
      settings.speed = 0;
      placeOnBelt(0.3, 'A');
      feed(1, 'A');
      run(30);
      return summary();
    },
  };

  const name = new URLSearchParams(location.search).get('scenario');
  /** @param {string | null} n @returns {n is keyof SimResults} */
  function known(n) { return n !== null && n in scenarios; }
  if (!known(name)) throw new Error('Unknown scenario: ' + name);
  report({ ok: true, result: scenarios[name]() });
} catch (e) {
  report({ ok: false, error: String(e instanceof Error && e.stack || e) });
}
