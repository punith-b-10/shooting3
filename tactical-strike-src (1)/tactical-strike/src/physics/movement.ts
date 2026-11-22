import { CHAR_GROUPS } from './PhysicsWorld';
import type { Character } from '../entities/Character';

const GRAVITY = 22;
const JUMP_SPEED = 6.9;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 6.4;

/**
 * Advance a character's body one tick with Rapier's kinematic character controller (walls, stairs, ramps, slopes).
 * (wishX, wishZ) is a world-space horizontal direction (length 0..1); maxSpeed is in m/s.
 */
export function stepBody(c: Character, wishX: number, wishZ: number, maxSpeed: number, jump: boolean, dt: number) {
  const body = c.body;
  if (!body) return;
  const accel = c.grounded ? 46 : 7;
  const tx = wishX * maxSpeed;
  const tz = wishZ * maxSpeed;
  const k = Math.min(1, accel * dt / Math.max(0.001, maxSpeed));
  c.vx += (tx - c.vx) * Math.min(1, k * 1.6);
  c.vz += (tz - c.vz) * Math.min(1, k * 1.6);

  if (c.grounded) {
    c.vy = -1.5;
    if (jump) {
      c.vy = JUMP_SPEED;
      c.grounded = false;
    }
  } else {
    c.vy -= GRAVITY * dt;
    if (c.vy < -30) c.vy = -30;
  }

  body.controller.computeColliderMovement(body.collider, { x: c.vx * dt, y: c.vy * dt, z: c.vz * dt }, undefined, CHAR_GROUPS);
  const m = body.controller.computedMovement();
  c.grounded = body.controller.computedGrounded();
  c.pos.x += m.x;
  c.pos.y += m.y;
  c.pos.z += m.z;
  body.collider.setTranslation({ x: c.pos.x, y: c.pos.y + 0.9, z: c.pos.z });

  // Kill momentum into walls so characters do not "stick" at full speed against them.
  if (dt > 0) {
    const ax = m.x / dt;
    const az = m.z / dt;
    if (Math.abs(ax) < Math.abs(c.vx)) c.vx = ax;
    if (Math.abs(az) < Math.abs(c.vz)) c.vz = az;
    if (c.vy > 0 && m.y / dt < c.vy * 0.5) c.vy = 0; // bumped head
  }
  c.speed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
}

export function teleport(c: Character, x: number, y: number, z: number) {
  c.pos.set(x, y, z);
  c.vx = c.vy = c.vz = 0;
  c.grounded = true;
  c.body?.collider.setTranslation({ x, y: y + 0.9, z });
}
