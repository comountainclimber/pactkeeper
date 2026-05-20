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
  pacts.css             Styles for the DOM pact screen, tabs, Hall, popovers.
  config.ts             Constants. Grid size, palettes, ENEMY_DEFS, TOWER_DEFS, PATH.
  levels.ts             LEVELS roster (3 realms). Resolves the active level from URL/LS.
  types.ts              All shared types. The schema of the game.
  modifiers.ts          PACTS roster + applyPacts() + totalPactXp(). Each pact mutates a PactEffects.
  score.ts              Scoring formulas + leaderboard persistence (Hall of Keepers).
  waves.ts              WAVES roster (groups of enemy spawns).
  enemy.ts              spawnEnemy / updateEnemy / drawEnemy + boss phase logic.
  tower.ts              createTower / upgradeTower / updateTower / drawTower + targeting + tier badge.
  tower-popover.ts      DOM tower upgrade popover. Mounts on #popover-stage.
  projectile.ts         createProjectile / stepProjectile (collision via target id).
  map.ts                Path tile set, build map canvas, ambient overlay (torches).
  hud.ts                Right-side HUD panel (gold, lives, score, wave card, tower picker).
  screens.ts            drawEndScreen (victory/defeat overlay).
  sprites.ts            16×16 pixel-art sprites + palettes + pre-render cache.
  sigils.ts             16×16 sigil sprites for the pact UI; renders to SVG strings.
  heroes.ts             HEROES roster + create/update/draw + WASD-controlled hero primitives.
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
                                                                      │
                                                                      ▼
                                                          show(pending: RunSummary)
                                                          → inscription overlay
                                                          → saveScore() → Hall tab
```

---

## Scoring & Hall of Keepers

`src/score.ts` owns the scoring formula and the leaderboard. The play loop
accumulates a `rawScore` (per-kill + realm-clear bonus); `Game.endLevel` calls
`finalize()` to add a life bonus and apply the pact-XP multiplier:

```
final = round((rawScore + livesLeft * LIFE_BONUS) * (1 + pactXp / 1000))
```

| Pact XP totals | Multiplier |
| --- | --- |
| 0 | ×1.00 (no pacts sealed) |
| 100 | ×1.10 |
| 250 | ×1.25 |
| 660 (all three hardest) | ×1.66 |

Per-kill points live in `score.ts#ENEMY_SCORE` (goblin 10, skeleton 18, orc 28,
boss 500). Realm-clear bonus: 1000. Life bonus: 50/life.

Persistence: top 25 entries in `localStorage["pk-scores"]`, sorted desc.
Player name in `localStorage["pk-name"]`. The pact screen's THE HALL tab
renders the leaderboard via `loadScores()`; the inscription overlay (shown
when `PactScreen.show()` receives a `RunSummary`) writes via `saveScore()`.

`Game` exposes `runSummary(outcome)` and emits a `RunSummary` through
`onLevelEnd`; `main.ts` forwards it to `pact.show(pending)`.

---

## Input model (mouse, touch, pen)

`Game` listens on **pointer events** (`pointerdown`/`pointermove`/
`pointerleave`) so mouse, touch, and pen all flow through one code
path. The canvas has `touch-action: none` (set in `index.html`) so a
tap on the play field is never hijacked by browser pinch-zoom or
double-tap-to-zoom; this also eliminates the 300ms tap delay on iOS.

`Game.onPointerDown` resolves a single tap/click top-down:

1. HUD card → select/deselect a tower kind.
2. Tower in hand + tap on buildable tile → place tower.
3. Tap on a placed tower → open the upgrade popover.
4. Tap on empty grass with the popover open → dismiss popover.
5. Tap on empty grass with nothing else open → set the hero's
   walk-to destination (tap-to-move).

The "tap on empty grass moves the hero" rule is the mobile-controls
backbone. It also works on desktop (clicks behave the same), and
**WASD always overrides** a pending destination — see "Hero input
modes" below.

## Heroes

A **hero** is the player-controlled champion. One is chosen on the pact screen
(top-of-screen picker, below the title), persists across realms via URL +
localStorage, and is reset to full HP at every level start.

### State machine

