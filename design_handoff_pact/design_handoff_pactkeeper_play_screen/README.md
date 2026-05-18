# Handoff: Pactkeeper — Main Play Screen

## Overview

Pactkeeper is a fantasy pixel-art tower defense game. This handoff covers the **main play screen** — the in-match view a player sees during a wave. It shows a top-down winding path across a grass map with placed towers, marching enemies, and a right-side HUD for stats, wave info, and tower building.

The intended mood is **cozy-but-tense fantasy pixel art** — warm earthy palette overall, with ominous cool-tinted lighting (purples, deep blues) hugging the enemy path. Think of a Saturday morning fantasy cartoon that just turned dusk.

## About the Design Files

The files in this bundle are **design references created in HTML/React** — a working prototype showing intended look and behavior, not production code to ship as-is. The task is to **recreate this design in the target codebase's environment** using its established patterns, asset pipeline, and game engine — or, if no codebase exists yet, to choose the most appropriate framework (e.g. Phaser, PixiJS, LÖVE, Unity, Godot) and implement it there.

In particular:
- All sprites in the prototype are hand-coded as 2D color arrays rendered via SVG `<rect>` elements. **In production they should be real PNG sprite sheets** authored by a pixel artist. The prototype sprites only exist to convey scale, palette, silhouette, and arrangement.
- The map's tiles are procedurally generated CSS canvas pixels for the same reason — production should ship a real tilemap (Tiled, Aseprite, or whatever the engine uses) with proper auto-tiling for the path edges.
- The right-side HUD is real UI and should be implemented faithfully.

## Fidelity

**High-fidelity (hifi)** — final colors, typography, layout, sizing, interactions, and motion are intentional and should be matched. Pixel sizes, palette hexes, and animation timings below are authoritative.

## Screens / Views

### 1. Play Screen (single screen, full game viewport)

**Purpose:** Active gameplay — watch enemies, place towers, manage gold, survive waves.

**Layout (root flex row, 14px gap, centered in viewport):**
- **Map frame** — fixed `1056 × 672` px (`COLS=22 × ROWS=14` tiles at `16 logical px × SCALE=3`). Border: 4px solid `#2a1f12` with a 2px `#5a3820` inset outline (mimics wood inside a metal trim).
- **HUD panel** — `340px` wide, full map-height. Same wood border treatment.

The whole composition sits centered on a deep ambient background (`#0a0a0e` with radial gradients at 30%/20% `#1a1525` and 70%/80% `#2a1015`). The game card itself has a `drop-shadow(0 24px 40px rgba(0,0,0,0.6))` to lift it.

#### Map (left side)

Stacked layers (back to front, all absolutely positioned inside the map frame):
1. **Tile canvas** — 22×14 grid of 16×16 grass/path tiles drawn into one `<canvas>`. Procedurally varied so no two tiles look identical.
2. **Ominous path glow** — 30 soft purple radial gradients (`#3a2050 → #1a1030 → transparent`) sampled along the path, blended with `mix-blend-mode: multiply` at opacity `0.55`. This is what gives the path its cursed look.
3. **Spawn portal** — left edge, swirling purple radial: `radial-gradient(circle, #6b3a8a 20%, #2a1040 60%, transparent)`, with `0 0 24px #6b3a8a` outer glow and `inset 0 0 12px #1a0828` core. Animated with `pulse 1.6s infinite`.
4. **Castle gate** — right edge, 32×32 stone keep sprite with red banners (`#c93a3a`) and a dark gate (`#3a2820`).
5. **Props layer** — trees, rocks, torches. Torches emit a warm radial light: `radial-gradient(circle, rgba(255,160,60,0.35), transparent 60%)`, 80×80 px, animated with `flicker 0.4s alternate`.
6. **Towers** — sprites with a 4×12 elliptical shadow under them and a dashed range ring (color matches tower accent at 66% alpha, with a faint radial fill).
7. **Enemies** — sprites with HP bar (12×2 logical px) and a shadow. Each enemy bobs `±2px` on a 0.4s alternate animation, with per-enemy delay derived from id.
8. **Projectiles** — DOM divs (arrow = 5×1 dark line rotated to flight angle; cannonball = 3×3 black circle with `0 0 12px rgba(255,140,40,0.6)` orange glow; frost shard = 4×4 cyan diamond via `clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)` with cyan glow).
9. **Floating damage numbers** — `Press Start 2P` 11px, `floatUp` animation (translateY -26px + fade over 0.9s).
10. **Vignette** — `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)` on top of everything.
11. **CRT scanlines** — `repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0/1px, transparent 1/3px)` at top of frame.
12. **Map badge** (top-left corner of map): wood block `linear-gradient(180deg, #2a1f12, #1a1208)` border `#5a3820`, displaying **"WAVE 3"** (`Press Start 2P` 11px `#e8c440`) over **"— Embergrass Pass —"** (`VT323` 16px `#b5a070`).

