/**
 * submit-run — server-side score submission for the Pactkeeper Hall.
 *
 * We never trust the client's `score` directly. The payload carries the
 * full breakdown (`raw_score`, `lives_left`, `life_bonus`, `multiplier`)
 * so the function can recompute `round((raw + lives*50) * mult)` and
 * reject any total that doesn't match. The insert here is the only path
 * that writes to `runs` — anon RLS blocks direct inserts, so a leaked
 * anon key still can't tamper with the leaderboard.
 *
 * Validation flow (short-circuits on the first failure):
 *
 *   1. HTTP shape       — POST only; OPTIONS returns CORS preflight.
 *   2. JSON shape       — body parseable; required keys + types present.
 *   3. Range checks     — mirror the SQL CHECK constraints so we 400
 *                         with a readable error before Postgres rejects.
 *   4. Formula recompute — `score === round((raw + lives*50) * mult)`.
 *   5. Sanity caps      — kills, pacts.length, life_bonus consistency.
 *   6. Rate limit       — at most one insert per device per 30 seconds.
 *   7. Insert + rank    — service-role insert, then `count where score >`
 *                         to derive the inserted row's 1-based rank.
 *
 * Anti-cheat is intentionally light. Motivated attackers can rotate
 * `device_id` to dodge the rate limit; that trade-off is documented in
 * `AGENTS.md#scoreboards-online`. The defenses here stop casual
 * tampering (devtools edits, replayed payloads, score-only forgeries)
 * without an account system.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Mirror of the SQL `name` CHECK + client sanitiser in `src/score.ts`. */
const NAME_RE = /^[A-Z0-9 _\-]{1,12}$/;
/** Random 16-byte device key from `crypto.getRandomValues` → 32 hex chars.
 * Range is 8..64 to leave headroom if the client later switches widths. */
const DEVICE_ID_RE = /^[0-9a-f]{8,64}$/i;
const HERO_KINDS = new Set(["knight", "archer", "frost_magus"]);
const OUTCOMES = new Set(["victory", "defeat"]);

const RATE_LIMIT_WINDOW_SEC = 30;
const MAX_PACTS = 10;
const MAX_KILLS = 5000;
const MAX_SCORE = 1_000_000;
const LIFE_BONUS_PER_LIFE = 50;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 1.99;
const MAX_CLIENT_VERSION_LEN = 32;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function badRequest(error: string): Response {
  return jsonResponse(400, { error });
}

/** Mirrors the client-side sanitiser in `saveScore` (`src/score.ts`) so
 * the server-stored name matches what the player will see locally. */
function sanitizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 _\-]/g, "")
    .trim()
    .slice(0, 12);
}

function isNonNegInt(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 0
  );
}

type RawBody = Record<string, unknown>;

type ValidatedRun = {
  device_id: string;
  name: string;
  score: number;
  outcome: "victory" | "defeat";
  level: number;
  hero: string;
  pacts: string[];
  pact_xp: number;
  kills: number;
  lives_left: number;
  multiplier: number;
  raw_score: number;
  life_bonus: number;
  client_version: string;
};

