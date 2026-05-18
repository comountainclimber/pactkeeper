import { CANVAS_H, CANVAS_W } from "./config.ts";
import { PACTS } from "./modifiers.ts";
import type { Pact } from "./types.ts";

const CARD_W = 200;
const CARD_H = 230;
const CARDS_PER_ROW = 4;
const CARD_GAP_X = 24;
const CARD_GAP_Y = 24;
const TOP_OFFSET = 130;

function gridOrigin(): { x: number; y: number } {
  const totalW = CARDS_PER_ROW * CARD_W + (CARDS_PER_ROW - 1) * CARD_GAP_X;
  return { x: (CANVAS_W - totalW) / 2, y: TOP_OFFSET };
}

function cardRect(i: number): { x: number; y: number; w: number; h: number } {
  const o = gridOrigin();
  const col = i % CARDS_PER_ROW;
  const row = Math.floor(i / CARDS_PER_ROW);
  return {
    x: o.x + col * (CARD_W + CARD_GAP_X),
    y: o.y + row * (CARD_H + CARD_GAP_Y),
    w: CARD_W,
    h: CARD_H,
  };
}

function beginButtonRect(): { x: number; y: number; w: number; h: number } {
  const w = 260;
  const h = 50;
  return { x: (CANVAS_W - w) / 2, y: CANVAS_H - 80, w, h };
}

export type PactClick =
  | { type: "toggle"; pactId: string }
  | { type: "begin" }
  | null;

export function drawPactPicker(
  ctx: CanvasRenderingContext2D,
  selected: Set<string>,
): void {
  // Backdrop
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.fillStyle = "#f0e6d2";
  ctx.font = "bold 30px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText("CHOOSE YOUR PACTS", CANVAS_W / 2, 40);
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "#c08a3e";
  ctx.fillText(
    `Optional · pick up to 3 · selected ${selected.size}/3`,
    CANVAS_W / 2,
    80,
  );

  // Cards
  for (let i = 0; i < PACTS.length; i++) {
    const p = PACTS[i];
    const r = cardRect(i);
    const isSelected = selected.has(p.id);
    drawPactCard(ctx, r, p, isSelected);
  }

  // Begin button — always enabled. Label changes to reflect "play raw" vs picks.
  const b = beginButtonRect();
  ctx.fillStyle = "#5a3a1a";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = "#c08a3e";
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = "#f0e6d2";
  ctx.font = "bold 16px ui-monospace, Menlo, monospace";
  const label =
    selected.size === 0
      ? "▶  BEGIN LEVEL (no pacts)"
      : `▶  BEGIN LEVEL (${selected.size} pact${selected.size === 1 ? "" : "s"})`;
  ctx.fillText(label, b.x + b.w / 2, b.y + 18);
  ctx.textAlign = "left";
}

function drawPactCard(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  p: Pact,
  selected: boolean,
): void {
  ctx.fillStyle = selected ? "#3a2a1a" : "#2a1f17";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = selected ? "#c08a3e" : "#4a3a2a";
  ctx.lineWidth = selected ? 3 : 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  // Title bar
  ctx.fillStyle = selected ? "#5a3a1a" : "#3a2a1a";
  ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, 32);
  ctx.fillStyle = "#f0e6d2";
  ctx.font = "bold 14px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(p.name, r.x + r.w / 2, r.y + 16);

  // Body
  ctx.textAlign = "left";
  ctx.font = "11px ui-monospace, Menlo, monospace";

  ctx.fillStyle = "#b94a3a";
  ctx.fillText("— DOWNSIDE —", r.x + 14, r.y + 60);
  ctx.fillStyle = "#e0c0b0";
  wrap(ctx, p.downside, r.x + 14, r.y + 78, r.w - 28, 14);

  ctx.fillStyle = "#6a9a4a";
  ctx.fillText("+  UPSIDE  +", r.x + 14, r.y + 130);
  ctx.fillStyle = "#c0e0b0";
  wrap(ctx, p.upside, r.x + 14, r.y + 148, r.w - 28, 14);

  // Selected indicator footer
  if (selected) {
    ctx.fillStyle = "#c08a3e";
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("✓ SEALED", r.x + r.w / 2, r.y + r.h - 22);
    ctx.textAlign = "left";
  }
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
): void {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export function hitPactPicker(
  mx: number,
  my: number,
  selected: Set<string>,
): PactClick {
  // Cards
  for (let i = 0; i < PACTS.length; i++) {
    const r = cardRect(i);
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      const p = PACTS[i];
      // If selecting a new one and we already have 3, ignore (caller checks too)
      if (!selected.has(p.id) && selected.size >= 3) return null;
      return { type: "toggle", pactId: p.id };
    }
  }
  // Begin — always allowed; pacts are optional
  {
    const b = beginButtonRect();
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      return { type: "begin" };
    }
  }
  return null;
}

/**
 * Pixel-art badge anchored to the top-left of the play field. Shows the
 * current wave number and the active realm's name — matches the design's
 * `WAVE 3 / – Hollowmere Mire –` mark. Drawn AFTER the map+enemies layer so
 * it sits on top, but BEFORE the HUD (which lives off to the right anyway).
 *
 * `wave` is 0-indexed; pass `Game.waveIndex` directly. We add 1 for display.
 * If `wave < 0` (player hasn't started yet), the badge shows "READY".
 */
export function drawWaveBadge(
  ctx: CanvasRenderingContext2D,
  wave: number,
  totalWaves: number,
  realmName: string,
): void {
  const x = 12;
  const y = 12;
  // Measure realm name to size the box dynamically so longer realm names fit.
  ctx.save();
  ctx.font = "italic 10px ui-monospace, Menlo, monospace";
  const realmText = `— ${realmName} —`;
  const realmW = ctx.measureText(realmText).width;
  const w = Math.max(150, Math.ceil(realmW) + 20);
  const h = 38;

  // Two-tone background — outer frame, inner panel, soft drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x + 3, y + 3, w, h);
  ctx.fillStyle = "#1a1208";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#2a1f12";
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = "#5a3820";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Wave label
  const label =
    wave < 0
      ? "READY"
      : `WAVE ${wave + 1}/${totalWaves}`;
  ctx.fillStyle = "#e8c440";
  ctx.font = "bold 12px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 10, y + 7);

  // Realm subtitle
  ctx.fillStyle = "#8a7050";
  ctx.font = "italic 10px ui-monospace, Menlo, monospace";
  ctx.fillText(realmText, x + 10, y + 22);

  ctx.restore();
}

export function drawEndScreen(
  ctx: CanvasRenderingContext2D,
  victory: boolean,
): void {
  ctx.fillStyle = "rgba(26, 20, 16, 0.85)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = victory ? "#c08a3e" : "#b94a3a";
  ctx.font = "bold 48px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    victory ? "PACT FULFILLED" : "PACT BROKEN",
    CANVAS_W / 2,
    CANVAS_H / 2 - 30,
  );

  ctx.font = "16px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "#f0e6d2";
  ctx.fillText(
    victory ? "The realm endures." : "The realm falls to ruin.",
    CANVAS_W / 2,
    CANVAS_H / 2 + 10,
  );

  ctx.fillStyle = "#c08a3e";
  ctx.font = "14px ui-monospace, Menlo, monospace";
  ctx.fillText("Click to forge a new pact", CANVAS_W / 2, CANVAS_H / 2 + 50);
  ctx.textAlign = "left";
}
