# PACTKEEPER — Agent Orientation

A browser-based tower defense in TypeScript + Vite. Players choose up to three
**Pacts** (curse + gift modifiers) before each level, then defend a fixed path
through six waves culminating in a boss.

This file is the canonical orientation for any agent (human or AI) working in
this repo. Read it first. Source of truth for architecture, units, and
conventions. Recipes for common tasks live in [`docs/recipes.md`](docs/recipes.md).

---

## Run / verify

| Goal | Command |
| --- | --- |
| Dev server (live reload) | `npm run dev` — http://localhost:5173 |
| Typecheck + production build | `npm run build` — runs `tsc -b` then `vite build` |
| Preview built bundle | `npm run preview` |

`npm run build` is **the** "is this still valid" check. If it passes, the change
typechecks and bundles. There are no tests yet.

---

## Repo layout

```
index.html              Two stages: #canvas-stage (game) + #pact-stage (DOM pact UI)
src/
  main.ts               Entry. Owns stage swap (canvas <-> DOM pact screen).
  game.ts               Game class. rAF loop, screen state, input, placement.
  pact-screen.ts        DOM PactScreen class. Mounts on #pact-stage.
  pacts.css             Styles for the DOM pact screen ONLY.
  config.ts             Constants. Grid size, palettes, ENEMY_DEFS, TOWER_DEFS, PATH.
  types.ts              All shared types. The schema of the game.
  modifiers.ts          PACTS roster + applyPacts(). Each pact mutates a PactEffects.
  waves.ts              WAVES roster (groups of enemy spawns).
  enemy.ts              spawnEnemy / updateEnemy / drawEnemy + boss phase logic.
  tower.ts              createTower / updateTower / drawTower + targeting.
  projectile.ts         createProjectile / stepProjectile (collision via target id).
  map.ts                Path tile set, build map canvas, ambient overlay (torches).
  hud.ts                Right-side HUD panel (gold, lives, wave card, tower picker).
  screens.ts            drawEndScreen (victory/defeat overlay).
  sprites.ts            16×16 pixel-art sprites + palettes + pre-render cache.
  sigils.ts             16×16 sigil sprites for the pact UI; renders to SVG strings.
  globals.d.ts          Module declaration so TS allows `import "./pacts.css"`.

design_handoff_*/       Design references (jsx + css mockups). Not imported.
docs/recipes.md         Step-by-step "add a tower / enemy / pact / wave" guides.
```

---

## Architecture: two-stage UI

The pact screen and the play screen are intentionally **different rendering
systems**. They never coexist on screen.

```
              main.ts
   ┌────────────┴────────────┐
   ▼                         ▼
PactScreen (DOM)         Game (canvas)
 #pact-stage              #canvas-stage
   ▼                         ▼
 onSeal(chosen) ─────► beginLevelWithPacts(ids)
                          ▼
                       run waves; lives <= 0 or boss cleared
                          ▼
                       endLevel(victory) ─► onLevelEnd ─► showPact()
```

Why: the pact screen needs CSS gradients, animations, and real fonts; the play
screen needs pixel-perfect canvas rendering. Each stage hides the other via the
`hidden` attribute. `Game.start()` runs continuously regardless — when the
canvas stage is hidden, the loop is invisible (and harmless because no level
state exists yet).

### Game screen state machine

`Game.screen: "playing" | "victory" | "defeat"`. The legacy `"pact"` value is
defined in `types.ts` but no longer reachable — selection is owned by the DOM
`PactScreen`. See "Known anomalies" below.

```
            beginLevelWithPacts()
   playing ──────────► (waves run) ──────► boss cleared ─► victory
       │                                                      │
       │ lives <= 0                                            │
       └────────────► defeat                                  │
                          │                                    │
                          └──main.ts setTimeout(1600ms)────────┴► PactScreen
```

---

## Coordinate systems & units

Every coordinate question reduces to one of these. **Get this wrong and things
render in the wrong place.**

| Name | Range | Used by | Conversion |
| --- | --- | --- | --- |
| Tile coords `(tx, ty)` | `0..GRID_W-1`, `0..GRID_H-1` | `PATH`, tower placement, build hint, `PATH_TILES` | `tx * TILE` ⇒ left edge in screen px |
| Screen pixels `(x, y)` | `0..CANVAS_W`, `0..CANVAS_H` | enemy/tower/projectile `pos`, mouse, all `ctx.draw*` | `Math.floor(x / TILE)` ⇒ tx |
| Logical (sprite) pixels | `0..16` per tile | sprite source data, prop offsets | `* SCALE` ⇒ screen px |

Three constants from `config.ts` you will use constantly:

- `TILE_PX = 16` — logical pixels per tile (sprite is 16×16)
- `SCALE = 2` — screen pixels per logical pixel (pixel-art zoom)
- `TILE = TILE_PX * SCALE = 32` — screen pixels per tile

**Speed has its own unit.** Enemy `speed` is *tiles per second* in `config.ts`,
but `updateEnemy` multiplies by `TILE` to get screen px/sec. Don't change the
unit at the source without auditing `enemy.ts`.

