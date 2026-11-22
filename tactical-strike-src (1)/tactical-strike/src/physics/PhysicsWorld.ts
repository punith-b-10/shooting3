import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

/** Collision groups. Rays only see GROUP_WORLD; characters collide with world + props. */
export const GROUP_WORLD = 0x0001;
export const GROUP_CHAR = 0x0002;
export const GROUP_PROP = 0x0004;
const groups = (membership: number, filter: number) => ((membership << 16) | filter) >>> 0;
export const RAY_GROUPS = groups(GROUP_WORLD, GROUP_WORLD);
export const CHAR_GROUPS = groups(GROUP_CHAR, GROUP_WORLD | GROUP_PROP);
const WORLD_GROUPS = groups(GROUP_WORLD, 0xffff);
const PROP_GROUPS = groups(GROUP_PROP, 0xffff);

export const CAPSULE_RADIUS = 0.3;
export const CAPSULE_HALF = 0.6; // cylinder half height -> total height 1.8

let initPromise: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  return (initPromise ??= RAPIER.init());
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private probe = new RAPIER.Capsule(0.55, 0.38);
  private probeRot = { x: 0, y: 0, z: 0, w: 1 };

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  }

  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot?: THREE.Quaternion, prop = false): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setCollisionGroups(prop ? PROP_GROUPS : WORLD_GROUPS);
    if (rot) desc.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    return this.world.createCollider(desc);
  }

  addCylinder(cx: number, cy: number, cz: number, halfH: number, radius: number, prop = false): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfH, radius).setTranslation(cx, cy, cz).setCollisionGroups(prop ? PROP_GROUPS : WORLD_GROUPS);
    return this.world.createCollider(desc);
  }

  removeCollider(c: RAPIER.Collider) {
    this.world.removeCollider(c, false);
  }

  /** Must be called once after all static colliders exist so scene queries see them. */
  finalize() {
    this.world.step();
  }

  createCharacter() {
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_RADIUS).setCollisionGroups(CHAR_GROUPS).setTranslation(0, 0.9, 0),
    );
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.enableAutostep(0.42, 0.12, false);
    controller.enableSnapToGround(0.3);
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    return { collider, controller };
  }

  /** Cast a ray against the static world. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    this.ray.origin.x = ox;
    this.ray.origin.y = oy;
    this.ray.origin.z = oz;
    this.ray.dir.x = dx;
    this.ray.dir.y = dy;
    this.ray.dir.z = dz;
    const hit = this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, RAY_GROUPS);
    if (!hit) return null;
    return { t: hit.timeOfImpact, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z };
  }

  /** True when nothing static blocks the straight segment a -> b. */
  clearLine(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    this.ray.origin.x = a.x;
    this.ray.origin.y = a.y;
    this.ray.origin.z = a.z;
    this.ray.dir.x = dx / len;
    this.ray.dir.y = dy / len;
    this.ray.dir.z = dz / len;
    return this.world.castRay(this.ray, len - 0.05, true, undefined, RAY_GROUPS) === null;
  }

  /** True when a standing capsule with its feet at (x, y, z) would intersect world geometry (stairs steps up to 0.4m are ignored). */
  standingBlocked(x: number, y: number, z: number): boolean {
    return this.world.intersectionWithShape({ x, y: y + 0.4 + 0.93, z }, this.probeRot, this.probe, undefined, CHAR_GROUPS) !== null;
  }

  /** Height of the first walkable surface found casting down from startY. */
  groundHeight(x: number, z: number, startY: number): number | null {
    const hit = this.raycast(x, startY, z, 0, -1, 0, startY + 5);
    return hit ? startY - hit.t : null;
  }

  dispose() {
    this.world.free();
  }
}
