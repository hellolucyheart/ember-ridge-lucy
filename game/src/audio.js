// Ember Ridge — synthesised sound. No audio files are shipped: every
// effect is an oscillator or filtered noise burst built in WebAudio, so
// the game stays offline and file-free. The context is created lazily
// on the first user gesture; headless screenshot runs simply hear nothing.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  _noise(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!this.ensure() || !this.enabled) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
  }

  _tone(freq, dur, gainVal, type = 'sine', slideTo = null) {
    if (!this.ensure() || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }

  shot(weaponId) {
    if (weaponId === 'sniper') { this._noise(0.28, 900, 0.9); this._tone(140, 0.18, 0.4, 'sawtooth', 60); }
    else if (weaponId === 'smg') this._noise(0.09, 1800, 0.5);
    else this._noise(0.14, 1200, 0.7);
  }

  enemyShot() { this._noise(0.12, 900, 0.22); }
  dryFire() { this._tone(900, 0.05, 0.25, 'square'); }
  reload() { this._tone(500, 0.06, 0.3, 'square'); setTimeout(() => this._tone(700, 0.06, 0.3, 'square'), 160); }
  hit() { this._tone(1200, 0.07, 0.35, 'triangle', 900); }
  headshot() { this._tone(1600, 0.1, 0.4, 'triangle', 800); }
  hurt() { this._tone(180, 0.16, 0.4, 'sawtooth', 90); }
  kill() { this._tone(520, 0.12, 0.35, 'triangle', 780); }
  plantBeep() { this._tone(880, 0.09, 0.3, 'square'); }
  grenade() { this._noise(0.5, 500, 0.9); this._tone(90, 0.4, 0.5, 'sine', 40); }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 0.3, 'triangle'), i * 130)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 0.28, 'triangle'), i * 130)); }
  buy() { this._tone(660, 0.08, 0.3, 'triangle'); setTimeout(() => this._tone(990, 0.1, 0.3, 'triangle'), 90); }
  denied() { this._tone(220, 0.12, 0.3, 'square', 160); }
  step() { this._noise(0.05, 400, 0.08); }
}
