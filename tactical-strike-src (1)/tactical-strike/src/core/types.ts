export type TeamId = 'blue' | 'red';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type Quality = 'low' | 'medium' | 'high';
export type WeaponId = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type MapId = 'desert' | 'urban' | 'warehouse' | 'forest';
export type ModeId = 'tdm' | 'bomb';

export const TEAM_NAMES: Record<TeamId, string> = { blue: 'BLUE', red: 'RED' };
export const opposite = (t: TeamId): TeamId => (t === 'blue' ? 'red' : 'blue');
