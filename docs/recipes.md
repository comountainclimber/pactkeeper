# Recipes

Step-by-step checklists for the tasks you'll do over and over. Each recipe is
a complete spec — follow it top-to-bottom and the typecheck will pass.

> **Run `npm run build` after every recipe.** It's the only verification.

---

## Add a new tower

Towers are tiered (T1 → T2 → T3). T1 is the placement; T2/T3 unlock via the
click-on-tower popover (`src/tower-popover.ts`). You need a sprite + palette
per tier.

1. **Sprites (one per tier)** — add three entries to `SPRITES_16` in
   `src/sprites.ts`: `<kind>Tower`, `<kind>TowerT2`, `<kind>TowerT3`.
   `paletteFor()` strips the `Tower[T2|T3]` suffix to find each palette
   (`<kind>`, `<kind>T2`, `<kind>T3`). T2 conventionally adds silver trim,
   T3 adds gold trim, so the upgrade reads at a glance.

   ```typescript
   // src/sprites.ts
   const PALETTES = {
     // ... existing
     lightning:   { ".": null, "1": "#0b1024", "2": "#3a2a78", "3": "#7a5cff", /* ... */ },
     lightningT2: { ".": null, "1": "#0b1024", /* ...silver accents... */ },
     lightningT3: { ".": null, "1": "#0b1024", /* ...gold accents... */ },
   };
   const SPRITES_16 = {
     // ... existing
     lightningTower:   [ /* 16 strings, 16 chars each */ ],
     lightningTowerT2: [ /* ... */ ],
     lightningTowerT3: [ /* ... */ ],
   };
   ```

   Then update `paletteFor()` to route the two new sprite names to their
   palettes (mirroring the `archerTowerT2/T3`, etc. branches).

2. **Stats per tier** — add a row to `TOWER_DEFS` in `src/config.ts`. Each
   kind is `{ accent, desc, canHitFlying, tiers: [T1, T2, T3] }`. T1 `cost`
   is the placement cost; T2/T3 `cost` is the *upgrade* cost from the prior
   tier. `canHitFlying` is a **required kind-level boolean** (not per-tier)
   — set it to `true` if this tower should be able to target flying
   enemies, `false` otherwise. The HUD card automatically renders an
   `ANTI-AIR` or `GROUND` label based on this flag (no extra UI work
   needed), and so do the range-circle badge and popover stat line. See
   AGENTS.md "Anti-air & flying enemies" for the full contract.

   ```typescript
   // src/config.ts
   export const TOWER_DEFS = {
     // ... existing
     lightning: {
       accent: "#a07cff",
       desc: "Fast piercing bolts.",
       canHitFlying: true,
       tiers: [
         { cost: 180, damage: 14, range: 130, fireRate: 0.4,
           projectileSpeed: 600, sprite: "lightningTower",   label: "Storm Spire" },
         { cost: 290, damage: 22, range: 144, fireRate: 0.35,
           projectileSpeed: 640, sprite: "lightningTowerT2", label: "Tempest Spire" },
         { cost: 470, damage: 36, range: 158, fireRate: 0.31,
           projectileSpeed: 680, sprite: "lightningTowerT3", label: "Skyforge" },
       ],
     },
   } as const;
   ```

   Reach into tiers via `getTowerTier(kind, tier)` rather than indexing the
   `.tiers[]` array directly — it stays cleaner in the sim primitives.

3. **HUD card** — add the new kind to `TOWER_KINDS` in `src/hud.ts` so a card
   appears in the picker. The picker always shows T1 stats + cost.

   ```typescript
   // src/hud.ts
   const TOWER_KINDS: TowerKind[] = ["arrow", "cannon", "frost", "lightning"];
   ```

4. **Hotkey (optional)** — extend `Game.onKey` in `src/game.ts`.

   ```typescript
   // src/game.ts
   else if (e.key === "4") this.selectedTower = "lightning";
   ```

5. **Special behavior (optional)** — `tower.ts` consumes `splashRadius` and
   `slow` from the active tier's def automatically. If you need new behavior
   (chain hits, piercing), extend the {@link Projectile} type and the
   `splashRadius` handler in `Game.updateProjectiles`.

