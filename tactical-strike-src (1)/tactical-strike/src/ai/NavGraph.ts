import * as THREE from 'three';
import type { MapData } from '../maps/MapData';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export interface NavNode {
  id: number;
  pos: THREE.Vector3; // feet position
  links: number[];
  tags: string[];
}

const LINK_RADIUS = 5.3;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Waypoint graph used by every bot. Nodes come from the map's hand-placed waypoints and auto-generated grids,
 * are filtered for standing clearance with Rapier, and linked only when the path between them is walkable
 * (straight line clear at knee and chest height, continuous ground underneath).
 */
export class NavGraph {
  nodes: NavNode[] = [];
  /** Nodes dropped because they could not be reached from the main network (e.g. on top of crates). */
  readonly pruned: NavNode[] = [];

  constructor(private pw: PhysicsWorld, data: MapData) {
    for (const w of data.waypoints) this.tryAdd(w.x, w.z, w.level, w.tags, 0.9);
    for (const g of data.grids) {
      for (const [x, z] of g.pts) this.tryAdd(x, z, g.level, [], 1.2);
    }
    this.link();
    this.prune();
  }

  private prune() {
    const comp = this.components();
    const sizes = new Map<number, number>();
    comp.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    let main = 0;
    let best = -1;
    for (const [c, n] of sizes) if (n > best) { best = n; main = c; }
    const remap = new Int32Array(this.nodes.length).fill(-1);
    const kept: NavNode[] = [];
    for (const n of this.nodes) {
      if (comp[n.id] === main) {
        remap[n.id] = kept.length;
        kept.push(n);
      } else this.pruned.push(n);
    }
    for (const n of kept) {
      n.links = n.links.map((l) => remap[l]);
      n.id = remap[n.id];
    }
    this.nodes = kept;
  }

  private tryAdd(x: number, z: number, level: number, tags: string[], minSep: number) {
    const y = this.pw.groundHeight(x, z, level + 2.2);
    if (y === null || y < -0.2) return;
    if (this.pw.standingBlocked(x, y, z)) return;
    for (const n of this.nodes) {
      if (Math.abs(n.pos.y - y) < 1.2 && Math.hypot(n.pos.x - x, n.pos.z - z) < minSep) {
        for (const t of tags) if (!n.tags.includes(t)) n.tags.push(t);
        return;
      }
    }
    this.nodes.push({ id: this.nodes.length, pos: new THREE.Vector3(x, y, z), links: [], tags: [...tags] });
  }

  private walkable(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return true;
    if (Math.abs(b.y - a.y) / len > 0.9) return false;
    const steps = Math.ceil(len / 0.8);
    const startY = Math.max(a.y, b.y) + 1.0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const gy = this.pw.groundHeight(a.x + dx * t, a.z + dz * t, startY);
      if (gy === null || Math.abs(gy - (a.y + (b.y - a.y) * t)) > 0.6) return false;
    }
    const px = -dz / len;
    const pz = dx / len;
    for (const h of [0.5, 1.4]) {
      for (const o of [0, 0.32, -0.32]) {
        _a.set(a.x + px * o, a.y + h, a.z + pz * o);
        _b.set(b.x + px * o, b.y + h, b.z + pz * o);
        if (!this.pw.clearLine(_a, _b)) return false;
      }
    }
    return true;
  }

  private link() {
    const n = this.nodes;
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const dx = n[i].pos.x - n[j].pos.x;
        const dz = n[i].pos.z - n[j].pos.z;
        if (dx * dx + dz * dz > LINK_RADIUS * LINK_RADIUS) continue;
        if (Math.abs(n[i].pos.y - n[j].pos.y) > 3) continue;
        if (this.walkable(n[i].pos, n[j].pos)) {
          n[i].links.push(j);
          n[j].links.push(i);
        }
      }
    }
  }

  /** Closest node to a position, preferring nodes at a similar height. */
  nearest(p: THREE.Vector3): number {
    let best = -1;
    let bd = Infinity;
    for (const n of this.nodes) {
      const dy = Math.abs(n.pos.y - p.y);
      if (dy > 2.5) continue;
      const d = (n.pos.x - p.x) ** 2 + (n.pos.z - p.z) ** 2 + dy * dy * 4;
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  withTag(tag: string): NavNode[] {
    return this.nodes.filter((n) => n.tags.includes(tag));
  }

  /** Connected-component labels, used for validation and for picking reachable targets. */
  components(): Int32Array {
    const comp = new Int32Array(this.nodes.length).fill(-1);
    let c = 0;
    for (const start of this.nodes) {
      if (comp[start.id] !== -1) continue;
      const stack = [start.id];
      comp[start.id] = c;
      while (stack.length) {
        const cur = stack.pop()!;
        for (const nb of this.nodes[cur].links) {
          if (comp[nb] === -1) {
            comp[nb] = c;
            stack.push(nb);
          }
        }
      }
      c++;
    }
    return comp;
  }

  /** A* shortest path as node ids (inclusive). `penalty` adds extra cost per node to steer routes (flanking). */
  findPath(from: number, to: number, penalty?: (n: NavNode) => number): number[] {
    if (from < 0 || to < 0) return [];
    if (from === to) return [from];
    const N = this.nodes.length;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, id]
    const push = (f: number, id: number) => {
      heap.push([f, id]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const target = this.nodes[to].pos;
    g[from] = 0;
    push(this.nodes[from].pos.distanceTo(target), from);
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === to) break;
      closed[cur] = 1;
      const cn = this.nodes[cur];
      for (const nb of cn.links) {
        if (closed[nb]) continue;
        const nn = this.nodes[nb];
        const cost = g[cur] + cn.pos.distanceTo(nn.pos) + (penalty ? penalty(nn) : 0);
        if (cost < g[nb]) {
          g[nb] = cost;
          came[nb] = cur;
          push(cost + nn.pos.distanceTo(target), nb);
        }
      }
    }
    if (came[to] === -1) return [];
    const path: number[] = [];
    for (let c = to; c !== -1; c = came[c]) path.push(c);
    return path.reverse();
  }
}
