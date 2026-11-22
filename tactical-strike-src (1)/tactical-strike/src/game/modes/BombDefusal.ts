import type { GameMode } from './GameMode';

/**
 * Architecture hook for the future bomb-defusal mode (NOT selectable in the UI yet).
 *
 * What a full implementation adds on top of the GameMode interface:
 *  - round state machine (freeze time -> live -> planted -> round end) driven from `update`;
 *  - plant / defuse interaction zones taken from tagged map waypoints ('key' nodes, e.g. the B bombsite on Desert Fortress);
 *  - `canRespawn` returning false until the next round, and `winner` counting rounds;
 *  - bot orders in ai/TeamAI.ts: 'plant', 'defuse', 'guard-site' in addition to the existing hold/push/flank orders.
 * Everything else (combat, weapons, AI perception, HUD events) is already mode-agnostic.
 */
export const bombDefusal: GameMode = {
  id: 'bomb',
  name: 'Bomb Defusal',
  target: 7,
  start() {},
  onKill() {},
  update() {},
  winner: () => null,
  canRespawn: () => false,
  respawnDelay: () => 999,
};
