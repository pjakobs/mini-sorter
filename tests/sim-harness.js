// Runs one scenario in the browser and reports what happened. The simulation is stepped
// directly at 60 steps per simulated second, so a minute of sorting takes well under a second.
const out = document.getElementById('result');
const report = obj => { out.textContent = JSON.stringify(obj); };

try {
  const { settings, stats } = await import('../js/state.js');
  const { step } = await import('../js/simulation.js');
  const { chutes } = await import('../js/sorter.js');
  const { placeOnBelt, beltQ } = await import('../js/infeed.js');
  const { rob, requestPick } = await import('../js/robot.js');
  const { parcels } = await import('../js/parcels.js');

  const run = secs => { for (let i = 0; i < secs * 60; i++) step(1 / 60); };
  // Keeps asking the robot for picks until n have been accepted, simulating as it goes
  const feed = (n, dest) => {
    let asked = 0;
    while (asked < n) { if (requestPick(dest)) asked++; else run(1); }
  };
  const summary = () => ({
    stats: { ...stats },
    belt: beltQ.length,
    robot: rob.status,
    queue: rob.queue.length,
    count: { A: chutes.A.count, B: chutes.B.count },
    bins: { A: chutes.A.slots.filter(s => s.p).map(s => s.p.dest), B: chutes.B.slots.filter(s => s.p).map(s => s.p.dest) },
    parcels: parcels.map(p => ({ dest: p.dest, state: p.state, recirc: p.recirc, weighed: !!p.weighed, scanned: !!p.scanned, measured: !!p.measured })),
  });

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
      chutes.A.open = false;
      feed(3, 'A');
      run(60);
      const whileClosed = summary();
      chutes.A.open = true;
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
  if (!scenarios[name]) throw new Error('Unknown scenario: ' + name);
  report({ ok: true, result: scenarios[name]() });
} catch (e) {
  report({ ok: false, error: String(e && e.stack || e) });
}
