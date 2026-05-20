/**
 * Shared types for the simulation and UI layers.
 *
 * This file is the schema of the game — every other module imports from here.
 * Keep it readable and free of behavior.
 *
 * See {@link ../AGENTS.md} for architecture and unit conventions.
 */
import type { EnemyKind, TowerKind, TowerTier } from "./config.ts";
import type { HeroKind } from "./heroes.ts";
import type { SigilId } from "./sigils.ts";

/**
 * Pact category. Drives the colored dot + label on each pact card; does not
 * affect mechanics.
 *
 * - `TRIAL`: harder enemies in exchange for some compensating buff
 * - `WAGER`: high-risk, high-reward
 * - `BOON`: largely positive (still has a downside per design)
 * - `CURSE`: largely negative (with a substantial upside)
 */
export type PactSchool = "TRIAL" | "WAGER" | "BOON" | "CURSE";

/** 2D vector. Used for both tile coords and screen-pixel positions — context
 * disambiguates. Tower keeps both: `tile` is in tiles, `pos` is in screen px. */
export type Vec2 = { x: number; y: number };

/**
 * A live enemy. Created by {@link spawnEnemy}, walked by {@link updateEnemy},
 * culled by {@link Game.handleEnemyEnd}.
 *
 * Lifetime: pushed into `Game.enemies` on spawn, set `alive = false` on death
 * or when reaching the path end, then filtered out next frame.
 */
export type Enemy = {
  /** Monotonically increasing per-process id. Used by projectiles for tracking. */
  id: number;
  kind: EnemyKind;
  /** Screen-pixel position (center of sprite). */
  pos: Vec2;
  hp: number;
  maxHp: number;
  /** Effective speed in tiles/sec at the current state. Recomputed per frame
   * from `baseSpeed * slowFactor`. */
  speed: number;
  /** Speed before slow effects. Already includes the pact `enemySpeedMult` and
   * boss-phase-2 acceleration. */
  baseSpeed: number;
  /** Gold awarded on kill (not on reaching the end). */
  bounty: number;
  /** Hit-test radius in screen px. Projectile collision uses `radius + 4`. */
  radius: number;
  /** Legacy color used by an HP-bar fallback that no longer fires. Safe to remove. */
  color: string;
  /** Index into `PATH` of the next waypoint to walk toward. */
  waypoint: number;
  /** Game time (sec, see {@link Game.nowSec}) at which slow expires. */
  slowUntil: number;
  /** Speed multiplier while slowed. `1` = no slow, `0.55` = 55% speed. Reset
   * to 1 in `updateEnemy` when `slowUntil` is reached. */
  slowFactor: number;
  alive: boolean;
  /** Set when the enemy walked off the end of `PATH`. Consumed (and cleared)
   * by `Game.handleEnemyEnd`, which decrements `lives`. */
  reachedEnd: boolean;
  /** Boss-only. Phase 2 triggers below half HP and grants +40% base speed. */
  bossPhase?: 1 | 2;
  /** Airborne enemies. Towers without `canHitFlying` (see `TOWER_DEFS`) can
   * neither target nor damage them — their projectiles pass straight through.
   * Renders lifted with a separate ground shadow so the player can read it.
   * See AGENTS.md "Anti-air & flying enemies". */
  flying?: boolean;
  /** If true, splash damage does not affect this enemy (only direct hits). */
  splashResistant?: boolean;
  /** If true, this enemy attacks towers it encounters as it walks. */
  attacksTowers?: boolean;
  /** Cooldown (in seconds) until next tower attack. Used by wraith enemies. */
  towerAttackCooldown?: number;
  /** End timestamp (sec) for a brief wraith attack telegraph animation. */
  wraithAttackAnimUntil?: number;
  /** Siege-attacker: halts at the first in-range tower and stays until
   * the tower is destroyed (rather than walking past while attacking
   * like wraiths). Used by `octopus`. */
  siegeAttacker?: boolean;
  /** While siege-locked, the id of the tower this enemy is sieging.
   * Set/cleared by `Game.updateEnemySiegeLocks` each frame. While set,
   * `updateEnemy` halts movement. */
  lockedTowerId?: number;
  /** End timestamp (sec) for a brief octopus tentacle-slam telegraph
   * animation (analogue of `wraithAttackAnimUntil`). */
  octopusAttackAnimUntil?: number;
  /** If true, direct projectile hits pass through this enemy entirely
   * — only splash damage applies. Enforced at three sites (mirrors
   * `flying` + `splashResistant`): `pickTarget` (skip for non-splash
   * towers), `stepProjectile` (pass-through), and the splash loop in
   * `Game.updateProjectiles` (still hits). */
  onlySplash?: boolean;
};

