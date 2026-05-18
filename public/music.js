// Pactkeeper — Atmospheric dungeon ambient music + SFX
// Pure Web Audio API synthesis, no samples.
//
// Auto-injects a floating music toggle into the page.
// Exposes window.PactkeeperMusic and window.PactkeeperSFX for manual control.

(function () {
  // ─── Note → frequency ─────────────────────────────────────
  const NOTE = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  function n2f(name) {
    const m = name.match(/^([A-G][b#]?)(-?\d+)$/);
    const midi = (parseInt(m[2]) + 1) * 12 + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ─── Music engine ─────────────────────────────────────────
  class DungeonMusic {
    constructor() {
      this.ctx = null;
      this.playing = false;
      this.targetVolume = 0.45;
      this.loopDur = 32;
      this.scheduleAheadTime = 1.0;
      this.nextLoopAt = 0;
      this.drones = [];
      this.timer = null;
    }

    async init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      // Master chain
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.1;

      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Reverb (feedback-delay network — cheap and dungeon-y)
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 1;

      const d1 = this.ctx.createDelay(2); d1.delayTime.value = 0.27;
      const d2 = this.ctx.createDelay(2); d2.delayTime.value = 0.43;
      const fb = this.ctx.createGain();  fb.gain.value = 0.62;
      const damp = this.ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 1800;

      this.reverbSend.connect(d1);
      d1.connect(damp);
      damp.connect(d2);
      d2.connect(fb);
      fb.connect(d1);

      const revOut = this.ctx.createGain();
      revOut.gain.value = 0.5;
      damp.connect(revOut);
      d2.connect(revOut);
      revOut.connect(this.master);
    }

    // ─── Voices ──────────────────────────────────────────────
    pad(notes, t, dur, gain = 0.05) {
      const ctx = this.ctx;
      notes.forEach((name, i) => {
        const freq = n2f(name);
        const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 1.004;
        const o2g = ctx.createGain(); o2g.gain.value = 0.22;

        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(380, t);
        filt.frequency.linearRampToValueAtTime(1100, t + dur * 0.45);
        filt.frequency.linearRampToValueAtTime(420, t + dur);
        filt.Q.value = 2;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
        env.gain.setValueAtTime(gain, t + dur * 0.7);
        env.gain.linearRampToValueAtTime(0, t + dur);

        o1.connect(filt);
        o2.connect(o2g); o2g.connect(filt);
        filt.connect(env);
        env.connect(this.master);
        const revAmt = ctx.createGain(); revAmt.gain.value = 0.6;
        env.connect(revAmt); revAmt.connect(this.reverbSend);

        o1.start(t); o2.start(t);
        o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
      });
    }

    bell(name, t, dur = 6, gain = 0.12) {
      const ctx = this.ctx;
      const freq = n2f(name);

      // Inharmonic partials → bell timbre
      const partials = [
        { ratio: 1,    g: 1.0 },
        { ratio: 2.01, g: 0.45 },
        { ratio: 3.02, g: 0.22 },
        { ratio: 4.71, g: 0.13 },
        { ratio: 5.43, g: 0.06 },
      ];

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

      partials.forEach(p => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * p.ratio;
        const g = ctx.createGain(); g.gain.value = p.g;
        o.connect(g); g.connect(env);
        o.start(t); o.stop(t + dur + 0.1);
      });

      env.connect(this.master);
      const revAmt = ctx.createGain(); revAmt.gain.value = 0.9;
      env.connect(revAmt); revAmt.connect(this.reverbSend);
    }

    sub(name, t, dur = 16, gain = 0.1) {
      const ctx = this.ctx;
      const freq = n2f(name);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;

      // Slow pitch wobble
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      const lfog = ctx.createGain();
      lfog.gain.value = freq * 0.006;
      lfo.connect(lfog); lfog.connect(o.frequency);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
      env.gain.linearRampToValueAtTime(0, t + dur);

      o.connect(env); env.connect(this.master);

      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }

    startDrone() {
      const ctx = this.ctx;
      const root = n2f('D2');

      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = root;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = root * 1.005;
      const o3 = ctx.createOscillator(); o3.type = 'sine';     o3.frequency.value = root * 0.5;

      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 180;
      filt.Q.value = 5;

      // Filter LFO: very slow open/close
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.04;
      const lfog = ctx.createGain();
      lfog.gain.value = 80;
      lfo.connect(lfog); lfog.connect(filt.frequency);

      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.13;

      o1.connect(filt); o2.connect(filt);
      const subG = ctx.createGain(); subG.gain.value = 0.45;
      o3.connect(subG); subG.connect(droneGain);
      filt.connect(droneGain);
      droneGain.connect(this.master);

      const t = ctx.currentTime;
      o1.start(t); o2.start(t); o3.start(t); lfo.start(t);

      this.drones.push({
        stop: (when) => {
          o1.stop(when); o2.stop(when); o3.stop(when); lfo.stop(when);
        }
      });
    }

    // ─── Loop ────────────────────────────────────────────────
    scheduleLoop(startT) {
      // Progression: i → VI → iv → i (Dm → Bb → Gm → Dm)
      this.pad(['D3', 'F3', 'A3'],   startT,      8, 0.045);
      this.pad(['Bb2', 'D3', 'F3'],  startT + 8,  8, 0.045);
      this.pad(['G2',  'Bb2', 'D3'], startT + 16, 8, 0.045);
      this.pad(['D3',  'F3', 'A3'],  startT + 24, 8, 0.045);

      // Sub swells underneath
      this.sub('D1', startT,      16, 0.09);
      this.sub('D1', startT + 16, 16, 0.07);

      // Bells — sparse, distant
      const bells = [
        [3,  'D5'], [7,  'F5'],  [11, 'A4'],
        [15, 'D5'], [19, 'Bb4'], [22, 'D5'],
        [25, 'F5'], [28, 'A5'],  [30, 'D5'],
      ];
      bells.forEach(([t, n]) => this.bell(n, startT + t, 7, 0.1));
    }

    tick() {
      const now = this.ctx.currentTime;
      while (this.nextLoopAt < now + this.scheduleAheadTime) {
        this.scheduleLoop(this.nextLoopAt);
        this.nextLoopAt += this.loopDur;
      }
    }

    async start() {
      await this.init();
      if (this.playing) return;
      this.playing = true;

      const t = this.ctx.currentTime;
      this.startDrone();
      this.nextLoopAt = t + 0.05;
      this.tick();

      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0, t);
      this.master.gain.linearRampToValueAtTime(this.targetVolume, t + 2);

      this.timer = setInterval(() => this.tick(), 250);
    }

    stop() {
      if (!this.playing || !this.ctx) return;
      this.playing = false;
      clearInterval(this.timer);

      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 1.2);

      setTimeout(() => {
        this.drones.forEach(d => { try { d.stop(this.ctx.currentTime); } catch(e){} });
        this.drones = [];
      }, 1300);
    }

    setVolume(v) {
      this.targetVolume = v;
      if (this.playing && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(v, t + 0.1);
      }
    }
  }

  // ─── SFX ──────────────────────────────────────────────────
  class SFX {
    constructor(music) {
      this.music = music;
    }
    get ctx() { return this.music.ctx; }
    get out() { return this.music.master; }
    get rev() { return this.music.reverbSend; }

    async _ready() {
      if (!this.ctx) await this.music.init();
    }

    async tick() {
      await this._ready();
      const t = this.ctx.currentTime;
      // Soft wooden tick — short noise burst + click
      const buf = this.ctx.createBuffer(1, 800, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 80);
      }
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 900; filt.Q.value = 4;
      const g = this.ctx.createGain(); g.gain.value = 0.12;
      src.connect(filt); filt.connect(g); g.connect(this.out);
      src.start(t);
    }

    async thud() {
      await this._ready();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.3);
    }

    async wax() {
      await this._ready();
      const t = this.ctx.currentTime;

      // 1. Sub-bass impact — punchy 110→45 Hz hit for weight.
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, t);
      sub.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const subG = this.ctx.createGain();
      subG.gain.setValueAtTime(0.0001, t);
      subG.gain.linearRampToValueAtTime(0.5, t + 0.005);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      sub.connect(subG); subG.connect(this.out);
      sub.start(t); sub.stop(t + 0.32);

      // 2. Heroic chord — root + fifth + octave with harmonic partials,
      //    sweeping lowpass for warmth. Dry (no reverb) so it lands clean.
      const chord = ['E3', 'B3', 'E4'];
      const partials = [
        { r: 1.0, g: 1.00 },
        { r: 2.0, g: 0.40 },
        { r: 3.0, g: 0.22 },
        { r: 4.0, g: 0.10 },
      ];
      const chordEnv = this.ctx.createGain();
      chordEnv.gain.setValueAtTime(0, t);
      chordEnv.gain.linearRampToValueAtTime(0.22, t + 0.008);
      chordEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      chord.forEach((noteName) => {
        const freq = n2f(noteName);
        partials.forEach((p) => {
          const o = this.ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = freq * p.r;
          const g = this.ctx.createGain();
          g.gain.value = p.g / chord.length;
          o.connect(g); g.connect(chordEnv);
          o.start(t); o.stop(t + 0.75);
        });
      });
      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.setValueAtTime(2400, t);
      tone.frequency.exponentialRampToValueAtTime(900, t + 0.6);
      tone.Q.value = 0.7;
      chordEnv.connect(tone); tone.connect(this.out);

      // 3. Bright shimmer — short dry highpass noise burst for sparkle.
      const buf = this.ctx.createBuffer(1, 3300, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 700);
      }
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 4000;
      const sg = this.ctx.createGain(); sg.gain.value = 0.08;
      src.connect(hp); hp.connect(sg); sg.connect(this.out);
      src.start(t + 0.008);
    }

    async seal() {
      await this._ready();
      const t = this.ctx.currentTime;
      // Deep boom
      const o1 = this.ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(80, t);
      o1.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      o1.connect(g1); g1.connect(this.out);
      o1.start(t); o1.stop(t + 1.5);

      // Big bell — D3
      setTimeout(() => this.bell('D3', 8, 0.32), 30);
      setTimeout(() => this.bell('A3', 6, 0.22), 280);
    }

    bell(name, dur = 6, gain = 0.2) {
      const t = this.ctx.currentTime;
      const freq = n2f(name);
      const partials = [
        { r: 1,    g: 1.0 },
        { r: 2.01, g: 0.5 },
        { r: 3.02, g: 0.22 },
        { r: 4.71, g: 0.13 },
      ];
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      partials.forEach(p => {
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = freq * p.r;
        const g = this.ctx.createGain(); g.gain.value = p.g;
        o.connect(g); g.connect(env);
        o.start(t); o.stop(t + dur + 0.1);
      });
      env.connect(this.out);
      const revG = this.ctx.createGain(); revG.gain.value = 1;
      env.connect(revG); revG.connect(this.rev);
    }

    // ─── Tower fires ─────────────────────────────────────
    async arrow() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Whoosh: short noise burst, bandpass swept high→low
      const buf = this.ctx.createBuffer(1, 4400, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1400);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(3200, t);
      filt.frequency.exponentialRampToValueAtTime(700, t + 0.1);
      filt.Q.value = 3;
      const g = this.ctx.createGain(); g.gain.value = 0.14;
      src.connect(filt); filt.connect(g); g.connect(this.out);
      src.start(t);
      // Bowstring twang
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const base = 420 + Math.random() * 40;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.05);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.05, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(og); og.connect(this.out);
      o.start(t); o.stop(t + 0.08);
    }

    async cannonFire() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Deep sub-boom
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.55);
      // Powder crackle
      const buf = this.ctx.createBuffer(1, 6600, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 2200);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100;
      const ng = this.ctx.createGain(); ng.gain.value = 0.22;
      src.connect(lp); lp.connect(ng); ng.connect(this.out);
      src.start(t);
    }

    async frostFire() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Crystalline cascade — staggered high partials
      const freqs = [1200, 1850, 2400, 3200];
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * (0.95 + Math.random() * 0.1);
        const g = this.ctx.createGain();
        const at = t + i * 0.018;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.035, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0008, at + 0.35);
        o.connect(g); g.connect(this.out);
        const revG = this.ctx.createGain(); revG.gain.value = 0.5;
        g.connect(revG); revG.connect(this.rev);
        o.start(at); o.stop(at + 0.4);
      });
      // Frosty sparkle
      const buf = this.ctx.createBuffer(1, 4400, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1200);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 4500;
      const ng = this.ctx.createGain(); ng.gain.value = 0.06;
      src.connect(hp); hp.connect(ng); ng.connect(this.out);
      src.start(t);
    }

    // ─── Enemy deaths ────────────────────────────────────
    async orcDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Gravelly low grunt
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 170 + Math.random() * 40;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 750; filt.Q.value = 5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.setValueAtTime(0.22, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(filt); filt.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.55);
      // Breath
      const buf = this.ctx.createBuffer(1, 13200, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 5500);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 650; nf.Q.value = 1.5;
      const ng = this.ctx.createGain(); ng.gain.value = 0.1;
      src.connect(nf); nf.connect(ng); ng.connect(this.out);
      src.start(t);
    }

    async goblinDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // High pitched squeal — quick up then down
      const o = this.ctx.createOscillator();
      o.type = 'square';
      const base = 360 + Math.random() * 120;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.3);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 2200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(filt); filt.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.35);
    }

    async skeletonDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Dry bone clatter — several short bandpassed noise hits
      for (let i = 0; i < 6; i++) {
        const at = t + i * (0.022 + Math.random() * 0.04);
        const buf = this.ctx.createBuffer(1, 1100, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / 220);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1800 + Math.random() * 1800;
        bp.Q.value = 4;
        const g = this.ctx.createGain(); g.gain.value = 0.14;
        src.connect(bp); bp.connect(g); g.connect(this.out);
        src.start(at);
      }
      // Faint hollow tail
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(140, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + 0.05);
      g.gain.linearRampToValueAtTime(0.04, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g); g.connect(this.out);
      o.start(t + 0.05); o.stop(t + 0.5);
    }

    async hover() {
      await this._ready();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = n2f('A5');
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.2);
    }
  }

  // ─── UI ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('pk-music-styles')) return;
    const style = document.createElement('style');
    style.id = 'pk-music-styles';
    style.textContent = `
      .music-ui {
        position: fixed;
        bottom: 16px; left: 16px;
        z-index: 9999;
        font-family: 'Press Start 2P', monospace;
      }
      .music-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 14px 8px;
        background: linear-gradient(180deg, #2a1f12, #1a1208);
        border: 2px solid #3a2818;
        outline: 1px solid #5a3820;
        outline-offset: -2px;
        color: #8a7050;
        font-family: inherit;
        font-size: 9px;
        letter-spacing: 2px;
        cursor: pointer;
        text-shadow: 1px 1px 0 #000;
        box-shadow: 0 3px 0 rgba(0,0,0,0.5);
        transition: color 0.15s, transform 0.1s, box-shadow 0.1s;
      }
      .music-toggle:hover { color: #c98a3a; transform: translateY(-1px); box-shadow: 0 4px 0 rgba(0,0,0,0.5); }
      .music-toggle:active { transform: translateY(1px); box-shadow: 0 1px 0 rgba(0,0,0,0.5); }
      .music-icon { width: 18px; height: 14px; display: inline-flex; align-items: flex-end; justify-content: center; gap: 2px; }
      .music-icon-glyph {
        font-size: 14px;
        line-height: 1;
        color: #5a3820;
      }
      .music-toggle.on .music-icon-glyph { display: none; }
      .music-toggle.on .music-bars { display: inline-flex; }
      .music-bars { display: none; align-items: flex-end; gap: 2px; height: 14px; }
      .music-bar {
        width: 3px;
        background: #e8c440;
        box-shadow: 0 0 4px #e8c44088;
        animation: pk-mbar 0.55s ease-in-out infinite alternate;
      }
      .music-bar:nth-child(1) { height: 6px;  animation-delay: 0s; }
      .music-bar:nth-child(2) { height: 12px; animation-delay: 0.18s; }
      .music-bar:nth-child(3) { height: 8px;  animation-delay: 0.34s; }
      @keyframes pk-mbar {
        from { transform: scaleY(0.35); }
        to   { transform: scaleY(1); }
      }
      .music-toggle.on { color: #e8c440; border-color: #5a3820; }
      .music-pulse {
        position: absolute;
        inset: -4px;
        border: 1px solid #c98a3a;
        opacity: 0;
        pointer-events: none;
      }
      .music-toggle.on .music-pulse {
        animation: pk-mpulse 2s ease-out infinite;
      }
      @keyframes pk-mpulse {
        0%   { opacity: 0.5; transform: scale(1); }
        100% { opacity: 0;   transform: scale(1.15); }
      }
    `;
    document.head.appendChild(style);
  }

  function injectUI(music) {
    injectStyles();
    const wrap = document.createElement('div');
    wrap.className = 'music-ui';
    wrap.innerHTML = `
      <button class="music-toggle" aria-label="Toggle music">
        <span class="music-pulse"></span>
        <span class="music-icon">
          <span class="music-icon-glyph">♪</span>
          <span class="music-bars">
            <span class="music-bar"></span><span class="music-bar"></span><span class="music-bar"></span>
          </span>
        </span>
        <span>MUSIC</span>
      </button>
    `;
    document.body.appendChild(wrap);

    const btn = wrap.querySelector('.music-toggle');
    let on = false;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      on = !on;
      btn.classList.toggle('on', on);
      if (on) {
        await music.start();
        try { localStorage.setItem('pk-music', 'on'); } catch(e){}
      } else {
        music.stop();
        try { localStorage.setItem('pk-music', 'off'); } catch(e){}
      }
    });

    // Auto-resume on first interaction if previously enabled
    let saved = 'on';
    try { saved = localStorage.getItem('pk-music') || 'on'; } catch(e){}
    if (saved === 'on') {
      const start = async () => {
        if (on) return;
        on = true;
        btn.classList.add('on');
        await music.start();
        document.removeEventListener('click', start);
        document.removeEventListener('keydown', start);
      };
      document.addEventListener('click', start, { once: false });
      document.addEventListener('keydown', start, { once: false });
    }
  }

  const music = new DungeonMusic();
  const sfx = new SFX(music);

  window.PactkeeperMusic = music;
  window.PactkeeperSFX = sfx;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => injectUI(music));
  } else {
    injectUI(music);
  }
})();
