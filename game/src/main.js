// Ember Ridge — entry point. Boots three.js, builds the map, the agents
// and the viewmodel, then runs a fixed-step simulation (1/60 s) apart
// from rendering. All rules live in state.js / round.js / weapons.js /
// bots.js; this file only wires them together, draws the agents and
// takes the screenshots' staging orders (?shot=menu|buy|play|site).

import * as THREE from 'three';
import {
  BOT_NAMES, ECONOMY, TEAM, TEAM_STYLE, WEAPONS,
  aliveCount, createAgent, createGameState, playerAgent, pushFeed,
} from './state.js';
import { makeTextures } from './textures.js';
import { buildMap } from './map.js';
import { SoundFX } from './audio.js';
import { Effects } from './effects.js';
import { bindInput, createInput, moveAgent, updatePlayer } from './player.js';
import { assignBotRoles, updateBots } from './bots.js';
import {
  defuseBomb as doDefuse, dropCore, plantBomb as doPlant,
  startBuyPhase, updateRound,
} from './round.js';
import { HUD } from './hud.js';
import {
  applyDamage, buyWeapon, canFire, finishReload,
  fireShot, startReload,
} from './weapons.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') ?? 1);

// --- renderer -------------------------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2340);
scene.fog = new THREE.FogExp2(0x1a2340, 0.010);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Dusk light: a low warm sun, a cool sky fill, and the lanterns.
const sun = new THREE.DirectionalLight(0xffb070, 1.85);
sun.position.set(-28, 26, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 90;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x3d4c7d, 0x3a2c1e, 0.95));

// Stars above the ridge.
{
  const n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 60;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 30 + Math.random() * 70;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 0.7, sizeAttenuation: false })));
}

// --- world ----------------------------------------------------------------
const textures = makeTextures();
const map = buildMap(scene, textures);
const sfx = new SoundFX();
const fx = new Effects(scene, textures);
const hud = new HUD(document);
const state = createGameState();
state.seed = SEED;

// Agents: the player plus 4 Ember bots and 5 Moon bots.
const agents = [];
{
  const p = createAgent('you', TEAM.EMBER, 'You', true, 0, 20, 0);
  p.money = ECONOMY.startMoney;
  agents.push(p);
  BOT_NAMES.ember.forEach((name, i) => {
    const b = createAgent(`ember-${i}`, TEAM.EMBER, name, false, -14 + i * 9, 19, 0);
    b.weapon = i === 0 ? 'rifle' : 'smg';
    b.mag = WEAPONS[b.weapon].mag; b.reserve = WEAPONS[b.weapon].reserve;
    agents.push(b);
  });
  BOT_NAMES.moon.forEach((name, i) => {
    const b = createAgent(`moon-${i}`, TEAM.MOON, name, false, -14 + i * 7, -19, Math.PI);
    b.weapon = i === 2 ? 'sniper' : i % 2 === 0 ? 'rifle' : 'smg';
    b.mag = WEAPONS[b.weapon].mag; b.reserve = WEAPONS[b.weapon].reserve;
    agents.push(b);
  });
}
state.agents = agents;
const player = playerAgent(state);

// Agent meshes: a hooded figure — torso, head, and a gun box — in the
// team's colours. The simulation never reads these; they only draw.
function makeAgentMesh(agent) {
  const style = TEAM_STYLE[agent.team];
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: style.cloth, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.05, 10), cloth);
  body.position.y = 0.85; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.62; head.castShadow = true;
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 10), cloth);
  hood.position.y = 1.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.06),
    new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.7 }));
  visor.position.set(0, 1.62, 0.26);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.3, 1.15, -0.4);
  group.add(body, head, hood, visor, gun);
  group.visible = false;
  scene.add(group);
  agent.mesh = group; agent.headMesh = head; agent.bodyMesh = body; agent.gunMesh = gun;
  return group;
}
for (const a of agents) if (!a.isPlayer) makeAgentMesh(a);

// First-person viewmodel: a compact rifle that bobs and kicks, kept
// small and low so it never eats the bottom-right of the frame.
const viewmodel = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4d58, roughness: 0.4, metalness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5f36, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.48), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.36);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.08), wood);
  grip.position.set(0, -0.11, 0.06); grip.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.015), metal);
  sight.position.set(0, 0.08, -0.08);
  viewmodel.add(body, barrel, grip, sight);
  viewmodel.scale.setScalar(0.8);
  viewmodel.position.set(0.24, -0.26, -0.62);
  camera.add(viewmodel);
}
let viewKick = 0;

