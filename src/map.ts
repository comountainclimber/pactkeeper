import {
  GRID_H,
  GRID_W,
  PATH,
  SCALE,
  TILE,
  TILE_PX,
} from "./config.ts";
import {
  GRASS_PALETTE,
  PATH_PALETTE,
  getSprite,
} from "./sprites.ts";
import type { Vec2 } from "./types.ts";

// ---- Path tile membership ---------------------------------------

function buildPathTiles(): Set<string> {
  const tiles = new Set<string>();
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i];
    const [bx, by] = PATH[i + 1];
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    let x = ax;
    let y = ay;
    while (x !== bx || y !== by) {
      tiles.add(`${x},${y}`);
      if (x !== bx) x += dx;
      else if (y !== by) y += dy;
    }
    tiles.add(`${bx},${by}`);
  }
  return tiles;
}

export const PATH_TILES = buildPathTiles();

export function isPathTile(tx: number, ty: number): boolean {
  return PATH_TILES.has(`${tx},${ty}`);
}

export function isBuildable(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  return !isPathTile(tx, ty);
}

export function tileCenter(tx: number, ty: number): Vec2 {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function waypointPos(index: number): Vec2 {
  const [tx, ty] = PATH[index];
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function pathStart(): Vec2 {
  return waypointPos(0);
}

// ---- Deterministic PRNG (ported from design handoff) -------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grassTile(seed: number): string[] {
  const rng = mulberry32(seed);
  const rows: string[] = [];
  for (let y = 0; y < TILE_PX; y++) {
    let r = "";
    for (let x = 0; x < TILE_PX; x++) {
      const n = rng();
      if (n < 0.65) r += "3";
      else if (n < 0.8) r += "4";
      else if (n < 0.9) r += "2";
      else if (n < 0.95) r += "5";
      else r += "1";
    }
    rows.push(r);
  }
  const tufts = Math.floor(rng() * 3);
  for (let t = 0; t < tufts; t++) {
    const tx = Math.floor(rng() * (TILE_PX - 2)) + 1;
    const ty = Math.floor(rng() * (TILE_PX - 2)) + 1;
    rows[ty] = rows[ty].substring(0, tx) + "7" + rows[ty].substring(tx + 1);
    rows[ty + 1] = rows[ty + 1].substring(0, tx) + "5" + rows[ty + 1].substring(tx + 1);
  }
  return rows;
}

type Edges = { n: boolean; s: boolean; e: boolean; w: boolean };

function pathTile(seed: number, edges: Edges): string[] {
  const rng = mulberry32(seed);
  const rows: string[] = [];
  for (let y = 0; y < TILE_PX; y++) {
    let r = "";
    for (let x = 0; x < TILE_PX; x++) {
      const n = rng();
      let ch: string;
      if (n < 0.55) ch = "4";
      else if (n < 0.75) ch = "3";
      else if (n < 0.88) ch = "5";
      else if (n < 0.95) ch = "7";
      else ch = "2";
      r += ch;
    }
    rows.push(r);
  }
  // pebbles
  for (let p = 0; p < 2; p++) {
    const px = 2 + Math.floor(rng() * (TILE_PX - 4));
    const py = 2 + Math.floor(rng() * (TILE_PX - 4));
    rows[py] = rows[py].substring(0, px) + "7" + rows[py].substring(px + 1);
    rows[py + 1] = rows[py + 1].substring(0, px) + "6" + rows[py + 1].substring(px + 1);
  }

  const setPix = (x: number, y: number, ch: string) => {
    if (x < 0 || x >= TILE_PX || y < 0 || y >= TILE_PX) return;
    rows[y] = rows[y].substring(0, x) + ch + rows[y].substring(x + 1);
  };
  if (!edges.n) for (let x = 0; x < TILE_PX; x++) { setPix(x, 0, "2"); setPix(x, 1, "3"); }
  if (!edges.s) for (let x = 0; x < TILE_PX; x++) { setPix(x, TILE_PX - 1, "2"); setPix(x, TILE_PX - 2, "3"); }
  if (!edges.w) for (let y = 0; y < TILE_PX; y++) { setPix(0, y, "2"); setPix(1, y, "3"); }
  if (!edges.e) for (let y = 0; y < TILE_PX; y++) { setPix(TILE_PX - 1, y, "2"); setPix(TILE_PX - 2, y, "3"); }
  if (!edges.n && !edges.w) setPix(0, 0, "1");
  if (!edges.n && !edges.e) setPix(TILE_PX - 1, 0, "1");
  if (!edges.s && !edges.w) setPix(0, TILE_PX - 1, "1");
  if (!edges.s && !edges.e) setPix(TILE_PX - 1, TILE_PX - 1, "1");

  return rows;
}

function edgesAt(x: number, y: number): Edges {
  return {
    n: PATH_TILES.has(`${x},${y - 1}`),
    s: PATH_TILES.has(`${x},${y + 1}`),
    w: PATH_TILES.has(`${x - 1},${y}`),
    e: PATH_TILES.has(`${x + 1},${y}`),
  };
}

// ---- Map canvas pre-render -------------------------------------

let mapCanvas: HTMLCanvasElement | null = null;

// Decorative props (tile coords + sub-tile pixel offsets in LOGICAL px).
// Shared between buildMapCanvas (drawing) and drawAmbientOverlay (torch glow).
type PropEntry = readonly ["tree" | "rock" | "torch", number, number, number, number];
const PROPS: ReadonlyArray<PropEntry> = [
  ["tree", 1, 1, 0, 0],
  ["tree", 2, 0, 4, 4],
  ["tree", 7, 0, 0, 0],
  ["tree", 12, 1, 0, 0],
  ["tree", 18, 0, 0, 4],
  ["tree", 20, 2, 0, 0],
  ["tree", 0, 6, 0, 0],
  ["tree", 1, 8, 4, 0],
  ["tree", 12, 12, 0, 0],
  ["tree", 17, 11, 0, 0],
  ["tree", 19, 12, 4, 0],
  ["tree", 7, 11, 0, 0],
  ["tree", 6, 12, 6, 4],
  ["rock", 6, 5, 4, 4],
  ["rock", 16, 6, 0, 4],
  ["rock", 3, 11, 4, 4],
  ["rock", 11, 0, 2, 4],
  ["rock", 13, 8, 0, 4],
  ["torch", 3, 2, 4, 8],
  ["torch", 5, 6, 8, 4],
  ["torch", 10, 6, 8, 4],
  ["torch", 14, 5, 4, 8],
  ["torch", 14, 9, 4, 0],
];

// The flame inside the torch sprite sits near the top, around logical (7, 2).
// Glow needs to center on the flame, not the sprite box, or it appears on empty ground.
const TORCH_FLAME_LOGICAL_X = 7;
const TORCH_FLAME_LOGICAL_Y = 2;

function buildMapCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = GRID_W * TILE;
  c.height = GRID_H * TILE;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // 1. Tiles
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const isPath = PATH_TILES.has(`${x},${y}`);
      const tile = isPath
        ? pathTile(x * 73 + y * 31 + 7, edgesAt(x, y))
        : grassTile(x * 91 + y * 17 + 13);
      const pal = isPath ? PATH_PALETTE : GRASS_PALETTE;
      for (let py = 0; py < TILE_PX; py++) {
        const row = tile[py];
        for (let px = 0; px < TILE_PX; px++) {
          const ch = row[px];
          const col = pal[ch];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(
            x * TILE + px * SCALE,
            y * TILE + py * SCALE,
            SCALE,
            SCALE,
          );
        }
      }
    }
  }

  // 2. Props
  for (const [name, tx, ty, ox, oy] of PROPS) {
    // Skip props that would sit on a path tile (defensive)
    if (PATH_TILES.has(`${tx},${ty}`)) continue;
    const sprite = getSprite(name, SCALE);
    ctx.drawImage(sprite, tx * TILE + ox * SCALE, ty * TILE + oy * SCALE);
  }

  return c;
}

