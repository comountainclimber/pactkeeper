// DOM-rendered pact selection screen. Mounts/unmounts on the #pact-stage
// element; calls onSeal(selectedPacts) when the player commits.
//
// Architecture: pact screen lives in DOM (so we can use CSS animations,
// gradients, color-mix, and real fonts that the design depends on). The
// in-game play screen stays in canvas. Game state toggles which is visible.

import "./pacts.css";
import { PACTS } from "./modifiers.ts";
import { renderSigilSvg } from "./sigils.ts";
import {
  clearScores,
  loadName,
  loadScores,
  saveScore,
  type ScoreEntry,
} from "./score.ts";
import { HEROES, HERO_KINDS, isHeroKind, type HeroKind } from "./heroes.ts";
import { getSprite } from "./sprites.ts";
import type { Pact, PactSchool } from "./types.ts";
import type { RunSummary } from "./game.ts";

const MAX_PACTS = 3;
const NAME_MAX_LEN = 12;
const HALL_DEFAULT_VISIBLE = 3;
const HALL_EXPANDED_VISIBLE = 10;

type TabId = "pacts" | "hall";

type TabDef = {
  id: TabId;
  label: string;
  glyph: string;
  sub: (n: number) => string;
};

const TABS: readonly TabDef[] = [
  { id: "pacts", label: "THE LIBRARY", glyph: "❖", sub: () => "Choose your pacts" },
  { id: "hall",  label: "THE HALL",    glyph: "✦", sub: (n) => (n > 0 ? `${n} inscribed` : "Empty") },
];

const SCHOOL_COLOR: Record<PactSchool, string> = {
  TRIAL: "#c98a3a",
  WAGER: "#7ad4e8",
  BOON: "#5a8a3a",
  CURSE: "#c93a3a",
};

type Realm = {
  id: 1 | 2 | 3;
  name: string;
  boss: string;
  accent: string;
  portal: string;
  tier: string;
};

const REALMS: readonly Realm[] = [
  { id: 1, name: "Embergrass Pass",  boss: "The Hollow Warden",
    accent: "#5a8a3a", portal: "#6b3a8a", tier: "NOVICE" },
  { id: 2, name: "Hollowmere Mire",  boss: "The Brood Mother",
    accent: "#5a8a8a", portal: "#3a5868", tier: "PERILOUS" },
  { id: 3, name: "Ashen Reach",      boss: "The Cinder Lich",
    accent: "#c93a3a", portal: "#c93a3a", tier: "ABYSSAL" },
];

type Listener = (chosen: Pact[], heroKind: HeroKind) => void;

/** localStorage key for persisting the player's last-chosen hero across runs. */
const HERO_STORAGE_KEY = "pk-hero";

/** Default hero when no preference is saved or the saved value is junk. */
const DEFAULT_HERO: HeroKind = "knight";

export class PactScreen {
  private root: HTMLElement;
  private selectedIds: string[] = [];
  private listener: Listener | null = null;
  private mounted = false;
  private sealing = false;
  private tab: TabId = "pacts";
  private hallExpanded = false;
  private pending: RunSummary | null = null;
  private inscriptionName = "";
  private selectedHero: HeroKind = DEFAULT_HERO;
  // True for one render cycle after a real tab switch so `updateTabContent`
  // can opt the fresh tab body into the `.tab-anim` fade. Toggling pacts
  // does *not* set this flag, so the library no longer re-fades on every
  // click — the source of the screen-flicker.
  private tabJustSwitched = false;
  // Snapshot of which pact ids are in altar slots 0..2 after the last full
  // render. `updateSelections()` diffs against this so it only rebuilds the
  // slots that actually changed (avoiding `slot-pop` animation replays on
  // unchanged sigils).
  private lastAltarPacts: (string | null)[] = [null, null, null];

  constructor(stage: HTMLElement) {
    this.root = stage;
  }

  onSeal(fn: Listener): void {
    this.listener = fn;
  }

