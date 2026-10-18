// Control panel, parcel information panel and clicking in the 3D view.
import * as THREE from 'three';
import { N, PITCH, CAP } from './layout.js';
import { canvas, camera } from './scene.js';
import { settings, stats } from './state.js';
import { parcels, ROUTES } from './parcels.js';
import { chutes, chuteStatus, emptyChute } from './sorter.js';
import { beltTop, beltQ, isAtBeltEnd, infeedEvents } from './infeed.js';
import { rob, requestPick } from './robot.js';

const $ = id => document.getElementById(id);
const pid = p => 'P-' + String(p.id).padStart(5, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const toastEl = $('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// ---------- Control panel ----------
function setSpeed(v) {
  settings.speed = v;
  $('speedOut').textContent = v.toFixed(1) + ' m/s';
  const perH = Math.round(v / PITCH * 3600);
  $('capOut').textContent = v === 0
    ? 'Stopped · ' + N + ' trays · ' + PITCH.toFixed(2) + ' m pitch'
    : perH.toLocaleString('en-US') + ' trays/h · ' + N + ' trays · ' + PITCH.toFixed(2) + ' m pitch';
}

function placeParcel() {
  if (!requestPick(settings.dest)) toast('The robot already has 5 parcels queued. Wait for it to catch up.');
}

function bindControls() {
  $('speed').addEventListener('input', e => setSpeed(parseFloat(e.target.value)));
  setSpeed(settings.speed);
  document.querySelectorAll('input[name="dest"]').forEach(r => r.addEventListener('change', e => { settings.dest = e.target.value; }));
  $('place').addEventListener('click', placeParcel);
  $('auto').addEventListener('change', e => { settings.auto = e.target.checked; settings.autoTimer = 60 / settings.rate; });
  $('rate').addEventListener('input', e => { settings.rate = parseInt(e.target.value, 10); $('rateOut').textContent = settings.rate + ' / min'; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      placeParcel();
    }
  });

  for (const key of ['A', 'B']) {
    const el = $('chute' + key), ch = chutes[key];
    ch.el = {
      pill: el.querySelector('[data-role="pill"]'),
      toggle: el.querySelector('[data-role="toggle"]'),
      bar: el.querySelector('[data-role="bar"]'),
      count: el.querySelector('[data-role="count"]'),
    };
    ch.el.toggle.addEventListener('click', () => { ch.open = !ch.open; });
    el.querySelector('[data-role="empty"]').addEventListener('click', () => {
      if (!emptyChute(ch)) toast('Chute ' + key + ' bin is already empty.');
    });
  }
}

// ---------- Parcel information panel ----------
const scanHist = [];
let lastScanned = null, selected = null;
const shown = () => selected || lastScanned;

function statusOf(p) {
  const ch = chutes[p.dest];
  switch (p.state) {
    case 'belt': return beltQ[0] === p && isAtBeltEnd(p) ? 'At the end of the infeed, waiting for a free tray' : 'On the infeed belt';
    case 'inducting': return 'Merging onto tray ' + (p.carrier.i + 1);
    case 'carrier': {
      const lap = p.recirc ? ' · lap ' + (p.recirc + 1) : '';
      const blocked = !ch.open ? ' (chute closed, will go round again)' : ch.count >= CAP ? ' (chute full, will go round again)' : '';
      return 'On tray ' + (p.carrier.i + 1) + ', heading to chute ' + p.dest + blocked + lap;
    }
    case 'chute': return 'Sliding down chute ' + p.dest;
    case 'bin': return 'Sorted into the chute ' + p.dest + ' bin';
    default: return 'Collected from chute ' + p.dest;
  }
}

function renderInfo(flash) {
  const p = shown();
  $('infoMode').textContent = selected ? 'Selected parcel' : 'Last scanned';
  $('follow').hidden = !selected;
  if (!p) return;
  $('lgId').textContent = pid(p);
  const wt = p.weighed, dm = p.measured;
  const volKg = dm ? dm.L * dm.W * dm.H / 1000 / 5000 : null;
  $('wKg').textContent = wt ? wt.kg.toFixed(2) : '—';
  $('wVol').textContent = volKg != null ? volKg.toFixed(2) : '—';
  $('wChg').textContent = wt && volKg != null ? Math.max(wt.kg, volKg).toFixed(2) : '—';
  $('wDen').textContent = wt && dm ? Math.round(wt.kg / (dm.L * dm.W * dm.H / 1e9)) : '—';
  $('wNote').textContent = !wt
    ? 'Placed after the scale, so it was not weighed.'
    : volKg == null ? 'Volumetric weight follows once the light grid has measured it.'
    : volKg > wt.kg ? 'Light for its size: charged on volumetric weight (L × W × H in cm ÷ 5000).'
    : 'Charged on actual weight; it is heavier than its volumetric weight.';
  const pill = $('lgDest');
  const s = p.scanned, lb = p.label, r = ROUTES[p.dest];
  if (s) {
    pill.textContent = 'Chute ' + p.dest;
    pill.className = 'pill ' + p.dest.toLowerCase();
    $('kBarcode').textContent = lb.sscc;
    $('kDest').textContent = lb.postcode + ' ' + lb.city;
    $('kRoute').textContent = r.code + ' · ' + r.hub + ' → chute ' + p.dest;
    $('kService').innerHTML = esc(lb.service) + (lb.fragile ? '<span class="tag" style="color: var(--stop)">Fragile</span>' : '');
    $('kRead').textContent = 'Good read · Code 128 · ' + s.ms + ' ms · ' + s.at;
  } else {
    pill.textContent = 'Not scanned';
    pill.className = 'pill none';
    for (const k of ['kBarcode', 'kDest', 'kRoute', 'kService']) $(k).textContent = '—';
    $('kRead').textContent = 'Placed after the scanner, so the label was never read.';
  }
  $('lgL').textContent = dm ? dm.L : '—';
  $('lgW').textContent = dm ? dm.W : '—';
  $('lgH').textContent = dm ? dm.H : '—';
  $('lgV').textContent = dm ? dm.vol : '—';
  $('kStatus').textContent = statusOf(p);
  if (flash) {
    const card = $('lgCard');
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  }
}

function onScanned(p) {
  lastScanned = p;
  scanHist.unshift(p);
  scanHist.length = Math.min(scanHist.length, 6);
  $('lgHist').innerHTML = scanHist.map(h =>
    '<tr><td>' + pid(h) + '</td><td>' + esc(h.label.city) + '</td><td>' + (h.weighed ? h.weighed.kg.toFixed(2) : '—') + '</td><td><i class="dot ' + h.dest.toLowerCase() + '"></i> ' + h.dest + '</td></tr>'
  ).join('');
  if (!selected) renderInfo(true);
}

// Selecting a parcel outlines it and pins it in the info panel
const outlineMat = new THREE.LineBasicMaterial({ color: 0xffd166 });
function select(p) {
  if (selected && selected.outline) { selected.mesh.remove(selected.outline); selected.outline.geometry.dispose(); selected.outline = null; }
  selected = p;
  if (p) {
    p.outline = new THREE.LineSegments(new THREE.EdgesGeometry(p.mesh.geometry), outlineMat);
    p.outline.scale.setScalar(1.06);
    p.mesh.add(p.outline);
  }
  renderInfo(true);
}

function bindInfoPanel() {
  infeedEvents.addEventListener('scanned', e => onScanned(e.detail));
  for (const type of ['weighed', 'measured']) {
    infeedEvents.addEventListener(type, e => { if (shown() === e.detail) renderInfo(true); });
  }
  $('follow').addEventListener('click', () => select(null));
}

// ---------- Clicking in the 3D view ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitBelt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(beltTop)[0];
}
function hitParcel() { // call after hitBelt has aimed the ray
  const hit = ray.intersectObjects(parcels.map(p => p.mesh), false)[0];
  return hit ? hit.object.userData.parcel : null;
}
function bindPointer() {
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || e.button !== 0) return;
    downAt = null;
    const hit = hitBelt(e);
    const hp = hitParcel();
    if (hp) { select(hp); return; }
    if (!hit) { if (selected) select(null); return; }
    placeParcel();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const onBelt = hitBelt(e);
    canvas.style.cursor = hitParcel() ? 'pointer' : onBelt ? 'copy' : 'grab';
  });
}

