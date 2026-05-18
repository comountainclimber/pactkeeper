import type { Enemy, Projectile, Vec2 } from "./types.ts";
import { distance } from "./enemy.ts";

let nextId = 1;

export function createProjectile(opts: {
  from: Vec2;
  velDir: Vec2; // unit vector
  speed: number;
  damage: number;
  color: string;
  targetId: number;
  splashRadius?: number;
  slow?: { factor: number; duration: number };
}): Projectile {
  return {
    id: nextId++,
    pos: { x: opts.from.x, y: opts.from.y },
    vel: { x: opts.velDir.x * opts.speed, y: opts.velDir.y * opts.speed },
    targetId: opts.targetId,
    damage: opts.damage,
    splashRadius: opts.splashRadius,
    slow: opts.slow,
    color: opts.color,
    ttl: 3,
  };
}

// Returns enemies that should take damage from this projectile this frame.
// Direct-hit damage is applied to each returned enemy individually; splash is
// handled by the game loop using the projectile's splashRadius.
export function stepProjectile(
  p: Projectile,
  dt: number,
  enemies: Enemy[],
): { hit: boolean; impact: Vec2; primary?: Enemy } {
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.ttl -= dt;

  // Find target by id; if dead or gone, look for the closest enemy within a
  // small radius so projectiles still feel like they hit something.
  const target = enemies.find((e) => e.id === p.targetId && e.alive);
  if (target) {
    if (distance(p.pos, target.pos) <= target.radius + 4) {
      return { hit: true, impact: { ...p.pos }, primary: target };
    }
  } else {
    // Find any enemy very close
    for (const e of enemies) {
      if (!e.alive) continue;
      if (distance(p.pos, e.pos) <= e.radius + 2) {
        return { hit: true, impact: { ...p.pos }, primary: e };
      }
    }
  }
  return { hit: false, impact: p.pos };
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1;
  ctx.stroke();
}
