// Ember Ridge — the HUD. All DOM lives in index.html; this module only
// writes to it. Health, armour, ammo, money, the round timer, the score,
// alive counts, the kill feed, a top-down minimap and the buy menu are
// refreshed from the single game state, never from a second copy.

import { SITES, TEAM_STYLE, WEAPONS } from './state.js';

export class HUD {
  constructor(doc) {
    this.doc = doc;
    this.el = {};
    for (const id of [
      'health-num', 'health-bar', 'armor-num', 'ammo-mag', 'ammo-reserve',
      'weapon-name', 'money', 'timer', 'score-ember', 'score-moon',
      'alive-ember', 'alive-moon', 'feed', 'banner', 'banner-title',
      'banner-sub', 'buy', 'buy-money', 'buy-list', 'overlay', 'menu-title',
      'menu-sub', 'round-label', 'minimap', 'crosshair', 'hitmarker',
      'plant-bar', 'plant-fill', 'plant-label', 'hint',
    ]) {
      this.el[id] = doc.getElementById(id);
    }
    this.bannerUntil = 0;
    this.minimap = this.el.minimap?.getContext('2d') ?? null;
    this.buyOpen = false;
    this.onBuy = null;
  }

  showMenu() {
    if (this.el.overlay) this.el.overlay.hidden = false;
    if (this.el.buy) this.el.buy.hidden = true;
    this.buyOpen = false;
  }

  hideMenu() {
    if (this.el.overlay) this.el.overlay.hidden = true;
  }

  showBanner(title, sub, seconds) {
    if (!this.el.banner) return;
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub ?? '';
    this.el.banner.hidden = false;
    this.bannerUntil = performance.now() / 1000 + seconds;
  }

  hideBanner() {
    if (this.el.banner) this.el.banner.hidden = true;
  }

  setBuyOpen(open, state, player) {
    this.buyOpen = open;
    if (this.el.buy) this.el.buy.hidden = !open;
    // The HUD money readout sits where the buy panel opens; hide it.
    if (this.el.money) this.el.money.style.visibility = open ? 'hidden' : '';
    if (open) this.renderBuy(state, player);
  }

