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
  sprite-gallery.ts     `/sprites` route: read-only DOM gallery of every hero, enemy, boss, and tower tier.
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
realm bosses 400 / 650 / 900). Realm-clear bonus: 1000. Life bonus: 50/life.

Persistence: top 25 entries in `localStorage["pk-scores"]`, sorted desc.
Player name in `localStorage["pk-name"]`. The pact screen's THE HALL tab
renders the leaderboard via `loadScores()`; the inscription overlay (shown
when `PactScreen.show()` receives a `RunSummary`) writes via `saveScore()`.

`Game` exposes `runSummary(outcome)` and emits a `RunSummary` through
`onLevelEnd`; `main.ts` forwards it to `pact.show(pending)`.

---

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

### Effects flow

Per the project's sim-primitives-take-args rule, the hero subsystem follows
the same pattern as towers:

- `moveHero(hero, inputX, inputY, dt)` — pure; reads only the hero + input.
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

## Realm bosses

Each realm (1–3) closes on a unique boss, configured by `LEVELS[id].boss`
in `src/levels.ts`. The boss roster forms a **progressive difficulty
ladder** — HP, speed, bounty, breach cost, and phase-2 enrage all step up
realm by realm:

| Realm | Kind | HP | Speed | Bounty | Score | Breach lives | Phase-2 ×speed | Tint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Embergrass | `hollow_warden` | 1100 | 0.65 | 180 | 400 | 8 | 1.35 | moss `#7ad44a` |
| 2 Hollowmere | `brood_mother` | 1600 | 0.78 | 260 | 650 | 12 | 1.45 | toxic `#d23a8a` |
| 3 Ashen | `cinder_lich` | 2200 | 0.85 | 340 | 900 | 16 | 1.55 | ember `#ff6020` |

The three knobs that make a kind "a boss":

- **2× render scale.** `drawEnemy` checks `isBossKind(kind)` (config.ts)
  and renders the sprite at `SCALE * 2`. So the 16×16 sprite paints to a
  64×64 silhouette.
- **Phase-2 enrage.** First frame below half HP, `bossPhase` flips from
  `1 → 2` and `baseSpeed` is multiplied by `BOSS_PHASE2_SPEED_MULT[kind]`.
  Simultaneously, `drawEnemy` paints a soft halo behind the sprite tinted
  by `BOSS_PHASE2_TINT[kind]` (per-realm color).
- **Breach cost.** `BREACH_LIFE_COST` in `src/game.ts` makes the
  realm-3 boss alone cost more lives than `STARTING_LIVES` minus the
  pre-boss waves' typical drain — the cinder lich is meant to be killed
  on the path, not absorbed at the gate.
- **Bosses ignore `waveSizeMult`.** `Game.updateWaveSpawning` checks
  `isBossKind(group.kind)` and uses the raw `group.count` for boss
  spawns. Without that guard a `× 1.5` pact (Endless Swarms) silently
  doubles the realm finale because `Math.round(1 * 1.5) === 2`. If a
  future pact wants a multi-boss fight, it must opt in explicitly
  rather than ride on the generic wave-size scaler.

Adding a fourth boss is the `docs/recipes.md#add-a-new-boss-per-realm`
recipe. The doc-check (`npm run check`) enforces that every
`LEVELS[id].boss` resolves in `ENEMY_DEFS` and has a phase-2 mult + tint;
it also warns on any 16×16 sprite row that isn't exactly 16 chars.

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

## Siege attackers & splash-only enemies

Two enemy-side flags layer on top of the existing `flying` / `splashResistant`
axes. They were introduced for the **octopus** — a giant ground enemy that
stops at the first tower in range and pummels it until it crumbles, and which
can only be damaged by splash blasts. Both are independent of `flying`: today
no enemy combines them, but the contracts compose.

### `siegeAttacker: boolean` on `Enemy`

A siege attacker **halts** at any tower within its attack range and stays
there, slamming that tower repeatedly until it's destroyed (rather than
walking past while attacking on cooldown like the wraith). Then the lock
clears and the enemy resumes walking.

Three pieces wire this together:

