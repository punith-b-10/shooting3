import * as THREE from 'three';
import type { WeaponDef } from '../weapons/weapons';
import type { WeaponId } from '../core/types';
import type { Character } from '../entities/Character';
import type { Match } from './Match';
import { BARREL_HEIGHT, BARREL_RADIUS } from '../maps/MapPhysics';

export const HEAD_RADIUS = 0.21;
export const HEAD_Y = 1.62;
export const BODY_RADIUS = 0.34;
export const BODY_TOP = 1.42;
export const EXPLOSION_RADIUS = 6;

const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Ray vs sphere: returns the entry distance or -1. */
function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c < 0 ? 0 : -1;
}

/** Ray vs finite vertical cylinder (no caps), returns entry distance or -1. */
function rayCylinder(o: THREE.Vector3, d: THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number): number {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / a, (-b + sq) / a]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return -1;
}

export interface BarrelState {
  x: number;
  y: number;
  z: number;
  explosive: boolean;
  alive: boolean;
  hp: number;
  collider: import('@dimforge/rapier3d-compat').Collider;
  fuse: number; // >0 while a chain reaction is pending
  lastAttacker: Character | null;
}

/** Hit detection and damage. Hits are resolved with exact ray tests — bots get no extra help. */
export class Combat {
  barrels: BarrelState[] = [];
  constructor(private match: Match) {}

  hitscan(shooter: Character, eye: THREE.Vector3, dir: THREE.Vector3, muzzle: THREE.Vector3, def: WeaponDef, dmgMul: number) {
    const m = this.match;
    const range = def.range;
    const wh = m.physics.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range);
    let bestT = wh ? wh.t : range;
    let kind: 'world' | 'char' | 'barrel' | 'none' = wh ? 'world' : 'none';
    let victim: Character | null = null;
    let head = false;
    let barrel: BarrelState | null = null;
    let nx = wh ? wh.nx : 0, ny = wh ? wh.ny : 0, nz = wh ? wh.nz : 0;

    for (const b of this.barrels) {
      if (!b.alive) continue;
      const t = rayCylinder(eye, dir, b.x, b.z, BARREL_RADIUS, b.y, b.y + BARREL_HEIGHT);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = 'barrel';
        barrel = b;
        _p.copy(eye).addScaledVector(dir, t);
        nx = _p.x - b.x; ny = 0; nz = _p.z - b.z;
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      }
    }
    for (const c of m.chars) {
      if (!c.alive || c === shooter || c.team === shooter.team) continue;
      const hy = c.pos.y + HEAD_Y;
      const th = raySphere(eye, dir, c.pos.x, hy, c.pos.z, HEAD_RADIUS);
      const tb = rayCylinder(eye, dir, c.pos.x, c.pos.z, BODY_RADIUS, c.pos.y, c.pos.y + BODY_TOP);
      let t = -1, isHead = false;
      if (th >= 0 && (tb < 0 || th <= tb + 0.05)) { t = th; isHead = true; }
      else if (tb >= 0) t = tb;
      if (t >= 0 && t < bestT) {
        bestT = t; kind = 'char'; victim = c; head = isHead; barrel = null;
        _p.copy(eye).addScaledVector(dir, t);
        nx = -dir.x; ny = -dir.y; nz = -dir.z;
      }
    }

    _p.copy(eye).addScaledVector(dir, bestT);
    m.events.emit('tracer', { from: muzzle.clone(), to: _p.clone(), shooter });
    if (kind === 'none') return;
    _n.set(nx, ny, nz);
    if (kind === 'world') {
      m.events.emit('impact', { pos: _p.clone(), normal: _n.clone(), kind: 'world' });
    } else if (kind === 'barrel' && barrel) {
      m.events.emit('impact', { pos: _p.clone(), normal: _n.clone(), kind: 'world' });
      if (barrel.explosive) {
        barrel.hp -= def.damage;
        barrel.lastAttacker = shooter;
        if (barrel.hp <= 0) this.explodeBarrel(barrel);
      }
    } else if (kind === 'char' && victim) {
      m.events.emit('impact', { pos: _p.clone(), normal: _n.clone(), kind: 'flesh' });
      let dmg = def.damage * dmgMul;
      if (bestT > def.falloff) dmg *= Math.max(0.35, 1 - ((bestT - def.falloff) / Math.max(1, def.range - def.falloff)) * 0.65);
      if (head) dmg *= def.headMul;
      this.damage(victim, dmg, shooter, head, eye, def.id);
    }
  }

  damage(victim: Character, amount: number, attacker: Character | null, head: boolean, from: THREE.Vector3, weapon: WeaponId | 'explosion') {
    const m = this.match;
    if (!victim.alive || m.state === 'ended' || m.time < victim.invulnUntil) return;
    const absorbed = Math.min(victim.armor, amount * 0.5);
    victim.armor -= absorbed;
    const dealt = amount - absorbed;
    victim.health -= dealt;
    victim.lastHurtTime = m.time;
    victim.lastHurtFrom.copy(from);
    victim.lastAttacker = attacker;
    m.events.emit('hit', { attacker, victim, damage: dealt, head, from: from.clone() });
    if (victim.health <= 0) {
      victim.health = 0;
      m.kill(victim, attacker, weapon, head);
    }
  }

  explodeBarrel(b: BarrelState) {
    if (!b.alive) return;
    const m = this.match;
    b.alive = false;
    m.physics.removeCollider(b.collider);
    const pos = new THREE.Vector3(b.x, b.y + 0.6, b.z);
    m.events.emit('explosion', { pos, radius: EXPLOSION_RADIUS });
    m.noise(b.lastAttacker, 70, pos);
    for (const c of m.chars) {
      if (!c.alive) continue;
      _o.set(c.pos.x, c.pos.y + 1.0, c.pos.z);
      const d = _o.distanceTo(pos);
      if (d > EXPLOSION_RADIUS) continue;
      if (!m.physics.clearLine(pos, _o)) continue;
      const dmg = 130 * (1 - d / EXPLOSION_RADIUS) ** 1.2;
      // Friendly fire from barrels is allowed; credit goes to whoever shot it (self-kills count as suicides).
      this.damage(c, dmg, b.lastAttacker, false, pos, 'explosion');
    }
    for (const o of this.barrels) {
      if (!o.alive || !o.explosive || o.fuse > 0) continue;
      if (Math.hypot(o.x - b.x, o.z - b.z) < EXPLOSION_RADIUS * 0.7) {
        o.fuse = 0.12 + Math.random() * 0.18;
        o.lastAttacker = b.lastAttacker;
      }
    }
  }

  update(dt: number) {
    for (const b of this.barrels) {
      if (b.alive && b.fuse > 0) {
        b.fuse -= dt;
        if (b.fuse <= 0) this.explodeBarrel(b);
      }
    }
  }
}
