// The loop: frame, tilting trays, outfeed chutes and bins, and parcels from the tray onwards.
// Trays, chutes and the sort counters are private; the infeed and the UI use the functions below.
import * as THREE from 'three';
import { L, R, P, BACK0, N, PITCH, TRAY_Y, TRAY_L, TRAY_W, K_DAMP, CAP, CH, COL, mod, rand, pathAt, crossed } from './layout.js';
import { scene, mat, M, box } from './scene.js';
import { settings } from './state.js';
import { allParcels, removeParcel } from './parcels.js';

// ---------- Loop frame ----------
function stadium(r, path) {
  path.moveTo(-L / 2, -r);
  path.lineTo(L / 2, -r);
  path.absarc(L / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-L / 2, r);
  path.absarc(-L / 2, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return path;
}
function ring(rIn, rOut, depth, material, y) {
  const shape = stadium(rOut, new THREE.Shape());
  shape.holes.push(stadium(rIn, new THREE.Path()));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = y;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  return m;
}
const FRAME_Y = TRAY_Y - 0.55;
ring(R - 0.42, R + 0.42, 0.22, M.frame, FRAME_Y);
ring(R + 0.42, R + 0.47, 0.22, M.yellow, FRAME_Y);
const tmp = {};
for (let k = 0; k < 18; k++) {
  pathAt(k * P / 18, tmp);
  for (const off of [-0.3, 0.3]) {
    box(0.12, FRAME_Y, 0.12, M.steel, tmp.x + tmp.ox * off, FRAME_Y / 2, tmp.z + tmp.oz * off);
  }
}

// ---------- Carriers ----------
// A carrier is also a handle other modules hold (parcel.carrier); they may read i, x, z and yaw.
const carriers = [];
const baseGeo = new THREE.BoxGeometry(0.6, 0.3, 0.5);
const trayGeo = new THREE.BoxGeometry(TRAY_L, 0.05, TRAY_W);
for (let i = 0; i < N; i++) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(baseGeo, M.base);
  base.position.y = TRAY_Y - 0.2;
  base.castShadow = true;
  g.add(base);
  const pivot = new THREE.Group();
  pivot.position.y = TRAY_Y - 0.025;
  const tray = new THREE.Mesh(trayGeo, i === 0 ? M.trayHome : M.tray);
  tray.castShadow = true; tray.receiveShadow = true;
  pivot.add(tray);
  g.add(pivot);
  scene.add(g);
  carriers.push({ i, g, pivot, s: i * PITCH, prevS: i * PITCH, x: 0, z: 0, yaw: 0, parcel: null, reserved: null, tiltT: -1 });
}

// ---------- Chutes ----------
function signTexture(letter, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#ffffff'; x.font = 'bold 190px "Barlow Condensed", "Arial Narrow", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 128, 140);
  return new THREE.CanvasTexture(c);
}
function makeChute(key, s) {
  const p = pathAt(s);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.yaw;
  scene.add(g);
  const len = CH.Lc / Math.cos(CH.slope);
  const midY = CH.y0 - (CH.Lc / 2) * Math.tan(CH.slope);
  const slide = box(CH.W, 0.04, len, M.slide, 0, midY - 0.02, CH.z0 + CH.Lc / 2, g);
  slide.rotation.x = CH.slope;
  for (const sx of [-1, 1]) {
    const wall = box(0.04, 0.4, len, M.steel, sx * CH.W / 2, midY + 0.16, CH.z0 + CH.Lc / 2, g);
    wall.rotation.x = CH.slope;
    box(0.04, 0.3, CH.binD, M.steel, sx * CH.W / 2, CH.tableY + 0.12, CH.z0 + CH.Lc + CH.binD / 2, g);
  }
  box(CH.W, 0.06, 0.08, mat(COL[key]), 0, CH.y0 - 0.03, CH.z0, g);
  const zEnd = CH.z0 + CH.Lc + CH.binD;
  box(CH.W, 0.06, CH.binD, M.table, 0, CH.tableY - 0.03, CH.z0 + CH.Lc + CH.binD / 2, g);
  box(CH.W + 0.04, 0.3, 0.04, M.steel, 0, CH.tableY + 0.12, zEnd, g);
  for (const sx of [-1, 1]) for (const z of [CH.z0 + CH.Lc + 0.1, zEnd - 0.1]) box(0.08, CH.tableY - 0.06, 0.08, M.steel, sx * (CH.W / 2 - 0.1), (CH.tableY - 0.06) / 2, z, g);
  // Sign post with status lamp
  const postX = CH.W / 2 + 0.25;
  box(0.08, 2.4, 0.08, M.frame, postX, 1.2, zEnd - 0.1, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: signTexture(key, COL[key]) }));
  sign.position.set(postX, 2.0, zEnd - 0.15);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x2e8b57 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), lampMat);
  lamp.position.set(postX, 2.52, zEnd - 0.1);
  g.add(lamp);

  const slots = [];
  for (const z of [0.35, 0.9, 1.45]) for (const x of [-0.58, 0, 0.58]) slots.push({ x, z: CH.z0 + CH.Lc + z, p: null });
  return { key, s, p, g, slots, count: 0, open: true, lampMat };
}
const chutes = { A: makeChute('A', BACK0 + 3.5), B: makeChute('B', BACK0 + 8) };
const stats = { A: 0, B: 0, recirc: 0 };