/** Returns the validated row on success, or a `Response` to short-circuit. */
function validate(body: RawBody): ValidatedRun | Response {
  if (
    typeof body.device_id !== "string" ||
    !DEVICE_ID_RE.test(body.device_id)
  ) {
    return badRequest("invalid device_id");
  }
  if (typeof body.name !== "string") {
    return badRequest("invalid name");
  }
  const name = sanitizeName(body.name);
  if (!NAME_RE.test(name)) {
    return badRequest("invalid name");
  }
  if (
    typeof body.score !== "number" ||
    !Number.isInteger(body.score) ||
    body.score < 0 ||
    body.score > MAX_SCORE
  ) {
    return badRequest("invalid score");
  }
  if (typeof body.outcome !== "string" || !OUTCOMES.has(body.outcome)) {
    return badRequest("invalid outcome");
  }
  if (
    typeof body.level !== "number" ||
    !Number.isInteger(body.level) ||
    body.level < 1 ||
    body.level > 3
  ) {
    return badRequest("invalid level");
  }
  if (typeof body.hero !== "string" || !HERO_KINDS.has(body.hero)) {
    return badRequest("invalid hero");
  }
  if (
    !Array.isArray(body.pacts) ||
    body.pacts.length > MAX_PACTS ||
    body.pacts.some((p) => typeof p !== "string")
  ) {
    return badRequest("invalid pacts");
  }
  if (
    !isNonNegInt(body.pact_xp) ||
    !isNonNegInt(body.kills) ||
    !isNonNegInt(body.lives_left) ||
    !isNonNegInt(body.raw_score) ||
    !isNonNegInt(body.life_bonus)
  ) {
    return badRequest("invalid integers");
  }
  if (
    typeof body.multiplier !== "number" ||
    !Number.isFinite(body.multiplier) ||
    body.multiplier < MIN_MULTIPLIER ||
    body.multiplier > MAX_MULTIPLIER
  ) {
    return badRequest("invalid multiplier");
  }
  if (
    typeof body.client_version !== "string" ||
    body.client_version.length < 1 ||
    body.client_version.length > MAX_CLIENT_VERSION_LEN
  ) {
    return badRequest("invalid client_version");
  }

  if (body.kills > MAX_KILLS) {
    return badRequest("kills too high");
  }
  if (body.life_bonus !== body.lives_left * LIFE_BONUS_PER_LIFE) {
    return badRequest("life bonus mismatch");
  }

  const expected = Math.round(
    (body.raw_score + body.lives_left * LIFE_BONUS_PER_LIFE) * body.multiplier,
  );
  if (expected !== body.score) {
    return badRequest("score mismatch");
  }

  return {
    device_id: body.device_id,
    name,
    score: body.score,
    outcome: body.outcome as "victory" | "defeat",
    level: body.level,
    hero: body.hero,
    pacts: body.pacts as string[],
    pact_xp: body.pact_xp,
    kills: body.kills,
    lives_left: body.lives_left,
    multiplier: body.multiplier,
    raw_score: body.raw_score,
    life_bonus: body.life_bonus,
    client_version: body.client_version,
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return badRequest("invalid body");
  }

  const validated = validate(parsed as RawBody);
  if (validated instanceof Response) {
    return validated;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "server misconfigured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Rate limit: one accepted submit per device per 30s window. The
  // `runs_device_recent` index keeps this `O(log n)`.
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_SEC * 1000,
  ).toISOString();
  const { count: recent, error: rateErr } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("device_id", validated.device_id)
    .gt("created_at", since);
  if (rateErr) {
    return jsonResponse(500, { error: "rate-limit query failed" });
  }
  if ((recent ?? 0) >= 1) {
    return jsonResponse(429, { error: "rate limited" });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("runs")
    .insert({
      device_id: validated.device_id,
      name: validated.name,
      score: validated.score,
      outcome: validated.outcome,
      level: validated.level,
      hero: validated.hero,
      pacts: validated.pacts,
      pact_xp: validated.pact_xp,
      kills: validated.kills,
      lives_left: validated.lives_left,
      multiplier: validated.multiplier,
      raw_score: validated.raw_score,
      life_bonus: validated.life_bonus,
      client_version: validated.client_version,
    })
    .select("score")
    .single();
  if (insertErr || !inserted) {
    return jsonResponse(500, { error: "insert failed" });
  }

  // Rank = (number of rows with strictly higher score) + 1. Ties resolve
  // in favour of the earlier insert, matching how the Hall renders them.
  const { count: higher, error: rankErr } = await supabase
    .from("runs")
    .select("id", { count: "exact", head: true })
    .gt("score", inserted.score);
  if (rankErr) {
    return jsonResponse(500, { error: "rank query failed" });
  }

  return jsonResponse(200, { rank: (higher ?? 0) + 1 });
});
