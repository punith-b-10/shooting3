import * as THREE from 'three';
import type { WeaponId } from '../core/types';

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
cyl.rotateX(Math.PI / 2); // axis along z

const mats = {
  metal: new THREE.MeshStandardMaterial({ color: 0x6d747e, roughness: 0.45, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x41454c, roughness: 0.6, metalness: 0.2 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb7bdc5, roughness: 0.4, metalness: 0.35 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.7, metalness: 0.05 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.8, metalness: 0.05 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x8a7a56, roughness: 0.75, metalness: 0.1 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x60a8ff, roughness: 0.05, metalness: 0.9, emissive: 0x08213f }),
};

export interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Object3D; // tip of the barrel
  rightHand: THREE.Vector3; // grip position in gun space
  leftHand: THREE.Vector3; // foregrip position
  adsOffset: THREE.Vector3; // viewmodel position when aiming down sights
  hipOffset: THREE.Vector3;
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.x = rx;
  mesh.castShadow = false;
  g.add(mesh);
  return mesh;
}
const part = (g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) => add(g, box, m, x, y, z, sx, sy, sz, rx);
const tube = (g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, r: number, len: number) => add(g, cyl, m, x, y, z, r, r, len);

/**
 * Procedural guns, modelled pointing down -z with the grip near the origin. Real-world proportions in metres.
 * Used for both the first-person viewmodel and the third-person hand-held weapon of bots.
 */
