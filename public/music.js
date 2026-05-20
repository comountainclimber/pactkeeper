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
  // Each theme is a self-contained sound design composed by mixing
  // optional voices. The engine reads the fields it recognises and
  // skips anything missing, so a theme picks up exactly the voices
  // it declares. The active theme is chosen by `setTheme(name)` or
  // `playLevel(id)`; a theme switch fades the running theme out and
  // the new one in over ~1.4s.
  //
  // Voice fields (all optional except where noted):
  //   loopDur        — required. Seconds before scheduleLoop restarts.
  //   targetVolume   — required. Master gain target after fade-in.
  //   drone          — { root, filtFreq, lfoFreq, lfoDepth, subMix }
  //                    Standard sawtooth+sub drone bed. Skipped when
  //                    `wind` is present (the wind layer is the bed).
  //   wind           — { gain, noiseGain, lowpass, sweepDepth, sweepFreq,
  //                      rootNote } Outdoor noise/wind bed; replaces drone.
  //   pad            — pad-voice options (see `pad()` method); each
  //                    `progression` chord is rendered through this.
  //   progression    — chord events [{ notes:[], at, dur }] in seconds.
  //   sub            — sub-bass events [{ note, at, dur, gain }].
  //   bells          — sparse bell hits [[t, note], ...] + bellGain/bellDur.
  //   horn           — { note, dur, gain } sustained low triangle horn.
  //   drums          — [t1, t2, ...] war-drum impact times.
  //   rims           — [t1, t2, ...] dry stick-crack times (offbeats).
  //   lyre           — { pattern:[{at, notes, gain?}], opts } plucked arp.
  //   choir          — { sequence:[{note, at, dur}], opts } gliding voice.
  //   brass          — { hits:[{at, notes, dur, gain?}], opts } chord stabs.
  //   drips          — [{at, fromFreq?, toFreq?, gain?}] cave water drops.
  //   tremolo        — { note, gain?, lfoFreq?, lfoDepth?, revAmt? }
  //                    sustained tremolo pad layered with the drone.
  //   reverb         — { delays, fb, damp, sendGain, outGain } per-theme
  //                    FDN reverb tuning. Defaults to a medium dungeon.
  //   eq             — { lowShelfFreq/Gain, highShelfFreq/Gain, hiCutFreq,
  //                      hiCutQ } per-theme master EQ tilt + hi-cut.
  //
  // Current theme palettes:
  //   altar       — Pact altar / menu. Slow Dm ritual ambience.
  //   embergrass  — Level 1 'Embergrass Pass'. Pastoral E-Aeolian
  //                 woodland; outdoor wind bed, lyre arpeggio, open
  //                 1-5-9 voicings, triplet bell flourishes.
  //   hollowmere  — Level 2 'Hollowmere Mire'. Drowned A-Phrygian
  //                 chorus; gliding choir with vibrato, dissonant
  //                 clusters, cave drips, long lush reverb + hi-cut.
  //   ashen       — Level 3 'Ashen Reach'. Cinematic D-Phrygian
  //                 siege; brass fanfare stabs, quartal voicings,
  //                 martial drum + rim pattern, tremolo tension
  //                 layer, short tight reverb.
  //
  // Adding a theme: append an entry below and (optionally) wire it
  // into `LEVEL_THEMES` so a level id maps to it.
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

    // ── Embergrass Pass ─────────────────────────────────────
    //
    // Pastoral folk in E Aeolian. The realm should feel *outdoors*,
    // not in a dungeon, so the dark sawtooth drone is replaced with
    // a `wind` bed (lowpassed noise + low E sine). The chord
    // progression uses open 1-5-9 voicings (no third) for airy
    // openness, and a lyre arpeggio rolls through each chord in a
    // 6/8 lilt. The horn cue sustains underneath as before.
    //
    // Loop is 24s so the 6/8 feel reads as flowing motion rather
    // than the previous 36s slow drift.
    embergrass: {
      loopDur: 24,
      targetVolume: 0.42,
      wind: {
        gain: 0.05,
        noiseGain: 0.04,
        lowpass: 1500,
        sweepDepth: 400,
        sweepFreq: 0.07,
        rootNote: "E2",
      },
      pad: {
        gain: 0.034,
        osc1Type: "sine",
        osc2Type: "triangle",
        osc2Detune: 1.003,
        osc2Mix: 0.55,
        filterMinFreq: 700,
        filterMaxFreq: 2400,
        filterQ: 1.2,
        revAmt: 0.45,
        vibrato: 0,
      },
      progression: [
        // Open 1-5-9 voicings, no third — airy, modal.
        { notes: ["E3", "B3", "F#4"], at: 0, dur: 6 },
        { notes: ["G3", "D4", "A4"], at: 6, dur: 6 },
        { notes: ["B2", "F#3", "C#4"], at: 12, dur: 6 },
        { notes: ["A2", "E3", "B3"], at: 18, dur: 6 },
      ],
      sub: [
        { note: "E1", at: 0, dur: 12, gain: 0.06 },
        { note: "E1", at: 12, dur: 12, gain: 0.05 },
      ],
      // Bell triplets clustered at chord changes — wind-chime
      // flourish rather than the old sparse single hits.
      bells: [
        [0.3, "E5"],
        [0.6, "B5"],
        [0.85, "F#5"],
        [6.3, "G5"],
        [6.55, "D5"],
        [6.8, "A5"],
        [12.3, "B4"],
        [12.55, "F#5"],
        [12.8, "C#5"],
        [18.3, "A4"],
        [18.55, "E5"],
        [18.8, "B4"],
      ],
      bellGain: 0.045,
      bellDur: 5,
      // Lyre arpeggio outlining each chord across its 6s span. Six
      // pluck events per chord ≈ 1 note per beat in 6/8.
      lyre: {
        opts: { gain: 0.06, decay: 0.55, revAmt: 0.4 },
        pattern: [
          // Chord 1 (Em, root E)
          { at: 0.0, notes: ["E4"] },
          { at: 0.75, notes: ["G4"] },
          { at: 1.5, notes: ["B4"] },
          { at: 2.25, notes: ["E5"] },
          { at: 3.0, notes: ["B4"] },
          { at: 3.75, notes: ["G4"] },
          { at: 4.5, notes: ["B4"] },
          { at: 5.25, notes: ["E5"] },
          // Chord 2 (G, root G)
          { at: 6.0, notes: ["G4"] },
          { at: 6.75, notes: ["B4"] },
          { at: 7.5, notes: ["D5"] },
          { at: 8.25, notes: ["G5"] },
          { at: 9.0, notes: ["D5"] },
          { at: 9.75, notes: ["B4"] },
          { at: 10.5, notes: ["D5"] },
          { at: 11.25, notes: ["G5"] },
          // Chord 3 (B, root B)
          { at: 12.0, notes: ["B3"] },
          { at: 12.75, notes: ["D4"] },
          { at: 13.5, notes: ["F#4"] },
          { at: 14.25, notes: ["B4"] },
          { at: 15.0, notes: ["F#4"] },
          { at: 15.75, notes: ["D4"] },
          { at: 16.5, notes: ["F#4"] },
          { at: 17.25, notes: ["B4"] },
          // Chord 4 (A, root A)
          { at: 18.0, notes: ["A3"] },
          { at: 18.75, notes: ["C#4"] },
          { at: 19.5, notes: ["E4"] },
          { at: 20.25, notes: ["A4"] },
          { at: 21.0, notes: ["E4"] },
          { at: 21.75, notes: ["C#4"] },
          { at: 22.5, notes: ["E4"] },
          { at: 23.25, notes: ["A4"] },
        ],
      },
      horn: { note: "E3", dur: 24, gain: 0.034 },
      reverb: {
        // Medium woody room — outdoor under tree cover.
        delays: [0.21, 0.34],
        fb: 0.5,
        damp: 1500,
        sendGain: 1,
        outGain: 0.42,
      },
      eq: {
        // Slight bright top, gentle low warmth.
        lowShelfFreq: 200,
        lowShelfGain: 1.5,
        highShelfFreq: 3500,
        highShelfGain: 2,
        hiCutFreq: 14000,
        hiCutQ: 0.7,
      },
    },

    // ── Hollowmere Mire ─────────────────────────────────────
    //
    // Drowned chant in A Phrygian. The signature is a moving choir
    // line (single voice with portamento + vibrato), not a chord
    // stack. The pad layer underneath spells out dissonant clusters
    // (root, ♭2, 4 — A/Bb/D) for unresolved tension. Sparse cave
    // drips at irregular times sell the wet environment. Long lush
    // reverb + a master hi-cut at 3.5 kHz give the "underwater"
    // muffled feel.
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
        // Pure-sine cluster, still pad — but the choir is the lead.
        gain: 0.038,
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
        // Dissonant clusters in A Phrygian — root + ♭2 + 4.
        { notes: ["A2", "Bb2", "D3"], at: 0, dur: 10 },
        { notes: ["Bb2", "D3", "Eb3"], at: 10, dur: 10 },
        { notes: ["F2", "Bb2", "Eb3"], at: 20, dur: 10 },
        // Held tritone (A-Eb) for max unresolved tension on the
        // return chord, then resolving back to the A cluster.
        { notes: ["A2", "Eb3", "Bb3"], at: 30, dur: 10 },
      ],
      sub: [
        { note: "A1", at: 0, dur: 20, gain: 0.1 },
        { note: "A1", at: 20, dur: 20, gain: 0.085 },
      ],
      // Bell pattern thinned out — the choir carries the melody now.
      bells: [
        [12, "F3"],
        [28, "Bb3"],
      ],
      bellGain: 0.075,
      bellDur: 12,
      // Moving choir line — A → Bb → A → G → Bb → A across the loop.
      // Single voice (with stacked fifth) that glides between notes.
      choir: {
        opts: {
          gain: 0.075,
          vibratoFreq: 1.55,
          vibratoAmount: 0.005,
          glideRatio: 0.55,
          revAmt: 0.95,
        },
        sequence: [
          { note: "A3", at: 0, dur: 7 },
          { note: "Bb3", at: 7, dur: 6 },
          { note: "A3", at: 13, dur: 6 },
          { note: "G3", at: 19, dur: 6 },
          { note: "Bb3", at: 25, dur: 7 },
          { note: "A3", at: 32, dur: 8 },
        ],
      },
      // Cave drips — irregular spacing, sparse.
      drips: [
        { at: 3.2 },
        { at: 9.7 },
        { at: 17.4, fromFreq: 1500, toFreq: 240 },
        { at: 22.1 },
        { at: 31.8, fromFreq: 2100, toFreq: 320 },
        { at: 37.6 },
      ],
      reverb: {
        // Very long lush tail with extra shimmer — drowned cave.
        delays: [0.31, 0.49],
        fb: 0.82,
        damp: 2200,
        sendGain: 1,
        outGain: 0.6,
      },
      eq: {
        // Hi-cut at 3.5 kHz for the muffled-underwater feel; slight
        // low-mid weight, dipped highs.
        lowShelfFreq: 180,
        lowShelfGain: 1,
        highShelfFreq: 5000,
        highShelfGain: -3,
        hiCutFreq: 3500,
        hiCutQ: 0.6,
      },
    },

    // ── Ashen Reach ─────────────────────────────────────────
    //
    // Cinematic D-Phrygian siege. The signature is brass fanfare
    // stabs over a tightened martial drum pattern. The chord
    // progression uses stacked-fifth / quartal voicings (D-A-E /
    // Eb-Bb-F) instead of triads for a more modern cinematic feel.
    // A high tremolo pad layers over the standard drone to sell
    // active dread. Reverb is short and tight so drum + brass stay
    // punchy.
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
        // Soft pad now — the brass stabs do the cinematic work.
        gain: 0.038,
        osc1Type: "sawtooth",
        osc2Type: "triangle",
        osc2Detune: 1.006,
        osc2Mix: 0.45,
        filterMinFreq: 220,
        filterMaxFreq: 1500,
        filterQ: 3.5,
        revAmt: 0.3,
        vibrato: 0,
      },
      progression: [
        // Quartal / stacked-fifth voicings — D-A-E, Eb-Bb-F, etc.
        { notes: ["D3", "A3", "E4"], at: 0, dur: 6 },
        { notes: ["Eb3", "Bb3", "F4"], at: 6, dur: 6 },
        { notes: ["G3", "D4", "A4"], at: 12, dur: 6 },
        { notes: ["A3", "E4", "B4"], at: 18, dur: 6 },
      ],
      sub: [
        { note: "D1", at: 0, dur: 12, gain: 0.11 },
        { note: "D1", at: 12, dur: 12, gain: 0.09 },
      ],
      bells: [
        // Bright urgent embers, sparser than before to make room
        // for the brass.
        [2.5, "D6"],
        [8.5, "F5"],
        [14.5, "Eb6"],
        [20.5, "A5"],
      ],
      bellGain: 0.06,
      bellDur: 4,
      // Brass fanfare stabs — land on the downbeats of each chord
      // (the "1" of each bar), with an answering stab on beat 4.
      brass: {
        opts: {
          gain: 0.055,
          detune: 1.006,
          filterMinFreq: 380,
          filterMaxFreq: 3200,
          filterQ: 1.4,
          attack: 0.025,
          revAmt: 0.25,
        },
        hits: [
          { at: 0, notes: ["D3", "A3", "D4"], dur: 0.7 },
          { at: 3, notes: ["A3", "E4", "A4"], dur: 0.5 },
          { at: 6, notes: ["Eb3", "Bb3", "Eb4"], dur: 0.7 },
          { at: 9, notes: ["Bb3", "F4", "Bb4"], dur: 0.5 },
          { at: 12, notes: ["G3", "D4", "G4"], dur: 0.7 },
          { at: 15, notes: ["D4", "A4", "D5"], dur: 0.5 },
          { at: 18, notes: ["A3", "E4", "A4"], dur: 0.7 },
          { at: 21, notes: ["E4", "B4", "E5"], dur: 0.5 },
        ],
      },
      // Martial drum pattern — kick on 1 and 3 of each 6s bar,
      // with double-time fill on the 4-beat lead-in. Tighter than
      // the old "every 2s" placeholder pattern.
      drums: [
        0, 1.5, 3, 4.5,
        6, 7.5, 9, 10.5,
        12, 13.5, 15, 16.5,
        18, 19.5, 21, 22.5,
      ],
      // Offbeat rim cracks — fall between the kicks. Adds the
      // "running" feeling of a march.
      rims: [
        0.75, 2.25, 3.75, 5.25,
        6.75, 8.25, 9.75, 11.25,
        12.75, 14.25, 15.75, 17.25,
        18.75, 20.25, 21.75, 23.25,
      ],
      // High tremolo pad — D5 violin-tremolo over the drone.
      tremolo: { note: "D5", gain: 0.025, lfoFreq: 6, lfoDepth: 0.75, revAmt: 0.4 },
      reverb: {
        // Short, tight — drums and brass should punch through.
        delays: [0.13, 0.21],
        fb: 0.35,
        damp: 1200,
        sendGain: 1,
        outGain: 0.4,
      },
      eq: {
        // Full-range with a slight low-mid push — cinematic body.
        lowShelfFreq: 220,
        lowShelfGain: 2,
        highShelfFreq: 4500,
        highShelfGain: 1,
        hiCutFreq: 16000,
        hiCutQ: 0.7,
      },
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

      // Master chain. Signal flow:
      //   master ──► eqIn (lowShelf → highShelf → hiCut) ──► comp ──► destination
      //   reverbSend (FDN) ─────────────────────────────────► master
      // Reverb feeds back into master so it picks up the same EQ
      // colouration as the dry signal. EQ + reverb are rebuildable
      // per theme via `_swapEQ()` / `_swapReverb()` in `setTheme()`.
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;

      this._comp = this.ctx.createDynamicsCompressor();
      this._comp.threshold.value = -18;
      this._comp.knee.value = 6;
      this._comp.ratio.value = 4;
      this._comp.attack.value = 0.005;
      this._comp.release.value = 0.1;
      this._comp.connect(this.ctx.destination);

      this._buildEQ();
      this.master.connect(this._eqIn);
      this._eqOut.connect(this._comp);

      this._buildReverb();
    }

    // Per-theme master EQ. A low-shelf + high-shelf for tonal tilt
    // and a final lowpass for "muffled" hi-cut (used by hollowmere
    // to sell the drowned/underwater feel). Defaults are flat.
    _buildEQ(opts = {}) {
      const o = {
        lowShelfFreq: 220,
        lowShelfGain: 0,
        highShelfFreq: 4000,
        highShelfGain: 0,
        hiCutFreq: 18000,
        hiCutQ: 0.7,
        ...opts,
      };
      const ctx = this.ctx;
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = o.lowShelfFreq;
      lowShelf.gain.value = o.lowShelfGain;
      const highShelf = ctx.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = o.highShelfFreq;
      highShelf.gain.value = o.highShelfGain;
      const hiCut = ctx.createBiquadFilter();
      hiCut.type = "lowpass";
      hiCut.frequency.value = o.hiCutFreq;
      hiCut.Q.value = o.hiCutQ;
      lowShelf.connect(highShelf);
      highShelf.connect(hiCut);
      this._eqIn = lowShelf;
      this._eqOut = hiCut;
      this._eqNodes = [lowShelf, highShelf, hiCut];
    }

    // Tear down the EQ chain (called before rebuilding with new
    // settings). Safe to call when no EQ exists yet.
    _destroyEQ() {
      if (!this._eqNodes) return;
      for (const n of this._eqNodes) {
        try {
          n.disconnect();
        } catch (e) {}
      }
      this._eqNodes = null;
      this._eqIn = null;
      this._eqOut = null;
    }

    // Swap the EQ chain for new settings without dropping audio.
    // Disconnects master → old EQ, builds the new chain, reconnects
    // master → new EQ → comp.
    _swapEQ(opts) {
      if (!this.ctx) return;
      if (this._eqIn) {
        try {
          this.master.disconnect(this._eqIn);
        } catch (e) {}
        try {
          this._eqOut.disconnect();
        } catch (e) {}
      }
      this._destroyEQ();
      this._buildEQ(opts);
      this.master.connect(this._eqIn);
      this._eqOut.connect(this._comp);
    }

    // Per-theme reverb. A feedback-delay network — cheap, dungeon-y,
    // and entirely defined by the two delay times, the feedback gain
    // (controls tail length), and the in-loop lowpass (controls how
    // dark the tail decays). All four are tweakable per theme.
    _buildReverb(opts = {}) {
      const o = {
        delays: [0.27, 0.43],
        fb: 0.62,
        damp: 1800,
        sendGain: 1,
        outGain: 0.5,
        ...opts,
      };
      const ctx = this.ctx;
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = o.sendGain;
      const d1 = ctx.createDelay(2);
      d1.delayTime.value = o.delays[0];
      const d2 = ctx.createDelay(2);
      d2.delayTime.value = o.delays[1];
      const fbG = ctx.createGain();
      fbG.gain.value = o.fb;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = o.damp;
      this.reverbSend.connect(d1);
      d1.connect(damp);
      damp.connect(d2);
      d2.connect(fbG);
      fbG.connect(d1);
      const revOut = ctx.createGain();
      revOut.gain.value = o.outGain;
      damp.connect(revOut);
      d2.connect(revOut);
      revOut.connect(this.master);
      this._reverbNodes = [this.reverbSend, d1, d2, fbG, damp, revOut];
    }

    _destroyReverb() {
      if (!this._reverbNodes) return;
      for (const n of this._reverbNodes) {
        try {
          n.disconnect();
        } catch (e) {}
      }
      this._reverbNodes = null;
      this.reverbSend = null;
    }

    // Swap reverb FDN parameters. Existing per-voice sends already
    // hold a reference to the *old* reverbSend, so they fade out
    // through the old chain; new voices route to the new chain.
    // The two chains coexist briefly during a theme crossfade.
    _swapReverb(opts) {
      if (!this.ctx) return;
      const oldNodes = this._reverbNodes;
      this._reverbNodes = null;
      this._buildReverb(opts);
      // Schedule the old chain for cleanup after the crossfade tail
      // has had time to decay. 3s covers even the longest tail
      // (hollowmere at fb 0.82).
      if (oldNodes) {
        setTimeout(() => {
          for (const n of oldNodes) {
            try {
              n.disconnect();
            } catch (e) {}
          }
        }, 3000);
      }
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

    // Short, dry rim/stick crack — sells the offbeat of a martial
    // pattern alongside `drum`. Highpass noise burst, no sub.
    rim(t, gain = 0.1) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, 900, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 140);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
    }

    // Plucked lyre/harp — the Embergrass arpeggio voice. Sine
    // fundamental + triangle 2nd harmonic, fast attack and ~0.5s
    // decay. No inharmonic partials (that's `bell`); the harmonic
    // partials give it a folk-pluck timbre rather than a chime.
    lyre(notes, t, opts = {}) {
      const o = {
        gain: 0.07,
        decay: 0.5,
        revAmt: 0.35,
        ...opts,
      };
      const ctx = this.ctx;
      notes.forEach((name) => {
        const freq = n2f(name);
        const partials = [
          { type: "sine", mult: 1, g: 1.0 },
          { type: "triangle", mult: 2, g: 0.32 },
          { type: "sine", mult: 3, g: 0.12 },
        ];
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(o.gain, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0008, t + o.decay);
        partials.forEach((p) => {
          const osc = ctx.createOscillator();
          osc.type = p.type;
          osc.frequency.value = freq * p.mult;
          const g = ctx.createGain();
          g.gain.value = p.g;
          osc.connect(g);
          g.connect(env);
          osc.start(t);
          osc.stop(t + o.decay + 0.05);
        });
        env.connect(this.master);
        if (o.revAmt > 0) {
          const revG = ctx.createGain();
          revG.gain.value = o.revAmt;
          env.connect(revG);
          revG.connect(this.reverbSend);
        }
      });
    }

    // Drowned choir — the Hollowmere lead. A single voice (root +
    // fifth) that glides between notes (portamento) under a slow
    // ~1.6 Hz vibrato. One long envelope per sequence so it reads as
    // a continuous "ahhh" rather than discrete syllables.
    //
    // `sequence` is an array of { note, at, dur } in seconds relative
    // to `t`. Each event glides from the previous pitch into the new
    // pitch over `glideRatio * dur` of its own segment.
    choir(sequence, t, opts = {}) {
      if (!sequence || !sequence.length) return;
      const o = {
        gain: 0.075,
        vibratoFreq: 1.6,
        vibratoAmount: 0.005,
        glideRatio: 0.55,
        revAmt: 0.9,
        ...opts,
      };
      const ctx = this.ctx;
      const last = sequence[sequence.length - 1];
      const totalDur = last.at + last.dur;

      const makeVoice = (freqMult) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(n2f(sequence[0].note) * freqMult, t);
        for (let i = 1; i < sequence.length; i++) {
          const ev = sequence[i];
          const targetFreq = n2f(ev.note) * freqMult;
          osc.frequency.linearRampToValueAtTime(
            targetFreq,
            t + ev.at + ev.dur * o.glideRatio
          );
        }
        return osc;
      };

      const voice1 = makeVoice(1);
      const voice2 = makeVoice(1.5);
      const v2g = ctx.createGain();
      v2g.gain.value = 0.4;

      // Vibrato — modulates both voices together.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = o.vibratoFreq;
      const lfog = ctx.createGain();
      lfog.gain.value = n2f(sequence[0].note) * o.vibratoAmount;
      lfo.connect(lfog);
      lfog.connect(voice1.frequency);
      const lfog2 = ctx.createGain();
      lfog2.gain.value = n2f(sequence[0].note) * o.vibratoAmount * 1.5;
      lfo.connect(lfog2);
      lfog2.connect(voice2.frequency);

      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1300;
      filt.Q.value = 1;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(o.gain, t + Math.min(1.8, totalDur * 0.2));
      env.gain.setValueAtTime(o.gain, t + Math.max(0, totalDur - 2));
      env.gain.linearRampToValueAtTime(0, t + totalDur);

      voice1.connect(filt);
      voice2.connect(v2g);
      v2g.connect(filt);
      filt.connect(env);
      env.connect(this.master);

      if (o.revAmt > 0) {
        const revG = ctx.createGain();
        revG.gain.value = o.revAmt;
        env.connect(revG);
        revG.connect(this.reverbSend);
      }

      voice1.start(t);
      voice2.start(t);
      lfo.start(t);
      voice1.stop(t + totalDur + 0.2);
      voice2.stop(t + totalDur + 0.2);
      lfo.stop(t + totalDur + 0.2);
    }

    // Brass fanfare stab — the Ashen lead. Short sawtooth chord with
    // a fast filter open (percussive attack) and quick decay. Lands
    // on the downbeat of the war-drum pattern.
    brass(notes, t, dur = 0.6, opts = {}) {
      const o = {
        gain: 0.055,
        detune: 1.005,
        filterMinFreq: 400,
        filterMaxFreq: 3200,
        filterQ: 1.4,
        attack: 0.02,
        revAmt: 0.25,
        ...opts,
      };
      const ctx = this.ctx;
      notes.forEach((name) => {
        const freq = n2f(name);
        const o1 = ctx.createOscillator();
        o1.type = "sawtooth";
        o1.frequency.value = freq;
        const o2 = ctx.createOscillator();
        o2.type = "sawtooth";
        o2.frequency.value = freq * o.detune;
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.setValueAtTime(o.filterMinFreq, t);
        filt.frequency.exponentialRampToValueAtTime(
          o.filterMaxFreq,
          t + o.attack * 2
        );
        filt.frequency.exponentialRampToValueAtTime(
          Math.max(o.filterMinFreq, 220),
          t + dur
        );
        filt.Q.value = o.filterQ;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(o.gain, t + o.attack);
        env.gain.setValueAtTime(o.gain, t + dur * 0.5);
        env.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o1.connect(filt);
        o2.connect(filt);
        filt.connect(env);
        env.connect(this.master);
        if (o.revAmt > 0) {
          const revG = ctx.createGain();
          revG.gain.value = o.revAmt;
          env.connect(revG);
          revG.connect(this.reverbSend);
        }
        o1.start(t);
        o2.start(t);
        o1.stop(t + dur + 0.1);
        o2.stop(t + dur + 0.1);
      });
    }

    // Outdoor wind bed — the Embergrass drone replacement. A looping
    // brown-noise buffer through a slow filter sweep + a low sine
    // root for a tonal anchor. Returns a stop handle so `startDrone`
    // can track it alongside (or instead of) the standard sawtooth
    // drone.
    wind(t, opts = {}) {
      const o = {
        gain: 0.05,
        noiseGain: 0.04,
        lowpass: 1400,
        sweepDepth: 400,
        sweepFreq: 0.07,
        rootNote: "E2",
        ...opts,
      };
      const ctx = this.ctx;
      // 4s of brown-ish noise, looped — much smaller than a per-loop
      // buffer and indistinguishable at the lowpass cutoffs we use.
      const bufLen = Math.floor(ctx.sampleRate * 4);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.04 * white) / 1.04;
        d[i] = lastOut * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = o.lowpass;
      lp.Q.value = 0.5;

      const lpLfo = ctx.createOscillator();
      lpLfo.type = "sine";
      lpLfo.frequency.value = o.sweepFreq;
      const lpLfog = ctx.createGain();
      lpLfog.gain.value = o.sweepDepth;
      lpLfo.connect(lpLfog);
      lpLfog.connect(lp.frequency);

      const noiseG = ctx.createGain();
      noiseG.gain.setValueAtTime(0, t);
      noiseG.gain.linearRampToValueAtTime(o.noiseGain, t + 3);

      src.connect(lp);
      lp.connect(noiseG);
      noiseG.connect(this.master);
      src.start(t);
      lpLfo.start(t);

      const root = ctx.createOscillator();
      root.type = "sine";
      root.frequency.value = n2f(o.rootNote);
      const rootG = ctx.createGain();
      rootG.gain.setValueAtTime(0, t);
      rootG.gain.linearRampToValueAtTime(o.gain, t + 3);
      root.connect(rootG);
      rootG.connect(this.master);
      root.start(t);

      return {
        stop: (when) => {
          try {
            src.stop(when);
          } catch (e) {}
          try {
            lpLfo.stop(when);
          } catch (e) {}
          try {
            root.stop(when);
          } catch (e) {}
        },
      };
    }

    // Tremolo pad — the Ashen tension layer. Sustained high sine
    // with amplitude LFO at ~6 Hz, like a violin tremolo. Stacks on
    // top of the standard drone to sell active dread.
    tremolo(note, t, opts = {}) {
      const o = {
        gain: 0.04,
        lfoFreq: 6,
        lfoDepth: 0.7,
        revAmt: 0.5,
        ...opts,
      };
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = n2f(note);

      // ConstantSource + LFO sum to drive a gain in [1-depth, 1].
      const ampG = ctx.createGain();
      ampG.gain.value = 1 - o.lfoDepth * 0.5;
      const dc = ctx.createConstantSource();
      dc.offset.value = 0;
      dc.connect(ampG.gain);
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = o.lfoFreq;
      const lfog = ctx.createGain();
      lfog.gain.value = o.lfoDepth * 0.5;
      lfo.connect(lfog);
      lfog.connect(ampG.gain);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(o.gain, t + 4);

      osc.connect(ampG);
      ampG.connect(env);
      env.connect(this.master);

      if (o.revAmt > 0) {
        const revG = ctx.createGain();
        revG.gain.value = o.revAmt;
        env.connect(revG);
        revG.connect(this.reverbSend);
      }

      osc.start(t);
      lfo.start(t);
      dc.start(t);

      return {
        stop: (when) => {
          try {
            osc.stop(when);
          } catch (e) {}
          try {
            lfo.stop(when);
          } catch (e) {}
          try {
            dc.stop(when);
          } catch (e) {}
        },
      };
    }

    // Cave water drop — the Hollowmere foley. Quick high→low sine
    // glide soaked in reverb. Sparse, irregular timing in the theme
    // sells the "wet" environment.
    drip(t, opts = {}) {
      const o = {
        gain: 0.05,
        fromFreq: 1800,
        toFreq: 280,
        decay: 0.55,
        revAmt: 1.0,
        ...opts,
      };
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(o.fromFreq, t);
      osc.frequency.exponentialRampToValueAtTime(o.toFreq, t + o.decay);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(o.gain, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0005, t + o.decay);
      osc.connect(env);
      env.connect(this.master);
      if (o.revAmt > 0) {
        const revG = ctx.createGain();
        revG.gain.value = o.revAmt;
        env.connect(revG);
        revG.connect(this.reverbSend);
      }
      osc.start(t);
      osc.stop(t + o.decay + 0.1);
    }

    startDrone() {
      const T = THEMES[this.currentTheme];
      const ctx = this.ctx;
      const t = ctx.currentTime;

      // Theme bed selection. Themes with `wind` (embergrass) replace
      // the standard sawtooth drone with an outdoor noise/wind bed.
      // All other themes use the sawtooth drone.
      if (T.wind) {
        const handle = this.wind(t, T.wind);
        this.drones.push(handle);
      } else if (T.drone) {
        const D = T.drone;
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

        // Filter LFO: very slow open/close. Rate + depth come from
        // the theme so ashen can pulse faster (0.12 Hz) than altar's
        // drift (0.04 Hz).
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

        o1.start(t);
        o2.start(t);
        o3.start(t);
        lfo.start(t);

        this.drones.push({
          stop: (when) => {
            try { o1.stop(when); } catch (e) {}
            try { o2.stop(when); } catch (e) {}
            try { o3.stop(when); } catch (e) {}
            try { lfo.stop(when); } catch (e) {}
          },
        });
      }

      // Optional tremolo layer (ashen). Stacks on top of whichever
      // bed was chosen above. Tracked as a drone so it stops cleanly
      // on fade-out / theme swap.
      if (T.tremolo) {
        const tr = this.tremolo(T.tremolo.note, t, T.tremolo);
        this.drones.push(tr);
      }
    }

    // ─── Loop ────────────────────────────────────────────────
    scheduleLoop(startT) {
      const T = THEMES[this.currentTheme];
      if (T.progression) {
        for (const c of T.progression) {
          this.pad(c.notes, startT + c.at, c.dur, T.pad);
        }
      }
      if (T.sub) {
        for (const s of T.sub) {
          this.sub(s.note, startT + s.at, s.dur, s.gain);
        }
      }
      if (T.bells) {
        for (const [tOff, n] of T.bells) {
          this.bell(n, startT + tOff, T.bellDur, T.bellGain);
        }
      }
      if (T.horn) {
        this.horn(T.horn.note, startT, T.horn.dur, T.horn.gain);
      }
      if (T.drums) {
        for (const tOff of T.drums) this.drum(startT + tOff);
      }
      if (T.rims) {
        for (const tOff of T.rims) this.rim(startT + tOff);
      }
      if (T.lyre) {
        for (const e of T.lyre.pattern) {
          this.lyre(e.notes, startT + e.at, {
            ...(T.lyre.opts || {}),
            ...(e.gain != null ? { gain: e.gain } : {}),
          });
        }
      }
      if (T.choir) {
        this.choir(T.choir.sequence, startT, T.choir.opts || {});
      }
      if (T.brass) {
        for (const h of T.brass.hits) {
          this.brass(h.notes, startT + h.at, h.dur, {
            ...(T.brass.opts || {}),
            ...(h.gain != null ? { gain: h.gain } : {}),
          });
        }
      }
      if (T.drips) {
        for (const d of T.drips) {
          const opts = {};
          if (d.fromFreq != null) opts.fromFreq = d.fromFreq;
          if (d.toFreq != null) opts.toFreq = d.toFreq;
          if (d.gain != null) opts.gain = d.gain;
          if (d.decay != null) opts.decay = d.decay;
          this.drip(startT + d.at, opts);
        }
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

      // Apply the theme's reverb / EQ before any voices are scheduled
      // so the very first chord lands in the right "room". `_swapEQ`
      // / `_swapReverb` are no-ops if the new settings match the old.
      this._swapEQ(T.eq || {});
      this._swapReverb(T.reverb || {});

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

    async dragonRoar() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      // Three-voice roar — sawtooth chest rumble carries the bulk and
      // is the only voice routed to reverb so the cry rings through the
      // realm; a swept-bandpass noise breath sells the exhalation; a
      // dry highpass crackle rides on top as ember-spit.

      // 1. Chest rumble — low sawtooth swept 80→38 Hz, soft-knee LP.
      const rumble = this.ctx.createOscillator();
      rumble.type = "sawtooth";
      rumble.frequency.setValueAtTime(80, t);
      rumble.frequency.exponentialRampToValueAtTime(38, t + 0.75);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      lp.Q.value = 3;
      const rg = this.ctx.createGain();
      rg.gain.setValueAtTime(0, t);
      rg.gain.linearRampToValueAtTime(0.28, t + 0.02);
      rg.gain.setValueAtTime(0.28, t + 0.45);
      rg.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      rumble.connect(lp);
      lp.connect(rg);
      rg.connect(this.out);
      const revG = this.ctx.createGain();
      revG.gain.value = 0.45;
      rg.connect(revG);
      revG.connect(this.rev);
      rumble.start(t);
      rumble.stop(t + 0.9);

      // 2. Breath — swept bandpass noise sustaining under the rumble.
      const buf = this.ctx.createBuffer(1, 12000, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 4000);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1800, t);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.7);
      bp.Q.value = 2;
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.16, t + 0.05);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      src.connect(bp);
      bp.connect(bg);
      bg.connect(this.out);
      src.start(t);

      // 3. Ember crackle — dry highpass burst seated after the growl
      //    onset so it reads as fire-spark riding the roar.
      const eb = this.ctx.createBuffer(1, 3500, this.ctx.sampleRate);
      const ed = eb.getChannelData(0);
      for (let i = 0; i < ed.length; i++)
        ed[i] = (Math.random() * 2 - 1) * Math.exp(-i / 900);
      const esrc = this.ctx.createBufferSource();
      esrc.buffer = eb;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3200;
      const eg = this.ctx.createGain();
      eg.gain.value = 0.09;
      esrc.connect(hp);
      hp.connect(eg);
      eg.connect(this.out);
      esrc.start(t + 0.08);
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

    async octopusSlam() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Layer 1: sub-bass thump — sine ~80 Hz, hard transient, 80 ms decay.
      // Distinct from cannonFire (sharp percussive boom) because this is a
      // pure sine with no harmonic content — it feels liquid, not metallic.
      const thump = this.ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(82, t);
      thump.frequency.exponentialRampToValueAtTime(42, t + 0.08);
      const tg = this.ctx.createGain();
      tg.gain.setValueAtTime(0, t);
      tg.gain.linearRampToValueAtTime(0.13, t + 0.005);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      thump.connect(tg);
      tg.connect(this.out);
      thump.start(t);
      thump.stop(t + 0.09);

      // Layer 2: suction squelch — bandpass noise sweeping 3 kHz → 250 Hz.
      // Wider and lower than wraithAttack's 3200→900 sweep; the low landing
      // frequency reads as "wet" rather than "ethereal".
      const sqBuf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * 0.28), this.ctx.sampleRate);
      const sqd = sqBuf.getChannelData(0);
      for (let i = 0; i < sqd.length; i++)
        sqd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
      const sqSrc = this.ctx.createBufferSource();
      sqSrc.buffer = sqBuf;
      const sqBp = this.ctx.createBiquadFilter();
      sqBp.type = "bandpass";
      sqBp.frequency.setValueAtTime(3000, t + 0.005);
      sqBp.frequency.exponentialRampToValueAtTime(250, t + 0.25);
      sqBp.Q.value = 4;
      const sqg = this.ctx.createGain();
      sqg.gain.setValueAtTime(0, t);
      sqg.gain.linearRampToValueAtTime(0.11, t + 0.008);
      sqg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      sqSrc.connect(sqBp);
      sqBp.connect(sqg);
      sqg.connect(this.out);
      const sqRev = this.ctx.createGain();
      sqRev.gain.value = 0.25;
      sqg.connect(sqRev);
      sqRev.connect(this.rev);
      sqSrc.start(t + 0.005);

      // Layer 3: warbly wet cry — low triangle ~170 Hz with hand-stepped
      // vibrato. Much lower than wraithAttack's 780 Hz stab; reads as a
      // heavy biological groan rather than an ethereal shriek.
      const cry = this.ctx.createOscillator();
      cry.type = "triangle";
      cry.frequency.setValueAtTime(172, t + 0.01);
      cry.frequency.linearRampToValueAtTime(185, t + 0.04);
      cry.frequency.linearRampToValueAtTime(158, t + 0.07);
      cry.frequency.linearRampToValueAtTime(175, t + 0.10);
      cry.frequency.linearRampToValueAtTime(162, t + 0.13);
      const cg = this.ctx.createGain();
      cg.gain.setValueAtTime(0, t + 0.01);
      cg.gain.linearRampToValueAtTime(0.08, t + 0.025);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      cry.connect(cg);
      cg.connect(this.out);
      cry.start(t + 0.01);
      cry.stop(t + 0.2);
    }

    async octopusDie() {
      await this._ready();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;

      // Layer 1: wet pop — very short noise burst through a lowpass at 280 Hz.
      // Lowpass is much darker than wraithDie's highpass shimmer (1800 Hz),
      // anchoring the cue as massive and squishy, not glassy.
      const popBuf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * 0.05), this.ctx.sampleRate);
      const popd = popBuf.getChannelData(0);
      for (let i = 0; i < popd.length; i++)
        popd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.012));
      const popSrc = this.ctx.createBufferSource();
      popSrc.buffer = popBuf;
      const popLp = this.ctx.createBiquadFilter();
      popLp.type = "lowpass";
      popLp.frequency.value = 280;
      const popg = this.ctx.createGain();
      popg.gain.setValueAtTime(0.14, t);
      popg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      popSrc.connect(popLp);
      popLp.connect(popg);
      popg.connect(this.out);
      const popRevG = this.ctx.createGain();
      popRevG.gain.value = 0.5;
      popg.connect(popRevG);
      popRevG.connect(this.rev);
      popSrc.start(t);

      // Layer 2: descending pitch sweep — sine 400 → 80 Hz over 0.7 s.
      // Slower and lower than wraithDie's 620→120 Hz fall; the flatter arc
      // reads as a heavy body collapsing rather than a spirit dissolving.
      const sweep = this.ctx.createOscillator();
      sweep.type = "sine";
      sweep.frequency.setValueAtTime(400, t + 0.01);
      sweep.frequency.exponentialRampToValueAtTime(80, t + 0.72);
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0, t + 0.01);
      sg.gain.linearRampToValueAtTime(0.12, t + 0.025);
      sg.gain.setValueAtTime(0.12, t + 0.08);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.80);
      sweep.connect(sg);
      sg.connect(this.out);
      const sweepRevG = this.ctx.createGain();
      sweepRevG.gain.value = 1.0;
      sg.connect(sweepRevG);
      sweepRevG.connect(this.rev);
      sweep.start(t + 0.01);
      sweep.stop(t + 0.85);

      // Layer 3: deflate noise tail — lowpass-filtered slow-decaying noise for
      // the "air escaping" texture. Lowpassed at 600 Hz keeps it muddy-wet.
      const tailBuf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * 0.82), this.ctx.sampleRate);
      const taild = tailBuf.getChannelData(0);
      for (let i = 0; i < taild.length; i++)
        taild[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.30));
      const tailSrc = this.ctx.createBufferSource();
      tailSrc.buffer = tailBuf;
      const tailLp = this.ctx.createBiquadFilter();
      tailLp.type = "lowpass";
      tailLp.frequency.setValueAtTime(600, t + 0.02);
      tailLp.frequency.exponentialRampToValueAtTime(120, t + 0.80);
      const tailg = this.ctx.createGain();
      tailg.gain.setValueAtTime(0, t + 0.02);
      tailg.gain.linearRampToValueAtTime(0.09, t + 0.06);
      tailg.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      tailSrc.connect(tailLp);
      tailLp.connect(tailg);
      tailg.connect(this.out);
      const tailRevG = this.ctx.createGain();
      tailRevG.gain.value = 0.6;
      tailg.connect(tailRevG);
      tailRevG.connect(this.rev);
      tailSrc.start(t + 0.02);
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
