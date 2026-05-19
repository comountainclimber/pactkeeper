// DOM-rendered tower upgrade popover. Mounts on the existing `#popover-stage`
// div (declared in `index.html`); positions itself in viewport coordinates by
// mapping the tower's canvas-space center through `canvas.getBoundingClientRect`.
//
// Architecture: the popover follows the same DOM-over-canvas pattern as the
// pact screen, but at a much smaller surface — a single card, not a full
// screen — so it lives on its own stage (`#popover-stage`) and reuses the
// already-bundled `src/pacts.css` for visual continuity.
//
// Lifecycle: `Game` owns one `TowerPopover` instance. When the player clicks a
// placed tower, `Game` calls `show(tower, state)`. Each subsequent change
// (gold tick, upgrade, escape) routes through `update(tower, state)`; the
// popover diffs against its last render and only rebuilds when something the
// player can see has actually changed. `hide()` removes the element entirely.

import { TOWER_DEFS, TILE, getTowerTier, type TowerKind, type TowerTier } from "./config.ts";
import { sellRefund } from "./tower.ts";
import type { PactEffects, Tower } from "./types.ts";

/**
 * Snapshot of the run state the popover needs to render. Passed in by `Game`
 * so the popover stays a pure presentation layer with no reach-back into game
 * state.
 */
export type TowerPopoverState = {
  gold: number;
  effects: PactEffects;
};

/**
 * Callbacks the popover invokes when the player hits its buttons. `Game`
 * supplies bound methods so the popover doesn't need a reference back.
 */
export type TowerPopoverCallbacks = {
  onUpgrade: () => void;
  onSell: () => void;
  onClose: () => void;
};

export class TowerPopover {
  private stage: HTMLElement;
  private canvas: HTMLCanvasElement;
  private callbacks: TowerPopoverCallbacks;
  private el: HTMLElement | null = null;
  private currentTower: Tower | null = null;

  // Last-rendered state — used by `update()` to skip work when nothing
  // visible has changed.
  private lastTowerId: number | null = null;
  private lastTier: TowerTier | null = null;
  private lastGold: number | null = null;
  private lastEffectKey = "";

  // Bound resize handler so we can attach on `show` and remove on `hide`
  // without leaking a listener per shown tower. The popover anchor only needs
  // re-positioning on (a) a fresh render, or (b) a viewport size change.
  private readonly onResize: () => void;

  constructor(
    stage: HTMLElement,
    canvas: HTMLCanvasElement,
    callbacks: TowerPopoverCallbacks,
  ) {
    this.stage = stage;
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.onResize = () => {
      if (this.currentTower) this.position(this.currentTower);
    };
  }

  /**
   * Show the popover anchored to `tower`. Safe to call repeatedly with the
   * same tower (no-op if nothing changed); call again with a different tower
   * to swap the anchor without flicker.
   */
  show(tower: Tower, state: TowerPopoverState): void {
    const newlyShown = this.currentTower === null;
    this.currentTower = tower;
    this.stage.hidden = false;
    const rebuilt = this.render(tower, state);
    // Reposition on every `show` call: a different tower clearly changes the
    // anchor, and a re-show of the same tower (after an upgrade) may also
    // need a fresh measurement because the DOM was rebuilt.
    if (rebuilt || newlyShown) this.position(tower);
    if (newlyShown) window.addEventListener("resize", this.onResize);
  }

  /**
   * Refresh against the latest state. If no tower is currently shown this is a
   * no-op; callers don't need to special-case the hidden state. Called every
   * frame from the rAF loop while a tower is selected — must stay cheap.
   * `render` returns `true` only when the DOM was rebuilt, so we skip the
   * (layout-flushing) `position()` call in the common gold-only-changed case.
   */
  update(state: TowerPopoverState): void {
    if (!this.currentTower) return;
    const rebuilt = this.render(this.currentTower, state);
    if (rebuilt) this.position(this.currentTower);
  }

  hide(): void {
    if (this.currentTower) window.removeEventListener("resize", this.onResize);
    this.currentTower = null;
    this.lastTowerId = null;
    this.lastTier = null;
    this.lastGold = null;
    this.lastEffectKey = "";
    if (this.el && this.el.parentNode === this.stage) {
      this.stage.removeChild(this.el);
    }
    this.el = null;
    this.stage.hidden = true;
  }

  // --- Internal ---

  /**
   * Returns `true` if the DOM was rebuilt (caller should re-position), `false`
   * if this was a cheap in-place update (affordability flip, or no-op).
   */
  private render(tower: Tower, state: TowerPopoverState): boolean {
    const effectKey = this.effectsKey(state.effects);
    const fullRebuild =
      !this.el ||
      this.lastTowerId !== tower.id ||
      this.lastTier !== tower.tier ||
      this.lastEffectKey !== effectKey;

    if (fullRebuild) {
      this.el = this.buildElement(tower, state);
      this.stage.replaceChildren(this.el);
      this.lastTowerId = tower.id;
      this.lastTier = tower.tier;
      this.lastEffectKey = effectKey;
      this.lastGold = state.gold;
      return true;
    }

    // Tower/tier/pact-effects didn't change but gold may have — flip the
    // upgrade button's affordable class instead of replacing the DOM.
    if (this.lastGold !== state.gold) {
      this.refreshAffordability(tower, state);
      this.lastGold = state.gold;
    }
    return false;
  }

