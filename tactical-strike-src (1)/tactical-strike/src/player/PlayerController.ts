import * as THREE from 'three';
import type { Match } from '../game/Match';
import { WEAPONS, weaponByKey, WEAPON_ORDER } from '../weapons/weapons';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { stepBody, WALK_SPEED, SPRINT_SPEED } from '../physics/movement';
import { EYE_HEIGHT } from '../entities/Character';
import { store } from '../core/Settings';

const DEG = Math.PI / 180;
const MOUSE_RAD = 0.0022; // radians per pixel at sensitivity 1

/** Keyboard + mouse (pointer lock) control of the human player. */
export class PlayerController {
  private keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  private lmb = false;
  private clicked = false;
  private rmb = false;
  active = false; // true while pointer locked and playing
  adsT = 0;
  private recoilTotal = 0;
  private sinceShot = 1;
  private bobT = 0;
  private bobAmp = 0;
  private fovCur = 78;
  wheelQueue = 0;

  constructor(private match: Match, private dom: HTMLElement) {
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mousedown', this.onDown);
    document.addEventListener('mouseup', this.onUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.releaseAll);
    dom.addEventListener('contextmenu', this.noMenu);
  }

  private noMenu = (e: Event) => e.preventDefault();
  private releaseAll = () => {
    this.keys.clear();
    this.lmb = this.rmb = false;
  };
  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    const p = this.match.player;
    if (e.code === 'KeyR' && p.alive) WeaponSystem.startReload(p, this.match);
    if (/^Digit[1-5]$/.test(e.code) && p.alive) {
      const w = weaponByKey(Number(e.code[5]));
      if (w) WeaponSystem.switchTo(p, w, this.match);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMove = (e: MouseEvent) => {
    if (!this.active) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };
  private onDown = (e: MouseEvent) => {
    if (!this.active) return;
    if (e.button === 0) { this.lmb = true; this.clicked = true; }
    if (e.button === 2) this.rmb = true;
  };
  private onUp = (e: MouseEvent) => {
    if (e.button === 0) this.lmb = false;
    if (e.button === 2) this.rmb = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    this.wheelQueue += Math.sign(e.deltaY);
  };

  setActive(a: boolean) {
    this.active = a;
    if (!a) { this.releaseAll(); this.dx = this.dy = 0; }
  }

  /** Where the player's weapon is currently aimed (for spread/crosshair UI). */
  get moving() {
    return this.match.player.speed > 0.5;
  }

  update(dt: number) {
    const m = this.match;
    const p = m.player;
    const settings = store.settings;
    const wdef = WEAPONS[p.weapon];
    const playing = m.state === 'playing';

    // ---- look (allowed during the countdown too)
    if (p.alive && this.active) {
      const zoomFactor = this.adsT > 0.5 ? (wdef.scoped ? wdef.scopeFov / settings.fov : wdef.adsFovMul) : 1;
      const k = MOUSE_RAD * settings.sensitivity * Math.max(0.25, zoomFactor + (1 - zoomFactor) * (1 - this.adsT));
      p.yaw -= this.dx * k;
      p.pitch -= this.dy * k;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    }
    this.dx = this.dy = 0;

    let wx = 0, wz = 0, jump = false, speed = WALK_SPEED;
    if (p.alive && playing && this.active) {
      // ---- weapon switching with the wheel
      if (this.wheelQueue !== 0) {
        const i = WEAPON_ORDER.indexOf(p.weapon);
        const n = (i + this.wheelQueue + WEAPON_ORDER.length * 8) % WEAPON_ORDER.length;
        WeaponSystem.switchTo(p, WEAPON_ORDER[n], m);
        this.wheelQueue = 0;
      }
      // ---- movement
      let f = 0, s = 0;
      if (this.keys.has('KeyW')) f += 1;
      if (this.keys.has('KeyS')) f -= 1;
      if (this.keys.has('KeyD')) s += 1;
      if (this.keys.has('KeyA')) s -= 1;
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      // forward = (-sin, -cos); right = (cos, -sin)
      wx = -sin * f + cos * s;
      wz = -cos * f - sin * s;
      const l = Math.hypot(wx, wz);
      if (l > 1) { wx /= l; wz /= l; }
      const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && f > 0 && !this.rmb && p.reloadLeft <= 0;
      speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * wdef.moveMul * (this.adsT > 0.5 ? 0.62 : 1);
      jump = this.keys.has('Space');

      // ---- aim down sights
      const wantAds = this.rmb && !sprinting && p.switchLeft <= 0 && p.reloadLeft <= 0;
      this.adsT += ((wantAds ? 1 : 0) - this.adsT) * Math.min(1, dt * (wdef.scoped ? 9 : 12));
      if (!wantAds && this.adsT < 0.01) this.adsT = 0;

      // ---- shooting
      const wantFire = wdef.auto ? this.lmb : this.clicked;
      if (wantFire) {
        const wasMag = p.ammo.mag;
        const fired = WeaponSystem.fire(p, m, this.adsT > 0.6, 1, 1);
        if (fired) { this.sinceShot = 0; if (wdef.scoped) this.rmbCooldown(); }
        else if (wasMag === 0 && this.clicked) { /* dry fire click already emitted */ }
      }
    } else {
      this.adsT += (0 - this.adsT) * Math.min(1, dt * 12);
    }
    this.clicked = false;

    if (m.state === 'playing' || !p.alive) stepBody(p, wx, wz, speed, jump, dt);

    // ---- recoil: apply kick to the view, then recover part of it when not firing
    const kick = p.recoilKick;
    p.recoilKick = 0;
    if (kick > 0) {
      p.pitch += kick * DEG * (this.adsT > 0.5 ? 0.7 : 1);
      p.yaw += (Math.random() - 0.5) * 2 * wdef.recoilYaw * kick * DEG * 0.8;
      this.recoilTotal += kick;
    }
    this.sinceShot += dt;
    if (this.sinceShot > 0.09 && this.recoilTotal > 0) {
      const rec = Math.min(this.recoilTotal, (6 + this.recoilTotal * 3) * dt);
      p.pitch -= rec * DEG;
      this.recoilTotal -= rec;
    }
    if (!p.alive) { this.recoilTotal = 0; }

    // ---- head bob
    const mv = Math.min(1, p.speed / 5) * (p.grounded ? 1 : 0);
    this.bobAmp += (mv - this.bobAmp) * Math.min(1, dt * 8);
    this.bobT += dt * p.speed * 1.9;
  }

  private rmbCooldown() {
    /* sniper stays scoped between shots; the bolt cycle is handled by the weapon's fire rate */
  }

  /** Current fov for the main camera (ADS zoom / scope). */
  fov(): number {
    const base = store.settings.fov;
    const wdef = WEAPONS[this.match.player.weapon];
    const target = wdef.scoped ? base + (wdef.scopeFov - base) * this.adsT : base * (1 + (wdef.adsFovMul - 1) * this.adsT);
    this.fovCur = target;
    return target;
  }

  get scoped() {
    return WEAPONS[this.match.player.weapon].scoped && this.adsT > 0.88;
  }

  /** Writes the first-person camera pose. */
  applyCamera(cam: THREE.PerspectiveCamera) {
    const p = this.match.player;
    const bob = this.bobAmp * (1 - this.adsT * 0.8);
    cam.position.set(p.pos.x, p.pos.y + EYE_HEIGHT + Math.sin(this.bobT * 2) * 0.018 * bob, p.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, Math.sin(this.bobT) * 0.004 * bob);
  }

  dispose() {
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mousedown', this.onDown);
    document.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.releaseAll);
    this.dom.removeEventListener('contextmenu', this.noMenu);
  }
}
