import { Match } from '../src/game/Match';
import { initPhysics } from '../src/physics/PhysicsWorld';
await initPhysics();
const diff = (process.argv[2] ?? 'easy') as 'easy';
const agg = new Map<string, { k: number; d: number }>();
for (const map of ['desert', 'urban', 'warehouse', 'forest'] as const) {
  for (let i = 0; i < 3; i++) {
    const m = new Match({ map, difficulty: diff, weapon: 'rifle', autoplayer: true, simAggressiveBlue: true, simMirrorProfiles: process.env.MIRROR === '1' });
    let s = 0;
    while (m.state !== 'ended' && s < 30 * 600) { m.update(1 / 30); s++; }
    for (const c of m.chars) { const a = agg.get(c.name) ?? { k: 0, d: 0 }; a.k += c.kills; a.d += c.deaths; agg.set(c.name, a); }
    m.dispose();
  }
}
for (const [n, a] of agg) console.log(n.padEnd(8), 'K', String(a.k).padStart(3), 'D', String(a.d).padStart(3));
