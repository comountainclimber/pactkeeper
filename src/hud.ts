import {
  CANVAS_H,
  HUD_W,
  HUD_X,
  SCALE,
  TOWER_DEFS,
  getTowerTier,
  type TowerKind,
} from "./config.ts";
import { HEROES, type HeroKind } from "./heroes.ts";
import { getSprite } from "./sprites.ts";

export type HudClick =
  | { type: "select-tower"; kind: TowerKind }
  | { type: "deselect" };

export type HudState = {
  gold: number;
  lives: number;
  wave: number; // -1 if not started; otherwise 0-indexed
  totalWaves: number;
  inWave: boolean;
  selectedTower: TowerKind | null;
  costMult: number;
  /** Running score for this run (kills + any realm-clear bonus). Pre-multiplier. */
  score: number;
  /** Pact-XP multiplier in effect right now (`1 + xp/1000`). `1` if no pacts. */
  scoreMult: number;
  /** Active realm name (e.g. "Hollowmere Mire"). Shown in header subtitle + wave status. */
  realmName: string;
  /** Number of enemies currently alive on the path. Drives the "N on the path" status. */
  enemiesAlive: number;
  /** 0-based index of the boss wave inside `WAVES` (i.e. `WAVES.length - 1`). */
  bossWaveIndex: number;
  /** Whether at least one tower is placed — toggles the "Click a placed tower
   * to upgrade it." hint. */
  hasTowers: boolean;
  /** Fraction of the current wave that has spawned, `0..1`. `0` when not in
   * a wave (pre-game or between waves). Drives the red horizontal progress
   * bar in the wave card. */
  waveProgress: number;
  /** Hero status read-out. `null` while no hero exists yet (pre-level).
   * `respawnIn` is `0` while alive, otherwise the integer seconds left
   * until respawn. */
  hero: {
    kind: HeroKind;
    hp: number;
    maxHp: number;
    alive: boolean;
    respawnIn: number;
  } | null;
};

/** Display order for tower cards in the HUD picker. Must contain every key
 * from `TOWER_DEFS`; `scripts/doc-check.ts` enforces this. */
export const TOWER_KINDS: TowerKind[] = ["arrow", "cannon", "frost"];

// Layout constants — keep magic numbers in one place so we can re-tune the HUD.
const PAD = 14;
// Realm subtitle ("— Hollowmere Mire —") is drawn top-aligned at REALM_TEXT_Y
// in an 8px italic, so its visual bottom is REALM_TEXT_Y + REALM_TEXT_H.
const REALM_TEXT_Y = 33;
const REALM_TEXT_H = 8;
// HEADER_H carries the brand title + a smaller realm subtitle and reserves
// breathing room under the realm name before the dashed divider.
const HEADER_H = 48;
const STATS_TOP = HEADER_H + 8;
// Dashed divider sits in the middle of the padding gap between the realm
// subtitle and the LIVES/GOLD stat cells, so it visually separates header
// from body without crowding either side.
const DIVIDER_Y = Math.round((REALM_TEXT_Y + REALM_TEXT_H + STATS_TOP) / 2);
const STATS_H = 50;
// HERO chip — slim row showing the chosen champion's portrait + HP bar (or
// respawn countdown when dead). Sits between LIVES/GOLD and SCORE so the
// player can read it at a glance with the other run-state stats. Kept
// short (22px) so the rest of the HUD doesn't need to shrink much.
const HERO_TOP = STATS_TOP + STATS_H + 6;
const HERO_H = 22;
// SCORE row sits between the HERO chip and the WAVE card. Pre-multiplier
// running score on the left, current pact multiplier on the right. Sized at
// stat-cell height so the running score reads as a primary stat, not a footer.
const SCORE_TOP = HERO_TOP + HERO_H + 6;
const SCORE_H = 46;
// Wave card carries the big "N/M" number, pip row, progress bar, status
// line. Height tightened from 68 → 60 to recover vertical space for the
// new HERO chip without forcing the tower picker into the upgrade tip.
const WAVE_TOP = SCORE_TOP + SCORE_H + 8;
const WAVE_H = 60;
const PICKER_TOP = WAVE_TOP + WAVE_H + 8;
const TOWER_CARD_H = 44;
const TOWER_CARD_GAP = 5;
// Waves auto-start, so there's no start-wave button — the bottom of the HUD
// hosts a compact upgrade-hint card with the "!" glyph. Kept intentionally
// small so it reads as a footer hint, not a primary card.
const TIP_H = 18;
const TIP_TOP = CANVAS_H - 10 - TIP_H;

