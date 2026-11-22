import type { MapId, TeamId } from '../core/types';

export type MatKey =
  | 'sand' | 'sandstone' | 'stone' | 'woodGate' | 'woodPlank' | 'rust'
  | 'containerRed' | 'containerBlue' | 'containerGreen' | 'containerOrange'
  | 'concrete' | 'concreteDark' | 'asphalt' | 'grass' | 'dirt' | 'brick' | 'tile'
  | 'rock' | 'bark' | 'facade' | 'facadeDark' | 'hazard' | 'steel' | 'carBlue'
  | 'carRed' | 'carWhite' | 'carYellow' | 'foliage' | 'foliageDark' | 'plaster'
  | 'canvas' | 'sandbag' | 'glow' | 'black' | 'roofMetal' | 'wood';

export interface BoxDef {
  x: number; y: number; z: number; // centre
  w: number; h: number; d: number;
  mat: MatKey;
  rot?: [number, number, number]; // euler XYZ radians
  solid: boolean;
  cast: boolean;
}

export type DecorKind = 'pine' | 'palm' | 'rock' | 'bush';
export interface DecorDef { kind: DecorKind; x: number; z: number; s: number; ry: number; y: number }
export interface BarrelDef { x: number; z: number; y: number; explosive: boolean }
export interface SpawnDef { x: number; z: number; yaw: number }
export interface WaypointDef { x: number; z: number; level: number; tags: string[] }
export interface GridDef { level: number; pts: [number, number][] }
export interface SkyDef {
  top: number; horizon: number; bottom: number;
  sunDir: [number, number, number]; sunColor: number; sunIntensity: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  fogColor: number; fogDensity: number; exposure: number; clouds: number;
}

export interface MapData {
  id: MapId;
  half: number; // playable half extent
  boxes: BoxDef[];
  decor: DecorDef[];
  barrels: BarrelDef[];
  spawns: Record<TeamId, SpawnDef[]>;
  waypoints: WaypointDef[];
  grids: GridDef[];
}

export interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  description: string;
  difficultyNote: string;
  ambience: 'desert' | 'city' | 'industrial' | 'forest';
  sky: SkyDef;
  dust: { color: number; count: number } | null;
  build(b: MapBuilder): void;
}

export interface Opening { side: 'n' | 's' | 'e' | 'w'; c: number; w: number; y0?: number; y1?: number }

/**
 * Collects the static layout of a map. Coordinates: x = east/west, z = north/south, y = up.
 * Blue spawns at +z (south), red at -z (north).
 */
const bz = (b: BoxDef) => b.z;

export class MapBuilder {
  readonly data: MapData;
  private sx = 1;
  private sz = 1;
  constructor(id: MapId, half: number) {
    this.data = { id, half, boxes: [], decor: [], barrels: [], spawns: { blue: [], red: [] }, waypoints: [], grids: [] };
  }

  /**
   * Mirror/rotate everything built afterwards. frame(1,-1) mirrors across z=0, frame(-1,-1) rotates 180 degrees.
   * Composite helpers (room, stairs, ...) are built from box(), so they follow the active frame automatically.
   */
  frame(sx: 1 | -1, sz: 1 | -1) {
    this.sx = sx;
    this.sz = sz;
  }

  /** Box with its BASE at y0 and horizontal centre at (x, z). */
  box(x: number, y0: number, z: number, w: number, h: number, d: number, mat: MatKey, o: { solid?: boolean; cast?: boolean; rot?: [number, number, number] } = {}) {
    this.data.boxes.push({ x: x * this.sx, y: y0 + h / 2, z: z * this.sz, w, h, d, mat, rot: o.rot, solid: o.solid ?? true, cast: o.cast ?? true });
  }

  /** Visual-only flat patch on the ground (roads, paths, markings). */
  patch(x: number, z: number, w: number, d: number, mat: MatKey, y = 0) {
    this.data.boxes.push({ x: x * this.sx, y: y + 0.015, z: z * this.sz, w, h: 0.03, d, mat, solid: false, cast: false });
  }

  ground(mat: MatKey) {
    const s = this.data.half + 40;
    this.data.boxes.push({ x: 0, y: -1, z: 0, w: s * 2, h: 2, d: s * 2, mat, solid: true, cast: false });
  }

  perimeter(h: number, mat: MatKey, t = 3) {
    const e = this.data.half;
    this.box(0, 0, -e - t / 2, e * 2 + t * 2, h, t, mat);
    this.box(0, 0, e + t / 2, e * 2 + t * 2, h, t, mat);
    this.box(-e - t / 2, 0, 0, t, h, e * 2, mat);
    this.box(e + t / 2, 0, 0, t, h, e * 2, mat);
  }