**The HUD steals canvas width.** `CANVAS_W = GRID_W * TILE + HUD_W`. Anything
clicking on the play field must check `mx < TILE * GRID_W`. Anything drawing on
the HUD uses `HUD_X = GRID_W * TILE` as origin.

---

## Game loop & data flow

```
requestAnimationFrame ─► update(dt)            ─► render()
                            │
                            ├ updateWaveSpawning  → enemies.push(spawnEnemy)
                            ├ updateEnemy          → walks PATH waypoints
                            ├ handleEnemyEnd       → lives -=, filter dead
                            ├ updateTower          → projectiles.push(createProjectile)
                            ├ stepProjectile       → hit detection by target id
                            └ end-of-wave / lives  → endLevel(victory|false)
```

Order matters in `update`: spawn → enemies move → towers fire → projectiles
step → end-of-wave checks. Reordering can cause off-by-one frames or "boss
spawned and ended in the same tick".

**Effects flow.** `applyPacts(chosen)` returns a `PactEffects` struct of
multipliers. Those multipliers are passed *as arguments* into `spawnEnemy`,
`updateTower`, and `tryPlaceTower`. The simulation primitives never read `Game`
state directly — keep it that way; it makes them testable and trivially reusable.

---

## Conventions

These are auto-applied via [`.cursor/rules/pactkeeper.mdc`](.cursor/rules/pactkeeper.mdc).
Restated here so humans see them too.

1. **Single source of truth for game content.** Towers in `TOWER_DEFS`
   (`config.ts`); enemies in `ENEMY_DEFS`; pacts in `PACTS` (`modifiers.ts`);
   waves in `WAVES` (`waves.ts`); sprites in `SPRITES_16` (`sprites.ts`); sigils
   in `SIGILS` (`sigils.ts`). Add to the registry — don't hard-code.
2. **No magic numbers in `game.ts`.** Tunable values live in `config.ts` (or
   the per-feature module). The exception is layout constants in `hud.ts` and
   `screens.ts` where they're declared at the top of the file.
3. **Tile coords stay tile coords.** Convert at the boundary (mouse → tile,
   tile → render). Never mix px and tiles in the same expression.
4. **Effects arrive as parameters, not globals.** Functions that depend on
   `PactEffects` take the multipliers they need as args. See `spawnEnemy`,
   `updateTower`, `rangeOf`.
5. **Sprite registries match palette registries.** Adding a sprite requires
   either reusing a palette (`paletteFor` in `sprites.ts`) or adding one. Tower
   sprites use the `<kind>Tower` naming convention so `paletteFor` strips it.
6. **Game state mutates in place; rendering reads.** Never compute new state
   inside `drawX` functions; never draw inside `updateX` functions.
7. **One id space per kind.** `enemy.nextId`, `tower.nextId`, `projectile.nextId`
   are independent module-level counters. Don't share them.

---

## Key invariants (things that will silently break if violated)

- `PATH` is connected by axis-aligned steps. `buildPathTiles()` walks one axis
  at a time; diagonal segments would skip tiles.
- `PATH[0]` and `PATH[PATH.length-1]` sit **off-grid** on purpose so enemies
  enter/exit cleanly. Don't make them valid tiles or `isBuildable` lets you
  build on the entry.
- `Tower.tile` and `Tower.pos` must agree: `pos = tile * TILE + TILE/2`.
- `Projectile.targetId` is by **id**, not reference. The projectile resolves the
  enemy each frame — losing reference is fine, the projectile re-acquires.
- An enemy with `reachedEnd === true` is consumed in `handleEnemyEnd` (lives
  decrement, then flag cleared). Don't read `reachedEnd` outside `handleEnemyEnd`.
- `endLevel` is idempotent via `endNotified`. Call it as many times as you want.

---

## Known anomalies (worth fixing eventually)

These don't break anything today but will trip up future agents.

- **Dead canvas pact picker.** `screens.ts` exports `drawPactPicker` and
  `hitPactPicker` plus the `"pact"` `GameScreen` literal — none are called now
  that the DOM `PactScreen` is the live UI. Safe to delete `drawPactPicker` /
  `hitPactPicker` and remove `"pact"` from `GameScreen`.
- **`design_handoff/` is empty.** `design_handoff_pact/` and
  `design_handoff_pactkeeper_play_screen/` carry the actual references.
- **Adapted pact copy.** Six pacts in `modifiers.ts` describe mechanics not yet
  implemented (skeleton revival, multi-arrow towers, kill-stacking damage,
  destructible towers, scheduled boss spawn, max-tower-slot). Their `apply()`
  uses approximations from the existing `PactEffects` schema. Search for
  `Adapted copy:` to find them. Implementing the real mechanics is a unit of
  work each.
- **`Enemy.color` is unused.** Sprite rendering supplanted it; field kept for
  HP-bar fallback that no longer fires. Removable.
- **`tsconfig.tsbuildinfo`** can be regenerated; in `.gitignore`.

---

## Out of scope (good ideas, not built)

- Tower upgrade / sell
- Pause / speed-up
- Per-tower targeting modes (first / last / strongest)
- Sound
- Persistent meta-progression between runs
- Multiple maps
