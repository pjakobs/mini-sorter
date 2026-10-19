// Robot arm: picks parcels from a pallet and places them on the start of the infeed.
// Its job queue and state are private; ask for picks with requestPick and read robotStatus.
import * as THREE from 'three';
import { BY, IND, BELT_YAW, smooth, wrapAngle } from './layout.js';
import { scene, mat, M, box } from './scene.js';
import { newParcel, cardboard } from './parcels.js';
import { beltPoint, canPlace, putOnBelt } from './infeed.js';

const ROB = { a1: 1.15, a2: 1.05, a3: 0.32, H0: 0.78 };
const MAX_QUEUE = 5;
const robotBase = beltPoint(0.4, 1.25);
const PICK = beltPoint(-1.0, 2.2);
const STACK_TOP = 0.14 + 2 * 0.34;

// Pallet with a two-layer stack of cartons
{
  const pallet = new THREE.Group();
  pallet.position.copy(PICK);
  pallet.rotation.y = BELT_YAW;
  scene.add(pallet);
  const wood = mat(0x9c7a4b, { roughness: 0.95 });
  box(1.2, 0.04, 1.0, wood, 0, 0.12, 0, pallet);
  for (const z of [-0.42, 0, 0.42]) box(1.2, 0.1, 0.12, wood, 0, 0.05, z, pallet);
  let k = 0;
  for (let layer = 0; layer < 2; layer++) {
    for (const x of [-0.4, 0, 0.4]) for (const z of [-0.24, 0.24]) {
      box(0.38, 0.33, 0.46, cardboard[k++ % cardboard.length], x, 0.14 + 0.17 + layer * 0.34, z, pallet);
    }
  }
}

