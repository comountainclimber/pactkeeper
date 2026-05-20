// Pactkeeper — Atmospheric dungeon ambient music + SFX
// Pure Web Audio API synthesis, no samples.
//
// Auto-injects a floating music toggle into the page.
// Exposes window.PactkeeperMusic and window.PactkeeperSFX for manual control.

(function () {
  // ─── Note → frequency ─────────────────────────────────────
  const NOTE = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };
  function n2f(name) {
    const m = name.match(/^([A-G][b#]?)(-?\d+)$/);
    const midi = (parseInt(m[2]) + 1) * 12 + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ─── Theme registry ───────────────────────────────────────
  //
  // Each theme is a self-contained sound design — drone + pad timbre +
  // chord progression + bell pattern + optional one-shot voices (horn,
  // war drum). The active theme is chosen by `setTheme(name)` or
  // `playLevel(id)`; a theme switch fades the running theme out and the
  // new one in over ~1.4s, so it reads as a musical transition rather
  // than a hard cut.
  //
  //   altar       — Pact altar / menu. Slow Dm ritual ambience.
  //   embergrass  — Level 1 'Embergrass Pass'. Pastoral E-Aeolian
  //                 woodland; sine/triangle pads, sustained warden's
  //                 horn, sparse mid-bells.
  //   hollowmere  — Level 2 'Hollowmere Mire'. Drowned A-Phrygian
  //                 chorus; pure-sine choir pads with vibrato, deep
  //                 sub, slow cracked-bell hits, heavy reverb.
  //   ashen       — Level 3 'Ashen Reach'. Cinematic D-Phrygian dread
  //                 with a heroic Phrygian-V cadence; sawtooth brass
  //                 pads, low war drum on every beat, urgent high bells.
  //
  // Adding a theme: append an entry below and (optionally) wire it into
  // `LEVEL_THEMES` so a level id maps to it.
  const THEMES = {
    altar: {
      loopDur: 32,
      targetVolume: 0.45,
      drone: {
        root: "D2",
        filtFreq: 180,
        lfoFreq: 0.04,
        lfoDepth: 80,
        subMix: 0.45,
      },
      pad: {
        gain: 0.045,
        osc1Type: "triangle",
        osc2Type: "sawtooth",
        osc2Detune: 1.004,
        osc2Mix: 0.22,
        filterMinFreq: 380,
        filterMaxFreq: 1100,
        filterQ: 2,
        revAmt: 0.6,
        vibrato: 0,
      },
      progression: [
        { notes: ["D3", "F3", "A3"], at: 0, dur: 8 },
        { notes: ["Bb2", "D3", "F3"], at: 8, dur: 8 },
        { notes: ["G2", "Bb2", "D3"], at: 16, dur: 8 },
        { notes: ["D3", "F3", "A3"], at: 24, dur: 8 },
      ],
      sub: [
        { note: "D1", at: 0, dur: 16, gain: 0.09 },
        { note: "D1", at: 16, dur: 16, gain: 0.07 },
      ],
      bells: [
        [3, "D5"],
        [7, "F5"],
        [11, "A4"],
        [15, "D5"],
        [19, "Bb4"],
        [22, "D5"],
        [25, "F5"],
        [28, "A5"],
        [30, "D5"],
      ],
      bellGain: 0.1,
      bellDur: 7,
    },

    embergrass: {
      loopDur: 36,
      targetVolume: 0.42,
      drone: {
        root: "E2",
        filtFreq: 220,
        lfoFreq: 0.05,
        lfoDepth: 60,
        subMix: 0.4,
      },
      pad: {
        // Flute-leaning: sine + triangle, gentle filter sweep, light reverb.
        gain: 0.04,
        osc1Type: "sine",
        osc2Type: "triangle",
        osc2Detune: 1.003,
        osc2Mix: 0.5,
        filterMinFreq: 600,
        filterMaxFreq: 2200,
        filterQ: 1.2,
        revAmt: 0.55,
        vibrato: 0,
      },
      progression: [
        // E Aeolian — pastoral, mystical, woodland.
        { notes: ["E3", "G3", "B3"], at: 0, dur: 9 },
        { notes: ["G3", "B3", "D4"], at: 9, dur: 9 },
        { notes: ["B2", "D3", "F#3"], at: 18, dur: 9 },
        { notes: ["A2", "C#3", "E3"], at: 27, dur: 9 },
      ],
      sub: [
        { note: "E1", at: 0, dur: 18, gain: 0.07 },
        { note: "E1", at: 18, dur: 18, gain: 0.06 },
      ],
      bells: [
        // Distant, like horns echoing through trees.
        [4, "E5"],
        [12, "B4"],
        [18, "G5"],
        [24, "E5"],
        [30, "A4"],
      ],
      bellGain: 0.08,
      bellDur: 8,
      // Sustained low triangle — the woodland warden's distant call.
      // Spans the whole loop so it underpins every chord change.
      horn: { note: "E3", dur: 36, gain: 0.038 },
    },

    hollowmere: {
      loopDur: 40,
      targetVolume: 0.42,
      drone: {
        root: "A1",
        filtFreq: 140,
        lfoFreq: 0.06,
        lfoDepth: 90,
        subMix: 0.55,
      },
      pad: {
        // Ghostly choir: pure-sine cluster, slow detune wobble, drenched
        // in reverb. The vibrato is what sells the "voice" — a static
        // sine reads as synth, a sine with a slow ~1.6 Hz wobble reads
        // as something breathing.
        gain: 0.05,
        osc1Type: "sine",
        osc2Type: "sine",
        osc2Detune: 1.008,
        osc2Mix: 0.7,
        filterMinFreq: 280,
        filterMaxFreq: 1000,
        filterQ: 3.5,
        revAmt: 0.95,
        vibrato: 0.005,
        vibratoFreq: 1.6,
      },
      progression: [
        // A Phrygian — wet, eerie, undead. The ♭II → iv move under-
        // selling resolution is what gives the realm its "the dead
        // refuse to lie still" tension.
        { notes: ["A2", "C3", "E3"], at: 0, dur: 10 },
        { notes: ["Bb2", "D3", "F3"], at: 10, dur: 10 },
        { notes: ["D3", "F3", "A3"], at: 20, dur: 10 },
        { notes: ["A2", "C3", "E3"], at: 30, dur: 10 },
      ],
      sub: [
        { note: "A1", at: 0, dur: 20, gain: 0.1 },
        { note: "A1", at: 20, dur: 20, gain: 0.085 },
      ],
      bells: [
        // Cracked-bell pattern — low, slow, drowned in the long reverb.
        [6, "A3"],
        [16, "F3"],
        [26, "Bb3"],
        [34, "A3"],
      ],
      bellGain: 0.09,
      bellDur: 10,
    },

    ashen: {
      loopDur: 24,
      targetVolume: 0.5,
      drone: {
        root: "D1",
        filtFreq: 200,
        lfoFreq: 0.12,
        lfoDepth: 110,
        subMix: 0.5,
      },
      pad: {
        // Brass: sawtooth-dominant, sharp filter open — cinematic stabs
        // rather than the soft beds of altar/embergrass. Less reverb so
        // the drum impacts cut through.
        gain: 0.05,
        osc1Type: "sawtooth",
        osc2Type: "sawtooth",
        osc2Detune: 1.006,
        osc2Mix: 0.6,
        filterMinFreq: 200,
        filterMaxFreq: 1800,
        filterQ: 4,
        revAmt: 0.4,
        vibrato: 0,
      },
      progression: [
        // D Phrygian with a heroic Phrygian-V (A major) cadence — the
        // world ended once and is doing it again.
        { notes: ["D3", "F3", "A3"], at: 0, dur: 6 },
        { notes: ["Eb3", "G3", "Bb3"], at: 6, dur: 6 },
        { notes: ["G3", "Bb3", "D4"], at: 12, dur: 6 },
        { notes: ["A3", "C#4", "E4"], at: 18, dur: 6 },
      ],
      sub: [
        { note: "D1", at: 0, dur: 12, gain: 0.11 },
        { note: "D1", at: 12, dur: 12, gain: 0.09 },
      ],
      bells: [
        // Bright, urgent — sparking embers raining down.
        [3, "D6"],
        [6, "A5"],
        [9, "F5"],
        [12, "D6"],
        [15, "Eb6"],
        [18, "A5"],
        [21, "D6"],
      ],
      bellGain: 0.07,
      bellDur: 5,
      // Low war-drum impact every 2 seconds. Drives the pulse forward
      // and makes the realm feel like an active siege rather than a
      // passive ambience.
      drums: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
    },
  };

  // Maps campaign level id → theme name. id 0 (and any unrecognized id)
  // falls through to the altar theme so the pact screen + any boot edge
  // case stay safe.
  const LEVEL_THEMES = {
    0: "altar",
    1: "embergrass",
    2: "hollowmere",
    3: "ashen",
  };

  // ─── Music engine ─────────────────────────────────────────
  class DungeonMusic {
    constructor() {
      this.ctx = null;
      this.playing = false;
      this.targetVolume = THEMES.altar.targetVolume;
      this.scheduleAheadTime = 1.0;
      this.nextLoopAt = 0;
      this.drones = [];
      this.timer = null;
      // Active theme name. Set before `start()` to choose what plays;
      // changed at runtime via `setTheme()` (which crossfades).
      this.currentTheme = "altar";
      // setTimeout id used by `setTheme` to restart the engine on the
      // new theme after the fade-out completes. Tracked so an external
      // `stop()` (user clicks OFF) can cancel a queued restart and not
      // bring music back unexpectedly.
      this._restartTimer = null;
    }

    async init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") await this.ctx.resume();
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

      const d1 = this.ctx.createDelay(2);
      d1.delayTime.value = 0.27;
      const d2 = this.ctx.createDelay(2);
      d2.delayTime.value = 0.43;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.62;
      const damp = this.ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 1800;

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
    //
    // `pad` is the workhorse — every theme drives its chord progression
    // through this single voice. Per-theme timbre (oscillator types,
    // detune, filter sweep, optional vibrato) arrives as `opts` so a new
    // theme can sound like a flute, a brass section, or a ghostly choir
    // without forking the function.
    pad(notes, t, dur, opts = {}) {
      const o = {
        gain: 0.045,
        osc1Type: "triangle",
        osc2Type: "sawtooth",
        osc2Detune: 1.004,
        osc2Mix: 0.22,
        filterMinFreq: 380,
        filterMaxFreq: 1100,
        filterQ: 2,
        revAmt: 0.6,
        vibrato: 0,
        vibratoFreq: 1.5,
        ...opts,
      };
      const ctx = this.ctx;
      notes.forEach((name) => {
        const freq = n2f(name);
        const o1 = ctx.createOscillator();
        o1.type = o.osc1Type;
        o1.frequency.value = freq;
        const o2 = ctx.createOscillator();
        o2.type = o.osc2Type;
        o2.frequency.value = freq * o.osc2Detune;
        const o2g = ctx.createGain();
        o2g.gain.value = o.osc2Mix;

        // Optional vibrato — modulates osc2 frequency. Hollowmere uses
        // this to sell the "drowned choir" timbre; static sines read as
        // synth, a slow ~1.6 Hz wobble reads as a voice.
        if (o.vibrato > 0) {
          const lfo = ctx.createOscillator();
          lfo.type = "sine";
          lfo.frequency.value = o.vibratoFreq;
          const lg = ctx.createGain();
          lg.gain.value = freq * o.vibrato;
          lfo.connect(lg);
          lg.connect(o2.frequency);
          lfo.start(t);
          lfo.stop(t + dur + 0.2);
        }

        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.setValueAtTime(o.filterMinFreq, t);
        filt.frequency.linearRampToValueAtTime(o.filterMaxFreq, t + dur * 0.45);
        filt.frequency.linearRampToValueAtTime(o.filterMinFreq + 40, t + dur);
        filt.Q.value = o.filterQ;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(o.gain, t + dur * 0.3);
        env.gain.setValueAtTime(o.gain, t + dur * 0.7);
        env.gain.linearRampToValueAtTime(0, t + dur);

        o1.connect(filt);
        o2.connect(o2g);
        o2g.connect(filt);
        filt.connect(env);
        env.connect(this.master);
        const revAmt = ctx.createGain();
        revAmt.gain.value = o.revAmt;
        env.connect(revAmt);
        revAmt.connect(this.reverbSend);

        o1.start(t);
        o2.start(t);
        o1.stop(t + dur + 0.2);
        o2.stop(t + dur + 0.2);
      });
    }

    bell(name, t, dur = 6, gain = 0.12) {
      const ctx = this.ctx;
      const freq = n2f(name);

      // Inharmonic partials → bell timbre
      const partials = [
        { ratio: 1, g: 1.0 },
        { ratio: 2.01, g: 0.45 },
        { ratio: 3.02, g: 0.22 },
        { ratio: 4.71, g: 0.13 },
        { ratio: 5.43, g: 0.06 },
      ];

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);

      partials.forEach((p) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq * p.ratio;
        const g = ctx.createGain();
        g.gain.value = p.g;
        o.connect(g);
        g.connect(env);
        o.start(t);
        o.stop(t + dur + 0.1);
      });

      env.connect(this.master);
      const revAmt = ctx.createGain();
      revAmt.gain.value = 0.9;
      env.connect(revAmt);
      revAmt.connect(this.reverbSend);
    }

    sub(name, t, dur = 16, gain = 0.1) {
      const ctx = this.ctx;
      const freq = n2f(name);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;

      // Slow pitch wobble
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12;
      const lfog = ctx.createGain();
      lfog.gain.value = freq * 0.006;
      lfo.connect(lfog);
      lfog.connect(o.frequency);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
      env.gain.linearRampToValueAtTime(0, t + dur);

      o.connect(env);
      env.connect(this.master);

      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.1);
      lfo.stop(t + dur + 0.1);
    }

    // Sustained low triangle horn — the Embergrass woodland warden cue.
    // A long, soft sustain that underpins the chord progression and
    // sells the "ancient warden walked here" mood without competing
    // with the bells.
    horn(name, t, dur, gain = 0.04) {
      const ctx = this.ctx;
      const freq = n2f(name);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 900;
      filt.Q.value = 2;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 1.5);
      env.gain.setValueAtTime(gain, t + Math.max(2, dur - 2));
      env.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(filt);
      filt.connect(env);
      env.connect(this.master);
      const revG = ctx.createGain();
      revG.gain.value = 0.7;
      env.connect(revG);
      revG.connect(this.reverbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    // Low war-drum impact — the Ashen Reach pulse. A weighted sine
    // sweep + a short highpassed noise transient give the hit both
    // body and crack. Scheduled every 2s in the ashen progression.
    drum(t, gain = 0.18) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.45);

      // Highpassed noise transient — stick attack on the drum head.
      const buf = ctx.createBuffer(1, 1100, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 220);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 800;
      const ng = ctx.createGain();
      ng.gain.value = gain * 0.4;
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.master);
      src.start(t);
    }

    startDrone() {
      const T = THEMES[this.currentTheme];
      const D = T.drone;
      const ctx = this.ctx;
      const root = n2f(D.root);

      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = root;
      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.value = root * 1.005;
      const o3 = ctx.createOscillator();
      o3.type = "sine";
      o3.frequency.value = root * 0.5;

      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = D.filtFreq;
      filt.Q.value = 5;

      // Filter LFO: very slow open/close. Rate + depth come from the
      // theme so ashen can pulse faster (0.12 Hz) than altar's drift
      // (0.04 Hz).
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = D.lfoFreq;
      const lfog = ctx.createGain();
      lfog.gain.value = D.lfoDepth;
      lfo.connect(lfog);
      lfog.connect(filt.frequency);

      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.13;

      o1.connect(filt);
      o2.connect(filt);
      const subG = ctx.createGain();
      subG.gain.value = D.subMix;
      o3.connect(subG);
      subG.connect(droneGain);
      filt.connect(droneGain);
      droneGain.connect(this.master);

      const t = ctx.currentTime;
      o1.start(t);
      o2.start(t);
      o3.start(t);
      lfo.start(t);

      this.drones.push({
        stop: (when) => {
          o1.stop(when);
          o2.stop(when);
          o3.stop(when);
          lfo.stop(when);
        },
      });
    }

    // ─── Loop ────────────────────────────────────────────────
    scheduleLoop(startT) {
      const T = THEMES[this.currentTheme];
      for (const c of T.progression) {
        this.pad(c.notes, startT + c.at, c.dur, T.pad);
      }
      for (const s of T.sub) {
        this.sub(s.note, startT + s.at, s.dur, s.gain);
      }
      for (const [tOff, n] of T.bells) {
        this.bell(n, startT + tOff, T.bellDur, T.bellGain);
      }
      if (T.horn) {
        this.horn(T.horn.note, startT, T.horn.dur, T.horn.gain);
      }
      if (T.drums) {
        for (const tOff of T.drums) this.drum(startT + tOff);
      }
    }

    tick() {
      const now = this.ctx.currentTime;
      const dur = THEMES[this.currentTheme].loopDur;
      while (this.nextLoopAt < now + this.scheduleAheadTime) {
        this.scheduleLoop(this.nextLoopAt);
        this.nextLoopAt += dur;
      }
    }

    async start() {
      await this.init();
      if (this.playing) return;
      this.playing = true;

      const T = THEMES[this.currentTheme];
      this.targetVolume = T.targetVolume;

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
      // Cancel any queued theme-restart so an external stop wins over
      // an in-flight `setTheme` transition (user clicks OFF mid-fade).
      if (this._restartTimer) {
        clearTimeout(this._restartTimer);
        this._restartTimer = null;
      }
      this._fadeOutAndClearDrones();
    }

    setVolume(v) {
      this.targetVolume = v;
      if (this.playing && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(v, t + 0.1);
      }
    }

    /**
     * Switch to a different theme. If the engine is already playing,
     * fades the running theme out and the new one in (~1.4s total).
     * If silent (or never started), just records the theme so the next
     * `start()` uses it. Idempotent — calling with the active theme is
     * a no-op.
     */
    setTheme(name) {
      if (!THEMES[name] || this.currentTheme === name) return;
      this.currentTheme = name;
      if (!this.playing) return;
      // Fade out the running theme, then queue a fresh `start()` once
      // the drone has cleared. `_restartTimer` is the handle so an
      // external `stop()` can cancel the queued restart.
      if (this._restartTimer) clearTimeout(this._restartTimer);
      this._fadeOutAndClearDrones();
      this._restartTimer = setTimeout(() => {
        this._restartTimer = null;
        this.start();
      }, 1400);
    }

    /**
     * Map a campaign level id (1..3) to its theme. id 0 (or any
     * unrecognized id, including `undefined`) falls back to the altar
     * theme — used by the pact screen between runs.
     */
    playLevel(id) {
      const name = LEVEL_THEMES[id] || "altar";
      this.setTheme(name);
    }

    // Shared internals for `stop()` and `setTheme()`. Fades the master
    // to 0 over 1.2s and stops all drone oscillators ~1.3s out so the
    // tail can decay through the reverb without a click.
    _fadeOutAndClearDrones() {
      if (!this.playing || !this.ctx) return;
      this.playing = false;
      clearInterval(this.timer);

      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 1.2);

      setTimeout(() => {
        this.drones.forEach((d) => {
          try {
            d.stop(this.ctx.currentTime);
          } catch (e) {}
        });
        this.drones = [];
      }, 1300);
    }
  }

  // ─── SFX ──────────────────────────────────────────────────
  class SFX {
    constructor(music) {
      this.music = music;
    }
    get ctx() {
      return this.music.ctx;
    }
    get out() {
      return this.music.master;
    }
    get rev() {
      return this.music.reverbSend;
    }

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
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = 900;
      filt.Q.value = 4;
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.out);
      src.start(t);
    }

    async thud() {
      await this._ready();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.3);
    }

    async wax() {
      await this._ready();
      const t = this.ctx.currentTime;

      // 1. Sub-bass impact — punchy 110→45 Hz hit for weight.
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(110, t);
      sub.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const subG = this.ctx.createGain();
      subG.gain.setValueAtTime(0.0001, t);
      subG.gain.linearRampToValueAtTime(0.5, t + 0.005);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      sub.connect(subG);
      subG.connect(this.out);
      sub.start(t);
      sub.stop(t + 0.32);

      // 2. Heroic chord — root + fifth + octave with harmonic partials,
      //    sweeping lowpass for warmth. Dry (no reverb) so it lands clean.
      const chord = ["E3", "B3", "E4"];
      const partials = [
        { r: 1.0, g: 1.0 },
        { r: 2.0, g: 0.4 },
        { r: 3.0, g: 0.22 },
        { r: 4.0, g: 0.1 },
      ];
      const chordEnv = this.ctx.createGain();
      chordEnv.gain.setValueAtTime(0, t);
      chordEnv.gain.linearRampToValueAtTime(0.22, t + 0.008);
      chordEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      chord.forEach((noteName) => {
        const freq = n2f(noteName);
        partials.forEach((p) => {
          const o = this.ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = freq * p.r;
          const g = this.ctx.createGain();
          g.gain.value = p.g / chord.length;
          o.connect(g);
          g.connect(chordEnv);
          o.start(t);
          o.stop(t + 0.75);
        });
      });
      const tone = this.ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.setValueAtTime(2400, t);
      tone.frequency.exponentialRampToValueAtTime(900, t + 0.6);
      tone.Q.value = 0.7;
      chordEnv.connect(tone);
      tone.connect(this.out);

      // 3. Bright shimmer — short dry highpass noise burst for sparkle.
      const buf = this.ctx.createBuffer(1, 3300, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 700);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4000;
      const sg = this.ctx.createGain();
      sg.gain.value = 0.08;
      src.connect(hp);
      hp.connect(sg);
      sg.connect(this.out);
      src.start(t + 0.008);
    }

    async seal() {
      await this._ready();
      const t = this.ctx.currentTime;
      // Deep boom
      const o1 = this.ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.setValueAtTime(80, t);
      o1.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      o1.connect(g1);
      g1.connect(this.out);
      o1.start(t);
      o1.stop(t + 1.5);

      // Big bell — D3
      setTimeout(() => this.bell("D3", 8, 0.32), 30);
      setTimeout(() => this.bell("A3", 6, 0.22), 280);
    }

    bell(name, dur = 6, gain = 0.2) {
      const t = this.ctx.currentTime;
      const freq = n2f(name);
      const partials = [
        { r: 1, g: 1.0 },
        { r: 2.01, g: 0.5 },
        { r: 3.02, g: 0.22 },
        { r: 4.71, g: 0.13 },
      ];
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      partials.forEach((p) => {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq * p.r;
        const g = this.ctx.createGain();
        g.gain.value = p.g;
        o.connect(g);
        g.connect(env);
        o.start(t);
        o.stop(t + dur + 0.1);
      });
      env.connect(this.out);
      const revG = this.ctx.createGain();
      revG.gain.value = 1;
      env.connect(revG);
      revG.connect(this.rev);
    }

    // ─── Tower fires ─────────────────────────────────────
    async arrow() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Whoosh: short noise burst, bandpass swept high→low
      const buf = this.ctx.createBuffer(1, 4400, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1400);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(3200, t);
      filt.frequency.exponentialRampToValueAtTime(700, t + 0.1);
      filt.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.value = 0.14;
      src.connect(filt);
      filt.connect(g);
      g.connect(this.out);
      src.start(t);
      // Bowstring twang
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      const base = 420 + Math.random() * 40;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.05);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.05, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(og);
      og.connect(this.out);
      o.start(t);
      o.stop(t + 0.08);
    }

    async cannonFire() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Deep sub-boom
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.55);
      // Powder crackle
      const buf = this.ctx.createBuffer(1, 6600, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 2200);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.22;
      src.connect(lp);
      lp.connect(ng);
      ng.connect(this.out);
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
        o.type = "sine";
        o.frequency.value = f * (0.95 + Math.random() * 0.1);
        const g = this.ctx.createGain();
        const at = t + i * 0.018;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.035, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0008, at + 0.35);
        o.connect(g);
        g.connect(this.out);
        const revG = this.ctx.createGain();
        revG.gain.value = 0.5;
        g.connect(revG);
        revG.connect(this.rev);
        o.start(at);
        o.stop(at + 0.4);
      });
      // Frosty sparkle
      const buf = this.ctx.createBuffer(1, 4400, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1200);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4500;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.06;
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.out);
      src.start(t);
    }

    async towerHeal() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Gentle rising triad with a short shimmer tail.
      const notes = ["D5", "F5", "A5"];
      notes.forEach((name, i) => {
        const at = t + i * 0.02;
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(n2f(name) * 0.96, at);
        o.frequency.exponentialRampToValueAtTime(n2f(name), at + 0.14);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.045, at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.34);

        o.connect(g);
        g.connect(this.out);

        const revG = this.ctx.createGain();
        revG.gain.value = 0.45;
        g.connect(revG);
        revG.connect(this.rev);

        o.start(at);
        o.stop(at + 0.38);
      });

      const buf = this.ctx.createBuffer(1, 3800, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 900);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4200;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.035;
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.out);
      src.start(t + 0.03);
    }

    // ─── Enemy deaths ────────────────────────────────────
    async orcDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Gravelly low grunt
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      const base = 170 + Math.random() * 40;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 750;
      filt.Q.value = 5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.setValueAtTime(0.22, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(filt);
      filt.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.55);
      // Breath
      const buf = this.ctx.createBuffer(1, 13200, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 5500);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const nf = this.ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 650;
      nf.Q.value = 1.5;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.1;
      src.connect(nf);
      nf.connect(ng);
      ng.connect(this.out);
      src.start(t);
    }

    async goblinDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // High pitched squeal — quick up then down
      const o = this.ctx.createOscillator();
      o.type = "square";
      const base = 360 + Math.random() * 120;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.3);
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 2200;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(filt);
      filt.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.35);
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
        for (let j = 0; j < d.length; j++)
          d[j] = (Math.random() * 2 - 1) * Math.exp(-j / 220);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1800 + Math.random() * 1800;
        bp.Q.value = 4;
        const g = this.ctx.createGain();
        g.gain.value = 0.14;
        src.connect(bp);
        bp.connect(g);
        g.connect(this.out);
        src.start(at);
      }
      // Faint hollow tail
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(140, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + 0.05);
      g.gain.linearRampToValueAtTime(0.04, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.connect(g);
      g.connect(this.out);
      o.start(t + 0.05);
      o.stop(t + 0.5);
    }

    async wraithAttack() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Ethereal lash: bright noise sweep + thin harmonic stab.
      const buf = this.ctx.createBuffer(1, 5200, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1600);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(3200, t);
      bp.frequency.exponentialRampToValueAtTime(900, t + 0.14);
      bp.Q.value = 5;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.09, t + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.out);
      const nrev = this.ctx.createGain();
      nrev.gain.value = 0.3;
      ng.connect(nrev);
      nrev.connect(this.rev);
      src.start(t);

      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(780, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.12);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.05, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(og);
      og.connect(this.out);
      o.start(t);
      o.stop(t + 0.18);
    }

    async wraithDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Dissolve: glassy tone dropping into a hollow fade.
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(620, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.65);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g);
      g.connect(this.out);
      const revG = this.ctx.createGain();
      revG.gain.value = 0.85;
      g.connect(revG);
      revG.connect(this.rev);
      o.start(t);
      o.stop(t + 0.75);

      const buf = this.ctx.createBuffer(1, 9000, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 3400);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.05;
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.out);
      src.start(t + 0.02);
    }

    async batDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Quick high downward chirp — leathery flier struck mid-air
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(280, t + 0.18);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 3000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.setValueAtTime(0.12, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(filt); filt.connect(g); g.connect(this.out);
      o.start(t); o.stop(t + 0.24);
      // Flutter tail — short wing-beat bursts overlapping the chirp's decay
      let at = t + 0.12;
      for (let i = 0; i < 4; i++) {
        const buf = this.ctx.createBuffer(1, 1400, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / 280);
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1400;
        bp.Q.value = 3;
        const bg = this.ctx.createGain(); bg.gain.value = 0.06;
        src.connect(bp); bp.connect(bg); bg.connect(this.out);
        src.start(at);
        at += 0.05 + Math.random() * 0.02;
      }
    }

    async hover() {
      await this._ready();
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = n2f("A5");
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.2);
    }

    // ─── Hero attacks ────────────────────────────────────
    // Each champion has a distinct attack signature. The cues are short
    // (60-150ms) so they don't pile up under tower fire when the hero is
    // mid-combat — they ride alongside the tower SFX, not on top.

    async knightAttack() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Metallic clang: short bandpassed noise burst + a high ping.
      const buf = this.ctx.createBuffer(1, 3300, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 700);
      }
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, t);
      bp.frequency.exponentialRampToValueAtTime(900, t + 0.12);
      bp.Q.value = 6;
      const g = this.ctx.createGain(); g.gain.value = 0.16;
      src.connect(bp); bp.connect(g); g.connect(this.out);
      src.start(t);
      // Steel ping — a quick high sine with two partials for character.
      const partials = [{ r: 1, g: 1.0 }, { r: 2.7, g: 0.4 }, { r: 4.2, g: 0.18 }];
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.16, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
      partials.forEach((p) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = 1600 * p.r;
        const og = this.ctx.createGain(); og.gain.value = p.g;
        o.connect(og); og.connect(env);
        o.start(t); o.stop(t + 0.32);
      });
      env.connect(this.out);
    }

    async archerShoot() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Bowstring twang — punchier than the tower arrow so the player
      // can hear the difference when the hero is firing alongside towers.
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const base = 320 + Math.random() * 30;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.06);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.09, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(og); og.connect(this.out);
      o.start(t); o.stop(t + 0.1);
      // Whoosh tail
      const buf = this.ctx.createBuffer(1, 2200, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 600);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(2200, t);
      filt.frequency.exponentialRampToValueAtTime(600, t + 0.08);
      filt.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = 0.1;
      src.connect(filt); filt.connect(g); g.connect(this.out);
      src.start(t);
    }

    async mageFreeze() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Crystalline shimmer — three staggered high sines + a sparkle layer.
      const freqs = [880, 1320, 1980];
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * (0.97 + Math.random() * 0.06);
        const g = this.ctx.createGain();
        const at = t + i * 0.04;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.055, at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0008, at + 0.5);
        o.connect(g); g.connect(this.out);
        const revG = this.ctx.createGain(); revG.gain.value = 0.7;
        g.connect(revG); revG.connect(this.rev);
        o.start(at); o.stop(at + 0.55);
      });
      // Sparkle
      const buf = this.ctx.createBuffer(1, 5500, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1600);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 4200;
      const g = this.ctx.createGain(); g.gain.value = 0.07;
      src.connect(hp); hp.connect(g); g.connect(this.out);
      src.start(t);
    }

    async heroDeath() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Descending sub-bass + wash of reverb. Deliberately weighty so the
      // player notices the hero went down.
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.9);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.42, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      o.connect(g); g.connect(this.out);
      const revG = this.ctx.createGain(); revG.gain.value = 0.8;
      g.connect(revG); revG.connect(this.rev);
      o.start(t); o.stop(t + 1.1);
      // Hollow knell — a faint dissonant chord, sells the "the hero has
      // fallen" mood. Two slightly-detuned low partials.
      const partials = [{ f: 220, g: 0.6 }, { f: 233, g: 0.5 }];
      partials.forEach((p) => {
        const po = this.ctx.createOscillator();
        po.type = 'triangle'; po.frequency.value = p.f;
        const pg = this.ctx.createGain();
        pg.gain.setValueAtTime(0, t);
        pg.gain.linearRampToValueAtTime(0.06 * p.g, t + 0.08);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        po.connect(pg); pg.connect(this.out);
        const prg = this.ctx.createGain(); prg.gain.value = 1.0;
        pg.connect(prg); prg.connect(this.rev);
        po.start(t); po.stop(t + 1.0);
      });
    }

    async heroSelect() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Bright two-note bell glide for the picker — punchier than `tick`
      // so a click on a hero card reads as a major choice, not a UI noise.
      const notes = ['E5', 'B5'];
      notes.forEach((name, i) => {
        const freq = n2f(name);
        const at = t + i * 0.06;
        const partials = [
          { r: 1, g: 1.0 }, { r: 2.01, g: 0.45 }, { r: 3.02, g: 0.2 },
        ];
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(0.13, at + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0008, at + 0.45);
        partials.forEach((p) => {
          const o = this.ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = freq * p.r;
          const g = this.ctx.createGain(); g.gain.value = p.g;
          o.connect(g); g.connect(env);
          o.start(at); o.stop(at + 0.5);
        });
        env.connect(this.out);
        const revG = this.ctx.createGain(); revG.gain.value = 0.6;
        env.connect(revG); revG.connect(this.rev);
      });
    }
  }

  // ─── UI ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("pk-music-styles")) return;
    const style = document.createElement("style");
    style.id = "pk-music-styles";
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
    const wrap = document.createElement("div");
    wrap.className = "music-ui";
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

    const btn = wrap.querySelector(".music-toggle");
    let on = false;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      on = !on;
      btn.classList.toggle("on", on);
      if (on) {
        await music.start();
        try {
          localStorage.setItem("pk-music", "on");
        } catch (e) {}
      } else {
        music.stop();
        try {
          localStorage.setItem("pk-music", "off");
        } catch (e) {}
      }
    });

    // Auto-resume on first interaction if previously enabled
    let saved = "on";
    try {
      saved = localStorage.getItem("pk-music") || "on";
    } catch (e) {}
    if (saved === "on") {
      const start = async () => {
        if (on) return;
        on = true;
        btn.classList.add("on");
        await music.start();
        document.removeEventListener("click", start);
        document.removeEventListener("keydown", start);
      };
      document.addEventListener("click", start, { once: false });
      document.addEventListener("keydown", start, { once: false });
    }
  }

  const music = new DungeonMusic();
  const sfx = new SFX(music);

  window.PactkeeperMusic = music;
  window.PactkeeperSFX = sfx;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => injectUI(music));
  } else {
    injectUI(music);
  }
})();
