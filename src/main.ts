import { Game, type RunSummary } from "./game.ts";
import { PactScreen } from "./pact-screen.ts";
import { CURRENT_LEVEL } from "./levels.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const canvasStage = document.getElementById("canvas-stage") as HTMLElement | null;
const pactStage = document.getElementById("pact-stage") as HTMLElement | null;
if (!canvas || !canvasStage || !pactStage) {
  throw new Error("Missing required DOM elements (canvas, stages)");
}
// Locals avoid re-checking for null inside callbacks.
const canvasEl = canvasStage;
const pactEl = pactStage;

const game = new Game(canvas);
game.start();

const pact = new PactScreen(pactEl);

function showPact(pending?: RunSummary): void {
  canvasEl.hidden = true;
  // Returning to the pact altar resets the campaign back to level 1.
  try {
    localStorage.setItem("pk-level", "1");
    localStorage.removeItem("pk-carry-gold");
    localStorage.removeItem("pk-carry-lives");
  } catch {
    /* localStorage may be unavailable */
  }
  pact.show(pending);
}

function startLevel(
  chosenIds: string[],
  carry?: { gold?: number; lives?: number; score?: number; kills?: number },
): void {
  pact.hide();
  canvasEl.hidden = false;
  game.beginLevelWithPacts(chosenIds, carry);
}

pact.onSeal((chosen) => {
  const ids = chosen.map((p) => p.id);
  // Persist for cross-level handoffs (the campaign keeps the sealed pacts).
  try {
    localStorage.setItem("pk-pacts", JSON.stringify(ids));
  } catch {
    /* non-fatal */
  }
  startLevel(ids);
});

// Game tells us when the run ends. Three branches:
//   1. Defeat (any level) → run is over → pact screen with inscription card
//   2. Victory on level 1 or 2 → auto-progress to the next realm carrying
//      gold + lives + running score + kills via URL params; no inscription yet
//   3. Victory on level 3 → campaign complete → pact screen with inscription
// The canvas no longer paints its own end overlay, so we transition straight
// to the inscription card (no setTimeout needed).
game.onLevelEnd((summary) => {
  const isDefeat = summary.outcome === "defeat";
  const isFinalLevel = summary.level >= 3;
  if (isDefeat || isFinalLevel) {
    showPact(summary);
    return;
  }
  // Mid-campaign victory — advance to the next realm. The campaign is
  // sequential (levels.ts defines 1 → 2 → 3); navigate via URL handoff so
  // `bootRoute()` picks it up on a fresh page load. Pacts persist in
  // localStorage; carry values ride the URL.
  const nextLevel = summary.level + 1;
  const params = new URLSearchParams();
  params.set("level", String(nextLevel));
  params.set("gold", String(Math.max(0, game.getGold())));
  params.set("lives", String(Math.max(1, summary.livesLeft)));
  params.set("score", String(Math.max(0, summary.rawScore)));
  params.set("kills", String(Math.max(0, summary.kills)));
  try {
    localStorage.setItem("pk-pacts", JSON.stringify(summary.pactIds));
    localStorage.setItem("pk-level", String(nextLevel));
  } catch {
    /* non-fatal */
  }
  window.location.href = `${window.location.pathname}?${params.toString()}`;
});

// Boot routing:
// - Level 1 (default): show pact altar so the player can seal pacts.
// - Level 2 or 3 (URL handoff from prior level's victory overlay): skip the
//   altar and resume the campaign with carried gold/lives + previously-sealed
//   pacts.
function bootRoute(): void {
  if (CURRENT_LEVEL.id === 1) {
    showPact();
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const carry: {
    gold?: number;
    lives?: number;
    score?: number;
    kills?: number;
  } = {};
  const goldRaw = params.get("gold");
  const livesRaw = params.get("lives");
  const scoreRaw = params.get("score");
  const killsRaw = params.get("kills");
  if (goldRaw !== null) {
    const n = parseInt(goldRaw, 10);
    if (Number.isFinite(n) && n >= 0) carry.gold = n;
  }
  if (livesRaw !== null) {
    const n = parseInt(livesRaw, 10);
    if (Number.isFinite(n) && n >= 1) carry.lives = n;
  }
  if (scoreRaw !== null) {
    const n = parseInt(scoreRaw, 10);
    if (Number.isFinite(n) && n >= 0) carry.score = n;
  }
  if (killsRaw !== null) {
    const n = parseInt(killsRaw, 10);
    if (Number.isFinite(n) && n >= 0) carry.kills = n;
  }
  let pacts: string[] = [];
  try {
    const raw = localStorage.getItem("pk-pacts");
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        pacts = parsed;
      }
    }
  } catch {
    /* non-fatal */
  }
  startLevel(pacts, carry);
}

bootRoute();
