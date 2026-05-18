import {
  CANVAS_H,
  HUD_W,
  HUD_X,
  SCALE,
  TOWER_DEFS,
  type TowerKind,
} from "./config.ts";
import { getSprite } from "./sprites.ts";

export type HudClick =
  | { type: "select-tower"; kind: TowerKind }
  | { type: "start-wave" }
  | { type: "deselect" };

export type HudState = {
  gold: number;
  lives: number;
  wave: number; // -1 if not started; otherwise 0-indexed
  totalWaves: number;
  inWave: boolean;
  selectedTower: TowerKind | null;
  costMult: number;
};

/** Display order for tower cards in the HUD picker. Must contain every key
 * from `TOWER_DEFS`; `scripts/doc-check.ts` enforces this. */
export const TOWER_KINDS: TowerKind[] = ["arrow", "cannon", "frost"];

// Layout constants — keep magic numbers in one place so we can re-tune the HUD.
const PAD = 14;
const HEADER_H = 42;
const STATS_TOP = HEADER_H + 8;
const STATS_H = 50;
const WAVE_TOP = STATS_TOP + STATS_H + 10;
const WAVE_H = 64;
const PICKER_TOP = WAVE_TOP + WAVE_H + 12;
const TOWER_CARD_H = 56;
const TOWER_CARD_GAP = 8;

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
    y: PICKER_TOP + 16 + i * (TOWER_CARD_H + TOWER_CARD_GAP),
    w: HUD_W - PAD * 2,
    h: TOWER_CARD_H,
  };
}

function startWaveRect(): { x: number; y: number; w: number; h: number } {
  return {
    x: HUD_X + PAD,
    y: CANVAS_H - 60,
    w: HUD_W - PAD * 2,
    h: 44,
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
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillText("KEEP THE PACT", HUD_X + PAD, 34);

  // Dashed divider
  ctx.strokeStyle = COLOR.panelEdge;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(HUD_X + PAD, HEADER_H + 6);
  ctx.lineTo(HUD_X + HUD_W - PAD, HEADER_H + 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Stats row: GOLD | LIVES ---
  drawStatCell(
    ctx,
    HUD_X + PAD,
    STATS_TOP,
    (HUD_W - PAD * 2 - 8) / 2,
    STATS_H,
    "GOLD",
    String(s.gold),
    COLOR.gold,
  );
  drawStatCell(
    ctx,
    HUD_X + PAD + (HUD_W - PAD * 2 - 8) / 2 + 8,
    STATS_TOP,
    (HUD_W - PAD * 2 - 8) / 2,
    STATS_H,
    "LIVES",
    String(s.lives),
    s.lives <= 5 ? COLOR.redLight : COLOR.text,
  );

  // --- Wave card ---
  drawWaveCard(ctx, HUD_X + PAD, WAVE_TOP, HUD_W - PAD * 2, WAVE_H, s);

  // --- Picker label ---
  ctx.fillStyle = COLOR.goldDim;
  ctx.font = "9px ui-monospace, Menlo, monospace";
  ctx.fillText("TOWERS", HUD_X + PAD, PICKER_TOP);
  ctx.fillStyle = COLOR.panelEdge;
  ctx.textAlign = "right";
  ctx.fillText("[1] [2] [3]", HUD_X + HUD_W - PAD, PICKER_TOP);
  ctx.textAlign = "left";

  // --- Tower cards ---
  for (let i = 0; i < TOWER_KINDS.length; i++) {
    const kind = TOWER_KINDS[i];
    const def = TOWER_DEFS[kind];
    const r = towerCardRect(i);
    const cost = Math.round(def.cost * s.costMult);
    const affordable = s.gold >= cost;
    const selected = s.selectedTower === kind;

    // Card background
    ctx.fillStyle = selected ? "#20180a" : COLOR.bgCell;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? def.accent : COLOR.cellEdge;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    // Sprite preview tile
    const tileSize = TOWER_CARD_H - 12;
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(r.x + 6, r.y + 6, tileSize, tileSize);
    ctx.strokeStyle = COLOR.cellEdge;
    ctx.strokeRect(r.x + 6.5, r.y + 6.5, tileSize - 1, tileSize - 1);
    const sprite = getSprite(def.sprite, SCALE);
    const sx = r.x + 6 + (tileSize - sprite.width) / 2;
    const sy = r.y + 6 + (tileSize - sprite.height) / 2;
    if (!affordable) {
      ctx.save();
      ctx.globalAlpha = 0.4;
    }
    ctx.drawImage(sprite, Math.round(sx), Math.round(sy));
    if (!affordable) ctx.restore();

    // Text column
    const tx = r.x + tileSize + 14;
    ctx.fillStyle = affordable ? def.accent : COLOR.textMuted;
    ctx.font = "bold 11px ui-monospace, Menlo, monospace";
    ctx.fillText(def.label, tx, r.y + 8);

    ctx.fillStyle = COLOR.textMuted;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(def.desc.slice(0, 26), tx, r.y + 22);

    // Cost
    ctx.fillStyle = affordable ? COLOR.gold : COLOR.danger;
    ctx.font = "bold 11px ui-monospace, Menlo, monospace";
    ctx.fillText(`◆ ${cost}g`, tx, r.y + 38);

    // Selected arrow indicator
    if (selected) {
      ctx.fillStyle = def.accent;
      ctx.font = "bold 12px ui-monospace, Menlo, monospace";
      ctx.fillText("►", r.x - 10, r.y + r.h / 2 - 6);
    }
  }

  // --- Start-wave button ---
  if (!s.inWave && s.wave + 1 < s.totalWaves) {
    const r = startWaveRect();
    const isBoss = s.wave + 1 === s.totalWaves - 1;
    // Primary green button, or red for boss
    ctx.fillStyle = isBoss ? "#5a1a2a" : "#3a5520";
    ctx.fillRect(r.x, r.y + 2, r.w, r.h - 2); // bottom shadow
    ctx.fillStyle = isBoss ? "#a02020" : COLOR.green;
    ctx.fillRect(r.x, r.y, r.w, r.h - 4);
    ctx.strokeStyle = isBoss ? "#7a1010" : "#2a3a18";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 4);
    // Top highlight
    ctx.fillStyle = isBoss ? "#ff8060" : COLOR.greenLight;
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 1);

    ctx.fillStyle = "#f0f8d0";
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      isBoss ? "▶  BOSS WAVE" : "▶  START WAVE",
      r.x + r.w / 2,
      r.y + 14,
    );
    ctx.textAlign = "left";
  }
}

function drawStatCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: string,
): void {
  ctx.fillStyle = COLOR.bgCell;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.cellEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.fillText(label, x + 8, y + 8);

  ctx.fillStyle = valueColor;
  ctx.font = "bold 18px ui-monospace, Menlo, monospace";
  ctx.fillText(value, x + 8, y + 22);
}

function drawWaveCard(
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

  // Label
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "8px ui-monospace, Menlo, monospace";
  ctx.fillText("WAVE", x + 8, y + 8);

  // Big number
  const current = Math.max(0, s.wave + 1);
  ctx.fillStyle = COLOR.gold;
  ctx.font = "bold 22px ui-monospace, Menlo, monospace";
  ctx.fillText(String(current).padStart(2, "0"), x + 8, y + 18);
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillText(`/ ${s.totalWaves}`, x + 50, y + 30);

  // Wave pips
  const pipW = 12;
  const pipGap = 4;
  const pipsX = x + w - (s.totalWaves * (pipW + pipGap)) - 4;
  for (let i = 0; i < s.totalWaves; i++) {
    const px = pipsX + i * (pipW + pipGap);
    const py = y + 10;
    const done = i < s.wave;
    const active = i === s.wave && s.inWave;
    ctx.fillStyle = done
      ? COLOR.green
      : active
        ? COLOR.goldDim
        : "#0a0806";
    ctx.fillRect(px, py, pipW, pipW);
    ctx.strokeStyle = done ? "#3a5520" : COLOR.cellEdge;
    ctx.strokeRect(px + 0.5, py + 0.5, pipW - 1, pipW - 1);
    if (active) {
      ctx.fillStyle = COLOR.gold;
      ctx.fillRect(px + 2, py + 2, pipW - 4, 2);
    }
  }

  // Status text bottom row
  ctx.fillStyle = COLOR.text;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  let status = "";
  if (s.wave < 0) status = "Press START to begin";
  else if (s.inWave) status = "Wave in progress…";
  else if (s.wave + 1 >= s.totalWaves) status = "All waves cleared";
  else status = "Ready for next wave";
  ctx.fillText(status, x + 8, y + h - 16);
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
  if (!s.inWave && s.wave + 1 < s.totalWaves) {
    const r = startWaveRect();
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
      return { type: "start-wave" };
    }
  }
  return null;
}
