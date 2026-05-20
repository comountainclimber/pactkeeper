/**
 * Hero roster and simulation primitives.
 *
 * A "hero" is the player-controlled champion — WASD-moved on the play field,
 * auto-attacking like a tower, mortal in melee, blocking enemies when standing
 * on a path tile. One hero is chosen per run on the pact screen
 * (see `src/pact-screen.ts`) and persists across realms via URL + localStorage.
 *
 * Three kinds ship with v1:
 *
 * | Kind     | Role       | HP  | DMG | Range | Rate | Move t/s | Notes                                          |
 * | -------- | ---------- | --- | --- | ----- | ---- | -------- | ---------------------------------------------- |
 * | knight   | tank/melee | 200 | 30  | 26 px | 0.7s | 3.5      | Plate-armored; can soak hits in chokepoints    |
 * | archer   | ranged DPS | 90  | 12  | 110px | 0.5s | 4.5      | Can hit flying (mirrors arrow tower)           |
 * | frost_magus | CC/slow | 70  | 6   | 95 px | 1.0s | 3.0      | Each attack chills (factor 0.4, duration 2.0s) |
 *
 * Adding a new hero: see `docs/recipes.md#add-a-new-hero`.
 *
 * Effects flow: v1 heroes are NOT scaled by `PactEffects.towerDamageMult`.
 * Pacts modify towers + enemies; heroes are a separate balance lever. The
 * `updateHero` signature could grow a `damageMult` parameter in a future
 * iteration without breaking call sites.
 */

import {
  GRID_H,
  GRID_W,
  SCALE,
  TILE,
  TILE_PX,
} from "./config.ts";
import { distance } from "./enemy.ts";
import { createProjectile } from "./projectile.ts";
import { getSprite } from "./sprites.ts";
import type { Enemy, Hero, Projectile, Vec2 } from "./types.ts";

/**
 * Seconds the hero stays dead before respawning at `PATH[0]`. Tuned so the
 * loss feels meaningful but doesn't cost the player a level — see the
 * mechanics summary in the plan.
 */
export const HERO_RESPAWN_SEC = 10;

/**
 * Minimum seconds between hits the hero takes from an adjacent enemy.
 * Without this, melee enemies would drain the hero's HP every frame; this
 * cadence (~0.8s) matches how a real swing animation would feel.
 */
export const HERO_DAMAGE_INTERVAL = 0.8;

/**
 * Damage per contact tick. All enemy kinds deal the same amount today —
 * the pressure comes from how many can stack on the hero at once, not from
 * per-kind variance. Promote to per-kind on `ENEMY_DEFS` if a future enemy
 * needs to chunk the hero (e.g. a heavy hitter).
 */
export const HERO_CONTACT_DAMAGE = 6;

/** Attack flavor — drives how `updateHero` resolves a fire opportunity. */
export type HeroAttackKind = "melee" | "ranged" | "ranged-slow";

/**
 * Hero roster. Keys are the {@link HeroKind} type. Add a new hero by
 * appending a row here and following `docs/recipes.md#add-a-new-hero`.
 *
 * Field meanings:
 * - `displayName` — player-facing name in the picker, HUD, etc.
 * - `tagline` — short flavor line under the name on the picker card.
 * - `accent` — primary tint (picker card border, HUD chip).
 * - `hi` — highlight tint (used by CSS gradients on the picker).
 * - `glow` — softer tint for ambient glow auras.
 * - `sprite` — key into `SPRITES_16` (e.g. `"knightHero"`).
 * - `hp` — base HP at spawn/respawn.
 * - `damage` — per-attack damage. Melee deals it to one target on contact;
 *   ranged deals it via a {@link Projectile}.
 * - `range` — attack reach in screen px (≈ tile px = 32).
 * - `attackRate` — seconds between attacks (lower = faster).
 * - `moveSpeed` — tiles/sec; multiplied by `TILE` to get screen px/sec.
 * - `contactRange` — how close an enemy must be to damage the hero per
 *   `HERO_DAMAGE_INTERVAL`.
 * - `attackKind` — see {@link HeroAttackKind}.
 * - `projectileSpeed` — only for ranged variants (px/sec).
 * - `slow` — only for `"ranged-slow"`; mirrors tower `slow` semantics.
 * - `canHitFlying` — copied onto the projectile / melee swing so the
 *   targeting logic matches `TOWER_DEFS`.
 * - `attackSfx` — name of a method on `window.PactkeeperSFX` to invoke on
 *   each successful attack. Match the names declared in `globals.d.ts`.
 */
