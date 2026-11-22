import type { MapData } from '../maps/MapData';
import { matColor } from '../render/Materials';
import type { Match } from '../game/Match';
import { EYE_HEIGHT } from '../entities/Character';
import * as THREE from 'three';

const GROUND: Record<string, string> = { desert: '#b99b68', city: '#3a3d42', industrial: '#4a4d52', forest: '#3e5a31' };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Draws a static top-down image of a map (cached) — used for the map-selection cards and the rotating in-game radar. */
export function renderMapImage(data: MapData, ambience: string, px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d')!;
  const span = data.half * 2 + 6;
  const k = px / span;
  const X = (x: number) => (x + span / 2) * k;
  const Z = (z: number) => (z + span / 2) * k;
  g.fillStyle = GROUND[ambience] ?? '#444';
  g.fillRect(0, 0, px, px);
  // flat ground patches (roads, bombsite letter)
  for (const b of data.boxes) {
    if (b.solid || b.h > 0.05) continue;
    g.fillStyle = matColor(b.mat);
    g.globalAlpha = 0.85;
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * k, b.d * k);
  }
  g.globalAlpha = 1;
  const solids = data.boxes.filter((b) => b.solid && b.y - b.h / 2 < 1.0 && !b.rot && b.h > 0.2 && b.w < data.half * 2.2);
  solids.sort((p, q) => p.y + p.h / 2 - (q.y + q.h / 2));
  for (const b of solids) {
    const top = b.y + b.h / 2;
    const shade = Math.min(1, top / 6);
    const v = Math.round(190 - shade * 130);
    g.fillStyle = `rgb(${v},${v},${Math.round(v * 1.02)})`;
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
  }
  // elevated platforms / stairs
  g.globalAlpha = 0.55;
  for (const b of data.boxes) {
    if (!b.solid || b.y - b.h / 2 < 1.0 || b.y - b.h / 2 > 5 || b.h > 1.2) continue;
    g.fillStyle = '#d8d8d0';
    g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
  }
  g.globalAlpha = 1;
  for (const d of data.decor) {
    if (d.kind === 'bush') continue;
    g.fillStyle = d.kind === 'rock' ? '#7a776f' : '#1f3a1d';
    g.beginPath(); g.arc(X(d.x), Z(d.z), (d.kind === 'rock' ? 1.1 : 1.3) * d.s * k, 0, 6.3); g.fill();
  }
  for (const b of data.barrels) { g.fillStyle = b.explosive ? '#d33' : '#556'; g.beginPath(); g.arc(X(b.x), Z(b.z), 0.5 * k + 0.5, 0, 6.3); g.fill(); }
  // spawn markers
  for (const t of ['blue', 'red'] as const) {
    g.fillStyle = t === 'blue' ? 'rgba(74,163,255,0.35)' : 'rgba(255,80,64,0.35)';
    for (const s of data.spawns[t]) { g.beginPath(); g.arc(X(s.x), Z(s.z), 1.6 * k, 0, 6.3); g.fill(); }
  }
  return cv;
}

/** Rotating radar: allies are always shown, enemies only while a living teammate has line of sight to them. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private img: HTMLCanvasElement | null = null;
  private span = 0;
  private spotted = new Map<number, { x: number; z: number; t: number }>();
  private scanT = 0;
  private view = 46; // metres across the radar

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setMap(data: MapData, ambience: string) {
    this.img = renderMapImage(data, ambience, 1024);
    this.span = data.half * 2 + 6;
    this.spotted.clear();
  }

  private scan(m: Match) {
    const now = m.time;
    for (const e of m.chars) {
      if (e.team !== 'red' || !e.alive) continue;
      for (const a of m.chars) {
        if (a.team !== 'blue' || !a.alive) continue;
        const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
        if (d > 70) continue;
        a.eye(_a);
        _b.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
        if (m.physics.clearLine(_a, _b)) {
          this.spotted.set(e.id, { x: e.pos.x, z: e.pos.z, t: now });
          break;
        }
      }
    }
  }

  draw(m: Match, dt: number) {
    if (!this.img) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.2; this.scan(m); }
    const g = this.ctx;
    const W = this.canvas.width;
    const p = m.player;
    const ref = p.alive ? p : (m.chars.find((c) => c.team === 'blue' && c.alive) ?? p);
    const ppm = W / this.view; // pixels per metre on the radar
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 6.3); g.clip();
    g.fillStyle = '#10151b'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(ref.yaw); // forward (-z) points up
    const imgPx = this.span * ppm;
    g.drawImage(this.img, -(ref.pos.x + this.span / 2) * ppm, -(ref.pos.z + this.span / 2) * ppm, imgPx, imgPx);
    const dot = (x: number, z: number, col: string, r: number, ring = false) => {
      const px = (x - ref.pos.x) * ppm, pz = (z - ref.pos.z) * ppm;
      g.fillStyle = col;
      g.beginPath(); g.arc(px, pz, r, 0, 6.3); g.fill();
      if (ring) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
    };
    for (const c of m.chars) {
      if (!c.alive || c === ref) continue;
      if (c.team === 'blue') dot(c.pos.x, c.pos.z, '#4aa3ff', 5, true);
    }
    for (const [id, s] of this.spotted) {
      const e = m.chars[id];
      const age = m.time - s.t;
      if (!e.alive || age > 2.2) { this.spotted.delete(id); continue; }
      g.globalAlpha = Math.max(0.25, 1 - age / 2.2);
      dot(e.alive && age < 0.3 ? e.pos.x : s.x, e.alive && age < 0.3 ? e.pos.z : s.z, '#ff4a3a', 5.5, true);
      g.globalAlpha = 1;
    }
    g.restore();
    // player arrow + vision cone at the centre
    g.save();
    g.translate(W / 2, W / 2);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, W * 0.42, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fill();
    g.fillStyle = '#ffd27a';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, 6.3); g.stroke();
    void EYE_HEIGHT;
  }
}
