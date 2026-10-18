// End-to-end simulation tests: serves the project, runs each scenario in tests/sim.html with
// headless Chrome and checks the outcome. Needs Chrome (or set CHROME_PATH) and an internet
// connection, because Three.js loads from a CDN.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(p => p && existsSync(p));
const skip = CHROME ? false : 'Chrome not found; set CHROME_PATH to run the simulation tests';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let server, base, profile;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(join(tmpdir(), 'mini-sorter-chrome-'));
});

after(async () => {
  server?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

function runScenario(name) {
  const args = [
    '--headless=new', `--user-data-dir=${profile}-${name}`, '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-logging=stderr',
    '--virtual-time-budget=20000', '--dump-dom', `${base}/tests/sim.html?scenario=${name}`,
  ];
  return new Promise((resolve, reject) => {
    execFile(CHROME, args, { timeout: 90_000, maxBuffer: 16 * 1024 * 1024 }, async (err, stdout, stderr) => {
      await rm(`${profile}-${name}`, { recursive: true, force: true });
      const m = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
      const text = m && m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (!text) {
        const console = stderr.split('\n').filter(l => l.includes('CONSOLE')).join('\n');
        return reject(new Error(`No result from scenario "${name}"${err ? ': ' + err.message : ''}\n${console}`));
      }
      const data = JSON.parse(text);
      if (!data.ok) return reject(new Error(`Scenario "${name}" threw:\n${data.error}`));
      resolve(data.result);
    });
  });
}

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
