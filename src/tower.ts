import {
  PATH,
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

/**
 * Lead-targeting: solve for the intercept point assuming `target` keeps
 * walking toward its current waypoint at its current effective speed
 * (`target.speed` already reflects slow-on-hit factors — see `updateEnemy`).
 *
 * The equation is the classic moving-target quadratic:
 *
 *   |E + V*t - T|  =  projectileSpeed * t
 *
 * which expands to `a*t^2 + b*t + c = 0` with
 *
 *   a = |V|^2 - S^2
 *   b = 2 * (D · V)
 *   c = |D|^2
 *
 * where `D = E - T`, `V = enemy velocity`, `S = projectile speed`. The
 * smallest positive real root is the time-to-intercept; from there we
 * compute the aim direction. If no real positive root exists (enemy is
 * outrunning the projectile, or the geometry is degenerate), we fall back
 * to aiming at the enemy's current position so the tower still fires.
 *
 * This addresses the "tower shot lands behind a fast goblin" problem: at
 * 380 px/s arrow vs. a 102 px/s goblin at 4-tile range, the un-led shot
 * lands ~35 px behind the target while the hit window is 11 px — a
 * guaranteed miss. With lead, the projectile and enemy meet at the same
 * point, and the existing hit-radius window in `stepProjectile` lands the
 * shot.
 *
 * Caveats:
 * - The lead extrapolates a *straight* segment to the next waypoint. If
 *   the intercept time exceeds the enemy's time-to-corner, the prediction
 *   overshoots and the projectile may whiff. In practice the projectile
 *   is much faster than the enemy so intercepts complete well before any
 *   waypoint pivot. If this becomes a problem, clamp `t` to
 *   `timeToWaypoint` and re-evaluate at the waypoint segment.
 * - This is a *tower* primitive only. Hero attacks and splash damage are
 *   unchanged.
 */
function leadAimDir(
  towerPos: Vec2,
  target: Enemy,
  projectileSpeed: number,
): Vec2 | null {
  let vx = 0;
  let vy = 0;
  if (target.waypoint >= 0 && target.waypoint < PATH.length) {
    const [wtx, wty] = PATH[target.waypoint];
    const wpx = wtx * TILE + TILE / 2;
    const wpy = wty * TILE + TILE / 2;
    const evx = wpx - target.pos.x;
    const evy = wpy - target.pos.y;
    const edist = Math.hypot(evx, evy);
    if (edist > 1e-3) {
      const espeed = target.speed * TILE;
      vx = (evx / edist) * espeed;
      vy = (evy / edist) * espeed;
    }
  }

  const dx = target.pos.x - towerPos.x;
  const dy = target.pos.y - towerPos.y;

  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;

  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
      else if (t1 > 0) t = t1;
      else if (t2 > 0) t = t2;
    }
  }

  const aimX = t > 0 ? target.pos.x + vx * t : target.pos.x;
  const aimY = t > 0 ? target.pos.y + vy * t : target.pos.y;
  const adx = aimX - towerPos.x;
  const ady = aimY - towerPos.y;
  const adist = Math.hypot(adx, ady);
  if (adist === 0) return null;
  return { x: adx / adist, y: ady / adist };
}

function pickTarget(
  tower: Tower,
  enemies: Enemy[],
  rangeMult: number,
  nowSec: number,
): Enemy | null {
  const range = rangeOf(tower.kind, rangeMult, tower.tier);
  const canHitFlying = TOWER_DEFS[tower.kind].canHitFlying;
  const tierDef = getTowerTier(tower.kind, tower.tier);
  // Towers whose shots apply a slow refuse to fire at enemies already under
  // the same effect. Without this, frost towers chain-freeze the leader and
  // ignore everyone else in range. If nothing unfrozen is in range, the
  // tower holds its shot (cooldown is only consumed when a projectile is
  // actually fired) — see `updateTower`.
  const slowsOnHit = "slow" in tierDef && tierDef.slow !== undefined;

  let best: Enemy | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    // Anti-air gate: ground-only towers ignore fliers entirely.
    if (e.flying && !canHitFlying) continue;
    // Slow-on-hit gate: skip enemies whose slow has not yet worn off.
    if (slowsOnHit && e.slowUntil > nowSec) continue;
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
  nowSec: number,
  outProjectiles: Projectile[],
): void {
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const tierDef = getTowerTier(tower.kind, tower.tier);
  const accent = TOWER_DEFS[tower.kind].accent;
  const target = pickTarget(tower, enemies, rangeMult, nowSec);
  if (!target) return;

  const dir = leadAimDir(tower.pos, target, tierDef.projectileSpeed);
  if (!dir) return;

  const proj = createProjectile({
    from: tower.pos,
    velDir: dir,
    speed: tierDef.projectileSpeed,
    damage: tierDef.damage * damageMult,
    color: accent,
    targetId: target.id,
    canHitFlying: TOWER_DEFS[tower.kind].canHitFlying,
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
    // Tag the selected tower with a no-fly badge at the top of its range
    // circle so the player learns which towers can't shoot the bats.
    if (!TOWER_DEFS[tower.kind].canHitFlying) {
      drawNoFlyBadge(ctx, tower.pos.x, tower.pos.y - range);
    }
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

/**
 * Small "no-fly" warning badge: a dark roundel with a stylised wing crossed
 * by a red slash. Centred at `(cx, cy)`.
 *
 * Exported because `src/map.ts` also draws it in the build-hint preview so
 * the player sees the anti-air gap *before* placing a ground-only tower —
 * keeping both call sites pointed at the same drawing routine guarantees
 * the in-world badge and the placement preview never drift apart.
 */
export function drawNoFlyBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
): void {
  const r = SCALE * 4;
  ctx.save();

  // Dark roundel with copper rim.
  ctx.fillStyle = "rgba(10, 8, 6, 0.92)";
  ctx.strokeStyle = "#c98a3a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Stylised wing: two small quadratic arcs meeting at the centre. Drawn in
  // pale ivory so the silhouette reads on the dark roundel.
  ctx.strokeStyle = "#f0e0c0";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy + r * 0.15);
  ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 0.5, cx, cy + r * 0.15);
  ctx.quadraticCurveTo(cx + r * 0.35, cy - r * 0.5, cx + r * 0.7, cy + r * 0.15);
  ctx.stroke();

  // Red diagonal slash, top-right to bottom-left across the roundel.
  ctx.strokeStyle = "#e83a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.75, cy - r * 0.75);
  ctx.lineTo(cx - r * 0.75, cy + r * 0.75);
  ctx.stroke();

  ctx.restore();
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