const world = {
  state, map, colliders: map.colliders, agents, fx, sfx, hud, player,
  moveAgent,
  plantBomb: (bot, site) => doPlant(world, bot, site),
  defuseBomb: (bot) => doDefuse(world, bot),
  onKill: (killer, victim) => {
    if (victim.isPlayer) {
      hud.showBanner('YOU ARE DOWN', 'Spectating — next round in a moment', 3);
      document.exitPointerLock?.();
    }
    if (victim.carrier) dropCore(world, victim);
  },
};

// --- input ----------------------------------------------------------------
const input = createInput();
bindInput(input, renderer.domElement, (locked) => {
  if (!locked && state.phase !== 'menu') hud.setBuyOpen(false, state, player);
});
document.getElementById('play').addEventListener('click', () => {
  sfx.ensure();
  hud.hideMenu();
  beginMatch();
  renderer.domElement.requestPointerLock();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && player.alive) {
    if (startReload(player, performance.now())) sfx.reload();
  }
  if (e.code === 'KeyB' && state.phase === 'buy') {
    hud.setBuyOpen(!hud.buyOpen, state, player);
  }
  if (e.code === 'KeyG') throwGrenade();
  if (state.phase === 'buy' && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
    const ids = ['pistol', 'smg', 'rifle', 'sniper', 'grenade'];
    buyItem(ids[Number(e.code.slice(-1)) - 1]);
  }
  if (e.code === 'KeyM') sfx.enabled = !sfx.enabled;
});
hud.onBuy = (id) => buyItem(id);

function buyItem(id) {
  if (state.phase !== 'buy') { sfx.denied(); return; }
  if (id === 'armor') {
    if (player.money >= 650 && !player.hasArmor) {
      player.money -= 650; player.hasArmor = true; player.armor = 100; sfx.buy();
    } else sfx.denied();
  } else if (id === 'grenade') {
    if (player.money >= 300) { player.money -= 300; player.grenades += 1; sfx.buy(); }
    else sfx.denied();
  } else if (id === 'pistol') {
    player.weapon = 'pistol'; player.mag = WEAPONS.pistol.mag; player.reserve = WEAPONS.pistol.reserve;
  } else if (buyWeapon(player, id)) {
    sfx.buy();
  } else sfx.denied();
  hud.renderBuy(state, player);
}

function beginMatch() {
  state.round = 1;
  state.score = { ember: 0, moon: 0 };
  state.matchOver = false;
  for (const a of agents) { a.money = ECONOMY.startMoney; a.weapon = a.isPlayer ? 'pistol' : a.weapon; a.kills = 0; a.deaths = 0; }
  startBuyPhase(world);
  assignBotRoles(state, map.routes);
  hud.setBuyOpen(true, state, player);
}

// --- grenades ---------------------------------------------------------------
const grenades = [];
function throwGrenade() {
  if (!player.alive || player.grenades <= 0) return;
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  player.grenades -= 1;
  const eye = { x: player.x, y: player.crouched ? 1.25 : 1.62, z: player.z };
  const dir = { x: -Math.sin(player.yaw) * Math.cos(player.pitch), y: Math.sin(player.pitch), z: -Math.cos(player.yaw) * Math.cos(player.pitch) };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6a1f, emissive: 0xff5a00, emissiveIntensity: 1.4 }));
  mesh.position.set(eye.x, eye.y, eye.z);
  scene.add(mesh);
  grenades.push({ mesh, vx: dir.x * 14, vy: dir.y * 14 + 3.5, vz: dir.z * 14, t: 0 });
  sfx.enemyShot();
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt;
    g.vy -= 14 * dt;
    g.mesh.position.x += g.vx * dt;
    g.mesh.position.y += g.vy * dt;
    g.mesh.position.z += g.vz * dt;
    const hitGround = g.mesh.position.y <= 0.12;
    if (hitGround || g.t > 2.2) {
      const p = g.mesh.position;
      fx.burst(p, 40, 0xff6a1f);
      fx.burst(p, 20, 0xffc46b);
      sfx.grenade();
      for (const a of agents) {
        if (!a.alive) continue;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d < 5.5) {
          const dmg = 85 * (1 - d / 5.5) + 10;
          const died = applyDamage(a, dmg);
          if (died && a.isPlayer) world.onKill(player, a);
          else if (died) pushFeed(state, `Ember Burst ▸ ${a.name}`, 'ember');
          if (a.carrier && died) dropCore(world, a);
        }
      }
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

