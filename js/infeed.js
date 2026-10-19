// The infeed: belt, triangular merge belt, scale, label scanner and light grid, and the merge onto a tray.
// The belt geometry and the parcels on it are private; other modules use the functions marked Public.
import * as THREE from 'three';
import { TRAY_Y, TRAY_W, MERGE_DEC, S_INDUCT, BL, BW, BY, IND, BELT_DIR, BELT_YAW, rand } from './layout.js';
import { scene, mat, M, box } from './scene.js';
import { settings } from './state.js';
import { newParcel, addParcel } from './parcels.js';
import { freeTrayAt, reserveTray, loadTray } from './sorter.js';

const events = new EventTarget();
const emit = (type, p) => events.dispatchEvent(new CustomEvent(type, { detail: p }));
// Public: calls fn(parcel) whenever a parcel is 'weighed', 'scanned' or 'measured'
export function onInfeed(type, fn) {
  events.addEventListener(type, e => fn(e.detail));
}

// ---------- Belt ----------
const beltDir = new THREE.Vector3(BELT_DIR.x, 0, BELT_DIR.z);
const beltPerp = new THREE.Vector3(-beltDir.z, 0, beltDir.x);
// The belt centreline meets the loop at the induction point, so parcels run straight on.
const beltEnd = new THREE.Vector3(IND.x + IND.ox * 1.15 - IND.hx * 1.15, BY, IND.z + IND.oz * 1.15 - IND.hz * 1.15);
const beltStart = beltEnd.clone().addScaledVector(beltDir, -BL);
const belt = new THREE.Group();
belt.position.copy(beltStart).addScaledVector(beltDir, BL / 2).setY(0);
belt.rotation.y = BELT_YAW;
scene.add(belt);
box(BL, 0.16, BW + 0.1, M.frame, 0, BY - 0.085, 0, belt);
for (const z of [-1, 1]) {
  box(BL, 0.1, 0.04, M.yellow, 0, BY + 0.03, z * (BW / 2 + 0.07), belt);
  for (const x of [-BL / 2 + 0.4, 0, BL / 2 - 0.4]) box(0.1, BY - 0.17, 0.1, M.steel, x, (BY - 0.17) / 2, z * (BW / 2 - 0.05), belt);
}
const beltTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#2b333b'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#3a444e'; x.fillRect(0, 0, 10, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(BL / 0.35, 1);
  return t;
})();
M.belt.map = beltTex;
const beltTop = new THREE.Mesh(new THREE.PlaneGeometry(BL, BW), M.belt);
beltTop.rotation.x = -Math.PI / 2;
beltTop.position.y = BY + 0.001;
beltTop.receiveShadow = true;
belt.add(beltTop);

// Triangular merge belt: fills the wedge between the square belt end and the loop's edge
{
  const zEdge = IND.z + TRAY_W / 2 + 0.04;
  const c1 = beltEnd.clone().addScaledVector(beltPerp, -BW / 2);
  const c2 = beltEnd.clone().addScaledVector(beltPerp, BW / 2);
  const toEdge = c => c.clone().addScaledVector(beltDir, (c.z - zEdge) / -beltDir.z);
  const a = toEdge(c1), b = toEdge(c2);
  const quad = [c1, a, b, c2];

  // Top surface shares the belt texture; UVs continue the main belt's so the stripes line up
  const pos = [], uv = [];
  for (const q of quad) {
    const rel = q.clone().sub(beltStart);
    pos.push(q.x, BY + 0.001, q.z);
    uv.push(rel.dot(beltDir) / BL, rel.dot(beltPerp) / BW + 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); }
  const top = new THREE.Mesh(g, M.belt);
  top.receiveShadow = true;
  scene.add(top);

  // Frame under the wedge (shape in x/z, extruded downwards)
  const shape = new THREE.Shape(quad.map(q => new THREE.Vector2(q.x, q.z)));
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  fg.rotateX(Math.PI / 2);
  const frame = new THREE.Mesh(fg, M.frame);
  frame.position.y = BY - 0.005;
  frame.castShadow = true; frame.receiveShadow = true;
  scene.add(frame);

  // Side guard along the long outer edge, and a support leg under the nose
  const sideOut = beltPerp.clone().multiplyScalar(0.07);
  const guard = box(b.distanceTo(c2), 0.1, 0.04, M.yellow);
  guard.position.copy(c2).add(b).multiplyScalar(0.5).add(sideOut).setY(BY + 0.03);
  guard.rotation.y = BELT_YAW;
  box(0.1, BY - 0.17, 0.1, M.steel, (a.x + b.x) / 2, (BY - 0.17) / 2, (a.z + b.z) / 2 + 0.15);
}

