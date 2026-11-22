import * as THREE from 'three';
import { Emitter } from '../core/Emitter';
import type { GameEvents } from '../core/Events';
import type { Difficulty, MapId, TeamId, WeaponId } from '../core/types';
import { Character } from '../entities/Character';
import { ROSTER } from '../characters/roster';
import { WEAPON_ORDER } from '../weapons/weapons';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { addMapColliders } from '../maps/MapPhysics';
import { buildMapData } from '../maps';
import type { MapData } from '../maps/MapData';
import { NavGraph } from '../ai/NavGraph';
import { BotBrain } from '../ai/BotBrain';
import { TeamAI } from '../ai/TeamAI';
import { botProfile, armorFor, healthFor } from '../ai/profiles';
import { teleport, stepBody } from '../physics/movement';
import { Combat, type BarrelState } from './Combat';
import type { GameMode } from './modes/GameMode';
import { teamDeathmatch } from './modes/TeamDeathmatch';

export type MatchState = 'countdown' | 'playing' | 'ended';

export interface MatchOptions {
  map: MapId;
  difficulty: Difficulty;
  weapon: WeaponId;
  mode?: GameMode;
  /** Headless simulation: the "player" is driven by a bot brain. */
  autoplayer?: boolean;
  /** Simulation only: blue bots use the aggressive team logic (there is no human to follow). */
  simAggressiveBlue?: boolean;
  /** Simulation only: give blue the enemy (red) skill profile to measure structural fairness. */
  simMirrorProfiles?: boolean;
}

export const COUNTDOWN = 3;

/** All simulation state of one match. No rendering, audio or DOM in here so it can run headless. */
export class Match {
  readonly events = new Emitter<GameEvents>();
  readonly physics = new PhysicsWorld();
  readonly data: MapData;
  readonly nav: NavGraph;
  readonly combat: Combat;
  readonly chars: Character[] = [];
  readonly player: Character;
  readonly mode: GameMode;
  readonly teamAI: Record<TeamId, TeamAI>;
  score: Record<TeamId, number> = { blue: 0, red: 0 };
  time = 0; // seconds of live play
  state: MatchState = 'countdown';
  countdown = COUNTDOWN;
  winnerTeam: TeamId | null = null;
  private lastCountdownInt = -1;

  constructor(readonly opts: MatchOptions) {
    this.mode = opts.mode ?? teamDeathmatch;
    this.data = buildMapData(opts.map);
    const mc = addMapColliders(this.physics, this.data);
    this.physics.finalize();
    this.nav = new NavGraph(this.physics, this.data);
    this.combat = new Combat(this);
    this.combat.barrels = this.data.barrels.map((b, i): BarrelState => ({
      x: b.x, y: b.y, z: b.z, explosive: b.explosive, alive: true, hp: 60, collider: mc.barrels[i], fuse: 0, lastAttacker: null,
    }));

    for (const [i, r] of ROSTER.entries()) {
      const isPlayer = i === 0;
      const loadout: WeaponId[] = isPlayer ? [...WEAPON_ORDER] : ['pistol', r.weapon!];
      const c = new Character(i, r.name, r.team, isPlayer, r.look, loadout);
      if (isPlayer) c.startWeapon = opts.weapon;
      c.body = this.physics.createCharacter();
      if (!isPlayer || opts.autoplayer) {
        c.brain = new BotBrain(c, this, botProfile(opts.difficulty, opts.simMirrorProfiles ? 'red' : r.team));
      }
      c.maxHealth = healthFor(opts.difficulty, r.team, isPlayer);
      this.chars.push(c);
    }
    this.player = this.chars[0];
    this.teamAI = { blue: new TeamAI(this, 'blue'), red: new TeamAI(this, 'red') };
    for (const c of this.chars) this.spawn(c, true);
    this.mode.start(this);
  }

  team(t: TeamId) {
    return this.chars.filter((c) => c.team === t);
  }
  aliveCount(t: TeamId) {
    let n = 0;
    for (const c of this.chars) if (c.team === t && c.alive) n++;
    return n;
  }