const COLOR = {
  panelDark: "#1a1208",
  panelMid: "#2a1f12",
  panelEdge: "#5a3820",
  text: "#f0e0c0",
  textMuted: "#8a7050",
  gold: "#e8c440",
  goldDim: "#c98a3a",
  danger: "#e83a3a",
  bgCell: "#14100a",
  cellEdge: "#3a2818",
  green: "#5a8a3a",
  greenLight: "#7aaa54",
  red: "#a02020",
  redLight: "#e84040",
};

function towerCardRect(i: number): { x: number; y: number; w: number; h: number } {
  return {
    x: HUD_X + PAD,
    y: PICKER_TOP + 14 + i * (TOWER_CARD_H + TOWER_CARD_GAP),
    w: HUD_W - PAD * 2,
    h: TOWER_CARD_H,
  };
}

function tipRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: HUD_X + PAD,
    y: TIP_TOP,
    w: HUD_W - PAD * 2,
    h: TIP_H,
  };
}

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState): void {
  // Panel: two-tone with an inner glow line
  ctx.fillStyle = COLOR.panelMid;
  ctx.fillRect(HUD_X, 0, HUD_W, CANVAS_H);
  ctx.fillStyle = COLOR.panelDark;
  ctx.fillRect(HUD_X + 4, 4, HUD_W - 8, CANVAS_H - 8);
  ctx.strokeStyle = COLOR.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(HUD_X + 4.5, 4.5, HUD_W - 9, CANVAS_H - 9);

  // --- Header ---
  ctx.fillStyle = COLOR.gold;
  ctx.font = "bold 16px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("PACTKEEPER", HUD_X + PAD, 14);
  // Realm-name subtitle (matches the canvas wave-badge so the player always
  // knows where they are). The em-dash framing mirrors the design. Kept
  // small so the brand line dominates; HEADER_H leaves padding underneath
  // before the dashed divider.
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "italic 8px ui-monospace, Menlo, monospace";
  ctx.fillText(`— ${s.realmName} —`, HUD_X + PAD, REALM_TEXT_Y);

  // Dashed divider — centered in the padding gap below the realm subtitle.
  ctx.strokeStyle = COLOR.panelEdge;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(HUD_X + PAD, DIVIDER_Y);
  ctx.lineTo(HUD_X + HUD_W - PAD, DIVIDER_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Stats row: LIVES | GOLD (matches design's left→right ordering: hearts first) ---
  const halfW = (HUD_W - PAD * 2 - 8) / 2;
  drawStatCell(
    ctx,
    HUD_X + PAD,
    STATS_TOP,
    halfW,
    STATS_H,
    "LIVES",
    String(s.lives),
    s.lives <= 5 ? COLOR.redLight : COLOR.text,
    { glyph: "♥", glyphColor: s.lives <= 5 ? COLOR.redLight : "#e85a4a" },
  );
  drawStatCell(
    ctx,
    HUD_X + PAD + halfW + 8,
    STATS_TOP,
    halfW,
    STATS_H,
    "GOLD",
    String(s.gold),
    COLOR.gold,
    { glyph: "◆", glyphColor: COLOR.gold },
  );

  // --- Hero chip ---
  drawHeroChip(ctx, HUD_X + PAD, HERO_TOP, HUD_W - PAD * 2, HERO_H, s);

  // --- Score row ---
  drawScoreCard(ctx, HUD_X + PAD, SCORE_TOP, HUD_W - PAD * 2, SCORE_H, s);

  // --- Wave card ---
  drawWaveCard(ctx, HUD_X + PAD, WAVE_TOP, HUD_W - PAD * 2, WAVE_H, s);

  // --- Picker label ---
  // The click-to-upgrade hint lives in the bottom tooltip card now; up here
  // we just label the section. Hotkey badges per card replace the old
  // "[1] [2] [3]" affordance cue.
  ctx.fillStyle = COLOR.goldDim;
  ctx.font = "bold 10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText("BUILD", HUD_X + PAD, PICKER_TOP);
  ctx.fillStyle = COLOR.panelEdge;
  ctx.font = "9px ui-monospace, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("[1]  [2]  [3]", HUD_X + HUD_W - PAD, PICKER_TOP + 1);
  ctx.textAlign = "left";

  // --- Tower cards ---
  for (let i = 0; i < TOWER_KINDS.length; i++) {
    const kind = TOWER_KINDS[i];
    const def = TOWER_DEFS[kind];
    // Picker always shows the base (T1) cost + sprite + label — placement is
    // always T1, and upgrades happen through the click-on-tower popover.
    const t1 = getTowerTier(kind, 1);
    const r = towerCardRect(i);
    const cost = Math.round(t1.cost * s.costMult);
    const affordable = s.gold >= cost;
    const selected = s.selectedTower === kind;

    // Card background
    ctx.fillStyle = selected ? "#20180a" : COLOR.bgCell;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? def.accent : COLOR.cellEdge;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Sprite preview tile (square inside the card)
    const tileSize = TOWER_CARD_H - 10;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(r.x + 5, r.y + 5, tileSize, tileSize);
    ctx.strokeStyle = COLOR.cellEdge;
    ctx.strokeRect(r.x + 5.5, r.y + 5.5, tileSize - 1, tileSize - 1);
    const sprite = getSprite(t1.sprite, SCALE);
    const sx = r.x + 5 + (tileSize - sprite.width) / 2;
    const sy = r.y + 5 + (tileSize - sprite.height) / 2;
    if (!affordable) {
      ctx.save();
      ctx.globalAlpha = 0.4;
    }
    ctx.drawImage(sprite, Math.round(sx), Math.round(sy));
    if (!affordable) ctx.restore();

    // Hotkey bin on the right edge — small dark cell with the slot number,
    // matching the "[1] [2] [3]" cue above the picker. Sits inside the card
    // so it doesn't overflow the HUD width.
    const hotkeyW = 18;
    const hotkeyH = 18;
    const hkX = r.x + r.w - hotkeyW - 5;
    const hkY = r.y + (r.h - hotkeyH) / 2;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(hkX, hkY, hotkeyW, hotkeyH);
    ctx.strokeStyle = COLOR.cellEdge;
    ctx.strokeRect(hkX + 0.5, hkY + 0.5, hotkeyW - 1, hotkeyH - 1);
    ctx.fillStyle = COLOR.goldDim;
    ctx.font = "bold 11px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), hkX + hotkeyW / 2, hkY + 4);
    ctx.textAlign = "left";

    // Text column — sits between sprite tile and hotkey bin. Fonts are
    // intentionally small (9–10px) so the descriptions and costs fit our
    // 240px-wide HUD without truncation; the design's larger font was
    // affordable because their HUD is ~340px.
    const tx = r.x + tileSize + 9;
    const textRight = hkX - 4; // available right edge for clipping
    const textMaxW = textRight - tx;
    ctx.fillStyle = affordable ? def.accent : COLOR.textMuted;
    ctx.font = "bold 9px ui-monospace, Menlo, monospace";
    ctx.fillText(t1.label, tx, r.y + 5);

    ctx.fillStyle = COLOR.textMuted;
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText(truncToWidth(ctx, def.desc, textMaxW), tx, r.y + 16);

    // Cost
    ctx.fillStyle = affordable ? COLOR.gold : COLOR.danger;
    ctx.font = "bold 9px ui-monospace, Menlo, monospace";
    ctx.fillText(`◆ ${cost}g`, tx, r.y + 28);

    // Anti-air indicator — inline with the cost line, right-aligned just
    // left of the hotkey bin. Both ANTI-AIR and GROUND render so the
    // contrast is the lesson; a silently-missing label would let the player
    // walk into "I built three cannons and bats walked past them".
    const aaIsAir = def.canHitFlying;
    const aaGlyph = "A";
    const aaText = aaIsAir ? `${aaGlyph} ANTI-AIR` : `${aaGlyph} GROUND`;
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillStyle = aaIsAir ? COLOR.gold : COLOR.textMuted;
    ctx.textAlign = "right";
    ctx.fillText(aaText, textRight, r.y + 29);
    if (!aaIsAir) {
      // Red diagonal slash across the leading "A" glyph to reinforce
      // "cannot hit air". We measure after drawing so the slash anchors
      // to the glyph regardless of monospace-font rendering quirks.
      const labelW = ctx.measureText(aaText).width;
      const glyphW = ctx.measureText(aaGlyph).width;
      const glyphLeft = textRight - labelW;
      const glyphTop = r.y + 29;
      const glyphBottom = glyphTop + 8;
      ctx.strokeStyle = COLOR.danger;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(glyphLeft - 1, glyphBottom);
      ctx.lineTo(glyphLeft + glyphW + 1, glyphTop);
      ctx.stroke();
    }
    ctx.textAlign = "left";

    // Selected arrow indicator
    if (selected) {
      ctx.fillStyle = def.accent;
      ctx.font = "bold 12px ui-monospace, Menlo, monospace";
      ctx.fillText("►", r.x - 10, r.y + r.h / 2 - 6);
    }
  }

  // --- Upgrade tooltip card (bottom of HUD) ---
  drawUpgradeTip(ctx, tipRect(), s.hasTowers);
}

/**
 * Two-line stat cell with optional leading glyph (heart for LIVES, diamond
 * for GOLD). The glyph sits to the left of the big value number.
 */
function drawStatCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: string,
  glyph?: { glyph: string; glyphColor: string },
): void {
  ctx.fillStyle = COLOR.bgCell;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.fillText(label, x + 8, y + 8);

  let valueX = x + 8;
  if (glyph) {
    ctx.fillStyle = glyph.glyphColor;
    ctx.font = "bold 16px ui-monospace, Menlo, monospace";
    ctx.fillText(glyph.glyph, x + 8, y + 24);
    valueX = x + 8 + 16;
  }
  ctx.fillStyle = valueColor;
  ctx.font = "bold 18px ui-monospace, Menlo, monospace";
  ctx.fillText(value, valueX, y + 22);
}

/**
 * Big SCORE card — full-width, same height as the GOLD/LIVES cells. Layout
 * mirrors the design: "SCORE" label top-left, "×1.55" multiplier top-right,
 * then the running score number bottom-right at hero-stat size. Multiplier
 * dims when it's exactly ×1.00 (no pacts sealed) so the neutral case doesn't
 * steal attention.
 */
function drawScoreCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: HudState,
): void {
  ctx.fillStyle = COLOR.bgCell;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Top-left label
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("SCORE", x + 8, y + 8);

  // Top-right multiplier (smaller; gets a green tint when > 1)
  const multActive = s.scoreMult > 1.0001;
  ctx.fillStyle = multActive ? COLOR.greenLight : COLOR.textMuted;
  ctx.font = "bold 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`×${s.scoreMult.toFixed(2)}`, x + w - 8, y + 8);

  // Big right-aligned running score
  ctx.fillStyle = COLOR.gold;
  ctx.font = "bold 22px ui-monospace, Menlo, monospace";
  ctx.fillText(s.score.toLocaleString(), x + w - 8, y + 22);
  ctx.textAlign = "left";
}

