import {
  CANVAS_H,
  CANVAS_W,
  GRID_W,
  STARTING_GOLD,
  STARTING_LIVES,
  TILE,
  TOWER_DEFS,
  type TowerKind,
} from "./config.ts";
import {
  drawAmbientOverlay,
  drawBuildHint,
  drawMap,
  isBuildable,
} from "./map.ts";
import {
  drawEnemy,
  spawnEnemy,
  updateEnemy,
  distance,
} from "./enemy.ts";
import {
  createTower,
  drawTower,
  rangeOf,
  updateTower,
} from "./tower.ts";
import { drawProjectile, stepProjectile } from "./projectile.ts";
import { applyPacts, PACTS } from "./modifiers.ts";
import { TOTAL_WAVES, WAVES } from "./waves.ts";
import { drawHud, hitHud, type HudState } from "./hud.ts";
import { drawEndScreen } from "./screens.ts";
import type {
  Enemy,
  GameScreen,
  PactEffects,
  Projectile,
  Tower,
} from "./types.ts";

type Mouse = { x: number; y: number; tileX: number; tileY: number };

export class Game {
  private ctx: CanvasRenderingContext2D;
  // Starts in 'playing' state once main.ts calls beginLevelWithPacts. While the
  // canvas-stage is hidden (DOM pact screen showing), render/update are still
  // running but invisible — that's fine since no enemies/towers exist yet.
  private screen: GameScreen = "playing";

  // Effects from the currently-active pact set.
  private effects: PactEffects = applyPacts([]);

  // Notified once when the current level ends (victory or defeat).
  private endListener: (() => void) | null = null;
  private endNotified = false;

  // Run state
  private gold = STARTING_GOLD;
  private lives = STARTING_LIVES;
  private waveIndex = -1; // -1 = pre-game (in pact screen flow this resets)
  private inWave = false;
  private waveTimer = 0; // time until next spawn
  private groupIndex = 0;
  private spawnedInGroup = 0;
  private preDelayLeft = 0;

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  private nowSec = 0;

