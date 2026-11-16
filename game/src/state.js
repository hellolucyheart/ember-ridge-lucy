// Ember Ridge — shared game state. One place owns every number the
// simulation reads: teams, rounds, economy, weapons and the objective.
// Rendering, input and AI read this module; they never keep their own
// copy of a rule (score, money, timer) anywhere else.

export const TEAM = { EMBER: 'ember', MOON: 'moon' };

export const TEAM_STYLE = {
  ember: { name: 'Ember', color: 0xff8a3c, css: '#ff9a3c', cloth: 0xc2502a, accent: 0xffc46b },
  moon: { name: 'Moon', color: 0x4fc3e8, css: '#6fd2f0', cloth: 0x2a5d7a, accent: 0x9fe4ff },
};

// The map is a hillside shrine courtyard, 64 m wide (x) by 48 m deep (z).
// Ember spawns south (z +), Moon spawns north (z -). Two plant sites:
// A Moon Gate (north-west) and B Ember Shrine (north-east).
export const MAP = { halfX: 32, halfZ: 24, wallH: 4.2 };

export const SITES = {
  // Ring centres on the courtyard in front of each shrine deck.
  A: { id: 'A', name: 'Moon Gate', x: -20, z: -11.2, r: 3.4 },
  B: { id: 'B', name: 'Ember Shrine', x: 20, z: -11.2, r: 3.4 },
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  plantReward: 300,
  maxMoney: 16000,
};

export const ROUND = {
  buySeconds: 20,
  liveSeconds: 100,
  plantSeconds: 4,
  defuseSeconds: 5,
  bombSeconds: 35,
  winRounds: 5,
  maxRounds: 9,
};

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Kite Pistol', price: 0, auto: false,
    damage: 34, headMult: 2.2, mag: 12, reserve: 48, reloadMs: 1100,
    rateMs: 170, spread: 0.011, moveSpread: 0.02, range: 55, kick: 0.011,
  },
  smg: {
    id: 'smg', name: 'Lantern SMG', price: 1500, auto: true,
    damage: 22, headMult: 2.0, mag: 32, reserve: 96, reloadMs: 1500,
    rateMs: 82, spread: 0.016, moveSpread: 0.03, range: 42, kick: 0.008,
  },
  rifle: {
    id: 'rifle', name: 'Kestrel Rifle', price: 2700, auto: true,
    damage: 33, headMult: 2.5, mag: 30, reserve: 90, reloadMs: 1900,
    rateMs: 105, spread: 0.007, moveSpread: 0.026, range: 80, kick: 0.016,
  },
  sniper: {
    id: 'sniper', name: 'Heron Long Rifle', price: 4750, auto: false,
    damage: 110, headMult: 2.0, mag: 5, reserve: 15, reloadMs: 2600,
    rateMs: 950, spread: 0.001, moveSpread: 0.09, range: 120, kick: 0.05,
  },
  grenade: {
    id: 'grenade', name: 'Ember Burst', price: 300, auto: false,
    damage: 85, headMult: 1, mag: 1, reserve: 1, reloadMs: 0,
    rateMs: 700, spread: 0, moveSpread: 0, range: 30, kick: 0, blast: 5.5,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // half of a hit's damage goes to armor first

export const BOT_NAMES = {
  ember: ['Rin', 'Hana', 'Sora', 'Yui'],
  moon: ['Kaito', 'Ren', 'Aoi', 'Shun', 'Daichi'],
};

export function createAgent(id, team, name, isPlayer, x, z, yaw) {
  return {
    id, team, name, isPlayer,
    x, z, yaw, pitch: 0,
    hp: 100, armor: 0, alive: true,
    weapon: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    money: ECONOMY.startMoney, kills: 0, deaths: 0,
    grenades: 0, hasArmor: false,
    carrier: false, // carries the Ember Core (plant objective)
    // movement / combat runtime (sim only, reset each round)
    vx: 0, vz: 0, crouched: false, moving: false, airborne: false,
    lastShotAt: -1e9, reloadingUntil: 0, spreadBloom: 0,
    // bot brain runtime
    ai: null,
    // mesh handles, filled by the renderer side
    mesh: null, headMesh: null, bodyMesh: null, gunMesh: null,
  };
}

export function createGameState() {
  const state = {
    phase: 'menu', // menu | buy | live | planted | roundEnd
    phaseT: 0, // seconds left in the current phase
    round: 1,
    score: { ember: 0, moon: 0 },
    agents: [],
    bomb: { state: 'idle', site: null, x: 0, z: 0, progress: 0, planter: null, defuser: null, timer: 0 },
    core: { x: 0, z: 0, holder: null, dropped: false },
    feed: [], // kill feed entries {text, team, t}
    log: [], // round event lines for the HUD banner
    winner: null,
    matchOver: false,
    time: 0, // total sim seconds
    seed: 1,
  };
  return state;
}

export function resetRoundAgents(state) {
  for (const a of state.agents) {
    a.hp = 100; a.alive = true; a.carrier = false;
    a.vx = 0; a.vz = 0; a.spreadBloom = 0; a.reloadingUntil = 0;
    a.ai = a.isPlayer ? null : { mode: 'advance', wp: 0, holdT: 0, target: null, burst: 0, strafeDir: 1, strafeT: 0, plantT: 0, reactT: 0.5 + Math.random() * 0.5 };
    // keep weapon/ammo/money across rounds; fresh mag at round start
    const w = WEAPONS[a.weapon];
    a.mag = w.mag;
    if (a.reserve < w.mag) a.reserve = w.mag;
  }
  state.bomb = { state: 'idle', site: null, x: 0, z: 0, progress: 0, planter: null, defuser: null, timer: 0 };
  state.core = { x: 0, z: 0, holder: null, dropped: false };
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function playerAgent(state) {
  return state.agents.find((a) => a.isPlayer) ?? null;
}

export function addMoney(agent, amount) {
  agent.money = Math.min(ECONOMY.maxMoney, agent.money + amount);
}

export function pushFeed(state, text, team) {
  state.feed.unshift({ text, team, t: state.time });
  if (state.feed.length > 5) state.feed.length = 5;
}
