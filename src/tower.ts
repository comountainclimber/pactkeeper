import { SCALE, TILE, TOWER_DEFS, type TowerKind } from "./config.ts";
import type { Enemy, Tower, Vec2 } from "./types.ts";
import { distance } from "./enemy.ts";
import { createProjectile } from "./projectile.ts";
import type { Projectile } from "./types.ts";
import { getSprite } from "./sprites.ts";

let nextId = 1;

export function createTower(kind: TowerKind, tile: Vec2): Tower {
  return {
    id: nextId++,
    kind,
    pos: { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 },
    tile: { ...tile },
    cooldown: 0,
  };
}

export function rangeOf(kind: TowerKind, rangeMult: number): number {
  return TOWER_DEFS[kind].range * rangeMult;
}

function pickTarget(tower: Tower, enemies: Enemy[], rangeMult: number): Enemy | null {
  const range = rangeOf(tower.kind, rangeMult);
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

  const def = TOWER_DEFS[tower.kind];
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
    speed: def.projectileSpeed,
    damage: def.damage * damageMult,
    color: def.accent,
    targetId: target.id,
    splashRadius: "splashRadius" in def ? def.splashRadius : undefined,
    slow: "slow" in def ? def.slow : undefined,
  });
  outProjectiles.push(proj);
  tower.cooldown = def.fireRate;

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
  const def = TOWER_DEFS[tower.kind];
  const range = rangeOf(tower.kind, rangeMult);

  if (selected) {
    ctx.save();
    ctx.fillStyle = def.accent + "18";
    ctx.beginPath();
    ctx.arc(tower.pos.x, tower.pos.y, range, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.accent + "aa";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const sprite = getSprite(def.sprite, SCALE);

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
}