export function buildGun(id: WeaponId): GunModel {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let rightHand = new THREE.Vector3(0, -0.05, 0.02);
  let leftHand = new THREE.Vector3(0, -0.04, -0.28);
  let hip = new THREE.Vector3(0.2, -0.2, -0.42);
  let ads = new THREE.Vector3(0, -0.108, -0.36);
  switch (id) {
    case 'pistol':
      part(g, mats.metal, 0, 0.02, -0.08, 0.034, 0.05, 0.24); // slide
      part(g, mats.dark, 0, -0.005, -0.06, 0.03, 0.025, 0.2); // frame
      part(g, mats.poly, 0, -0.07, 0.02, 0.032, 0.11, 0.05, -0.2); // grip
      part(g, mats.dark, 0, 0.05, 0.03, 0.01, 0.014, 0.01); // rear sight
      part(g, mats.dark, 0, 0.05, -0.19, 0.008, 0.014, 0.01); // front sight
      muzzle.position.set(0, 0.02, -0.21);
      rightHand = new THREE.Vector3(0, -0.07, 0.03);
      leftHand = new THREE.Vector3(-0.02, -0.08, 0.01);
      hip = new THREE.Vector3(0.17, -0.17, -0.35);
      ads = new THREE.Vector3(0, -0.092, -0.3);
      break;
    case 'rifle':
      part(g, mats.metal, 0, 0.02, -0.14, 0.055, 0.085, 0.36); // receiver
      part(g, mats.poly, 0, 0.012, -0.5, 0.058, 0.07, 0.3); // handguard
      tube(g, mats.steel, 0, 0.022, -0.78, 0.011, 0.26); // barrel
      tube(g, mats.dark, 0, 0.022, -0.93, 0.017, 0.07); // flash hider
      part(g, mats.poly, 0, -0.01, 0.2, 0.05, 0.1, 0.26); // stock
      part(g, mats.poly, 0, -0.09, 0.02, 0.035, 0.11, 0.05, -0.25); // grip
      part(g, mats.dark, 0.0, -0.1, -0.2, 0.04, 0.17, 0.07, 0.15); // magazine
      part(g, mats.dark, 0, 0.075, -0.1, 0.02, 0.025, 0.18); // top rail
      part(g, mats.dark, 0, 0.098, -0.02, 0.012, 0.03, 0.012); // rear sight
      part(g, mats.dark, 0, 0.093, -0.7, 0.008, 0.035, 0.01); // front sight
      muzzle.position.set(0, 0.022, -0.97);
      rightHand = new THREE.Vector3(0, -0.08, 0.02);
      leftHand = new THREE.Vector3(0, -0.035, -0.5);
      hip = new THREE.Vector3(0.2, -0.21, -0.38);
      ads = new THREE.Vector3(0, -0.105, -0.3);
      break;
    case 'smg':
      part(g, mats.metal, 0, 0.02, -0.1, 0.055, 0.08, 0.28);
      part(g, mats.poly, 0, 0.008, -0.34, 0.052, 0.06, 0.2);
      tube(g, mats.steel, 0, 0.02, -0.52, 0.01, 0.12);
      tube(g, mats.dark, 0, 0.02, -0.6, 0.019, 0.1); // suppressor
      part(g, mats.poly, 0, -0.085, 0.02, 0.035, 0.1, 0.05, -0.2);
      part(g, mats.dark, 0, -0.13, -0.12, 0.032, 0.22, 0.05); // long mag
      part(g, mats.dark, 0, 0.0, 0.17, 0.02, 0.05, 0.16); // wire stock
      part(g, mats.dark, 0, 0.066, -0.1, 0.014, 0.022, 0.14);
      muzzle.position.set(0, 0.02, -0.66);
      rightHand = new THREE.Vector3(0, -0.08, 0.02);
      leftHand = new THREE.Vector3(0, -0.08, -0.3);
      hip = new THREE.Vector3(0.19, -0.2, -0.36);
      ads = new THREE.Vector3(0, -0.095, -0.28);
      break;
    case 'shotgun':
      part(g, mats.metal, 0, 0.02, -0.12, 0.06, 0.085, 0.3); // receiver
      tube(g, mats.steel, 0, 0.03, -0.62, 0.021, 0.7); // barrel
      tube(g, mats.dark, 0, -0.012, -0.5, 0.019, 0.5); // magazine tube
      part(g, mats.wood, 0, -0.005, -0.5, 0.06, 0.055, 0.2); // pump
      part(g, mats.wood, 0, -0.015, 0.2, 0.05, 0.11, 0.34, 0.08); // stock
      part(g, mats.wood, 0, -0.09, 0.02, 0.034, 0.1, 0.05, -0.25);
      part(g, mats.steel, 0, 0.058, -0.93, 0.01, 0.015, 0.012); // bead sight
      muzzle.position.set(0, 0.03, -0.98);
      rightHand = new THREE.Vector3(0, -0.075, 0.02);
      leftHand = new THREE.Vector3(0, -0.01, -0.5);
      hip = new THREE.Vector3(0.2, -0.21, -0.4);
      ads = new THREE.Vector3(0, -0.1, -0.3);
      break;
    case 'sniper':
      part(g, mats.metal, 0, 0.02, -0.12, 0.05, 0.08, 0.4);
      tube(g, mats.steel, 0, 0.025, -0.78, 0.014, 0.8); // long barrel
      tube(g, mats.dark, 0, 0.025, -1.2, 0.02, 0.1); // muzzle brake
      part(g, mats.sand, 0, -0.012, 0.22, 0.056, 0.12, 0.38, 0.05); // stock
      part(g, mats.sand, 0, -0.01, -0.5, 0.055, 0.06, 0.34); // forend
      part(g, mats.poly, 0, -0.09, 0.0, 0.034, 0.11, 0.05, -0.2);
      part(g, mats.dark, 0, -0.07, -0.18, 0.035, 0.1, 0.07); // box mag
      tube(g, mats.dark, 0, 0.115, -0.15, 0.036, 0.34); // scope body
      tube(g, mats.dark, 0, 0.115, -0.33, 0.046, 0.07); // objective bell
      tube(g, mats.dark, 0, 0.115, 0.03, 0.042, 0.06); // eyepiece
      add(g, new THREE.CircleGeometry(0.04, 12), mats.lens, 0, 0.115, -0.368, 1, 1, 1);
      part(g, mats.dark, 0, 0.075, -0.07, 0.014, 0.035, 0.014);
      part(g, mats.dark, 0, 0.075, -0.26, 0.014, 0.035, 0.014);
      part(g, mats.steel, 0.045, 0.03, 0.0, 0.012, 0.012, 0.07); // bolt handle
      muzzle.position.set(0, 0.025, -1.27);
      rightHand = new THREE.Vector3(0, -0.08, 0.0);
      leftHand = new THREE.Vector3(0, -0.04, -0.46);
      hip = new THREE.Vector3(0.21, -0.22, -0.34);
      ads = new THREE.Vector3(0, -0.14, -0.2);
      break;
  }
  g.add(muzzle);
  return { group: g, muzzle, rightHand, leftHand, adsOffset: ads, hipOffset: hip };
}

export function disposeGunShared() {
  // Geometries and materials above are module-level singletons shared by every gun instance and live for the app lifetime.
}