  /** Wall running along an axis with optional openings (doors, windows). */
  wallRun(axis: 'x' | 'z', fixed: number, from: number, to: number, t: number, h: number, mat: MatKey, openings: Opening[] = [], y0 = 0) {
    const ops = [...openings].sort((a, b) => a.c - b.c);
    const seg = (a: number, b: number, yb: number, hh: number) => {
      if (b - a < 0.05 || hh < 0.05) return;
      const mid = (a + b) / 2;
      const len = b - a;
      if (axis === 'x') this.box(mid, yb, fixed, len, hh, t, mat);
      else this.box(fixed, yb, mid, t, hh, len, mat);
    };
    let cur = from;
    for (const o of ops) {
      const a = o.c - o.w / 2;
      const b = o.c + o.w / 2;
      seg(cur, a, y0, h);
      const oy0 = o.y0 ?? 0;
      const oy1 = o.y1 ?? 2.6;
      if (oy0 > 0) seg(a, b, y0, oy0);
      if (oy1 < h) seg(a, b, y0 + oy1, h - oy1);
      cur = b;
    }
    seg(cur, to, y0, h);
  }

  /** Rectangular building with walls, openings and an optional roof slab. */
  room(cx: number, cz: number, w: number, d: number, h: number, mat: MatKey, openings: Opening[] = [], o: { t?: number; roof?: MatKey | null; y0?: number } = {}) {
    const t = o.t ?? 0.6;
    const y0 = o.y0 ?? 0;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const side = (s: Opening['side']) => openings.filter((p) => p.side === s);
    // north (-z) and south (+z) walls run along x; offsets are relative to the wall centre
    this.wallRun('x', z0 + t / 2, x0, x1, t, h, mat, side('n').map((p) => ({ ...p, c: p.c + cx })), y0);
    this.wallRun('x', z1 - t / 2, x0, x1, t, h, mat, side('s').map((p) => ({ ...p, c: p.c + cx })), y0);
    this.wallRun('z', x0 + t / 2, z0 + t, z1 - t, t, h, mat, side('w').map((p) => ({ ...p, c: p.c + cz })), y0);
    this.wallRun('z', x1 - t / 2, z0 + t, z1 - t, t, h, mat, side('e').map((p) => ({ ...p, c: p.c + cz })), y0);
    if (o.roof !== null) this.box(cx, y0 + h, cz, w + 0.4, 0.4, d + 0.4, o.roof ?? mat);
    // Doorway waypoints: one in the opening, one on each side, so bots can path through every door.
    for (const p of openings) {
      if ((p.y0 ?? 0) > 0) continue;
      const off = t / 2 + 1.3;
      if (p.side === 'n') { this.wp(cx + p.c, z0 + t / 2, '', y0); this.wp(cx + p.c, z0 - off + t / 2, '', y0); this.wp(cx + p.c, z0 + off + t / 2, '', y0); }
      if (p.side === 's') { this.wp(cx + p.c, z1 - t / 2, '', y0); this.wp(cx + p.c, z1 - t / 2 - off, '', y0); this.wp(cx + p.c, z1 - t / 2 + off, '', y0); }
      if (p.side === 'w') { this.wp(x0 + t / 2, cz + p.c, '', y0); this.wp(x0 + t / 2 - off, cz + p.c, '', y0); this.wp(x0 + t / 2 + off, cz + p.c, '', y0); }
      if (p.side === 'e') { this.wp(x1 - t / 2, cz + p.c, '', y0); this.wp(x1 - t / 2 - off, cz + p.c, '', y0); this.wp(x1 - t / 2 + off, cz + p.c, '', y0); }
    }
  }

  /** Solid staircase. dir is the direction of ascent. */
  stairs(x: number, z: number, dir: '+x' | '-x' | '+z' | '-z', steps: number, width: number, mat: MatKey, y0 = 0, rise = 0.34, run = 0.55) {
    for (let i = 0; i < steps; i++) {
      const h = (i + 1) * rise;
      const off = i * run + run / 2;
      const sx = dir === '+x' ? off : dir === '-x' ? -off : 0;
      const sz = dir === '+z' ? off : dir === '-z' ? -off : 0;
      const alongX = dir === '+x' || dir === '-x';
      this.box(x + sx, y0, z + sz, alongX ? run : width, h, alongX ? width : run, mat);
    }
  }

