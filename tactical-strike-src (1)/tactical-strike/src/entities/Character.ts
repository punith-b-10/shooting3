import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { TeamId, WeaponId } from '../core/types';
import { WEAPONS } from '../weapons/weapons';
import type { Appearance } from '../characters/roster';
import type { BotBrain } from '../ai/BotBrain';

export const EYE_HEIGHT = 1.62;
export const MAX_HEALTH = 100;

export interface AmmoState {
  mag: number;
  reserve: number;
}

/** A combatant: the human player or a bot. Pure simulation state — the visual model lives in the render layer. */
export class Character {
  pos = new THREE.Vector3(); // feet
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  grounded = true;
  speed = 0; // horizontal speed this frame, drives animation and footsteps
  stepDist = 0;

  health = MAX_HEALTH;
  maxHealth = MAX_HEALTH;
  armor = 0;
  startWeapon: WeaponId;
  alive = true;
  kills = 0;
  deaths = 0;
  headshots = 0;
  streak = 0;
  respawnAt = 0;
  invulnUntil = 0;
  lastHurtTime = -99;
  lastHurtFrom = new THREE.Vector3();
  lastAttacker: Character | null = null;
  diedAt = -99;

  weapon: WeaponId;
  arsenal: Partial<Record<WeaponId, AmmoState>> = {};
  fireCooldown = 0;
  reloadLeft = 0;
  switchLeft = 0;
  bloom = 0; // temporary extra spread from sustained fire
  recoilKick = 0; // read by the first-person camera

  body: { collider: RAPIER.Collider; controller: RAPIER.KinematicCharacterController } | null = null;
  brain: BotBrain | null = null;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly team: TeamId,
    readonly isPlayer: boolean,
    readonly appearance: Appearance,
    readonly loadout: WeaponId[],
  ) {
    this.weapon = loadout[loadout.length - 1];
    this.startWeapon = this.weapon;
    this.resetAmmo();
  }

  resetAmmo() {
    this.arsenal = {};
    for (const id of this.loadout) {
      const d = WEAPONS[id];
      this.arsenal[id] = { mag: d.mag, reserve: d.reserve };
    }
  }

  get ammo(): AmmoState {
    return this.arsenal[this.weapon]!;
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
}
