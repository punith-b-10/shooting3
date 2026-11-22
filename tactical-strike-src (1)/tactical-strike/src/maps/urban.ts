import type { MapBuilder, MapDef } from './MapData';

function lamp(b: MapBuilder, x: number, z: number) {
  b.box(x, 0, z, 0.25, 5.2, 0.25, 'steel');
  b.box(x, 5.0, z, 0.9, 0.2, 0.5, 'glow', { solid: false, cast: false });
}

function parapet(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number, gaps: { side: 'n' | 's' | 'e' | 'w'; a: number; b: number }[] = []) {
  const t = 0.3;
  const h = 1.0;
  const seg = (side: 'n' | 's' | 'e' | 'w') => {
    const horiz = side === 'n' || side === 's';
    const from = horiz ? x0 : z0;
    const to = horiz ? x1 : z1;
    const fixed = side === 'n' ? z0 + t / 2 : side === 's' ? z1 - t / 2 : side === 'w' ? x0 + t / 2 : x1 - t / 2;
    const cuts = gaps.filter((g) => g.side === side).sort((p, q) => p.a - q.a);
    let cur = from;
    const put = (a: number, c: number) => {
      if (c - a < 0.1) return;
      const mid = (a + c) / 2;
      if (horiz) b.box(mid, y, fixed, c - a, h, t, 'concrete');
      else b.box(fixed, y, mid, t, h, c - a, 'concrete');
    };
    for (const g of cuts) {
      put(cur, g.a);
      cur = g.b;
    }
    put(cur, to);
  };
  (['n', 's', 'e', 'w'] as const).forEach(seg);
}

