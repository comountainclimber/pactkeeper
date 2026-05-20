import {
  CANVAS_H,
  CANVAS_W,
  GRID_W,
  STARTING_GOLD,
  STARTING_LIVES,
  TILE,
  WRAITH_ATTACK_DAMAGE,
  WRAITH_ATTACK_RANGE,
  getTowerTier,
  type TowerKind,
} from "./config.ts";
import {
  drawAmbientOverlay,
  drawBuildHint,
  drawMap,
  isBuildable,
} from "./map.ts";
import { drawEnemy, spawnEnemy, updateEnemy, distance } from "./enemy.ts";
import {
  createTower,
  drawTower,
  healQuote,
  healTower,
  rangeOf,
  sellRefund,
  updateTower,
  upgradeTower,
} from "./tower.ts";
import { TowerPopover } from "./tower-popover.ts";
import { drawProjectile, stepProjectile } from "./projectile.ts";
import { applyPacts, PACTS, totalPactXp } from "./modifiers.ts";
import { TOTAL_WAVES, WAVES } from "./waves.ts";
import { drawHud, hitHud, type HudState } from "./hud.ts";
import { drawWaveBadge } from "./screens.ts";
import { CURRENT_LEVEL } from "./levels.ts";
import {
  finalize as finalizeScore,
  killScore,
  REALM_CLEAR_BONUS,
  type FinalizedScore,
  type ScoreOutcome,
} from "./score.ts";
import type {
  Enemy,
  GameScreen,
  PactEffects,
  Projectile,
  Tower,
} from "./types.ts";

type Mouse = { x: number; y: number; tileX: number; tileY: number };

/**
 * Snapshot of a finished run, handed to `main.ts` so it can route the player
 * to the pact screen's inscription overlay.
 *
 * `finalized` already accounts for the life bonus + pact multiplier — the
 * inscription card just needs to display + persist it.
 */
export type RunSummary = {
  outcome: ScoreOutcome;
  /** Level id (1..3) reached when the run ended. */
  level: number;
  /** Pact ids the run was sealed with. */
  pactIds: string[];
  /** Sum of those pacts' XP values. */
  pactXp: number;
  /** Per-kill + realm bonus accumulator. Before life bonus / multiplier. */
  rawScore: number;
  /** Total enemies killed. */
  kills: number;
  /** Lives remaining at run end. 0 on defeat. */
  livesLeft: number;
  finalized: FinalizedScore;
};

export class Game {
  private ctx: CanvasRenderingContext2D;
  // Starts in 'playing' state once main.ts calls beginLevelWithPacts. While the
  // canvas-stage is hidden (DOM pact screen showing), render/update are still
  // running but invisible — that's fine since no enemies/towers exist yet.
  private screen: GameScreen = "playing";

  // Effects from the currently-active pact set.
  private effects: PactEffects = applyPacts([]);

  // Notified once when the current level ends (victory or defeat). Receives a
  // snapshot of the run so the caller can drive scoreboard inscription.
  private endListener: ((summary: RunSummary) => void) | null = null;
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

  // Scoring (see src/score.ts for formulas)
  private chosenPactIds: string[] = [];
  private chosenPactXp = 0;
  private rawScore = 0;
  private kills = 0;

  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  private nowSec = 0;

