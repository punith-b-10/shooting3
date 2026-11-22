import type { MapBuilder, MapDef } from './MapData';

/** Writes a big "B" on the ground out of flat patches so the bombsite reads from the air and the minimap. */
function bombsiteLetter(b: MapBuilder, cx: number, cz: number) {
  const m = 'black';
  b.patch(cx - 1.6, cz, 0.7, 5.2, m, 0.03);
  b.patch(cx, cz - 2.25, 3.2, 0.7, m, 0.03);
  b.patch(cx, cz, 3.2, 0.7, m, 0.03);
  b.patch(cx, cz + 2.25, 3.2, 0.7, m, 0.03);
  b.patch(cx + 1.6, cz - 1.15, 0.7, 2.2, m, 0.03);
  b.patch(cx + 1.6, cz + 1.15, 0.7, 2.2, m, 0.03);
}

function gateLeaves(b: MapBuilder, x: number, width: number) {
  // Two open wooden gate leaves swung back against the wall on each side of the passage.
  for (const sz of [1, -1]) {
    b.box(x - width / 2 + 0.2, 0, sz * 1.9, 0.25, 3.3, 2.2, 'woodGate');
    b.box(x + width / 2 - 0.2, 0, sz * 1.9, 0.25, 3.3, 2.2, 'woodGate');
  }
  b.box(x, 3.4, 0, width + 1.4, 0.5, 1.8, 'woodGate');
}