  /** Place a character at the safest spawn of its team (farthest from living enemies). */
  spawn(c: Character, initial = false) {
    const spawns = this.data.spawns[c.team];
    let best = spawns[0];
    let bestScore = -Infinity;
    const taken = this.chars.filter((o) => o !== c && o.team === c.team && o.alive);
    for (const s of spawns) {
      let minEnemy = 999;
      for (const e of this.chars) if (e.team !== c.team && e.alive) minEnemy = Math.min(minEnemy, Math.hypot(e.pos.x - s.x, e.pos.z - s.z));
      let minMate = 999;
      for (const t of taken) minMate = Math.min(minMate, Math.hypot(t.pos.x - s.x, t.pos.z - s.z));
      const score = (initial ? 0 : Math.min(minEnemy, 60)) + Math.min(minMate, 3) * 6 + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    // Initial spawns: use each team's list in order so teammates don't stack.
    if (initial) best = spawns[(c.team === 'blue' ? this.chars.filter((o) => o.team === 'blue').indexOf(c) : this.chars.filter((o) => o.team === 'red').indexOf(c)) % spawns.length] ?? best;
    const y = this.physics.groundHeight(best.x, best.z, 3) ?? 0;
    teleport(c, best.x, y, best.z);
    c.yaw = best.yaw;
    c.pitch = 0;
    c.alive = true;
    c.maxHealth = healthFor(this.opts.difficulty, c.team, c.isPlayer);
    c.health = c.maxHealth;
    c.armor = armorFor(this.opts.difficulty, c.team, c.isPlayer);
    c.resetAmmo();
    c.weapon = c.startWeapon;
    c.fireCooldown = 0;
    c.reloadLeft = 0;
    c.switchLeft = 0;
    c.bloom = 0;
    c.recoilKick = 0;
    c.invulnUntil = this.time + (initial ? 0 : 1.6);
    c.lastHurtTime = -99;
    c.lastAttacker = null;
    c.brain?.reset();
    this.events.emit('respawn', { c });
  }

  kill(victim: Character, killer: Character | null, weapon: WeaponId | 'explosion', head: boolean) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.diedAt = this.time;
    victim.respawnAt = this.time + this.mode.respawnDelay(this, victim);
    if (killer && killer !== victim && killer.team !== victim.team) {
      killer.kills++;
      killer.streak++;
      if (head) killer.headshots++;
    }
    this.mode.onKill(this, killer, victim);
    this.events.emit('kill', { killer, victim, weapon, head });
    const w = this.mode.winner(this);
    if (w) this.end(w);
  }

  end(winner: TeamId) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.winnerTeam = winner;
    this.events.emit('matchEnd', { winner });
  }

  /** A loud event: enemy bots within radius learn roughly where it came from (with error), like hearing it. */
  noise(source: Character | null, radius: number, at?: THREE.Vector3) {
    if (!source) return;
    const p = at ?? source.pos;
    for (const c of this.chars) {
      if (!c.alive || !c.brain || c.team === source.team) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < radius) c.brain.hear(p, d / radius);
    }
  }

  /** Advance the simulation. `dt` is clamped by the caller. */
  update(dt: number) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.max(1, Math.ceil(this.countdown));
      if (n !== this.lastCountdownInt && this.countdown > 0) {
        this.lastCountdownInt = n;
        this.events.emit('countdown', { n });
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        this.events.emit('matchStart', {});
      }
      // Physics keeps characters settled on the floor during the countdown.
      for (const c of this.chars) if (c.alive) stepBody(c, 0, 0, 0, false, dt);
      return;
    }
    if (this.state === 'ended') {
      for (const c of this.chars) if (c.alive) stepBody(c, 0, 0, 0, false, dt);
      return;
    }
    this.time += dt;
    this.mode.update(this, dt);
    this.combat.update(dt);
    this.teamAI.blue.update(dt);
    this.teamAI.red.update(dt);
    for (const c of this.chars) {
      if (c.alive) {
        WeaponSystem.update(c, dt, this);
        c.brain?.update(dt);
      } else if (this.time >= c.respawnAt && this.mode.canRespawn(this, c)) {
        this.spawn(c);
      }
    }
    // Footsteps: every ~2.1 m of travel while on the ground.
    for (const c of this.chars) {
      if (!c.alive || !c.grounded) continue;
      c.stepDist += c.speed * dt;
      if (c.stepDist > (c.speed > 5 ? 2.4 : 1.9)) {
        c.stepDist = 0;
        this.events.emit('step', { c });
        if (c.speed > 4.6) this.noise(c, 14);
      }
    }
    const w = this.mode.winner(this);
    if (w) this.end(w);
  }

  dispose() {
    this.events.clear();
    this.physics.dispose();
  }
}
