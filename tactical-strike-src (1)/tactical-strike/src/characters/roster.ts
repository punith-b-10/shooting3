import type { TeamId, WeaponId } from '../core/types';

export type Headgear = 'helmet' | 'cap' | 'beanie' | 'bandana' | 'hood';

export interface Appearance {
  uniform: number;
  pants: number;
  vest: number;
  accent: number;
  skin: number;
  headgear: Headgear;
  headgearColor: number;
  visor: boolean;
  scale: number;
}

export interface RosterEntry {
  name: string;
  team: TeamId;
  weapon: WeaponId | null; // null = chosen by the player
  look: Appearance;
}

const skins = [0xf0c8a0, 0xd9a273, 0xb07a4f, 0x8a5a3a, 0x5e3b27];

/** 4 blue + 4 red, each with their own name, uniform and weapon. Blue = navy/steel tones, red = crimson/rust tones. */
export const ROSTER: RosterEntry[] = [
  { name: 'YOU', team: 'blue', weapon: null, look: { uniform: 0x2c5aa0, pants: 0x1f2d4a, vest: 0x203452, accent: 0x6fb3ff, skin: skins[1], headgear: 'helmet', headgearColor: 0x23406b, visor: true, scale: 1 } },
  { name: 'HAWK', team: 'blue', weapon: 'rifle', look: { uniform: 0x3a6fb5, pants: 0x2a3550, vest: 0x2b3f5c, accent: 0xffffff, skin: skins[0], headgear: 'helmet', headgearColor: 0x39495f, visor: false, scale: 1.02 } },
  { name: 'NOVA', team: 'blue', weapon: 'smg', look: { uniform: 0x1f4d7a, pants: 0x15283d, vest: 0x34506e, accent: 0x4ff0ff, skin: skins[2], headgear: 'cap', headgearColor: 0x16314f, visor: false, scale: 0.97 } },
  { name: 'BISHOP', team: 'blue', weapon: 'shotgun', look: { uniform: 0x4b6b8f, pants: 0x2d3b4c, vest: 0x232b36, accent: 0xffd36b, skin: skins[3], headgear: 'beanie', headgearColor: 0x1c2733, visor: false, scale: 1.04 } },
  { name: 'VIPER', team: 'red', weapon: 'rifle', look: { uniform: 0xa8302a, pants: 0x3a1f1c, vest: 0x2a2220, accent: 0xff7a5a, skin: skins[1], headgear: 'helmet', headgearColor: 0x4a2723, visor: true, scale: 1.03 } },
  { name: 'RAVEN', team: 'red', weapon: 'smg', look: { uniform: 0x7a2a2a, pants: 0x241817, vest: 0x40302d, accent: 0xffffff, skin: skins[0], headgear: 'bandana', headgearColor: 0x111111, visor: false, scale: 0.98 } },
  { name: 'COBRA', team: 'red', weapon: 'sniper', look: { uniform: 0x6a3b24, pants: 0x2b211a, vest: 0x3a2c22, accent: 0xffb347, skin: skins[3], headgear: 'hood', headgearColor: 0x3a2a1e, visor: false, scale: 1.0 } },
  { name: 'GHOST', team: 'red', weapon: 'shotgun', look: { uniform: 0x8c1f3d, pants: 0x1a1517, vest: 0x1f1a1c, accent: 0xd0d0d0, skin: skins[4], headgear: 'helmet', headgearColor: 0x201b1d, visor: true, scale: 1.06 } },
];
