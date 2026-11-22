import * as THREE from 'three';
import type { WeaponId } from '../core/types';
import { WEAPON_ORDER, WEAPONS } from '../weapons/weapons';
import { buildGun, type GunModel } from './WeaponModels';
import type { Character } from '../entities/Character';

const box = new THREE.BoxGeometry(1, 1, 1);
const DEG = Math.PI / 180;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _rh = new THREE.Vector3();
const _lh = new THREE.Vector3();
const Y = new THREE.Vector3(0, 0, 1);

function stretch(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, thick: number) {
  _mid.addVectors(from, to).multiplyScalar(0.5);
  m.position.copy(_mid);
  _a.subVectors(to, from);
  const len = _a.length();
  m.scale.set(thick, thick, len);
  _q.setFromUnitVectors(Y, _a.normalize());
  m.quaternion.copy(_q);
}

/**
 * First-person weapon rendered in its own scene/camera (drawn after the world with a cleared depth buffer,
 * so it never clips into walls). Handles bob, sway, recoil, reload, switch, sprint and aim-down-sights animation.
 */
export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  private guns = new Map<WeaponId, GunModel>();
  private rig = new THREE.Group();
  private armR: THREE.Mesh;
  private armL: THREE.Mesh;
  private handR: THREE.Mesh;
  private handL: THREE.Mesh;
  private flash: THREE.Mesh;
  private flashT = 0;
  private cur: WeaponId = 'rifle';
  private bobT = 0;
  private kickZ = 0;
  private kickRot = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private raise = 1; // 1 = lowered, 0 = ready (weapon switch)
  private reloadT = -1;
  private reloadDur = 1;
  visible = true;
  private lights: THREE.Light[] = [];

  constructor() {
    this.scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x4a4030, 1.15);
    const dir = new THREE.DirectionalLight(0xfff0dc, 2.2);
    dir.position.set(0.6, 1, 0.8);
    this.scene.add(hemi, dir);
    this.lights.push(hemi, dir);
    this.camera.add(this.rig);
    this.rig.position.set(0, 0, 0);

    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c5aa0, roughness: 0.85 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 });
    this.armR = new THREE.Mesh(box, sleeve);
    this.armL = new THREE.Mesh(box, sleeve);
    this.handR = new THREE.Mesh(box, glove);
    this.handL = new THREE.Mesh(box, glove);
    this.handR.scale.set(0.075, 0.075, 0.1);
    this.handL.scale.set(0.075, 0.075, 0.1);
    this.rig.add(this.armR, this.armL, this.handR, this.handL);

    for (const id of WEAPON_ORDER) {
      const g = buildGun(id);
      g.group.visible = false;
      g.group.scale.setScalar(0.8);
      for (const v of [g.rightHand, g.leftHand, g.adsOffset, g.hipOffset]) v.set(v.x, v.y, v.z);
      this.rig.add(g.group);
      this.guns.set(id, g);
    }
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.visible = false;
    this.rig.add(this.flash);
    this.setWeapon('rifle');
  }

  setAspect(a: number, fov: number) {
    this.camera.aspect = a;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(id: WeaponId) {
    this.guns.get(this.cur)!.group.visible = false;
    this.cur = id;
    this.guns.get(id)!.group.visible = true;
  }

  onSwitch(id: WeaponId) {
    this.setWeapon(id);
    this.raise = 1;
    this.reloadT = -1;
  }
  onReload(dur: number) {
    this.reloadT = 0;
    this.reloadDur = dur;
  }
  onShot() {
    const d = WEAPONS[this.cur];
    this.kickZ = Math.min(0.16, this.kickZ + 0.015 + d.recoil * 0.012);
    this.kickRot = Math.min(0.25, this.kickRot + 0.012 + d.recoil * 0.014);
    this.flashT = 0.045;
    this.flash.visible = this.cur !== 'sniper' || true;
    this.flash.rotation.z = Math.random() * 6;
    const s = this.cur === 'shotgun' ? 1.8 : this.cur === 'pistol' ? 0.9 : 1.2;
    this.flash.scale.setScalar(s * (0.8 + Math.random() * 0.5));
  }

  /** World-space muzzle position (for tracers) based on the viewmodel's current pose. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.camera.updateMatrixWorld(true);
    this.guns.get(this.cur)!.muzzle.getWorldPosition(out);
    return out;
  }

  update(dt: number, c: Character, adsT: number, scoped: boolean, mainCam: THREE.Camera, aspectFov: { aspect: number; fov: number }) {
    const gun = this.guns.get(this.cur)!;
    const def = WEAPONS[this.cur];
    this.setAspect(aspectFov.aspect, aspectFov.fov);
    this.visible = c.alive && !(scoped && adsT > 0.88);

    // recover animation states
    this.kickZ += (0 - this.kickZ) * Math.min(1, dt * 14);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 12);
    this.raise = Math.max(0, this.raise - dt * 3.4);
    // sway follows view change
    const dyaw = ((c.yaw - this.lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const dpitch = c.pitch - this.lastPitch;
    this.lastYaw = c.yaw;
    this.lastPitch = c.pitch;
    const swayAmt = 1 - adsT * 0.8;
    this.swayX += (-dyaw * 1.2 * swayAmt - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 1.2 * swayAmt - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.08, Math.min(0.08, this.swayX));
    this.swayY = Math.max(-0.06, Math.min(0.06, this.swayY));

    const moving = Math.min(1, c.speed / 4.5) * (c.grounded ? 1 : 0);
    this.bobT += dt * (c.speed > 5.2 ? 11 : 8) * moving;
    const bobAmt = moving * (1 - adsT * 0.85);
    const bx = Math.sin(this.bobT) * 0.012 * bobAmt;
    const by = Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt - 0.004 * bobAmt;
    const sprint = c.speed > 5.3 && adsT < 0.1 ? 1 : 0;

    // pose: lerp between hip and ADS positions
    const px = gun.hipOffset.x + (gun.adsOffset.x - gun.hipOffset.x) * adsT;
    const py = gun.hipOffset.y + (gun.adsOffset.y - gun.hipOffset.y) * adsT;
    const pz = gun.hipOffset.z + (gun.adsOffset.z - gun.hipOffset.z) * adsT;
    let rx = this.kickRot * (1 - adsT * 0.4);
    let ry = 0;
    let rz = 0;
    let ox = 0, oy = 0, oz = this.kickZ;
    // reload: dip, tilt, and come back (mag swap in the middle)
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const k = Math.min(1, this.reloadT / this.reloadDur);
      const dip = Math.sin(Math.min(1, k) * Math.PI);
      const e = Math.min(1, dip * 1.6);
      oy -= 0.14 * e;
      rx -= 0.5 * e;
      rz += 0.45 * e;
      ox -= 0.03 * e;
      if (k >= 1) this.reloadT = -1;
    }
    oy -= this.raise * 0.35;
    rx -= this.raise * 0.8;
    if (sprint) {
      ox -= 0.06; oy -= 0.05; rx += -0.35; ry += 0.45;
    }
    this.rig.position.set(px + ox + bx + this.swayX * 0.6, py + oy + by + this.swayY * 0.5, pz + oz);
    this.rig.rotation.set(rx + this.swayY * 0.8, ry + this.swayX * 0.9, rz);

    // hands and arms
    this.rig.updateMatrixWorld(true);
    const rh = _rh.copy(gun.rightHand).multiplyScalar(0.8), lh = _lh.copy(gun.leftHand).multiplyScalar(0.8);
    this.handR.position.copy(rh);
    this.handL.position.copy(lh);
    // gun-space is the rig's local space (the gun group has identity transform)
    stretch(this.armR, new THREE.Vector3(0.3, -0.45, 0.5), rh, 0.085);
    stretch(this.armL, new THREE.Vector3(-0.3, -0.45, 0.35), this.handL.position.copy(lh), 0.085);
    this.handR.rotation.set(0, 0, 0);
    this.handL.rotation.set(0, 0, 0);
    // Left hand rolls with reload (reaching for the magazine)
    if (this.reloadT >= 0) {
      const k = this.reloadT / this.reloadDur;
      const t = Math.sin(Math.min(1, k) * Math.PI);
      this.handL.position.set(lh.x - 0.03, lh.y - 0.1 * t, lh.z + 0.25 * t);
    }

    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    this.flash.position.copy(gun.muzzle.position).multiplyScalar(0.8).add(new THREE.Vector3(0, 0, -0.07));
    this.flash.quaternion.copy(this.camera.quaternion);
    void def; void mainCam;
  }

  /** Render order: main scene is drawn first by the caller, then this on top. */
  dispose() {
    this.flash.geometry.dispose();
    (this.flash.material as THREE.Material).dispose();
  }
}

export const VIEWMODEL_FOV = 58;
export { DEG };