export const HEROES = {
  knight: {
    displayName: "Knight",
    tagline: "A bulwark with steel and oath.",
    accent: "#c0c8d8",
    hi: "#ffffff",
    glow: "#7a90c0",
    sprite: "knightHero",
    hp: 200,
    damage: 30,
    range: 26,
    attackRate: 0.7,
    moveSpeed: 3.5,
    contactRange: 22,
    attackKind: "melee" as HeroAttackKind,
    projectileSpeed: 0,
    canHitFlying: false,
    attackSfx: "knightAttack" as const,
  },
  archer: {
    displayName: "Archer",
    tagline: "Eyes keen, arrows keener.",
    accent: "#7aaa54",
    hi: "#b0e070",
    glow: "#5a8a3a",
    sprite: "archerHero",
    hp: 90,
    damage: 12,
    range: 110,
    attackRate: 0.5,
    moveSpeed: 4.5,
    contactRange: 18,
    attackKind: "ranged" as HeroAttackKind,
    projectileSpeed: 420,
    canHitFlying: true,
    attackSfx: "archerShoot" as const,
  },
  frost_magus: {
    displayName: "Frost Magus",
    tagline: "Whispers winter into bones.",
    accent: "#7ad4e8",
    hi: "#c8f0fa",
    glow: "#4a90b0",
    sprite: "mageHero",
    hp: 70,
    damage: 6,
    range: 95,
    attackRate: 1.0,
    moveSpeed: 3.0,
    contactRange: 18,
    attackKind: "ranged-slow" as HeroAttackKind,
    projectileSpeed: 340,
    canHitFlying: false,
    slow: { factor: 0.4, duration: 2.0 },
    attackSfx: "mageFreeze" as const,
  },
} as const;

export type HeroKind = keyof typeof HEROES;

/** Display order for the pact-screen picker. Source of truth. */
export const HERO_KINDS: HeroKind[] = ["knight", "archer", "frost_magus"];

/** True when `s` is a valid {@link HeroKind} string. Useful for parsing
 * URL params / localStorage where `string | null` is what we get. */
export function isHeroKind(s: string | null | undefined): s is HeroKind {
  return s != null && (HERO_KINDS as string[]).includes(s);
}

let nextId = 1;

/**
 * Build a fresh hero of the given kind, positioned at `pos`. `Game` calls
 * this when starting a level, and again at every respawn (HP is reset to the
 * kind's base each time). All per-instance runtime state starts cleared.
 */
export function createHero(kind: HeroKind, pos: Vec2): Hero {
  const def = HEROES[kind];
  return {
    id: nextId++,
    kind,
    pos: { x: pos.x, y: pos.y },
    hp: def.hp,
    maxHp: def.hp,
    cooldown: 0,
    lastHitAt: 0,
    alive: true,
    respawnAt: 0,
  };
}

/**
 * Reset an existing hero back to full HP and reposition them at `pos`.
 * Used for the post-death respawn so the hero's `id` stays stable across
 * the run (useful for any future projectile/tracking that referenced it).
 */
export function respawnHero(hero: Hero, pos: Vec2): void {
  const def = HEROES[hero.kind];
  hero.pos.x = pos.x;
  hero.pos.y = pos.y;
  hero.hp = def.hp;
  hero.maxHp = def.hp;
  hero.cooldown = 0;
  hero.lastHitAt = 0;
  hero.alive = true;
  hero.respawnAt = 0;
}

/**
 * Half-extent (in screen px) the hero must keep away from the play-field
 * edges so the whole sprite stays on-screen. Half a tile is the radius the
 * sprite is drawn at.
 */