export const urbanCity: MapDef = {
  id: 'urban',
  name: 'Urban City',
  tagline: 'Streets, rooftops and tight corridors.',
  description: 'A rain-washed downtown intersection. Use the roof ramps for height, fight through office corridors, or hold the avenue between abandoned cars.',
  difficultyNote: 'Vertical play · tight interiors · long avenue',
  ambience: 'city',
  sky: {
    top: 0x4a6a96, horizon: 0xc2cfdc, bottom: 0xb8c3cf,
    sunDir: [0.45, 0.7, -0.35], sunColor: 0xfff4e0, sunIntensity: 2.2,
    hemiSky: 0xc8d8f0, hemiGround: 0x6d6b68, hemiIntensity: 1.0,
    fogColor: 0xb9c4cf, fogDensity: 0.012, exposure: 0.95, clouds: 0.6,
  },
  dust: null,
  build(b) {
    b.ground('concrete');
    b.perimeter(14, 'facadeDark');

    // Roads, sidewalks, markings
    b.patch(0, 0, 12, 88, 'asphalt');
    b.patch(0, 0, 88, 10, 'asphalt');
    for (const sx of [-1, 1]) b.patch(sx * 7.2, 0, 2, 88, 'concreteDark');
    for (const sz of [-1, 1]) b.patch(0, sz * 6.2, 88, 2, 'concreteDark');
    for (let z = -40; z <= 40; z += 6) if (Math.abs(z) > 6) b.patch(0, z, 0.3, 3, 'carYellow');
    for (let x = -40; x <= 40; x += 6) if (Math.abs(x) > 6) b.patch(x, 0, 3, 0.3, 'carYellow');
    for (let k = -5; k <= 5; k += 1) {
      b.patch(k * 1, 4.4, 0.5, 2, 'carWhite', 0.01);
      b.patch(k * 1, -4.4, 0.5, 2, 'carWhite', 0.01);
    }

    // Central plaza kiosk gives the crossing a little cover
    b.box(0, 0, 0, 3.2, 1.3, 3.2, 'concrete');
    b.box(0, 1.3, 0, 3.6, 0.3, 3.6, 'concreteDark');
    b.wp(0, 3.5, 'key');
    b.wp(0, -3.5, 'key');

    b.grid(-42, -42, 42, 42, 2.5, 0);

    // The blue half is built once, then rotated 180 degrees for red so both sides play identically.
    for (const r of [1, -1] as const) {
      b.frame(r, r);
      const team = r === 1 ? 'blue' : 'red';

      // ---- SE apartments with an accessible roof ----
      b.room(17, 14, 14, 12, 5, 'facade', [
        { side: 'w', c: 0, w: 2.6 },
        { side: 'n', c: -3, w: 2.6 },
        { side: 'w', c: -4, w: 1.6, y0: 1.0, y1: 2.2 },
        { side: 's', c: 3, w: 1.6, y0: 1.0, y1: 2.2 },
        { side: 'e', c: 3, w: 1.6, y0: 1.0, y1: 2.2 },
      ], { roof: 'concrete' });
      b.wallRun('x', 17.5, 10.6, 16, 0.4, 3.0, 'plaster');
      b.crate(21.5, 18.5, 1.2);
      b.crate(12, 10, 1.1);
      b.wp(17, 11, 'hold');
      parapet(b, 10, 8, 24, 20, 5.4, [{ side: 'e', a: 12.5, b: 15.5 }]);
      b.box(14, 5.4, 11, 2, 1.2, 1.5, 'steel');
      b.box(20, 5.4, 17, 2.4, 1.0, 1.6, 'steel');
      b.ramp('x', 35, 24, 14, 3, 0, 5.4, 'concreteDark');
      b.grid(10.6, 8.6, 23.4, 19.4, 2.0, 5.4);
      b.grid(24.4, 13, 34.6, 15, 2.0, 4);
      b.wp(17, 14, 'hold', 5.4);

      // ---- SE annex warehouse ----
      b.room(31, 31, 16, 10, 5, 'concreteDark', [
        { side: 'w', c: 0, w: 3 },
        { side: 'n', c: -5, w: 3 },
        { side: 's', c: 4, w: 2.6 },
      ], { roof: 'roofMetal' });
      b.crate(28, 33, 1.3);
      b.crate(29.4, 33.4, 1.1);
      b.crate(35, 29, 1.5);
      b.box(33, 0, 32, 4, 1.0, 0.6, 'steel');
      b.wp(31, 31, 'hold');

      // ---- Courtyard dressing ----
      b.car(30, 20, true, 'carRed');
      b.car(14, 26, false, 'carWhite');
      b.box(40, 0, 12, 3, 1.4, 1.6, 'steel');
      b.barrel(36, 22, true);
      b.barrel(36.9, 22.5, false);
      b.box(12, 0, 22.5, 4, 0.9, 1, 'concrete');
      lamp(b, 8, 10);
      lamp(b, 8, 30);

      // ---- SW office tower (no roof access) ----
      b.room(-18, 16, 12, 14, 9, 'facade', [
        { side: 'e', c: 0, w: 2.8 },
        { side: 'n', c: -2, w: 2.8 },
        { side: 'w', c: 3, w: 2.6 },
        { side: 's', c: 2, w: 2.4 },
        { side: 'e', c: 4.5, w: 1.6, y0: 1.0, y1: 2.2 },
      ], { roof: 'concrete' });
      b.wallRun('x', 13, -23.4, -12.6, 0.4, 3.2, 'plaster', [{ side: 'n', c: -17, w: 2.2 }]);
      b.box(-21, 0, 21.5, 3, 1.0, 1.0, 'steel');
      b.crate(-14, 20.5, 1.2);
      b.wp(-18, 20, 'hold');
      b.wp(-18, 11, 'hold');

      // ---- SW long block with corridors and a stair-accessed roof ----
      b.room(-34, 26, 10, 22, 5, 'brick', [
        { side: 'e', c: -6, w: 2.6 },
        { side: 'e', c: 6, w: 2.6 },
        { side: 'n', c: 3, w: 2.4 },
        { side: 'w', c: 0, w: 1.4, y0: 1.1, y1: 2.1 },
        { side: 's', c: -3, w: 2.4 },
      ], { roof: 'roofMetal' });
      b.wallRun('x', 22, -38.4, -29.6, 0.4, 3.2, 'plaster', [{ side: 'n', c: -36, w: 1.8 }]);
      b.wallRun('x', 30, -38.4, -29.6, 0.4, 3.2, 'plaster', [{ side: 'n', c: -32.5, w: 1.8 }]);
      b.stairs(-34, 6.2, '+z', 16, 2.4, 'concreteDark');
      parapet(b, -39, 15, -29, 37, 5.4, [{ side: 'n', a: -35.2, b: -32.8 }]);
      b.box(-34, 5.4, 26, 2, 1.1, 2, 'steel');
      b.grid(-38.4, 15.6, -29.6, 36.4, 2.0, 5.4);
      b.grid(-35.2, 6.6, -32.8, 14.8, 1.6, 3.5);
      b.wp(-34, 26, 'hold', 5.4);
      b.wp(-34, 18, 'hold');

      // ---- Avenue cover and spawn ----
      b.car(-3, 20, false, 'carBlue');
      b.car(3, 12, false, 'carYellow');
      b.box(-3.5, 0, 29, 4.5, 1.0, 0.7, 'concrete');
      b.box(4, 0, 29, 3.5, 1.0, 0.7, 'concrete');
      b.box(-7.8, 0, 36, 0.8, 1.2, 4, 'concrete');
      b.box(7.8, 0, 36, 0.8, 1.2, 4, 'concrete');
      b.barrel(-5.4, 24, false);
      lamp(b, -8, 14);
      lamp(b, -8, 34);
      b.wp(0, 24, 'hold');
      for (const [x, z] of [[-4, 37], [0, 38], [4, 37], [-4, 41], [0, 41.5], [4, 41]] as const) b.spawn(team, x, z);

      // Scenery
      b.box(-41, 0, 40, 3, 6, 3, 'concreteDark');
      b.box(41, 0, 40, 3, 4, 3, 'concreteDark');
    }
    b.frame(1, 1);
  },
};
