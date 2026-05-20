import {
  SCALE,
  SELL_REFUND_RATIO,
  TILE,
  TOWER_HEAL_AMOUNT_RATIO,
  TOWER_HEAL_COST_PER_HP,
  TOWER_HEAL_MIN_COST,
  TOWER_DEFS,
  getTowerTier,
  type TowerKind,
  type TowerTier,
} from "./config.ts";
import type { Enemy, Tower, Vec2 } from "./types.ts";
import { distance } from "./enemy.ts";
import { createProjectile } from "./projectile.ts";
import type { Projectile } from "./types.ts";
import { getSprite } from "./sprites.ts";

let nextId = 1;

export function createTower(kind: TowerKind, tile: Vec2): Tower {
  const baseHp = 100;
  return {
    id: nextId++,
    kind,
    pos: { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 },
    tile: { ...tile },
    cooldown: 0,
    tier: 1,
    hp: baseHp,
    maxHp: baseHp,
  };
}

/**
 * Advance a tower to its next tier. No-op if already at the max tier (3).
 * Callers (`Game.upgradeSelectedTower`) are responsible for charging gold and
 * checking affordability before invoking this.
 *
 * Upgrading increases the tower's max HP by 50% and restores HP to full.
 */
export function upgradeTower(tower: Tower): void {
  if (tower.tier >= 3) return;
  tower.tier = (tower.tier + 1) as TowerTier;
  tower.maxHp = Math.round(tower.maxHp * 1.5);
  tower.hp = tower.maxHp;
}

/**
 * Refund value for selling a tower at its current tier. Returns 60% (see
 * {@link SELL_REFUND_RATIO}) of what the player actually paid:
 *
 * - Tier-1 placement was multiplied by `costMult` in `Game.tryPlaceTower`
 *   (see the `towerCostMult` pact), so the tier-1 leg of the refund includes
 *   the same multiplier — otherwise pacts that raise costs would also clip
 *   the refund (e.g. `costMult: 1.4` → 84g paid, only 36g back).
 * - Tier-2 and tier-3 *upgrade* costs are paid at face value (no pact
 *   multiplier applies — see `Game.upgradeSelectedTower`), so they refund at
 *   face value too.
 *
 * Called by both `Game.sellSelectedTower` (for the actual gold delta) and
 * `TowerPopover` (for the displayed value) — using the same function on both
 * sides guarantees the popover label and the resulting balance match.
 */
export function sellRefund(
  kind: TowerKind,
  tier: TowerTier,
  costMult: number,
): number {
  let total = 0;
  for (let t = 1; t <= tier; t++) {
    const raw = getTowerTier(kind, t as TowerTier).cost;
    total += t === 1 ? Math.round(raw * costMult) : raw;
  }
  return Math.floor(total * SELL_REFUND_RATIO);
}

export function rangeOf(
  kind: TowerKind,
  rangeMult: number,
  tier: TowerTier = 1,
): number {
  return getTowerTier(kind, tier).range * rangeMult;
}

export type TowerHealQuote = {
  amount: number;
  cost: number;
};

/**
 * Returns the heal amount and its gold cost for the current tower state.
 * This is shared by UI and gameplay to keep button text and transaction logic
 * in lock-step.
 */
export function healQuote(tower: Tower): TowerHealQuote {
  const missing = Math.max(0, tower.maxHp - tower.hp);
  if (missing <= 0) return { amount: 0, cost: 0 };
  const chunk = Math.max(1, Math.round(tower.maxHp * TOWER_HEAL_AMOUNT_RATIO));
  const amount = Math.min(missing, chunk);
  const cost = Math.max(
    TOWER_HEAL_MIN_COST,
    Math.ceil(amount * TOWER_HEAL_COST_PER_HP),
  );
  return { amount, cost };
}

/** Restores one heal chunk and returns the HP actually restored. */
export function healTower(tower: Tower): number {
  const { amount } = healQuote(tower);
  if (amount <= 0) return 0;
  const nextHp = Math.min(tower.maxHp, tower.hp + amount);
  const healed = nextHp - tower.hp;
  tower.hp = nextHp;
  return healed;
}

function pickTarget(
  tower: Tower,
  enemies: Enemy[],
  rangeMult: number,
): Enemy | null {
  const range = rangeOf(tower.kind, rangeMult, tower.tier);
  let best: Enemy | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (distance(tower.pos, e.pos) > range) continue;
    if (e.waypoint > bestScore) {
      bestScore = e.waypoint;
      best = e;
    }
  }
  return best;
}