const PLAY_PAD = TILE / 2;
const PLAY_MIN_X = PLAY_PAD;
const PLAY_MIN_Y = PLAY_PAD;
const PLAY_MAX_X = GRID_W * TILE - PLAY_PAD;
const PLAY_MAX_Y = GRID_H * TILE - PLAY_PAD;

/**
 * Apply an input velocity vector (in tiles/sec, unnormalized) to the hero
 * for `dt` seconds. The vector is normalized inside so diagonal movement
 * isn't √2 faster than cardinal. No-op while dead.
 *
 * Effects flow: this primitive is intentionally global-free — `Game` reads
 * its held keys, builds `inputX`/`inputY`, and hands them off here.
 */
export function moveHero(
  hero: Hero,
  inputX: number,
  inputY: number,
  dt: number,
): void {
  if (!hero.alive) return;
  const def = HEROES[hero.kind];
  const len = Math.hypot(inputX, inputY);
  if (len === 0) return;
  const nx = inputX / len;
  const ny = inputY / len;
  const step = def.moveSpeed * TILE * dt;
  hero.pos.x = Math.min(PLAY_MAX_X, Math.max(PLAY_MIN_X, hero.pos.x + nx * step));
  hero.pos.y = Math.min(PLAY_MAX_Y, Math.max(PLAY_MIN_Y, hero.pos.y + ny * step));
}

/** Hero tile coords (current grid cell the sprite center sits in). */
export function heroTile(hero: Hero): Vec2 {
  return {
    x: Math.floor(hero.pos.x / TILE),
    y: Math.floor(hero.pos.y / TILE),
  };
}

/**
 * Target acquisition — closest in-range enemy with the highest waypoint
 * (mirrors `pickTarget` in `tower.ts` so the hero's choice feels consistent
 * with the towers'). Respects `canHitFlying` per the kind def.
 */
export function pickHeroTarget(hero: Hero, enemies: Enemy[]): Enemy | null {
  const def = HEROES[hero.kind];
  let best: Enemy | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.flying && !def.canHitFlying) continue;
    if (distance(hero.pos, e.pos) > def.range) continue;
    if (e.waypoint > bestScore) {
      bestScore = e.waypoint;
      best = e;
    }
  }
  return best;
}

/**
 * Tick the hero one frame: count down the attack cooldown, pick a target,
 * resolve the attack (melee returns the target so the caller can damage it;
 * ranged pushes a projectile into `outProjectiles`). Plays the kind's SFX
 * exactly when an attack fires.
 *
 * Returns the enemy that should take an immediate melee hit this frame, or
 * `null` for ranged attacks / no attack. Letting `Game` apply the damage
 * keeps the gold/score book-keeping in one place (see `Game.damageEnemy`).
 */
export function updateHero(
  hero: Hero,
  dt: number,
  enemies: Enemy[],
  outProjectiles: Projectile[],
): Enemy | null {
  if (!hero.alive) return null;
  hero.cooldown -= dt;
  if (hero.cooldown > 0) return null;

  const target = pickHeroTarget(hero, enemies);
  if (!target) return null;

  const def = HEROES[hero.kind];
  hero.cooldown = def.attackRate;

  // Fire the SFX exactly when an attack lands so the audio stays tight
  // against the visual feedback.
  const sfx = window.PactkeeperSFX;
  if (sfx) sfx[def.attackSfx]();

  if (def.attackKind === "melee") {
    return target;
  }

  const dx = target.pos.x - hero.pos.x;
  const dy = target.pos.y - hero.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null;
  const proj = createProjectile({
    from: hero.pos,
    velDir: { x: dx / dist, y: dy / dist },
    speed: def.projectileSpeed,
    damage: def.damage,
    color: def.accent,
    targetId: target.id,
    slow: def.attackKind === "ranged-slow" && "slow" in def ? def.slow : undefined,
    canHitFlying: def.canHitFlying,
  });
  outProjectiles.push(proj);
  return null;
}