// Arm: pedestal → turret (yaw) → shoulder → elbow → wrist (keeps the tool vertical) → flange (tool rotation)
const robotGroup = new THREE.Group();
robotGroup.position.copy(robotBase);
scene.add(robotGroup);
const mBody = mat(0xe9edf0, { roughness: 0.45 });
const mJoint = mat(0x2f3842, { metalness: 0.3, roughness: 0.5 });
function rpart(geo, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const jointGeo = (r, len) => new THREE.CylinderGeometry(r, r, len, 24).rotateX(Math.PI / 2);
const linkGeo = (len, t) => new THREE.BoxGeometry(len, t, t * 0.9).translate(len / 2, 0, 0);

rpart(new THREE.CylinderGeometry(0.32, 0.38, 0.5, 32), mJoint, robotGroup, 0, 0.25, 0);
const turret = new THREE.Group();
turret.position.y = 0.5;
robotGroup.add(turret);
rpart(new THREE.CylinderGeometry(0.27, 0.3, 0.22, 32), mBody, turret, 0, 0.11, 0);
const shoulder = new THREE.Group();
shoulder.position.y = ROB.H0 - 0.5;
turret.add(shoulder);
rpart(jointGeo(0.17, 0.4), mJoint, shoulder);
rpart(linkGeo(ROB.a1, 0.2), mBody, shoulder);
const elbow = new THREE.Group();
elbow.position.x = ROB.a1;
shoulder.add(elbow);
rpart(jointGeo(0.13, 0.32), mJoint, elbow);
rpart(linkGeo(ROB.a2, 0.15), mBody, elbow);
const wrist = new THREE.Group();
wrist.position.x = ROB.a2;
elbow.add(wrist);
rpart(jointGeo(0.09, 0.24), mJoint, wrist);
const flange = new THREE.Group();
wrist.add(flange);
rpart(linkGeo(ROB.a3 - 0.05, 0.09), mJoint, flange);
const cupBar = rpart(new THREE.BoxGeometry(0.03, 0.06, 0.34), M.yellow, flange, ROB.a3 - 0.06, 0, 0);
cupBar.castShadow = false;
for (const z of [-0.12, 0.12]) rpart(new THREE.CylinderGeometry(0.05, 0.035, 0.05, 16).rotateZ(Math.PI / 2), mJoint, flange, ROB.a3 - 0.025, 0, z);

// Pose = tool tip in cylindrical coordinates around the robot base, plus tool rotation
const cyl = pt => ({ yaw: Math.atan2(-(pt.z - robotBase.z), pt.x - robotBase.x), r: Math.hypot(pt.x - robotBase.x, pt.z - robotBase.z) });
function setPose(q) {
  turret.rotation.y = q.yaw;
  const wy = q.y + ROB.a3 - ROB.H0;
  const D = Math.min(ROB.a1 + ROB.a2 - 0.001, Math.max(Math.abs(ROB.a1 - ROB.a2) + 0.02, Math.hypot(q.r, wy)));
  const E = Math.acos(Math.min(1, Math.max(-1, (D * D - ROB.a1 ** 2 - ROB.a2 ** 2) / (2 * ROB.a1 * ROB.a2))));
  const sh = Math.atan2(wy, q.r) + Math.atan2(ROB.a2 * Math.sin(E), ROB.a1 + ROB.a2 * Math.cos(E));
  shoulder.rotation.z = sh;
  elbow.rotation.z = -E;
  wrist.rotation.z = -Math.PI / 2 - sh + E;
  flange.rotation.x = -q.rot;
}

const rob = { queue: [], steps: [], cur: null, carry: null, status: 'Idle', pose: Object.assign(cyl(PICK), { y: 1.6, rot: 0 }) };
const dropT = p => p.e / 2 + 0.05;

// Queues a pick for destination 'A', 'B' or 'R'; returns false when the queue is full
export function requestPick(dest) {
  if (rob.queue.length >= MAX_QUEUE) return false;
  rob.queue.push(dest);
  return true;
}

// What the robot is doing ('Idle', 'Picking', 'Placing', 'Waiting for space') and how many picks are queued
export const robotStatus = () => ({ status: rob.status, queued: rob.queue.length });

function startJob(dest) {
  const p = newParcel(dest);
  p.state = 'robot';
  const pk = cyl(PICK);
  const dp = cyl(beltPoint(dropT(p)));
  const rot = wrapAngle(IND.yaw - dp.yaw); // turn the parcel so it lands square to the loop
  p.mesh.position.set(PICK.x, STACK_TOP + p.h / 2, PICK.z);
  p.mesh.rotation.set(0, pk.yaw, 0);
  scene.add(p.mesh);
  const at = (c, y, r) => Object.assign({}, c, { y, rot: r });
  rob.steps = [
    { to: at(pk, STACK_TOP + p.h + 0.45, 0), dur: 0.9, status: 'Picking' },
    { to: at(pk, STACK_TOP + p.h, 0), dur: 0.45, end() { rob.carry = p; } },
    { to: at(pk, STACK_TOP + p.h + 0.45, 0), dur: 0.4 },
    { to: at(dp, BY + p.h + 0.45, rot), dur: 1.0, status: 'Placing' },
    { wait: () => canPlace(dropT(p), p.e), status: 'Waiting for space' },
    { to: at(dp, BY + p.h + 0.005, rot), dur: 0.45, status: 'Placing', end() { rob.carry = null; putOnBelt(p, dropT(p)); } },
    { to: at(dp, BY + p.h + 0.45, rot), dur: 0.35 },
  ];
}

export function updateRobot(dt) {
  if (!rob.cur) {
    if (!rob.steps.length && rob.queue.length) startJob(rob.queue.shift());
    if (rob.steps.length) {
      rob.cur = rob.steps.shift();
      rob.cur.t = 0;
      rob.cur.from = Object.assign({}, rob.pose);
      if (rob.cur.status) rob.status = rob.cur.status;
    } else {
      rob.status = 'Idle';
    }
  }
  const s = rob.cur;
  if (s && s.wait) {
    if (s.wait()) rob.cur = null;
  } else if (s) {
    s.t += dt;
    const k = smooth(Math.min(1, s.t / s.dur));
    const f = s.from, to = s.to;
    rob.pose.yaw = f.yaw + wrapAngle(to.yaw - f.yaw) * k;
    rob.pose.r = f.r + (to.r - f.r) * k;
    rob.pose.y = f.y + (to.y - f.y) * k;
    rob.pose.rot = f.rot + (to.rot - f.rot) * k;
    if (s.t >= s.dur) { rob.cur = null; if (s.end) s.end(); }
  }
  setPose(rob.pose);
  const p = rob.carry;
  if (p) {
    const q = rob.pose;
    p.mesh.position.set(robotBase.x + q.r * Math.cos(q.yaw), q.y - p.h / 2, robotBase.z - q.r * Math.sin(q.yaw));
    p.mesh.rotation.set(0, q.yaw + q.rot, 0);
  }
}
setPose(rob.pose);