// ---------- Light grid ----------
const scanX = 0.9;
for (const z of [-1, 1]) box(0.08, 0.95, 0.08, M.frame, scanX, BY + 0.47, z * (BW / 2 + 0.16), belt);
box(0.16, 0.14, BW + 0.42, M.frame, scanX, BY + 0.95, 0, belt);
const scanLine = box(0.02, 0.02, BW, M.scanLine, scanX, BY + 0.87, 0, belt);
scanLine.castShadow = false;
// Light curtain between the posts, visible while a parcel is being measured
const curtainMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
const curtain = new THREE.Mesh(new THREE.PlaneGeometry(BW + 0.24, 0.86), curtainMat);
curtain.rotation.y = Math.PI / 2;
curtain.position.set(scanX, BY + 0.44, 0);
belt.add(curtain);
const T_SCAN = BL / 2 + scanX; // belt position of the light grid
let scanFlash = 0;

// ---------- Overhead label scanner (top read), upstream of the light grid ----------
const readX = -0.7;
const T_READ = BL / 2 + readX;
const HEAD_Y = BY + 1.15;
for (const z of [-1, 1]) box(0.08, HEAD_Y + 0.12 - BY, 0.08, M.frame, readX, (BY + HEAD_Y + 0.12) / 2, z * (BW / 2 + 0.16), belt);
box(0.12, 0.1, BW + 0.42, M.frame, readX, HEAD_Y + 0.17, 0, belt);
box(0.26, 0.16, 0.4, mat(0x1d2329, { metalness: 0.4, roughness: 0.4 }), readX, HEAD_Y + 0.04, 0, belt);
const lensMat = new THREE.MeshBasicMaterial({ color: 0x1f6f3a });
const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.26), lensMat);
lens.rotation.x = Math.PI / 2;
lens.position.set(readX, HEAD_Y - 0.041, 0);
belt.add(lens);
// Laser fan from the head down across the belt
const fanGeo = new THREE.BufferGeometry();
fanGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  readX, HEAD_Y - 0.05, 0,  readX, BY + 0.005, -BW / 2,  readX, BY + 0.005, BW / 2,
], 3));
const fanMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
belt.add(new THREE.Mesh(fanGeo, fanMat));
const readLine = box(0.015, 0.004, BW, new THREE.MeshBasicMaterial({ color: 0x3ddc84 }), readX, BY + 0.004, 0, belt);
readLine.castShadow = false;
let readFlash = 0;

