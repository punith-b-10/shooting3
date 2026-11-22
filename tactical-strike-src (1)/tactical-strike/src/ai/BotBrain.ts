import * as THREE from 'three';
import type { Character } from '../entities/Character';
import type { Match } from '../game/Match';
import type { BotProfile } from './profiles';
import { WEAPONS } from '../weapons/weapons';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { stepBody, WALK_SPEED, SPRINT_SPEED } from '../physics/movement';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export interface Order {
  kind: 'goto' | 'hold' | 'flank' | 'follow' | 'patrol';
  node: number;
  since: number;
  ttl: number;
  facing?: number; // yaw to watch while holding
  via?: number[]; // explicit route (flank)
}

type State = 'order' | 'engage' | 'cover' | 'investigate' | 'retreat';

const wrap = (a: number) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * One brain per bot (friend or foe — only the BotProfile differs).
 * Bots perceive through the same physics rays a player would be limited by: field of view, distance and line of sight.
 * They never read a hidden enemy's position; they only know what they (or a teammate via TeamAI) saw or heard.
 */
export class BotBrain {
  order: Order | null = null;
  orderDone = false;
  pathGoalPos: THREE.Vector3 | null = null;

  private state: State = 'order';
  private path: number[] = [];
  private pi = 0;
  private target: Character | null = null;
  private lastSeen = -99;
  private lastKnown = new THREE.Vector3();
  private lastKnownValid = false;
  private reactAt = 0;
  private aimHead = false;
  private perceiveT = Math.random() * 0.12;
  private strafeDir = 1;
  private strafeT = 0;
  private burstLeft = 0;
  private burstPause = 0;
  private scopeT = 0;
  private exposeLeft = 0;
  private coverLeft = 0;
  private coverNode = -1;
  private peekNode = -1;
  private retreatNode = -1;
  private investigateT = 0;
  private holdT = 0;
  private scanPhase = Math.random() * 10;
  private glanceT = rand(2, 4);
  private glanceYaw = 0;
  private stuckT = 0;
  private stuckPos = new THREE.Vector3();
  private jumpT = 0;
  private heard: { pos: THREE.Vector3; time: number } | null = null;
  private lookYaw: number | null = null;
  private lookPitch = 0;
  private wobbleSeed = Math.random() * 100;
  private threatTime = -99;
  private repathT = 0;

  constructor(private c: Character, private m: Match, readonly profile: BotProfile) {}

  reset() {
    this.order = null;
    this.orderDone = false;
    this.state = 'order';
    this.path = [];
    this.pi = 0;
    this.target = null;
    this.lastSeen = -99;
    this.lastKnownValid = false;
    this.heard = null;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.threatTime = -99;
    this.pathGoalPos = null;
    this.reactAt = 0;
    this.stuckT = 0;
    this.lookYaw = null;
  }

  recentlyThreatened() {
    return this.m.time - this.threatTime < 8;
  }

  setOrder(o: Order) {
    this.order = o;
    this.orderDone = false;
    this.holdT = o.kind === 'hold' ? o.ttl : 0;
    if (o.via) this.setPath(o.via);
    else this.routeTo(o.node);
  }

  /** A loud sound at p; `closeness` 0 (right next to us) .. 1 (barely audible). The perceived position is imprecise. */
  hear(p: THREE.Vector3, closeness: number) {
    const err = 2 + closeness * 10;
    const pos = new THREE.Vector3(p.x + rand(-err, err), p.y, p.z + rand(-err, err));
    this.heard = { pos, time: this.m.time };
    this.threatTime = this.m.time;
    const enemy = this.m.chars.find((e) => e.alive && e.team !== this.c.team && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 1.5);
    if (enemy) this.m.teamAI[this.c.team].report(enemy, pos, 0.5);
    if (this.state === 'order' && !this.target && Math.random() < 0.3 + this.profile.tactics * 0.5) {
      this.lastKnown.copy(pos);
      this.lastKnownValid = true;
      this.state = 'investigate';
      this.investigateT = 4;
      this.routeTo(this.m.nav.nearest(pos));
    }
  }

  // ------------------------------------------------------------------ main tick
  update(dt: number) {
    const c = this.c;
    const m = this.m;
    const p = this.profile;
    const now = m.time;
    c.recoilKick = 0;

    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.1 + Math.random() * 0.05;
      this.perceive(now);
    }
    if (c.lastHurtTime > now - 0.25 && !this.target) this.onHurt(now);