6. **Tier badge** — the in-canvas 3-dot tier badge above the tower is
   handled generically in `drawTower` (`src/tower.ts`); no per-kind work
   needed. The popover (`src/tower-popover.ts`) also picks up the new kind
   automatically — it derives next-tier deltas from `TOWER_DEFS`.

---

## Add a new hero

Heroes are the player-controlled champions chosen on the pact screen. Each
hero ships with a sprite + palette, a row in `HEROES` (`src/heroes.ts`), and a
matching SFX. Adding one is mechanical:

1. **Sprite + palette** — append a 16×16 entry to `SPRITES_16` named
   `<kind>Hero`, and a matching palette named `<kind>Hero` in `PALETTES`
   (`src/sprites.ts`). Then add a branch in `paletteFor()` that routes the
   new sprite name to its palette:

   ```typescript
   // src/sprites.ts
   if (name === "paladinHero") return PALETTES.paladinHero;
   ```

2. **Roster entry** — add a row to `HEROES` in `src/heroes.ts`. The keys
   become the {@link HeroKind} union, so TypeScript will complain if you
   reference an undeclared kind anywhere downstream.

   ```typescript
   // src/heroes.ts
   export const HEROES = {
     // ...existing
     paladin: {
       displayName: "Paladin",
       tagline: "Light follows their stride.",
       accent: "#e8c440",
       hi: "#fff080",
       glow: "#c98a3a",
       sprite: "paladinHero",
       hp: 160,
       damage: 22,
       range: 60,
       attackRate: 0.65,
       moveSpeed: 3.8,
       contactRange: 22,
       attackKind: "melee",
       projectileSpeed: 0,
       canHitFlying: false,
       attackSfx: "paladinSmite",
     },
   } as const;
   ```

3. **HERO_KINDS order** — also append the new kind to `HERO_KINDS`
   (same file). Drives the picker's left-to-right order.

4. **SFX** — add the matching method to the `SFX` class in
   `public/music.js`, and declare it on `PactkeeperSFXInstance` in
   `src/globals.d.ts`. Skip if you reuse an existing SFX name.

5. **Pact-screen picker** — no edits needed; `updateHeroPicker()` walks
   `HERO_KINDS` and renders a card per entry. The grid layout in
   `pacts.css` adapts to 3+ columns automatically.

6. **doc-check** — `scripts/doc-check.ts` now enforces that every
   `HEROES[kind].sprite` resolves in `SPRITES_16`. Failing build means
   you forgot step 1.

---

## Add a new enemy

1. **Sprite** — add a 16×16 entry in `SPRITES_16` plus matching palette in
   `PALETTES`. The palette key matches the sprite name (no `Tower` suffix).
2. **Stats** — add a row to `ENEMY_DEFS` in `src/config.ts`.

   ```typescript
   // src/config.ts
   export const ENEMY_DEFS = {
     // ... existing
     wraith: { hp: 60, speed: 2.4, bounty: 14, sprite: "wraith", radius: 8 },
   } as const;
   ```

   To make the enemy **airborne**, add `flying: true`. Only towers with
   `canHitFlying: true` (kind-level field on `TOWER_DEFS`, see the tower
   recipe) will target or damage it. `scripts/doc-check.ts` enforces that
   at least one tower has `canHitFlying: true` whenever any flying enemy
   exists, so the game stays winnable. See AGENTS.md "Anti-air & flying
   enemies" for the three combat enforcement sites and the visual
   affordances driven by these flags.

3. **Score row** — add a row to `ENEMY_SCORE` in `src/score.ts`. TypeScript
   enforces this via `Record<EnemyKind, number>`, so the build fails until
   the new kind has an entry.

4. **Lives cost on breach (optional)** — only needed if breach should cost
   more than 1 life. Add a row to the `BREACH_LIFE_COST` map at the top of
   `src/game.ts`. The default cost is 1 life — including for flying
   enemies, unless overridden here. Realm bosses scale up the ladder
   (`hollow_warden` 8 → `brood_mother` 12 → `cinder_lich` 16) so a breach
   on realm 3 ends the run by design.

   ```typescript
   // src/game.ts — current shape
   const BREACH_LIFE_COST: Partial<Record<EnemyKind, number>> = {
     skeleton: 3,
     hollow_warden: 8,
     brood_mother: 12,
     cinder_lich: 16,
   };
   ```