// ---------- Public ----------
export function initUI() {
  bindControls();
  bindInfoPanel();
  bindPointer();
  refreshUI();
}

export function refreshUI() {
  for (const ch of Object.values(chutes)) {
    const inBin = ch.slots.filter(s => s.p).length;
    const status = chuteStatus(ch);
    ch.el.pill.textContent = status === 'open' ? 'Open' : status === 'full' ? 'Full' : 'Closed';
    ch.el.pill.className = 'pill' + (status === 'open' ? '' : ' ' + status);
    ch.el.toggle.textContent = ch.open ? 'Close' : 'Open';
    ch.el.bar.style.width = (inBin / CAP * 100) + '%';
    ch.el.count.textContent = inBin + ' / ' + CAP + ' in bin' + (status !== 'open' ? ' · parcels recirculate' : '');
    ch.lampMat.color.setHex(status === 'open' ? 0x2e8b57 : status === 'full' ? 0xf2b705 : 0xc0392b);
  }
  $('stBelt').textContent = beltQ.length;
  $('stLoop').textContent = parcels.filter(p => p.state === 'carrier' || p.state === 'inducting').length;
  $('stSorted').textContent = stats.A + ' / ' + stats.B;
  $('stRecirc').textContent = stats.recirc;
  const pending = rob.queue.length;
  $('robotOut').textContent = rob.status + (pending ? ' · ' + pending + ' queued' : '');
  if (shown()) $('kStatus').textContent = statusOf(shown());
}
