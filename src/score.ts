/**
 * Score tracking + leaderboard persistence.
 *
 * Scoring formula (mirrors the design handoff in `score.js`):
 * - Per kill: enemy XP value (goblin 10, bat 14, skeleton 18, orc 28,
 *   wraith 40, dragon 90, boss 500).
 * - Per realm cleared: +{@link REALM_CLEAR_BONUS}.
 * - Per life remaining at run end: +{@link LIFE_BONUS}.
 * - Final = `(raw + lifeBonus) * (1 + totalPactXp / 1000)`, rounded.
 *
 * `Game` accumulates the per-kill points and any realm-clear bonus into a
 * single `rawScore`. `main.ts` reads that, looks up the chosen pacts' XP, and
 * calls {@link finalize} to compute the final score before handing it to the
 * pact screen for inscription.
 *
 * Persistence: top {@link MAX_ENTRIES} entries live in `localStorage` under
 * `pk-scores`, sorted desc. Player's last name persists under `pk-name`.
 */

import type { EnemyKind } from "./config.ts";

const STORAGE_KEY = "pk-scores";
const NAME_KEY = "pk-name";
const MAX_ENTRIES = 25;

export const REALM_CLEAR_BONUS = 1000;
export const LIFE_BONUS = 50;

/** Score points awarded per killed enemy by {@link EnemyKind}. Bats sit
 * between goblins and orcs in value — they're as fragile as goblins but
 * killing one requires having an archer in the right place, which is the
 * actual decision the airborne rule creates. */
export const ENEMY_SCORE: Record<EnemyKind, number> = {
  goblin: 10,
  bat: 14,
  skeleton: 18,
  orc: 28,
  wraith: 40,
  dragon: 90,
  boss: 500,
};

export type ScoreOutcome = "victory" | "defeat";

export type ScoreEntry = {
  /** Uppercased, max 12 chars. Defaults to `"KEEPER"` if blank on save. */
  name: string;
  /** The final score after multiplier. */
  score: number;
  outcome: ScoreOutcome;
  /** Highest level reached (1..3). */
  level: number;
  /** Pact ids sealed for this run. */
  pacts: string[];
  /** Sum of those pacts' XP values. */
  pactXp: number;
  /** Total enemies killed across the run. */
  kills: number;
  /** Lives remaining when the run ended. 0 on defeat. */
  livesLeft: number;
  /** The multiplier applied — `1 + pactXp / 1000`, rounded to 2 decimals. */
  multiplier: number;
  /** `Date.now()` at save time. Used as a stable tiebreaker / dedupe key. */
  date: number;
};

export type FinalizedScore = {
  /** Sum of per-kill points + realm-clear bonuses (before life bonus). */
  raw: number;
  lifeBonus: number;
  /** `raw + lifeBonus`. */
  baseTotal: number;
  /** `1 + pactXp / 1000`, rounded to 2 decimals. */
  multiplier: number;
  /** `Math.round(baseTotal * multiplier)`. */
  final: number;
};

/** Per-kill score for an enemy kind. Falls back to `10` for unknown kinds. */
export function killScore(kind: EnemyKind): number {
  return ENEMY_SCORE[kind] ?? 10;
}

/** Compute the final score for a finished run. Pure — no IO. */
export function finalize(opts: {
  rawScore: number;
  livesLeft: number;
  pactXp: number;
}): FinalizedScore {
  const raw = Math.max(0, opts.rawScore);
  const lifeBonus = Math.max(0, opts.livesLeft) * LIFE_BONUS;
  const baseTotal = raw + lifeBonus;
  const multiplier =
    Math.round((1 + Math.max(0, opts.pactXp) / 1000) * 100) / 100;
  return {
    raw,
    lifeBonus,
    baseTotal,
    multiplier,
    final: Math.round(baseTotal * multiplier),
  };
}

/** Read the saved leaderboard, sorted desc by score. */
export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isScoreEntry);
  } catch {
    return [];
  }
}

/**
 * Append an entry, sort desc, truncate to {@link MAX_ENTRIES}, persist.
 * Also persists the player's name under `pk-name` so it auto-fills next run.
 *
 * Returns the resulting board + the new entry's 1-based rank.
 */
export function saveScore(
  entry: Omit<ScoreEntry, "name" | "date"> & { name: string; date?: number },
): { scores: ScoreEntry[]; entry: ScoreEntry; rank: number } {
  const board = loadScores();
  const sanitizedName =
    (entry.name || "KEEPER")
      .toUpperCase()
      .replace(/[^A-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 12) || "KEEPER";
  const final: ScoreEntry = {
    name: sanitizedName,
    score: Math.round(entry.score),
    outcome: entry.outcome,
    level: entry.level,
    pacts: entry.pacts,
    pactXp: entry.pactXp,
    kills: entry.kills,
    livesLeft: entry.livesLeft,
    multiplier: entry.multiplier,
    date: entry.date ?? Date.now(),
  };
  board.push(final);
  board.sort((a, b) => b.score - a.score);
  board.splice(MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    /* non-fatal: localStorage may be unavailable */
  }
  try {
    localStorage.setItem(NAME_KEY, sanitizedName);
  } catch {
    /* non-fatal */
  }
  return { scores: board, entry: final, rank: board.indexOf(final) + 1 };
}

/** Wipe the saved leaderboard. */
export function clearScores(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Last name the player typed in. Empty string if unset. */
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function isScoreEntry(x: unknown): x is ScoreEntry {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.score === "number" &&
    (r.outcome === "victory" || r.outcome === "defeat") &&
    typeof r.level === "number" &&
    Array.isArray(r.pacts) &&
    typeof r.pactXp === "number" &&
    typeof r.kills === "number" &&
    typeof r.livesLeft === "number" &&
    typeof r.multiplier === "number" &&
    typeof r.date === "number"
  );
}