    const wasVisible = this.target !== null && now - this.lastSeen < 0.3;
    const hpFrac = c.health / c.maxHealth;

    // ---- state transitions
    if (this.state !== 'retreat' && hpFrac < p.retreatHp && this.recentlyThreatened() && m.aliveCount(c.team) > 1 && Math.random() < dt * 4) {
      this.beginRetreat();
    }
    if (this.state === 'retreat') {
      const reached = this.retreatNode < 0 || c.pos.distanceTo(m.nav.nodes[this.retreatNode].pos) < 1.5;
      if ((reached && now - this.lastSeen > 4) || now - this.threatTime > 14) {
        this.state = 'order';
        this.order = null; // ask TeamAI for something new (usually a hold near cover)
        this.orderDone = true;
      }
    } else if (wasVisible) {
      if (this.state !== 'engage' && this.state !== 'cover') this.enterEngage(now);
      else if (this.state === 'cover' && this.coverLeft <= 0) this.state = 'engage';
    } else if (this.state === 'engage') {
      // Lost sight: chase the last known position for a while (memory), else drop back to orders.
      if (this.lastKnownValid && now - this.lastSeen < p.memory) {
        this.state = 'investigate';
        this.investigateT = Math.min(p.memory - (now - this.lastSeen), 6);
        this.routeTo(m.nav.nearest(this.lastKnown));
      } else this.state = 'order';
    }

    // ---- behaviour
    let wx = 0, wz = 0, speed = WALK_SPEED, jump = false;
    switch (this.state) {
      case 'engage': ({ wx, wz, speed } = this.doEngage(dt, now)); break;
      case 'cover': ({ wx, wz, speed } = this.doCover(dt, now)); break;
      case 'retreat': ({ wx, wz, speed } = this.doRetreat(dt, now)); break;
      case 'investigate': ({ wx, wz, speed } = this.doInvestigate(dt, now)); break;
      default: ({ wx, wz, speed } = this.doOrder(dt, now)); break;
    }

