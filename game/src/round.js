// Ember Ridge — rounds and the economy. A match is first to 5 round
// wins (max 9 rounds). Each round: a 20 s buy phase, then 100 s live.
// Ember wins a round by eliminating Moon, or by planting the Ember Core
// and letting it burn for 35 s. Moon wins by eliminating Ember, by
// running the clock out before a plant, or by defusing a planted core.
// Money follows the round result; kills and plants pay on the spot.

import { ECONOMY, ROUND, addMoney, aliveCount, playerAgent, pushFeed, resetRoundAgents } from './state.js';

export function startBuyPhase(world) {
  const state = world.state;
  resetRoundAgents(state);
  // Spawn everyone at their team's spawn points.
  const spawns = world.map.spawns;
  const emberSpawn = [...spawns.ember];
  const moonSpawn = [...spawns.moon];
  for (const a of state.agents) {
    const list = a.team === 'ember' ? emberSpawn : moonSpawn;
    const [x, z] = list.shift() ?? [0, 0];
    a.x = x; a.z = z;
    a.yaw = a.team === 'ember' ? 0 : Math.PI;
    a.pitch = 0;
  }
  // The carrier is picked by the bot roles (assignBotRoles in bots.js).
  state.phase = 'buy';
  state.phaseT = ROUND.buySeconds;
  state.winner = null;
  state.log.push(`Round ${state.round} — buy phase`);
  world.hud?.showBanner(`ROUND ${state.round}`, 'Buy your gear — press B', 2.5);
  world.sfx?.buy();
}

export function startLivePhase(world) {
  const state = world.state;
  state.phase = 'live';
  state.phaseT = ROUND.liveSeconds;
  world.hud?.setBuyOpen(false, state, playerAgent(state));
  world.hud?.showBanner('GO', 'Plant the Ember Core at A or B', 1.6);
}

export function plantBomb(world, planter, site) {
  const state = world.state;
  if (state.phase !== 'live' || state.bomb.state !== 'idle') return;
  state.bomb = { state: 'planted', site: site.id, x: site.x, z: site.z, progress: 0, planter, defuser: null, timer: ROUND.bombSeconds };
  state.phase = 'planted';
  state.phaseT = ROUND.bombSeconds;
  if (state.core.holder === planter) { state.core.holder = null; planter.carrier = false; }
  addMoney(planter, ECONOMY.plantReward);
  pushFeed(state, `${planter.name} planted the Ember Core at ${site.id}`, 'ember');
  world.hud?.showBanner('CORE PLANTED', `Defend site ${site.id} — ${ROUND.bombSeconds}s`, 3);
  world.sfx?.plantBeep();
}

export function defuseBomb(world, defuser) {
  const state = world.state;
  if (state.phase !== 'planted') return;
  pushFeed(state, `${defuser.name} defused the Ember Core`, 'moon');
  endRound(world, 'moon', 'Core defused');
}

export function dropCore(world, agent) {
  const state = world.state;
  if (!agent.carrier) return;
  agent.carrier = false;
  state.core = { x: agent.x, z: agent.z, holder: null, dropped: true };
  pushFeed(state, 'The Ember Core was dropped', 'ember');
}

export function endRound(world, winnerTeam, reason) {
  const state = world.state;
  if (state.phase === 'roundEnd' || state.matchOver) return;
  state.phase = 'roundEnd';
  state.phaseT = 5;
  state.winner = winnerTeam;
  state.score[winnerTeam] += 1;
  for (const a of state.agents) {
    addMoney(a, a.team === winnerTeam ? ECONOMY.winReward : ECONOMY.lossReward);
  }
  const player = playerAgent(state);
  const playerWon = player && player.team === winnerTeam;
  state.log.push(`Round ${state.round}: ${winnerTeam} wins — ${reason}`);
  world.hud?.showBanner(
    winnerTeam === 'ember' ? 'EMBER WINS THE ROUND' : 'MOON WINS THE ROUND',
    reason,
    4,
  );
  if (playerWon) world.sfx?.roundWin(); else world.sfx?.roundLose();
  if (state.score[winnerTeam] >= ROUND.winRounds || state.round >= ROUND.maxRounds) {
    state.matchOver = true;
    state.phaseT = 8;
    const matchWinner = state.score.ember > state.score.moon ? 'ember' : 'moon';
    world.hud?.showBanner(
      matchWinner === 'ember' ? 'EMBER TAKES THE MATCH' : 'MOON TAKES THE MATCH',
      `${state.score.ember} — ${state.score.moon}`,
      7,
    );
  }
}

// Called every fixed step while a round is live: timers, plant/defuse
// progress is driven by the bots, but the clock and the win conditions
// live here, in one place.
export function updateRound(world, dt) {
  const state = world.state;
  if (state.phase === 'buy') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) startLivePhase(world);
    return;
  }
  if (state.phase === 'live') {
    state.phaseT -= dt;
    const emberAlive = aliveCount(state, 'ember');
    const moonAlive = aliveCount(state, 'moon');
    if (moonAlive === 0) { endRound(world, 'ember', 'Moon team eliminated'); return; }
    if (emberAlive === 0) { endRound(world, 'moon', 'Ember team eliminated'); return; }
    if (state.phaseT <= 0) { endRound(world, 'moon', 'Time ran out before the plant'); return; }
    return;
  }
  if (state.phase === 'planted') {
    state.phaseT -= dt;
    state.bomb.timer = state.phaseT;
    const emberAlive = aliveCount(state, 'ember');
    const moonAlive = aliveCount(state, 'moon');
    if (moonAlive === 0) { endRound(world, 'ember', 'Moon team eliminated — the core burns'); return; }
    if (emberAlive === 0) {
      // No Ember left alive: Moon defuses by default once the site is clear.
      defuseBomb(world, state.agents.find((a) => a.team === 'moon' && a.alive));
      return;
    }
    if (state.phaseT <= 0) { endRound(world, 'ember', 'The Ember Core burned through'); return; }
    return;
  }
  if (state.phase === 'roundEnd') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      if (state.matchOver) {
        state.phase = 'menu';
        state.round = 1;
        state.score = { ember: 0, moon: 0 };
        for (const a of state.agents) a.money = ECONOMY.startMoney;
        world.hud?.showMenu();
        return;
      }
      state.round += 1;
      startBuyPhase(world);
    }
  }
}
