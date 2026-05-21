/**
 * Sprite gallery view — `/sprites` route.
 *
 * A pure-DOM showcase of every character and boss sprite that ships with
 * the game. Mounted by {@link bootRoute} in `main.ts` when the URL path
 * matches `/sprites`. Independent of `Game` / `PactScreen` — the gallery
 * never instantiates the game loop, so heavy assets stay cold.
 *
 * Source of truth:
 * - {@link HEROES}        — `src/heroes.ts`
 * - {@link ENEMY_DEFS}    — `src/config.ts`
 * - {@link TOWER_DEFS}    — `src/config.ts`
 * - {@link SPRITES_16}    — `src/sprites.ts`
 *
 * Adding new content to the registries above automatically appears here
 * — the gallery iterates the registries directly, no parallel list to
 * keep in sync.
 */

import {
  BOSS_PHASE2_SPEED_MULT,
  BOSS_PHASE2_TINT,
  ENEMY_DEFS,
  TOWER_DEFS,
  isBossKind,
  type EnemyKind,
  type TowerKind,
} from "./config.ts";
import { HEROES, HERO_KINDS, type HeroKind } from "./heroes.ts";
import { getSprite } from "./sprites.ts";

/**
 * Lives lost when this kind reaches the castle. Mirrors `BREACH_LIFE_COST`
 * in `src/game.ts` — duplicated here so the gallery stays decoupled from
 * the game loop. If the canonical table changes, update this one too.
 */
const BREACH_COST: Partial<Record<EnemyKind, number>> = {
  skeleton: 3,
  dragon: 5,
  hollow_warden: 8,
  brood_mother: 12,
  cinder_lich: 16,
};

/** Pretty-printer for an enemy kind id (e.g. `hollow_warden` → `Hollow Warden`). */
function titleCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Player-facing label for enemies. Bosses keep their dramatic article;
 * the wraith uses its in-fiction name rather than its sprite id `ghost`. */
function enemyLabel(kind: EnemyKind): string {
  switch (kind) {
    case "hollow_warden":
      return "The Hollow Warden";
    case "brood_mother":
      return "The Brood Mother";
    case "cinder_lich":
      return "The Cinder Lich";
    case "wraith":
      return "Wraith";
    default:
      return titleCase(kind);
  }
}

/** Render scale (logical px → screen px). 6× for normal sprites, 10× for
 * bosses so the silhouette reads at the size they earn in-game. */
const SCALE_NORMAL = 6;
const SCALE_BOSS = 10;
const SCALE_TOWER = 6;

/** Build a single sprite tile (canvas wrapped in a card). The caller supplies
 * any stats / labels — this helper handles the pixel-art chrome only. */
function makeSpriteTile(spriteName: string, scale: number, glow?: string): HTMLDivElement {
  const tile = document.createElement("div");
  tile.className = "sg-sprite";
  const canvas = getSprite(spriteName, scale);
  // Clone into an <img> so the cached canvas isn't reparented (the cache is
  // shared with the game loop — moving the node would leak state).
  const clone = document.createElement("canvas");
  clone.width = canvas.width;
  clone.height = canvas.height;
  clone.style.imageRendering = "pixelated";
  const cctx = clone.getContext("2d");
  if (cctx) {
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(canvas, 0, 0);
  }
  tile.appendChild(clone);
  if (glow) {
    tile.style.boxShadow = `0 0 24px ${glow}55, inset 0 0 18px ${glow}22`;
    tile.style.borderColor = `${glow}66`;
  }
  return tile;
}

