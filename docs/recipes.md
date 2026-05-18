# Recipes

Step-by-step checklists for the tasks you'll do over and over. Each recipe is
a complete spec — follow it top-to-bottom and the typecheck will pass.

> **Run `npm run build` after every recipe.** It's the only verification.

---

## Add a new tower

1. **Sprite** — add a new entry to `SPRITES_16` in `src/sprites.ts`. The key
   must be `<kind>Tower` so `paletteFor()` strips the suffix correctly.
   Reuse an existing palette in `PALETTES` or add a new one (key = `<kind>`).

   ```typescript
   // src/sprites.ts
   const PALETTES = {
     // ... existing
     lightning: { ".": null, "1": "#0b1024", "2": "#3a2a78", "3": "#7a5cff", /* ... */ },
   };
   const SPRITES_16 = {
     // ... existing
     lightningTower: [ /* 16 strings, 16 chars each */ ],
   };
   ```

2. **Stats** — add a row to `TOWER_DEFS` in `src/config.ts`. Field meanings
   are documented above the registry.

   ```typescript
   // src/config.ts
   export const TOWER_DEFS = {
     // ... existing
     lightning: {
       cost: 180,
       damage: 14,
       range: 130,
       fireRate: 0.4,
       projectileSpeed: 600,
       sprite: "lightningTower",
       accent: "#a07cff",
       label: "Storm Spire",
       desc: "Fast piercing bolts.",
     },
   } as const;
   ```

3. **HUD card** — add the new kind to `TOWER_KINDS` in `src/hud.ts` so a card
   appears in the picker.

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
   `slow` from the def automatically. If you need new behavior (chain hits,
   piercing), extend the {@link Projectile} type and the `splashRadius`
   handler in `Game.updateProjectiles`.

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

3. **Lives cost on breach (optional)** — only needed if breach should cost
   more than 1 life. Edit `Game.handleEnemyEnd` in `src/game.ts`.

   ```typescript
   // src/game.ts — current shape
   this.lives -= e.kind === "boss" ? 10 : e.kind === "skeleton" ? 3 : 1;
   ```

4. **Use it in a wave** — reference the kind from `WAVES` in `src/waves.ts`.

---

## Add a new pact

1. **Sigil** — pick a `SigilId` from `src/sigils.ts`, or add a new sprite
   there. Sigils render as SVG strings into the DOM pact screen.
2. **Roster entry** — append a new {@link Pact} to `PACTS` in
   `src/modifiers.ts`. Stick to the existing `school` set so the colored dot
   maps cleanly.
3. **Implement `apply`** — only mutate fields on {@link PactEffects}. Don't
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
     apply: (e) => {
       e.towerDamageMult *= 0.8;     // approximation: damage stand-in for fire-rate
       e.enemyBountyMult *= 1.75;
     },
   },
   ```

4. **Honesty check** — `downside`/`upside` are player-facing copy. If the
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
