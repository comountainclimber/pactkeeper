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

/** Gold the player starts with. Scaled by `PactEffects.startingGoldMult`.
 *
 * Held at 100 in the difficulty-bump pass (briefly tried 90 — too tight,
 * killed the wave-1 opener for casual players). 100 still forces a true
 * single-tower opener (arrow OR cannon, not both), which is the design
 * intent the harder-enemies pass landed on.
 *
 * Previous step (150 → 130 → 100) landed alongside the hero-introduction
 * rebalance to account for free hero DPS + knight path-blocking tempo. */
export const STARTING_GOLD = 100;

/** Lives the player starts with. Modified by `PactEffects.startingLivesDelta`
 * (additive), then clamped to >= 1.
 *
 * Held at 14 in the difficulty-bump pass (briefly tried 12 — combined
 * with bumped breach costs it punished the opening too hard). The boss
 * HP bump (+50%) and steeper tower-strike damage from wraith / octopus
 * already do the late-game "stop absorbing leaks" work; the life pool
 * doesn't need to compound that.
 *
 * `glass_cannon`'s -12 delta floors at 2 (14 - 12) so that pact's
 * risk-profile stays intact. */
export const STARTING_LIVES = 14;

export const WRAITH_ATTACK_RANGE = 80; // screen px; wraiths attack towers within this range
/** Per-attack damage. Bumped 15 → 17 in the difficulty-bump pass — a
 * modest lift so a wraith that locks onto an undefended tower actually
 * threatens it over its path traversal, but not so much that any wraith
 * on an exposed flank is auto-loss. (Initial pass tried 20; pulled back
 * to 17 to keep early-game wraith encounters survivable without a
 * dedicated single-target answer already in place.) */
export const WRAITH_ATTACK_DAMAGE = 17;

export const OCTOPUS_ATTACK_RANGE = 90; // screen px; octopus halts and attacks any tower within this range
/** Per-slam damage. Bumped 25 → 28 in the difficulty-bump pass;
 * combined with the 1.5s cooldown a parked octopus dents a T1 cannon
 * meaningfully without one-shotting it, so the splash answer becomes
 * urgent over a few seconds rather than instantly mandatory. */
export const OCTOPUS_ATTACK_DAMAGE = 28;
export const OCTOPUS_ATTACK_COOLDOWN = 1.5; // seconds between slams

// ─── Path ───────────────────────────────────────────────────────────────

import { CURRENT_LEVEL } from "./levels.ts";

/**
 * The enemy path in tile coords. Enemies walk these waypoints in order.
 *
 * Per-level: resolved at module-load time from {@link CURRENT_LEVEL.waypoints}.
 * The active level is chosen from `?level=N` / localStorage `pk-level` /
 * default `1` (see `levels.ts#readLevelId`).
 *
 * Invariants:
 * - First and last entries sit **off-grid** (negative x or x >= GRID_W) so
 *   enemies enter and exit the screen cleanly.
 * - Each segment is axis-aligned. {@link buildPathTiles} walks one axis at a
 *   time; a diagonal segment would skip tiles.
 */
export const PATH: ReadonlyArray<readonly [number, number]> =
  CURRENT_LEVEL.waypoints;

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
 * - `sprite` — key into `SPRITES_16`. Bosses each carry their own 16×16
 *   sprite that {@link drawEnemy} renders at 2× scale (see `isBossKind`).
 * - `radius` — hit-test radius in screen px (already includes `SCALE`).
 * - `flying` — optional. When `true`, only towers with `canHitFlying` (see
 *   `TOWER_DEFS`) can target/damage this enemy. Rendered lifted off the path
 *   with a separate ground shadow. Defaults to `false` if omitted.
 * - `onlySplash` — optional. When `true`, direct projectile hits pass through
 *   this enemy; only splash damage applies. Enforced at three sites: `pickTarget`
 *   (non-splash towers skip this enemy), `stepProjectile` (pass-through for
 *   non-splash projectiles), and the splash loop in `Game.updateProjectiles`
 *   (still hits). Cannons are the intended counter.
 *
 * Bosses (`hollow_warden`, `brood_mother`, `cinder_lich`) form a progressive
 * difficulty ladder, one per realm. The active level's `boss` field (see
 * {@link LevelDef}) picks which one the final wave spawns. Each carries its
 * own sprite, phase-2 acceleration, and breach cost — see
 * {@link BOSS_PHASE2_SPEED_MULT}, {@link BOSS_PHASE2_TINT}, and
 * `Game.handleEnemyEnd`.
 */
