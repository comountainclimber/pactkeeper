/**
 * Doc & invariant check.
 *
 * Run with `npm run check` (or as `prebuild` before any production build).
 * Fails the build if any of the cross-file contracts that humans/agents
 * commonly forget have drifted.
 *
 * Add a check by appending a `check(...)` call below. Keep messages
 * actionable — they should tell the next agent exactly what to fix.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOSS_PHASE2_SPEED_MULT,
  BOSS_PHASE2_TINT,
  ENEMY_DEFS,
  GRID_H,
  GRID_W,
  PATH,
  TOWER_DEFS,
} from "../src/config.ts";
import { HEROES } from "../src/heroes.ts";
import { TOWER_KINDS } from "../src/hud.ts";
import { LEVELS } from "../src/levels.ts";
import { PACTS } from "../src/modifiers.ts";
import { SPRITES_16 } from "../src/sprites.ts";
import { WAVES } from "../src/waves.ts";

const errors: string[] = [];
const warnings: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}
function warn(condition: boolean, message: string): void {
  if (!condition) warnings.push(message);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Registry / cross-file invariants ────────────────────────────────────

// 1. TOWER_KINDS in hud.ts must contain every TOWER_DEFS key (HUD picker)
{
  const defKeys = Object.keys(TOWER_DEFS).sort();
  const hudKeys = [...TOWER_KINDS].sort();
  check(
    defKeys.length === hudKeys.length &&
      defKeys.every((k, i) => k === hudKeys[i]),
    `TOWER_KINDS in src/hud.ts (${TOWER_KINDS.join(", ")}) must match every key in TOWER_DEFS (${defKeys.join(", ")}). Add the new tower kind to TOWER_KINDS.`,
  );
}

// 2. Every tower tier's sprite name resolves in SPRITES_16. Towers are tiered
// (T1 → T2 → T3) so each kind must have *exactly three* sprite entries — the
// upgrade UI (`src/tower-popover.ts` + `src/game.ts#upgradeSelectedTower`)
// hard-codes "next tier = tier + 1, max = 3". Also catches missing sprite
// entries and obviously-bad upgrade prices.
for (const [kind, def] of Object.entries(TOWER_DEFS)) {
  check(
    def.tiers.length === 3,
    `TOWER_DEFS.${kind} has ${def.tiers.length} tiers; the upgrade UI assumes exactly 3. Add or remove a tier, or rewrite the popover to be tier-count-agnostic.`,
  );
  for (let i = 0; i < def.tiers.length; i++) {
    const tier = def.tiers[i];
    check(
      tier.sprite in SPRITES_16,
      `TOWER_DEFS.${kind}.tiers[${i}].sprite "${tier.sprite}" not found in SPRITES_16 (src/sprites.ts). Add a sprite entry or fix the typo.`,
    );
    check(
      tier.cost > 0,
      `TOWER_DEFS.${kind}.tiers[${i}].cost must be > 0. (Tier-1 cost is placement; tier-2/3 cost is the upgrade price from the previous tier.)`,
    );
  }
}

// 3. Every enemy's sprite name resolves in SPRITES_16
for (const [kind, def] of Object.entries(ENEMY_DEFS)) {
  check(
    def.sprite in SPRITES_16,
    `ENEMY_DEFS.${kind}.sprite "${def.sprite}" not found in SPRITES_16 (src/sprites.ts).`,
  );
}

// 3c. Every realm's boss kind (LEVELS[id].boss) exists in ENEMY_DEFS and is
// declared as a boss (i.e. has a phase-2 speed multiplier + tint). Catches
// the common mistake of renaming a boss in `levels.ts` without adding its
// stats / artwork / enrage data to `config.ts`.
for (const [id, level] of Object.entries(LEVELS)) {
  check(
    level.boss in ENEMY_DEFS,
    `LEVELS[${id}].boss = "${level.boss}" is not in ENEMY_DEFS. Add the boss to ENEMY_DEFS in src/config.ts (with sprite, hp, speed, bounty, radius) and to BOSS_PHASE2_SPEED_MULT / BOSS_PHASE2_TINT.`,
  );
  check(
    level.boss in BOSS_PHASE2_SPEED_MULT,
    `LEVELS[${id}].boss = "${level.boss}" is missing from BOSS_PHASE2_SPEED_MULT (src/config.ts). Without it, the boss never enrages at half HP.`,
  );
  check(
    level.boss in BOSS_PHASE2_TINT,
    `LEVELS[${id}].boss = "${level.boss}" is missing from BOSS_PHASE2_TINT (src/config.ts). Without it, the phase-2 halo will not render.`,
  );
}

// 3b. Every hero's sprite name resolves in SPRITES_16. Heroes follow the
// same sprite-registry convention as enemies/towers — the pact-screen
// portrait and in-game render both go through `getSprite()`, so a missing
// entry would render the orc fallback.
for (const [kind, def] of Object.entries(HEROES)) {
  check(
    def.sprite in SPRITES_16,
    `HEROES.${kind}.sprite "${def.sprite}" not found in SPRITES_16 (src/sprites.ts).`,
  );
}

// 3d. Sprite shape sanity: each `SPRITES_16` entry should be a 16×16
// grid (16 rows, each 16 chars). `getSprite` uses `data[0].length` for
// the width so off-length rows silently lose pixels — which is how the
// pre-existing `ghost` typos slipped in. Surface as a warning so new
// art (e.g. bosses) gets flagged at PR time without blocking on legacy
// shape issues already in the tree.
for (const [name, rows] of Object.entries(SPRITES_16)) {
  warn(
    rows.length === 16,
    `SPRITES_16.${name} has ${rows.length} rows; expected 16. Off-shape sprites render with the wrong silhouette and break pixel-perfect alignment.`,
  );
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== 16) {
      warnings.push(
        `SPRITES_16.${name} row ${i} is ${rows[i].length} chars; expected 16. \`getSprite\` uses row 0's length as the canvas width so trailing pixels in shorter rows are lost.`,
      );
    }
  }
}

// 4. Anti-air coverage: if any enemy is flying, at least one tower must have
// `canHitFlying`. Otherwise the airborne rule makes the game unwinnable.
{
  const flyingEnemies = Object.entries(ENEMY_DEFS)
    .filter(([, def]) => "flying" in def && def.flying === true)
    .map(([kind]) => kind);
  const hasAntiAir = Object.values(TOWER_DEFS).some(
    (def) => def.canHitFlying === true,
  );
  if (flyingEnemies.length > 0) {
    check(
      hasAntiAir,
      `Enemies with \`flying: true\` exist (${flyingEnemies.join(", ")}) but no tower has \`canHitFlying: true\`. The game would be unwinnable. Set \`canHitFlying: true\` on a tower in \`src/config.ts\` \`TOWER_DEFS\`.`,
    );
  }
}

// 5. Every wave references a known enemy kind
for (let i = 0; i < WAVES.length; i++) {
  for (let g = 0; g < WAVES[i].groups.length; g++) {
    const group = WAVES[i].groups[g];
    check(
      group.kind in ENEMY_DEFS,
      `WAVES[${i}].groups[${g}] references unknown enemy kind "${group.kind}". Add it to ENEMY_DEFS or fix the reference.`,
    );
  }
}

// 6. Pact ids are unique
{
  const ids = PACTS.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(
    dupes.length === 0,
    `PACTS contain duplicate id(s): ${[...new Set(dupes)].join(", ")}. Each pact id must be unique — used as a stable identifier.`,
  );
}

// 7. PATH endpoints sit off-grid (so enemies enter/exit cleanly)
{
  const offGrid = (x: number, y: number) =>
    x < 0 || x >= GRID_W || y < 0 || y >= GRID_H;
  const first = PATH[0];
  const last = PATH[PATH.length - 1];
  check(
    offGrid(first[0], first[1]),
    `PATH[0] = (${first[0]}, ${first[1]}) must sit off-grid (x < 0 or x >= ${GRID_W}, or y similar). On-grid endpoints let isBuildable() allow building on the entry tile.`,
  );
  check(
    offGrid(last[0], last[1]),
    `PATH[last] = (${last[0]}, ${last[1]}) must sit off-grid.`,
  );
}

// 8. PATH segments are axis-aligned (buildPathTiles can't walk diagonals)
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, ay] = PATH[i];
  const [bx, by] = PATH[i + 1];
  check(
    ax === bx || ay === by,
    `PATH segment ${i} → ${i + 1}: (${ax}, ${ay}) → (${bx}, ${by}) is not axis-aligned. buildPathTiles in src/map.ts walks one axis at a time.`,
  );
}

// ─── Documentation surface ────────────────────────────────────────────────

// 9. AGENTS.md mentions every .ts file in src/
{
  const srcDir = join(repoRoot, "src");
  const tsFiles = readdirSync(srcDir).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".d.ts"),
  );
  const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  for (const file of tsFiles) {
    if (!agentsMd.includes(file)) {
      errors.push(
        `AGENTS.md does not mention src/${file} — add a row to the repo-layout table or remove the file.`,
      );
    }
  }
}

// 10. docs/recipes.md mentions every registry name
{
  const recipes = readFileSync(join(repoRoot, "docs/recipes.md"), "utf8");
  for (const reg of ["TOWER_DEFS", "ENEMY_DEFS", "PACTS", "WAVES", "HEROES"]) {
    check(
      recipes.includes(reg),
      `docs/recipes.md is missing a reference to ${reg}. The recipe for adding ${reg} content must point at this registry.`,
    );
  }
}

// 11. Adapted-copy markers anywhere in `src/` are flagged in AGENTS.md.
// Originally just `modifiers.ts`, expanded to also cover `config.ts` once
// tiered-tower copy started carrying approximations (e.g. T3 archer "fires
// two arrows per shot" approximated via a damage bump).
{
  const adaptedSources = ["src/modifiers.ts", "src/config.ts"];
  const hasAdapted = adaptedSources.some((rel) =>
    /Adapted copy:/i.test(readFileSync(join(repoRoot, rel), "utf8")),
  );
  if (hasAdapted) {
    const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
    warn(
      /adapted[- ]?copy/i.test(agentsMd) || /adapted/i.test(agentsMd),
      `Some source file has "Adapted copy" markers (checked: ${adaptedSources.join(", ")}) but AGENTS.md does not mention adapted approximations in Known Anomalies. Update AGENTS.md so future agents know which design mechanics are approximated.`,
    );
  }
}

// ─── Report ───────────────────────────────────────────────────────────────

if (warnings.length > 0) {
  for (const w of warnings) console.warn("  ⚠ " + w);
}

if (errors.length > 0) {
  console.error("\ndoc-check FAILED:\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error(
    `\n${errors.length} issue${errors.length === 1 ? "" : "s"} found. Fix them or update the docs to match.\n`,
  );
  process.exit(1);
}

const summary = [
  `${Object.keys(TOWER_DEFS).length} towers`,
  `${Object.keys(ENEMY_DEFS).length} enemies`,
  `${Object.keys(HEROES).length} heroes`,
  `${PACTS.length} pacts`,
  `${WAVES.length} waves`,
  `${Object.keys(SPRITES_16).length} sprites`,
];
console.log(`doc-check ✓  invariants hold (${summary.join(", ")})`);
