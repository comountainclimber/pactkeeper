// DOM-rendered pact selection screen. Mounts/unmounts on the #pact-stage
// element; calls onSeal(selectedPacts) when the player commits.
//
// Architecture: pact screen lives in DOM (so we can use CSS animations,
// gradients, color-mix, and real fonts that the design depends on). The
// in-game play screen stays in canvas. Game state toggles which is visible.

import "./pacts.css";
import { PACTS } from "./modifiers.ts";
import { renderSigilSvg } from "./sigils.ts";
import type { Pact, PactSchool } from "./types.ts";

const MAX_PACTS = 3;

const SCHOOL_COLOR: Record<PactSchool, string> = {
  TRIAL: "#c98a3a",
  WAGER: "#7ad4e8",
  BOON: "#5a8a3a",
  CURSE: "#c93a3a",
};

type Listener = (chosen: Pact[]) => void;

export class PactScreen {
  private root: HTMLElement;
  private selectedIds: string[] = [];
  private listener: Listener | null = null;
  private mounted = false;
  private sealing = false;

  constructor(stage: HTMLElement) {
    this.root = stage;
  }

  onSeal(fn: Listener): void {
    this.listener = fn;
  }

  show(): void {
    this.selectedIds = [];
    this.sealing = false;
    this.mount();
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  // --- Internal ---

  private mount(): void {
    if (this.mounted) {
      this.update();
      return;
    }
    this.root.innerHTML = this.template();
    this.mounted = true;
    this.bindEvents();
  }

  private template(): string {
    return `
      <div class="scene">
        <div class="bg-stone"></div>
        <div class="bg-vignette"></div>
        <div class="motes">${this.motesHtml()}</div>

        ${this.candleHtml("left", "14%")}
        ${this.candleHtml("left", "62%")}
        ${this.candleHtml("right", "14%")}
        ${this.candleHtml("right", "62%")}

        <div class="frame">
          <div class="header" data-header></div>
          <div class="altar" data-altar></div>

          <div class="library">
            <div class="library-rule">
              <div class="library-rule-line"></div>
              <div class="library-rule-mark">— THE LIBRARY OF PACTS —</div>
              <div class="library-rule-line"></div>
            </div>
            <div class="pact-grid" data-grid></div>
          </div>

          <div class="footer" data-footer></div>
        </div>

        <div class="scanlines"></div>
        <div class="seal-flash" data-flash hidden></div>
      </div>
    `;
  }

  private motesHtml(): string {
    let out = "";
    for (let i = 0; i < 22; i++) {
      const left = Math.random() * 100;
      const delay = -Math.random() * 18;
      const dur = 14 + Math.random() * 10;
      const size = 1 + Math.random() * 2;
      const drift = -20 + Math.random() * 40;
      out += `<div class="mote" style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--drift:${drift}px;"></div>`;
    }
    return out;
  }

  private candleHtml(side: "left" | "right", top: string): string {
    return `
      <div class="candle candle-${side}" style="top:${top}">
        <div class="candle-flame"></div>
        <div class="candle-glow"></div>
        <div class="candle-stick"></div>
        <div class="candle-base"></div>
      </div>
    `;
  }

  private update(): void {
    this.updateHeader();
    this.updateAltar();
    this.updateGrid();
    this.updateFooter();
  }

  private updateHeader(): void {
    const el = this.root.querySelector<HTMLElement>("[data-header]");
    if (!el) return;
    const count = this.selectedIds.length;
    el.innerHTML = `
      <div class="brand">
        <div class="brand-line"></div>
        <div class="brand-name">PACTKEEPER</div>
        <div class="brand-line"></div>
      </div>
      <h1 class="title">
        <span class="title-ornament">❖</span>
        CHOOSE YOUR PACTS
        <span class="title-ornament">❖</span>
      </h1>
      <div class="subtitle">
        Seal up to <b>three</b>. Each carries a curse and a gift — or step in unbound.
      </div>
      <div class="progress">
        <div class="progress-pip-row">
          ${[0, 1, 2]
            .map(
              (i) =>
                `<div class="progress-pip ${i < count ? "on" : ""}">${i < count ? "●" : "○"}</div>`,
            )
            .join("")}
        </div>
        <div class="progress-text">
          <span class="progress-num">${count}</span>
          <span class="progress-div">/</span>
          <span class="progress-total">${MAX_PACTS}</span>
          <span class="progress-label">SEALED</span>
        </div>
      </div>
    `;
  }

  private updateAltar(): void {
    const el = this.root.querySelector<HTMLElement>("[data-altar]");
    if (!el) return;
    const selected = this.selectedIds.map(
      (id) => PACTS.find((p) => p.id === id)!,
    );
    const slots: (Pact | null)[] = [
      selected[0] ?? null,
      selected[1] ?? null,
      selected[2] ?? null,
    ];
    el.innerHTML = `
      <div class="altar-shelf">
        <div class="altar-shelf-edge top"></div>
        <div class="altar-shelf-edge bot"></div>
      </div>
      <div class="altar-slots">
        ${slots.map((p, i) => this.altarSlotHtml(p, i)).join("")}
      </div>
    `;
  }

  private altarSlotHtml(pact: Pact | null, index: number): string {
    if (!pact) {
      return `
        <div class="slot empty">
          <div class="slot-frame">
            <div class="slot-corner tl"></div>
            <div class="slot-corner tr"></div>
            <div class="slot-corner bl"></div>
            <div class="slot-corner br"></div>
            <div class="slot-inner">
              <div class="slot-rune">?</div>
              <div class="slot-empty-label">UNSEALED</div>
              <div class="slot-empty-sub">Slot ${index + 1}</div>
            </div>
          </div>
          <div class="slot-chain-l"></div>
          <div class="slot-chain-r"></div>
        </div>
      `;
    }
    return `
      <div class="slot filled">
        <div class="slot-frame">
          <div class="slot-corner tl"></div>
          <div class="slot-corner tr"></div>
          <div class="slot-corner bl"></div>
          <div class="slot-corner br"></div>
          <div class="slot-inner">
            <div class="slot-sigil-wrap" style="--accent:${pact.accent}">
              <div class="slot-sigil-aura"></div>
              ${renderSigilSvg(pact.sigil, pact.accent, pact.hi, pact.glow, 4)}
            </div>
            <div class="slot-name" style="color:${pact.accent}">${pact.name}</div>
            <button class="slot-clear" data-clear="${pact.id}" aria-label="Remove pact">BREAK</button>
          </div>
        </div>
        <div class="slot-chain-l"></div>
        <div class="slot-chain-r"></div>
      </div>
    `;
  }

  private updateGrid(): void {
    const el = this.root.querySelector<HTMLElement>("[data-grid]");
    if (!el) return;
    el.innerHTML = PACTS.map((p) => this.cardHtml(p)).join("");
  }

  private cardHtml(pact: Pact): string {
    const selected = this.selectedIds.includes(pact.id);
    const locked = !selected && this.selectedIds.length >= MAX_PACTS;
    const schoolColor = SCHOOL_COLOR[pact.school];
    return `
      <button
        class="pact ${selected ? "sealed" : ""} ${locked ? "locked" : ""}"
        data-toggle="${pact.id}"
        style="--accent:${pact.accent};--hi:${pact.hi}"
        ${locked ? "disabled" : ""}
      >
        <div class="pact-corner tl"></div>
        <div class="pact-corner tr"></div>
        <div class="pact-corner bl"></div>
        <div class="pact-corner br"></div>
        <div class="pact-tape"></div>
        <div class="pact-school" style="color:${schoolColor}">
          <span class="pact-school-dot" style="background:${schoolColor}"></span> ${pact.school}
        </div>
        <div class="pact-sigil">
          <div class="pact-sigil-glow"></div>
          ${renderSigilSvg(pact.sigil, pact.accent, pact.hi, pact.glow, 3)}
        </div>
        <div class="pact-name">${pact.name}</div>
        <div class="pact-tagline">"${pact.tagline}"</div>
        <div class="pact-divider"></div>
        <div class="pact-effect downside">
          <span class="effect-mark">−</span>
          <span class="effect-text">${pact.downside}</span>
        </div>
        <div class="pact-effect upside">
          <span class="effect-mark">+</span>
          <span class="effect-text">${pact.upside}</span>
        </div>
        ${
          selected
            ? `<div class="wax-seal">
                 <div class="wax-seal-ring"></div>
                 <div class="wax-seal-glyph">${renderSigilSvg(pact.sigil, "#3a0a0a", "#5a1414", "#7a2020", 2)}</div>
                 <div class="wax-seal-label">SEALED</div>
               </div>`
            : ""
        }
      </button>
    `;
  }

  private updateFooter(): void {
    const el = this.root.querySelector<HTMLElement>("[data-footer]");
    if (!el) return;
    const count = this.selectedIds.length;
    // House rule: pacts are optional, so the seal button is always enabled.
    // The copy adapts to the pick count.
    const mainLabel =
      count === MAX_PACTS
        ? "SEAL THE PACTS"
        : count === 0
          ? "BEGIN UNBOUND"
          : `SEAL ${count} PACT${count === 1 ? "" : "S"}`;
    const subLabel =
      count === MAX_PACTS
        ? "Begin the wave — Embergrass Pass"
        : count === 0
          ? "No curses, no gifts — pure trial"
          : "Three is the binding number";
    el.innerHTML = `
      <button class="footer-btn ghost" data-action="reroll">
        <span class="btn-glyph">↻</span> REROLL PACTS <span class="btn-meta">3 LEFT</span>
      </button>
      <button class="seal-btn ready" data-action="seal">
        <span class="seal-btn-deco left">◢</span>
        <span class="seal-btn-content">
          <span class="seal-btn-main">${mainLabel}</span>
          <span class="seal-btn-sub">${subLabel}</span>
        </span>
        <span class="seal-btn-deco right">◣</span>
      </button>
      <button class="footer-btn ghost" data-action="clear" ${count === 0 ? "disabled" : ""}>
        <span class="btn-glyph">✕</span> CLEAR ALL
      </button>
    `;
  }

  private bindEvents(): void {
    // Use delegation since we rebuild innerHTML on every update.
    this.root.addEventListener("click", (e) => {
      if (this.sealing) return;
      const t = e.target as HTMLElement;
      const card = t.closest<HTMLElement>("[data-toggle]");
      if (card) {
        const id = card.getAttribute("data-toggle")!;
        // BREAK button on altar slot delegates here too; filter that out.
        if (!t.closest("[data-clear]")) {
          this.toggle(id);
          return;
        }
      }
      const clear = t.closest<HTMLElement>("[data-clear]");
      if (clear) {
        e.stopPropagation();
        this.removePact(clear.getAttribute("data-clear")!);
        return;
      }
      const action = t.closest<HTMLElement>("[data-action]");
      if (action) {
        const a = action.getAttribute("data-action");
        if (a === "seal") this.seal();
        else if (a === "clear") this.clearAll();
        else if (a === "reroll") this.reroll();
      }
    });
    this.update();
  }

  private toggle(id: string): void {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) this.selectedIds.splice(i, 1);
    else if (this.selectedIds.length < MAX_PACTS) this.selectedIds.push(id);
    this.update();
  }

  private removePact(id: string): void {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) {
      this.selectedIds.splice(i, 1);
      this.update();
    }
  }

  private clearAll(): void {
    this.selectedIds = [];
    this.update();
  }

  private reroll(): void {
    // Stub — Reroll could shuffle visible pacts from a larger pool. Today the
    // library is a fixed roster, so this just clears selections for now.
    this.clearAll();
  }

  private seal(): void {
    if (this.sealing) return;
    this.sealing = true;
    const chosen = this.selectedIds.map(
      (id) => PACTS.find((p) => p.id === id)!,
    );
    // Trigger flash animation, then commit.
    const flash = this.root.querySelector<HTMLElement>("[data-flash]");
    const scene = this.root.querySelector<HTMLElement>(".scene");
    if (flash) flash.hidden = false;
    if (scene) scene.classList.add("sealing");
    window.setTimeout(() => {
      this.listener?.(chosen);
    }, 1100);
  }
}
