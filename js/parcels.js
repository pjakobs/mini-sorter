// Parcels: their size, weight, label data and the 3D carton, and the list of parcels in the system.
// The list is private: other modules add and remove parcels through addParcel and removeParcel,
// and read it through allParcels, which returns a copy.
import * as THREE from 'three';
import { COL, INDUCT_ANGLE, rand, pick } from './layout.js';
import { scene, mat } from './scene.js';

const parcels = [];
let parcelSeq = 1040;

export const cardboard = [0xb98a5c, 0xc49a6c, 0xa97b4f].map(c => mat(c, { roughness: 0.9 }));
function labelMat(key) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b98a5c'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#ffffff'; x.fillRect(36, 48, 184, 160);
  x.fillStyle = '#' + COL[key].toString(16).padStart(6, '0'); x.fillRect(36, 48, 184, 52);
  x.fillStyle = '#18212b';
  for (let i = 0; i < 26; i++) x.fillRect(52 + i * 6, 150, (i * 7) % 3 + 2, 44);
  x.fillStyle = '#ffffff'; x.font = 'bold 44px "Barlow Condensed", "Arial Narrow", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(key, 128, 76);
  x.fillStyle = '#18212b'; x.font = '500 22px "JetBrains Mono", monospace';
  x.fillText('CHUTE ' + key, 128, 126);
  return mat(0xffffff, { map: new THREE.CanvasTexture(c), roughness: 0.9 });
}
const labels = { A: labelMat('A'), B: labelMat('B') };

// Sort plan: each chute serves one route; the label's postcode decides the route
export const ROUTES = Object.freeze({
  A: Object.freeze({ code: 'NL-N', hub: 'North hub', places: [['1012', 'Amsterdam'], ['9711', 'Groningen'], ['8911', 'Leeuwarden'], ['8011', 'Zwolle'], ['7511', 'Enschede']] }),
  B: Object.freeze({ code: 'NL-S', hub: 'South hub', places: [['5611', 'Eindhoven'], ['6211', 'Maastricht'], ['4811', 'Breda'], ['5038', 'Tilburg'], ['3011', 'Rotterdam']] }),
});
function makeLabel(dest) {
  // SSCC-18 with GS1 mod-10 check digit
  let d = '3' + '8712345' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += +d[16 - i] * (i % 2 === 0 ? 3 : 1);
  d += (10 - sum % 10) % 10;
  const [pc, city] = pick(ROUTES[dest].places);
  const letters = 'ABCDEGHJKLMNPRSTVWXZ';
  const r = Math.random();
  return {
    sscc: '(00) ' + d[0] + ' ' + d.slice(1, 8) + ' ' + d.slice(8, 17) + ' ' + d[17],
    postcode: pc + ' ' + pick(letters) + pick(letters),
    city,
    service: r < 0.62 ? 'Standard' : r < 0.9 ? 'Express' : 'Same day',
    fragile: Math.random() < 0.12,
  };
}

// Creates a parcel object and its mesh; the caller adds the mesh to the scene and,
// once the parcel is in the system, calls addParcel.
// dest is 'A', 'B' or 'R' (random).
export function newParcel(dest) {
  if (dest === 'R') dest = Math.random() < 0.5 ? 'A' : 'B';
  const l = rand(0.3, 0.55), w = rand(0.25, 0.5), h = rand(0.15, 0.4);
  const side = cardboard[Math.floor(Math.random() * cardboard.length)];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), [side, side, labels[dest], side, side, side]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // Parcels sit on the belt pre-rotated to the loop's heading at the induction point,
  // so they land square on the tray. e = footprint length along the belt direction.
  const e = l * Math.abs(Math.cos(INDUCT_ANGLE)) + w * Math.abs(Math.sin(INDUCT_ANGLE));
  const p = { id: ++parcelSeq, dest, l, w, h, e, mesh, state: 'belt', t: 0, yawOff: 0, recirc: 0, label: makeLabel(dest),
    kg: l * w * h * rand(70, 260) + 0.15 }; // contents density + packaging
  mesh.userData.parcel = p;
  return p;
}

export function addParcel(p) {
  parcels.push(p);
}

// Takes a collected parcel out of the scene and the list
export function removeParcel(p) {
  scene.remove(p.mesh);
  p.mesh.geometry.dispose();
  p.state = 'collected';
  parcels.splice(parcels.indexOf(p), 1);
}

// A snapshot of every parcel in the system; safe to iterate while parcels are added or removed
export const allParcels = () => parcels.slice();