// ---------- Dynamic scale: a separate weighing section on load cells, with a weight display ----------
const weighX = -1.9, WEIGH_LEN = 0.9;
const T_WEIGH = BL / 2 + weighX;
for (const dx of [-1, 1]) {
  const gap = box(0.03, 0.004, BW, M.frame, weighX + dx * WEIGH_LEN / 2, BY + 0.003, 0, belt);
  gap.castShadow = false;
}
box(WEIGH_LEN, 0.1, BW + 0.14, mat(0x3c6e9e, { metalness: 0.3, roughness: 0.5 }), weighX, BY - 0.14, 0, belt);
for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
  const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), M.steel);
  cell.position.set(weighX + dx * 0.32, BY - 0.23, dz * 0.35);
  belt.add(cell);
}
const dispZ = -(BW / 2 + 0.3);
box(0.06, BY + 0.5, 0.06, M.frame, weighX, (BY + 0.5) / 2, dispZ, belt);
box(0.5, 0.3, 0.08, mat(0x1d2329), weighX, BY + 0.62, dispZ, belt);
const dispCanvas = document.createElement('canvas');
dispCanvas.width = 256; dispCanvas.height = 128;
const dispTex = new THREE.CanvasTexture(dispCanvas);
function drawDisplay(text, lit) {
  const x = dispCanvas.getContext('2d');
  x.fillStyle = '#0d1a12'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = lit ? '#7dffb0' : '#3ddc84';
  x.font = '500 64px "JetBrains Mono", ui-monospace, monospace';
  x.textAlign = 'right'; x.textBaseline = 'middle';
  x.fillText(text, 200, 66);
  x.font = '500 28px "JetBrains Mono", ui-monospace, monospace';
  x.textAlign = 'left'; x.fillText('kg', 206, 82);
  dispTex.needsUpdate = true;
}
drawDisplay('0.00', false);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: dispTex }));
screen.position.set(weighX, BY + 0.62, dispZ + 0.041);
belt.add(screen);
let weighFlash = 0, lastWeigh = '0.00';

// ---------- Stations ----------
// Dynamic scale: ±10 g resolution while the parcel moves across the weighing section
function weigh(p) {
  p.weighed = { kg: Math.max(0.05, Math.round((p.kg + rand(-0.01, 0.01)) * 100) / 100) };
  lastWeigh = p.weighed.kg.toFixed(2);
  drawDisplay(lastWeigh, true);
  weighFlash = 0.35;
  emit('weighed', p);
}
function scanLabel(p) {
  p.scanned = { ms: Math.round(rand(8, 24)), at: new Date().toLocaleTimeString('en-GB') };
  readFlash = 0.35;
  emit('scanned', p);
}
// Light grid: measures each parcel as its centre passes the curtain (±2 mm resolution)
function measure(p) {
  const mm = x => Math.round(x * 1000 + rand(-2, 2));
  p.measured = { L: mm(p.l), W: mm(p.w), H: mm(p.h) };
  p.measured.vol = (p.measured.L * p.measured.W * p.measured.H / 1e6).toFixed(1);
  scanFlash = 0.35;
  emit('measured', p);
}

// ---------- Parcels on the belt ----------
const beltQ = [];   // parcels on the belt, sorted by t descending (front first)
const merging = []; // parcels sliding from the belt end onto their tray

// Public: a point on the floor, along metres from the belt start (negative is before it)
// and across metres to the right of its centreline
export function beltPoint(along, across = 0) {
  return beltStart.clone().addScaledVector(beltDir, along).addScaledVector(beltPerp, across).setY(0);
}
// Public: where a raycaster hits the belt top, or undefined
export const beltHit = ray => ray.intersectObject(beltTop)[0];
export const beltCount = () => beltQ.length;
// Public: is p the head parcel, waiting at the belt end for a free tray?
export const isWaitingToMerge = p => beltQ[0] === p && isAtBeltEnd(p);

// Public: is there room for a parcel of footprint length e at distance t along the belt?
export function canPlace(t, e) {
  return beltQ.every(q => Math.abs(q.t - t) >= (q.e + e) / 2 + 0.06);
}
// Public: creates a parcel directly on the belt at distance t from its start (used for the opening state)
export function placeOnBelt(t, dest) {
  const p = newParcel(dest);
  t = Math.min(Math.max(t, p.e / 2), BL - p.e / 2);
  if (!canPlace(t, p.e)) { p.mesh.geometry.dispose(); return false; }
  scene.add(p.mesh);
  putOnBelt(p, t);
  return true;
}
// Public: hands an existing parcel (already in the scene) to the belt
export function putOnBelt(p, t) {
  p.state = 'belt';
  p.t = t;
  addParcel(p);
  beltQ.push(p);
  beltQ.sort((a, b) => b.t - a.t);
  positionOnBelt(p);
}
function positionOnBelt(p) {
  p.mesh.position.copy(beltStart).addScaledVector(beltDir, p.t).setY(BY + p.h / 2);
  p.mesh.rotation.set(0, IND.yaw, 0);
}
const isAtBeltEnd = p => p.t >= BL - p.e / 2 - 0.03;

