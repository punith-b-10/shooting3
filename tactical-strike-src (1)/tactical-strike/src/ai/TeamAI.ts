import * as THREE from 'three';
import type { TeamId } from '../core/types';
import type { Character } from '../entities/Character';
import type { Match } from '../game/Match';
import type { NavNode } from './NavGraph';
import type { Order } from './BotBrain';

interface Intel {
  pos: THREE.Vector3;
  time: number;
  conf: number; // 1 = eyes on target, <1 = heard
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Per-team coordinator. Bots share what they *see or hear* (like radio callouts) — nobody gets information
 * about an enemy that no teammate has perceived. TeamAI turns that into orders: hold, push, flank, follow, patrol.
 */
export class TeamAI {
  private intel = new Map<number, Intel>();
  private timer = 0;
  private holdNodes: NavNode[] = [];
  private anchorNodes: NavNode[] = [];
  private spawnZ: number;
  private enemySpawnZ: number;

  constructor(private match: Match, readonly team: TeamId) {
    const nav = match.nav;
    const sp = match.data.spawns;
    const mean = (t: TeamId) => sp[t].reduce((s, p) => s + p.z, 0) / sp[t].length;
    this.spawnZ = mean(team);
    this.enemySpawnZ = mean(team === 'blue' ? 'red' : 'blue');
    this.holdNodes = nav.nodes.filter((n) => n.tags.includes('hold') || n.tags.includes('key'));
    // Anchor spots: held positions on our half with the longest sightlines (sampled once per match).
    const mine = this.holdNodes.filter((n) => Math.abs(n.pos.z - this.spawnZ) < Math.abs(n.pos.z - this.enemySpawnZ));
    const scored = mine.map((n) => {
      let seen = 0;
      _a.set(n.pos.x, n.pos.y + 1.6, n.pos.z);
      for (let i = 0; i < 30; i++) {
        const o = nav.nodes[(i * 37 + n.id * 11) % nav.nodes.length];
        _b.set(o.pos.x, o.pos.y + 1.2, o.pos.z);
        if (_a.distanceTo(_b) < 55 && match.physics.clearLine(_a, _b)) seen++;
      }
      return { n, seen };
    });
    scored.sort((a, b) => b.seen - a.seen);
    this.anchorNodes = scored.slice(0, 4).map((s) => s.n);
    if (!this.anchorNodes.length) this.anchorNodes = this.holdNodes.slice(0, 3);
  }

  report(enemy: Character, pos: THREE.Vector3, conf = 1) {
    const cur = this.intel.get(enemy.id);
    const now = this.match.time;
    if (cur && cur.conf > conf && now - cur.time < 1.5) return;
    if (cur) {
      cur.pos.copy(pos);
      cur.time = now;
      cur.conf = conf;
    } else this.intel.set(enemy.id, { pos: pos.clone(), time: now, conf });
  }

  /** Freshest known enemy position, optionally restricted to within `near` metres of a point. */
  freshest(maxAge: number, near?: { p: THREE.Vector3; r: number }): Intel | null {
    let best: Intel | null = null;
    for (const [id, i] of this.intel) {
      const e = this.match.chars[id];
      if (!e.alive) { this.intel.delete(id); continue; }
      if (this.match.time - i.time > maxAge) continue;
      if (near && Math.hypot(i.pos.x - near.p.x, i.pos.z - near.p.z) > near.r) continue;
      if (!best || i.time > best.time) best = i;
    }
    return best;
  }

  nearestNode(p: THREE.Vector3): number {
    return this.match.nav.nearest(p);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.35;
    const now = this.match.time;
    for (const c of this.match.team(this.team)) {
      const b = c.brain;
      if (!c.alive || !b) continue;
      const o = b.order;
      if (o && !b.orderDone && now < o.since + o.ttl) {
        // A fresh sighting can pre-empt a long-running order (everyone converges on contact).
        if ((this.team === 'red' || this.match.opts.simAggressiveBlue) && o.kind !== 'hold' && o.kind !== 'flank' && now - o.since > 2.5) {
          const f = this.freshest(3);
          if (f && f.conf >= 1 && b.pathGoalPos && b.pathGoalPos.distanceTo(f.pos) > 18) {
            this.assign(c);
          }
        }
        continue;
      }
      this.assign(c);
    }
  }

  private give(c: Character, kind: Order['kind'], node: number, ttl: number, extra: Partial<Order> = {}) {
    if (node < 0) return;
    c.brain!.setOrder({ kind, node, since: this.match.time, ttl, ...extra });
  }

  private randomNode(filter?: (n: NavNode) => boolean): number {
    const nav = this.match.nav;
    for (let i = 0; i < 12; i++) {
      const n = nav.nodes[(Math.random() * nav.nodes.length) | 0];
      if (!filter || filter(n)) return n.id;
    }
    return nav.nodes[(Math.random() * nav.nodes.length) | 0].id;
  }

  private pickHold(filter: (n: NavNode) => boolean): number {
    const pool = this.holdNodes.filter(filter);
    if (!pool.length) return this.randomNode(filter);
    return pool[(Math.random() * pool.length) | 0].id;
  }

  private assign(c: Character) {
    if (this.team === 'red' || this.match.opts.simAggressiveBlue) this.assignRed(c);
    else this.assignBlue(c);
  }