| Site | File | Why |
| --- | --- | --- |
| `Game.updateEnemySiegeLocks` | `src/game.ts` | Per-frame pre-step that acquires (or releases) `Enemy.lockedTowerId`. Runs **before** the `updateEnemy` loop so the halt takes effect on the same frame the enemy enters range. |
| `updateEnemy` halt check | `src/enemy.ts` | Reads its own `lockedTowerId` and returns early before movement. Sim primitive stays oblivious to `Game` state — effects-flow rule. |
| `Game.updateEnemyTowerAttacks` | `src/game.ts` | Generalised to two modes: siege attackers hit their `lockedTowerId`, wraith-style attackers hit the closest tower. SFX + telegraph anim are kind-specific (`octopusSlam` + `octopusAttackAnimUntil` for octopus, `wraithAttack` + `wraithAttackAnimUntil` for wraith). |

The lock survives the tower-attack tick — only `updateEnemySiegeLocks` clears
it (when the locked tower no longer exists). If you add another siege
attacker, set `siegeAttacker: true` in `spawnEnemy` and supply per-kind
damage / cooldown / SFX / anim fields the same way the octopus does. Tunables
live in `config.ts` (`OCTOPUS_ATTACK_RANGE` / `OCTOPUS_ATTACK_DAMAGE` /
`OCTOPUS_ATTACK_COOLDOWN`) — no magic numbers in `game.ts`.

### `onlySplash: boolean` on `Enemy`

A splash-only enemy can **only** be damaged by splash. Direct projectile
hits pass straight through. Cannons are the natural counter; arrow and frost
towers won't even target an octopus because their shots would whiff.

Enforced at three sites — exactly mirroring the anti-air contract above:

| Site | File | Why |
| --- | --- | --- |
| `pickTarget` | `src/tower.ts` | Towers without `splashRadius` on the active tier skip `onlySplash` enemies — don't waste a shot. |
| `stepProjectile` `canSee` | `src/projectile.ts` | Non-splash projectiles already in flight pass through `onlySplash` enemies during collision. A splash-capable projectile is still allowed to direct-impact one, because its blast damages the octopus the same frame. |
| `Game.updateProjectiles` splash loop | `src/game.ts` | Already iterates enemies in range — `onlySplash` is **not** gated here (unlike `splashResistant`), so the splash actually hits. |

`scripts/doc-check.ts` could optionally enforce: "if any enemy has
`onlySplash`, at least one tower tier must have `splashRadius` — else the
game is unwinnable." Cannon tiers all carry splash, so this passes today.

### When you add a new siege / splash-only enemy

1. Add the kind to `ENEMY_DEFS` in `src/config.ts` with `siegeAttacker` /
   `onlySplash` opt-ins. Add per-kind tunables (`<KIND>_ATTACK_*` constants)
   beside `OCTOPUS_*` so all balance numbers live in one file.
2. In `spawnEnemy` (`src/enemy.ts`), set `siegeAttacker` / `onlySplash` /
   `attacksTowers` / `towerAttackCooldown` based on `kind`.
3. In `Game.updateEnemyTowerAttacks` (`src/game.ts`), extend the per-kind
   branch with the new SFX + telegraph anim. Mirror the octopus branch.
4. Sprite + attack-pose entry in `SPRITES_16`; per-kind SFX in
   `public/music.js` + `PactkeeperSFXInstance`; death cue wired in
   `Game.damageEnemy`'s `deathSfx` map. (All three-edit chains documented
   under "Music & SFX → Hero / enemy SFX hooks" below.)
5. If the new enemy renders giant, extend the `renderScale` ternary in
   `drawEnemy` (`src/enemy.ts`). Boss and octopus both render at `SCALE * 2`.

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
Each theme is a declarative composition: it lists which voices to
play and the engine schedules them. The full set of voice fields a
theme may declare (all optional except `loopDur` and `targetVolume`):
`drone`, `wind` (replaces drone for outdoor beds), `pad` /
`progression`, `sub`, `bells` / `bellGain` / `bellDur`, `horn`,
`drums`, `rims`, `lyre`, `choir`, `brass`, `drips`, `tremolo`,
`reverb` (per-theme FDN reverb tuning), `eq` (per-theme master EQ
tilt + hi-cut). Adding a theme means appending one entry; you don't
need to touch the engine.