```
beginLevelWithPacts(.., heroKind)
        │
        ▼
   ┌─ ALIVE ──────── enemies in contactRange ───► hp -= 6 every 0.8s
   │   │                                               │
   │   ▼                                               ▼
   │  WASD moves hero  ─── pickHeroTarget ──► auto-attack       hp <= 0
   │                                                                │
   │                                                                ▼
   └─ DEAD (10s)  ◄────────────── respawnAt = now + HERO_RESPAWN_SEC
        │
        ▼
   respawnHero(spawnPos) → ALIVE (no lives lost on death)
```

### Path blocking

When the hero stands on a path tile, `Game.update()` builds an `EnemyBlocker`
(tile + screen-px center + halt radius) and passes it to `updateEnemy`. Any
ground enemy within `halt` (≈ 0.6 × TILE) skips its step until the hero moves
off. Flying enemies ignore the block — they're over the hero's head.

### Hero input modes

Two parallel paths feed `moveHero`, in priority order:

1. **WASD held keys** (desktop). `Game.updateHeroMovement` builds a
   unit-vector input from `this.heldKeys` and passes it in. Any
   non-zero input cancels a pending tap destination so the player's
   keyboard control always wins.
2. **Tap destination** (touch + click-to-move). `Game.onPointerDown`
   calls `setHeroDestination(hero, pos)` whenever the player taps an
   uninteractive spot on the play field; `moveHero` walks toward
   `hero.destination` whenever WASD input is zero. The destination
   clears on arrival (within `HERO_DESTINATION_ARRIVE_PX`).

A tap destination is also drawn on the field as a pulsing accent ring
(`drawHeroDestination`) so the player has visual confirmation of the
queued waypoint. The marker disappears on arrival or whenever WASD
takes over.

### Effects flow

Per the project's sim-primitives-take-args rule, the hero subsystem follows
the same pattern as towers:

- `moveHero(hero, inputX, inputY, dt)` — pure; reads only the hero + input.
  Honors `hero.destination` when input is zero; clears it on arrival.
- `setHeroDestination(hero, pos)` — pure; clamps to the play field and
  stores the tap target on the hero. Used by the pointer handler.
- `updateHero(hero, dt, enemies, projectiles)` — picks a target, fires (or
 returns a melee target for `Game.damageEnemy` to apply); plays SFX.
- `heroContactDamage(hero, enemies, nowSec)` — returns the damage tick this
 frame; caller applies it and resolves death.
- `updateEnemy(e, dt, now, blocker?)` — opaque to "hero"; just sees a
 generic blocker.

### Pacts (v1)

Hero damage is **not** scaled by `PactEffects.towerDamageMult` today. Heroes
are a separate balance lever; if a future pact wants to swing hero power,
extend `updateHero` to take a `damageMult` arg the way `updateTower` does.

### Adding a hero

See `docs/recipes.md#add-a-new-hero`. The doc-check enforces:
- Every `HEROES[kind].sprite` resolves in `SPRITES_16`.
- `docs/recipes.md` mentions `HEROES`.

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

## Anti-air & flying enemies

The airborne rule is a single boolean × boolean contract:

- `Enemy.flying?: boolean` — set on enemies that fly. Today only `bat` has it
  (in `ENEMY_DEFS`, `src/config.ts`).
- `TOWER_DEFS[kind].canHitFlying: boolean` — kind-level capability, **not
  per-tier**. Today only `arrow` has it; `cannon` and `frost` have
  `canHitFlying: false`.

