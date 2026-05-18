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

import { ENEMY_DEFS, GRID_H, GRID_W, PATH, TOWER_DEFS } from "../src/config.ts";
import { TOWER_KINDS } from "../src/hud.ts";
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

// 2. Every tower's sprite name resolves in SPRITES_16
for (const [kind, def] of Object.entries(TOWER_DEFS)) {
  check(
    def.sprite in SPRITES_16,
    `TOWER_DEFS.${kind}.sprite "${def.sprite}" not found in SPRITES_16 (src/sprites.ts). Add a sprite entry or fix the typo.`,
  );
}

// 3. Every enemy's sprite name resolves in SPRITES_16
for (const [kind, def] of Object.entries(ENEMY_DEFS)) {
  check(
    def.sprite in SPRITES_16,
    `ENEMY_DEFS.${kind}.sprite "${def.sprite}" not found in SPRITES_16 (src/sprites.ts).`,
  );
}

// 4. Every wave references a known enemy kind
for (let i = 0; i < WAVES.length; i++) {
  for (let g = 0; g < WAVES[i].groups.length; g++) {
    const group = WAVES[i].groups[g];
    check(
      group.kind in ENEMY_DEFS,
      `WAVES[${i}].groups[${g}] references unknown enemy kind "${group.kind}". Add it to ENEMY_DEFS or fix the reference.`,
    );
  }
}

// 5. Pact ids are unique
{
  const ids = PACTS.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(
    dupes.length === 0,
    `PACTS contain duplicate id(s): ${[...new Set(dupes)].join(", ")}. Each pact id must be unique — used as a stable identifier.`,
  );
}

// 6. PATH endpoints sit off-grid (so enemies enter/exit cleanly)
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

// 7. PATH segments are axis-aligned (buildPathTiles can't walk diagonals)
for (let i = 0; i < PATH.length - 1; i++) {
  const [ax, ay] = PATH[i];
  const [bx, by] = PATH[i + 1];
  check(
    ax === bx || ay === by,
    `PATH segment ${i} → ${i + 1}: (${ax}, ${ay}) → (${bx}, ${by}) is not axis-aligned. buildPathTiles in src/map.ts walks one axis at a time.`,
  );
}

// ─── Documentation surface ────────────────────────────────────────────────

// 8. AGENTS.md mentions every .ts file in src/
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

// 9. docs/recipes.md mentions every registry name
{
  const recipes = readFileSync(join(repoRoot, "docs/recipes.md"), "utf8");
  for (const reg of ["TOWER_DEFS", "ENEMY_DEFS", "PACTS", "WAVES"]) {
    check(
      recipes.includes(reg),
      `docs/recipes.md is missing a reference to ${reg}. The recipe for adding ${reg} content must point at this registry.`,
    );
  }
}

// 10. Adapted-copy pacts in modifiers.ts are flagged in AGENTS.md
{
  const modifiers = readFileSync(
    join(repoRoot, "src/modifiers.ts"),
    "utf8",
  );
  const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  const hasAdapted = /Adapted copy:/i.test(modifiers);
  if (hasAdapted) {
    warn(
      /adapted[- ]?copy/i.test(agentsMd) || /adapted/i.test(agentsMd),
      `src/modifiers.ts has "Adapted copy" markers but AGENTS.md does not mention adapted pacts in Known Anomalies. Update AGENTS.md so future agents know which pact mechanics are approximated.`,
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
  `${PACTS.length} pacts`,
  `${WAVES.length} waves`,
  `${Object.keys(SPRITES_16).length} sprites`,
];
console.log(`doc-check ✓  invariants hold (${summary.join(", ")})`);