// --- combat (player) --------------------------------------------------------
function playerShoot(nowMs) {
  const w = WEAPONS[player.weapon];
  if (!canFire(player, nowMs)) {
    if (player.mag <= 0 && nowMs >= player.reloadingUntil) { sfx.dryFire(); startReload(player, nowMs); }
    return;
  }
  const res = fireShot(world, player, nowMs);
  player.pitch += w.kick * 0.35;
  viewKick = 1;
  const tip = new THREE.Vector3(0.24, -0.22, -1.0);
  camera.localToWorld(tip);
  fx.muzzle(tip);
  fx.tracer(res.eye, res.point);
  sfx.shot(player.weapon);
  if (res.hit) {
    hud.hitmark(res.head);
    if (res.head) sfx.headshot(); else sfx.hit();
    fx.burst(res.point, res.head ? 16 : 8, res.head ? 0xff5a5a : 0xffc46b);
    const died = applyDamage(res.target, res.damage);
    if (died) {
      player.kills += 1;
      player.money = Math.min(16000, player.money + 300);
      pushFeed(state, `You ▸ ${res.target.name}${res.head ? ' (headshot)' : ''}`, 'ember');
      sfx.kill();
      if (res.target.carrier) dropCore(world, res.target);
    }
  } else {
    fx.burst(res.point, 4, 0x9aa0b0);
  }
}

// --- screenshot staging -----------------------------------------------------
// ?shot=menu|buy|play|site stages a deterministic scene for the screenshots:
// real renders of this code, with bots placed and the HUD live. Normal
// play (no ?shot) is unaffected.
function stageShot() {
  if (!SHOT) return;
  const setAgent = (agent, x, z, yaw, weapon) => {
    agent.x = x; agent.z = z; agent.yaw = yaw; agent.pitch = 0;
    if (weapon) { agent.weapon = weapon; agent.mag = WEAPONS[weapon].mag; agent.reserve = WEAPONS[weapon].reserve; }
  };
  const emberBots = agents.filter((a) => a.team === 'ember' && !a.isPlayer);
  const moonBots = agents.filter((a) => a.team === 'moon');
  if (SHOT === 'menu') {
    player.x = -6; player.z = 16; player.yaw = 0.35; player.pitch = -0.02;
    setAgent(emberBots[0], -10, 10, 0.4, 'rifle');
    setAgent(moonBots[0], -4, -6, Math.PI, 'rifle');
    setAgent(moonBots[1], 6, -10, Math.PI, 'smg');
    state.phase = 'menu';
    return;
  }
  hud.hideMenu();
  if (SHOT === 'buy') {
    startBuyPhase(world);
    assignBotRoles(state, map.routes);
    player.weapon = 'rifle'; player.mag = 30; player.reserve = 90; player.money = 4200;
    player.x = 0; player.z = 18; player.yaw = 0; player.pitch = 0;
    hud.setBuyOpen(true, state, player);
    return;
  }
  if (SHOT === 'play') {
    startBuyPhase(world);
    assignBotRoles(state, map.routes);
    state.phase = 'live'; state.phaseT = 74;
    player.weapon = 'rifle'; player.mag = 30; player.reserve = 90; player.money = 3100;
    player.x = -2; player.z = 10; player.yaw = 0.12; player.pitch = 0.01;
    setAgent(emberBots[0], -6, 4, 0.1, 'rifle');
    setAgent(emberBots[1], 4, 6, -0.1, 'smg');
    setAgent(moonBots[0], -3, -8, Math.PI, 'rifle');
    setAgent(moonBots[1], 5, -12, Math.PI, 'smg');
    setAgent(moonBots[2], 0, -16, Math.PI, 'sniper');
    // A tracer already in the air, for a combat read in the still.
    fx.tracer({ x: -2, y: 1.5, z: 9 }, { x: -3, y: 1.4, z: -8 });
    return;
  }
  if (SHOT === 'site') {
    startBuyPhase(world);
    assignBotRoles(state, map.routes);
    state.phase = 'planted';
    state.phaseT = 24;
    state.bomb = { state: 'planted', site: 'B', x: 20, z: -11.2, progress: 0, planter: emberBots[0], defuser: null, timer: 24 };
    player.weapon = 'rifle'; player.mag = 24; player.reserve = 60; player.money = 2100;
    player.x = 12; player.z = -2; player.yaw = -0.55; player.pitch = 0.02;
    setAgent(emberBots[0], 17, -8, -0.6, 'rifle');
    setAgent(moonBots[0], 22, -14, Math.PI * 0.9, 'rifle');
    setAgent(moonBots[1], 14, -14, Math.PI, 'smg');
    return;
  }
}