/* Difficulty pass (difficulty-bump-30, on top of harder-enemies):
 * trash kinds take a modest +12–16% HP bump over main. Initial pass
 * tried +30% across the board; that punished the early waves too
 * hard, so the trash bumps were pulled back to a level the wave-1
 * opener (single T1 tower, 100 gold) can still chew through. Bosses
 * keep the full +50% HP — the explicit ask of this pass — since the
 * climax is where the difficulty signal needs to land most. Bounty
 * trails HP so per-second gold extraction tightens, but only slightly.
 * Tower / pact / hero stats stay frozen so the curve only moves in
 * one direction. */
export const ENEMY_DEFS = {
  orc: { hp: 56, speed: 1.75, bounty: 9, sprite: "orc", radius: 9 },
  goblin: { hp: 34, speed: 3.2, bounty: 10, sprite: "goblin", radius: 7 },
  skeleton: { hp: 230, speed: 1.0, bounty: 26, sprite: "skeleton", radius: 11 },
  /** Airborne. Fast and fragile; only arrow towers can hit them. Cannons and
   * frost spires can't target bats — their projectiles pass through. Forces
   * the player to keep at least one archer in coverage. Modest +14% bump in
   * the difficulty-bump pass (28 → 32) — a wave-2 archer still kills bats
   * cleanly, but the margin is thinner. */
  bat: { hp: 32, speed: 3.6, bounty: 8, sprite: "bat", radius: 7, flying: true },
  /** Airborne mini-threat. ~12× bat HP, slower than orc, fire-orange glow.
   * Only arrow towers can hit it. A single dragon stress-tests an anti-air
   * line that survived a stray bat group; two-in-a-wave demands sustained
   * coverage, not a token archer. */
  dragon: { hp: 370, speed: 1.2, bounty: 88, sprite: "dragon", radius: 14, flying: true },
  /** Wraith: attacks towers and resists splash damage. Only single-target
   * towers can damage it. Slower but dangerous due to tower-attacking —
   * the harder-enemies pass also bumped its breach cost to 2 lives in
   * `Game.BREACH_LIFE_COST`, and the difficulty-bump pass raised its
   * tower-strike damage from 15 → 17 (see WRAITH_ATTACK_DAMAGE). */
  wraith: { hp: 175, speed: 0.95, bounty: 34, sprite: "ghost", radius: 10 },
  /** Giant siege enemy. Locks onto the first tower in range and slams it
   * until destroyed, then continues. `onlySplash` — direct hits pass
   * through, only splash damage applies, so cannons are the intended
   * counter. Renders at `SCALE * 2` (handled in `drawEnemy`). Fewer per
   * wave than wraiths but each one is a real tempo loss for an undefended
   * cannon line. Slam damage also bumped 25 → 28 — see
   * OCTOPUS_ATTACK_DAMAGE. */
  octopus: { hp: 255, speed: 0.6, bounty: 64, sprite: "octopus", radius: 20 },
  /** Realm 1 boss — slow bark-and-antler treant. The opening tier of the
   * boss ladder: gentlest stats so the first realm stays approachable.
   * +50% HP in the difficulty-bump pass (1500 → 2250); the warden is now
   * a real damage-race rather than something a half-built line absorbs.
   * Phase-2 mult held at main's 1.35 (initial pass tried 1.45; combined
   * with the HP bump it punished partial coverage too hard). */
  hollow_warden: {
    hp: 2250, speed: 0.7, bounty: 220, sprite: "hollowWarden", radius: 18,
  },
  /** Realm 2 boss — bloated swamp matriarch dragging an egg sac. Faster
   * and tougher than the warden; her enraged speed bump bites harder.
   * +50% HP in the difficulty-bump pass (2200 → 3300). */
  brood_mother: {
    hp: 3300, speed: 0.85, bounty: 320, sprite: "broodMother", radius: 20,
  },
  /** Realm 3 boss — robed lich knit together by lava-cracked bone. The
   * campaign apex: highest HP, highest speed, and the steepest enrage.
   * +50% HP in the difficulty-bump pass (3100 → 4650). */
  cinder_lich: {
    hp: 4650, speed: 0.95, bounty: 420, sprite: "cinderLich", radius: 17,
  },
} as const;

export type EnemyKind = keyof typeof ENEMY_DEFS;

