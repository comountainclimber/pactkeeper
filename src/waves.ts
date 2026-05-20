/**
 * Wave roster. The level is a sequence of waves; each wave is a sequence of
 * groups; each group spawns N enemies of one kind separated by `gap` seconds.
 *
 * To add or rebalance a wave: edit `WAVES` below. The HUD pip-row and victory
 * trigger both read `TOTAL_WAVES`, which auto-updates from the array length.
 *
 * The final wave is special only in that {@link Game} ends the level with
 * victory once it's cleared (see `update()`). Mark your boss accordingly.
 *
 * Pact `waveSizeMult` multiplies each group's `count` (rounded, min 1) at
 * spawn time — see `Game.updateWaveSpawning`.
 */

import type { EnemyKind } from "./config.ts";
import { CURRENT_LEVEL } from "./levels.ts";

/**
 * One contiguous group of identical spawns inside a wave.
 *
 * - `kind` — keys into `ENEMY_DEFS`.
 * - `count` — number of enemies to spawn before moving to the next group.
 * - `gap` — seconds between successive spawns within this group. Spawn timing
 *   is paused while `preDelay` ticks down; not paused between groups (a 0.5s
 *   inter-group buffer lives in `updateWaveSpawning`).
 */
export type WaveGroup = { kind: EnemyKind; count: number; gap: number };

/**
 * A single wave. `groups` spawn sequentially. `preDelay` is the grace period
 * before the wave's first enemy spawns — for wave 1, this fires after the
 * player presses START; for subsequent waves, it's the auto-roll breather
 * between the previous wave clearing and the next one starting. Tune per-wave
 * for pacing (later waves get longer breathers in the existing roster).
 */
export type Wave = { groups: WaveGroup[]; preDelay: number };

/**
 * 5 escalating waves followed by a single-enemy boss wave. The boss kind
 * is resolved at module-load time from {@link CURRENT_LEVEL.boss}, so each
 * realm closes on its own progressively-harder named boss
 * (`hollow_warden` → `brood_mother` → `cinder_lich`). Phase-2 acceleration
 * is per-kind and baked into `updateEnemy`; no special wave config needed.
 */
export const WAVES: Wave[] = [
  {
    // Harder-enemies pass: orc opener bumped 8 → 10 so the "first decision"
    // wave actually pressures a lone T1 arrow tower.
    preDelay: 3,
    groups: [{ kind: "orc", count: 10, gap: 0.8 }],
  },
  {
    // Wave 2 is the gentle intro to the airborne rule: a small bat group is
    // tucked between the existing orc and goblin pressure so a player who
    // built a cannon-only opener notices the gap before it costs them the run.
    // Intentionally untouched in the harder-enemies pass — the early-lesson
    // pacing needs the soft on-ramp.
    preDelay: 4,
    groups: [
      { kind: "orc", count: 6, gap: 0.7 },
      { kind: "bat", count: 3, gap: 0.55 },
      { kind: "goblin", count: 4, gap: 0.5 },
    ],
  },
  {
    // Harder-enemies pass: orcs 8 → 10, goblin gap tightened 0.4 → 0.3,
    // wraith count 2 → 3 so the mid-game wraith pressure actually requires
    // a single-target answer rather than passively soaking through.
    preDelay: 5,
    groups: [
      { kind: "orc", count: 10, gap: 0.6 },
      { kind: "skeleton", count: 2, gap: 1.2 },
      { kind: "goblin", count: 6, gap: 0.3 },
      { kind: "wraith", count: 3, gap: 1.5 },
    ],
  },
  {
    // Lesson reinforced — larger flight after the player has had a wave to
    // adjust their build. If they ignored wave 2's hint, this is where the
    // missing anti-air actually starts to hurt. Bat group sized up again in
    // the harder-enemies pass (8 → 10) and skeleton gap tightened (1.0 →
    // 0.85) so an archer hero can't trivially cover the air on its own and
    // the ground line can't breathe between skeleton sweeps. Closes with the
    // first dragon sighting, confirming the anti-air line is real.
    preDelay: 5,
    groups: [
      { kind: "goblin", count: 10, gap: 0.35 },
      { kind: "bat", count: 10, gap: 0.45 },
      { kind: "skeleton", count: 4, gap: 0.85 },
      { kind: "wraith", count: 5, gap: 1.0 },
      { kind: "dragon", count: 1, gap: 0 },
    ],
  },
  {
    // Final pre-boss wave. Bumped again in the harder-enemies pass: orcs
    // 14 → 16, skeletons 5 → 6, dragons 2 → 3 (spaced 3.5s instead of 4s),
    // and preDelay 6 → 5. Knight-in-a-chokepoint stalls don't get free
    // breathing room before the boss, and the closing dragon trio demands
    // sustained anti-air rather than a single re-acquire window.
    preDelay: 5,
    groups: [
      { kind: "orc", count: 16, gap: 0.45 },
      { kind: "skeleton", count: 6, gap: 0.9 },
      { kind: "wraith", count: 4, gap: 0.75 },
      { kind: "goblin", count: 12, gap: 0.3 },
      { kind: "dragon", count: 3, gap: 3.5 },
    ],
  },
  {
    preDelay: 8,
    groups: [{ kind: CURRENT_LEVEL.boss, count: 1, gap: 0 }],
  },
];

/** Total wave count, derived from {@link WAVES}. The HUD wave pips and the
 * victory check both consume this. */
export const TOTAL_WAVES = WAVES.length;