  // ---------------------------------------------------------------- RED (enemy): coordinated and aggressive
  private assignRed(c: Character) {
    const m = this.match;
    const b = c.brain!;
    const p = b.profile;
    const threat = this.freshest(14);
    const role = c.loadout[c.loadout.length - 1] === 'sniper' ? 'anchor' : c.loadout[c.loadout.length - 1] === 'smg' ? 'flank' : 'push';
    const here = this.nearestNode(c.pos);
    const early = m.time < 10;
    // Wounded bots fall back to a held position near the team's spawn and let teammates take the fight.
    if (c.health < c.maxHealth * (p.retreatHp + 0.15) && b.recentlyThreatened()) {
      this.give(c, 'hold', this.pickHold((n) => Math.abs(n.pos.z - this.spawnZ) < 22), 6, { facing: this.facingToward(this.enemySpawnZ) });
      return;
    }

    if (role === 'anchor') {
      const spot = this.anchorNodes[c.id % this.anchorNodes.length];
      const dist = c.pos.distanceTo(spot.pos);
      if (dist > 3) { this.give(c, 'goto', spot.id, 12); return; }
      const face = threat ? Math.atan2(-(threat.pos.x - c.pos.x), -(threat.pos.z - c.pos.z)) : this.facingToward(this.enemySpawnZ);
      this.give(c, 'hold', spot.id, 5, { facing: face });
      return;
    }

    if (threat && p.tactics > 0.3) {
      const tn = this.nearestNode(threat.pos);
      if (role === 'flank' && Math.random() < p.tactics + 0.1) {
        const direct = m.nav.findPath(here, tn);
        if (direct.length > 6) {
          const avoid = new Set<number>();
          for (const id of direct) avoid.add(id);
          const near = (n: NavNode) => {
            for (const id of avoid) if (m.nav.nodes[id].pos.distanceToSquared(n.pos) < 30) return 40;
            return 0;
          };
          const alt = m.nav.findPath(here, tn, near);
          if (alt.length > 4 && alt.length < direct.length * 2.6) {
            this.give(c, 'flank', tn, 22, { via: alt });
            return;
          }
        }
      }
      // Pushers approach the contact but hold at ~12 m so the group arrives together rather than trickling in.
      this.give(c, 'goto', tn, 8);
      return;
    }

    // No contact: take mid-map control early, then sweep toward the enemy half.
    if (early) {
      this.give(c, 'goto', this.pickHold((n) => Math.abs(n.pos.z) < 16), 9);
      return;
    }
    if (role === 'flank') {
      this.give(c, 'patrol', this.randomNode((n) => Math.abs(n.pos.x) > 14 && Math.abs(n.pos.z - this.enemySpawnZ) < 40), 10);
      return;
    }
    if (Math.random() < 0.35) this.give(c, 'hold', this.pickHold(() => true), 4, { facing: this.facingToward(this.enemySpawnZ) });
    else this.give(c, 'patrol', this.randomNode((n) => Math.abs(n.pos.z - this.enemySpawnZ) < Math.abs(n.pos.z - this.spawnZ) + 20), 10);
  }

  private facingToward(z: number): number {
    return z > 0 ? Math.PI : 0; // yaw 0 faces -z
  }

  // ---------------------------------------------------------------- BLUE (friendly): stay with the player, help fight
  private assignBlue(c: Character) {
    const m = this.match;
    const b = c.brain!;
    const player = m.player;
    const mates = m.team('blue').filter((x) => x.brain && x !== player);
    const slot = Math.max(0, mates.indexOf(c));
    const anchorPos = player.alive && !player.brain ? player.pos : this.alliedCentroid(c);
    const threat = this.freshest(9, { p: anchorPos, r: 48 });
    const weapon = c.loadout[c.loadout.length - 1];
    const here = this.nearestNode(c.pos);

    if (c.health < c.maxHealth * 0.3 && b.recentlyThreatened()) {
      const n = this.nearestNode(anchorPos);
      this.give(c, 'hold', n, 5, { facing: this.facingToward(this.enemySpawnZ) });
      return;
    }

    if (threat) {
      const tn = this.nearestNode(threat.pos);
      if (weapon === 'smg' && Math.random() < 0.5) {
        const direct = m.nav.findPath(here, tn);
        const avoid = new Set(direct);
        const alt = m.nav.findPath(here, tn, (n) => {
          for (const id of avoid) if (m.nav.nodes[id].pos.distanceToSquared(n.pos) < 25) return 25;
          return 0;
        });
        if (alt.length > 3 && alt.length < direct.length * 2.2) { this.give(c, 'flank', tn, 18, { via: alt }); return; }
      }
      this.give(c, 'goto', tn, 7);
      return;
    }

    if (player.alive && !player.brain) {
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      // Fan out around the player: left / right / behind relative to where they face.
      const ang = player.yaw + [-1.1, 1.1, Math.PI][slot % 3] + (Math.random() - 0.5) * 0.7;
      const dist = 5 + Math.random() * 5 + (d > 25 ? 0 : 0);
      const tx = player.pos.x - Math.sin(ang) * dist;
      const tz = player.pos.z - Math.cos(ang) * dist;
      _a.set(tx, player.pos.y, tz);
      let n = this.nearestNode(_a);
      // "Move between strategic locations": scouts patrol nearby hold points instead of crowding the player.
      if (weapon === 'smg' || (d < 9 && Math.random() < 0.4)) {
        const pool = this.holdNodes.filter((h) => Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z) < 32);
        if (pool.length) n = pool[(Math.random() * pool.length) | 0].id;
      }
      this.give(c, d > 14 ? 'follow' : 'patrol', n, d > 14 ? 5 : 7);
      return;
    }
    // Player is dead (or autoplayer): group on a living teammate or a held position.
    const tn = this.pickHold(() => true);
    this.give(c, 'patrol', tn, 8);
  }

  private alliedCentroid(except: Character): THREE.Vector3 {
    const v = new THREE.Vector3();
    let n = 0;
    for (const c of this.match.team(this.team)) if (c.alive && c !== except) { v.add(c.pos); n++; }
    return n ? v.multiplyScalar(1 / n) : except.pos.clone();
  }
}
