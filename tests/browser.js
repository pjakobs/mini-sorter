// Shared by the browser tests: serves the project over http and runs a test page in headless
// Chrome. A test page writes {"ok": true, "result": ...} or {"ok": false, "error": ...} as JSON
// into <pre id="result">. Needs Chrome (or set CHROME_PATH) and an internet connection, because
// Three.js loads from a CDN.
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
// Pass as the test's skip option
export const skip = CHROME ? false : 'Chrome not found; set CHROME_PATH to run the browser tests';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let server, base, profile, runs = 0;

export async function startServer() {
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
}

export async function stopServer() {
  server?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}

// Loads path (e.g. 'tests/sim.html?scenario=flow') and resolves with the page's result
export function runPage(path) {
  const dir = `${profile}-${++runs}`;
  const args = [
    '--headless=new', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-logging=stderr', '--window-size=1280,800',
    '--virtual-time-budget=20000', '--dump-dom', `${base}/${path}`,
  ];
  return new Promise((resolve, reject) => {
    execFile(CHROME, args, { timeout: 90_000, maxBuffer: 16 * 1024 * 1024 }, async (err, stdout, stderr) => {
      await rm(dir, { recursive: true, force: true });
      const m = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
      const text = m && m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (!text) {
        const console = stderr.split('\n').filter(l => l.includes('CONSOLE')).join('\n');
        return reject(new Error(`No result from ${path}${err ? ': ' + err.message : ''}\n${console}`));
      }
      const data = JSON.parse(text);
      if (!data.ok) return reject(new Error(`${path} threw:\n${data.error}`));
      resolve(data.result);
    });
  });
}