#### HUD (right side, top to bottom, 12px gap)

1. **Header** — Title "PACTKEEPER" in `Press Start 2P` 16px `#e8c440` with `2px 2px 0 #1a0c00` shadow and `0 0 8px #c98a3a55` glow. Subtitle "— Defend the Pact —" in `VT323` 14px `#8a7050`. Dashed `2px #5a3820` bottom border.

2. **Stat row** — 2-column grid, 8px gap:
   - **Lives**: heart `❤` (22px `#e84040` with glow), label "LIVES" (`Press Start 2P` 8px `#8a7050`), value `18` (`Press Start 2P` 16px `#f0e8d0`).
   - **Gold**: diamond `◈` (22px `#e8c440` with glow), label "GOLD", value `245`.
   - Each stat in a `#14100a` box, 2px `#3a2818` border, 8×10 padding.

3. **Wave card** (same box treatment):
   - Top row: "WAVE" label (8px) over "3/5" count (22px main + 12px subdued). On the right, 5 square pips (14×14). Pips: empty `#0a0806`, done `#5a8a3a` (green stone), active `#c98a3a` (amber) with `pip-pulse 1s` glow animation.
   - **Progress bar** — 10px tall, `#0a0806` track, fill is `linear-gradient(180deg, #e84040, #a02020)` with `inset 0 1px 0 #ff8060` highlight. A `shimmer 2.5s linear` white-translucent sweep overlay.
   - Meta line below: red pulsing dot + "12 remaining" + "Boss in Wave 5" (`#7a3050`).