/**
 * A placed tower. Stationary; fires at the enemy with the highest `waypoint`
 * within range.
 */
export type Tower = {
  id: number;
  kind: TowerKind;
  /** Screen-pixel center. Always equal to `tile * TILE + TILE / 2`. */
  pos: Vec2;
  /** Tile coords on the build grid. */
  tile: Vec2;
  /** Seconds until next shot. Counts down in `updateTower`; reset to
   * `def.fireRate` after firing. */
  cooldown: number;
  /** Upgrade tier. New towers start at `1`; the click-to-upgrade popover (see
   * `src/tower-popover.ts`) advances through `2` and `3`. Per-tier stats live
   * on {@link TowerKind}'s entry in `TOWER_DEFS`. */
  tier: TowerTier;
  /** Current HP. When hp <= 0, the tower is destroyed. */
  hp: number;
  /** Maximum HP; reset when tower upgrades (gains +50% max HP per tier). */
  maxHp: number;
};

/**
 * The player-controlled hero. There is at most one hero per run, chosen on
 * the pact screen and persisted across realms. The hero is mortal: enemies
 * within `contactRange` damage it on a fixed cadence, and on death it is
 * removed from the field for {@link HERO_RESPAWN_SEC} seconds, then
 * respawned at `PATH[0]` at full HP. Death does NOT cost the player a life.
 *
 * Lifetime: created by `Game.beginLevelWithPacts` when a hero kind is
 * chosen; toggled `alive: false` on death and back to `true` when the
 * respawn timer elapses. Never removed from `Game.hero` until the level
 * ends — that way the HP / portrait / respawn countdown can keep rendering.
 *
 * Stats (HP, damage, range, etc.) live on the {@link HeroKind}'s entry in
 * `HEROES` (`src/heroes.ts`). Only per-instance runtime state lives here.
 */
export type Hero = {
  id: number;
  kind: HeroKind;
  /** Screen-pixel position (sprite center). Updated each frame from the
   * held WASD keys; clamped to the play field by `Game.updateHero`. */
  pos: Vec2;
  hp: number;
  maxHp: number;
  /** Seconds until the next auto-attack can fire. Counts down in
   * `updateHero`; reset to the kind's `attackRate` after firing. */
  cooldown: number;
  /** Game time (sec) of the most recent contact-damage tick from any
   * adjacent enemy. Used to throttle melee damage to the hero so it
   * doesn't drain HP per frame. See {@link HERO_DAMAGE_INTERVAL}. */
  lastHitAt: number;
  /** False while dead (between death and `respawnAt`). Movement, attacks,
   * and contact damage are all gated on this flag. */
  alive: boolean;
  /** Game time (sec) at which the hero respawns. `0` while alive. */
  respawnAt: number;
};

/**
 * A live projectile. Created by `createProjectile` from a firing tower,
 * stepped each frame, collides with enemies via {@link Enemy.id} (so target
 * death doesn't lose the round — projectile re-acquires).
 */
