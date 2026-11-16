// Ember Ridge — bot brains. Five Moon defenders hold the two shrines and
// the middle; four Ember attackers push a lane with the Ember Core. A bot
// follows its route, holds a corner, and only shoots what it can see:
// line of sight is a ray against the map's AABBs, and every shot goes
// through the same hitscan + spread path the player's shots use, with a
// reaction delay and burst fire so a bot feels like a player, not a turret.

import { SITES, WEAPONS, pushFeed } from './state.js';
import { applyDamage, fireShot, finishReload, rayAABB, startReload } from './weapons.js';

export function hasLOS(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const inv = 1 / dist;
  for (const c of colliders) {
    const t = rayAABB(ax, ay, az, dx * inv, dy * inv, dz * inv, c);
    if (t < dist - 0.5) return false;
  }
  return true;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

function visibleEnemy(world, bot) {
  const state = world.state;
  let best = null, bestD = Infinity;
  for (const a of state.agents) {
    if (!a.alive || a.team === bot.team) continue;
    const d = Math.sqrt(dist2(bot.x, bot.z, a.x, a.z));
    if (d > 55) continue;
    if (!hasLOS(world.colliders, bot.x, 1.5, bot.z, a.x, 1.4, a.z)) continue;
    // Hearing: a bot also notices a close enemy behind cover.
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

function moveToward(world, bot, tx, tz, dt, speed = 4.4) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) return true;
  const step = Math.min(d, speed * dt);
  const nx = bot.x + (dx / d) * step;
  const nz = bot.z + (dz / d) * step;
  // Reuse the player's axis-separated collision mover.
  world.moveAgent(world.colliders, bot, nx - bot.x, nz - bot.z);
  bot.yaw = Math.atan2(-(dx / d), -(dz / d));
  bot.moving = true;
  return d < 0.6;
}

function aimAt(bot, target, error) {
  const dx = target.x - bot.x;
  const dz = target.z - bot.z;
  const dy = (target.crouched ? 1.25 : 1.5) - 1.5;
  const baseYaw = Math.atan2(-dx, -dz);
  const basePitch = Math.atan2(dy, Math.hypot(dx, dz));
  bot.yaw = baseYaw + (Math.random() - 0.5) * error * 2;
  bot.pitch = basePitch + (Math.random() - 0.5) * error;
}

function botShoot(world, bot, target, nowMs) {
  const w = WEAPONS[bot.weapon];
  if (bot.mag <= 0) {
    startReload(bot, nowMs);
    return;
  }
  if (nowMs < bot.reloadingUntil) return;
  if (nowMs - bot.lastShotAt < w.rateMs * 1.6) return;
  const dist = Math.sqrt(dist2(bot.x, bot.z, target.x, target.z));
  const error = 0.02 + dist * 0.0012 + (target.moving ? 0.015 : 0);
  aimAt(bot, target, error);
  const res = fireShot(world, bot, nowMs);
  world.fx.tracer(res.eye, res.point);
  if (res.hit) {
    const died = applyDamage(res.target, res.damage);
    world.fx.burst(res.point, res.head ? 16 : 8, res.head ? 0xff5a5a : 0xffc46b);
    if (died) {
      bot.kills += 1;
      bot.money = Math.min(16000, bot.money + 300);
      pushFeed(world.state, `${bot.name} ▸ ${res.target.name}`, bot.team);
      world.onKill?.(bot, res.target);
    }
  }
}

export function assignBotRoles(state, routes) {
  const embers = state.agents.filter((a) => a.team === 'ember' && !a.isPlayer);
  const moons = state.agents.filter((a) => a.team === 'moon');
  const site = state.round % 2 === 1 ? 'A' : 'B';
  embers.forEach((b, i) => {
    b.ai.route = i === 0 ? (site === 'A' ? routes.emberToA : routes.emberToB)
      : i === 1 ? routes.emberMid
      : (site === 'A' ? routes.emberToB : routes.emberToA);
    b.ai.wp = 0;
    b.ai.mode = 'advance';
    b.ai.site = site;
    if (i === 0) { b.carrier = true; state.core.holder = b; }
  });
  moons.forEach((b, i) => {
    b.ai.route = i === 0 ? routes.holdA : i === 1 ? routes.holdB : i === 2 ? routes.moonMid
      : i === 3 ? routes.holdA : routes.holdB;
    b.ai.hold = i === 0 ? routes.holdA[0] : i === 1 ? routes.holdB[0] : i === 3 ? routes.holdA[2] : routes.holdB[2];
    b.ai.wp = 0;
    b.ai.mode = i === 2 ? 'advance' : 'hold';
  });
}

export function updateBots(world, dt, nowMs) {
  const state = world.state;
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  for (const bot of state.agents) {
    if (bot.isPlayer || !bot.alive || !bot.ai) continue;
    const ai = bot.ai;
    if (nowMs >= bot.reloadingUntil && bot.reloadingUntil > 0) finishReload(bot);
    // Pick up a dropped core.
    if (state.core.dropped && bot.team === 'ember') {
      const d = Math.sqrt(dist2(bot.x, bot.z, state.core.x, state.core.z));
      if (d < 1.2) {
        state.core.dropped = false; state.core.holder = bot; bot.carrier = true;
        pushFeed(state, `${bot.name} picked up the Ember Core`, 'ember');
      } else if (ai.mode !== 'engage') {
        ai.mode = 'fetch';
      }
    }
    const enemy = visibleEnemy(world, bot);
    if (enemy) {
      ai.target = enemy;
      ai.mode = 'engage';
      ai.reactT -= dt;
    } else if (ai.mode === 'engage') {
      ai.mode = ai.hold ? 'hold' : 'advance';
      ai.target = null;
    }
    if (ai.mode === 'engage' && ai.target?.alive) {
      const target = ai.target;
      // Strafe sideways while shooting, in short bursts.
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafeDir *= -1; ai.strafeT = 0.5 + Math.random() * 0.7; }
      const px = -Math.sin(bot.yaw + Math.PI / 2) * ai.strafeDir;
      const pz = -Math.cos(bot.yaw + Math.PI / 2) * ai.strafeDir;
      world.moveAgent(world.colliders, bot, px * 2.2 * dt, pz * 2.2 * dt);
      bot.moving = true;
      if (ai.reactT <= 0) {
        ai.burst -= 1;
        if (ai.burst <= -4) ai.burst = 3 + Math.floor(Math.random() * 3);
        if (ai.burst > 0) botShoot(world, bot, target, nowMs);
      }
      continue;
    }
    ai.reactT = 0.35 + Math.random() * 0.45;
    bot.moving = false;
    if (ai.mode === 'fetch') {
      if (moveToward(world, bot, state.core.x, state.core.z, dt)) ai.mode = 'advance';
      continue;
    }
    if (ai.mode === 'hold' && ai.hold) {
      const [hx, hz] = ai.hold;
      if (Math.hypot(bot.x - hx, bot.z - hz) > 0.8) {
        moveToward(world, bot, hx, hz, dt, 3.6);
      } else {
        // Scan: slow yaw sweep while holding.
        bot.yaw += Math.sin(state.time * 0.5 + bot.id.charCodeAt(0)) * dt * 0.4;
      }
      continue;
    }
    // advance: follow the route; at the end, plant / hold the site.
    const route = ai.route ?? [];
    if (ai.wp < route.length) {
      const [tx, tz] = route[ai.wp];
      if (moveToward(world, bot, tx, tz, dt)) ai.wp += 1;
      continue;
    }
    if (bot.team === 'ember' && bot.carrier && state.phase === 'live') {
      const site = SITES[ai.site ?? 'A'];
      const d = Math.hypot(bot.x - site.x, bot.z - site.z);
      if (d <= site.r) {
        ai.plantT += dt;
        if (ai.plantT > 0.5 && Math.floor(ai.plantT * 2) !== Math.floor((ai.plantT - dt) * 2)) world.sfx.plantBeep();
        if (ai.plantT >= 4) world.plantBomb?.(bot, site);
      } else {
        moveToward(world, bot, site.x, site.z, dt);
      }
      continue;
    }
    if (state.phase === 'planted' && bot.team === 'moon' && state.bomb.site) {
      const site = SITES[state.bomb.site];
      const d = Math.hypot(bot.x - site.x, bot.z - site.z);
      if (d <= site.r) {
        ai.plantT += dt;
        if (ai.plantT >= 5) world.defuseBomb?.(bot);
      } else {
        moveToward(world, bot, site.x, site.z, dt);
      }
      continue;
    }
    // Nothing to do: hold the current spot and watch.
    bot.yaw += dt * 0.3;
  }
  // Ember attackers defend a planted core; Moon converges on the site.
  if (state.phase === 'planted') {
    for (const bot of state.agents) {
      if (bot.isPlayer || !bot.alive || !bot.ai) continue;
      if (bot.ai.mode === 'engage') continue;
      const site = SITES[state.bomb.site];
      if (bot.team === 'moon' && Math.hypot(bot.x - site.x, bot.z - site.z) > site.r + 1) {
        bot.ai.mode = 'advance';
        bot.ai.route = [[site.x, site.z]];
        bot.ai.wp = 0;
      }
    }
  }
}