4. **Build picker** — header row "BUILD" (`Press Start 2P` 9px `#c98a3a`) with hint `[1] [2] [3]` (`#5a3820`). Then three tower cards.
   
   **Tower card** (grid: 44px sprite | flex info | 22px hotkey):
   - Box: `#14100a` bg, 2px `#3a2818` border, 8px padding.
   - Sprite well: 44×44, `#0a0806`, 1px `#3a2818` border.
   - Name (`Press Start 2P` 9px, colored to tower accent, 1px black shadow).
   - Description (`VT323` 14px `#8a7050`).
   - Cost: diamond `◈` + amount in `Press Start 2P` 10px `#e8c440`. Strike-through `#e83a3a` if unaffordable.
   - Hotkey badge: 22×22, `Press Start 2P` 10px `#c98a3a` on `#0a0806`.
   - **Hover**: border shifts to accent color, translateX(-2px).
   - **Selected**: thicker accent border, accent-tinted background, outer accent glow, blinking `►` cursor indicator on the left.
   - **Locked** (can't afford): 0.55 opacity.

5. **Footer** — 2-column grid (1fr 1.4fr, 6px gap):
   - **PAUSE** button: ghost style, `#c98a3a` text on `#14100a`, 2px `#3a2818` border, `0 2px 0 #000` drop.
   - **FAST FORWARD** button: primary style, green gradient `linear-gradient(180deg, #5a8a3a, #3a5520)` with `inset 0 1px 0 #7aaa54` top highlight.
   - Both: `Press Start 2P` 9px, 10×8 padding, press-down animation on `:active` (translateY 1px + smaller shadow).

6. **Tip card** — bottom of HUD. `#1a1208` bg, 1px dashed `#5a3820` border. Yellow exclamation glyph (22×22 `#c98a3a` square with black border and inset highlight) + tip text (`VT323` 14px `#a09070`). Copy: *"Goblins are fast but fragile. Use Frost Spires on the long stretches."*

## Interactions & Behavior

### Tower selection
- Click a tower card in the HUD → that tower becomes "selected" (highlighted, blinking ►).
- Number keys `1` / `2` / `3` should also select (prototype shows hint; bind these in production).
- Click again to deselect.
- While selected: a **ghost preview** of the tower follows the mouse cursor on the map.
  - Ghost is semi-transparent (0.75 opacity).
  - Ghost shows a dashed range ring in the tower's accent color.
  - On invalid tiles (path tiles, or insufficient gold): ghost tints red (`filter: sepia(1) hue-rotate(-50deg) brightness(0.9)`) and range ring becomes red.

### Tower placement
- Click an empty tile while a tower is selected → place it. Deduct cost from gold. Tower starts firing immediately.
- Path tiles are unplaceable.

### Enemies
- Spawn at the portal (left edge), march along the path waypoints, exit at the castle (right edge).
- Speed varies by type (see Design Tokens below).
- If chilled (recently hit by Frost Spire), speed × 0.45 for 1500ms. A `❄` glyph appears on the enemy and a hue-rotate filter tints them blue.
- HP bar above each enemy: green > 50%, yellow > 25%, red below. 1px black outline.
- Bob animation: `translateY(0 → -2px)`, 0.4s ease alternate. Each enemy has a per-id delay so the wave doesn't bob in sync.
- On reaching the castle: subtract 1 life, despawn. (Prototype just despawns; wire life-loss in production.)

### Towers (firing logic)
- Every tower has `range`, `rate` (ms between shots), `dmg`.
- On each tick: find nearest enemy within range. If found and cooldown expired, fire a projectile at the enemy's current path position.
- Projectile travels at fixed speed (arrow 380, frost 280, cannon 220 logical px/s) toward the target's last position (no leading — keep it simple).
- On impact: deduct damage from target. If frost, apply chill.
- Floating damage number spawns at impact point, color-coded by tower type:
  - Archer hit → `#ffe070`
  - Cannon hit → `#ffb060`
  - Frost hit → `#9ae0ec`
- Dead enemies (`hp ≤ 0`) despawn and award gold (prototype doesn't credit gold yet — wire this).

### Wave progression
- Wave counter advances when all enemies in the wave are dead and any remaining spawn queue is empty.
- Pip indicator: completed waves turn green; current wave amber and pulses.
- Boss flag on Wave 5 should trigger a special enemy with a name + larger sprite (not built in prototype).
- "12 remaining" updates live as enemies die or reach the castle.

### Buttons
- **PAUSE**: stops all timers/animations.
- **FAST FORWARD**: doubles game speed (don't double animation frame rate — double the `dt` you feed sim).

## State Management

Suggested state shape:

```ts
type GameState = {
  lives: number;        // starts 20, dec on enemy escape
  gold: number;         // starts ~200, +X per kill, -tower.cost per build
  wave: number;         // 1..totalWaves
  totalWaves: number;
  waveProgress: number; // 0..1 within current wave
  enemiesRemaining: number;
  paused: boolean;
  fastForward: boolean;
  selectedTowerType: 'archer' | 'cannon' | 'frost' | null;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
};

type Tower = {
  id: string;
  type: 'archer' | 'cannon' | 'frost';
  tx: number; ty: number;       // tile coords
  range: number;                // in tiles
  rateMs: number;
  damage: number;
  lastFiredAt: number;          // timestamp
};

type Enemy = {
  id: string;
  type: 'orc' | 'goblin' | 'skeleton';
  pathT: number;                // 0..1 along the path
  speed: number;                // pathT per second
  hp: number; maxHp: number;
  chillUntil: number | null;    // timestamp
};

type Projectile = {
  id: string;
  kind: 'arrow' | 'cannon' | 'frost';
  x: number; y: number;         // logical px
  toX: number; toY: number;
  speed: number;                // logical px/s
  damage: number;
  targetId: string;
};
```

Run sim on a fixed-step or rAF loop, render on every frame.

## Design Tokens

### Colors

**Foundational palette (wood / parchment frame):**
| Token | Hex |
|---|---|
| Frame wood dark | `#2a1f12` |
| Frame wood mid  | `#5a3820` |
| Frame wood light | `#8a5a2a` |
| Panel bg dark   | `#14100a` |
| Panel bg deeper | `#1a1208` |
| Panel bg deepest | `#0a0806` |
| Border inner    | `#3a2818` |
| Text primary    | `#f0e0c0` |
| Text muted      | `#8a7050` |
| Text dim        | `#a09070` |
| Text amber      | `#c98a3a` |
| Text gold       | `#e8c440` |

**Map / grass:**
| Token | Hex |
|---|---|
| Grass shadow | `#3d5e22` |
| Grass dark | `#4a7530` |
| Grass base | `#5a8a3a` |
| Grass light | `#6a9a44` |
| Grass highlight | `#7aaa54` |
| Grass tuft bright | `#8aaa60` |
| Grass ominous tinge | `#3a4520` |

**Map / path (dirt):**
| Token | Hex |
|---|---|
| Path outline | `#2a1a10` |
| Path very dark | `#4a2e18` |
| Path dark | `#6a4520` |
| Path mid | `#8a6030` |
| Path light | `#a07840` |
| Path pebble dark | `#3a2820` |
| Path pebble | `#7a6450` |
| Path ominous shadow | `#1a1014` |

**Atmospheric:**
| Token | Hex |
|---|---|
| Ambient bg base | `#0a0a0e` |
| Ambient bg purple | `#1a1525` |
| Ambient bg red | `#2a1015` |
| Path glow inner | `#3a2050` |
| Path glow outer | `#1a1030` |
| Torch light tint | `rgba(255,160,60,0.35)` |
| Portal swirl | `#6b3a8a` |
| Portal core | `#2a1040` |

**Tower accents:**
| Tower | Accent | Notes |
|---|---|---|
| Archer | `#c93a3a` (red banner) | warm |
| Cannon | `#c98a3a` (brass) | warm |
| Frost | `#7ad4e8` (ice cyan) | cool |

**Status / feedback:**
| Use | Hex |
|---|---|
| HP good | `#5acc3a` |
| HP warn | `#e8c440` |
| HP bad | `#e83a3a` |
| Lives heart | `#e84040` |
| Gold coin | `#e8c440` |
| Wave-pip done (green) | `#5a8a3a` |
| Wave-pip active (amber) | `#c98a3a` |
| Boss text | `#7a3050` |
| Damage number — archer | `#ffe070` |
| Damage number — cannon | `#ffb060` |
| Damage number — frost | `#9ae0ec` |

### Tower stats (prototype values — tune in production)

| Tower | Cost | Range (tiles) | Fire rate (ms) | Damage |
|---|---|---|---|---|
| Archer Roost | 60 | 4.2 | 700 | 8 |
| Bombard | 110 | 3.4 | 1400 | 22 |
| Frost Spire | 140 | 3.6 | 1100 | 4 (+1.5s chill, 0.45× speed) |

### Enemy stats

| Enemy | HP | Speed (pathT/s) | Notes |
|---|---|---|---|
| Orc | 60 | 0.018 | heavy, slow |
| Goblin | 30 | 0.026 | fast, fragile |
| Skeleton | 45 | 0.022 | medium |

Speed `0.020` means one full path traversal in ~50 seconds.

### Typography

- **Display / numerics** — `Press Start 2P` (Google Font). Sizes used: 8px (micro labels), 9px (card headers), 10px (cost / hotkey), 11px (badge), 16px (title + stat values), 22px (wave count).
- **Body / descriptions** — `VT323` (Google Font). Sizes: 14px (descriptions, tips, meta), 15px (wave meta), 16px (badge subtitle), 18px (HUD default).
- Both fonts must be loaded with the bundle (or substituted with similar bitmap/pixel fonts: e.g. Silkscreen, m6x11, Pixelify Sans).
- All `Press Start 2P` text uses a 1–2px hard black shadow (`1px 1px 0 #000` or `2px 2px 0 #1a0c00`) for that arcade-stencil read.

### Spacing scale

| Use | Value |
|---|---|
| Game root padding | 16px |
| Game-to-HUD gap | 14px |
| HUD outer padding | 14px |
| HUD vertical stack gap | 12px |
| Stat row internal gap | 8px |
| Tower card internal gap | 10px |
| Tower card vertical gap | 6px |
| Footer button gap | 6px |
| Tip card padding | 8px 10px |

### Border / radius / shadow tokens

- **No rounded corners anywhere.** All panels, cards, buttons, and HP bars are square. This is critical to the pixel-art aesthetic.
- Frame borders: 4px outer (`#2a1f12`) + 2px inset outline (`#5a3820`). Total 6px chrome.
- Panel borders: 2px solid `#3a2818` with `inset 0 0 0 1px #5a382055` inner highlight on most cards.
- Button drop shadow: `0 2px 0 #000` (rest) → `0 3px 0 #000` (hover, translateY -1px) → `0 1px 0 #000` (active, translateY +1px).
- Glow shadows on accented elements: `0 0 8px <accent>55` typical, up to `0 0 24px` for the spawn portal.

### Animation tokens

| Name | Duration | Easing | Direction | Purpose |
|---|---|---|---|---|
| `bob` | 0.4s | ease-in-out | alternate | Enemies idle bob |
| `pulse` | 1.2–1.6s | ease-in-out | infinite | Portal, alert dots |
| `flicker` | 0.4s | ease-in-out | alternate | Torch flames |
| `pip-pulse` | 1s | ease-in-out | infinite | Active wave pip |
| `shimmer` | 2.5s | linear | infinite | Wave progress bar gloss |
| `blink` | 0.7s | steps(2) | infinite | Selected ► cursor |
| `floatUp` | 0.9s | ease-out | forwards | Damage numbers |

## Assets

The prototype has **no external image assets** — every sprite is a hand-coded color matrix rendered live. For production, an artist should author:

**Sprite list to commission:**
- **Towers (3)**: Archer Roost, Bombard (cannon), Frost Spire — each ~16×16 base sprite, ideally with 2–3 tier variants and an idle 2-frame breathing loop.
- **Enemies (3+)**: Orc grunt, Goblin runner, Skeleton soldier — 16×16, with at least walk (4 frames) and death (2 frames) animations per direction.
- **Boss enemy** for Wave 5 — 32×32, named.
- **Tile set**: grass (multiple variants), path (with auto-tile edge transitions for all 8 neighbours), water/cliff edges (optional).
- **Props**: trees (2–3 variants), rocks, torch (with a flame anim).
- **Castle gate**: 32×32 at minimum, with a banner.
- **Spawn portal**: 16×16 swirl with a 3–4 frame loop.
- **Projectiles**: arrow, cannonball, frost shard — small, with optional trail.
- **HUD icons**: heart (lives), coin (gold), wave glyph, pause, fast-forward — pixel-styled to match.

Until art is delivered, the prototype's coded sprites are placeholders. They get the silhouette and palette right but should not ship.

## Files

In this bundle:

| File | Purpose |
|---|---|
| `Pactkeeper.html` | Root document. Loads React, Babel, and the three JSX modules + stylesheet. |
| `styles.css` | All HUD chrome, panel styling, animations. Fonts imported from Google. |
| `sprites.jsx` | Sprite palettes, sprite data arrays (16×16 / 32×32), and the `<Sprite>` SVG renderer. |
| `map.jsx` | Tile palettes, procedural grass/path tile generators, path waypoints, and `pointOnPath(t)` for enemy positioning. |
| `app.jsx` | Game loop, towers, enemies, projectiles, HUD, App root. |

Open `Pactkeeper.html` in a browser to see the design running. Hover the map with a tower selected from the HUD to preview placement; click to place.

---

**One-line summary for your handoff ticket:**  
*Recreate the Pactkeeper main play screen — a 1056×672 pixel-art tower defense map with a 340px wood-framed HUD on the right — matching the colors, type, layout, and motion specified above, using real pixel-art sprite assets in place of the prototype's coded ones.*