  /**
   * Mount and show the screen. If a `pending` run summary is passed (set by
   * `main.ts` after a level ends), the inscription overlay is rendered on
   * top of the Hall tab so the player can save their score.
   */
  show(pending?: RunSummary): void {
    this.selectedIds = [];
    this.sealing = false;
    this.tab = "pacts";
    this.tabJustSwitched = true;
    this.hallExpanded = false;
    this.pending = pending ?? null;
    this.inscriptionName = loadName() || "KEEPER";
    this.selectedHero = loadHeroPreference();
    // Clear any stale inscription state from a prior show() so the next
    // updateInscription() call rebuilds the overlay markup.
    const stale = this.root.querySelector<HTMLElement>("[data-inscription]");
    if (stale) {
      delete stale.dataset.rendered;
      stale.innerHTML = "";
    }
    this.mount();
    // Both effects below run with `animation: ... forwards`, so they persist
    // at their final keyframe after the seal transition completes. Without
    // resetting them, re-showing the pact screen after a run leaves the
    // `.seal-flash` element opaque-black on top of everything (z-index 9999,
    // above the inscription overlay's 9000) and the `.frame` invisible from
    // the post-seal blur+fade. The score breakdown briefly animates in, then
    // is masked — which reads as a "flicker" before the user sees only black.
    const flash = this.root.querySelector<HTMLElement>("[data-flash]");
    if (flash) flash.hidden = true;
    const scene = this.root.querySelector<HTMLElement>(".scene");
    if (scene) scene.classList.remove("sealing");
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
          <div class="hero-picker" data-hero-picker></div>
          <div class="altar" data-altar></div>

          <div class="tabs" data-tabs></div>
          <div data-tab role="tabpanel" tabindex="0"></div>

          <div class="footer" data-footer></div>
        </div>

        <div class="scanlines"></div>
        <div class="seal-flash" data-flash hidden></div>
        <div class="inscription-overlay" data-inscription hidden></div>
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
    this.updateHeroPicker();
    this.updateAltar();
    this.updateTabs();
    this.updateTabContent();
    this.updateFooter();
    this.updateInscription();
  }

  /**
   * Render the hero picker strip — three cards (Knight / Archer / Frost
   * Mage) shown right below the title. Selection is persisted in
   * localStorage so the picker remembers the player's last champion.
   */
  private updateHeroPicker(): void {
    const el = this.root.querySelector<HTMLElement>("[data-hero-picker]");
    if (!el) return;
    el.innerHTML = `
      <div class="hero-picker-rule">
        <div class="hero-picker-rule-line"></div>
        <div class="hero-picker-rule-mark">— CHOOSE THY CHAMPION —</div>
        <div class="hero-picker-rule-line"></div>
      </div>
      <div class="hero-picker-grid">
        ${HERO_KINDS.map((kind) => this.heroCardHtml(kind)).join("")}
      </div>
    `;
  }

  private heroCardHtml(kind: HeroKind): string {
    const def = HEROES[kind];
    const selected = this.selectedHero === kind;
    // Render the 16×16 sprite at scale 6 (96×96) for a chunky pixel-art
    // portrait. Cached by getSprite, so this is essentially free after the
    // first call.
    const portrait = getSprite(def.sprite, 6).toDataURL();
    // Compact stat readout — HP and a role tag based on attack kind.
    const role =
      def.attackKind === "melee"
        ? "MELEE"
        : def.attackKind === "ranged-slow"
          ? "FROST"
          : "RANGED";
    return `
      <button
        class="hero-card ${selected ? "chosen" : ""}"
        data-hero="${kind}"
        style="--accent:${def.accent};--hi:${def.hi};--glow:${def.glow}"
      >
        <div class="hero-card-aura"></div>
        <div class="hero-card-frame">
          <div class="hero-card-portrait">
            <img src="${portrait}" alt="${def.displayName}" />
          </div>
          <div class="hero-card-name">${def.displayName}</div>
          <div class="hero-card-tagline">"${def.tagline}"</div>
          <div class="hero-card-stats">
            <span class="hero-card-tag">${role}</span>
            <span class="hero-card-sep">·</span>
            <span class="hero-card-hp">♥ ${def.hp}</span>
          </div>
        </div>
        ${selected ? `<div class="hero-card-chosen-mark">✦ CHOSEN ✦</div>` : ""}
      </button>
    `;
  }

  private chooseHero(kind: HeroKind): void {
    if (this.selectedHero === kind) return;
    this.selectedHero = kind;
    saveHeroPreference(kind);
    this.sfx("heroSelect");
    this.updateHeroPicker();
  }

