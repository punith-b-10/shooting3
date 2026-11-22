// Headless AI simulation: the "player" is driven by a friendly bot brain, 8 bots play a full Team Deathmatch.
// Usage: npx tsx scripts/sim-test.ts [matchesPerCell=3] [maps=desert,urban,warehouse,forest] [difficulties=...]
import { Match } from '../src/game/Match';
import { initPhysics } from '../src/physics/PhysicsWorld';
import type { Difficulty, MapId } from '../src/core/types';

await initPhysics();
const n = Number(process.argv[2] ?? 3);
const maps = (process.argv[3] ?? 'desert,urban,warehouse,forest').split(',') as MapId[];
const diffs = (process.argv[4] ?? 'easy,normal,hard,extreme').split(',') as Difficulty[];
const DT = 1 / 30;
let bad = false;
for (const diff of diffs) {
  let blueW = 0, redW = 0, total = 0, kills = 0, shots = 0, headshots = 0, stale = 0, runtime = 0;
  for (const map of maps) {
    for (let i = 0; i < n; i++) {
      const m = new Match({ map, difficulty: diff, weapon: 'rifle', autoplayer: true, simAggressiveBlue: true, simMirrorProfiles: process.env.MIRROR === '1' });
      m.events.on('shot', () => shots++);
      m.events.on('kill', (k) => { kills++; if (k.head) headshots++; });
      const t0 = performance.now();
      let steps = 0;
      let lastScoreStep = 0;
      let lastTotal = 0;
      while (m.state !== 'ended' && steps < 30 * 60 * 14) {
        m.update(DT);
        steps++;
        const tot = m.score.blue + m.score.red;
        if (tot !== lastTotal) { lastTotal = tot; lastScoreStep = steps; }
        if (steps - lastScoreStep > 30 * 120) { stale++; break; }
      }
      runtime += performance.now() - t0;
      if (m.winnerTeam === 'blue') blueW++; else if (m.winnerTeam === 'red') redW++;
      total++;
      if (!m.winnerTeam) { console.log(`  !! ${map}/${diff} no winner after ${m.time.toFixed(0)}s score ${m.score.blue}-${m.score.red}`); bad = true; }
      console.log(`  ${diff.padEnd(8)} ${map.padEnd(9)} ${m.winnerTeam ?? '-'}  ${m.score.blue}-${m.score.red}  ${m.time.toFixed(0)}s`);
      m.dispose();
    }
  }
  console.log(`== ${diff}: blue ${blueW} / red ${redW} of ${total}, kills ${kills}, shots ${shots}, headshot ${(headshots / Math.max(1, kills) * 100).toFixed(0)}%, stalled ${stale}, sim ${(runtime / 1000).toFixed(1)}s\n`);
}
if (bad) process.exitCode = 1;
