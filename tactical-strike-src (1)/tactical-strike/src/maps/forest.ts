import type { MapBuilder, MapDef } from './MapData';

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter(b: MapBuilder, rand: () => number, x0: number, z0: number, x1: number, z1: number, count: number, r: number, treeRatio = 0.8) {
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const x = x0 + rand() * (x1 - x0);
    const z = z0 + rand() * (z1 - z0);
    if (!b.isClear(x, z, r)) continue;
    const roll = rand();
    if (roll < treeRatio) b.tree(x, z, 0.85 + rand() * 0.6, 'pine');
    else if (roll < treeRatio + 0.12) b.rock(x, z, 0.8 + rand() * 0.9);
    else b.bush(x, z, 0.8 + rand() * 0.6);
    placed++;
  }
}

export const forestOutpost: MapDef = {
  id: 'forest',
  name: 'Forest Outpost',
  tagline: 'Military outpost in the pines, watchtowers overhead.',
  description: 'A fortified clearing ringed by dense pine woods. Take a watchtower for the high ground, rush through the camp, or flank through the trees.',
  difficultyNote: 'Open centre · dense woods on the flanks · watchtower sniping',
  ambience: 'forest',
  sky: {
    top: 0x4f86b8, horizon: 0xcfe0d8, bottom: 0xb3cbbd,
    sunDir: [-0.35, 0.58, 0.5], sunColor: 0xfff2d6, sunIntensity: 2.3,
    hemiSky: 0xb8d6ee, hemiGround: 0x4d5f3a, hemiIntensity: 0.95,
    fogColor: 0xbcd0c4, fogDensity: 0.017, exposure: 0.95, clouds: 0.5,
  },
  dust: { color: 0xe4ecd0, count: 160 },
  build(b) {
    b.ground('grass');
    b.perimeter(8, 'rock');

    b.patch(0, 0, 6, 88, 'dirt');
    b.patch(0, 0, 88, 5, 'dirt');
    b.patch(0, 0, 26, 18, 'dirt');

    // ---- Central command post and camp ----
    b.room(0, 0, 10, 7, 4.2, 'concrete', [
      { side: 'n', c: 0, w: 2.4 }, { side: 's', c: 0, w: 2.4 },
      { side: 'e', c: 0, w: 2.4 }, { side: 'w', c: 0, w: 1.4, y0: 1.1, y1: 2.1 },
    ], { roof: 'roofMetal' });
    b.crate(-2.5, 1.2, 1.1);
    b.crate(2.2, -1.4, 1.2);
    b.wp(0, 0, 'key hold');
    for (const [x, z] of [[-9, 6], [9, -6], [-9, -6], [9, 6]] as const) b.sandbags(x, z, 4, 1.0);
    b.sandbags(-12, 0, 1.0, 5);
    b.sandbags(12, 0, 1.0, 5);
    b.barrel(-6.5, 3, true);
    b.barrel(6.5, -3, true);
    b.wp(-9, 0, 'hold');
    b.wp(9, 0, 'hold');

    b.grid(-42, -42, 42, 42, 2.5, 0);

    const rand = mulberry(20260);

    for (const r of [1, -1] as const) {
      b.frame(r, r);
      const team = r === 1 ? 'blue' : 'red';

      // Barracks and supply hut
      b.room(-16, 22, 12, 7, 4, 'concrete', [
        { side: 'e', c: 0, w: 2.4 }, { side: 'n', c: -3, w: 2.4 }, { side: 's', c: 3, w: 2.4 },
        { side: 'w', c: 0, w: 1.2, y0: 1.1, y1: 2.1 },
      ], { roof: 'roofMetal' });
      b.box(-18, 0, 20.4, 3, 1.0, 0.8, 'canvas');
      b.wp(-16, 22, 'hold');
      b.room(20, 30, 8, 6, 3.8, 'concrete', [{ side: 'w', c: 0, w: 2.4 }, { side: 'n', c: 1, w: 2.4 }], { roof: 'roofMetal' });
      b.crate(22, 31.5, 1.2);
      b.wp(20, 30, 'hold');

      // Watchtower with an access ramp
      for (const [x, z] of [[20.5, 14.5], [23.5, 14.5], [20.5, 19.5], [23.5, 19.5]] as const) b.box(x, 0, z, 0.6, 5, 0.6, 'bark');
      b.box(22, 5, 17, 5, 0.3, 5.4, 'woodPlank');
      for (const [x, z] of [[19.7, 14.5], [24.3, 14.5], [19.7, 19.5], [24.3, 19.5]] as const) b.box(x, 5.3, z, 0.25, 2.3, 0.25, 'bark');
      b.box(22, 7.6, 17, 5.6, 0.3, 6, 'roofMetal');
      b.box(22, 5.3, 14.45, 5, 1.0, 0.2, 'woodPlank');
      b.box(22, 5.3, 19.55, 5, 1.0, 0.2, 'woodPlank');
      b.box(19.6, 5.3, 17, 0.2, 1.0, 5.4, 'woodPlank');
      b.box(24.4, 5.3, 15.2, 0.2, 1.0, 1.5, 'woodPlank');
      b.box(24.4, 5.3, 18.8, 0.2, 1.0, 1.5, 'woodPlank');
      b.ramp('x', 34.5, 24.5, 17, 2.4, 0, 5.3, 'woodPlank');
      b.grid(20.2, 15.2, 23.8, 18.8, 1.8, 5.3);
      b.grid(25.5, 17, 33.5, 17, 2, 4);
      b.wp(22, 17, 'hold long', 5.3);

      // Sandbag nests and log barricades
      b.sandbags(-6, 14, 5, 1.0);
      b.sandbags(-8.5, 12.4, 1.0, 3);
      b.sandbags(8, 10, 4, 1.0);
      b.box(4, 0, 22, 6, 1.0, 0.8, 'bark');
      b.box(-2, 0, 30, 0.8, 1.0, 6, 'bark');
      b.box(30, 0, 8, 0.8, 1.0, 6, 'bark');
      b.box(-30, 0, 20, 6, 1.0, 0.8, 'bark');
      b.crate(12, 20, 1.3);
      b.crate(13.2, 20.6, 1.1);
      b.barrel(10, 26, true);
      b.wp(-6, 11, 'hold');
      b.wp(8, 8, 'hold');
      b.wp(4, 25, 'hold');

      // Spawn camp
      b.box(-12, 0, 39, 4, 2.6, 3, 'canvas');
      b.box(12, 0, 39, 4, 2.6, 3, 'canvas');
      b.sandbags(0, 31.5, 6, 1.0);
      for (const [x, z] of [[-6, 37], [-2, 38.5], [2, 38.5], [6, 37], [-4, 41.5], [4, 41.5]] as const) b.spawn(team, x, z);

      // Boulders
      b.rock(-30, 12, 1.8);
      b.rock(32, 38, 1.5);
      b.rock(-8, 34, 1.1);
      b.rock(38, 6, 1.4);

      // Woods: dense west and east flanks, lighter in the middle
      scatter(b, rand, -43, 4, -22, 43, 34, 1.4);
      scatter(b, rand, 24, 4, 43, 43, 26, 1.5);
      scatter(b, rand, -22, 6, 24, 43, 12, 2.2);
    }
    b.frame(1, 1);
  },
};