  renderBuy(state, player) {
    if (!this.el['buy-list'] || !player) return;
    this.el['buy-money'].textContent = `$${player.money}`;
    const rows = [];
    for (const w of Object.values(WEAPONS)) {
      if (w.id === 'grenade') continue;
      const owned = player.weapon === w.id;
      const afford = player.money >= w.price;
      rows.push(`<button data-buy="${w.id}" ${owned || !afford ? 'disabled' : ''}>
        <b>${w.name}</b><span>$${w.price}</span><em>${owned ? 'EQUIPPED' : afford ? 'BUY' : 'NO FUNDS'}</em>
        <small>DMG ${w.damage} · ${w.mag} rounds · ${w.auto ? 'AUTO' : 'SEMI'}</small></button>`);
    }
    rows.push(`<button data-buy="armor" ${player.hasArmor || player.money < 650 ? 'disabled' : ''}>
      <b>Stoneweave Armour</b><span>$650</span><em>${player.hasArmor ? 'EQUIPPED' : player.money >= 650 ? 'BUY' : 'NO FUNDS'}</em>
      <small>Absorbs half of every hit until it breaks</small></button>`);
    rows.push(`<button data-buy="grenade" ${player.money < 300 ? 'disabled' : ''}>
      <b>Ember Burst ×1</b><span>$300</span><em>${player.money >= 300 ? 'BUY' : 'NO FUNDS'}</em>
      <small>Thrown explosive · 85 damage in a 5.5 m blast</small></button>`);
    this.el['buy-list'].innerHTML = rows.join('');
    this.el['buy-list'].querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => this.onBuy?.(btn.dataset.buy));
    });
  }

  hitmark(head) {
    const el = this.el.hitmarker;
    if (!el) return;
    el.classList.add('on');
    el.style.setProperty('--hm', head ? '#ff5a5a' : '#ffd9a0');
    setTimeout(() => el.classList.remove('on'), 90);
  }

  update(world, nowSec) {
    const state = world.state;
    const player = world.player;
    if (!player) return;
    const w = WEAPONS[player.weapon];
    this.el['health-num'].textContent = Math.ceil(player.hp);
    this.el['health-bar'].style.width = `${Math.max(0, player.hp)}%`;
    this.el['health-bar'].style.background = player.hp > 50 ? '#7ddc8a' : player.hp > 25 ? '#ffb347' : '#ff5a5a';
    this.el['armor-num'].textContent = player.hasArmor ? `ARM ${Math.ceil(player.armor)}` : 'NO ARMOUR';
    this.el['ammo-mag'].textContent = player.mag;
    this.el['ammo-reserve'].textContent = `/ ${player.reserve}`;
    this.el['weapon-name'].textContent = w.name;
    this.el.money.textContent = `$${player.money}`;
    this.el['round-label'].textContent = `ROUND ${state.round}`;
    const t = Math.max(0, Math.ceil(state.phaseT));
    this.el.timer.textContent = state.phase === 'buy' ? `BUY ${t}` : state.phase === 'planted' ? `💥 ${t}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.timer.style.color = state.phaseT <= 10 && state.phase !== 'buy' ? '#ff5a5a' : '';
    this.el['score-ember'].textContent = state.score.ember;
    this.el['score-moon'].textContent = state.score.moon;
    const ea = state.agents.filter((a) => a.team === 'ember' && a.alive).length;
    const ma = state.agents.filter((a) => a.team === 'moon' && a.alive).length;
    this.el['alive-ember'].textContent = '●'.repeat(ea) + '○'.repeat(5 - ea);
    this.el['alive-moon'].textContent = '●'.repeat(ma) + '○'.repeat(5 - ma);
    // Kill feed.
    this.el.feed.innerHTML = state.feed.map((f) => {
      const c = TEAM_STYLE[f.team]?.css ?? '#eee';
      return `<div style="color:${c}">${f.text}</div>`;
    }).join('');
    // Crosshair spread grows with bloom + movement.
    const spread = 4 + player.spreadBloom * 900 + (player.moving ? 5 : 0);
    this.el.crosshair.style.setProperty('--sp', `${spread}px`);
    // Plant / defuse progress bar.
    const bomb = state.bomb;
    if (bomb.state === 'planted') {
      this.el['plant-bar'].hidden = false;
      this.el['plant-label'].textContent = `EMBER CORE BURNS — ${Math.ceil(bomb.timer)}s`;
      this.el['plant-fill'].style.width = `${(1 - bomb.timer / 35) * 100}%`;
    } else {
      this.el['plant-bar'].hidden = true;
    }
    if (this.bannerUntil && nowSec > this.bannerUntil) { this.hideBanner(); this.bannerUntil = 0; }
    this.drawMinimap(state, player);
  }

  drawMinimap(state, player) {
    const ctx = this.minimap;
    if (!ctx) return;
    const W = 168, H = 126;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const px = (x) => ((x + 32) / 64) * W;
    const pz = (z) => ((z + 24) / 48) * H;
    // Sites.
    for (const site of Object.values(SITES)) {
      ctx.fillStyle = '#ffd9a0';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(site.x < 0 ? 'A' : 'B', px(site.x), pz(site.z) + 4);
      ctx.strokeStyle = '#ffd9a0';
      ctx.beginPath(); ctx.arc(px(site.x), pz(site.z), 8, 0, 7); ctx.stroke();
    }
    // Core.
    if (state.core.dropped) {
      ctx.fillStyle = '#ff6a1f';
      ctx.beginPath(); ctx.arc(px(state.core.x), pz(state.core.z), 4, 0, 7); ctx.fill();
    }
    for (const a of state.agents) {
      if (!a.alive) continue;
      ctx.fillStyle = a.isPlayer ? '#ffffff' : TEAM_STYLE[a.team].css;
      ctx.beginPath(); ctx.arc(px(a.x), pz(a.z), a.isPlayer ? 4.5 : 3.5, 0, 7); ctx.fill();
      if (a.isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px(a.x), pz(a.z));
        ctx.lineTo(px(a.x) - Math.sin(a.yaw) * 12, pz(a.z) - Math.cos(a.yaw) * 12);
        ctx.stroke();
      }
    }
    void player;
  }
}