/**
 * Per-boss phase-2 acceleration. Triggered the first frame a boss drops
 * below half HP — see {@link updateEnemy}. `Enemy.bossPhase` flips from
 * `1` to `2` and `baseSpeed *= mult`. Tuned so the boss ladder reads as
 * "harder realm = scarier enrage" rather than identical phase transitions.
 *
 * Non-boss kinds are absent — {@link isBossKind} uses key presence to
 * gate the boss-only render path (2× sprite scale + phase-2 tint) and
 * the breach-cost branch in `Game.handleEnemyEnd`.
 */
export const BOSS_PHASE2_SPEED_MULT: Partial<Record<EnemyKind, number>> = {
  hollow_warden: 1.35,
  brood_mother: 1.45,
  cinder_lich: 1.55,
};

/**
 * Per-boss phase-2 haze tint. Painted as a soft halo behind the sprite once
 * `bossPhase === 2`, telegraphing the enrage at a glance. Each boss gets a
 * color tied to its theme so the visual reads alongside the per-realm
 * music/palette.
 */
export const BOSS_PHASE2_TINT: Partial<Record<EnemyKind, string>> = {
  hollow_warden: "#7ad44a", // moss-curse green
  brood_mother: "#d23a8a", // toxic egg-sac pink
  cinder_lich: "#ff6020", // ember orange
};

/** True when `kind` is one of the three boss enemies. Used by `enemy.ts`
 * (2× render scale, phase-2 transition, phase-2 tint) and `game.ts`
 * (per-boss breach cost). Driven off `BOSS_PHASE2_SPEED_MULT` key presence
 * so adding a fourth boss is a one-place edit. */
export function isBossKind(kind: EnemyKind): boolean {
  return kind in BOSS_PHASE2_SPEED_MULT;
}

// ─── Towers ─────────────────────────────────────────────────────────────

/**
 * Tier index for a placed tower. T1 is the base (placed) tier; T2 and T3 are
 * earned via the upgrade popover (see `src/tower-popover.ts`).
 */
export type TowerTier = 1 | 2 | 3;

/**
 * Tower roster. The keys are the {@link TowerKind} type. Each tower carries
 * three tiers — T1 is the base purchase, T2/T3 are unlocked via the click-to-
 * upgrade popover (see `src/tower-popover.ts`). To add a new tower:
 *
 * 1. Add a row here with three `tiers[]`. T1 cost is the placement cost; T2/T3
 *    costs are the *upgrade* cost from the previous tier.
 * 2. Add a `<kind>Tower`, `<kind>TowerT2`, and `<kind>TowerT3` entry to
 *    `SPRITES_16`. The `paletteFor()` helper in `sprites.ts` strips the
 *    `"Tower"` suffix to find the palette (and recognises the `T2`/`T3` tier
 *    suffix for per-tier palettes).
 * 3. Add the new kind to `TOWER_KINDS` in `hud.ts` so the HUD shows a card.
 * 4. Wire up a hotkey in `Game.onKey` if you want one.
 *
 * Field meanings (all values pre-pact; effects are applied at fire-time):
 * - `accent` / `desc` — HUD presentation only. Tier-independent.
 * - `canHitFlying` — kind-level (not per-tier). When `false`, this tower
 *   ignores enemies with `flying: true` (see `ENEMY_DEFS`) entirely:
 *   `pickTarget` skips them and any projectile already in flight passes
 *   through. Currently `true` only for `arrow`. Bake the rule into the kind
 *   so all tiers inherit it; if a future tier should unlock anti-air,
 *   promote this to per-tier. See AGENTS.md "Anti-air & flying enemies".
 * - `tiers[i].cost` — gold to place (T1) or upgrade to this tier (T2/T3).
 *   Multiplied by `PactEffects.towerCostMult` only at placement.
 * - `tiers[i].damage` — per-projectile damage. Multiplied by `towerDamageMult`.
 * - `tiers[i].range` — targeting + render radius in screen px. Multiplied by
 *   `towerRangeMult`.
 * - `tiers[i].fireRate` — seconds between shots (lower = faster).
 * - `tiers[i].projectileSpeed` — screen px per second.
 * - `tiers[i].sprite` — key into `SPRITES_16` (per-tier; visual upgrade cue).
 * - `tiers[i].label` — tier-specific name shown in the popover header.
 * - `tiers[i].splashRadius?` — if set, splash damage = `damage * 0.6` to
 *   enemies within this many px of the impact point.
 * - `tiers[i].slow?` — if set, applied on direct hit. `factor` < 1 slows
 *   speed; never refreshes — `Game.applySlow` extends `slowUntil` to the
 *   latest expiry.
 */
