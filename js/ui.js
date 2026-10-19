// Control panel, parcel information panel and clicking in the 3D view.
import * as THREE from 'three';
import { N, PITCH, CAP } from './layout.js';
import { canvas, camera } from './scene.js';
import { settings } from './state.js';
import { allParcels, ROUTES } from './parcels.js';
import { chuteInfo, setChuteOpen, emptyChute, sortStats } from './sorter.js';
import { beltHit, beltCount, isWaitingToMerge, onInfeed } from './infeed.js';
import { robotStatus, requestPick } from './robot.js';

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

const chuteEls = {};
function bindControls() {
  $('speed').addEventListener('input', e => setSpeed(parseFloat(e.target.value)));
  setSpeed(settings.speed);
  document.querySelectorAll('input[name="dest"]').forEach(r => r.addEventListener('change', e => { settings.dest = e.target.value; }));
  $('place').addEventListener('click', placeParcel);
  $('auto').addEventListener('change', e => { settings.auto = e.target.checked; });
  $('rate').addEventListener('input', e => { settings.rate = parseInt(e.target.value, 10); $('rateOut').textContent = settings.rate + ' / min'; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      placeParcel();
    }
  });

  for (const key of ['A', 'B']) {
    const el = $('chute' + key);
    chuteEls[key] = {
      pill: el.querySelector('[data-role="pill"]'),
      toggle: el.querySelector('[data-role="toggle"]'),
      bar: el.querySelector('[data-role="bar"]'),
      count: el.querySelector('[data-role="count"]'),
    };
    chuteEls[key].toggle.addEventListener('click', () => { setChuteOpen(key, !chuteInfo(key).open); refreshUI(); });
    el.querySelector('[data-role="empty"]').addEventListener('click', () => {
      if (!emptyChute(key)) toast('Chute ' + key + ' bin is already empty.');
    });
  }
}

// ---------- Parcel information panel ----------
const scanHist = [];
let lastScanned = null, selected = null;
const shown = () => selected || lastScanned;

function statusOf(p) {
  const chute = chuteInfo(p.dest).status;
  switch (p.state) {
    case 'belt': return isWaitingToMerge(p) ? 'At the end of the infeed, waiting for a free tray' : 'On the infeed belt';
    case 'inducting': return 'Merging onto tray ' + (p.carrier.i + 1);
    case 'carrier': {
      const lap = p.recirc ? ' · lap ' + (p.recirc + 1) : '';
      const blocked = chute === 'closed' ? ' (chute closed, will go round again)' : chute === 'full' ? ' (chute full, will go round again)' : '';
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
let outline = null;
function select(p) {
  if (outline) { selected.mesh.remove(outline); outline.geometry.dispose(); outline = null; }
  selected = p;
  if (p) {
    outline = new THREE.LineSegments(new THREE.EdgesGeometry(p.mesh.geometry), outlineMat);
    outline.scale.setScalar(1.06);
    p.mesh.add(outline);
  }
  renderInfo(true);
}

function bindInfoPanel() {
  onInfeed('scanned', onScanned);
  for (const type of ['weighed', 'measured']) {
    onInfeed(type, p => { if (shown() === p) renderInfo(true); });
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
  return beltHit(ray);
}
function hitParcel() { // call after hitBelt has aimed the ray
  const hit = ray.intersectObjects(allParcels().map(p => p.mesh), false)[0];
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
  for (const [key, el] of Object.entries(chuteEls)) {
    const { status, open, bin } = chuteInfo(key);
    el.pill.textContent = status === 'open' ? 'Open' : status === 'full' ? 'Full' : 'Closed';
    el.pill.className = 'pill' + (status === 'open' ? '' : ' ' + status);
    el.toggle.textContent = open ? 'Close' : 'Open';
    el.bar.style.width = (bin.length / CAP * 100) + '%';
    el.count.textContent = bin.length + ' / ' + CAP + ' in bin' + (status !== 'open' ? ' · parcels recirculate' : '');
  }
  const stats = sortStats();
  $('stBelt').textContent = beltCount();
  $('stLoop').textContent = allParcels().filter(p => p.state === 'carrier' || p.state === 'inducting').length;
  $('stSorted').textContent = stats.A + ' / ' + stats.B;
  $('stRecirc').textContent = stats.recirc;
  const robot = robotStatus();
  $('robotOut').textContent = robot.status + (robot.queued ? ' · ' + robot.queued + ' queued' : '');
  if (shown()) $('kStatus').textContent = statusOf(shown());
}
