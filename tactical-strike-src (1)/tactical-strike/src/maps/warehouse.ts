import type { MapBuilder, MapDef } from './MapData';

function machine(b: MapBuilder, x: number, z: number, w: number, d: number, h: number) {
  b.box(x, 0, z, w, h, d, 'steel');
  b.box(x, h, z, w * 0.6, 0.6, d * 0.6, 'hazard');
  b.patch(x, z + d / 2 + 0.8, w, 0.5, 'hazard');
}

export const industrialWarehouse: MapDef = {
  id: 'warehouse',
  name: 'Industrial Warehouse',
  tagline: 'A huge factory hall with catwalks and container yards.',
  description: 'Fight indoors among machinery, shelving and columns, climb the catwalks for the high ground, or push through the outdoor container yards.',
  difficultyNote: 'Indoor + outdoor · catwalk high ground · many sightline blockers',
  ambience: 'industrial',
  sky: {
    top: 0x5e7690, horizon: 0xaab7c2, bottom: 0x9ba7b1,
    sunDir: [0.3, 0.75, 0.25], sunColor: 0xfff1da, sunIntensity: 2.4,
    hemiSky: 0xbfd0e4, hemiGround: 0x5b5a57, hemiIntensity: 0.85,
    fogColor: 0xa3afb9, fogDensity: 0.01, exposure: 0.92, clouds: 0.5,
  },
  dust: { color: 0xd8d8d0, count: 150 },
  build(b) {
    b.ground('concrete');
    b.perimeter(10, 'concreteDark');

    // Yard markings
    b.patch(0, 0, 88, 6, 'asphalt');
    b.patch(0, 32, 24, 14, 'asphalt');
    b.patch(0, -32, 24, 14, 'asphalt');
    for (let x = -40; x <= 40; x += 8) b.patch(x, 0, 3, 0.3, 'carYellow');

    // ---- The main hall (30 x 20 half extents), three big openings on each long side and two on each end ----
    b.room(0, 0, 60, 40, 9, 'concrete', [
      { side: 'n', c: -16, w: 6, y1: 4.6 }, { side: 'n', c: 0, w: 6, y1: 4.6 }, { side: 'n', c: 16, w: 6, y1: 4.6 },
      { side: 's', c: -16, w: 6, y1: 4.6 }, { side: 's', c: 0, w: 6, y1: 4.6 }, { side: 's', c: 16, w: 6, y1: 4.6 },
      { side: 'w', c: -10, w: 5, y1: 4.6 }, { side: 'w', c: 10, w: 5, y1: 4.6 },
      { side: 'e', c: -10, w: 5, y1: 4.6 }, { side: 'e', c: 10, w: 5, y1: 4.6 },
    ], { t: 1.2, roof: null });
    // Roof panels with skylight gaps (sun shafts)
    for (const [a, c] of [[-30, -21], [-15, -5], [5, 15], [21, 30]] as const) b.box((a + c) / 2, 9, 0, c - a, 0.4, 40.4, 'roofMetal');
    // Ceiling lamps
    for (const x of [-18, 0, 18]) for (const z of [-12, 0, 12]) b.box(x, 8.4, z, 1.6, 0.25, 0.7, 'glow', { solid: false, cast: false });
    // Interior floor plates
    b.patch(0, 0, 58, 38, 'concreteDark', 0.01);
    for (const z of [-9, 9]) b.patch(0, z, 56, 0.35, 'hazard', 0.02);

    // Central machinery
    machine(b, 0, 0, 8, 5, 3.4);
    b.box(0, 0, 4.7, 2.5, 1.2, 1.2, 'steel');
    b.box(0, 0, -4.7, 2.5, 1.2, 1.2, 'steel');

    b.grid(-42, -42, 42, 42, 2.5, 0);

    // Everything else is built for blue and rotated 180 degrees for red.
    for (const r of [1, -1] as const) {
      b.frame(r, r);
      const team = r === 1 ? 'blue' : 'red';

      // Hall: machines, shelving corridors, columns, crates
      machine(b, -10, 9, 6, 4, 3.2);
      b.box(10, 0, 11, 1.2, 3, 10, 'rust');
      b.box(15, 0, 11, 1.2, 3, 10, 'rust');
      b.box(-17, 0, 14, 10, 0.9, 1.4, 'steel');
      b.car(6, 16, true, 'carYellow');
      for (const x of [-20, -6, 6, 20]) b.box(x, 0, 4, 1.0, 9, 1.0, 'concrete');
      b.crate(-4, 14.5, 1.3);
      b.crate(-2.6, 14.9, 1.1);
      b.crate(3, 9, 1.5);
      b.crate(3, 9, 1.2, 1.5);
      b.barrel(-19, 7, true);
      b.barrel(-19.9, 7.7, true);
      b.barrel(21, 17, false);
      b.wp(0, 17, 'hold');
      b.wp(12.5, 8, 'hold');
      b.wp(-16, 17, 'hold');
      b.wp(-8, 13, 'hold');

      // Catwalk (west in the blue frame, east after rotation) with stairs at its south end
      b.box(-26, 3.6, -3.3, 2.4, 0.4, 31, 'steel');
      b.stairs(-26, 18.6, '-z', 12, 2.4, 'steel');
      b.box(-27.15, 4.0, -3.3, 0.15, 1.1, 31, 'steel');
      b.box(-24.85, 4.0, -3.3, 0.15, 1.1, 31, 'steel');
      b.grid(-26, -18, -26, 11.6, 2.0, 4);
      b.grid(-26, 12.4, -26, 18.2, 1.6, 2);
      b.wp(-26, 4, 'hold', 4);
      b.wp(-26, -10, 'hold', 4);

      // Outdoor container yard
      b.container(-26, 30, 'containerBlue', true);
      b.container(-12, 28, 'containerRed', false);
      b.container(8, 27, 'containerGreen', true);
      b.container(24, 32, 'containerOrange', false);
      b.container(-2, 36, 'containerRed', true);
      b.container(-26, 30, 'containerOrange', true, 2.6);
      b.container(36, 24, 'containerBlue', false);
      b.box(-6, 0, 31, 3, 1.0, 0.6, 'concrete');
      b.box(15, 0, 29, 3, 1.0, 0.6, 'concrete');
      b.box(-18, 0, 40, 4, 1.0, 0.6, 'concrete');
      b.barrel(-8, 24, true);
      b.barrel(-8.9, 24.5, false);
      b.barrel(28, 28, true);
      b.crate(16, 36, 1.4);
      b.crate(-20, 24, 1.2);
      b.wp(0, 32, 'hold');
      b.wp(-18, 26, 'hold');
      b.wp(18, 22, 'hold');
      for (const [x, z] of [[-9, 38], [-5, 39], [4, 39.5], [8, 38], [12, 40], [-13, 41]] as const) b.spawn(team, x, z);

      // Light poles in the yard
      b.box(-32, 0, 22, 0.3, 7, 0.3, 'steel');
      b.box(32, 0, 38, 0.3, 7, 0.3, 'steel');
    }
    b.frame(1, 1);
  },
};
