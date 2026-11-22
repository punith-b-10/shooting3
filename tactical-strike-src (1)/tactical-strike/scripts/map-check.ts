// Headless map validation: builds every map's collision + nav graph and checks spawns and connectivity.
import { MAP_ORDER, MAPS, buildMapData } from '../src/maps';
import { PhysicsWorld, initPhysics } from '../src/physics/PhysicsWorld';
import { addMapColliders } from '../src/maps/MapPhysics';
import { NavGraph } from '../src/ai/NavGraph';

await initPhysics();
let failed = false;
for (const id of MAP_ORDER) {
  const data = buildMapData(id);
  const pw = new PhysicsWorld();
  addMapColliders(pw, data);
  pw.finalize();
  const t0 = performance.now();
  const nav = new NavGraph(pw, data);
  const ms = (performance.now() - t0).toFixed(0);
  const comp = nav.components();
  const counts = new Map<number, number>();
  comp.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const orphan = nav.nodes.filter((n) => comp[n.id] !== main);
  const links = nav.nodes.reduce((s, n) => s + n.links.length, 0) / 2;
  console.log(`\n== ${MAPS[id].name}: ${data.boxes.length} boxes, ${data.barrels.length} barrels, ${data.decor.length} decor, ${nav.nodes.length} nav nodes, ${links} links (${ms} ms), ${counts.size} components`);
  // spawns
  for (const team of ['blue', 'red'] as const) {
    const sp = data.spawns[team];
    if (sp.length < 4) { console.log(`  !! ${team} has only ${sp.length} spawns`); failed = true; }
    for (const s of sp) {
      const y = pw.groundHeight(s.x, s.z, 2.2);
      if (y === null || pw.standingBlocked(s.x, y, s.z)) { console.log(`  !! ${team} spawn blocked at ${s.x.toFixed(1)},${s.z.toFixed(1)}`); failed = true; continue; }
      const n = nav.nearest({ x: s.x, y, z: s.z } as never);
      if (n < 0 || comp[n] !== main) { console.log(`  !! ${team} spawn not on main nav component at ${s.x.toFixed(1)},${s.z.toFixed(1)}`); failed = true; }
    }
  }
  // blue -> red path
  const b0 = data.spawns.blue[0];
  const r0 = data.spawns.red[0];
  const nb = nav.nearest({ x: b0.x, y: 0, z: b0.z } as never);
  const nr = nav.nearest({ x: r0.x, y: 0, z: r0.z } as never);
  const path = nav.findPath(nb, nr);
  console.log(`  blue->red path: ${path.length ? path.length + ' nodes' : '!! NONE'}`);
  if (!path.length) failed = true;
  const prunedTagged = nav.pruned.filter((n) => n.tags.length);
  console.log(`  pruned ${nav.pruned.length} unreachable nodes` + (prunedTagged.length ? ` — !! TAGGED pruned: ` + prunedTagged.map((n) => `(${n.pos.x.toFixed(1)},${n.pos.y.toFixed(1)},${n.pos.z.toFixed(1)} ${n.tags})`).join(' ') : ''));
  if (orphan.length) {
    console.log(`  orphan nodes (${orphan.length}): ` + orphan.slice(0, 12).map((n) => `(${n.pos.x.toFixed(1)},${n.pos.y.toFixed(1)},${n.pos.z.toFixed(1)})`).join(' '));
  }
  const tagged = nav.nodes.filter((n) => n.tags.length);
  console.log(`  tagged nodes: ${tagged.length}`);
  pw.dispose();
}
if (failed) throw new Error('map check failed');