export const TOWER_DEFS = {
  arrow: {
    accent: "#c93a3a",
    desc: "Quick single-target arrows.",
    canHitFlying: true,
    tiers: [
      {
        cost: 60,
        damage: 8,
        range: 110,
        fireRate: 0.6,
        projectileSpeed: 380,
        sprite: "archerTower",
        label: "Archer Roost",
      },
      {
        cost: 95,
        damage: 14,
        range: 140,
        fireRate: 0.52,
        projectileSpeed: 400,
        sprite: "archerTowerT2",
        label: "Marksman Roost",
      },
      // Adapted copy: design calls T3 "fires two arrows per shot". Until
      // multi-projectile-per-fire is wired into `updateTower`, we approximate
      // by bumping single-shot damage hard so DPS lands in the same ballpark
      // as a 2-arrow volley.
      {
        cost: 155,
        damage: 24,
        range: 170,
        fireRate: 0.47,
        projectileSpeed: 420,
        sprite: "archerTowerT3",
        label: "Volley Keep",
      },
    ],
  },
  cannon: {
    accent: "#c98a3a",
    desc: "Heavy splash damage.",
    canHitFlying: false,
    tiers: [
      {
        cost: 110,
        damage: 28,
        range: 95,
        fireRate: 1.4,
        projectileSpeed: 260,
        splashRadius: 36,
        sprite: "cannonTower",
        label: "Bombard",
      },
      {
        cost: 175,
        damage: 46,
        range: 125,
        fireRate: 1.22,
        projectileSpeed: 280,
        splashRadius: 42,
        sprite: "cannonTowerT2",
        label: "Siege Mortar",
      },
      {
        cost: 285,
        damage: 70,
        range: 155,
        fireRate: 1.08,
        projectileSpeed: 300,
        splashRadius: 48,
        sprite: "cannonTowerT3",
        label: "Thunderhead",
      },
    ],
  },
  frost: {
    accent: "#7ad4e8",
    desc: "Chills and slows.",
    canHitFlying: false,
    tiers: [
      {
        cost: 140,
        damage: 4,
        range: 100,
        fireRate: 0.9,
        projectileSpeed: 320,
        slow: { factor: 0.55, duration: 1.6 },
        sprite: "frostTower",
        label: "Frost Spire",
      },
      {
        cost: 225,
        damage: 7,
        range: 130,
        fireRate: 0.78,
        projectileSpeed: 340,
        slow: { factor: 0.45, duration: 2.0 },
        sprite: "frostTowerT2",
        label: "Glacial Spire",
      },
      {
        cost: 365,
        damage: 10,
        range: 160,
        fireRate: 0.7,
        projectileSpeed: 360,
        slow: { factor: 0.35, duration: 2.6 },
        sprite: "frostTowerT3",
        label: "Hoar Sanctum",
      },
    ],
  },
} as const;

export type TowerKind = keyof typeof TOWER_DEFS;

/**
 * Fraction of all coins spent on a tower (placement + upgrades) refunded when
 * the player sells it via the upgrade popover. Lives next to `TOWER_DEFS` so
 * balance lives in one file. Mirror any change in
 * {@link sellRefund} in `src/tower.ts` — same value, different unit.
 */
export const SELL_REFUND_RATIO = 0.6;

/** Fraction of a tower's max HP restored by one heal action. */
export const TOWER_HEAL_AMOUNT_RATIO = 0.4;

/** Gold cost per HP restored by a heal action. */
export const TOWER_HEAL_COST_PER_HP = 1;

/** Floor cost so even small top-ups carry a meaningful tradeoff. */
export const TOWER_HEAL_MIN_COST = 12;

/**
 * Tier-specific stat block for a tower kind. Convenience accessor — equivalent
 * to `TOWER_DEFS[kind].tiers[tier - 1]` but type-narrowed and named so call
 * sites read naturally. Use this everywhere instead of indexing the registry
 * directly.
 */
export function getTowerTier(
  kind: TowerKind,
  tier: TowerTier,
): (typeof TOWER_DEFS)[TowerKind]["tiers"][number] {
  return TOWER_DEFS[kind].tiers[tier - 1];
}