  private buildElement(tower: Tower, state: TowerPopoverState): HTMLElement {
    const def = TOWER_DEFS[tower.kind];
    const current = getTowerTier(tower.kind, tower.tier);
    const next = tower.tier < 3
      ? getTowerTier(tower.kind, (tower.tier + 1) as TowerTier)
      : null;
    const sellValue = sellRefund(tower.kind, tower.tier, state.effects.towerCostMult);

    const el = document.createElement("div");
    el.className = "popover-card";
    el.style.setProperty("--accent", def.accent);

    el.innerHTML = `
      <button class="popover-close" type="button" data-act="close" aria-label="Close">✕</button>
      <div class="popover-head">
        <div class="popover-tier">${this.tierDotsHtml(tower.tier)}</div>
        <div class="popover-name">${current.label}</div>
      </div>
      <div class="popover-statgrid">
        ${this.statsHtml(tower.kind, tower.tier, state.effects)}
      </div>
      ${next ? this.upgradeBtnHtml(next, state.gold, tower.tier) : this.maxBtnHtml()}
      <button class="popover-sell" type="button" data-act="sell">
        SELL <span class="popover-sell-coin">◈ ${sellValue}</span>
      </button>
    `;

    // Stop clicks inside the popover from reaching the canvas placement
    // handler — otherwise clicking the upgrade button could trigger a new
    // tower placement if a HUD card is selected.
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      e.stopPropagation();
      if (act === "close") this.callbacks.onClose();
      else if (act === "sell") this.callbacks.onSell();
      else if (act === "upgrade") this.callbacks.onUpgrade();
    });

    return el;
  }

  private refreshAffordability(tower: Tower, state: TowerPopoverState): void {
    if (!this.el || tower.tier >= 3) return;
    const next = getTowerTier(tower.kind, (tower.tier + 1) as TowerTier);
    const btn = this.el.querySelector<HTMLButtonElement>(".popover-upgrade");
    if (!btn) return;
    const canAfford = state.gold >= next.cost;
    btn.classList.toggle("ready", canAfford);
    btn.classList.toggle("broke", !canAfford);
    btn.disabled = !canAfford;
  }

  private tierDotsHtml(tier: TowerTier): string {
    let out = "";
    for (let i = 1; i <= 3; i++) {
      const on = i <= tier ? "on" : "";
      out += `<span class="popover-pip ${on}">★</span>`;
    }
    return out;
  }

  private statsHtml(kind: TowerKind, tier: TowerTier, effects: PactEffects): string {
    const current = getTowerTier(kind, tier);
    const next = tier < 3 ? getTowerTier(kind, (tier + 1) as TowerTier) : null;
    const dmgMult = effects.towerDamageMult;
    const rngMult = effects.towerRangeMult;

    const currentDmg = current.damage * dmgMult;
    const nextDmg = next ? next.damage * dmgMult : null;
    const currentRng = current.range * rngMult;
    const nextRng = next ? next.range * rngMult : null;

    const lines: string[] = [];
    lines.push(
      this.statLine(
        "DMG",
        fmtNum(currentDmg),
        nextDmg !== null ? nextDmg - currentDmg : null,
        "",
      ),
    );
    lines.push(
      this.statLine(
        "RNG",
        `${Math.round(currentRng)}`,
        nextRng !== null ? Math.round(nextRng - currentRng) : null,
        "",
      ),
    );
    lines.push(
      this.statLine(
        "RATE",
        `${current.fireRate.toFixed(2)}s`,
        // For fire rate, lower is better — invert the delta so a faster next
        // tier reads as "−0.10s" (good) rather than the raw negative number.
        next ? +(next.fireRate - current.fireRate).toFixed(2) : null,
        "s",
        /* lowerIsBetter */ true,
      ),
    );
    if ("splashRadius" in current && current.splashRadius !== undefined) {
      const nextSplash =
        next && "splashRadius" in next && next.splashRadius !== undefined
          ? next.splashRadius
          : null;
      lines.push(
        this.statLine(
          "SPLASH",
          `${current.splashRadius}`,
          nextSplash !== null ? nextSplash - current.splashRadius : null,
          "",
        ),
      );
    }
    if ("slow" in current && current.slow) {
      const nextSlow =
        next && "slow" in next && next.slow ? next.slow : null;
      // Show chill duration; deeper factor (lower number) = better, also
      // shown as a separate line so the player sees both axes change.
      lines.push(
        this.statLine(
          "CHILL",
          `${current.slow.duration.toFixed(1)}s`,
          nextSlow !== null
            ? +(nextSlow.duration - current.slow.duration).toFixed(1)
            : null,
          "s",
        ),
      );
      const currentSlowPct = Math.round((1 - current.slow.factor) * 100);
      const nextSlowPct = nextSlow
        ? Math.round((1 - nextSlow.factor) * 100)
        : null;
      lines.push(
        this.statLine(
          "SLOW",
          `${currentSlowPct}%`,
          nextSlowPct !== null ? nextSlowPct - currentSlowPct : null,
          "%",
        ),
      );
    }

    // ANTI-AIR is a kind-level capability, not a tier upgrade, so we pass
    // `null` for delta. Inline-style the value so YES reads green (matching
    // the existing positive-delta color) and NO reads muted.
    const canHitFlying = TOWER_DEFS[kind].canHitFlying;
    const aaValue = canHitFlying
      ? `<span style="color:#5acc3a">YES</span>`
      : `<span style="color:#8a7050">NO</span>`;
    lines.push(this.statLine("ANTI-AIR", aaValue, null, ""));

    return lines.join("");
  }

  private statLine(
    label: string,
    value: string,
    delta: number | null,
    unit: string,
    lowerIsBetter = false,
  ): string {
    let deltaHtml = "";
    if (delta !== null && delta !== 0 && !Number.isNaN(delta)) {
      // For "lower is better" stats (fireRate), a negative raw delta is a
      // gain — show it with a minus sign in green; positive raw is a loss.
      const isGain = lowerIsBetter ? delta < 0 : delta > 0;
      const color = isGain ? "#5acc3a" : "#e84040";
      const sign = delta > 0 ? "+" : "";
      const text = `${sign}${formatDelta(delta)}${unit}`;
      deltaHtml = `<span class="popover-stat-delta" style="color:${color}">${text}</span>`;
    } else {
      deltaHtml = `<span class="popover-stat-delta"></span>`;
    }
    return `
      <div class="popover-stat-line">
        <span class="popover-stat-lbl">${label}</span>
        <span class="popover-stat-val">${value}</span>
        ${deltaHtml}
      </div>
    `;
  }

  private upgradeBtnHtml(
    next: ReturnType<typeof getTowerTier>,
    gold: number,
    currentTier: TowerTier,
  ): string {
    const canAfford = gold >= next.cost;
    const cls = canAfford ? "ready" : "broke";
    const disabled = canAfford ? "" : "disabled";
    const stars = "★".repeat(currentTier + 1);
    return `
      <button class="popover-upgrade ${cls}" type="button" data-act="upgrade" ${disabled}>
        <div class="popover-upgrade-row">
          <span class="popover-upgrade-arrow">▲</span>
          <span class="popover-upgrade-to">${next.label}</span>
          <span class="popover-upgrade-cost">◈ ${next.cost}</span>
        </div>
        <div class="popover-upgrade-sub">UPGRADE → ${stars}</div>
      </button>
    `;
  }

  private maxBtnHtml(): string {
    return `
      <div class="popover-max">
        <span>✦</span> MAX TIER REACHED <span>✦</span>
      </div>
    `;
  }

  /**
   * Position the popover element in viewport coords. Anchors to the tower's
   * right shoulder, then clamps inside the viewport so the card never spills
   * off-screen (matters when the player builds in the bottom-right corner).
   */
  private position(tower: Tower): void {
    if (!this.el) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;

    const towerScreenX = rect.left + (tower.pos.x + TILE / 2) * scaleX;
    const towerScreenY = rect.top + (tower.pos.y - TILE) * scaleY;

    // Measure card so we can clamp. Width is set in CSS (240); fall back to
    // a sensible default if styles haven't applied yet.
    const cardW = this.el.offsetWidth || 240;
    const cardH = this.el.offsetHeight || 200;

    const margin = 8;
    let left = towerScreenX + 12;
    let top = towerScreenY - cardH / 2;
    if (left + cardW + margin > window.innerWidth) {
      // Flip to the tower's left side.
      left = rect.left + (tower.pos.x - TILE / 2) * scaleX - cardW - 12;
    }
    if (left < margin) left = margin;
    if (top + cardH + margin > window.innerHeight) {
      top = window.innerHeight - cardH - margin;
    }
    if (top < margin) top = margin;

    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  /**
   * Pact effects affect the displayed stats, so a change requires a full
   * rebuild. We don't compare by reference because callers may pass a fresh
   * object; cheap structural key works fine.
   */
  private effectsKey(effects: PactEffects): string {
    return `${effects.towerDamageMult.toFixed(3)}|${effects.towerRangeMult.toFixed(3)}`;
  }
}

function fmtNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}`;
  return n.toFixed(1);
}

function formatDelta(n: number): string {
  const abs = Math.abs(n);
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}`;
  return abs < 1 ? n.toFixed(2) : n.toFixed(1);
}