  // UI state
  private mouse: Mouse = { x: 0, y: 0, tileX: -1, tileY: -1 };
  private selectedTower: TowerKind | null = null;
  private selectedPlacedTower: Tower | null = null;
  private popover: TowerPopover;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    const popoverStage = document.getElementById("popover-stage");
    if (!popoverStage) {
      throw new Error("Missing #popover-stage element for tower upgrade UI");
    }
    this.popover = new TowerPopover(popoverStage, canvas, {
      onUpgrade: () => this.upgradeSelectedTower(),
      onHeal: () => this.healSelectedTower(),
      onSell: () => this.sellSelectedTower(),
      onClose: () => this.clearSelectedPlacedTower(),
    });

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
          this.setSelectedPlacedTower(null);
        } else if (hud.type === "deselect") {
          this.selectedTower = null;
        }
        return;
      }

      // Click on map: place tower or select existing
      if (mx < TILE * GRID_W) {
        if (this.selectedTower) {
          this.tryPlaceTower(
            this.selectedTower,
            this.mouse.tileX,
            this.mouse.tileY,
          );
        } else {
          // `towerAt` returns null when the player clicks empty grass — that
          // dismisses the upgrade popover and clears the selection.
          this.setSelectedPlacedTower(this.towerAt(mx, my));
        }
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen !== "playing") return;
    if (e.key === "1") this.selectedTower = "arrow";
    else if (e.key === "2") this.selectedTower = "cannon";
    else if (e.key === "3") this.selectedTower = "frost";
    else if (e.key === "Escape") {
      this.selectedTower = null;
      this.setSelectedPlacedTower(null);
    }
  }

  // --- Flow ---

  // Called by main.ts after the DOM pact screen commits a selection.
  // `carry` provides explicit starting gold/lives/score/kills when entering a
  // mid-campaign level via URL handoff (e.g. `?level=2&gold=180&lives=15`);
  // when present they override the pact-scaled defaults so a run's totals
  // accumulate across realms.
  beginLevelWithPacts(
    chosenIds: string[],
    carry?: {
      gold?: number;
      lives?: number;
      /** Running raw score from prior realms — kills + realm-clear bonuses
       * already earned this run. Persisted across level handoffs so the
       * final inscription reflects the whole campaign, not just realm 3. */
      score?: number;
      /** Cumulative kill count from prior realms. */
      kills?: number;
    },
  ): void {
    const chosen = PACTS.filter((p) => chosenIds.includes(p.id));
    this.effects = applyPacts(chosen);
    this.chosenPactIds = chosen.map((p) => p.id);
    this.chosenPactXp = totalPactXp(chosen);
    this.gold =
      carry?.gold !== undefined
        ? carry.gold
        : Math.round(STARTING_GOLD * this.effects.startingGoldMult);
    this.lives =
      carry?.lives !== undefined
        ? Math.max(1, carry.lives)
        : Math.max(1, STARTING_LIVES + this.effects.startingLivesDelta);
    this.waveIndex = -1;
    this.inWave = false;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.selectedTower = null;
    this.setSelectedPlacedTower(null);
    this.endNotified = false;
    // Carry score/kills forward across realms (level 1 → 2 → 3) so the final
    // inscription card reflects the whole run. Resets to 0 only when starting
    // fresh from the pact altar (no carry supplied).
    this.rawScore = carry?.score ?? 0;
    this.kills = carry?.kills ?? 0;
    this.screen = "playing";
  }

  onLevelEnd(fn: (summary: RunSummary) => void): void {
    this.endListener = fn;
  }

  /**
   * Current gold balance. Exposed so `main.ts` can hand it to the next
   * realm's URL during campaign progression. (Lives + score already travel
   * via the {@link RunSummary} the end-listener receives.)
   */
  getGold(): number {
    return this.gold;
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
    // Dismiss the upgrade popover so it doesn't stick around when the DOM
    // pact screen takes over with the inscription card.
    this.setSelectedPlacedTower(null);
    if (!this.endNotified) {
      this.endNotified = true;
      if (victory) this.rawScore += REALM_CLEAR_BONUS;
      this.endListener?.(this.runSummary(victory ? "victory" : "defeat"));
    }
  }

  /**
   * Public accessor for the current run's score state. Used by `main.ts` for
   * the post-run inscription overlay. The `livesLeft` field reflects whatever
   * is on screen right now — for a defeat snapshot, that's `0`.
   */
  runSummary(outcome: ScoreOutcome): RunSummary {
    const livesLeft = Math.max(0, this.lives);
    const finalized = finalizeScore({
      rawScore: this.rawScore,
      livesLeft,
      pactXp: this.chosenPactXp,
    });
    return {
      outcome,
      level: CURRENT_LEVEL.id,
      pactIds: [...this.chosenPactIds],
      pactXp: this.chosenPactXp,
      rawScore: this.rawScore,
      kills: this.kills,
      livesLeft,
      finalized,
    };
  }

  // --- Update ---

  private update(dt: number): void {
    this.nowSec += dt;

    if (this.screen !== "playing") return;

    // Keep the upgrade popover's affordability state in sync with gold.
    // `update()` is a no-op when nothing is selected, so this is cheap.
    if (this.selectedPlacedTower) {
      this.popover.update({ gold: this.gold, effects: this.effects });
    }

    if (this.inWave) this.updateWaveSpawning(dt);

    for (const e of this.enemies) updateEnemy(e, dt, this.nowSec);
    this.handleEnemyEnd();

    // Wraiths and tower-attacking enemies strike
    this.updateEnemyTowerAttacks();

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
      } else {
        // Auto-roll into the next wave. Its own `preDelay` (3–8s in WAVES)
        // is the breathing room between waves — the player doesn't have to
        // press START again. Wave 1 is still triggered manually so the player
        // gets unlimited prep time before the first enemy spawns.
        this.startNextWave();
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
        // Splash (skip for splash-resistant enemies like wraiths)
        if (p.splashRadius) {
          for (const e of this.enemies) {
            if (!e.alive || e === res.primary) continue;
            if (e.splashResistant) continue; // Wraiths and similar enemies immune to splash
            if (distance(e.pos, res.impact) <= p.splashRadius) {
              this.damageEnemy(e, p.damage * 0.6);
            }
          }
        }
        p.ttl = 0;
      }
    }
    this.projectiles = this.projectiles.filter(
      (p) =>
        p.ttl > 0 &&
        p.pos.x > -20 &&
        p.pos.x < CANVAS_W + 20 &&
        p.pos.y > -20 &&
        p.pos.y < CANVAS_H + 20,
    );
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    if (!e.alive) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.alive = false;
      this.gold += e.bounty;
      this.rawScore += killScore(e.kind);
      this.kills += 1;
      const deathSfx: Partial<Record<string, keyof PactkeeperSFXInstance>> = {
        orc: "orcDie",
        goblin: "goblinDie",
        skeleton: "skeletonDie",
        wraith: "wraithDie",
      };
      const sfxName = deathSfx[e.kind];
      if (sfxName) window.PactkeeperSFX?.[sfxName]();
    }
  }

  private applySlow(
    e: Enemy,
    slow: { factor: number; duration: number },
  ): void {
    if (slow.factor < e.slowFactor) e.slowFactor = slow.factor;
    e.slowUntil = Math.max(e.slowUntil, this.nowSec + slow.duration);
  }

  /**
   * Process tower attacks by wraiths and other tower-attacking enemies.
   * Wraiths find nearby towers and attack them when their cooldown expires.
   */
  private updateEnemyTowerAttacks(): void {
    for (const e of this.enemies) {
      if (!e.alive || !e.attacksTowers) continue;
      if (!e.towerAttackCooldown || e.towerAttackCooldown > 0) continue;

      // Find a nearby tower to attack
      let target: Tower | null = null;
      let closestDist = WRAITH_ATTACK_RANGE;
      for (const t of this.towers) {
        const dist = distance(e.pos, t.pos);
        if (dist < closestDist) {
          closestDist = dist;
          target = t;
        }
      }

      if (target) {
        this.damageTower(target, WRAITH_ATTACK_DAMAGE);
        window.PactkeeperSFX?.wraithAttack();
        e.wraithAttackAnimUntil = this.nowSec + 0.22;
        e.towerAttackCooldown = 2; // 2 second cooldown between attacks
      }
    }
  }

  /**
   * Damage a tower by the given amount. If HP <= 0, tower is destroyed.
   */
  private damageTower(tower: Tower, dmg: number): void {
    tower.hp -= dmg;
    if (tower.hp <= 0) {
      // Tower destroyed; remove it from the towers list and deselect if selected
      this.towers = this.towers.filter((t) => t !== tower);
      if (this.selectedPlacedTower === tower) {
        this.selectedPlacedTower = null;
        this.popover.hide();
      }
    }
  }

  private tryPlaceTower(kind: TowerKind, tx: number, ty: number): void {
    if (!isBuildable(tx, ty)) return;
    if (this.towers.some((t) => t.tile.x === tx && t.tile.y === ty)) return;
    // Placement is always at tier 1; upgrades happen via the popover.
    const baseCost = getTowerTier(kind, 1).cost;
    const cost = Math.round(baseCost * this.effects.towerCostMult);
    if (this.gold < cost) return;
    this.gold -= cost;
    this.towers.push(createTower(kind, { x: tx, y: ty }));
    // Deselect after placement so the player can't accidentally double-place
    // and so the HUD picker returns to neutral. To place another, click the
    // picker card again (or press the hotkey).
    this.selectedTower = null;
    // First placed tower is the player's "I'm ready" signal — auto-kick wave 1.
    // Subsequent waves auto-roll via the end-of-wave check in `update()`.
    if (this.waveIndex < 0 && !this.inWave) this.startNextWave();
  }

  private towerAt(px: number, py: number): Tower | null {
    for (const t of this.towers) {
      if (
        Math.abs(t.pos.x - px) <= TILE / 2 &&
        Math.abs(t.pos.y - py) <= TILE / 2
      ) {
        return t;
      }
    }
    return null;
  }

  // --- Tower upgrade / sell (popover-driven) ---

  /**
   * Single mutation point for `selectedPlacedTower`. Keeps the popover in
   * lock-step with the field so we never end up with `selectedPlacedTower`
   * set but the popover hidden (or vice versa). Pass `null` to dismiss.
   */
  private setSelectedPlacedTower(tower: Tower | null): void {
    this.selectedPlacedTower = tower;
    if (tower) {
      this.popover.show(tower, {
        gold: this.gold,
        effects: this.effects,
      });
    } else {
      this.popover.hide();
    }
  }

  private clearSelectedPlacedTower(): void {
    this.setSelectedPlacedTower(null);
  }

  /**
   * Upgrade the currently-selected placed tower if the player can afford it.
   * Bound to the popover's UPGRADE button. Silent no-op on:
   *  - no tower selected
   *  - already at tier 3
   *  - not enough gold
   * The popover does its own affordability gating so this is mostly a
   * defensive guard.
   */
  private upgradeSelectedTower(): void {
    const t = this.selectedPlacedTower;
    if (!t) return;
    if (t.tier >= 3) return;
    const next = getTowerTier(t.kind, (t.tier + 1) as 2 | 3);
    if (this.gold < next.cost) return;
    this.gold -= next.cost;
    upgradeTower(t);
    // Refresh popover with the new tier + reduced gold; same tower stays selected.
    this.popover.show(t, { gold: this.gold, effects: this.effects });
  }

  /**
   * Sell the currently-selected placed tower. Refunds 60% of every coin the
   * player actually paid on it (T1 placement × `towerCostMult` + each
   * upgrade), removes it from the field, and dismisses the popover.
   * `sellRefund` lives in `tower.ts` so the displayed value (popover) and the
   * actual refund (here) cannot drift apart.
   */
  private sellSelectedTower(): void {
    const t = this.selectedPlacedTower;
    if (!t) return;
    this.gold += sellRefund(t.kind, t.tier, this.effects.towerCostMult);
    this.towers = this.towers.filter((other) => other.id !== t.id);
    this.setSelectedPlacedTower(null);
  }

  /**
   * Heal the selected tower by one chunk if the player can afford it.
   * Cost and amount come from `tower.ts` so UI and gameplay stay in sync.
   */
  private healSelectedTower(): void {
    const t = this.selectedPlacedTower;
    if (!t) return;
    const quote = healQuote(t);
    if (quote.amount <= 0) return;
    if (this.gold < quote.cost) return;
    const healed = healTower(t);
    if (healed <= 0) return;
    this.gold -= quote.cost;
    window.PactkeeperSFX?.towerHeal();
    this.popover.show(t, { gold: this.gold, effects: this.effects });
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

    // Top-left wave/realm badge — drawn after the play-field actors so it
    // sits on top, but before the HUD (which lives off to the right).
    drawWaveBadge(this.ctx, this.waveIndex, TOTAL_WAVES, CURRENT_LEVEL.name);

    drawHud(this.ctx, this.hudState());
  }

  private hudState(): HudState {
    // Wave-spawn progress: fraction of this wave's groups that have completed
    // spawning. `0` when not in a wave. Drives the red horizontal bar in the
    // HUD wave card. (Coarse-grained: per-group, not per-enemy.)
    let waveProgress = 0;
    if (this.inWave && this.waveIndex >= 0) {
      const groups = WAVES[this.waveIndex].groups.length;
      if (groups > 0) {
        waveProgress = Math.min(1, this.groupIndex / groups);
      }
    }
    // Score multiplier follows the same formula as `finalizeScore` so the in-
    // game readout matches what the inscription card will display at run end.
    const scoreMult =
      Math.round((1 + Math.max(0, this.chosenPactXp) / 1000) * 100) / 100;
    let alive = 0;
    for (const e of this.enemies) if (e.alive) alive++;
    return {
      gold: this.gold,
      lives: this.lives,
      wave: this.waveIndex,
      totalWaves: TOTAL_WAVES,
      inWave: this.inWave,
      selectedTower: this.selectedTower,
      costMult: this.effects.towerCostMult,
      score: this.rawScore,
      scoreMult,
      realmName: CURRENT_LEVEL.name,
      enemiesAlive: alive,
      // Convention: the last wave in WAVES is the boss wave. Encoded here so
      // the HUD doesn't need to know about waves.ts.
      bossWaveIndex: TOTAL_WAVES - 1,
      hasTowers: this.towers.length > 0,
      waveProgress,
    };
  }
}