A tower may damage an enemy iff `canHitFlying || !enemy.flying`. The negation
is enforced (= "skip the enemy") at three places — they must agree, or a
tower will fire shots that never connect (or worse, connect but shouldn't):

| Site | File | Why |
| --- | --- | --- |
| `pickTarget` | `src/tower.ts` | Don't even fire — flying enemies aren't valid targets for ground-only towers. |
| `stepProjectile` | `src/projectile.ts` | A projectile already in flight skips flying enemies during mid-flight collision. The flag is copied onto the projectile at fire time (`Projectile.canHitFlying`) so the rule survives if the tower is sold mid-flight. |
| `Game.updateProjectiles` splash loop | `src/game.ts` | Splash damage from a cannon must also respect the rule — don't shrapnel a bat. |

Two visual affordances tell the player which towers do which:

- **HUD tower card label.** `drawHud` in `src/hud.ts` reads `def.canHitFlying`
  and renders an `ANTI-AIR` or `GROUND` badge on each tower card automatically
  — no per-kind UI work when adding a tower.
- **Range-circle "no-fly" badge.** Towers without anti-air get a circled
  no-fly mark on their range ring, both for placed towers (`drawTower` in
  `src/tower.ts`) and the placement preview (`drawBuildHint` in `src/map.ts`).
  Both call sites import the shared `drawNoFlyBadge` exported from
  `src/tower.ts`.
- **Tower-popover stat line.** `src/tower-popover.ts` shows an `ANTI-AIR` row
  in the stat block (Yes/No), driven from the same kind-level flag.

There is also one SFX hook in this rule:

- `batDie()` is synthesised in `public/music.js`, typed on the runtime SFX
  shape in `src/globals.d.ts`, and wired in `src/game.ts` `damageEnemy`'s
  `deathSfx` map keyed by `EnemyKind`. Adding a new enemy with its own death
  cue is a three-edit process — see the recipe in `docs/recipes.md`.

The rule is enforced at build time by `scripts/doc-check.ts`: if any
`ENEMY_DEFS` entry has `flying: true` and no `TOWER_DEFS` entry has
`canHitFlying: true`, the build fails (the game would be unwinnable).

**If you add per-tier anti-air** (e.g. T3 cannon should suddenly hit fliers),
`canHitFlying` must be promoted from kind-level to tier-level. The five sites
to update are: `TOWER_DEFS` schema (`src/config.ts`), `pickTarget` and the
projectile fire-time copy in `src/tower.ts`, `stepProjectile` in
`src/projectile.ts`, the splash loop in `src/game.ts`, and the three visual
affordances above (HUD card label, range-circle badge, popover stat line).
The doc-check invariant only needs adjustment if the kind-level field is
removed entirely.

---

## Music & SFX (per-level themes)

Audio lives in `public/music.js` — pure Web Audio API synthesis, no
samples. The file exposes two singletons on `window`:

- `window.PactkeeperMusic` — the music engine. Per-level themes;
  crossfades on theme switch.
- `window.PactkeeperSFX` — one-shot sound effects (tower fires, enemy
  deaths, hero attacks, UI clicks). The runtime shape is typed in
  `src/globals.d.ts`.

### Theme registry

`THEMES` in `music.js` is the single source of truth for level music.
Each theme is a struct of `{ loopDur, targetVolume, drone, pad,
progression, sub, bells, bellGain, bellDur, horn?, drums? }` — a
declarative composition that the engine schedules through shared
voices (`pad`, `bell`, `sub`, `horn`, `drum`). Adding a theme means
appending one entry; you don't need to touch the engine.

| Theme | Level | Mood |
| --- | --- | --- |
| `altar` | (pact screen) | Dm ritual ambience — slow, mysterious, distant bells |
| `embergrass` | 1 — Embergrass Pass | E Aeolian woodland — sine/triangle pads, sustained warden's horn, sparse mid-bells |
| `hollowmere` | 2 — Hollowmere Mire | A Phrygian drowned chorus — pure-sine choir with vibrato, deep sub, cracked bells, heavy reverb |
| `ashen` | 3 — Ashen Reach | D Phrygian cinematic dread — sawtooth brass, low war drum every 2s, urgent high bells |

`LEVEL_THEMES` (also in `music.js`) maps a campaign level id (1..3) to
its theme; id 0 + any unknown id falls through to `altar`.

### Stage swap → theme swap

Two transitions trigger theme changes, both wired in `src/main.ts`:

| Transition | Call |
| --- | --- |
| Pact altar shown (boot, defeat, final victory) | `PactkeeperMusic.setTheme("altar")` |
| Level begins (seal, mid-campaign reload) | `PactkeeperMusic.playLevel(CURRENT_LEVEL.id)` |

Both methods are safe to call before the user has unlocked audio — they
just record the desired theme so the next user-gesture-triggered
`start()` picks it up. A theme change while playing fades out and back
in over ~1.4s; an external `stop()` (user clicks the OFF toggle)
cancels any queued restart.

### Adding a level → adding music

When you add a campaign level, also:

1. Append a theme to `THEMES` in `public/music.js`.
2. Map its level id to the theme name in `LEVEL_THEMES` (same file).
3. Update the theme table above so future agents know what's there.

If you skip steps 1–2 the level falls back to the altar theme silently
— functional but undermines the "each realm has its own atmosphere"
design intent.

### Hero / enemy SFX hooks

Per-kind death cues + hero attack cues are typed in
`src/globals.d.ts#PactkeeperSFXInstance` and synthesised in
`public/music.js`. Adding a new enemy/hero with its own audio cue is a
three-edit chain:

1. Add the synth method in `public/music.js#SFX`.
2. Add it to the `PactkeeperSFXInstance` type in `src/globals.d.ts`.
3. Wire it from `src/game.ts` (`damageEnemy` for enemy deaths;
   `updateHero`/`updateHeroCombat` for hero attacks).

---

## Mobile / responsive layout

The game is playable on phones (portrait + landscape) as well as
desktop. Three pieces work together:

| Concern | Where it lives |
| --- | --- |
| Viewport / safe-area / no-zoom | `<meta name="viewport">` + the `:root` `--app-vh` variable in `index.html` |
| Canvas sizing (any aspect) | `#canvas-stage canvas { max-width: min(100vw - 12px, (var(--app-vh) - 12px) * 2.107) }` in `index.html` — both axes bound simultaneously |
| Tap surface contract | `touch-action: none` on the canvas (no scroll / pinch / double-tap-zoom); pact screen left scrollable so swipes work |
| Pointer input | `Game` uses `pointerdown`/`pointermove` (covers mouse, touch, pen) — see "Input model" above |
| Hero control on touch | Tap on empty grass → `setHeroDestination` (see "Hero input modes") |
| Pact screen breakpoints | `src/pacts.css` `@media` rules at 900 / 640 / 420 px |
| Tower-popover bottom sheet | `src/pacts.css` `.popover-card` rules under `@media (max-width: 640px)` |

### `--app-vh` and the iOS URL bar

`100vh` on iOS Safari is the **largest** the viewport ever gets, so
elements sized to `100vh` are partially obscured by the bottom URL bar
in normal scroll state. We declare `--app-vh: 100vh; --app-vh: 100dvh;`
in `:root` — browsers that support `dvh` (dynamic viewport height) use
it and the layout shrinks/grows with the URL bar; older browsers fall
through to `100vh`. Everything that needs a viewport-tall container
(canvas stage, pact `.scene`) references `var(--app-vh)`.

### Why the tower popover is a bottom sheet on phones

`tower-popover.ts#position` anchors the popover next to the tower in
viewport coords — perfect on desktop, but on a phone the anchored
card often covers the very tower it describes. CSS rules under
`@media (max-width: 640px)` override the inline `left`/`top` with
`!important` and pin the card to the bottom edge, full-width, with a
sheet-slide animation. No TypeScript change needed — the JS still
runs `position()` and the CSS overrides win.

### Adding a new mobile breakpoint

The pact screen's breakpoints are commented at the top of the
`@media` block in `src/pacts.css`. Add new mobile UI in the smallest-
width media query that covers your target (you can copy the
`<= 640px` block as a template). For anything that needs a JS
behavior change on small viewports (e.g. dynamic gesture handling),
check `window.matchMedia("(max-width: 640px)")` in the relevant
module and document the new branch in the table above.

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
- **Adapted T3 archer.** The design specifies T3 archer "Volley Keep — fires
  two arrows per shot". `updateTower` fires exactly one projectile per shot
  today, so T3 archer is approximated with a hard single-shot damage bump
  that lands DPS near a 2-arrow volley. Wiring real multi-projectile-per-fire
  is a unit of work — search for `Adapted copy:` in `src/config.ts`.
- **`Enemy.color` is unused.** Sprite rendering supplanted it; field kept for
  HP-bar fallback that no longer fires. Removable.
- **`tsconfig.tsbuildinfo`** can be regenerated; in `.gitignore`.

---

## Out of scope (good ideas, not built)

- Pause / speed-up
- Per-tower targeting modes (first / last / strongest)
- Persistent meta-progression between runs
- Multiple maps