// 'open', 'full' or 'closed'
function chuteStatus(ch) {
  return !ch.open ? 'closed' : ch.count >= CAP ? 'full' : 'open';
}
// The lamp on the sign post shows the chute's status
function showStatus(ch) {
  const status = chuteStatus(ch);
  ch.lampMat.color.setHex(status === 'open' ? 0x2e8b57 : status === 'full' ? 0xf2b705 : 0xc0392b);
}

// ---------- Public ----------
// A snapshot of chute 'A' or 'B': status, whether it is open, parcels assigned to it (sliding or
// in the bin) and the destinations of the parcels in the bin
export function chuteInfo(key) {
  const ch = chutes[key];
  return { status: chuteStatus(ch), open: ch.open, count: ch.count, bin: ch.slots.filter(s => s.p).map(s => s.p.dest) };
}

export function setChuteOpen(key, open) {
  chutes[key].open = open;
  showStatus(chutes[key]);
}

// Takes the parcels that have landed in a chute's bin away; returns how many were removed
export function emptyChute(key) {
  const ch = chutes[key];
  let n = 0;
  for (const s of ch.slots) {
    if (s.p && s.p.bt >= 1) { s.p.state = 'removing'; s.p.rt = 0; s.p = null; n++; }
  }
  ch.count -= n;
  showStatus(ch);
  return n;
}

// Sorted per chute and recirculations so far (a copy)
export const sortStats = () => ({ ...stats });

// The tray that passed loop position s during the last step, if it is free to take a parcel
export function freeTrayAt(s) {
  const c = carriers.find(c => crossed(c.prevS, c.s, s));
  return c && !c.parcel && !c.reserved && c.tiltT < 0 ? c : null;
}
// A parcel starts merging onto tray c; nothing else may take it meanwhile
export function reserveTray(c, p) {
  c.reserved = p;
}
// The merging parcel has come to rest on tray c
export function loadTray(c, p) {
  p.state = 'carrier';
  p.carrier = c;
  c.parcel = p;
  c.reserved = null;
}

// ---------- Motion ----------
let loopPos = 0;
const cp = {};

