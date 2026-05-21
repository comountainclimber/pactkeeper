/// <reference types="vite/client" />

/**
 * Online scoreboard API surface — the contract that the Hall UI talks to.
 *
 * This file is the single source of truth for the client/server boundary.
 * The DOM Hall (`src/pact-screen.ts`) and the Supabase backend
 * (`supabase/functions/submit-run/index.ts`) both target the types declared
 * here.
 *
 * Two transports:
 *
 * - **Reads** go directly to Supabase PostgREST using the public anon key.
 *   Row Level Security (set up in `supabase/migrations/0001_init.sql`) allows
 *   `select` only.
 * - **Writes** go through the `submit-run` Edge Function so the server can
 *   validate the payload, recompute the score from its breakdown to catch
 *   tampered totals, and rate-limit by `device_id`.
 *
 * ## Offline / no-config fallback
 *
 * The module is safe to import even when `VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_ANON_KEY` are unset (local dev without a Supabase project).
 * In that mode `isOnline()` returns `false`, `fetchLeaderboard` returns `[]`,
 * and `submitRun` returns `null`. The Hall tab degrades gracefully to its
 * `LOCAL` sub-tab.
 *
 * ## Anti-cheat (light)
 *
 * Each browser generates a stable random `device_id` on first run via
 * {@link getDeviceId}. The Edge Function rate-limits per id and revalidates
 * the score formula. This stops casual tampering, not motivated cheaters
 * (who can rotate ids). See `AGENTS.md#scoreboards-online` for the full
 * threat model.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { HeroKind } from "./heroes.ts";
import type { ScoreEntry, ScoreOutcome } from "./score.ts";

/**
 * Bundled client build identifier shipped with every submission. The Edge
 * Function records it so we can correlate a bad submission with a specific
 * release if validation rules ever drift. Bump in lockstep with
 * `package.json#version` when the submit payload shape changes.
 */
export const CLIENT_VERSION = "0.1.0";

/** Default `fetchLeaderboard` page size — mirrors the Hall's top-25 layout. */
const DEFAULT_LIMIT = 25;

/** `localStorage` key + format guard for the per-browser device id. The
 * regex is asserted on read so a corrupted entry from an older build is
 * regenerated rather than silently sent to the server. */
const DEVICE_ID_KEY = "pk-device-id";
const DEVICE_ID_REGEX = /^[a-f0-9]{32}$/;
const DEVICE_ID_BYTES = 16;

/** Supabase Edge Function route handling the validated insert. */
const SUBMIT_RUN_FUNCTION = "submit-run";

/**
 * Singleton Supabase client. `null` when the Vite env vars aren't set
 * (local dev without a Supabase project) — every consumer guards on
 * {@link isOnline} or null-checks the cached client so a missing config
 * degrades to "offline" instead of throwing at module load.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const client: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * What slice of the leaderboard to render.
 *
 * `global` is the headline view (top scores worldwide). The remaining shapes
 * back the rich-filter sub-tabs in the Hall (REALM / HERO / PACTS).
 */
export type LeaderboardScope =
  | { kind: "global" }
  | { kind: "realm"; realm: 1 | 2 | 3 }
  | { kind: "hero"; hero: HeroKind }
  | { kind: "pacts"; count: 0 | 1 | 2 | 3 };

/**
 * Payload posted to the Edge Function on score submission.
 *
 * Field shape mirrors the Postgres `runs` table column-for-column so the
 * function can splat it through to `insert()` after validation. `name` /
 * `score` / `outcome` / `level` / `pacts` / `pact_xp` / `kills` /
 * `lives_left` / `multiplier` / `raw_score` / `life_bonus` come from
 * `RunSummary`'s `finalized` breakdown; `device_id` and `client_version`
 * are added by `src/api.ts`.
 *
 * The server recomputes
 * `final = round((raw_score + lives_left * 50) * multiplier)` and rejects
 * any submission where `final !== score`.
 */
export type RunSubmission = {
  device_id: string;
  name: string;
  score: number;
  outcome: ScoreOutcome;
  level: number;
  hero: HeroKind;
  pacts: string[];
  pact_xp: number;
  kills: number;
  lives_left: number;
  multiplier: number;
  raw_score: number;
  life_bonus: number;
  client_version: string;
};

/** Successful submit response — the inserted row's 1-based rank. */
export type SubmitResult = { rank: number };

