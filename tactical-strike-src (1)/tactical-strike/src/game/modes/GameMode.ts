import type { Character } from '../../entities/Character';
import type { Match } from '../Match';
import type { TeamId, ModeId } from '../../core/types';

/**
 * A game mode owns the rules: how kills score, when the match ends and what a respawn means.
 * Match calls these hooks; new modes (e.g. bomb defusal) only need to implement this interface.
 */
export interface GameMode {
  readonly id: ModeId;
  readonly name: string;
  /** Score needed to win (TDM) or rounds (bomb). */
  readonly target: number;
  /** Called when the match starts, after characters are placed. */
  start(match: Match): void;
  onKill(match: Match, killer: Character | null, victim: Character): void;
  update(match: Match, dt: number): void;
  /** Returns the winner or null while the match is still running. */
  winner(match: Match): TeamId | null;
  /** Whether a dead character may respawn right now (round-based modes would say no). */
  canRespawn(match: Match, c: Character): boolean;
  respawnDelay(match: Match, c: Character): number;
}