// --- main loop --------------------------------------------------------------
let lastT = performance.now();
let acc = 0;
const STEP = 1 / 60;
let readyFlag = false;

function syncMeshes() {
  for (const a of agents) {
    if (a.isPlayer || !a.mesh) continue;
    a.mesh.visible = true;
    a.mesh.position.set(a.x, 0, a.z);
    if (!a.alive) {
      a.mesh.rotation.set(0, a.yaw, Math.PI / 2);
      a.mesh.position.y = 0.25;
    } else {
      a.mesh.rotation.set(0, a.yaw, 0);
    }
  }
  // Dropped core + planted bomb visuals.
  map.coreMesh.visible = state.core.dropped;
  if (state.core.dropped) {
    map.coreMesh.position.set(state.core.x, 0.6 + Math.sin(state.time * 3) * 0.12, state.core.z);
    map.coreMesh.rotation.y += 0.03;
  }
  const planted = state.bomb.state === 'planted';
  map.bombMesh.visible = planted;
  map.bombLight.intensity = planted ? 14 + Math.sin(state.time * 6) * 6 : 0;
  if (planted) {
    map.bombMesh.position.set(state.bomb.x, 0.7, state.bomb.z);
    map.bombMesh.rotation.y += 0.02;
    map.bombLight.position.set(state.bomb.x, 1.2, state.bomb.z);
  }
}

function simStep(dt, nowMs) {
  state.time += dt;
  if (state.phase === 'menu') return;
  updateRound(world, dt);
  if (state.phase === 'menu') return;
  // Player.
  if (player.alive && (state.phase === 'live' || state.phase === 'planted' || state.phase === 'buy')) {
    const { eyeY } = updatePlayer(player, input, map.colliders, dt);
    void eyeY;
    if (nowMs >= player.reloadingUntil && player.reloadingUntil > 0) {
      finishReload(player);
      player.reloadingUntil = 0;
    }
    if (input.firePressed) { input.firePressed = false; if (state.phase !== 'buy') playerShoot(nowMs); }
    else if (input.firing && WEAPONS[player.weapon].auto && state.phase !== 'buy') playerShoot(nowMs);
  }
  updateBots(world, dt, nowMs);
  updateGrenades(dt);
  fx.update(dt);
  viewKick = Math.max(0, viewKick - dt * 6);
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - lastT) / 1000);
  lastT = nowMs;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) { simStep(STEP, nowMs); acc -= STEP; steps++; }
  // Camera follows the player, or a living teammate while spectating.
  let eyeY = player.crouched ? 1.25 : 1.62;
  if (player.alive) {
    camera.position.set(player.x, eyeY, player.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + viewKick * 0.03;
  } else {
    const mate = agents.find((a) => a.team === 'ember' && a.alive && !a.isPlayer);
    if (mate) {
      camera.position.set(mate.x, 1.62, mate.z);
      camera.rotation.y = mate.yaw;
      camera.rotation.x = 0;
    }
  }
  // Viewmodel bob + kick.
  const bob = player.moving && player.alive ? Math.sin(state.time * 11) * 0.012 : 0;
  viewmodel.position.set(0.24, -0.26 + bob, -0.62 + viewKick * 0.07);
  viewmodel.visible = player.alive && state.phase !== 'menu';
  syncMeshes();
  hud.update(world, nowMs / 1000);
  renderer.render(scene, camera);
  if (!readyFlag) {
    readyFlag = true;
    setTimeout(() => { window.__emberReady = true; }, SHOT ? 1200 : 400);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Playtest handle: lets a tester (or a script) read state and input.
window.__ember = { state, player, input };
window.__emberState = () => ({
  phase: state.phase, round: state.round, score: state.score,
  aliveEmber: aliveCount(state, 'ember'), aliveMoon: aliveCount(state, 'moon'),
  playerHp: player.hp, playerMoney: player.money,
  px: +player.x.toFixed(2), pz: +player.z.toFixed(2), yaw: +player.yaw.toFixed(2),
  mag: player.mag, kills: player.kills, bomb: state.bomb.state,
});

// Menu phase shows the courtyard behind the overlay.
player.x = -6; player.z = 16; player.yaw = 0.35; player.pitch = -0.02;
for (const a of agents) if (!a.isPlayer) { a.mesh.visible = true; }
stageShot();
requestAnimationFrame(frame);
