/**
 * The Pact roster.
 *
 * Adding a pact:
 *   1. Append a {@link Pact} entry to `PACTS` below.
 *   2. Pick a `sigil` from `SigilId` in `sigils.ts` (or add a new sprite there).
 *   3. Choose a `school` for the colored dot/label only — no mechanical effect.
 *   4. Implement `apply` against the {@link PactEffects} schema. Compose-friendly:
 *      multiply onto whatever's there. Don't reach into Game state.
 *   5. Keep `downside` / `upside` honest — they're player-facing copy.
 *
 * Stacking semantics: `applyPacts` runs each chosen pact's `apply` in order
 * over a fresh {@link PactEffects}. Multipliers compose multiplicatively;
 * `startingLivesDelta` composes additively.
 */
import type { Pact, PactEffects } from "./types.ts";

/** A no-op {@link PactEffects} — every multiplier `1`, every delta `0`. The
 * starting point for {@link applyPacts}. */
export function defaultEffects(): PactEffects {
  return {
    enemyHpMult: 1,
    enemySpeedMult: 1,
    enemyBountyMult: 1,
    towerDamageMult: 1,
    towerRangeMult: 1,
    towerCostMult: 1,
    startingGoldMult: 1,
    startingLivesDelta: 0,
    waveSizeMult: 1,
  };
}

/**
 * The fixed roster of 9 pacts, matching the design handoff.
 *
 * Several pacts have copy that describes mechanics not yet implemented
 * (skeleton revival, multi-arrow towers, kill-stacking damage, destructible
 * towers, scheduled boss spawns, max-tower-slot caps). Their `apply()` uses
 * approximations from the existing {@link PactEffects} schema. Search for
 * `Adapted copy:` to find them — implementing the real mechanic is a unit of
 * work each, tracked in `AGENTS.md` "Known anomalies".
 */
export const PACTS: Pact[] = [
  {
    id: "iron_hide",
    name: "Iron Hide",
    tagline: "The foe wears the burden's gift.",
    school: "TRIAL",
    sigil: "shield",
    accent: "#c98a3a",
    hi: "#e8c440",
    glow: "#fff080",
    downside: "Enemies have +50% HP",
    upside: "Enemies drop +60% gold",
    apply: (e) => {
      e.enemyHpMult *= 1.5;
      e.enemyBountyMult *= 1.6;
    },
  },
  {
    id: "swift_foes",
    name: "Swift Foes",
    tagline: "Speed answers speed.",
    school: "TRIAL",
    sigil: "wing",
    accent: "#7a3050",
    hi: "#c44070",
    glow: "#f08aa0",
    downside: "Enemies move 30% faster",
    upside: "Towers fire from +25% range",
    apply: (e) => {
      e.enemySpeedMult *= 1.3;
      e.towerRangeMult *= 1.25;
    },
  },
  {
    id: "glass_cannon",
    name: "Glass Cannon",
    tagline: "Brittle, brutal, beautiful.",
    school: "WAGER",
    sigil: "diamond",
    accent: "#4a90b0",
    hi: "#7ad4e8",
    glow: "#c8f0fa",
    downside: "Start with only 8 lives",
    upside: "Towers deal +60% damage",
    apply: (e) => {
      e.startingLivesDelta -= 12;
      e.towerDamageMult *= 1.6;
    },
  },
  {
    id: "thrifty",
    name: "Thrifty Builder",
    tagline: "Coin spent, coin saved.",
    school: "WAGER",
    sigil: "coin",
    accent: "#c98a3a",
    hi: "#e8c440",
    glow: "#fff080",
    downside: "Towers cost +40% gold",
    upside: "Start with +100 gold",
    apply: (e) => {
      e.towerCostMult *= 1.4;
      e.startingGoldMult *= 1.67;
    },
  },
  {
    id: "endless_swarms",
    name: "Endless Swarms",
    tagline: "They keep coming.",
    school: "TRIAL",
    sigil: "hourglass",
    accent: "#5a8a3a",
    hi: "#8aaa54",
    glow: "#c8e088",
    downside: "Waves are 50% larger",
    upside: "Double gold per kill",
    apply: (e) => {
      // Design says "+2 enemies per wave"; we approximate with a 1.5x multiplier
      // since our spawn system multiplies group counts.
      e.waveSizeMult *= 1.5;
      e.enemyBountyMult *= 2;
    },
  },
  {
    id: "bone_steel",
    name: "Bone & Steel",
    tagline: "The dead pay the toll.",
    school: "WAGER",
    sigil: "skull",
    accent: "#9a948f",
    hi: "#d4ccc0",
    glow: "#ffffff",
    // Adapted copy: design says "Skeletons revive once" / "Towers +1 dmg per kill" —
    // both require new mechanics. We substitute a comparable risk/reward profile.
    downside: "Skeletons have +80% HP",
    upside: "Towers deal +30% damage",
    apply: (e) => {
      // Skeleton-specific HP boost would need per-kind multipliers; for now use
      // a broad enemy HP boost weighted toward late-wave enemies.
      e.enemyHpMult *= 1.25;
      e.towerDamageMult *= 1.3;
    },
  },
  {
    id: "frozen_veins",
    name: "Frozen Veins",
    tagline: "The cold refuses to bite.",
    school: "BOON",
    sigil: "snowflake",
    accent: "#4a90b0",
    hi: "#7ad4e8",
    glow: "#c8f0fa",
    // Adapted copy: design says "Enemies immune to slow" / "Archers fire two arrows" —
    // tower-kind-specific buffs would need wiring. Approximate with broader values.
    downside: "Enemies move 20% faster",
    upside: "Towers fire 35% faster effective rate",
    apply: (e) => {
      e.enemySpeedMult *= 1.2;
      // Approximate "fire two arrows" with a flat damage uplift since fire-rate is
      // per-tower in config and not yet wired through PactEffects.
      e.towerDamageMult *= 1.35;
    },
  },
  {
    id: "fragile_towers",
    name: "Fragile Towers",
    tagline: "Built to break, built to burn.",
    school: "WAGER",
    sigil: "tower",
    accent: "#c93a3a",
    hi: "#e85a4a",
    glow: "#ff9070",
    // Adapted copy: design says "Towers can be destroyed" — needs tower-HP system.
    // Substitute a global cost reduction with a damage trade-off.
    downside: "Towers deal 15% less damage",
    upside: "All towers cost 50% less",
    apply: (e) => {
      e.towerDamageMult *= 0.85;
      e.towerCostMult *= 0.5;
    },
  },
  {
    id: "blood_moon",
    name: "Blood Moon",
    tagline: "It watches every wave.",
    school: "CURSE",
    sigil: "moon",
    accent: "#c93a3a",
    hi: "#e85a4a",
    glow: "#ff9070",
    // Adapted copy: design says "Boss spawns in Wave 3" / "+1 max tower slot" —
    // boss-spawn timing and slot cap aren't wired yet. Substitute potent stat trade.
    downside: "Enemies have +30% HP and speed",
    upside: "Start with +200 gold",
    apply: (e) => {
      e.enemyHpMult *= 1.3;
      e.enemySpeedMult *= 1.3;
      e.startingGoldMult *= 2.33;
    },
  },
];

/**
 * Compose a set of chosen pacts into a single {@link PactEffects}. Pacts
 * apply in array order; the result is what `Game.beginLevelWithPacts` stores
 * and what every gameplay function receives as multipliers.
 */
export function applyPacts(chosen: Pact[]): PactEffects {
  const effects = defaultEffects();
  for (const p of chosen) p.apply(effects);
  return effects;
}