5. **Death SFX (optional)** — adding a per-kind death cue is a three-edit
   process:

   1. Synthesise the sound in `public/music.js` as a method on the SFX
      instance (e.g. `batDie() { ... }`).
   2. Add the method's signature to the `PactkeeperSFXInstance` interface
      in `src/globals.d.ts` so TypeScript knows it exists.
   3. Wire it up in the `deathSfx` map inside `Game.damageEnemy`
      (`src/game.ts`) keyed by `EnemyKind`.

6. **Use it in a wave** — reference the kind from `WAVES` in `src/waves.ts`.

---

## Add a new boss (per realm)

Each realm closes on a single named boss. A boss is just an enemy with a
2× render scale, a phase-2 enrage, and a steeper breach cost — adding one
is mostly a stat-and-art pairing exercise. The doc-check (`npm run check`)
enforces the cross-file invariants below.

1. **Pick a kind id** — snake_case, e.g. `frost_lord`. Use the same id
   everywhere (it becomes an `EnemyKind` literal).

2. **Add a row to `ENEMY_DEFS`** in `src/config.ts` with `hp`, `speed`,
   `bounty`, `sprite`, `radius`. Boss radius is typically 17–20 so the
   silhouette reads against the 2× sprite.

   ```typescript
   // src/config.ts
   frost_lord: {
     hp: 1900, speed: 0.75, bounty: 300, sprite: "frostLord", radius: 19,
   },
   ```

3. **Add the phase-2 enrage** — append entries to
   `BOSS_PHASE2_SPEED_MULT` and `BOSS_PHASE2_TINT` (same file). The mult
   is the speed bump that fires once below 50% HP; the tint is the halo
   color painted behind the sprite once enraged. `isBossKind` reads off
   the speed-mult map's keys, so missing either of these will silently
   skip the 2× render scale.

   ```typescript
   export const BOSS_PHASE2_SPEED_MULT = {
     // ...existing
     frost_lord: 1.5,
   };
   export const BOSS_PHASE2_TINT = {
     // ...existing
     frost_lord: "#7ad4e8",
   };
   ```

4. **Sprite + palette** — append a 16×16 entry to `SPRITES_16` named
   after the sprite key (e.g. `frostLord`), plus a matching palette in
   `PALETTES` keyed by the same name, then route it in `paletteFor()`.
   See the existing `hollowWarden` / `broodMother` / `cinderLich` entries
   for the conventions. The sprite renders at 2× scale so every logical
   pixel paints to a 4×4 screen-px block — keep silhouettes simple and
   bilaterally symmetric where possible.

5. **Score + breach cost** — add the kind to `ENEMY_SCORE` in
   `src/score.ts` (TypeScript will force this) and to `BREACH_LIFE_COST`
   in `src/game.ts` if the cost should exceed 1.

6. **Assign it to a realm** — set `boss: "frost_lord"` on the appropriate
   `LEVELS[id]` entry in `src/levels.ts`, and add a matching `bossName`.
   The final wave in `WAVES` already resolves to `CURRENT_LEVEL.boss`, so
   no edit to `src/waves.ts` is needed.

7. **Doc-check** — running `npm run check` after will:
   - Verify `ENEMY_DEFS.frost_lord.sprite` resolves in `SPRITES_16`.
   - Verify the new realm-boss pairing (kind exists, enrage mult set,
     tint set).
   - Warn on any 16×16 sprite row that's off-length.

---

## Add a new pact

1. **Sigil** — pick a `SigilId` from `src/sigils.ts`, or add a new sprite
   there. Sigils render as SVG strings into the DOM pact screen.
2. **Roster entry** — append a new {@link Pact} to `PACTS` in
   `src/modifiers.ts`. Stick to the existing `school` set so the colored dot
   maps cleanly.
