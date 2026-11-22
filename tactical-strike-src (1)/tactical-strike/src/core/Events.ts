import type * as THREE from 'three';
import type { Character } from '../entities/Character';
import type { WeaponId } from './types';

/** Everything the simulation announces. Rendering, audio and UI subscribe; the simulation never imports them. */
export interface GameEvents {
  shot: { shooter: Character; weapon: WeaponId; muzzle: THREE.Vector3 };
  tracer: { from: THREE.Vector3; to: THREE.Vector3; shooter: Character };
  impact: { pos: THREE.Vector3; normal: THREE.Vector3; kind: 'world' | 'flesh' };
  hit: { attacker: Character | null; victim: Character; damage: number; head: boolean; from: THREE.Vector3 };
  kill: { killer: Character | null; victim: Character; weapon: WeaponId | 'explosion'; head: boolean };
  explosion: { pos: THREE.Vector3; radius: number };
  reloadStart: { c: Character };
  reloadEnd: { c: Character };
  switched: { c: Character };
  respawn: { c: Character };
  step: { c: Character };
  dryFire: { c: Character };
  matchStart: object;
  matchEnd: { winner: 'blue' | 'red' };
  countdown: { n: number };
}