// Derive screen-pixel flame positions from the PROPS list so glows always
// follow the actual torch sprites.
function torchFlamePositions(): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const [name, tx, ty, ox, oy] of PROPS) {
    if (name !== "torch") continue;
    if (PATH_TILES.has(`${tx},${ty}`)) continue;
    out.push([
      tx * TILE + (ox + TORCH_FLAME_LOGICAL_X) * SCALE,
      ty * TILE + (oy + TORCH_FLAME_LOGICAL_Y) * SCALE,
    ]);
  }
  return out;
}
const TORCH_POSITIONS = torchFlamePositions();

export function getMapCanvas(): HTMLCanvasElement {
  if (!mapCanvas) mapCanvas = buildMapCanvas();
  return mapCanvas;
}

// ---- Public draw helpers --------------------------------------

export function drawMap(ctx: CanvasRenderingContext2D): void {
  ctx.drawImage(getMapCanvas(), 0, 0);
}

export function drawAmbientOverlay(
  ctx: CanvasRenderingContext2D,
  nowSec: number,
): void {
  const playW = GRID_W * TILE;
  const playH = GRID_H * TILE;

  // Path glow — soft purple/dark haze along the path tiles
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.45;
  for (const key of PATH_TILES) {
    const [sx, sy] = key.split(",").map(Number);
    const cx = sx * TILE + TILE / 2;
    const cy = sy * TILE + TILE / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 1.4);
    grad.addColorStop(0, "rgba(58, 32, 80, 0.0)");
    grad.addColorStop(0.4, "rgba(26, 16, 48, 0.7)");
    grad.addColorStop(1, "rgba(10, 10, 24, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - TILE * 1.4, cy - TILE * 1.4, TILE * 2.8, TILE * 2.8);
  }
  ctx.restore();

  // Torch flicker pools (lightly animated). Positions are derived from PROPS
  // and aimed at the actual flame pixel in each torch sprite — not the sprite box.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < TORCH_POSITIONS.length; i++) {
    const [cx, cy] = TORCH_POSITIONS[i];
    const flicker = 0.85 + Math.sin(nowSec * 8 + i * 1.7) * 0.15;
    const r = TILE * 1.3 * flicker;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(255, 160, 60, 0.35)");
    grad.addColorStop(0.6, "rgba(255, 140, 40, 0.08)");
    grad.addColorStop(1, "rgba(255, 140, 40, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  // Vignette
  ctx.save();
  const v = ctx.createRadialGradient(
    playW / 2,
    playH / 2,
    Math.min(playW, playH) * 0.35,
    playW / 2,
    playH / 2,
    Math.max(playW, playH) * 0.75,
  );
  v.addColorStop(0, "rgba(0, 0, 0, 0)");
  v.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, playW, playH);
  ctx.restore();

  // Scanlines (very subtle)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#000";
  for (let y = 0; y < playH; y += SCALE * 2) {
    ctx.fillRect(0, y, playW, 1);
  }
  ctx.restore();
}

export function drawBuildHint(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  ok: boolean,
  rangePx: number,
): void {
  ctx.save();
  ctx.fillStyle = ok ? "rgba(120, 200, 120, 0.25)" : "rgba(220, 80, 80, 0.25)";
  ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);

  if (ok) {
    const c = tileCenter(tx, ty);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rangePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