  private updateTabs(): void {
    const el = this.root.querySelector<HTMLElement>("[data-tabs]");
    if (!el) return;
    el.setAttribute("role", "tablist");
    const scoreCount = loadScores().length;
    el.innerHTML = TABS.map(
      (t) => {
        const active = this.tab === t.id;
        // Roving tabindex per the WAI-ARIA tablist pattern: only the active
        // tab is in the document tab order; ArrowLeft/Right/Home/End move
        // between siblings (see the keydown handler in `bindEvents`).
        return `
          <button
            id="pact-tab-${t.id}"
            class="tab ${active ? "on" : ""}"
            data-tab-id="${t.id}"
            role="tab"
            aria-selected="${active}"
            aria-controls="pact-tabpanel"
            tabindex="${active ? 0 : -1}"
          >
            <span class="tab-glyph">${t.glyph}</span>
            <span class="tab-main">
              <span class="tab-label">${t.label}</span>
              <span class="tab-sub">${t.sub(scoreCount)}</span>
            </span>
          </button>
        `;
      },
    ).join("");
  }

  private updateTabContent(): void {
    const el = this.root.querySelector<HTMLElement>("[data-tab]");
    if (!el) return;
    el.id = "pact-tabpanel";
    el.setAttribute("aria-labelledby", `pact-tab-${this.tab}`);
    if (this.tab === "pacts") {
      el.innerHTML = this.libraryHtml();
    } else {
      el.innerHTML = this.hallHtml();
    }
    // Only fade the panel in when the user actually switched tabs.
    // Toggling pacts re-renders the library through different code paths
    // (see `updateSelections`) so this guard is what kills the flicker.
    if (this.tabJustSwitched) {
      const wrapper = el.firstElementChild as HTMLElement | null;
      wrapper?.classList.add("tab-anim");
      this.tabJustSwitched = false;
    }
  }

  // Switch tabs and keep keyboard focus on the freshly-active tab button.
  // Called from both pointer clicks (in `bindEvents`) and arrow-key
  // navigation, so the focus follow-up is centralized here.
  //
  // We deliberately *do not* call `update()` here. Re-rendering the header,
  // altar, and footer on every tab click replays their CSS animations
  // (ornament glow, slot-pop, ready-pulse, …) which compounded into a full
  // screen flicker. Tabs only need the tab strip + panel updated.
  private setTab(next: TabId): void {
    if (next === this.tab) return;
    this.tab = next;
    if (next !== "hall") this.hallExpanded = false;
    this.tabJustSwitched = true;
    this.sfx("tick");
    this.updateTabs();
    this.updateTabContent();
    this.root
      .querySelector<HTMLElement>(`[data-tab-id="${next}"]`)
      ?.focus();
  }

  private libraryHtml(): string {
    // No library-rule divider inside the tab — the tab label itself is the
    // heading. Matches design's `App` render branch for `tab === 'pacts'`.
    return `
      <div class="library">
        <div class="pact-grid">
          ${PACTS.map((p) => this.cardHtml(p)).join("")}
        </div>
      </div>
    `;
  }

  private hallHtml(): string {
    const scores = loadScores();
    if (scores.length === 0) {
      return `
        <div class="hall-section">
          <div class="library-rule" style="margin:0 8px 16px">
            <div class="library-rule-line"></div>
            <div class="library-rule-mark">— THE HALL OF KEEPERS —</div>
            <div class="library-rule-line"></div>
          </div>
          <div class="hall-empty">
            <div class="hall-empty-glyph">☥</div>
            <div class="hall-empty-title">THE HALL IS EMPTY</div>
            <div class="hall-empty-sub">
              No keeper has yet sealed the pacts and walked the three realms.<br />
              Be the first to inscribe your name.
            </div>
          </div>
        </div>
      `;
    }
    const visibleCount = this.hallExpanded
      ? Math.min(scores.length, HALL_EXPANDED_VISIBLE)
      : Math.min(scores.length, HALL_DEFAULT_VISIBLE);
    const visible = scores.slice(0, visibleCount);
    const rows = visible.map((s, i) => this.hallRowHtml(s, i + 1)).join("");
    const moreAvailable = scores.length > HALL_DEFAULT_VISIBLE;
    const collapseLabel = this.hallExpanded
      ? "▲ COLLAPSE"
      : `▼ SHOW MORE (${Math.min(scores.length, HALL_EXPANDED_VISIBLE) - HALL_DEFAULT_VISIBLE})`;
    return `
      <div class="hall-section">
        <div class="library-rule" style="margin:0 8px 16px">
          <div class="library-rule-line"></div>
          <div class="library-rule-mark">— THE HALL OF KEEPERS —</div>
          <div class="library-rule-line"></div>
        </div>
        <div class="hall-grid">${rows}</div>
        <div class="hall-actions">
          ${
            moreAvailable
              ? `<button class="hall-toggle" data-action="hall-toggle">${collapseLabel}</button>`
              : ""
          }
          <button class="hall-toggle hall-clear" data-action="hall-clear">✕ ERASE HALL</button>
        </div>
      </div>
    `;
  }