/**
 * Slim HERO chip — portrait on the left, name + HP bar (or RESPAWN
 * countdown when dead) on the right. Accent-tinted edge so the chip
 * reads as the champion's banner at a glance. Renders an empty cell
 * when no hero is on the field yet (pre-level).
 */
function drawHeroChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: HudState,
): void {
  ctx.fillStyle = COLOR.bgCell;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  if (!s.hero) {
    ctx.fillStyle = COLOR.textMuted;
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("HERO  —", x + 8, y + h / 2 + 1);
    ctx.textBaseline = "top";
    return;
  }

  const def = HEROES[s.hero.kind];
  // Accent-colored left strip — quick visual cue for which champion this
  // is, picked up from the kind's accent so HUD + canvas + picker stay
  // visually consistent.
  ctx.fillStyle = def.accent;
  ctx.fillRect(x, y, 2, h);

  // Mini portrait (16×16 logical sprite at SCALE/2 so it fits in the chip).
  // We don't want the bob animation here — this is a static glyph.
  const portrait = getSprite(def.sprite, 1);
  const portraitSize = h - 4;
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(x + 4, y + 2, portraitSize, portraitSize);
  ctx.drawImage(
    portrait,
    x + 4 + (portraitSize - portrait.width) / 2,
    y + 2 + (portraitSize - portrait.height) / 2,
  );

  // Right column: name + HP bar (alive) or respawn countdown (dead).
  const textX = x + 4 + portraitSize + 6;
  ctx.font = "bold 8px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  if (s.hero.alive) {
    ctx.fillStyle = def.accent;
    ctx.fillText(def.displayName.toUpperCase(), textX, y + 4);

    const barW = w - (textX - x) - 8;
    const barX = textX;
    const barY = y + h - 8;
    const barH = 4;
    const ratio = Math.max(0, s.hero.hp / s.hero.maxHp);
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = COLOR.cellEdge;
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
    ctx.fillStyle =
      ratio > 0.5 ? "#5acc3a" : ratio > 0.25 ? "#e8c440" : "#e83a3a";
    ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * ratio), barH - 2);
  } else {
    ctx.fillStyle = COLOR.danger;
    ctx.fillText(`✕ FALLEN`, textX, y + 4);
    ctx.fillStyle = COLOR.gold;
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText(`RESPAWN ${s.hero.respawnIn}s`, textX, y + h - 12);
  }
}

function drawWaveCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  s: HudState,
): void {
  // Background
  ctx.fillStyle = COLOR.bgCell;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Row 1: WAVE label
  ctx.textBaseline = "top";
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText("WAVE", x + 8, y + 6);

  // Row 2 left: big "NN" + small "/M"
  const current = Math.max(0, s.wave + 1);
  ctx.fillStyle = COLOR.gold;
  ctx.font = "bold 20px ui-monospace, Menlo, monospace";
  const bigText = String(current);
  ctx.fillText(bigText, x + 8, y + 16);
  const bigW = ctx.measureText(bigText).width;
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillText(`/${s.totalWaves}`, x + 8 + bigW + 2, y + 24);

  // Row 2 right: pip row — green=done, gold=active, dark=upcoming.
  // Boss pip gets a red tint so the player can see it on the timeline.
  const pipW = 12;
  const pipGap = 3;
  const pipsTotalW = s.totalWaves * pipW + (s.totalWaves - 1) * pipGap;
  const pipsX = x + w - 8 - pipsTotalW;
  const pipsY = y + 18;
  for (let i = 0; i < s.totalWaves; i++) {
    const px = pipsX + i * (pipW + pipGap);
    const done = i < s.wave;
    const active = i === s.wave && s.inWave;
    const isBoss = i === s.bossWaveIndex;
    if (done) {
      ctx.fillStyle = COLOR.green;
      ctx.fillRect(px, pipsY, pipW, pipW);
      ctx.fillStyle = COLOR.greenLight;
      ctx.fillRect(px + 1, pipsY + 1, pipW - 2, 2);
      ctx.strokeStyle = "#3a5520";
    } else if (active) {
      ctx.fillStyle = isBoss ? COLOR.red : COLOR.goldDim;
      ctx.fillRect(px, pipsY, pipW, pipW);
      ctx.fillStyle = isBoss ? "#ff8060" : COLOR.gold;
      ctx.fillRect(px + 1, pipsY + 1, pipW - 2, 2);
      ctx.strokeStyle = isBoss ? "#7a1010" : "#5a3820";
    } else {
      ctx.fillStyle = "#0a0806";
      ctx.fillRect(px, pipsY, pipW, pipW);
      ctx.strokeStyle = isBoss ? "#3a1010" : COLOR.cellEdge;
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, pipsY + 0.5, pipW - 1, pipW - 1);
  }

  // Row 3: full-width red progress bar — visualises how much of the current
  // wave has spawned / been cleared.
  const barX = x + 8;
  const barY = y + 40;
  const barW = w - 16;
  const barH = 6;
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
  const progress = Math.max(0, Math.min(1, s.waveProgress));
  if (progress > 0) {
    const fillW = Math.max(2, Math.floor((barW - 2) * progress));
    ctx.fillStyle = "#a02020";
    ctx.fillRect(barX + 1, barY + 1, fillW, barH - 2);
    ctx.fillStyle = "#e84040";
    ctx.fillRect(barX + 1, barY + 1, fillW, 2);
  }

  // Row 4: status line with state-tinted dot + boss-state suffix.
  const statusY = y + h - 13;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  const inBossWave = s.wave === s.bossWaveIndex;
  if (s.wave < 0) {
    // Pre-game prompt is a quiet hint, not a live status — keep it smaller
    // than the in-wave "N on the path" / "All waves cleared" lines below.
    ctx.fillStyle = COLOR.textMuted;
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("Place a tower to begin", x + 8, statusY + 1);
  } else if (
    s.wave + 1 >= s.totalWaves &&
    !s.inWave &&
    s.enemiesAlive === 0
  ) {
    ctx.fillStyle = COLOR.greenLight;
    ctx.fillText("● All waves cleared", x + 8, statusY);
  } else {
    const dotColor = s.enemiesAlive > 0 ? COLOR.redLight : COLOR.goldDim;
    ctx.fillStyle = dotColor;
    ctx.fillText("●", x + 8, statusY);
    ctx.fillStyle = COLOR.text;
    const main = `${s.enemiesAlive} on the path`;
    ctx.fillText(main, x + 22, statusY);
    const mainW = ctx.measureText(main).width;
    let suffix: { text: string; color: string } | null = null;
    if (inBossWave) {
      suffix = { text: " · Boss active", color: "#e85a4a" };
    } else if (s.wave + 1 === s.bossWaveIndex) {
      suffix = { text: " · Boss incoming", color: "#e85a4a" };
    } else if (s.wave < s.bossWaveIndex) {
      suffix = {
        text: ` · Boss in Wave ${s.bossWaveIndex + 1}`,
        color: COLOR.textMuted,
      };
    }
    if (suffix) {
      ctx.fillStyle = suffix.color;
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillText(suffix.text, x + 22 + mainW, statusY + 1);
    }
  }
}

