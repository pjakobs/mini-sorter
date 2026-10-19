// Control panel, parcel information panel and clicking in the 3D view.
import * as THREE from 'three';
import { N, PITCH, CAP } from './layout.js';
import { canvas, camera } from './scene.js';
import { settings } from './state.js';
import { allParcels, ROUTES } from './parcels.js';
import { chuteInfo, setChuteOpen, emptyChute, sortStats } from './sorter.js';
import { beltHit, beltCount, isWaitingToMerge, onInfeed } from './infeed.js';
import { robotStatus, requestPick } from './robot.js';

/** @typedef {import('./parcels.js').Parcel} Parcel */
/** @typedef {import('./parcels.js').Dest} Dest */
/** @type {Dest[]} */
const DESTS = ['A', 'B'];

/**
 * The element with this id; throws if index.html has none, so a renamed id fails at start-up
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @param {new () => T} [type] checked with instanceof, e.g. HTMLInputElement
 * @returns {T}
 */
function $(id, type) {
  const el = document.getElementById(id);
  if (!el || (type && !(el instanceof type))) throw new Error('index.html has no suitable #' + id);
  return /** @type {T} */ (el);
}
/** Same as $ but for an element inside root, found by its data-role @param {HTMLElement} root @param {string} role */
function role(root, role) {
  const el = root.querySelector(`[data-role="${role}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`#${root.id} has no [data-role="${role}"]`);
  return el;
}
/** @param {Parcel} p */
const pid = p => 'P-' + String(p.id).padStart(5, '0');
/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** @param {unknown} s */
const esc = s => String(s).replace(/[&<>"]/g, c => ENTITIES[c]);
/** @param {Parcel} p */
const trayNo = p => p.carrier ? p.carrier.i + 1 : '?';

const toastEl = $('toast');
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} msg */
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// ---------- Control panel ----------
/** @param {number} v m/s */
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

/** @type {Partial<Record<Dest, { pill: HTMLElement, toggle: HTMLElement, bar: HTMLElement, count: HTMLElement }>>} */
const chuteEls = {};
function bindControls() {
  const speed = $('speed', HTMLInputElement), auto = $('auto', HTMLInputElement), rate = $('rate', HTMLInputElement);
  speed.addEventListener('input', () => setSpeed(parseFloat(speed.value)));
  setSpeed(settings.speed);
  for (const r of document.querySelectorAll('input[name="dest"]')) {
    if (!(r instanceof HTMLInputElement)) continue;
    r.addEventListener('change', () => {
      const v = r.value;
      if (v === 'A' || v === 'B' || v === 'R') settings.dest = v;
    });
  }
  $('place').addEventListener('click', placeParcel);
  auto.addEventListener('change', () => { settings.auto = auto.checked; });
  rate.addEventListener('input', () => { settings.rate = parseInt(rate.value, 10); $('rateOut').textContent = settings.rate + ' / min'; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      placeParcel();
    }
  });

  for (const key of DESTS) {
    const el = $('chute' + key);
    const els = { pill: role(el, 'pill'), toggle: role(el, 'toggle'), bar: role(el, 'bar'), count: role(el, 'count') };
    chuteEls[key] = els;
    els.toggle.addEventListener('click', () => { setChuteOpen(key, !chuteInfo(key).open); refreshUI(); });
    role(el, 'empty').addEventListener('click', () => {
      if (!emptyChute(key)) toast('Chute ' + key + ' bin is already empty.');
    });
  }
}

// ---------- Parcel information panel ----------
/** @type {Parcel[]} */
const scanHist = [];
/** @type {Parcel | null} */
let lastScanned = null;
/** @type {Parcel | null} */
let selected = null;
const shown = () => selected || lastScanned;

/** @param {Parcel} p @returns {string} */
function statusOf(p) {
  const chute = chuteInfo(p.dest).status;
  switch (p.state) {
    case 'belt': return isWaitingToMerge(p) ? 'At the end of the infeed, waiting for a free tray' : 'On the infeed belt';
    case 'robot': return 'Held by the robot';
    case 'inducting': return 'Merging onto tray ' + trayNo(p);
    case 'carrier': {
      const lap = p.recirc ? ' · lap ' + (p.recirc + 1) : '';
      const blocked = chute === 'closed' ? ' (chute closed, will go round again)' : chute === 'full' ? ' (chute full, will go round again)' : '';
      return 'On tray ' + trayNo(p) + ', heading to chute ' + p.dest + blocked + lap;
    }
    case 'chute': return 'Sliding down chute ' + p.dest;
    case 'bin': return 'Sorted into the chute ' + p.dest + ' bin';
    case 'removing': case 'collected': return 'Collected from chute ' + p.dest;
    default: return unreachable(p.state);
  }
}

/** @param {never} x a value the type checker has shown cannot occur @returns {never} */
function unreachable(x) {
  throw new Error('Unexpected value: ' + x);
}

/** @param {boolean} [flash] */
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
  $('wDen').textContent = wt && dm ? String(Math.round(wt.kg / (dm.L * dm.W * dm.H / 1e9))) : '—';
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
  $('lgL').textContent = dm ? String(dm.L) : '—';
  $('lgW').textContent = dm ? String(dm.W) : '—';
  $('lgH').textContent = dm ? String(dm.H) : '—';
  $('lgV').textContent = dm ? dm.vol : '—';
  $('kStatus').textContent = statusOf(p);
  if (flash) {
    const card = $('lgCard');
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  }
}

/** @param {Parcel} p */
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
/** @type {THREE.LineSegments | null} */
let outline = null;
/** @param {Parcel | null} p */
function select(p) {
  if (outline && selected) { selected.mesh.remove(outline); outline.geometry.dispose(); outline = null; }
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
  for (const type of /** @type {const} */ (['weighed', 'measured'])) {
    onInfeed(type, p => { if (shown() === p) renderInfo(true); });
  }
  $('follow').addEventListener('click', () => select(null));
}

// ---------- Clicking in the 3D view ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
/** @param {PointerEvent} e */
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
  /** @type {{ x: number, y: number } | null} */
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
  for (const key of DESTS) {
    const el = chuteEls[key];
    if (!el) continue;
    const { status, open, bin } = chuteInfo(key);
    el.pill.textContent = status === 'open' ? 'Open' : status === 'full' ? 'Full' : 'Closed';
    el.pill.className = 'pill' + (status === 'open' ? '' : ' ' + status);
    el.toggle.textContent = open ? 'Close' : 'Open';
    el.bar.style.width = (bin.length / CAP * 100) + '%';
    el.count.textContent = bin.length + ' / ' + CAP + ' in bin' + (status !== 'open' ? ' · parcels recirculate' : '');
  }
  const stats = sortStats();
  $('stBelt').textContent = String(beltCount());
  $('stLoop').textContent = String(allParcels().filter(p => p.state === 'carrier' || p.state === 'inducting').length);
  $('stSorted').textContent = stats.A + ' / ' + stats.B;
  $('stRecirc').textContent = String(stats.recirc);
  const robot = robotStatus();
  $('robotOut').textContent = robot.status + (robot.queued ? ' · ' + robot.queued + ' queued' : '');
  const p = shown();
  if (p) $('kStatus').textContent = statusOf(p);
}
