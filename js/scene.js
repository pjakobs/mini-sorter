// Renderer, camera, lights, floor and the shared materials and mesh helper.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { COL } from './layout.js';

export const canvas = document.getElementById('scene');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
scene.fog = new THREE.Fog(COL.bg, 45, 95);

export const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(-3, 15, 23);
export const controls = new OrbitControls(camera, canvas);
controls.target.set(-1.5, 0.8, 3);
controls.enableDamping = true;
controls.maxPolarAngle = 1.45;
controls.minDistance = 5;
controls.maxDistance = 45;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a939c, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(9, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
scene.add(sun);

export const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o));
export const M = {
  floor: mat(0xd2d8dd, { roughness: 0.95 }),
  frame: mat(0x46525e, { metalness: 0.3, roughness: 0.6 }),
  steel: mat(0x8a96a2, { metalness: 0.4, roughness: 0.5 }),
  tray: mat(0xc9d3dc, { metalness: 0.25, roughness: 0.45 }),
  trayHome: mat(COL.yellow, { roughness: 0.5 }),
  base: mat(0x2f3842, { metalness: 0.3 }),
  yellow: mat(COL.yellow, { roughness: 0.6 }),
  belt: mat(0xffffff, { roughness: 0.9 }),
  slide: mat(0xb7c1ca, { metalness: 0.5, roughness: 0.35 }),
  table: mat(0x9aa6b1, { metalness: 0.3, roughness: 0.6 }),
  scanLine: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
};

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Floor with faint grid of 1 m tiles
const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), M.floor);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(80, 80, 0xb9c1c8, 0xc7ced4);
grid.position.y = 0.002;
scene.add(grid);

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 640 ? 55 : 42;
  camera.updateProjectionMatrix();
}
