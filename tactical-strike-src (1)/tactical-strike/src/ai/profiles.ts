import type { Difficulty, TeamId } from '../core/types';

/** Everything that makes one bot better or worse than another. Enemy (red) profiles are always stronger than friendly ones. */
export interface BotProfile {
  react: number; // seconds between first seeing a target and first shot
  aimSpeed: number; // degrees per second the crosshair can travel
  aimNoise: number; // degrees of wobble while tracking
  spreadMul: number; // multiplier on weapon spread
  headChance: number; // chance a target acquisition aims for the head
  fov: number; // horizontal field of view in degrees (bots only "see" inside it)
  sight: number; // metres
  strafe: number; // 0..1 how much they move while fighting
  tactics: number; // 0..1 likelihood to use cover/peeking, flanks and coordination
  retreatHp: number; // retreat below this fraction of max health
  memory: number; // seconds they remember where a target was last seen
  dmgMul: number;
  skill: number; // 0..1 convenience scalar for fire discipline
}

const ENEMY: Record<Difficulty, BotProfile> = {
  easy:    { react: 0.65, aimSpeed: 110, aimNoise: 3.6, spreadMul: 2.8, headChance: 0.05, fov: 105, sight: 55,  strafe: 0.25, tactics: 0.2,  retreatHp: 0.2,  memory: 4,  dmgMul: 0.75, skill: 0.2 },
  normal:  { react: 0.42, aimSpeed: 190, aimNoise: 2.3, spreadMul: 1.8, headChance: 0.14, fov: 120, sight: 80,  strafe: 0.5,  tactics: 0.5,  retreatHp: 0.25, memory: 7,  dmgMul: 0.95, skill: 0.5 },
  hard:    { react: 0.30, aimSpeed: 270, aimNoise: 1.7, spreadMul: 1.35, headChance: 0.22, fov: 130, sight: 100, strafe: 0.75, tactics: 0.8,  retreatHp: 0.3,  memory: 9,  dmgMul: 1.0,  skill: 0.75 },
  extreme: { react: 0.20, aimSpeed: 380, aimNoise: 1.0, spreadMul: 1.0, headChance: 0.34, fov: 140, sight: 120, strafe: 0.95, tactics: 1.0,  retreatHp: 0.35, memory: 12, dmgMul: 1.1,  skill: 0.95 },
};

export function botProfile(diff: Difficulty, team: TeamId): BotProfile {
  const e = ENEMY[diff];
  if (team === 'red') return { ...e };
  // Friendly bots: somewhat slower reactions, sloppier aim, less tactical — but not helpless.
  return {
    react: e.react * 1.2 + 0.08,
    aimSpeed: e.aimSpeed * 0.8,
    aimNoise: e.aimNoise * 1.25 + 0.3,
    spreadMul: e.spreadMul * 1.25,
    headChance: e.headChance * 0.7,
    fov: e.fov - 10,
    sight: e.sight * 0.9,
    strafe: e.strafe * 0.8,
    tactics: e.tactics * 0.6,
    retreatHp: 0.3,
    memory: Math.max(4, e.memory - 2),
    dmgMul: e.dmgMul * 0.97,
    skill: e.skill * 0.75,
  };
}

export function armorFor(diff: Difficulty, team: TeamId, isPlayer: boolean): number {
  if (isPlayer) return 50;
  if (team === 'blue') return 30;
  return { easy: 0, normal: 20, hard: 35, extreme: 60 }[diff];
}

export function healthFor(diff: Difficulty, team: TeamId, isPlayer: boolean): number {
  if (isPlayer || team === 'blue') return 100;
  return diff === 'extreme' ? 105 : 100;
}