// Moves the trays round the loop, runs tilt animations and tips parcels into their chute
export function moveCarriers(dt) {
  const v = settings.speed;
  loopPos = mod(loopPos + v * dt);
  const lead = v / K_DAMP;
  for (const c of carriers) {
    c.prevS = c.s;
    c.s = mod(c.i * PITCH + loopPos);
    pathAt(c.s, cp);
    c.x = cp.x; c.z = cp.z; c.yaw = cp.yaw;
    c.g.position.set(cp.x, 0, cp.z);
    c.g.rotation.y = cp.yaw;
    if (c.tiltT >= 0) {
      c.tiltT += dt;
      const t = c.tiltT, max = 0.55;
      c.pivot.rotation.x = t < 0.18 ? max * t / 0.18 : t < 0.55 ? max : t < 1.05 ? max * (1 - (t - 0.55) / 0.5) : 0;
      if (t >= 1.05) c.tiltT = -1;
    }
    const p = c.parcel;
    if (p && p.state === 'carrier') {
      const ch = chutes[p.dest];
      if (crossed(c.prevS, c.s, ch.s - lead)) {
        if (ch.open && ch.count < CAP) {
          p.state = 'chute'; p.chute = ch;
          p.w = mod(c.s - ch.s + P / 2) - P / 2;
          p.u = 0; p.vu = 0.8; p.vw = v;
          ch.count++;
          showStatus(ch);
          c.parcel = null; c.tiltT = 0;
        } else {
          stats.recirc++;
          p.recirc++;
        }
      }
    }
  }
}

function chuteLocal(p, ch, w, y, u, tilt) {
  const c = ch.p;
  p.mesh.position.set(c.x + c.hx * w + c.ox * u, y, c.z + c.hz * w + c.oz * u);
  p.mesh.rotation.set(tilt, c.yaw + p.yawOff, 0, 'YXZ');
}

// Parcels riding a tray, sliding down a chute, landing in a bin or being collected
export function updateSorterParcels(dt) {
  for (const p of allParcels()) {
    if (p.state === 'carrier') {
      const c = p.carrier;
      p.mesh.position.set(c.x, TRAY_Y + p.h / 2, c.z);
      p.mesh.rotation.set(0, c.yaw + p.yawOff, 0);
    } else if (p.state === 'chute') {
      const ch = p.chute;
      const onSlide = p.u > CH.z0;
      p.vu = Math.min(3.2, p.vu + (onSlide ? 2.6 : 3.2) * dt);
      p.u += p.vu * dt;
      p.vw *= Math.exp(-K_DAMP * dt);
      p.w += p.vw * dt;
      if (p.u > CH.z0 - 0.2) {
        const lim = CH.W / 2 - p.l / 2 - 0.03;
        if (Math.abs(p.w) > lim) { p.w = Math.sign(p.w) * lim; p.vw *= -0.25; }
      }
      let y, tilt;
      if (p.u < CH.z0) {
        const f = p.u / CH.z0;
        y = TRAY_Y + p.h / 2 - f * 0.08; tilt = CH.slope * f;
      } else {
        y = CH.y0 - (p.u - CH.z0) * Math.tan(CH.slope) + p.h / 2 / Math.cos(CH.slope); tilt = CH.slope;
      }
      if (p.u >= CH.z0 + CH.Lc) {
        const slot = ch.slots.find(s => !s.p);
        slot.p = p;
        p.state = 'bin'; p.bt = 0;
        p.from = { w: p.w, y, u: p.u };
        p.to = { w: slot.x + rand(-0.04, 0.04), y: CH.tableY + p.h / 2, u: slot.z + rand(-0.04, 0.04) };
        stats[p.dest]++;
      }
      chuteLocal(p, ch, p.w, y, p.u, tilt);
    } else if (p.state === 'bin') {
      if (p.bt < 1) {
        p.bt = Math.min(1, p.bt + dt / 0.35);
        const k = 1 - Math.pow(1 - p.bt, 3);
        chuteLocal(p, p.chute,
          p.from.w + (p.to.w - p.from.w) * k,
          p.from.y + (p.to.y - p.from.y) * k,
          p.from.u + (p.to.u - p.from.u) * k,
          CH.slope * (1 - k));
      }
    } else if (p.state === 'removing') {
      p.rt += dt / 0.4;
      const s = Math.max(0.001, 1 - p.rt);
      p.mesh.scale.setScalar(s);
      p.mesh.position.y += dt * 1.5;
      if (p.rt >= 1) removeParcel(p);
    }
  }
}