/**
 * Whether the client is configured to talk to a real Supabase project.
 *
 * `false` when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing
 * (the default for `npm run dev` without a `.env`). Callers use this to
 * decide whether to show the GLOBAL/REALM/HERO/PACTS sub-tabs as live or
 * route the player to the LOCAL fallback.
 */
export function isOnline(): boolean {
  return client !== null;
}

/**
 * Stable random id for this browser, persisted in `localStorage` under
 * `pk-device-id`. Generated on first call via `crypto.getRandomValues`.
 * Used by the Edge Function for rate-limiting and as a soft "this submit
 * came from the device that originally played the run" signal.
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && DEVICE_ID_REGEX.test(existing)) return existing;
  } catch {
    /* Private mode / disabled storage: fall through and generate a fresh id
     * for this session so the player can still play. */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(DEVICE_ID_BYTES));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* Non-fatal: the id is still usable for this session even if it won't
     * persist across reloads. */
  }
  return id;
}

/**
 * Read the top-N entries for a scope, sorted by score desc.
 *
 * Returns `[]` when offline or on error so the caller can render a
 * fallback message instead of throwing.
 */
export async function fetchLeaderboard(
  scope: LeaderboardScope,
  limit = DEFAULT_LIMIT,
): Promise<ScoreEntry[]> {
  if (!client) return [];
  let query = client
    .from("runs")
    .select("*")
    .order("score", { ascending: false })
    .limit(limit);
  switch (scope.kind) {
    case "global":
      break;
    case "realm":
      query = query.eq("level", scope.realm);
      break;
    case "hero":
      query = query.eq("hero", scope.hero);
      break;
    case "pacts":
      query = query.eq("pact_count", scope.count);
      break;
    default: {
      /* Exhaustiveness guard: a new `LeaderboardScope` variant must
       * extend this switch, otherwise the unfiltered query would leak
       * cross-scope rows into the Hall. */
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
  try {
    const { data, error } = await query;
    if (error) {
      console.warn("[api] fetchLeaderboard failed:", error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.flatMap((row): ScoreEntry[] => {
      const entry = rowToEntry(row);
      return entry ? [entry] : [];
    });
  } catch (e) {
    console.warn("[api] fetchLeaderboard threw:", e);
    return [];
  }
}

/**
 * Submit a finished run to the global leaderboard.
 *
 * Returns `{ rank }` on success, `null` on offline / validation error /
 * rate-limit. The Hall handles `null` by surfacing an "(offline — saved
 * locally)" status next to the inscription card.
 */
export async function submitRun(
  payload: RunSubmission,
): Promise<SubmitResult | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.functions.invoke<SubmitResult>(
      SUBMIT_RUN_FUNCTION,
      { body: payload },
    );
    if (error || !data || typeof data.rank !== "number") return null;
    return { rank: data.rank };
  } catch {
    /* Network / CORS / unexpected throw: surface as "offline" so the Hall
     * shows the local-fallback message instead of a broken state. */
    return null;
  }
}

/**
 * Coerce a PostgREST `runs` row into the {@link ScoreEntry} shape used by
 * the local board. Returns `null` for any row missing or mistyped fields
 * so a single bad insert can't poison the whole leaderboard render — the
 * caller filters them out.
 *
 * Column-to-property remap mirrors the snake_case ↔ camelCase split that
 * already exists between Postgres and the in-memory `ScoreEntry` type;
 * `created_at` is converted from ISO timestamp to the unix-ms shape
 * `ScoreEntry.date` carries everywhere else.
 */
function rowToEntry(row: unknown): ScoreEntry | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const outcome = r.outcome;
  if (outcome !== "victory" && outcome !== "defeat") return null;
  if (
    typeof r.name !== "string" ||
    typeof r.score !== "number" ||
    typeof r.level !== "number" ||
    !Array.isArray(r.pacts) ||
    typeof r.pact_xp !== "number" ||
    typeof r.kills !== "number" ||
    typeof r.lives_left !== "number" ||
    typeof r.multiplier !== "number" ||
    typeof r.created_at !== "string"
  ) {
    return null;
  }
  const date = Date.parse(r.created_at);
  if (Number.isNaN(date)) return null;
  return {
    name: r.name,
    score: r.score,
    outcome,
    level: r.level,
    pacts: r.pacts.filter((p): p is string => typeof p === "string"),
    pactXp: r.pact_xp,
    kills: r.kills,
    livesLeft: r.lives_left,
    multiplier: r.multiplier,
    date,
  };
}