    // Separation from teammates so the squad doesn't stack up in doorways.
    for (const o of m.chars) {
      if (o === c || !o.alive || o.team !== c.team) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.1 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        wx += (dx / d) * 0.8;
        wz += (dz / d) * 0.8;
      }
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    // Stuck detection (geometry the nav graph missed, teammates in a corridor): hop and re-route.
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      if (wl > 0.3 && c.pos.distanceTo(this.stuckPos) < 0.35) {
        jump = true;
        this.strafeDir *= -1;
        this.repathT = 0;
        if (this.state === 'order') this.orderDone = Math.random() < 0.5;
        else if (this.path.length) this.routeTo(this.path[this.path.length - 1]);
      }
      this.stuckPos.copy(c.pos);
      this.stuckT = 0;
    }
    this.jumpT -= dt;
    if (jump && this.jumpT <= 0 && c.grounded) this.jumpT = 1.5;
    else jump = false;

    const wdef = WEAPONS[c.weapon];
    stepBody(c, wx, wz, speed * wdef.moveMul, jump, dt);

    // Tactical reload / ammo management out of combat.
    if (!wasVisible && c.reloadLeft <= 0 && c.ammo.mag < wdef.mag * 0.45 && c.ammo.reserve > 0) WeaponSystem.startReload(c, m);
    if (c.ammo.mag === 0 && c.ammo.reserve === 0) this.swapToUsable();
  }

  private swapToUsable() {
    for (const id of this.c.loadout) {
      const a = this.c.arsenal[id];
      if (a && (a.mag > 0 || a.reserve > 0)) { WeaponSystem.switchTo(this.c, id, this.m); return; }
    }
  }

  // ------------------------------------------------------------------ perception
  private perceive(now: number) {
    const c = this.c;
    const m = this.m;
    const p = this.profile;
    c.eye(_eye);
    let best: Character | null = null;
    let bestScore = Infinity;
    for (const e of m.chars) {
      if (!e.alive || e.team === c.team) continue;
      const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > p.sight) continue;
      if (dist > 3.5) {
        const ang = Math.abs(wrap(Math.atan2(-dx, -dz) - c.yaw));
        if (ang > (p.fov / 2) * DEG) continue;
      }
      _tgt.set(e.pos.x, e.pos.y + 1.15, e.pos.z);
      let vis = m.physics.clearLine(_eye, _tgt);
      if (!vis) {
        _tgt.y = e.pos.y + 1.6;
        vis = m.physics.clearLine(_eye, _tgt);
      }
      if (!vis) continue;
      _tmp.set(e.pos.x, e.pos.y, e.pos.z);
      m.teamAI[c.team].report(e, _tmp, 1);
      const score = dist - (c.lastAttacker === e ? 12 : 0) - (this.target === e ? 6 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) {
      const fresh = now - this.lastSeen > 0.9 || this.target !== best;
      if (fresh) {
        // Reaction time: a short delay before the first shot, shorter if we already knew roughly where they were.
        const known = this.lastKnownValid && now - this.lastSeen < 3 ? 0.55 : 1;
        this.reactAt = now + p.react * known * rand(0.8, 1.25);
        this.aimHead = Math.random() < p.headChance;
        this.scopeT = 0;
        if (!this.target || this.target !== best) this.burstLeft = 0;
      }
      this.target = best;
      this.lastSeen = now;
      this.lastKnown.set(best.pos.x, best.pos.y, best.pos.z);
      this.lastKnownValid = true;
      this.threatTime = now;
    } else if (this.target && (!this.target.alive || now - this.lastSeen > p.memory)) {
      this.target = null;
    }
  }

  private onHurt(now: number) {
    // Being shot tells us the direction it came from (not the exact position).
    const from = this.c.lastHurtFrom;
    this.threatTime = now;
    this.lookYaw = Math.atan2(-(from.x - this.c.pos.x), -(from.z - this.c.pos.z));
    if (this.state === 'order' || this.state === 'investigate') {
      const dir = new THREE.Vector3(from.x - this.c.pos.x, 0, from.z - this.c.pos.z).normalize();
      this.lastKnown.set(this.c.pos.x + dir.x * 12, this.c.pos.y, this.c.pos.z + dir.z * 12);
      this.lastKnownValid = true;
      this.lastSeen = now - 1;
      this.state = 'investigate';
      this.investigateT = 3.5;
      this.routeTo(this.m.nav.nearest(this.lastKnown));
    }
  }

  // ------------------------------------------------------------------ states
  private enterEngage(now: number) {
    this.state = 'engage';
    this.exposeLeft = rand(1.3, 2.8);
    this.strafeT = 0;
    this.peekNode = this.m.nav.nearest(this.c.pos);
    void now;
  }

  private doEngage(dt: number, now: number) {
    const c = this.c;
    const p = this.profile;
    const t = this.target!;
    const def = WEAPONS[c.weapon];
    const dx = t.pos.x - c.pos.x, dz = t.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const dirx = dx / (dist || 1), dirz = dz / (dist || 1);

    this.aimAndFire(dt, now, t, dist);

    // Movement: keep the weapon's preferred range, strafe unpredictably, and peek out of cover on higher skill.
    let wx = 0, wz = 0;
    let speed = WALK_SPEED * 0.8;
    const sniper = def.id === 'sniper';
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      this.strafeT = rand(0.35, 1.3);
    }
    const stillShooter = sniper && dist > 25;
    if (!stillShooter && !(c.reloadLeft > 0 && p.tactics > 0.6 && Math.random() < 0.02)) {
      wx += -dirz * this.strafeDir * p.strafe;
      wz += dirx * this.strafeDir * p.strafe;
    }
    if (dist > def.prefMax) { wx += dirx * 0.9; wz += dirz * 0.9; speed = SPRINT_SPEED * 0.85; }
    else if (dist < def.prefMin && def.id !== 'shotgun') { wx -= dirx * 0.8; wz -= dirz * 0.8; }
    else if (def.id === 'shotgun' && dist > def.prefMax * 0.55) { wx += dirx * 0.8; wz += dirz * 0.8; speed = SPRINT_SPEED * 0.8; }
    if (sniper && dist < def.prefMin + 15) { wx -= dirx * 0.9; wz -= dirz * 0.9; speed = SPRINT_SPEED * 0.8; }

    // Peek cycle: after a burst of exposure, step back behind cover (if any), reload, and peek again.
    this.exposeLeft -= dt;
    if (this.exposeLeft <= 0 && Math.random() < p.tactics && !stillShooter) {
      const cover = this.findCover(t);
      if (cover >= 0) {
        this.coverNode = cover;
        this.coverLeft = rand(0.9, 2.0) * (c.ammo.mag < def.mag * 0.5 ? 1.6 : 1);
        this.state = 'cover';
        this.routeTo(cover);
      } else this.exposeLeft = rand(1, 2);
    }
    return { wx, wz, speed };
  }

  private doCover(dt: number, now: number) {
    const c = this.c;
    const t = this.target;
    this.coverLeft -= dt;
    // Face where the enemy was while sheltering; reload when low.
    if (t) this.turnTo(Math.atan2(-(this.lastKnown.x - c.pos.x), -(this.lastKnown.z - c.pos.z)), 0, dt, 1);
    if (c.ammo.mag < WEAPONS[c.weapon].mag * 0.6) WeaponSystem.startReload(c, this.m);
    const hidden = this.coverNode < 0 || c.pos.distanceTo(this.m.nav.nodes[this.coverNode].pos) < 1.0;
    let move = { wx: 0, wz: 0, speed: SPRINT_SPEED * 0.9 };
    if (!hidden) move = { ...this.follow(dt), speed: SPRINT_SPEED * 0.9 };
    if (this.coverLeft <= 0) {
      // Peek: step back to where we fought from.
      this.state = 'engage';
      this.exposeLeft = rand(1.2, 2.6);
      if (this.peekNode >= 0) this.routeTo(this.peekNode);
    }
    void now;
    return move;
  }

  private doRetreat(dt: number, now: number) {
    const c = this.c;
    const t = this.target;
    if (t && now - this.lastSeen < 0.4) {
      // Fire while falling back.
      const dist = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z);
      this.aimAndFire(dt, now, t, dist, 0.7);
    } else if (c.ammo.mag < WEAPONS[c.weapon].mag * 0.7) WeaponSystem.startReload(c, this.m);
    const m = this.follow(dt);
    return { ...m, speed: SPRINT_SPEED };
  }

  private doInvestigate(dt: number, now: number) {
    this.investigateT -= dt;
    const arrived = this.pi >= this.path.length;
    if (arrived) {
      // Look around where they were last seen.
      this.scanPhase += dt;
      this.turnTo(this.c.yaw + Math.sin(this.scanPhase * 2.2) * 0.6 * dt * 6, 0, dt, 2);
      if (this.investigateT <= 0 || (arrived && this.investigateT < 2)) {
        this.state = 'order';
        this.lastKnownValid = this.lastKnownValid && now - this.lastSeen < this.profile.memory;
      }
      return { wx: 0, wz: 0, speed: WALK_SPEED };
    }
    if (this.investigateT <= 0) this.state = 'order';
    const mv = this.follow(dt);
    this.lookAlongPath(dt, mv);
    return { ...mv, speed: WALK_SPEED * 1.15 };
  }

  private doOrder(dt: number, now: number) {
    const o = this.order;
    const c = this.c;
    if (!o) {
      this.orderDone = true;
      this.scanPhase += dt;
      this.turnTo(c.yaw + Math.sin(this.scanPhase * 1.7) * 0.5 * dt * 5, 0, dt, 2);
      return { wx: 0, wz: 0, speed: WALK_SPEED };
    }
    const arrived = this.pi >= this.path.length;
    if (arrived) {
      if (o.kind === 'hold') {
        // Watch an arc of fire around the held direction, rarely standing perfectly still.
        this.holdT -= dt;
        this.scanPhase += dt;
        const base = o.facing ?? c.yaw;
        this.turnTo(base + Math.sin(this.scanPhase * 0.9) * 1.0, 0, dt, 1.4);
        if (this.holdT <= 0) this.orderDone = true;
        return { wx: Math.sin(this.scanPhase * 0.7) * 0.25, wz: 0, speed: WALK_SPEED * 0.5 };
      }
      if (o.kind === 'patrol' || o.kind === 'goto' || o.kind === 'follow') {
        // Look around briefly at the destination, then ask for the next order.
        this.holdT += dt;
        this.scanPhase += dt;
        this.turnTo(c.yaw + Math.sin(this.scanPhase * 2.4) * dt * 3, 0, dt, 2);
        if (this.holdT > (o.kind === 'goto' ? 0.4 : 1.2)) this.orderDone = true;
        return { wx: 0, wz: 0, speed: WALK_SPEED };
      }
      this.orderDone = true;
    } else this.holdT = 0;
    this.repathT -= dt;
    const mv = this.follow(dt);
    this.lookAlongPath(dt, mv);
    const sprint = o.kind === 'goto' || o.kind === 'follow' || o.kind === 'flank';
    void now;
    return { ...mv, speed: sprint ? SPRINT_SPEED * 0.88 : WALK_SPEED * 1.2 };
  }

  // ------------------------------------------------------------------ aiming and firing
  private aimAndFire(dt: number, now: number, t: Character, dist: number, accuracyMul = 1) {
    const c = this.c;
    const p = this.profile;
    const def = WEAPONS[c.weapon];
    c.eye(_eye);
    const ty = t.pos.y + (this.aimHead ? 1.6 : 1.18);
    const dx = t.pos.x - _eye.x, dy = ty - _eye.y, dz = t.pos.z - _eye.z;
    const horiz = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, horiz);
    // Wobble shrinks the longer we track the same target.
    const tracking = Math.min(1, (now - (this.reactAt - p.react)) / 1.2);
    const wob = p.aimNoise * DEG * (1.25 - 0.6 * tracking) * (c.speed > 2.5 ? 1.25 : 1) / accuracyMul;
    const s = now * 3.1 + this.wobbleSeed;
    const ox = (Math.sin(s * 1.7) + Math.sin(s * 0.63 + 1.3)) * 0.5 * wob;
    const oy = (Math.sin(s * 1.3 + 2) + Math.sin(s * 0.9)) * 0.5 * wob;
    const err = this.turnTo(wantYaw + ox, wantPitch + oy, dt, 1, wantYaw, wantPitch);

    if (now < this.reactAt) return;
    if (dist > def.range * 0.9) return;
    if (def.id === 'shotgun' && dist > def.falloff + 6) return;
    const tol = Math.max(1.6 * DEG, Math.atan2(0.3, Math.max(3, dist)));
    if (err > tol * 2.2) return;

    const ads = def.id === 'sniper' || (def.id === 'rifle' && dist > 24);
    if (def.id === 'sniper') {
      // Scoping in takes a moment — this is the sniper bot's weakness at close range.
      this.scopeT += dt;
      if (this.scopeT < 0.45 - p.skill * 0.15) return;
    }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (!WeaponSystem.canFire(c)) return;
    if (err > tol * 1.4 && def.id !== 'smg' && def.id !== 'shotgun') return;
    const fired = WeaponSystem.fire(c, this.m, ads, p.spreadMul / accuracyMul, p.dmgMul);
    if (fired) {
      if (def.auto) {
        if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(def.burstMin, def.burstMax)) + 1;
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = rand(0.1, 0.38) * (1.6 - p.skill);
      } else {
        this.burstPause = rand(0.03, 0.2) * (1.5 - p.skill) + (def.id === 'shotgun' ? 0.15 : 0);
      }
    }
  }

  /** Rotate view toward a yaw/pitch at a limited angular speed. Returns remaining angular error to (errYaw, errPitch) targets. */
  private turnTo(yaw: number, pitch: number, dt: number, speedMul = 1, errYaw = yaw, errPitch = pitch): number {
    const c = this.c;
    const maxStep = this.profile.aimSpeed * DEG * dt * speedMul;
    const dyaw = wrap(yaw - c.yaw);
    const dpitch = pitch - c.pitch;
    const mag = Math.hypot(dyaw, dpitch);
    if (mag > 1e-6) {
      const k = Math.min(mag, maxStep) / mag; // constant angular speed, exact arrival
      c.yaw += dyaw * k;
      c.pitch += dpitch * k;
    }
    c.pitch = Math.max(-1.3, Math.min(1.3, c.pitch));
    return Math.hypot(wrap(errYaw - c.yaw), errPitch - c.pitch);
  }

  private lookAlongPath(dt: number, mv: { wx: number; wz: number }) {
    const c = this.c;
    if (this.lookYaw !== null) {
      this.turnTo(this.lookYaw, 0, dt, 1.2);
      if (Math.abs(wrap(this.lookYaw - c.yaw)) < 0.1) this.lookYaw = null;
      return;
    }
    this.glanceT -= dt;
    let yaw = Math.hypot(mv.wx, mv.wz) > 0.1 ? Math.atan2(-mv.wx, -mv.wz) : c.yaw;
    if (this.glanceT < 0) {
      this.glanceYaw = rand(-0.9, 0.9);
      if (this.glanceT < -0.5) this.glanceT = rand(2, 4.5);
      yaw += this.glanceYaw;
    }
    this.turnTo(yaw, 0, dt, 0.9);
  }

  // ------------------------------------------------------------------ navigation
  private routeTo(node: number) {
    const m = this.m;
    const from = m.nav.nearest(this.c.pos);
    this.path = m.nav.findPath(from, node);
    this.pi = this.path.length > 1 && this.nearPathNode(0) ? 1 : 0;
    this.pathGoalPos = node >= 0 ? m.nav.nodes[node].pos : null;
  }

  private setPath(path: number[]) {
    this.path = path;
    this.pi = 0;
    this.pathGoalPos = path.length ? this.m.nav.nodes[path[path.length - 1]].pos : null;
  }

  private nearPathNode(i: number) {
    const n = this.m.nav.nodes[this.path[i]];
    return Math.hypot(n.pos.x - this.c.pos.x, n.pos.z - this.c.pos.z) < 1.2;
  }

  /** Steer along the current path. Returns a world-space wish direction. */
  private follow(dt: number): { wx: number; wz: number } {
    void dt;
    const c = this.c;
    const nodes = this.m.nav.nodes;
    while (this.pi < this.path.length) {
      const n = nodes[this.path[this.pi]];
      const d = Math.hypot(n.pos.x - c.pos.x, n.pos.z - c.pos.z);
      const last = this.pi === this.path.length - 1;
      if (d < (last ? 0.9 : 1.35) && Math.abs(n.pos.y - c.pos.y) < 1.6) this.pi++;
      else break;
    }
    if (this.pi >= this.path.length) return { wx: 0, wz: 0 };
    const n = nodes[this.path[this.pi]];
    const dx = n.pos.x - c.pos.x, dz = n.pos.z - c.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return { wx: dx / d, wz: dz / d };
  }

  /** Pick a nearby node that breaks line of sight to `threat`, preferring short trips. */
  private findCover(threat: Character): number {
    const nav = this.m.nav;
    const me = this.c.pos;
    _eye.set(threat.pos.x, threat.pos.y + 1.6, threat.pos.z);
    let best = -1;
    let bestD = Infinity;
    for (const n of nav.nodes) {
      const dx = n.pos.x - me.x, dz = n.pos.z - me.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 49 || d2 < 2.2 || Math.abs(n.pos.y - me.y) > 1.5) continue;
      _tmp.set(n.pos.x, n.pos.y + 1.5, n.pos.z);
      if (this.m.physics.clearLine(_eye, _tmp)) continue;
      // Must not be closer to the threat than we are now by much.
      const dt2 = (n.pos.x - threat.pos.x) ** 2 + (n.pos.z - threat.pos.z) ** 2;
      if (dt2 < ((me.x - threat.pos.x) ** 2 + (me.z - threat.pos.z) ** 2) * 0.55) continue;
      if (d2 < bestD) { bestD = d2; best = n.id; }
    }
    return best;
  }

  private beginRetreat() {
    const nav = this.m.nav;
    const c = this.c;
    const threatPos = this.lastKnownValid ? this.lastKnown : c.lastHurtFrom;
    _eye.set(threatPos.x, threatPos.y + 1.6, threatPos.z);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 70; i++) {
      const n = nav.nodes[(Math.random() * nav.nodes.length) | 0];
      const dMe = Math.hypot(n.pos.x - c.pos.x, n.pos.z - c.pos.z);
      if (dMe < 6 || dMe > 34) continue;
      const dTh = Math.hypot(n.pos.x - threatPos.x, n.pos.z - threatPos.z);
      _tmp.set(n.pos.x, n.pos.y + 1.5, n.pos.z);
      const hidden = !this.m.physics.clearLine(_eye, _tmp);
      const score = dTh * 0.6 - dMe * 0.5 + (hidden ? 22 : 0) + (n.tags.length ? 3 : 0);
      if (score > bestScore) { bestScore = score; best = n.id; }
    }
    if (best >= 0) {
      this.retreatNode = best;
      this.state = 'retreat';
      this.routeTo(best);
    }
  }
}
