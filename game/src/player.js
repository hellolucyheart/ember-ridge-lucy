// Ember Ridge — the human player. Pointer-lock mouse look, WASD with
// acceleration and friction, crouch, jump, and AABB collision resolved
// axis by axis so the player slides along walls instead of sticking.
// Movement speed feeds the gunplay spread: stopping to aim pays.

import { MAP } from './state.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.25;
const RADIUS = 0.42;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 10;

export function createInput() {
  return {
    keys: new Set(),
    mouseDX: 0, mouseDY: 0,
    firing: false, firePressed: false,
    locked: false,
    jumpQueued: false,
  };
}

export function bindInput(input, canvas, onLockChange) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (e.code === 'Space') { input.jumpQueued = true; e.preventDefault(); }
    if (e.code === 'KeyB') input.buyToggle = true;
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(input.locked);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (!input.locked) canvas.requestPointerLock();
      else { input.firing = true; input.firePressed = true; }
    }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function collides(colliders, x, z) {
  for (const c of colliders) {
    if (x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS) return true;
  }
  return false;
}

// Move with axis separation: try x, then z, so walls slide.
export function moveAgent(colliders, agent, dx, dz) {
  const nx = agent.x + dx;
  if (!collides(colliders, nx, agent.z) && Math.abs(nx) < MAP.halfX - 0.5) agent.x = nx;
  const nz = agent.z + dz;
  if (!collides(colliders, agent.x, nz) && Math.abs(nz) < MAP.halfZ - 0.5) agent.z = nz;
}

export function updatePlayer(agent, input, colliders, dt) {
  // Mouse look.
  const sens = 0.0023;
  agent.yaw -= input.mouseDX * sens;
  agent.pitch -= input.mouseDY * sens;
  agent.pitch = Math.max(-1.45, Math.min(1.45, agent.pitch));
  input.mouseDX = 0; input.mouseDY = 0;

  agent.crouched = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  const speed = agent.crouched ? CROUCH_SPEED : WALK_SPEED;
  let ix = 0, iz = 0;
  if (input.keys.has('KeyW')) iz -= 1;
  if (input.keys.has('KeyS')) iz += 1;
  if (input.keys.has('KeyA')) ix -= 1;
  if (input.keys.has('KeyD')) ix += 1;
  const len = Math.hypot(ix, iz) || 1;
  ix /= len; iz /= len;
  // Camera-relative wish direction.
  const sy = Math.sin(agent.yaw), cy = Math.cos(agent.yaw);
  const wx = ix * cy - iz * sy;
  const wz = ix * sy + iz * cy;
  agent.moving = ix !== 0 || iz !== 0;
  agent.vx += wx * ACCEL * dt;
  agent.vz += wz * ACCEL * dt;
  // Friction + speed cap.
  const damp = Math.max(0, 1 - FRICTION * dt);
  agent.vx *= damp; agent.vz *= damp;
  const v = Math.hypot(agent.vx, agent.vz);
  const cap = agent.moving ? speed : 0.4;
  if (v > cap) { agent.vx *= cap / v; agent.vz *= cap / v; }
  moveAgent(colliders, agent, agent.vx * dt, agent.vz * dt);
  // Bloom decays when not firing.
  agent.spreadBloom = Math.max(0, agent.spreadBloom - dt * 0.05);
  return { eyeY: agent.crouched ? EYE_CROUCH : EYE_STAND };
}