/**
 * Bottom-of-HUD tooltip card with a dashed gold border, an "!" glyph badge,
 * and copy that highlights the word "upgrade". Mirrors design's `.hud-tip`
 * block but rendered to canvas. The card dims when the player has no towers
 * placed yet (so the affordance isn't actionable).
 */
function drawUpgradeTip(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  hasTowers: boolean,
): void {
  // Card background
  ctx.fillStyle = COLOR.panelDark;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Dashed gold border — drawn as manual dashes for crisp pixel rendering.
  const dashLen = 3;
  const gapLen = 2;
  ctx.fillStyle = hasTowers ? COLOR.goldDim : COLOR.panelEdge;
  for (let dx = 0; dx < r.w; dx += dashLen + gapLen) {
    ctx.fillRect(r.x + dx, r.y, Math.min(dashLen, r.w - dx), 1);
    ctx.fillRect(r.x + dx, r.y + r.h - 1, Math.min(dashLen, r.w - dx), 1);
  }
  for (let dy = 0; dy < r.h; dy += dashLen + gapLen) {
    ctx.fillRect(r.x, r.y + dy, 1, Math.min(dashLen, r.h - dy));
    ctx.fillRect(r.x + r.w - 1, r.y + dy, 1, Math.min(dashLen, r.h - dy));
  }

  // "!" glyph badge — small gold square with dark outline
  const badgeS = 10;
  const badgeX = r.x + 4;
  const badgeY = r.y + (r.h - badgeS) / 2;
  ctx.fillStyle = hasTowers ? COLOR.goldDim : "#5a3820";
  ctx.fillRect(badgeX, badgeY, badgeS, badgeS);
  ctx.strokeStyle = "#1a0c00";
  ctx.lineWidth = 1;
  ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeS - 1, badgeS - 1);
  // "!" character
  ctx.fillStyle = "#1a0c00";
  ctx.font = "bold 8px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", badgeX + badgeS / 2, badgeY + badgeS / 2 + 1);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Tip text — 8px font, "upgrade" emphasized in gold.
  const tx = badgeX + badgeS + 5;
  const ty = r.y + (r.h - 8) / 2;
  const baseColor = hasTowers ? "#a09070" : COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  const part1 = "Click a tower to ";
  const part2 = "upgrade";
  const part3 = ".";
  ctx.fillStyle = baseColor;
  ctx.fillText(part1, tx, ty);
  const p1W = ctx.measureText(part1).width;
  ctx.fillStyle = hasTowers ? COLOR.gold : COLOR.goldDim;
  ctx.font = "bold 8px ui-monospace, Menlo, monospace";
  ctx.fillText(part2, tx + p1W, ty);
  const p2W = ctx.measureText(part2).width;
  ctx.fillStyle = baseColor;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.fillText(part3, tx + p1W + p2W, ty);
}

/**
 * Crop a string to fit `maxW` rendered width using the current ctx.font,
 * adding an ellipsis if it had to clip. Used to keep tower-card descriptions
 * from spilling under the hotkey badge.
 */
function truncToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const trial = text.slice(0, mid) + "…";
    if (ctx.measureText(trial).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

export function hitHud(
  mx: number,
  my: number,
  s: HudState,
): HudClick | null {
  for (let i = 0; i < TOWER_KINDS.length; i++) {
    const r = towerCardRect(i);
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      const kind = TOWER_KINDS[i];
      if (s.selectedTower === kind) return { type: "deselect" };
      return { type: "select-tower", kind };
    }
  }
  return null;
}

