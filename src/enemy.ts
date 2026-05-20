import {
  BOSS_PHASE2_SPEED_MULT,
  BOSS_PHASE2_TINT,
  ENEMY_DEFS,
  PATH,
  SCALE,
  TILE,
  TILE_PX,
  isBossKind,
  type EnemyKind,
} from "./config.ts";
import type { Enemy, Vec2 } from "./types.ts";
import { waypointPos } from "./map.ts";
import { getSprite } from "./sprites.ts";

let nextId = 1;

export function spawnEnemy(
  kind: EnemyKind,
  hpMult: number,
  speedMult: number,
  bountyMult: number,
): Enemy {
  const def = ENEMY_DEFS[kind];
  const start = waypointPos(0);
  const hp = Math.round(def.hp * hpMult);
  return {
    id: nextId++,
    kind,
    pos: { x: start.x, y: start.y },
    hp,
    maxHp: hp,
    speed: def.speed * speedMult,
    baseSpeed: def.speed * speedMult,
    bounty: Math.round(def.bounty * bountyMult),
    radius: def.radius,
    color: "#888", // legacy field; unused for sprite rendering but kept for hp bar fallback
    waypoint: 1,
    slowUntil: 0,
    slowFactor: 1,
    alive: true,
    reachedEnd: false,
    bossPhase: isBossKind(kind) ? 1 : undefined,
    // Mirror the kind's `flying` flag onto the live Enemy so sim primitives
    // (targeting, projectile filter, splash) can branch without consulting
    // ENEMY_DEFS on every tick.
    flying: "flying" in def && def.flying === true ? true : undefined,
    splashResistant: kind === "wraith",
    attacksTowers: kind === "wraith",
    towerAttackCooldown: kind === "wraith" ? 2 : undefined,
    wraithAttackAnimUntil: undefined,
  };
}

/**
 * Optional blocker passed to {@link updateEnemy}. When the hero is standing
 * on a path tile, `Game.update` constructs one of these per frame and the
 * enemy halts if it gets within blocking range. Flying enemies ignore the
 * blocker — they're literally over the hero's head.
 *
 * Effects-flow rule: this is a parameter, not a global. The sim primitive
 * stays oblivious to `Game` / hero state.
 */
export type EnemyBlocker = {
  /** Blocker's tile coords. Only blocks while this is a path tile. */
  tile: Vec2;
  /** Blocker's screen-pixel center. */
  pos: Vec2;
  /** Halt-distance from the blocker's center, in screen px. Typically a
   * little over half a tile so enemies hold the line just outside melee
   * range and let the hero swing first. */
  halt: number;
};

