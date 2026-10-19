// The loop: frame, tilting trays, outfeed chutes and bins, and parcels from the tray onwards.
// Trays, chutes and the sort counters are private; the infeed and the UI use the functions below.
import * as THREE from 'three';
import { L, R, P, BACK0, N, PITCH, TRAY_Y, TRAY_L, TRAY_W, K_DAMP, CAP, CH, COL, mod, rand, pathAt, crossed } from './layout.js';
import { scene, mat, M, box, drawing } from './scene.js';
import { settings } from './state.js';
import { removeParcel } from './parcels.js';

/** @typedef {import('./parcels.js').Parcel} Parcel */
/** @typedef {import('./parcels.js').Dest} Dest */
/**
 * A tray on the loop. Other modules get these as handles (parcel.carrier) and may read i, x, z and yaw.
 * @typedef {object} Carrier
 * @property {number} i index, 0-based (the UI shows i + 1)
 * @property {number} x
 * @property {number} z
 * @property {number} yaw
 * @property {number} s distance along the loop now
 * @property {number} prevS distance along the loop before the last step
 * @property {THREE.Group} g
 * @property {THREE.Group} pivot tilts the tray to discharge
 * @property {Parcel | null} parcel riding on it
 * @property {Parcel | null} reserved merging onto it
 * @property {number} tiltT time into the tilt animation, -1 when level
 */
/**
 * A parcel in a chute: sliding down (side = across the chute from its centre, u = distance down
 * from the loop), then landing in a bin slot (landed 0 → 1), then being taken away (gone 0 → 1)
 * @typedef {{ p: Parcel, side: number, vSide: number, u: number, vu: number, landed: number, gone: number,
 *   from: Spot, to: Spot }} InChute
 * @typedef {{ side: number, y: number, u: number }} Spot
 */
/**
 * @typedef {object} Chute
 * @property {Dest} key
 * @property {number} s loop position of the chute
 * @property {import('./layout.js').PathPoint} p
 * @property {{ x: number, z: number, m: InChute | null }[]} slots bin positions
 * @property {number} count parcels assigned: sliding or in the bin
 * @property {boolean} open
 * @property {THREE.MeshBasicMaterial} lampMat
 */
/** @typedef {'open' | 'full' | 'closed'} ChuteStatus */

// ---------- Loop frame ----------
/**
 * @template {THREE.Path} T
 * @param {number} r
 * @param {T} path
 */
function stadium(r, path) {
  path.moveTo(-L / 2, -r);
  path.lineTo(L / 2, -r);
  path.absarc(L / 2, 0, r, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-L / 2, r);
  path.absarc(-L / 2, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return path;
}
/**
 * @param {number} rIn
 * @param {number} rOut
 * @param {number} depth
 * @param {THREE.Material} material
 * @param {number} y
 */
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
const tmp = pathAt(0);
for (let k = 0; k < 18; k++) {
  pathAt(k * P / 18, tmp);
  for (const off of [-0.3, 0.3]) {
    box(0.12, FRAME_Y, 0.12, M.steel, tmp.x + tmp.ox * off, FRAME_Y / 2, tmp.z + tmp.oz * off);
  }
}

// ---------- Carriers ----------
// A carrier is also a handle other modules hold (parcel.carrier); they may read i, x, z and yaw.
/** @type {Carrier[]} */
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
/** @param {string} letter @param {number} color */
function signTexture(letter, color) {
  const [c, x] = drawing(256);
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#ffffff'; x.font = 'bold 190px "Barlow Condensed", "Arial Narrow", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 128, 140);
  return new THREE.CanvasTexture(c);
}
/**
 * @param {Dest} key
 * @param {number} s
 * @returns {Chute}
 */
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

  /** @type {Chute['slots']} */
  const slots = [];
  for (const z of [0.35, 0.9, 1.45]) for (const x of [-0.58, 0, 0.58]) slots.push({ x, z: CH.z0 + CH.Lc + z, m: null });
  return { key, s, p, slots, count: 0, open: true, lampMat };
}
/** @type {Record<Dest, Chute>} */
const chutes = { A: makeChute('A', BACK0 + 3.5), B: makeChute('B', BACK0 + 8) };
/** @type {InChute[]} */
const inChutes = [];
const stats = { A: 0, B: 0, recirc: 0 };

/** @param {Chute} ch @returns {ChuteStatus} */
function chuteStatus(ch) {
  return !ch.open ? 'closed' : ch.count >= CAP ? 'full' : 'open';
}
/** The lamp on the sign post shows the chute's status @param {Chute} ch */
function showStatus(ch) {
  const status = chuteStatus(ch);
  ch.lampMat.color.setHex(status === 'open' ? 0x2e8b57 : status === 'full' ? 0xf2b705 : 0xc0392b);
}

// ---------- Public ----------
/**
 * A snapshot of a chute: status, whether it is open, parcels assigned to it (sliding or
 * in the bin) and the destinations of the parcels in the bin
 * @param {Dest} key
 * @returns {{ status: ChuteStatus, open: boolean, count: number, bin: Dest[] }}
 */
export function chuteInfo(key) {
  const ch = chutes[key];
  return { status: chuteStatus(ch), open: ch.open, count: ch.count, bin: ch.slots.flatMap(s => s.m ? [s.m.p.dest] : []) };
}

