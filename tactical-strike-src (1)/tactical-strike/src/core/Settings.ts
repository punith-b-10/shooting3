import type { Difficulty, MapId, Quality, WeaponId } from './types';

export interface Settings {
  sensitivity: number; // 0.2 .. 3
  quality: Quality;
  volume: number; // 0 .. 1
  fov: number; // 60 .. 100
  difficulty: Difficulty;
  map: MapId;
  weapon: WeaponId;
}

export interface Stats {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  headshots: number;
  bestStreak: number;
}

const SETTINGS_KEY = 'tactical-strike/settings/v1';
const STATS_KEY = 'tactical-strike/stats/v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  quality: 'medium',
  volume: 0.7,
  fov: 78,
  difficulty: 'hard',
  map: 'desert',
  weapon: 'rifle',
};

export const DEFAULT_STATS: Stats = { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, headshots: 0, bestStreak: 0 };

function load<T extends object>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...defaults };
    return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return { ...defaults };
  }
}
function save(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) — settings just won't persist */
  }
}

/** Corrupt or outdated localStorage must never break startup: clamp numbers and fall back to defaults for unknown ids. */
function sanitize(s: Settings): Settings {
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  return {
    sensitivity: num(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
    fov: num(s.fov, 60, 100, DEFAULT_SETTINGS.fov),
    volume: num(s.volume, 0, 1, DEFAULT_SETTINGS.volume),
    quality: pick(s.quality, ['low', 'medium', 'high'], 'medium'),
    difficulty: pick(s.difficulty, ['easy', 'normal', 'hard', 'extreme'], 'hard'),
    map: pick(s.map, ['desert', 'urban', 'warehouse', 'forest'], 'desert'),
    weapon: pick(s.weapon, ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'], 'rifle'),
  };
}

class Store {
  settings: Settings = sanitize(load(SETTINGS_KEY, DEFAULT_SETTINGS));
  stats: Stats = load(STATS_KEY, DEFAULT_STATS);
  private listeners = new Set<() => void>();

  update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    save(SETTINGS_KEY, this.settings);
    this.listeners.forEach((l) => l());
  }
  addStats(delta: Partial<Stats>) {
    const s = { ...this.stats };
    for (const k of Object.keys(delta) as (keyof Stats)[]) {
      if (k === 'bestStreak') s.bestStreak = Math.max(s.bestStreak, delta.bestStreak ?? 0);
      else s[k] += delta[k] ?? 0;
    }
    this.stats = s;
    save(STATS_KEY, s);
  }
  resetStats() {
    this.stats = { ...DEFAULT_STATS };
    save(STATS_KEY, this.stats);
  }
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const store = new Store();