export function updateTower(
  tower: Tower,
  dt: number,
  enemies: Enemy[],
  damageMult: number,
  rangeMult: number,
  outProjectiles: Projectile[],
): void {
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const tierDef = getTowerTier(tower.kind, tower.tier);
  const accent = TOWER_DEFS[tower.kind].accent;
  const target = pickTarget(tower, enemies, rangeMult);
  if (!target) return;

  const dx = target.pos.x - tower.pos.x;
  const dy = target.pos.y - tower.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return;
  const dir = { x: dx / dist, y: dy / dist };

  const proj = createProjectile({
    from: tower.pos,
    velDir: dir,
    speed: tierDef.projectileSpeed,
    damage: tierDef.damage * damageMult,
    color: accent,
    targetId: target.id,
    splashRadius: "splashRadius" in tierDef ? tierDef.splashRadius : undefined,
    slow: "slow" in tierDef ? tierDef.slow : undefined,
  });
  outProjectiles.push(proj);
  tower.cooldown = tierDef.fireRate;

  const sfxMap: Record<string, keyof PactkeeperSFXInstance> = {
    arrow: "arrow",
    cannon: "cannonFire",
    frost: "frostFire",
  };
  const sfxName = sfxMap[tower.kind];
  if (sfxName) window.PactkeeperSFX?.[sfxName]();
}

export function drawTower(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  rangeMult: number,
  selected: boolean,
): void {
  const accent = TOWER_DEFS[tower.kind].accent;
  const tierDef = getTowerTier(tower.kind, tower.tier);
  const range = rangeOf(tower.kind, rangeMult, tower.tier);

  if (selected) {
    ctx.save();
    ctx.fillStyle = accent + "18";
    ctx.beginPath();
    ctx.arc(tower.pos.x, tower.pos.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent + "aa";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const sprite = getSprite(tierDef.sprite, SCALE);

  // Shadow under tower
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.ellipse(
    tower.pos.x,
    tower.pos.y + sprite.height / 2 - SCALE,
    sprite.width / 2.6,
    SCALE * 1.5,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Lift sprite slightly for a faux-perspective look (matches design)
  const drawX = Math.round(tower.pos.x - sprite.width / 2);
  const drawY = Math.round(tower.pos.y - sprite.height / 2 - SCALE * 3);
  ctx.drawImage(sprite, drawX, drawY);

  drawTierBadge(ctx, tower, drawY);
  drawHealthBar(ctx, tower, drawY, sprite.width);
}

/** Width/height of one badge dot in screen px. */
const TIER_DOT = SCALE * 2;
/** Gap between adjacent dots in screen px. */
const TIER_DOT_GAP = SCALE;
/** Padding around the dot row inside the dark backing rect. */
const TIER_BADGE_PAD = SCALE;
/** HP bar height in screen px. Shared so badge/HP stack cannot drift apart. */
const TOWER_HP_BAR_H = SCALE * 2;
/** Vertical gap between sprite top and HP bar. */
const TOWER_HP_BAR_OFFSET = SCALE * 2;
/** Vertical gap between HP bar and tier badge. */
const TOWER_STACK_GAP = SCALE;

/**
 * Always-on 3-dot tier indicator above a placed tower. Filled gold for each
 * tier the tower has reached, dim otherwise. A dark backing rect keeps the
 * dots legible against grass / lava / mire. Per the design: tier badges
 * appear above every placed tower (including T1, where two dots are dim).
 */
function drawTierBadge(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  spriteTopY: number,
): void {
  const dotsW = TIER_DOT * 3 + TIER_DOT_GAP * 2;
  const badgeW = dotsW + TIER_BADGE_PAD * 2;
  const badgeH = TIER_DOT + TIER_BADGE_PAD * 2;
  const badgeX = Math.round(tower.pos.x - badgeW / 2);
  const hpTopY = Math.round(spriteTopY - TOWER_HP_BAR_OFFSET - TOWER_HP_BAR_H);
  const badgeY = Math.round(hpTopY - TOWER_STACK_GAP - badgeH);

  // Dark backing for legibility.
  ctx.fillStyle = "rgba(10, 8, 6, 0.85)";
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeStyle = "rgba(58, 40, 24, 0.9)";
  ctx.lineWidth = 1;
  ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);

  // Dots themselves: gold for earned tiers, dim otherwise.
  const dotsY = badgeY + TIER_BADGE_PAD;
  for (let i = 0; i < 3; i++) {
    const dotX = badgeX + TIER_BADGE_PAD + i * (TIER_DOT + TIER_DOT_GAP);
    ctx.fillStyle = i < tower.tier ? "#e8c440" : "#3a2818";
    ctx.fillRect(dotX, dotsY, TIER_DOT, TIER_DOT);
  }
}

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  spriteTopY: number,
  spriteWidth: number,
): void {
  const ratio = Math.max(0, Math.min(1, tower.hp / tower.maxHp));
  const barW = Math.max(22, Math.round(spriteWidth * 0.72));
  const barH = TOWER_HP_BAR_H;
  const barX = Math.round(tower.pos.x - barW / 2);
  const barY = Math.round(spriteTopY - TOWER_HP_BAR_OFFSET - barH);

  ctx.fillStyle = "#1a1010";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = ratio > 0.6 ? "#5acc3a" : ratio > 0.3 ? "#e8c440" : "#e84040";
  ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
}
