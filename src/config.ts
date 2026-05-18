/**
 * Game balance and constants. Tweak freely while iterating on feel — this is
 * the **only** place balance numbers should live (with the per-feature
 * exception of HUD layout constants in `hud.ts`).
 *
 * See `AGENTS.md` for the unit conventions referenced below.
 */

// ─── Coordinates & rendering ───────────────────────────────────────────

/** Screen pixels per logical sprite pixel. Effective pixel-art zoom. */
export const SCALE = 2;

/** Logical pixels per tile. Sprites are 16×16 logical px. */
export const TILE_PX = 16;

/** Screen pixels per tile. Use this to convert tile coords → screen px:
 * `tx * TILE` is the left edge, `tx * TILE + TILE / 2` is the center. */
export const TILE = TILE_PX * SCALE;

/** Build-grid width in tiles. */
export const GRID_W = 22;

/** Build-grid height in tiles. */
export const GRID_H = 14;

/** Right-side HUD width in screen px. Steals from `CANVAS_W` — clicks on the
 * play field must check `mx < TILE * GRID_W`. */
export const HUD_W = 240;

/** Total canvas width = play area + HUD. */
export const CANVAS_W = GRID_W * TILE + HUD_W;

/** Total canvas height = play area only (HUD spans full height). */
export const CANVAS_H = GRID_H * TILE;

/** Left edge of the HUD panel in screen px. */
export const HUD_X = GRID_W * TILE;

// ─── Run economy ────────────────────────────────────────────────────────

/** Gold the player starts with. Scaled by `PactEffects.startingGoldMult`. */
export const STARTING_GOLD = 150;

/** Lives the player starts with. Modified by `PactEffects.startingLivesDelta`
 * (additive), then clamped to >= 1. */
export const STARTING_LIVES = 20;

// ─── Path ───────────────────────────────────────────────────────────────

/**
 * The fixed enemy path in tile coords. Enemies walk these waypoints in order.
 *
 * Invariants:
 * - First and last entries sit **off-grid** (negative x or x >= GRID_W) so
 *   enemies enter and exit the screen cleanly.
 * - Each segment is axis-aligned. {@link buildPathTiles} walks one axis at a
 *   time; a diagonal segment would skip tiles.
 *
 * To redraw the path, edit this list and the map canvas + `PATH_TILES` will
 * regenerate on next module load.
 */
export const PATH: ReadonlyArray<readonly [number, number]> = [
  [-1, 3],
  [4, 3],
  [4, 7],
  [9, 7],
  [9, 4],
  [14, 4],
  [14, 10],
  [22, 10],
];

// ─── Enemies ────────────────────────────────────────────────────────────

/**
 * Enemy roster. The keys are the {@link EnemyKind} type. To add a new enemy:
 *
 * 1. Add a row here with `hp / speed / bounty / sprite / radius`.
 * 2. Add a 16×16 entry in `SPRITES_16` (or reuse an existing `sprite` name).
 * 3. Tune `Game.handleEnemyEnd` if the enemy should cost more than 1 life on
 *    breach (currently: boss = 10, skeleton = 3, others = 1).
 * 4. Reference it from a wave in `WAVES`.
 *
 * Field meanings:
 * - `hp` — base HP at spawn. Multiplied by `PactEffects.enemyHpMult`.
 * - `speed` — **tiles per second**. Multiplied by `enemySpeedMult` then by
 *   `TILE` inside `updateEnemy` to get screen px / sec.
 * - `bounty` — gold awarded on kill. Multiplied by `enemyBountyMult`.
 * - `sprite` — key into `SPRITES_16`. Bosses currently reuse `"orc"` at 2× scale.
 * - `radius` — hit-test radius in screen px (already includes `SCALE`).
 */
export const ENEMY_DEFS = {
  orc: { hp: 30, speed: 1.6, bounty: 6, sprite: "orc", radius: 9 },
  goblin: { hp: 18, speed: 3.2, bounty: 8, sprite: "goblin", radius: 7 },
  skeleton: { hp: 120, speed: 0.9, bounty: 18, sprite: "skeleton", radius: 11 },
  /** Boss reuses the orc sprite at 2× until a custom sprite ships. Renders
   * with a phase-2 purple/red haze when below half HP (see `drawEnemy`). */
  boss: { hp: 1400, speed: 0.7, bounty: 200, sprite: "orc", radius: 18 },
} as const;

export type EnemyKind = keyof typeof ENEMY_DEFS;

// ─── Towers ─────────────────────────────────────────────────────────────

/**
 * Tower roster. The keys are the {@link TowerKind} type. To add a new tower:
 *
 * 1. Add a row here.
 * 2. Add a `<kind>Tower` entry to `SPRITES_16`. The `paletteFor()` helper in
 *    `sprites.ts` strips the `"Tower"` suffix to find the palette.
 * 3. Add the new kind to `TOWER_KINDS` in `hud.ts` so the HUD shows a card.
 * 4. Wire up a hotkey in `Game.onKey` if you want one.
 *
 * Field meanings (all values pre-pact; effects are applied at fire-time):
 * - `cost` — gold to place. Multiplied by `PactEffects.towerCostMult`.
 * - `damage` — per-projectile damage. Multiplied by `towerDamageMult`.
 * - `range` — targeting + render radius in screen px. Multiplied by
 *   `towerRangeMult`.
 * - `fireRate` — seconds between shots (lower = faster).
 * - `projectileSpeed` — screen px per second.
 * - `splashRadius?` — if set, splash damage = `damage * 0.6` to enemies within
 *   this many px of the impact point.
 * - `slow?` — if set, applied on direct hit. `factor` < 1 slows speed; never
 *   refreshes — `Game.applySlow` extends `slowUntil` to the latest expiry.
 * - `accent` / `label` / `desc` — HUD presentation only.
 */
export const TOWER_DEFS = {
  arrow: {
    cost: 60,
    damage: 8,
    range: 110,
    fireRate: 0.6,
    projectileSpeed: 380,
    sprite: "archerTower",
    accent: "#c93a3a",
    label: "Archer Roost",
    desc: "Quick single-target arrows. Cheap.",
  },
  cannon: {
    cost: 110,
    damage: 28,
    range: 95,
    fireRate: 1.4,
    projectileSpeed: 260,
    splashRadius: 36,
    sprite: "cannonTower",
    accent: "#c98a3a",
    label: "Bombard",
    desc: "Heavy splash damage. Slow.",
  },
  frost: {
    cost: 140,
    damage: 4,
    range: 100,
    fireRate: 0.9,
    projectileSpeed: 320,
    slow: { factor: 0.55, duration: 1.6 },
    sprite: "frostTower",
    accent: "#7ad4e8",
    label: "Frost Spire",
    desc: "Chills enemies, slowing them.",
  },
} as const;

export type TowerKind = keyof typeof TOWER_DEFS;
