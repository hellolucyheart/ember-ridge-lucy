// Ember Ridge — gunplay. Hitscan with analytic ray tests, so a shot is
// decided by geometry, not by the renderer's raycaster: a ray against
// each agent's body capsule (head sphere + torso cylinder) and against
// every map AABB, and the nearest hit wins. Spread, recoil and movement
// punish firing on the move; standing still and crouching pay, as the
// brief asks. Damage falls off with range and armour absorbs half.

import { ARMOR_ABSORB, WEAPONS } from './state.js';

// Ray from origin o along unit dir d against an AABB [x0,z0,x1,z1] with
// height h (y 0..h). Returns the distance or Infinity.
export function rayAABB(ox, oy, oz, dx, dy, dz, c) {
  let tmin = 0, tmax = 1e9;
  const axes = [
    [ox, dx, c.x0, c.x1], [oy, dy, 0, c.h], [oz, dz, c.z0, c.z1],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? 0 : Infinity);
}

// Ray against a vertical capsule: torso cylinder (radius 0.42, y 0.25..1.45)
// plus a head sphere (centre y 1.62, radius 0.30). Returns {t, head} or null.
export function rayAgent(ox, oy, oz, dx, dy, dz, a) {
  // Head sphere first.
  const hx = a.x - ox, hy = 1.62 - oy, hz = a.z - oz;
  const b = hx * dx + hy * dy + hz * dz;
  const c2 = hx * hx + hy * hy + hz * hz - 0.30 * 0.30;
  const disc = b * b - c2;
  let best = null;
  if (disc >= 0) {
    const t = b - Math.sqrt(disc);
    if (t > 0) best = { t, head: true };
  }
  // Torso: 2D ray-circle in xz, then check the y at that distance.
  const ex = a.x - ox, ez = a.z - oz;
  const bb = ex * dx + ez * dz;
  const cc = ex * ex + ez * ez - 0.42 * 0.42;
  const dd = bb * bb - cc;
  if (dd >= 0) {
    const t = bb - Math.sqrt(dd);
    if (t > 0) {
      const y = oy + dy * t;
      if (y > 0.2 && y < 1.5 && (best === null || t < best.t)) best = { t, head: false };
    }
  }
  return best;
}

export function eyePos(agent) {
  return { x: agent.x, y: agent.crouched ? 1.25 : 1.62, z: agent.z };
}

export function aimDir(agent, spread) {
  const cp = Math.cos(agent.pitch), sp = Math.sin(agent.pitch);
  const cy = Math.cos(agent.yaw), sy = Math.sin(agent.yaw);
  // Forward is -z rotated by yaw; pitch lifts it.
  let dx = -sy * cp, dy = sp, dz = -cy * cp;
  if (spread > 0) {
    const a = Math.random() * Math.PI * 2;
    const r = spread * Math.sqrt(Math.random());
    // Perturb in the plane perpendicular to the aim using yaw basis.
    const rx = Math.cos(a) * r, ry = Math.sin(a) * r;
    dx += rx * cy; dz += -rx * sy; dy += ry;
  }
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

// Spread for one shot: base + bloom + movement + airborne, crouch halves it.
export function currentSpread(agent) {
  const w = WEAPONS[agent.weapon];
  let s = w.spread + agent.spreadBloom;
  if (agent.moving) s += w.moveSpread;
  if (agent.airborne) s += 0.03;
  if (agent.crouched) s *= 0.55;
  return s;
}

export function canFire(agent, nowMs) {
  const w = WEAPONS[agent.weapon];
  if (agent.mag <= 0) return false;
  if (nowMs < agent.reloadingUntil) return false;
  return nowMs - agent.lastShotAt >= w.rateMs;
}

// Fire one hitscan shot. `world` carries {colliders, agents, state}.
// Returns {hit, head, point, target, blocked} for effects and the HUD.
export function fireShot(world, shooter, nowMs) {
  const w = WEAPONS[shooter.weapon];
  shooter.lastShotAt = nowMs;
  shooter.mag -= 1;
  shooter.spreadBloom = Math.min(0.03, shooter.spreadBloom + w.kick * 0.55);
  const eye = eyePos(shooter);
  const dir = aimDir(shooter, currentSpread(shooter));
  let bestT = w.range;
  let bestAgent = null, bestHead = false;
  for (const a of world.agents) {
    if (a === shooter || !a.alive) continue;
    if (a.team === shooter.team) continue;
    const hit = rayAgent(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, a);
    if (hit && hit.t < bestT) { bestT = hit.t; bestAgent = a; bestHead = hit.head; }
  }
  for (const c of world.colliders) {
    const t = rayAABB(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, c);
    if (t < bestT) { bestT = t; bestAgent = null; }
  }
  // Ground plane.
  if (dir.y < -1e-6) {
    const t = -eye.y / dir.y;
    if (t > 0 && t < bestT) { bestT = t; bestAgent = null; }
  }
  const point = { x: eye.x + dir.x * bestT, y: eye.y + dir.y * bestT, z: eye.z + dir.z * bestT };
  let damage = 0;
  if (bestAgent) {
    const falloff = Math.max(0.55, 1 - (bestT / w.range) * 0.45);
    damage = w.damage * (bestHead ? w.headMult : 1) * falloff;
  }
  return { hit: bestAgent !== null, head: bestHead, point, target: bestAgent, damage, dir, eye };
}

// Apply damage with armour absorbing half; returns true if the target died.
export function applyDamage(target, damage) {
  let remaining = damage;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, remaining * ARMOR_ABSORB);
    target.armor -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.deaths += 1;
    return true;
  }
  return false;
}

export function startReload(agent, nowMs) {
  const w = WEAPONS[agent.weapon];
  if (agent.mag >= w.mag || agent.reserve <= 0 || nowMs < agent.reloadingUntil) return false;
  agent.reloadingUntil = nowMs + w.reloadMs;
  return true;
}

export function finishReload(agent) {
  const w = WEAPONS[agent.weapon];
  const need = w.mag - agent.mag;
  const take = Math.min(need, agent.reserve);
  agent.mag += take;
  agent.reserve -= take;
}

export function buyWeapon(agent, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w || w.price === 0) return false;
  if (agent.money < w.price) return false;
  if (agent.weapon === weaponId) return false;
  agent.money -= w.price;
  agent.weapon = weaponId;
  agent.mag = w.mag;
  agent.reserve = w.reserve;
  return true;
}