3. **Set `xp`** — score-multiplier weight. Existing roster spans 70–250 by
   difficulty; aim higher for harsher trade-offs. The total xp of sealed pacts
   drives the run multiplier (`1 + xp / 1000`). See `src/score.ts`.
4. **Implement `apply`** — only mutate fields on {@link PactEffects}. Don't
   reach into `Game` state.

   ```typescript
   // src/modifiers.ts
   {
     id: "midas_touch",
     name: "Midas' Touch",
     tagline: "Gold begets gold.",
     school: "BOON",
     sigil: "coin",
     accent: "#e8c440",
     hi: "#fff080",
     glow: "#ffffaa",
     downside: "Towers fire 25% slower",
     upside: "Enemies drop +75% gold",
     xp: 110,
     apply: (e) => {
       e.towerDamageMult *= 0.8;     // approximation: damage stand-in for fire-rate
       e.enemyBountyMult *= 1.75;
     },
   },
   ```

5. **Honesty check** — `downside`/`upside` are player-facing copy. If the
   approximation diverges from the literal text (e.g. "fires 25% slower" but
   you used a damage multiplier), add a comment with `Adapted copy:` so future
   agents can find and fix it.

---

## Add or rebalance a wave

1. **Edit `WAVES`** in `src/waves.ts`. Add a new {@link Wave} (any position)
   or tune the existing groups.
2. **Don't touch `TOTAL_WAVES`** — it derives from `WAVES.length`.
3. **The last wave is the boss wave.** Whatever spawns last triggers victory
   when cleared. If you add a wave after the current boss wave, the boss is no
   longer the win condition.
4. **`preDelay`** — give the player time to react. 3–8s is the existing range.

---

## Change the path

1. **Edit `PATH`** in `src/config.ts`. Each segment must be axis-aligned;
   `buildPathTiles` walks one axis at a time and skips diagonals.
2. **Keep entry/exit off-grid** — first point with `x < 0` or `y < 0`; last
   point with `x >= GRID_W` or `y >= GRID_H`. If you bring the endpoints
   on-grid, `isBuildable` will allow placing a tower on the entry tile.
3. **Decorations** — `PROPS` in `src/map.ts` is hand-placed in tile coords. If
   you reroute the path under existing trees/rocks, move them or accept the
   defensive skip in `buildMapCanvas`.
4. **Map canvas is cached** — first call to `getMapCanvas()` builds it. A
   full reload (`npm run dev` already hot-reloads) regenerates it.

---

## Change starting economy

`STARTING_GOLD` and `STARTING_LIVES` in `src/config.ts`. Pact effects compose
on top, so consider the headroom: a `startingLivesDelta: -12` on top of `20`
leaves `8` lives — clamped to `1` minimum.

---

## Tweak HUD layout

Layout constants (`PAD`, `HEADER_H`, `STATS_TOP`, etc.) live at the top of
`src/hud.ts`. They're scoped intentionally: the HUD is the only thing that
draws there, so they don't belong in `config.ts`.

---

## Add a render layer

The render order in `Game.render` is: map → ambient overlay → towers → enemies
→ projectiles → build hint → HUD → end-screen overlay. Insert your new layer
where Z-ordering puts it. Keep render functions pure: they read state and
draw, never mutate.

---

## Adjust scoring values

All score knobs live in `src/score.ts`:

- `ENEMY_SCORE` — per-kill points by enemy kind. Add a row when you add a new
  `EnemyKind` to keep TypeScript happy (it's a `Record<EnemyKind, number>`).
- `REALM_CLEAR_BONUS` — added to `rawScore` on every victory.
- `LIFE_BONUS` — multiplied by `livesLeft` in `finalize()`.
- Pact `xp` lives on each entry in `PACTS` (`src/modifiers.ts`). Total xp of
  sealed pacts drives the run multiplier (`1 + xp / 1000`, rounded to 2dp).

The HUD `SCORE` cell reads the running `rawScore` + the live multiplier; the
inscription overlay on the pact screen reads the finalized result via
`Game.runSummary(outcome)` → `RunSummary.finalized`.

To wipe the leaderboard during dev: `localStorage.removeItem('pk-scores')` in
DevTools, or use the "✕ ERASE HALL" button in the Hall tab.
