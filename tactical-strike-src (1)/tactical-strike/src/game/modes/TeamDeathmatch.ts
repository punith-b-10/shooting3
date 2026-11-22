import type { GameMode } from './GameMode';
import type { Match } from '../Match';
import type { Character } from '../../entities/Character';
import type { TeamId } from '../../core/types';

export const KILL_TARGET = 15;
export const TIME_LIMIT = 600; // seconds, then the leading team wins (ties go to sudden death)

export const teamDeathmatch: GameMode = {
  id: 'tdm',
  name: 'Team Deathmatch',
  target: KILL_TARGET,
  start() {},
  onKill(match: Match, killer: Character | null, victim: Character) {
    // Suicides and barrel accidents cost the victim's team a point; kills credit the killer's team.
    if (killer && killer.team !== victim.team) match.score[killer.team]++;
    else if (!killer || killer === victim) match.score[victim.team] = Math.max(0, match.score[victim.team] - 1);
  },
  update() {},
  winner(match: Match): TeamId | null {
    const { blue, red } = match.score;
    if (blue >= KILL_TARGET && blue > red) return 'blue';
    if (red >= KILL_TARGET && red > blue) return 'red';
    if (match.time >= TIME_LIMIT && blue !== red) return blue > red ? 'blue' : 'red';
    return null;
  },
  canRespawn: () => true,
  respawnDelay: (_m, c) => (c.isPlayer ? 3.5 : 4),
};