/** @param {Dest} key @param {boolean} open */
export function setChuteOpen(key, open) {
  chutes[key].open = open;
  showStatus(chutes[key]);
}

/**
 * Takes the parcels that have landed in a chute's bin away; returns how many were removed
 * @param {Dest} key
 */
export function emptyChute(key) {
  const ch = chutes[key];
  let n = 0;
  for (const s of ch.slots) {
    if (s.m && s.m.landed >= 1) { s.m.p.state = 'removing'; s.m = null; n++; }
  }
  ch.count -= n;
  showStatus(ch);
  return n;
}

// Sorted per chute and recirculations so far (a copy)
export const sortStats = () => ({ ...stats });

/**
 * The tray that passed loop position s during the last step, if it is free to take a parcel
 * @param {number} s
 */
export function freeTrayAt(s) {
  const c = carriers.find(c => crossed(c.prevS, c.s, s));
  return c && !c.parcel && !c.reserved && c.tiltT < 0 ? c : null;
}
/**
 * A parcel starts merging onto tray c; nothing else may take it meanwhile
 * @param {Carrier} c
 * @param {Parcel} p
 */
export function reserveTray(c, p) {
  c.reserved = p;
}
/**
 * The merging parcel has come to rest on tray c
 * @param {Carrier} c
 * @param {Parcel} p
 */
export function loadTray(c, p) {
  p.state = 'carrier';
  p.carrier = c;
  c.parcel = p;
  c.reserved = null;
}

// ---------- Motion ----------
let loopPos = 0;
const cp = pathAt(0);

/**
 * Moves the trays round the loop, runs tilt animations and tips parcels into their chute
 * @param {number} dt seconds
 */
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
          p.state = 'chute'; p.carrier = null;
          const at = { side: mod(c.s - ch.s + P / 2) - P / 2, y: 0, u: 0 };
          inChutes.push({ p, side: at.side, vSide: v, u: 0, vu: 0.8, landed: 0, gone: 0, from: at, to: at });
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

/**
 * Places a parcel in a chute's own coordinates: side across it, u down it, at height y
 * @param {Parcel} p
 * @param {Chute} ch
 * @param {number} side
 * @param {number} y
 * @param {number} u
 * @param {number} tilt
 */
function chuteLocal(p, ch, side, y, u, tilt) {
  const c = ch.p;
  p.mesh.position.set(c.x + c.hx * side + c.ox * u, y, c.z + c.hz * side + c.oz * u);
  p.mesh.rotation.set(tilt, c.yaw, 0, 'YXZ');
}

/**
 * Parcels riding a tray, sliding down a chute, landing in a bin or being collected
 * @param {number} dt seconds
 */
export function updateSorterParcels(dt) {
  for (const c of carriers) {
    const p = c.parcel;
    if (!p) continue;
    p.mesh.position.set(c.x, TRAY_Y + p.h / 2, c.z);
    p.mesh.rotation.set(0, c.yaw, 0);
  }
  for (const m of inChutes.slice()) {
    const p = m.p, ch = chutes[p.dest];
    if (p.state === 'chute') {
      const onSlide = m.u > CH.z0;
      m.vu = Math.min(3.2, m.vu + (onSlide ? 2.6 : 3.2) * dt);
      m.u += m.vu * dt;
      m.vSide *= Math.exp(-K_DAMP * dt);
      m.side += m.vSide * dt;
      if (m.u > CH.z0 - 0.2) {
        const lim = CH.W / 2 - p.l / 2 - 0.03;
        if (Math.abs(m.side) > lim) { m.side = Math.sign(m.side) * lim; m.vSide *= -0.25; }
      }
      let y, tilt;
      if (m.u < CH.z0) {
        const f = m.u / CH.z0;
        y = TRAY_Y + p.h / 2 - f * 0.08; tilt = CH.slope * f;
      } else {
        y = CH.y0 - (m.u - CH.z0) * Math.tan(CH.slope) + p.h / 2 / Math.cos(CH.slope); tilt = CH.slope;
      }
      if (m.u >= CH.z0 + CH.Lc) {
        // count never exceeds the number of slots, so there is always a free one
        const slot = ch.slots.find(s => !s.m);
        if (!slot) throw new Error('No free bin slot in chute ' + ch.key);
        slot.m = m;
        p.state = 'bin';
        m.from = { side: m.side, y, u: m.u };
        m.to = { side: slot.x + rand(-0.04, 0.04), y: CH.tableY + p.h / 2, u: slot.z + rand(-0.04, 0.04) };
        stats[p.dest]++;
      }
      chuteLocal(p, ch, m.side, y, m.u, tilt);
    } else if (p.state === 'bin') {
      if (m.landed < 1) {
        m.landed = Math.min(1, m.landed + dt / 0.35);
        const k = 1 - Math.pow(1 - m.landed, 3);
        chuteLocal(p, ch,
          m.from.side + (m.to.side - m.from.side) * k,
          m.from.y + (m.to.y - m.from.y) * k,
          m.from.u + (m.to.u - m.from.u) * k,
          CH.slope * (1 - k));
      }
    } else if (p.state === 'removing') {
      m.gone += dt / 0.4;
      p.mesh.scale.setScalar(Math.max(0.001, 1 - m.gone));
      p.mesh.position.y += dt * 1.5;
      if (m.gone >= 1) { inChutes.splice(inChutes.indexOf(m), 1); removeParcel(p); }
    }
  }
}