export function updateEnemy(
  e: Enemy,
  dt: number,
  now: number,
  blocker?: EnemyBlocker | null,
): void {
  if (!e.alive || e.reachedEnd) return;

  // Boss enrage: drop below half HP and the kind's phase-2 multiplier
  // is applied once. Each boss carries its own multiplier so the realm
  // ladder reads as "harder realm = scarier enrage" — see
  // `BOSS_PHASE2_SPEED_MULT` in `src/config.ts`.
  const phase2Mult = BOSS_PHASE2_SPEED_MULT[e.kind];
  if (phase2Mult !== undefined && e.bossPhase === 1 && e.hp <= e.maxHp / 2) {
    e.bossPhase = 2;
    e.baseSpeed *= phase2Mult;
  }

  // Decrement tower attack cooldown for wraiths
  if (e.towerAttackCooldown !== undefined) {
    e.towerAttackCooldown -= dt;
  }

  if (now >= e.slowUntil) e.slowFactor = 1;
  e.speed = e.baseSpeed * e.slowFactor;

  if (e.waypoint >= PATH.length) {
    e.reachedEnd = true;
    e.alive = false;
    return;
  }

  // Blocked? Halt this frame if the hero is on a path tile and the enemy
  // has closed within `halt` pixels. Fliers pass overhead so they ignore
  // the block (matches anti-air rules elsewhere — fliers are above the
  // ground entirely).
  if (
    blocker &&
    !e.flying &&
    Math.hypot(blocker.pos.x - e.pos.x, blocker.pos.y - e.pos.y) <= blocker.halt
  ) {
    return;
  }

  const target = waypointPos(e.waypoint);
  const dx = target.x - e.pos.x;
  const dy = target.y - e.pos.y;
  const dist = Math.hypot(dx, dy);
  const step = e.speed * TILE * dt;

  if (step >= dist) {
    e.pos.x = target.x;
    e.pos.y = target.y;
    e.waypoint++;
  } else {
    e.pos.x += (dx / dist) * step;
    e.pos.y += (dy / dist) * step;
  }
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  nowSec: number,
): void {
  if (!e.alive) return;

  const def = ENEMY_DEFS[e.kind];
  const wraithAttacking =
    e.kind === "wraith" &&
    e.wraithAttackAnimUntil !== undefined &&
    nowSec < e.wraithAttackAnimUntil;
  const spriteName = wraithAttacking ? "ghostAttack" : def.sprite;
  // Bosses render at 2× sprite scale (~64×64 screen px); dragons sit
  // between bat and boss at 1.75×; everything else at the standard SCALE.
  // Drives the per-realm boss silhouette towering over the regular roster.
  const isBoss = isBossKind(e.kind);
  const renderScale = isBoss
    ? SCALE * 2
    : e.kind === "dragon"
      ? SCALE * 1.75
      : SCALE;
  const sprite = getSprite(spriteName, renderScale);

  // Small bob animation, offset per enemy so a wave doesn't pulse in unison.
  // Fliers lift off the path and bob more so the player can read "airborne" at
  // a glance; the ground shadow below stays at path level for positioning.
  const flyLift = e.flying ? SCALE * 5 : 0;
  const bobOffset = Math.sin((nowSec + e.id * 0.31) * 6) * (e.flying ? SCALE * 2 : SCALE);
  const drawX = Math.round(e.pos.x - sprite.width / 2);
  const drawY = Math.round(e.pos.y - sprite.height / 2 + bobOffset - flyLift);

  // Soft shadow. Fliers cast a smaller, fainter shadow at path level so the
  // player still sees *where on the map* the enemy actually is.
  ctx.fillStyle = e.flying ? "rgba(0, 0, 0, 0.28)" : "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.ellipse(
    e.pos.x,
    e.pos.y + sprite.height / 2 - SCALE * 2,
    e.flying ? sprite.width / 4 : sprite.width / 3,
    e.flying ? SCALE : SCALE * 1.5,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Boss phase-2 tint: a soft halo behind the sprite once the boss
  // enrages, color-keyed per-kind so each realm's boss reads at a glance
  // (warden → moss-green, brood mother → toxic pink, lich → ember). See
  // `BOSS_PHASE2_TINT` in `src/config.ts`.
  const phase2Tint = isBoss ? BOSS_PHASE2_TINT[e.kind] : undefined;
  if (phase2Tint !== undefined && e.bossPhase === 2) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = phase2Tint;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, sprite.width / 2 + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Radial fire glow under the dragon — sells the "fire breather" identity
  // without burning sprite real estate on a flame; "screen" blend keeps the
  // ember additive against both grass and path tiles.
  if (e.kind === "dragon") {
    const cx = e.pos.x;
    const cy = e.pos.y + bobOffset - flyLift;
    const glowR = sprite.width * 0.7;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grad.addColorStop(0, "rgba(255, 128, 48, 0.42)");
    grad.addColorStop(1, "rgba(255, 128, 48, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (wraithAttacking) {
    const t = Math.max(0, e.wraithAttackAnimUntil! - nowSec);
    const pulse = 1 - Math.min(1, t / 0.22);
    ctx.save();
    ctx.globalAlpha = 0.28 + pulse * 0.32;
    ctx.strokeStyle = "#98f3ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      e.pos.x,
      e.pos.y,
      sprite.width * (0.35 + pulse * 0.18),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  ctx.drawImage(sprite, drawX, drawY);

  // Slow / chill indicator
  if (e.slowFactor < 1) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#7ad4e8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, sprite.width / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // HP bar (matches design colors)
  const ratio = Math.max(0, e.hp / e.maxHp);
  const barW = Math.max(20, TILE_PX * SCALE * 0.8);
  const barH = SCALE * 2;
  const barX = e.pos.x - barW / 2;
  const barY = e.pos.y - sprite.height / 2 - SCALE * 3;

  ctx.fillStyle = "#1a1010";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle =
    ratio > 0.5 ? "#5acc3a" : ratio > 0.25 ? "#e8c440" : "#e83a3a";
  ctx.fillRect(barX, barY, barW * ratio, barH);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