  // UI state
  private mouse: Mouse = { x: 0, y: 0, tileX: -1, tileY: -1 };
  private selectedTower: TowerKind | null = null;
  private selectedPlacedTower: Tower | null = null;
  private endScreenLockTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    canvas.addEventListener("mousemove", (e) => this.onMouseMove(canvas, e));
    canvas.addEventListener("mousedown", (e) => this.onMouseDown(canvas, e));
    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  start(): void {
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // --- Input ---

  private onMouseMove(canvas: HTMLCanvasElement, e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    this.mouse.x = (e.clientX - rect.left) * scaleX;
    this.mouse.y = (e.clientY - rect.top) * scaleY;
    this.mouse.tileX = Math.floor(this.mouse.x / TILE);
    this.mouse.tileY = Math.floor(this.mouse.y / TILE);
  }

  private onMouseDown(canvas: HTMLCanvasElement, e: MouseEvent): void {
    this.onMouseMove(canvas, e); // sync coords
    const { x: mx, y: my } = this.mouse;

    if (this.screen === "victory" || this.screen === "defeat") {
      // Click is a no-op now — main.ts swaps back to the DOM pact screen on the timer.
      return;
    }

    // No 'pact' screen handled here anymore — DOM pact screen owns selection.

    if (this.screen === "playing") {
      // HUD first
      const hud = hitHud(mx, my, this.hudState());
      if (hud) {
        if (hud.type === "select-tower") {
          this.selectedTower = hud.kind;
          this.selectedPlacedTower = null;
        } else if (hud.type === "deselect") {
          this.selectedTower = null;
        } else if (hud.type === "start-wave") {
          this.startNextWave();
        }
        return;
      }

      // Click on map: place tower or select existing
      if (mx < TILE * GRID_W) {
        if (this.selectedTower) {
          this.tryPlaceTower(this.selectedTower, this.mouse.tileX, this.mouse.tileY);
        } else {
          this.selectedPlacedTower = this.towerAt(mx, my);
        }
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen !== "playing") return;
    if (e.key === "1") this.selectedTower = "arrow";
    else if (e.key === "2") this.selectedTower = "cannon";
    else if (e.key === "3") this.selectedTower = "frost";
    else if (e.key === "Escape") this.selectedTower = null;
    else if (e.key === " ") {
      if (!this.inWave) this.startNextWave();
    }
  }

  // --- Flow ---

  // Called by main.ts after the DOM pact screen commits a selection.
  beginLevelWithPacts(chosenIds: string[]): void {
    const chosen = PACTS.filter((p) => chosenIds.includes(p.id));
    this.effects = applyPacts(chosen);
    this.gold = Math.round(STARTING_GOLD * this.effects.startingGoldMult);
    this.lives = Math.max(
      1,
      STARTING_LIVES + this.effects.startingLivesDelta,
    );
    this.waveIndex = -1;
    this.inWave = false;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.selectedTower = null;
    this.selectedPlacedTower = null;
    this.endNotified = false;
    this.screen = "playing";
  }

  onLevelEnd(fn: () => void): void {
    this.endListener = fn;
  }

  private startNextWave(): void {
    if (this.inWave) return;
    if (this.waveIndex + 1 >= TOTAL_WAVES) return;
    this.waveIndex++;
    this.inWave = true;
    this.groupIndex = 0;
    this.spawnedInGroup = 0;
    const w = WAVES[this.waveIndex];
    this.preDelayLeft = w.preDelay;
    this.waveTimer = 0;
  }

  private endLevel(victory: boolean): void {
    this.screen = victory ? "victory" : "defeat";
    this.endScreenLockTimer = 0.8;
    if (!this.endNotified) {
      this.endNotified = true;
      this.endListener?.();
    }
  }

  // --- Update ---

  private update(dt: number): void {
    this.nowSec += dt;

    if (this.endScreenLockTimer > 0) this.endScreenLockTimer -= dt;
    if (this.screen !== "playing") return;

    if (this.inWave) this.updateWaveSpawning(dt);

    for (const e of this.enemies) updateEnemy(e, dt, this.nowSec);
    this.handleEnemyEnd();

    for (const t of this.towers) {
      updateTower(
        t,
        dt,
        this.enemies,
        this.effects.towerDamageMult,
        this.effects.towerRangeMult,
        this.projectiles,
      );
    }

    this.updateProjectiles(dt);

    // End-of-wave check
    if (
      this.inWave &&
      this.preDelayLeft <= 0 &&
      this.groupIndex >= WAVES[this.waveIndex].groups.length &&
      this.enemies.every((e) => !e.alive)
    ) {
      this.inWave = false;
      // Victory: completed the final (boss) wave
      if (this.waveIndex + 1 >= TOTAL_WAVES) {
        this.endLevel(true);
      }
    }

    if (this.lives <= 0) this.endLevel(false);
  }

  private updateWaveSpawning(dt: number): void {
    if (this.preDelayLeft > 0) {
      this.preDelayLeft -= dt;
      return;
    }
    const wave = WAVES[this.waveIndex];
    if (this.groupIndex >= wave.groups.length) return;

    this.waveTimer -= dt;
    if (this.waveTimer > 0) return;

    const group = wave.groups[this.groupIndex];
    const totalCount = Math.max(
      1,
      Math.round(group.count * this.effects.waveSizeMult),
    );
    if (this.spawnedInGroup < totalCount) {
      this.enemies.push(
        spawnEnemy(
          group.kind,
          this.effects.enemyHpMult,
          this.effects.enemySpeedMult,
          this.effects.enemyBountyMult,
        ),
      );
      this.spawnedInGroup++;
      this.waveTimer = group.gap;
    } else {
      this.groupIndex++;
      this.spawnedInGroup = 0;
      this.waveTimer = 0.5;
    }
  }

  private handleEnemyEnd(): void {
    for (const e of this.enemies) {
      if (e.reachedEnd) {
        this.lives -= e.kind === "boss" ? 10 : e.kind === "skeleton" ? 3 : 1;
        e.reachedEnd = false;
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      const res = stepProjectile(p, dt, this.enemies);
      if (res.hit && res.primary) {
        // Primary hit
        this.damageEnemy(res.primary, p.damage);
        if (p.slow && res.primary.alive) this.applySlow(res.primary, p.slow);
        // Splash
        if (p.splashRadius) {
          for (const e of this.enemies) {
            if (!e.alive || e === res.primary) continue;
            if (distance(e.pos, res.impact) <= p.splashRadius) {
              this.damageEnemy(e, p.damage * 0.6);
            }
          }
        }
        p.ttl = 0;
      }
    }
    this.projectiles = this.projectiles.filter(
      (p) => p.ttl > 0 && p.pos.x > -20 && p.pos.x < CANVAS_W + 20 &&
        p.pos.y > -20 && p.pos.y < CANVAS_H + 20,
    );
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    if (!e.alive) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.alive = false;
      this.gold += e.bounty;
      const deathSfx: Partial<Record<string, keyof PactkeeperSFXInstance>> = {
        orc: "orcDie",
        goblin: "goblinDie",
        skeleton: "skeletonDie",
      };
      const sfxName = deathSfx[e.kind];
      if (sfxName) window.PactkeeperSFX?.[sfxName]();
    }
  }

  private applySlow(e: Enemy, slow: { factor: number; duration: number }): void {
    if (slow.factor < e.slowFactor) e.slowFactor = slow.factor;
    e.slowUntil = Math.max(e.slowUntil, this.nowSec + slow.duration);
  }

  private tryPlaceTower(kind: TowerKind, tx: number, ty: number): void {
    if (!isBuildable(tx, ty)) return;
    if (this.towers.some((t) => t.tile.x === tx && t.tile.y === ty)) return;
    const cost = Math.round(TOWER_DEFS[kind].cost * this.effects.towerCostMult);
    if (this.gold < cost) return;
    this.gold -= cost;
    this.towers.push(createTower(kind, { x: tx, y: ty }));
  }

  private towerAt(px: number, py: number): Tower | null {
    for (const t of this.towers) {
      if (Math.abs(t.pos.x - px) <= TILE / 2 && Math.abs(t.pos.y - py) <= TILE / 2) {
        return t;
      }
    }
    return null;
  }

  // --- Render ---

  private render(): void {
    drawMap(this.ctx);

    // Atmospheric layer sits between the static map and the actors so
    // towers/enemies stay readable on top of the path glow.
    drawAmbientOverlay(this.ctx, this.nowSec);

    for (const t of this.towers) {
      drawTower(
        this.ctx,
        t,
        this.effects.towerRangeMult,
        this.selectedPlacedTower === t,
      );
    }

    for (const e of this.enemies) drawEnemy(this.ctx, e, this.nowSec);
    for (const p of this.projectiles) drawProjectile(this.ctx, p);

    // Build hint
    if (
      this.selectedTower &&
      this.mouse.tileX >= 0 &&
      this.mouse.tileY >= 0 &&
      this.mouse.x < TILE * GRID_W
    ) {
      const tx = this.mouse.tileX;
      const ty = this.mouse.tileY;
      const ok =
        isBuildable(tx, ty) &&
        !this.towers.some((t) => t.tile.x === tx && t.tile.y === ty);
      const range = rangeOf(this.selectedTower, this.effects.towerRangeMult);
      drawBuildHint(this.ctx, tx, ty, ok, range);
    }

    drawHud(this.ctx, this.hudState());

    if (this.screen === "victory") drawEndScreen(this.ctx, true);
    if (this.screen === "defeat") drawEndScreen(this.ctx, false);
  }

  private hudState(): HudState {
    return {
      gold: this.gold,
      lives: this.lives,
      wave: this.waveIndex,
      totalWaves: TOTAL_WAVES,
      inWave: this.inWave,
      selectedTower: this.selectedTower,
      costMult: this.effects.towerCostMult,
    };
  }
}
