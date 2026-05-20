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
 * 5 escalating waves followed by a single-enemy boss wave. The boss has
 * phase-2 acceleration baked into `updateEnemy`; no special wave config needed.
 */
export const WAVES: Wave[] = [
  {
    preDelay: 3,
    groups: [{ kind: "orc", count: 8, gap: 0.8 }],
  },
  {
    preDelay: 4,
    groups: [
      { kind: "orc", count: 6, gap: 0.7 },
      { kind: "goblin", count: 4, gap: 0.5 },
    ],
  },
  {
    preDelay: 5,
    groups: [
      { kind: "orc", count: 8, gap: 0.6 },
      { kind: "skeleton", count: 2, gap: 1.2 },
      { kind: "goblin", count: 6, gap: 0.4 },
      { kind: "wraith", count: 2, gap: 1.5 },
    ],
  },
  {
    preDelay: 6,
    groups: [
      { kind: "goblin", count: 10, gap: 0.35 },
      { kind: "skeleton", count: 3, gap: 1.0 },
      { kind: "wraith", count: 4, gap: 1.0 },
    ],
  },
  {
    preDelay: 6,
    groups: [
      { kind: "orc", count: 12, gap: 0.45 },
      { kind: "skeleton", count: 4, gap: 0.9 },
      { kind: "wraith", count: 4, gap: 0.75 },
      { kind: "goblin", count: 12, gap: 0.3 },
    ],
  },
  {
    preDelay: 8,
    groups: [{ kind: "boss", count: 1, gap: 0 }],
  },
];

/** Total wave count, derived from {@link WAVES}. The HUD wave pips and the
 * victory check both consume this. */
export const TOTAL_WAVES = WAVES.length;