export type Projectile = {
  id: number;
  pos: Vec2;
  /** Velocity in screen px / sec (unit dir × tower's `projectileSpeed`). */
  vel: Vec2;
  /** Id of the originally-aimed enemy. If gone, `stepProjectile` falls back
   * to any enemy within a small radius. */
  targetId: number;
  /** Damage already includes pact `towerDamageMult`. */
  damage: number;
  /** If set, splash damage equals `damage * 0.6` to all enemies within this
   * radius of the impact point. */
  splashRadius?: number;
  /** If set, applies on direct hit. `factor` < 1 slows; longer durations
   * don't refresh — `Game.applySlow` extends `slowUntil`. */
  slow?: { factor: number; duration: number };
  /** Whether this projectile can hit flying enemies. Copied from the firing
   * tower's `canHitFlying` at fire time. When `false`, `stepProjectile` and
   * the splash loop in `Game.updateProjectiles` skip flying targets — the
   * projectile flies through them as if they weren't there. */
  canHitFlying: boolean;
  color: string;
  /** Safety cap in seconds; projectile is also culled when it leaves the
   * canvas. Set to `0` after a hit so it dies that frame. */
  ttl: number;
};

/**
 * Game screen state.
 *
 * NOTE: `"pact"` is currently unreachable — pact selection is owned by the
 * DOM `PactScreen` (see `src/pact-screen.ts`). The literal is kept until the
 * dead canvas pact picker in `screens.ts` is removed. See "Known anomalies" in
 * `AGENTS.md`.
 */
export type GameScreen = "pact" | "playing" | "victory" | "defeat";

/**
 * A modifier applied before a level. Up to {@link MAX_PACTS} (3) are sealed
 * via the DOM pact screen; effects stack multiplicatively (or additively for
 * `startingLivesDelta`) inside {@link applyPacts}.
 *
 * The visual fields drive the UI; only `apply` changes simulation behavior.
 */
export type Pact = {
  /** Stable identifier — used by save state, hot-reload, and the DOM screen. */
  id: string;
  name: string;
  /** Italicized flavor text under the name. */
  tagline: string;
  school: PactSchool;
  sigil: SigilId;
  /** Primary tint for the card and the in-game telegraph. */
  accent: string;
  /** Highlight tint (lighter than `accent`). */
  hi: string;
  /** Glow / inner-light tint (lightest). */
  glow: string;
  /** Player-facing one-line description of the cost. */
  downside: string;
  /** Player-facing one-line description of the benefit. */
  upside: string;
  /**
   * Difficulty cost, in score points. Higher = harder pact.
   *
   * Used by the scoring system to compute the run multiplier:
   * `multiplier = 1 + sum(xp) / 1000`. So sealing three 200-XP pacts produces
   * a `×1.60` multiplier on the run's final score. See `src/score.ts`.
   */
  xp: number;
  /** Mutates the in-progress {@link PactEffects}. Compose-friendly: each pact
   * multiplies onto whatever is already there. */
  apply: (m: PactEffects) => void;
};

/**
 * Aggregate effects after all chosen pacts are applied. All multipliers
 * default to `1` (no-op); deltas default to `0`.
 *
 * Consumed at:
 * - {@link Game.beginLevelWithPacts} for `startingGoldMult` / `startingLivesDelta`
 * - {@link spawnEnemy} for the enemy multipliers
 * - {@link Game.updateWaveSpawning} for `waveSizeMult`
 * - {@link updateTower} / {@link rangeOf} for tower multipliers
 * - {@link Game.tryPlaceTower} for `towerCostMult`
 */
export type PactEffects = {
  /** Multiplier on enemy HP at spawn. */
  enemyHpMult: number;
  /** Multiplier on enemy `baseSpeed` at spawn. */
  enemySpeedMult: number;
  /** Multiplier on enemy bounty at spawn. */
  enemyBountyMult: number;
  /** Multiplier on tower projectile damage at fire time. */
  towerDamageMult: number;
  /** Multiplier on tower range. Applied at fire-time targeting AND at
   * placement preview, so the build hint matches the actual range. */
  towerRangeMult: number;
  /** Multiplier on tower placement cost. Applied via {@link Math.round}. */
  towerCostMult: number;
  /** Multiplier on `STARTING_GOLD` at level start. */
  startingGoldMult: number;
  /** Additive delta on `STARTING_LIVES` at level start. Lives clamp to >= 1. */
  startingLivesDelta: number;
  /** Multiplier on each wave-group's `count`. Result is `Math.round`ed and
   * clamped to >= 1. */
  waveSizeMult: number;
};
