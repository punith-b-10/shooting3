import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MapData } from './MapData';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export const BARREL_RADIUS = 0.45;
export const BARREL_HEIGHT = 1.1;

/** Extents of the collision proxy used for each decor kind (shared by physics and rendering). */
export function decorCollider(kind: string, s: number): { hx: number; hy: number; hz: number } | null {
  if (kind === 'pine') return { hx: 0.35, hy: 3, hz: 0.35 };
  if (kind === 'palm') return { hx: 0.3, hy: 2.6, hz: 0.3 };
  if (kind === 'rock') return { hx: 0.95 * s, hy: 0.7 * s, hz: 0.95 * s };
  return null;
}

export interface MapColliders {
  /** Collider per barrel index (explosive barrels live in the prop group and are removed when they blow up). */
  barrels: RAPIER.Collider[];
}

export function addMapColliders(pw: PhysicsWorld, data: MapData): MapColliders {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const b of data.boxes) {
    if (!b.solid) continue;
    if (b.rot) {
      e.set(b.rot[0], b.rot[1], b.rot[2], 'XYZ');
      q.setFromEuler(e);
      pw.addBox(b.x, b.y, b.z, b.w / 2, b.h / 2, b.d / 2, q);
    } else {
      pw.addBox(b.x, b.y, b.z, b.w / 2, b.h / 2, b.d / 2);
    }
  }
  for (const d of data.decor) {
    const c = decorCollider(d.kind, d.s);
    if (c) pw.addBox(d.x, d.y + c.hy, d.z, c.hx, c.hy, c.hz);
  }
  const barrels = data.barrels.map((b) => pw.addCylinder(b.x, b.y + BARREL_HEIGHT / 2, b.z, BARREL_HEIGHT / 2, BARREL_RADIUS, b.explosive));
  return { barrels };
}
