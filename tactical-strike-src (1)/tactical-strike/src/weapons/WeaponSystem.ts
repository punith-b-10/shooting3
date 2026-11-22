import * as THREE from 'three';
import { WEAPONS } from './weapons';
import type { WeaponId } from '../core/types';
import type { Character } from '../entities/Character';
import type { Match } from '../game/Match';

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** Ammo, firing, reloading and weapon switching — shared by the player and every bot. */
export const WeaponSystem = {
  update(c: Character, dt: number, match: Match) {
    if (c.fireCooldown > 0) c.fireCooldown -= dt;
    if (c.switchLeft > 0) c.switchLeft -= dt;
    c.bloom = Math.max(0, c.bloom - dt * 2.2);
    if (c.reloadLeft > 0) {
      c.reloadLeft -= dt;
      if (c.reloadLeft <= 0) {
        c.reloadLeft = 0;
        const d = WEAPONS[c.weapon];
        const a = c.ammo;
        const take = Math.min(d.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        match.events.emit('reloadEnd', { c });
      }
    }
  },

  canFire(c: Character): boolean {
    return c.alive && c.fireCooldown <= 0 && c.reloadLeft <= 0 && c.switchLeft <= 0;
  },

  startReload(c: Character, match: Match): boolean {
    const d = WEAPONS[c.weapon];
    const a = c.ammo;
    if (c.reloadLeft > 0 || a.mag >= d.mag || a.reserve <= 0 || c.switchLeft > 0) return false;
    c.reloadLeft = d.reload;
    match.events.emit('reloadStart', { c });
    return true;
  },

  switchTo(c: Character, id: WeaponId, match: Match): boolean {
    if (id === c.weapon || !c.arsenal[id]) return false;
    c.weapon = id;
    c.reloadLeft = 0;
    c.switchLeft = 0.38;
    c.fireCooldown = Math.max(c.fireCooldown, 0.2);
    match.events.emit('switched', { c });
    return true;
  },

  /** Current cone half-angle (degrees) before random spread is applied. */
  spreadDeg(c: Character, ads: boolean, spreadMul = 1): number {
    const d = WEAPONS[c.weapon];
    let s = ads ? d.spreadAds : d.spreadHip;
    s *= 1 + Math.min(c.speed, 7) * (ads ? 0.1 : 0.14);
    if (!c.grounded) s *= 2.4;
    s += c.bloom * (d.spreadHip * 0.35);
    return s * spreadMul;
  },

  /**
   * Fire the current weapon along the character's view. `aim` overrides the direction (the player's camera passes
   * its own); otherwise yaw/pitch are used. Returns true when a shot was actually fired.
   */
  fire(c: Character, match: Match, ads: boolean, spreadMul = 1, dmgMul = 1): boolean {
    if (!this.canFire(c)) return false;
    const d = WEAPONS[c.weapon];
    const a = c.ammo;
    if (a.mag <= 0) {
      c.fireCooldown = 0.25;
      match.events.emit('dryFire', { c });
      this.startReload(c, match);
      return false;
    }
    a.mag--;
    c.fireCooldown = 60 / d.rpm;
    c.bloom = Math.min(3, c.bloom + 1);
    if (c.isPlayer) c.recoilKick += d.recoil;

    c.eye(_eye);
    c.forward(_dir);
    _right.crossVectors(_dir, UP).normalize();
    _up.crossVectors(_right, _dir).normalize();
    const spread = this.spreadDeg(c, ads, spreadMul);

    // muzzle: a little forward/right/down of the eye
    _muzzle.copy(_eye).addScaledVector(_dir, 0.7).addScaledVector(_right, 0.18).addScaledVector(_up, -0.16);
    match.events.emit('shot', { shooter: c, weapon: c.weapon, muzzle: _muzzle });
    match.noise(c, d.id === 'pistol' ? 38 : d.id === 'sniper' ? 80 : 55);

    for (let i = 0; i < d.pellets; i++) {
      // Uniform point in a disc -> direction offset
      const r = Math.sqrt(Math.random()) * spread * DEG;
      const th = Math.random() * Math.PI * 2;
      const ox = Math.cos(th) * r;
      const oy = Math.sin(th) * r;
      const dir = new THREE.Vector3().copy(_dir).addScaledVector(_right, ox).addScaledVector(_up, oy).normalize();
      match.combat.hitscan(c, _eye, dir, _muzzle, d, dmgMul);
    }

    if (a.mag === 0) this.startReload(c, match);
    return true;
  },
};