/** Stats row helper — one `key: value` pair styled as a tabular cell. */
function stat(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "sg-stat";
  const k = document.createElement("span");
  k.className = "sg-stat-k";
  k.textContent = label;
  const v = document.createElement("span");
  v.className = "sg-stat-v";
  v.textContent = value;
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

/** Build the hero card. */
function heroCard(kind: HeroKind): HTMLElement {
  const def = HEROES[kind];
  const card = document.createElement("article");
  card.className = "sg-card";
  card.style.setProperty("--accent", def.accent);

  card.appendChild(makeSpriteTile(def.sprite, SCALE_NORMAL, def.glow));

  const title = document.createElement("h3");
  title.className = "sg-name";
  title.textContent = def.displayName;
  card.appendChild(title);

  const flavor = document.createElement("p");
  flavor.className = "sg-flavor";
  flavor.textContent = def.tagline;
  card.appendChild(flavor);

  const stats = document.createElement("div");
  stats.className = "sg-stats";
  stats.appendChild(stat("HP", String(def.hp)));
  stats.appendChild(stat("DMG", String(def.damage)));
  stats.appendChild(stat("Range", `${def.range}px`));
  stats.appendChild(stat("Atk/s", (1 / def.attackRate).toFixed(2)));
  stats.appendChild(stat("Move", `${def.moveSpeed}t/s`));
  stats.appendChild(
    stat("Anti-air", def.canHitFlying ? "Yes" : "No"),
  );
  card.appendChild(stats);

  return card;
}

/** Build a regular-enemy card. */
function enemyCard(kind: EnemyKind): HTMLElement {
  const def = ENEMY_DEFS[kind];
  // `flying` is declared on only a subset of ENEMY_DEFS entries; the union
  // doesn't narrow to a common `flying?: boolean`. Use a runtime `in`
  // check so the gallery stays decoupled from the per-kind shape.
  const flying = "flying" in def && def.flying === true;
  const card = document.createElement("article");
  card.className = "sg-card";
  if (flying) card.classList.add("sg-flying");

  card.appendChild(makeSpriteTile(def.sprite, SCALE_NORMAL));

  const title = document.createElement("h3");
  title.className = "sg-name";
  title.textContent = enemyLabel(kind);
  card.appendChild(title);

  if (flying) {
    const tag = document.createElement("p");
    tag.className = "sg-flavor sg-flavor-flying";
    tag.textContent = "Airborne — only anti-air towers can hit.";
    card.appendChild(tag);
  }

  const stats = document.createElement("div");
  stats.className = "sg-stats";
  stats.appendChild(stat("HP", String(def.hp)));
  stats.appendChild(stat("Speed", `${def.speed}t/s`));
  stats.appendChild(stat("Bounty", `${def.bounty}g`));
  const cost = BREACH_COST[kind] ?? 1;
  stats.appendChild(stat("Breach", `${cost} ${cost === 1 ? "life" : "lives"}`));
  card.appendChild(stats);

  return card;
}

/** Build a boss card. Larger sprite, includes phase-2 enrage data. */
function bossCard(kind: EnemyKind): HTMLElement {
  const def = ENEMY_DEFS[kind];
  const tint = BOSS_PHASE2_TINT[kind] ?? "#ff6020";
  const phase2 = BOSS_PHASE2_SPEED_MULT[kind] ?? 1.0;

  const card = document.createElement("article");
  card.className = "sg-card sg-boss";
  card.style.setProperty("--accent", tint);

  card.appendChild(makeSpriteTile(def.sprite, SCALE_BOSS, tint));

  const title = document.createElement("h3");
  title.className = "sg-name sg-name-boss";
  title.textContent = enemyLabel(kind);
  card.appendChild(title);

  const stats = document.createElement("div");
  stats.className = "sg-stats";
  stats.appendChild(stat("HP", String(def.hp)));
  stats.appendChild(stat("Speed", `${def.speed}t/s`));
  stats.appendChild(stat("Bounty", `${def.bounty}g`));
  stats.appendChild(
    stat("Breach", `${BREACH_COST[kind] ?? 10} lives`),
  );
  stats.appendChild(stat("Enrage", `×${phase2.toFixed(2)} @50% HP`));
  card.appendChild(stats);

  return card;
}

/** Build a tower tier card. One card per tier (T1/T2/T3) per kind. */
function towerCard(kind: TowerKind, tierIdx: number): HTMLElement {
  const def = TOWER_DEFS[kind];
  const tier = def.tiers[tierIdx];
  const card = document.createElement("article");
  card.className = "sg-card";
  card.style.setProperty("--accent", def.accent);

  card.appendChild(makeSpriteTile(tier.sprite, SCALE_TOWER, def.accent));

  const title = document.createElement("h3");
  title.className = "sg-name";
  title.textContent = tier.label;
  card.appendChild(title);

  const sub = document.createElement("p");
  sub.className = "sg-flavor";
  sub.textContent = `${titleCase(kind)} · T${tierIdx + 1}${def.canHitFlying ? " · Anti-air" : ""}`;
  card.appendChild(sub);

  const stats = document.createElement("div");
  stats.className = "sg-stats";
  stats.appendChild(stat("Cost", `${tier.cost}g`));
  stats.appendChild(stat("DMG", String(tier.damage)));
  stats.appendChild(stat("Range", `${tier.range}px`));
  stats.appendChild(stat("Rate", `${tier.fireRate.toFixed(2)}s`));
  if ("splashRadius" in tier && tier.splashRadius !== undefined) {
    stats.appendChild(stat("Splash", `${tier.splashRadius}px`));
  }
  if ("slow" in tier && tier.slow) {
    const s = tier.slow;
    stats.appendChild(stat("Slow", `×${s.factor} / ${s.duration}s`));
  }
  card.appendChild(stats);

  return card;
}

/** Build a labelled section: heading + grid of cards. */
function section(
  id: string,
  title: string,
  blurb: string,
  cards: HTMLElement[],
): HTMLElement {
  const el = document.createElement("section");
  el.className = "sg-section";
  el.id = id;

  const head = document.createElement("header");
  head.className = "sg-section-head";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  head.appendChild(h2);
  const p = document.createElement("p");
  p.textContent = blurb;
  head.appendChild(p);
  el.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "sg-grid";
  for (const c of cards) grid.appendChild(c);
  el.appendChild(grid);

  return el;
}

/** Inline stylesheet — kept self-contained so the gallery doesn't depend on
 * `pacts.css` (the pact screen owns that file and the gallery shouldn't
 * compete for selectors). The dark backdrop matches the rest of the game. */
const STYLES = `
  .sg-root {
    min-height: 100vh;
    padding: 36px 24px 64px;
    background:
      radial-gradient(ellipse at 50% 0%, #1a1218 0%, transparent 60%),
      radial-gradient(ellipse at 80% 80%, #2a1015 0%, transparent 55%),
      radial-gradient(ellipse at 20% 70%, #1a1525 0%, transparent 55%),
      #07060a;
    color: #f0e8d0;
    font-family: "VT323", ui-monospace, Menlo, monospace;
  }
  .sg-root::before {
    content: "";
    position: fixed; inset: 0; pointer-events: none; z-index: 200;
    background-image: repeating-linear-gradient(
      0deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 1px,
      transparent 1px, transparent 3px
    );
  }
  .sg-hero {
    max-width: 1280px;
    margin: 0 auto 40px;
    text-align: center;
    padding: 16px;
  }
  .sg-hero h1 {
    font-family: "Press Start 2P", monospace;
    font-size: 28px;
    letter-spacing: 2px;
    margin: 0 0 12px;
    color: #f5d676;
    text-shadow: 0 0 14px rgba(245, 214, 118, 0.4);
  }
  .sg-hero p {
    font-size: 20px;
    color: #b8b0a0;
    margin: 0;
  }
  .sg-nav {
    max-width: 1280px;
    margin: 0 auto 40px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }
  .sg-nav a {
    font-family: "Press Start 2P", monospace;
    font-size: 11px;
    letter-spacing: 1.2px;
    color: #f0e8d0;
    text-decoration: none;
    padding: 10px 16px;
    border: 1px solid #3a2820;
    background: rgba(20, 14, 18, 0.7);
    transition: all 0.15s ease;
  }
  .sg-nav a:hover {
    background: rgba(60, 40, 50, 0.85);
    border-color: #c98a3a;
    color: #f5d676;
  }
  .sg-section {
    max-width: 1280px;
    margin: 0 auto 56px;
  }
  .sg-section-head {
    border-bottom: 1px solid #3a2820;
    padding: 0 8px 12px;
    margin-bottom: 24px;
  }
  .sg-section-head h2 {
    font-family: "Press Start 2P", monospace;
    font-size: 18px;
    letter-spacing: 1.5px;
    color: #f5d676;
    margin: 0 0 6px;
  }
  .sg-section-head p {
    font-size: 17px;
    color: #948878;
    margin: 0;
  }
  .sg-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 18px;
  }
  .sg-card {
    --accent: #6a6262;
    background: linear-gradient(180deg, rgba(28,20,24,0.92) 0%, rgba(14,10,12,0.94) 100%);
    border: 1px solid #3a2820;
    border-top: 2px solid var(--accent);
    padding: 18px 16px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: transform 0.12s ease, border-color 0.12s ease;
  }
  .sg-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }
  .sg-card.sg-boss {
    grid-column: span 2;
    background: linear-gradient(180deg, rgba(40,20,24,0.92) 0%, rgba(18,8,12,0.96) 100%);
    border-top-width: 3px;
  }
  .sg-sprite {
    width: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.02) 25%, transparent 25%) 0 0/20px 20px,
      linear-gradient(225deg, rgba(255,255,255,0.02) 25%, transparent 25%) 0 0/20px 20px,
      #14101a;
    border: 1px solid #2a1820;
  }
  .sg-sprite canvas {
    max-width: 80%;
    max-height: 80%;
    width: auto;
    height: auto;
  }
  .sg-card.sg-boss .sg-sprite canvas {
    max-width: 90%;
    max-height: 90%;
  }
  .sg-name {
    font-family: "Press Start 2P", monospace;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--accent, #f0e8d0);
    margin: 0 0 6px;
    text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .sg-name-boss {
    font-size: 13px;
    color: var(--accent);
  }
  .sg-flavor {
    font-size: 16px;
    color: #948878;
    font-style: italic;
    margin: 0 0 10px;
    min-height: 1.2em;
  }
  .sg-flavor-flying {
    color: #7ac0e8;
  }
  .sg-stats {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    margin-top: 4px;
  }
  .sg-stat {
    display: flex;
    justify-content: space-between;
    font-size: 16px;
    padding: 2px 0;
    border-bottom: 1px dotted rgba(120, 100, 90, 0.2);
  }
  .sg-stat-k {
    color: #948878;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.5px;
    padding-top: 2px;
  }
  .sg-stat-v {
    color: #f0e8d0;
    font-weight: bold;
  }
  .sg-back {
    display: inline-block;
    margin-top: 8px;
    font-family: "Press Start 2P", monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: #c98a3a;
    text-decoration: none;
    padding: 8px 14px;
    border: 1px solid #c98a3a;
  }
  .sg-back:hover {
    background: rgba(201, 138, 58, 0.15);
  }
  @media (max-width: 640px) {
    .sg-hero h1 { font-size: 20px; }
    .sg-card.sg-boss { grid-column: span 1; }
  }
`;

/**
 * Render the full sprite gallery into `root`. Idempotent — wipes the
 * container first so re-renders (hot reload, navigation) don't accumulate.
 */
export function renderSpriteGallery(root: HTMLElement): void {
  // Wipe any prior content (defensive — `main.ts` mounts into a freshly-
  // emptied stage, but a stray re-call shouldn't double the gallery).
  root.innerHTML = "";
  root.className = "sg-root";

  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  // Title block
  const heroEl = document.createElement("div");
  heroEl.className = "sg-hero";
  heroEl.innerHTML = `
    <h1>PACTKEEPER — SPRITE GALLERY</h1>
    <p>Every hero, foe, and tower in the realms.</p>
    <p style="margin-top:14px"><a class="sg-back" href="/">← Return to the Altar</a></p>
  `;
  root.appendChild(heroEl);

  // Anchor nav so users can jump between sections quickly
  const nav = document.createElement("nav");
  nav.className = "sg-nav";
  nav.innerHTML = `
    <a href="#heroes">Heroes</a>
    <a href="#enemies">Enemies</a>
    <a href="#bosses">Bosses</a>
    <a href="#towers">Towers</a>
  `;
  root.appendChild(nav);

  // Heroes — iterate the canonical display order from heroes.ts
  root.appendChild(
    section(
      "heroes",
      "Heroes",
      "Player-controlled champions, chosen at the altar before each run.",
      HERO_KINDS.map((k) => heroCard(k)),
    ),
  );

  // Enemies — non-boss kinds, in roster order so additions show up naturally
  const enemyKinds = (Object.keys(ENEMY_DEFS) as EnemyKind[]).filter(
    (k) => !isBossKind(k),
  );
  root.appendChild(
    section(
      "enemies",
      "Enemies",
      "The trash that fills the waves. Heavier wave-by-wave; deadlier realm-by-realm.",
      enemyKinds.map((k) => enemyCard(k)),
    ),
  );

  // Bosses — each realm closes on one
  const bossKinds = (Object.keys(ENEMY_DEFS) as EnemyKind[]).filter((k) =>
    isBossKind(k),
  );
  root.appendChild(
    section(
      "bosses",
      "Realm Bosses",
      "The final wave of each realm. 2× sprite scale in-game; enrages at half HP.",
      bossKinds.map((k) => bossCard(k)),
    ),
  );

  // Towers — every kind × every tier
  const towerCards: HTMLElement[] = [];
  for (const kind of Object.keys(TOWER_DEFS) as TowerKind[]) {
    for (let i = 0; i < TOWER_DEFS[kind].tiers.length; i++) {
      towerCards.push(towerCard(kind, i));
    }
  }
  root.appendChild(
    section(
      "towers",
      "Towers",
      "Three kinds, three tiers each — the upgrade silhouette reads at a glance.",
      towerCards,
    ),
  );
}
