import type { WeaponId } from '../core/types';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  key: number; // 1..5 hotkey
  role: string;
  damage: number; // per bullet / pellet
  pellets: number;
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reload: number; // seconds
  range: number; // metres, no damage beyond
  falloff: number; // metres at which damage starts to drop
  spreadHip: number; // degrees
  spreadAds: number;
  recoil: number; // degrees of pitch kick per shot
  recoilYaw: number;
  adsFovMul: number; // fov multiplier when aiming (ignored for scoped)
  scoped: boolean;
  scopeFov: number;
  moveMul: number;
  headMul: number;
  // bot behaviour
  prefMin: number;
  prefMax: number;
  burstMin: number;
  burstMax: number;
  blurb: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'M9 Sidearm', key: 1, role: 'Sidearm',
    damage: 26, pellets: 1, rpm: 380, auto: false, mag: 15, reserve: 90, reload: 1.5,
    range: 90, falloff: 25, spreadHip: 1.5, spreadAds: 0.45, recoil: 1.7, recoilYaw: 0.35,
    adsFovMul: 0.86, scoped: false, scopeFov: 0, moveMul: 1.0, headMul: 2.6,
    prefMin: 6, prefMax: 38, burstMin: 1, burstMax: 1,
    blurb: 'Accurate and quick to draw. Weak at range.',
  },
  rifle: {
    id: 'rifle', name: 'AR-7 Assault Rifle', key: 2, role: 'Assault rifle',
    damage: 28, pellets: 1, rpm: 620, auto: true, mag: 30, reserve: 120, reload: 2.2,
    range: 160, falloff: 45, spreadHip: 2.4, spreadAds: 0.35, recoil: 1.05, recoilYaw: 0.5,
    adsFovMul: 0.72, scoped: false, scopeFov: 0, moveMul: 0.93, headMul: 2.5,
    prefMin: 14, prefMax: 65, burstMin: 3, burstMax: 6,
    blurb: 'Balanced all-rounder. Control the recoil in bursts.',
  },
  smg: {
    id: 'smg', name: 'MP-9 SMG', key: 3, role: 'Submachine gun',
    damage: 17, pellets: 1, rpm: 900, auto: true, mag: 35, reserve: 140, reload: 1.8,
    range: 75, falloff: 22, spreadHip: 2.7, spreadAds: 0.9, recoil: 0.75, recoilYaw: 0.6,
    adsFovMul: 0.82, scoped: false, scopeFov: 0, moveMul: 1.04, headMul: 2.2,
    prefMin: 4, prefMax: 30, burstMin: 4, burstMax: 10,
    blurb: 'Huge fire rate and mobility. Best up close.',
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Shotgun', key: 4, role: 'Shotgun',
    damage: 12, pellets: 9, rpm: 72, auto: false, mag: 6, reserve: 36, reload: 2.6,
    range: 32, falloff: 9, spreadHip: 4.8, spreadAds: 3.4, recoil: 6.0, recoilYaw: 0.8,
    adsFovMul: 0.88, scoped: false, scopeFov: 0, moveMul: 0.96, headMul: 1.8,
    prefMin: 2, prefMax: 13, burstMin: 1, burstMax: 1,
    blurb: 'Devastating in corridors. Useless at range.',
  },
  sniper: {
    id: 'sniper', name: 'LR-90 Sniper', key: 5, role: 'Sniper rifle',
    damage: 92, pellets: 1, rpm: 52, auto: false, mag: 5, reserve: 25, reload: 2.9,
    range: 320, falloff: 400, spreadHip: 6.5, spreadAds: 0.04, recoil: 4.5, recoilYaw: 0.3,
    adsFovMul: 1, scoped: true, scopeFov: 16, moveMul: 0.86, headMul: 2.5,
    prefMin: 30, prefMax: 200, burstMin: 1, burstMax: 1,
    blurb: 'One-shot headshots. Right-click to scope.',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'];
export const weaponByKey = (k: number): WeaponId | null => WEAPON_ORDER[k - 1] ?? null;