| Theme | Level | Mood |
| --- | --- | --- |
| `altar` | (pact screen) | Dm ritual ambience — slow, mysterious, distant bells |
| `embergrass` | 1 — Embergrass Pass | E Aeolian pastoral folk — outdoor wind bed, plucked lyre arpeggio in 6/8, open 1-5-9 voicings, distant bell-chime flourishes at each chord change, single short warden's horn cue per loop (was a 24s pedal-tone drone), medium woody reverb |
| `hollowmere` | 2 — Hollowmere Mire | A Phrygian sunken hymn — gliding choir voice with portamento + vibrato over a triadic i–VI–♭II–i progression (Am → F → Bb → Am), sparse cave drips, medium cathedral reverb (fb 0.55) with the highs kept open so the choir + bells keep definition |
| `ashen` | 3 — Ashen Reach | D Phrygian cinematic siege — brass fanfare stabs locked to a sparse march cadence (kick on 1 and 3 of each 6s bar, rim crack on the &), quartal/stacked-fifth voicings, short tight reverb so impacts punch through |

`LEVEL_THEMES` (also in `music.js`) maps a campaign level id (1..3) to
its theme; id 0 + any unknown id falls through to `altar`.

### Voice methods

The engine exposes one method per voice type on `DungeonMusic`.
Themes pick the ones they want and the rest skip. Order roughly
matches their density in the mix:

| Voice | Used by | What it sounds like |
| --- | --- | --- |
| `pad(notes, t, dur, opts)` | every theme | Two-osc sustained chord pad with filter sweep |
| `bell(name, t, dur, gain)` | most themes | Inharmonic-partial bell hit |
| `sub(name, t, dur, gain)` | most themes | Slow sine bass with pitch wobble |
| `horn(name, t, dur, gain)` | embergrass | Sustained low triangle horn |
| `drum(t, gain)` | ashen | Weighted kick + highpass noise transient |
| `rim(t, gain)` | ashen | Dry stick crack — offbeat partner to `drum` |
| `lyre(notes, t, opts)` | embergrass | Plucked sine + triangle harmonic, ~0.5s decay |
| `choir(sequence, t, opts)` | hollowmere | Single voice + fifth that glides between notes with vibrato |
| `brass(notes, t, dur, opts)` | ashen | Short sawtooth chord stab with fast filter open |
| `wind(t, opts)` | embergrass | Looping brown-noise + low sine — outdoor bed (replaces drone) |
| `tremolo(note, t, opts)` | — (available) | Sustained sine with amplitude LFO. Was used by ashen as a high D5 tension layer; removed because the static high note clashed with the chord progression (minor 9th against the Eb chord). Voice kept in the engine for future themes that want a single sustained tone with violin-tremolo character. |
| `drip(t, opts)` | hollowmere | Quick high→low sine glide with heavy reverb |

`_buildReverb({delays, fb, damp, sendGain, outGain})` and
`_buildEQ({lowShelfGain, highShelfGain, hiCutFreq, ...})` are
rebuilt per theme in `start()` and `setTheme()` so each realm has
its own room. The old chain is kept alive for ~3s during a theme
swap so the existing reverb tail can decay without clicking.

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

1. Append a theme to `THEMES` in `public/music.js`. Pick a signature
   voice (or two) from the table above and design the realm around
   it — don't reuse the same `pad`-only template as every other
   theme or the new realm will sound like a re-skin.
2. Map its level id to the theme name in `LEVEL_THEMES` (same file).
3. If your theme needs a new instrument timbre that doesn't exist
   yet, add a new voice method on `DungeonMusic` (model it on
   `pad`/`bell`/`lyre`) and document it in the voice table above.
4. Update the theme table so future agents know what's there.

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
- **Off-shape `ghost` sprite rows.** `SPRITES_16.ghost` has 8 rows that are
  15 chars instead of 16 (`13333333l` typos — the `l` looks like a `1`
  but isn't in the palette). `getSprite` reads the canvas width from
  row 0 so the trailing column is silently dropped. Surfaced as a
  doc-check warning, but not blocking; fix by extending each row to 16
  chars with a trailing `.`.
- **`tsconfig.tsbuildinfo`** can be regenerated; in `.gitignore`.

---

## Out of scope (good ideas, not built)

- Pause / speed-up
- Per-tower targeting modes (first / last / strongest)
- Persistent meta-progression between runs
- Multiple maps