export const desertFortress: MapDef = {
  id: 'desert',
  name: 'Desert Fortress',
  tagline: 'Sandstone walls, wooden gates, one huge bombsite.',
  description: 'A walled desert stronghold split by a central fortress wall. Fight through the narrow west alleys, push the mid gate, or contest the wide open B courtyard.',
  difficultyNote: 'Close quarters west · medium range mid · long sightlines east',
  ambience: 'desert',
  sky: {
    top: 0x3b7bc4, horizon: 0xf0d9b0, bottom: 0xe8cf9c,
    sunDir: [-0.55, 0.62, -0.45], sunColor: 0xfff0d0, sunIntensity: 2.6,
    hemiSky: 0xbcd8ff, hemiGround: 0xc9a56b, hemiIntensity: 0.9,
    fogColor: 0xe6d0a4, fogDensity: 0.011, exposure: 1.0, clouds: 0.35,
  },
  dust: { color: 0xe8d4a8, count: 220 },
  build(b) {
    b.ground('sand');
    b.perimeter(9, 'sandstone');

    // Dirt tracks and plaza stone
    b.patch(0, 0, 12, 88, 'dirt');
    b.patch(-28.5, 0, 6, 88, 'dirt');
    b.patch(31, 0, 30, 14, 'dirt');
    b.patch(-8, 0, 7, 88, 'dirt');

    // ---- Central fortress wall with two wooden gates (west gate x=-28, mid gate x=-8) ----
    b.wallRun('x', 0, -44, 12, 1.4, 6.5, 'sandstone', [
      { side: 'n', c: -28, w: 5, y1: 3.6 },
      { side: 'n', c: -8, w: 6, y1: 3.6 },
    ]);
    gateLeaves(b, -28, 5);
    gateLeaves(b, -8, 6);
    // Crenellations on top of the wall
    for (let x = -43; x <= 11; x += 3) b.box(x, 6.5, 0, 1.4, 0.8, 1.4, 'sandstone');
    b.wp(-28, 0, 'hold');
    b.wp(-8, 0, 'hold');

    // ---- B courtyard entrance: stone pillars with a wooden beam ----
    for (const z of [4.5, -4.5]) b.box(15, 0, z, 1.3, 5.2, 1.3, 'stone');
    b.box(15, 3.9, 0, 1.0, 0.6, 10.3, 'woodGate');
    b.box(15, 5.2, 4.5, 1.7, 0.4, 1.7, 'stone');
    b.box(15, 5.2, -4.5, 1.7, 0.4, 1.7, 'stone');

    // ---- B bombsite ----
    b.patch(31, 0, 13, 11, 'concreteDark', 0.01);
    b.patch(31, 5.8, 13.6, 0.35, 'hazard', 0.02);
    b.patch(31, -5.8, 13.6, 0.35, 'hazard', 0.02);
    b.patch(24.3, 0, 0.35, 11.6, 'hazard', 0.02);
    b.patch(37.7, 0, 0.35, 11.6, 'hazard', 0.02);
    bombsiteLetter(b, 31, 0);
    b.wp(31, 0, 'key');
    b.wp(27, 4, 'hold');
    b.wp(27, -4, 'hold');
    b.wp(36, 0, 'hold');

    // Cover on the bombsite (not mirrored so it plays a little differently each side)
    b.crate(26.5, 2.8, 1.4);
    b.crate(26.5, 2.8, 1.2, 1.4);
    b.crate(33.5, -3, 1.4);
    b.crate(34.8, -3.3, 1.2);
    b.crate(30, 0.4, 1.0);
    b.box(35, 0, 3, 1.2, 1.2, 3.4, 'stone');
    b.box(27, 0, -2.8, 3.4, 1.2, 1.2, 'stone');
    b.barrel(38.5, -2.5, true);
    b.barrel(39.4, -3.3, true);
    b.barrel(22.5, 3, true);

    b.grid(-42, -42, 42, 42, 2.5, 0);

    // ---- Features built once for the blue half, mirrored for red ----
    for (const s of [1, -1] as const) {
      b.frame(1, s);

      // West houses along a narrow alley
      b.room(-37, 16, 10, 10, 5.5, 'sandstone', [
        { side: 'e', c: 0, w: 2.6 },
        { side: 'n', c: -2, w: 2.4 },
        { side: 'w', c: 4, w: 1.2, y0: 1.2, y1: 2.2 },
      ]);
      b.room(-20, 18, 10, 8, 5, 'sandstone', [
        { side: 'w', c: 0, w: 2.6 },
        { side: 's', c: 3, w: 2.4 },
        { side: 'n', c: -3, w: 2.4 },
        { side: 'e', c: 0, w: 1.4, y0: 1.2, y1: 2.2 },
      ]);
      b.crate(-39.5, 19.4, 1.2);
      b.crate(-34.6, 13.5, 1.1);
      b.barrel(-31, 13, true);
      b.barrel(-30.3, 12.2, false);
      b.box(-27, 0, 25.5, 3, 1.3, 0.7, 'sandstone');
      b.box(-31, 0, 29, 0.7, 1.3, 3, 'sandstone');
      b.wp(-37, 16, 'hold');
      b.wp(-20, 18, 'hold');
      b.wp(-28.5, 4, 'hold');

      // Ruined keep next to the mid gate with a sniper window
      b.room(9, 7, 6, 6, 6, 'sandstone', [
        { side: 'w', c: 0, w: 2.2 },
        { side: 'n', c: 0, w: 2.2 },
        { side: 'e', c: 0, w: 1.2, y0: 1.1, y1: 2.1 },
      ]);
      b.wp(9, 7, 'hold');

      // Mid street cover
      b.crate(-12.5, 10, 1.4);
      b.crate(-12.5, 10, 1.2, 1.4);
      b.box(-3, 0, 13, 5, 1.3, 0.8, 'sandstone');
      b.container(2, 21, 'containerGreen', false);
      b.barrel(-4, 24, true);
      b.barrel(-4.9, 24.4, false);

      // Spawn yard
      b.sandbags(-10, 28, 6, 1.0);
      b.sandbags(8, 28, 6, 1.0);
      b.crate(-14, 35, 1.2);
      b.crate(12, 36, 1.5);
      b.barrel(13, 33, true);
      b.barrel(-14.8, 31, false);
      b.box(-17, 0, 41, 8, 3.5, 2, 'stone');
      b.box(17, 0, 41, 8, 3.5, 2, 'stone');
      b.wp(0, 35, 'hold');
      for (const x of [-10, -6, -2, 2, 6, 10]) b.spawn(s === 1 ? 'blue' : 'red', x, 37 + (Math.abs(x) % 3));

      // East courtyard
      b.box(17, 0, 8.4, 1.0, 4, 7, 'sandstone');
      b.container(24, 8, 'containerOrange', true);
      b.container(35, 7.5, 'containerRed', false);
      b.container(30, 16, 'containerGreen', true);
      b.container(40, 22, 'containerBlue', false);
      b.box(20, 0, 18, 6, 1.3, 0.7, 'sandstone');
      b.box(36, 0, 20, 0.7, 1.3, 6, 'sandstone');
      b.crate(30, 11.5, 1.2);
      b.barrel(40, 8.5, false);
      b.barrel(21, 22, true);
      b.room(38, 32, 8, 8, 5, 'sandstone', [
        { side: 'w', c: 0, w: 2.4 },
        { side: 'n', c: 2, w: 2.4 },
        { side: 's', c: 0, w: 1.4, y0: 1.1, y1: 2.1 },
      ]);
      b.wp(38, 32, 'hold');
      b.wp(24, 12, 'hold');
      b.wp(22, 20, 'hold');

      // Palms, rocks and columns
      b.tree(-40, 36, 1.1, 'palm');
      b.tree(41, 39, 1, 'palm');
      b.tree(-12, 40, 0.9, 'palm');
      b.rock(-41, 4, 1.3);
      b.rock(42, 14, 1.6);
      b.rock(26, 38, 1.2);
      for (const x of [-4, 3]) b.box(x, 0, 6, 0.9, 3.4, 0.9, 'sandstone');
    }
    b.frame(1, 1);
  },
};