  private hallRowHtml(s: ScoreEntry, rank: number): string {
    const isVictory = s.outcome === "victory";
    const cls = `hall-row ${isVictory ? "win" : "loss"} ${rank === 1 ? "gold" : ""}`;
    const mult = Number.isFinite(s.multiplier) ? s.multiplier : 1;
    return `
      <div class="${cls}">
        <div class="hall-rank">#${rank}</div>
        <div class="hall-name">
          <span class="hall-icon">${isVictory ? "✦" : "☠"}</span>
          ${escapeHtml(s.name)}
        </div>
        <div class="hall-score">${s.score.toLocaleString()}</div>
        <div class="hall-meta">
          <span class="hall-pacts">${s.pacts.length} pacts · ×${mult.toFixed(2)}</span>
          <span class="hall-realm">Realm ${s.level}/3</span>
        </div>
      </div>
    `;
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
    // Keep the surgical-update snapshot aligned with what's now in the DOM
    // so the next `updateSelections` only rebuilds slots that actually
    // changed. Without this, the first surgical pass would diff against
    // stale `null`s and rebuild every filled slot (replaying `slot-pop`).
    this.snapshotAltarPacts();
  }

  private snapshotAltarPacts(): void {
    this.lastAltarPacts = [
      this.selectedIds[0] ?? null,
      this.selectedIds[1] ?? null,
      this.selectedIds[2] ?? null,
    ];
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
    // Use delegation since we rebuild innerHTML on every update. Inscription
    // overlay is mounted under the same root, so its buttons + input flow
    // through the same listeners.
    this.root.addEventListener("click", (e) => {
      if (this.sealing) return;
      const t = e.target as HTMLElement;

      // Inscription buttons take priority since the overlay sits above
      // everything else and intercepts clicks while open.
      const inscriptionAction = t.closest<HTMLElement>(
        "[data-inscription-action]",
      );
      if (inscriptionAction) {
        const a = inscriptionAction.getAttribute("data-inscription-action");
        if (a === "inscribe") this.inscribe();
        else if (a === "decline") this.declineInscription();
        return;
      }
      // Block all other clicks while the inscription overlay is up.
      if (this.pending) return;

      const tabBtn = t.closest<HTMLElement>("[data-tab-id]");
      if (tabBtn) {
        const id = tabBtn.getAttribute("data-tab-id") as TabId | null;
        if (id) this.setTab(id);
        return;
      }

      const heroBtn = t.closest<HTMLElement>("[data-hero]");
      if (heroBtn) {
        const kind = heroBtn.getAttribute("data-hero");
        if (isHeroKind(kind)) this.chooseHero(kind);
        return;
      }

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
        else if (a === "hall-toggle") this.toggleHall();
        else if (a === "hall-clear") this.clearHall();
      }
    });

    // Name input: uppercase as the player types and persist locally so the
    // value survives any re-render of the overlay.
    this.root.addEventListener("input", (e) => {
      const t = e.target as HTMLElement;
      if (t.matches("[data-inscription-name]")) {
        const input = t as HTMLInputElement;
        const upper = input.value.toUpperCase().slice(0, NAME_MAX_LEN);
        if (upper !== input.value) input.value = upper;
        this.inscriptionName = upper;
      }
    });