  /** Ramp rising from (start, h0) to (end, h1) along an axis, `c` is the cross-axis centre. */
  ramp(axis: 'x' | 'z', start: number, end: number, c: number, width: number, h0: number, h1: number, mat: MatKey) {
    const run = end - start;
    const rise = h1 - h0;
    const len = Math.hypot(run, rise);
    const ang = Math.atan(rise / run);
    const mid = (start + end) / 2;
    const midH = (h0 + h1) / 2;
    const th = 0.5;
    // Slab centre sits half a thickness below the line through the end points.
    const along = Math.sin(ang) * (th / 2);
    const oy = midH - Math.cos(ang) * (th / 2);
    if (axis === 'x') {
      this.data.boxes.push({ x: (mid + along) * this.sx, y: oy, z: c * this.sz, w: len, h: th, d: width, mat, rot: [0, 0, ang * this.sx], solid: true, cast: true });
    } else {
      this.data.boxes.push({ x: c * this.sx, y: oy, z: (mid + along) * this.sz, w: width, h: th, d: len, mat, rot: [-ang * this.sz, 0, 0], solid: true, cast: true });
    }
  }

  container(x: number, z: number, mat: MatKey, alongX = true, y0 = 0) {
    this.box(x, y0, z, alongX ? 6 : 2.4, 2.6, alongX ? 2.4 : 6, mat);
  }
  crate(x: number, z: number, s = 1.2, y0 = 0, mat: MatKey = 'woodPlank') {
    this.box(x, y0, z, s, s, s, mat);
  }
  sandbags(x: number, z: number, w: number, d: number) {
    this.box(x, 0, z, w, 1.1, d, 'sandbag');
  }
  car(x: number, z: number, alongX: boolean, mat: MatKey) {
    const w = alongX ? 4.4 : 1.9;
    const d = alongX ? 1.9 : 4.4;
    this.box(x, 0.25, z, w, 0.75, d, mat);
    this.box(x, 1.0, z, alongX ? 2.2 : 1.7, 0.65, alongX ? 1.7 : 2.2, mat);
    this.box(x, 1.0, z, alongX ? 2.25 : 1.75, 0.5, alongX ? 1.75 : 2.25, 'black', { solid: false, cast: false });
  }
  barrel(x: number, z: number, explosive = false, y = 0) {
    this.data.barrels.push({ x: x * this.sx, z: z * this.sz, y, explosive });
  }
  tree(x: number, z: number, s = 1, kind: 'pine' | 'palm' = 'pine') {
    this.data.decor.push({ kind, x: x * this.sx, z: z * this.sz, s, ry: Math.abs(x * 12.9898 + z * 78.233) % 6.28, y: 0 });
  }
  rock(x: number, z: number, s = 1) {
    this.data.decor.push({ kind: 'rock', x: x * this.sx, z: z * this.sz, s, ry: Math.abs(x * 3.7 + z * 9.1) % 6.28, y: 0 });
  }
  bush(x: number, z: number, s = 1) {
    this.data.decor.push({ kind: 'bush', x: x * this.sx, z: z * this.sz, s, ry: 0, y: 0 });
  }
  /** True when a circle of radius r at (x, z) (frame coordinates) does not touch solids, props, spawns or waypoints. */
  isClear(x: number, z: number, r: number): boolean {
    const wx = x * this.sx;
    const wz = z * this.sz;
    for (const bx of this.data.boxes) {
      if (!bx.solid || bx.y - bx.h / 2 > 3 || bx.y + bx.h / 2 < 0.3) continue;
      if (Math.abs(wx - bx.x) < bx.w / 2 + r && Math.abs(wz - bz(bx)) < bx.d / 2 + r) return false;
    }
    for (const t of this.data.barrels) if (Math.hypot(wx - t.x, wz - t.z) < r + 0.8) return false;
    for (const t of this.data.decor) if (Math.hypot(wx - t.x, wz - t.z) < r + 1.2 * t.s) return false;
    for (const t of this.data.waypoints) if (Math.hypot(wx - t.x, wz - t.z) < r + 1.2) return false;
    for (const team of ['blue', 'red'] as const) for (const t of this.data.spawns[team]) if (Math.hypot(wx - t.x, wz - t.z) < r + 2.2) return false;
    return Math.abs(wx) < this.data.half - 1 && Math.abs(wz) < this.data.half - 1;
  }
  spawn(team: TeamId, x: number, z: number) {
    // Frame coordinates face -z (yaw 0); a z-flipped frame faces +z.
    this.data.spawns[team].push({ x: x * this.sx, z: z * this.sz, yaw: this.sz < 0 ? Math.PI : 0 });
  }
  /** Hand-placed navigation waypoint. `tags`: space separated — hold (defensive spot), key (important location). */
  wp(x: number, z: number, tags = '', level = 0) {
    this.data.waypoints.push({ x: x * this.sx, z: z * this.sz, level, tags: tags ? tags.split(' ') : [] });
  }
  /**
   * Auto-generated walkable grid of navigation nodes (filtered for clearance when the nav graph is built).
   * Points are laid out in frame coordinates so mirrored/rotated copies stay symmetric.
   */
  grid(x0: number, z0: number, x1: number, z1: number, step = 2.5, level = 0) {
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) pts.push([x * this.sx, z * this.sz]);
    this.data.grids.push({ level, pts });
  }
}