let beltTravel = 0;
// Public: one simulation step of the belt, the stations and merging parcels
export function updateInfeed(dt) {
  const v = settings.speed;
  const bs = v === 0 ? 0 : Math.min(1.6, 0.45 + 0.4 * v);
  beltTravel += bs * dt;
  beltTex.offset.x = -beltTravel / 0.35;
  for (let i = 0; i < beltQ.length; i++) {
    const p = beltQ[i];
    const maxT = i === 0 ? BL - p.e / 2 - 0.02 : beltQ[i - 1].t - beltQ[i - 1].e / 2 - 0.08 - p.e / 2;
    const t0 = p.t;
    p.t = Math.min(p.t + bs * dt, Math.max(p.t, maxT));
    if (t0 < T_WEIGH && p.t >= T_WEIGH) weigh(p);
    if (t0 < T_READ && p.t >= T_READ) scanLabel(p);
    if (t0 < T_SCAN && p.t >= T_SCAN) measure(p);
    positionOnBelt(p);
  }

  // Induction: the head parcel waits at the belt end until a free tray lines up with it,
  // then merges at an angle with its along-loop speed matched to the sorter, so the tray
  // stays directly beneath it while it slides across.
  const head = beltQ[0];
  if (head && v > 0.05 && isAtBeltEnd(head)) {
    const hp = head.mesh.position;
    const sp = S_INDUCT + (hp.x - IND.x) * IND.hx + (hp.z - IND.z) * IND.hz;
    const c = freeTrayAt(sp);
    if (c) {
      beltQ.shift();
      head.state = 'inducting'; head.carrier = c;
      head.lat = (hp.x - IND.x) * IND.ox + (hp.z - IND.z) * IND.oz;
      reserveTray(c, head);
      merging.push(head);
    }
  }

  // Lateral speed equals sorter speed (45° merge) until the parcel is on the tray,
  // then tray friction brings it to rest at the tray centre.
  for (const p of merging.slice()) {
    const c = p.carrier;
    const vl = p.lat > MERGE_DEC ? v : v * Math.max(0.12, Math.sqrt(p.lat / MERGE_DEC));
    p.lat = Math.max(0, p.lat - vl * dt);
    const edge = TRAY_W / 2 + 0.04;
    const lift = Math.min(1, Math.max(0, (p.lat - (edge - 0.15)) / 0.15)) * (BY - TRAY_Y);
    p.mesh.position.set(c.x + IND.ox * p.lat, TRAY_Y + p.h / 2 + lift, c.z + IND.oz * p.lat);
    p.mesh.rotation.set(0, c.yaw, 0);
    if (p.lat <= 0) { merging.splice(merging.indexOf(p), 1); loadTray(c, p); }
  }

  // Station lights fade after each reading
  scanFlash = Math.max(0, scanFlash - dt);
  curtainMat.opacity = 0.28 * Math.min(1, scanFlash / 0.15);
  M.scanLine.color.setHex(scanFlash > 0 ? 0xffd166 : 0xff3b30);
  if (weighFlash > 0 && (weighFlash -= dt) <= 0) drawDisplay(lastWeigh, false);
  readFlash = Math.max(0, readFlash - dt);
  fanMat.opacity = 0.07 + 0.3 * Math.min(1, readFlash / 0.15);
  lensMat.color.setHex(readFlash > 0 ? 0x7dffb0 : 0x1f6f3a);
}