    this.root.addEventListener("keydown", (e) => {
      // Inscription keyboard shortcuts when the overlay is open: Escape
      // dismisses; Enter inside the name input submits.
      if (this.pending) {
        if (e.key === "Escape") {
          e.preventDefault();
          this.declineInscription();
          return;
        }
        if (e.key !== "Enter") return;
        const t = e.target as HTMLElement;
        if (t.matches("[data-inscription-name]")) {
          e.preventDefault();
          this.inscribe();
        }
        return;
      }

      // Tablist arrow-key navigation (WAI-ARIA tablist pattern). Only fires
      // when the focused element is a tab button.
      const tabBtn = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-tab-id]",
      );
      if (!tabBtn) return;
      if (
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight" &&
        e.key !== "Home" &&
        e.key !== "End"
      ) {
        return;
      }
      e.preventDefault();
      const idx = TABS.findIndex((t) => t.id === this.tab);
      const nextIdx =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? TABS.length - 1
            : e.key === "ArrowLeft"
              ? (idx - 1 + TABS.length) % TABS.length
              : (idx + 1) % TABS.length;
      this.setTab(TABS[nextIdx].id);
    });

    this.update();
  }

  private sfx(name: keyof PactkeeperSFXInstance): void {
    window.PactkeeperSFX?.[name]();
  }

  private toggle(id: string): void {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) {
      this.selectedIds.splice(i, 1);
      this.sfx("tick");
    } else if (this.selectedIds.length < MAX_PACTS) {
      this.selectedIds.push(id);
      this.sfx("wax");
    } else {
      return;
    }
    this.updateSelections();
  }

  private removePact(id: string): void {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) {
      this.selectedIds.splice(i, 1);
      this.sfx("tick");
      this.updateSelections();
    }
  }

  private clearAll(): void {
    const had = this.selectedIds.length > 0;
    this.selectedIds = [];
    if (had) this.sfx("thud");
    this.updateSelections();
  }

  // Surgical update path used whenever pact selection changes. We mutate
  // the existing DOM in place rather than blowing away innerHTML so the
  // already-running CSS animations (`ornament-glow`, `pip-on`,
  // `ready-pulse`, `aura-pulse`, `slot-pop` on unchanged slots, etc.)
  // keep playing without restarting. Restarting them all at once is what
  // produced the screen flicker.
  private updateSelections(): void {
    this.updateProgressInPlace();
    this.updateAltarSlotsInPlace();
    this.updateLibraryCardsInPlace();
    this.updateFooterTextInPlace();
  }

  private updateProgressInPlace(): void {
    const count = this.selectedIds.length;
    const pips = this.root.querySelectorAll<HTMLElement>(
      ".progress-pip-row .progress-pip",
    );
    pips.forEach((pip, i) => {
      const on = i < count;
      pip.classList.toggle("on", on);
      pip.textContent = on ? "●" : "○";
    });
    const numEl = this.root.querySelector<HTMLElement>(".progress-num");
    if (numEl) numEl.textContent = String(count);
  }

  private updateAltarSlotsInPlace(): void {
    const slotsEl = this.root.querySelector<HTMLElement>(".altar-slots");
    if (!slotsEl) {
      this.updateAltar();
      return;
    }
    for (let i = 0; i < 3; i++) {
      const newId = this.selectedIds[i] ?? null;
      if (this.lastAltarPacts[i] === newId) continue;
      const slot = slotsEl.children[i] as HTMLElement | undefined;
      if (!slot) continue;
      const pact = newId
        ? PACTS.find((p) => p.id === newId) ?? null
        : null;
      const tmp = document.createElement("div");
      tmp.innerHTML = this.altarSlotHtml(pact, i).trim();
      const fresh = tmp.firstElementChild;
      if (fresh) slot.replaceWith(fresh);
      this.lastAltarPacts[i] = newId;
    }
  }

  private updateLibraryCardsInPlace(): void {
    const grid = this.root.querySelector<HTMLElement>(".pact-grid");
    if (!grid) return; // not on the library tab — nothing to do
    const atMax = this.selectedIds.length >= MAX_PACTS;
    for (const p of PACTS) {
      const card = grid.querySelector<HTMLButtonElement>(
        `[data-toggle="${p.id}"]`,
      );
      if (!card) continue;
      const selected = this.selectedIds.includes(p.id);
      const locked = !selected && atMax;
      card.classList.toggle("sealed", selected);
      card.classList.toggle("locked", locked);
      card.disabled = locked;
      const seal = card.querySelector<HTMLElement>(".wax-seal");
      if (selected && !seal) {
        // `wax-stamp` keyframes play on insertion — that's the desired
        // feedback for the just-toggled card.
        card.insertAdjacentHTML("beforeend", this.waxSealHtml(p));
      } else if (!selected && seal) {
        seal.remove();
      }
    }
  }

  private updateFooterTextInPlace(): void {
    const count = this.selectedIds.length;
    const main = this.root.querySelector<HTMLElement>(".seal-btn-main");
    const sub = this.root.querySelector<HTMLElement>(".seal-btn-sub");
    const clearBtn = this.root.querySelector<HTMLButtonElement>(
      "[data-action='clear']",
    );
    if (main) {
      main.textContent =
        count === MAX_PACTS
          ? "SEAL THE PACTS"
          : count === 0
            ? "BEGIN UNBOUND"
            : `SEAL ${count} PACT${count === 1 ? "" : "S"}`;
    }
    if (sub) {
      sub.textContent =
        count === MAX_PACTS
          ? "Begin the wave — Embergrass Pass"
          : count === 0
            ? "No curses, no gifts — pure trial"
            : "Three is the binding number";
    }
    if (clearBtn) clearBtn.disabled = count === 0;
  }

  private waxSealHtml(pact: Pact): string {
    return `<div class="wax-seal">
      <div class="wax-seal-ring"></div>
      <div class="wax-seal-glyph">${renderSigilSvg(pact.sigil, "#3a0a0a", "#5a1414", "#7a2020", 2)}</div>
      <div class="wax-seal-label">SEALED</div>
    </div>`;
  }

  private reroll(): void {
    // Stub — Reroll could shuffle visible pacts from a larger pool. Today the
    // library is a fixed roster, so this just clears selections for now.
    this.clearAll();
  }

  private toggleHall(): void {
    this.hallExpanded = !this.hallExpanded;
    this.sfx("tick");
    this.updateTabContent();
  }

  private clearHall(): void {
    if (!window.confirm("Erase all scores from the Hall?")) return;
    clearScores();
    this.hallExpanded = false;
    this.sfx("thud");
    // Tab strip carries the "(n) inscribed" count, so re-render both.
    this.updateTabs();
    this.updateTabContent();
  }

  // --- Inscription overlay ---

  private updateInscription(): void {
    const el = this.root.querySelector<HTMLElement>("[data-inscription]");
    if (!el) return;
    if (!this.pending) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    // Avoid blowing away the input mid-edit on subsequent renders. Only
    // (re)build the markup once per `show()` cycle.
    if (el.dataset.rendered !== "true") {
      el.innerHTML = this.inscriptionHtml(this.pending);
      el.dataset.rendered = "true";
      // Focus the name field so the player can start typing immediately.
      // The HTML `value` attribute already prefills the name; we just need
      // to wait a frame for layout so `focus()` / `select()` take effect.
      window.requestAnimationFrame(() => {
        const input = el.querySelector<HTMLInputElement>(
          "[data-inscription-name]",
        );
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
    el.hidden = false;
  }

  private inscriptionHtml(s: RunSummary): string {
    const victory = s.outcome === "victory";
    const realm = REALMS.find((r) => r.id === (s.level as 1 | 2 | 3));
    const realmLabel = realm ? `Realm ${s.level}/3 — ${realm.name}` : `Realm ${s.level}/3`;
    const title = victory
      ? "✦ THE PACTS ARE KEPT ✦"
      : "☠ THE PACTS ARE BROKEN ☠";
    const f = s.finalized;
    const rows: string[] = [];
    rows.push(this.inscriptionRow("RAW", f.raw.toLocaleString()));
    if (f.lifeBonus > 0) {
      rows.push(this.inscriptionRow("LIFE BONUS", `+${f.lifeBonus.toLocaleString()}`));
    }
    if (f.multiplier > 1) {
      rows.push(this.inscriptionRow("MULTIPLIER", `×${f.multiplier.toFixed(2)}`));
    }
    const outcomeClass = victory ? "victory" : "defeat";
    const defaultName = escapeHtml(this.inscriptionName || "KEEPER");
    return `
      <div class="inscription-backdrop" aria-hidden="true"></div>
      <div class="inscription-card ${outcomeClass}" role="dialog" aria-modal="true" aria-labelledby="inscription-title">
        <div class="inscription-corner tl"></div>
        <div class="inscription-corner tr"></div>
        <div class="inscription-corner bl"></div>
        <div class="inscription-corner br"></div>

        <div class="inscription-header" id="inscription-title">${title}</div>
        <div class="inscription-realm">${escapeHtml(realmLabel)}</div>

        <div class="inscription-breakdown">
          ${rows.join("")}
          <div class="inscription-rule"></div>
          <div class="inscription-row final">
            <span class="inscription-row-label">FINAL SCORE</span>
            <span class="inscription-row-value big">${f.final.toLocaleString()}</span>
          </div>
        </div>

        <div class="inscription-meta">
          <span>KILLS ${s.kills}</span>
          <span class="inscription-meta-dot">·</span>
          <span>${s.pactIds.length} PACT${s.pactIds.length === 1 ? "" : "S"}</span>
          ${s.livesLeft > 0 ? `<span class="inscription-meta-dot">·</span><span>LIVES ${s.livesLeft}</span>` : ""}
        </div>

        <div class="inscription-name-row">
          <label class="inscription-name-label" for="inscription-name-input">INSCRIBE THY NAME</label>
          <input
            id="inscription-name-input"
            class="inscription-name-input"
            data-inscription-name
            type="text"
            maxlength="${NAME_MAX_LEN}"
            value="${defaultName}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <div class="inscription-actions">
          <button class="inscription-btn primary" data-inscription-action="inscribe">
            ✦ INSCRIBE INTO THE HALL ✦
          </button>
          <button class="inscription-btn ghost" data-inscription-action="decline">
            ✕ DECLINE
          </button>
        </div>
      </div>
    `;
  }

  private inscriptionRow(label: string, value: string): string {
    return `
      <div class="inscription-row">
        <span class="inscription-row-label">${label}</span>
        <span class="inscription-row-value">${value}</span>
      </div>
    `;
  }

  private inscribe(): void {
    const s = this.pending;
    if (!s) return;
    saveScore({
      name: this.inscriptionName || "KEEPER",
      outcome: s.outcome,
      level: s.level,
      pacts: s.pactIds,
      pactXp: s.pactXp,
      kills: s.kills,
      livesLeft: s.livesLeft,
      multiplier: s.finalized.multiplier,
      score: s.finalized.final,
    });
    this.sfx("seal");
    this.dismissInscription();
    this.tab = "hall";
    this.hallExpanded = false;
    this.tabJustSwitched = true;
    // Same rationale as `setTab` — only the tab strip + panel need to
    // change after inscribing. Re-rendering the rest replays animations.
    this.updateTabs();
    this.updateTabContent();
  }

  private declineInscription(): void {
    this.sfx("thud");
    // `dismissInscription` already hides the overlay; nothing else on the
    // pact screen depends on `pending`, so a full re-render would just
    // restart all the ambient animations for no visible benefit.
    this.dismissInscription();
  }

  private dismissInscription(): void {
    this.pending = null;
    const el = this.root.querySelector<HTMLElement>("[data-inscription]");
    if (el) {
      el.hidden = true;
      el.innerHTML = "";
      delete el.dataset.rendered;
    }
  }

  private seal(): void {
    if (this.sealing) return;
    this.sealing = true;
    const chosen = this.selectedIds.map(
      (id) => PACTS.find((p) => p.id === id)!,
    );
    const hero = this.selectedHero;
    this.sfx("seal");
    // Trigger flash animation, then commit.
    const flash = this.root.querySelector<HTMLElement>("[data-flash]");
    const scene = this.root.querySelector<HTMLElement>(".scene");
    if (flash) flash.hidden = false;
    if (scene) scene.classList.add("sealing");
    try {
      localStorage.setItem("pk-level", "1");
    } catch {
      // localStorage may be unavailable in private-mode; non-fatal.
    }
    window.setTimeout(() => {
      this.listener?.(chosen, hero);
    }, 1100);
  }
}

// --- Hero preference persistence -----------------------------------

function loadHeroPreference(): HeroKind {
  try {
    const raw = localStorage.getItem(HERO_STORAGE_KEY);
    if (isHeroKind(raw)) return raw;
  } catch {
    /* localStorage may be unavailable */
  }
  return DEFAULT_HERO;
}

function saveHeroPreference(kind: HeroKind): void {
  try {
    localStorage.setItem(HERO_STORAGE_KEY, kind);
  } catch {
    /* non-fatal */
  }
}

// --- Helpers ---

// Escape user-controlled strings (score names, realm copy) before they go
// into innerHTML or attribute values. Keeps the existing template-string
// pattern safe.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