/**
 * Try to inflict the periodic contact-damage tick. Returns the damage that
 * should be applied this frame, or `0` if the hero is in cooldown / no
 * enemy is in range / hero is dead. The caller is responsible for actually
 * subtracting from `hero.hp` and re-checking the death condition.
 */
export function heroContactDamage(
  hero: Hero,
  enemies: Enemy[],
  nowSec: number,
): number {
  if (!hero.alive) return 0;
  if (nowSec - hero.lastHitAt < HERO_DAMAGE_INTERVAL) return 0;
  const def = HEROES[hero.kind];
  for (const e of enemies) {
    if (!e.alive) continue;
    if (distance(hero.pos, e.pos) <= def.contactRange + e.radius) {
      hero.lastHitAt = nowSec;
      return HERO_CONTACT_DAMAGE;
    }
  }
  return 0;
}

/**
 * Render the hero sprite with a slight bob (matches enemies), an HP bar
 * when damaged, and an accent-tinted ground shadow. No-op when dead — the
 * respawn marker is drawn separately by `drawHeroRespawnMarker`.
 */
export function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  nowSec: number,
): void {
  if (!hero.alive) return;
  const def = HEROES[hero.kind];
  const sprite = getSprite(def.sprite, SCALE);

  const bobOffset = Math.sin((nowSec + hero.id * 0.31) * 5) * SCALE * 0.5;
  const drawX = Math.round(hero.pos.x - sprite.width / 2);
  const drawY = Math.round(hero.pos.y - sprite.height / 2 + bobOffset);

  // Soft accent-tinted ground shadow so the hero reads as the player char.
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.ellipse(
    hero.pos.x,
    hero.pos.y + sprite.height / 2 - SCALE * 2,
    sprite.width / 2.6,
    SCALE * 1.5,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // Subtle accent-color aura under the sprite — telegraphs which hero this
  // is at a glance and keeps the player character distinct from enemies.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = def.glow;
  ctx.beginPath();
  ctx.arc(hero.pos.x, hero.pos.y, sprite.width / 2 + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(sprite, drawX, drawY);

  // HP bar — shown when damaged, mirrors the enemy bar style for visual
  // consistency. Uses the same color-coded thresholds.
  if (hero.hp < hero.maxHp) {
    const ratio = Math.max(0, hero.hp / hero.maxHp);
    const barW = Math.max(20, TILE_PX * SCALE * 0.8);
    const barH = SCALE * 2;
    const barX = hero.pos.x - barW / 2;
    const barY = hero.pos.y - sprite.height / 2 - SCALE * 3;
    ctx.fillStyle = "#1a1010";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = ratio > 0.5 ? "#5acc3a" : ratio > 0.25 ? "#e8c440" : "#e83a3a";
    ctx.fillRect(barX, barY, barW * ratio, barH);
  }
}

/**
 * Render a dim ghost-marker at the hero's pending respawn position with a
 * countdown number. Called every frame while `!hero.alive`. The marker is
 * intentionally muted so it doesn't compete with the live enemies.
 */
export function drawHeroRespawnMarker(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  spawnPos: Vec2,
  nowSec: number,
): void {
  if (hero.alive) return;
  const def = HEROES[hero.kind];
  const sprite = getSprite(def.sprite, SCALE);
  const secsLeft = Math.max(0, Math.ceil(hero.respawnAt - nowSec));

  // Pulsing ring so the player notices the marker on the spawn tile.
  const pulse = 0.4 + Math.sin(nowSec * 4) * 0.15;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(spawnPos.x, spawnPos.y, sprite.width / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Ghosted sprite.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.drawImage(
    sprite,
    Math.round(spawnPos.x - sprite.width / 2),
    Math.round(spawnPos.y - sprite.height / 2),
  );
  ctx.restore();

  // Countdown number above the marker.
  ctx.save();
  ctx.fillStyle = def.accent;
  ctx.font = "bold 12px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${secsLeft}s`, spawnPos.x, spawnPos.y - sprite.height / 2 - 2);
  ctx.restore();
}
