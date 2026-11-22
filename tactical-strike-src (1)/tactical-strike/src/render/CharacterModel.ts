import * as THREE from 'three';
import type { Character } from '../entities/Character';
import type { Appearance } from '../characters/roster';
import { buildGun, type GunModel } from './WeaponModels';
import type { WeaponId } from '../core/types';

const boxG = new THREE.BoxGeometry(1, 1, 1);
const sphG = new THREE.SphereGeometry(1, 14, 10);
const halfG = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 12);
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const mat = (hex: number, rough = 0.85, metal = 0) => {
  const k = hex * 10 + Math.round(metal * 3) + Math.round(rough * 5) * 1000000000;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal })));
  return m;
};
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const flashGeo = new THREE.PlaneGeometry(1, 1);

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = shadow;
  parent.add(o);
  return o;
}

function nameSprite(name: string, color: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!;
  g.font = 'bold 34px "Bahnschrift","Arial Narrow",sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(40, 8, 176, 46);
  g.fillStyle = color;
  g.fillText(name, 128, 45);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sp.scale.set(1.0, 0.25, 1);
  sp.renderOrder = 20;
  return sp;
}

/** Third-person soldier built from primitives: legs, torso, vest, head + headgear, arms holding a gun. Animated procedurally. */
export class CharacterModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // yaw-rotated, lowered when dead
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private upper = new THREE.Group(); // torso + arms, pitch aims here
  private aimPivot = new THREE.Group();
  private guns = new Map<WeaponId, GunModel>();
  private curGun: WeaponId | null = null;
  private flash: THREE.Mesh;
  private flashT = 0;
  private phase = Math.random() * 6;
  private deadT = 0;
  private tag: THREE.Sprite | null = null;
  private disposables: THREE.Material[] = [];

  constructor(readonly c: Character, friendly: boolean) {
    const a: Appearance = c.appearance;
    const sc = a.scale;
    this.root.add(this.body);
    this.body.rotation.order = 'YXZ';
    this.body.scale.setScalar(sc);

    const uniform = mat(a.uniform), pants = mat(a.pants), vest = mat(a.vest, 0.7, 0.1), skin = mat(a.skin, 0.7), accent = mat(a.accent, 0.5), boot = mat(0x151515, 0.9);

    // legs pivot at the hip
    for (const [leg, x] of [[this.legL, -0.11], [this.legR, 0.11]] as const) {
      leg.position.set(x, 0.92, 0);
      mesh(leg, boxG, pants, 0, -0.42, 0, 0.17, 0.84, 0.2);
      mesh(leg, boxG, boot, 0, -0.84, -0.03, 0.18, 0.12, 0.3);
      mesh(leg, boxG, mat(a.vest, 0.8), 0, -0.45, -0.1, 0.18, 0.2, 0.04); // knee pad
      this.body.add(leg);
    }
    // upper body
    this.upper.position.set(0, 0.95, 0);
    this.body.add(this.upper);
    mesh(this.upper, boxG, uniform, 0, 0.27, 0, 0.42, 0.55, 0.24); // torso
    mesh(this.upper, boxG, vest, 0, 0.3, 0, 0.46, 0.4, 0.29); // plate carrier
    mesh(this.upper, boxG, mat(0x1a1a1a), 0, 0.2, -0.16, 0.34, 0.12, 0.06); // chest pouches
    mesh(this.upper, boxG, accent, 0, 0.42, -0.151, 0.18, 0.05, 0.01, false); // team stripe on the vest
    mesh(this.upper, boxG, pants, 0, 0.0, 0, 0.4, 0.14, 0.26); // belt
    // head
    mesh(this.upper, boxG, skin, 0, 0.64, 0, 0.1, 0.12, 0.1); // neck
    const head = new THREE.Group();
    head.position.set(0, 0.74, 0);
    this.upper.add(head);
    mesh(head, sphG, skin, 0, 0, 0, 0.115, 0.14, 0.12);
    this.headgear(head, a);
    // arms: both hold the gun out front. aimPivot rotates with pitch.
    this.aimPivot.position.set(0, 0.5, -0.05);
    this.upper.add(this.aimPivot);
    for (const s of [-1, 1]) {
      mesh(this.upper, boxG, uniform, s * 0.27, 0.42, 0, 0.12, 0.3, 0.13); // shoulder/upper arm
      mesh(this.upper, boxG, accent, s * 0.27, 0.5, 0, 0.125, 0.05, 0.135, false); // armband
    }
    const fa = (s: number, z: number, x: number) => {
      const m = mesh(this.aimPivot, boxG, uniform, x, -0.14, z, 0.1, 0.1, 0.34);
      m.rotation.set(0, s * 0.18, 0);
      mesh(this.aimPivot, boxG, skin, x * 0.9, -0.14, z - 0.2, 0.085, 0.085, 0.09);
    };
    fa(1, -0.28, 0.12);
    fa(-1, -0.4, -0.08);

    this.flash = new THREE.Mesh(flashGeo, flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 5;
    this.aimPivot.add(this.flash);
    this.setGun(c.weapon);

    if (friendly && !c.isPlayer) {
      this.tag = nameSprite(c.name, c.team === 'blue' ? '#7cc4ff' : '#ff8a7a');
      this.tag.position.set(0, 2.15, 0);
      this.root.add(this.tag);
    }
  }

  private headgear(head: THREE.Group, a: Appearance) {
    const hg = mat(a.headgearColor, 0.6, 0.15);
    switch (a.headgear) {
      case 'helmet':
        mesh(head, halfG, hg, 0, 0.02, 0, 0.145, 0.15, 0.15);
        mesh(head, boxG, hg, 0, 0.03, 0.0, 0.3, 0.025, 0.22, false); // rim
        if (a.visor) mesh(head, boxG, mat(0x0a0f14, 0.2, 0.8), 0, -0.01, -0.12, 0.2, 0.06, 0.03, false);
        mesh(head, boxG, mat(0x111111), 0.15, 0.0, 0, 0.03, 0.06, 0.07, false); // comms
        break;
      case 'cap':
        mesh(head, halfG, hg, 0, 0.03, 0, 0.13, 0.12, 0.135);
        mesh(head, boxG, hg, 0, 0.035, -0.13, 0.2, 0.02, 0.12, false);
        break;
      case 'beanie':
        mesh(head, halfG, hg, 0, 0.0, 0, 0.13, 0.15, 0.13);
        break;
      case 'bandana':
        mesh(head, cylG, hg, 0, 0.06, 0, 0.125, 0.06, 0.13, false);
        mesh(head, boxG, hg, 0, -0.07, -0.1, 0.18, 0.1, 0.03, false);
        break;
      case 'hood':
        mesh(head, sphG, hg, 0, 0.02, 0.03, 0.155, 0.17, 0.16);
        mesh(head, boxG, mat(0x0d0d0d), 0, -0.01, -0.12, 0.14, 0.1, 0.03, false);
        break;
    }
  }

  private setGun(id: WeaponId) {
    if (this.curGun === id) return;
    if (this.curGun) this.guns.get(this.curGun)!.group.visible = false;
    let g = this.guns.get(id);
    if (!g) {
      g = buildGun(id);
      g.group.position.set(0.1, -0.1, -0.08);
      g.group.scale.setScalar(0.95);
      g.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      this.aimPivot.add(g.group);
      this.guns.set(id, g);
    }
    g.group.visible = true;
    this.curGun = id;
    // Place the muzzle flash at the barrel tip
    const mz = g.muzzle.position;
    this.flash.position.set(g.group.position.x + mz.x * 0.95, g.group.position.y + mz.y * 0.95, g.group.position.z + mz.z * 0.95 - 0.12);
  }

  fireFlash() {
    this.flashT = 0.055;
    this.flash.visible = true;
    const s = 0.28 + Math.random() * 0.22;
    this.flash.scale.set(s, s, s);
    this.flash.rotation.z = Math.random() * 6;
  }

  /** World position of the gun muzzle for tracers. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const g = this.guns.get(this.curGun!);
    if (!g) return out.set(this.c.pos.x, this.c.pos.y + 1.4, this.c.pos.z);
    g.muzzle.getWorldPosition(out);
    return out;
  }

  update(dt: number) {
    const c = this.c;
    this.root.position.set(c.pos.x, c.pos.y, c.pos.z);
    this.setGun(c.weapon);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    if (c.alive) {
      this.deadT = Math.max(0, this.deadT - dt * 4);
      this.body.rotation.y = c.yaw;
      const sp = Math.min(c.speed, 7);
      this.phase += sp * dt * 1.55;
      const amp = Math.min(1, sp / 3.8) * 0.85;
      this.legL.rotation.x = Math.sin(this.phase) * amp;
      this.legR.rotation.x = -Math.sin(this.phase) * amp;
      this.upper.rotation.x = 0;
      this.upper.position.y = 0.95 + Math.abs(Math.sin(this.phase)) * 0.025 * Math.min(1, sp / 4);
      this.upper.rotation.z = Math.sin(this.phase) * 0.03 * Math.min(1, sp / 4);
      this.aimPivot.rotation.x = c.pitch * 0.9 - (c.reloadLeft > 0 ? 0.35 : 0);
      this.aimPivot.rotation.z = c.reloadLeft > 0 ? 0.25 : 0;
      this.body.position.y = 0;
      this.body.rotation.x = 0;
    } else {
      // Fall backwards and lie on the ground.
      this.deadT = Math.min(1, this.deadT + dt * 3.2);
      const e = 1 - (1 - this.deadT) ** 2;
      this.body.rotation.y = c.yaw;
      this.body.rotation.x = 1.45 * e;
      this.body.position.y = 0.12 * e;
      this.legL.rotation.x = 0.2 * e;
      this.legR.rotation.x = -0.15 * e;
      this.aimPivot.rotation.x = 0.4 * e;
    }
    if (this.tag) this.tag.visible = c.alive;
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  dispose() {
    // Geometries/materials are shared module-level caches; only the name tag texture is per-instance.
    if (this.tag) {
      (this.tag.material as THREE.SpriteMaterial).map?.dispose();
      this.tag.material.dispose();
    }
    this.root.removeFromParent();
    for (const m of this.disposables) m.dispose();
  }
}
