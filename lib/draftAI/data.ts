// Curated data tables used across the draft AI. Pure data — no logic.
// Each table is keyed by champion alias (matching `Champion.alias` from
// CommunityDragon).

import type { Archetype, ChampionMeta } from "../championMeta";
import hardCountersJson from "../data/hardCounters.json";

// ─── Damage classification overrides ────────────────────────────────────────

// Champions whose Riot role tags would mis-classify them as AD when they
// actually build full AP (assassins/fighters that itemize ability power).
// Without this override, e.g., Akali (tagged "Assassin") gets counted as
// AD and trips the "too much AD" penalty even though she does magic damage.
export const AP_BUILDERS_OVERRIDE: ReadonlySet<string> = new Set([
  "Akali",
  "Ekko",
  "Fizz",
  "Mordekaiser",
  "Singed",
  "Teemo",
  // Tagged Assassin only but builds AP:
  "Evelynn", // also tagged Mage so fine, but listed for clarity
  // Tagged Fighter only but builds AP:
  "Rumble", // also tagged Mage so fine
]);

// Genuine hybrid damage champions — count for both AP and AD when computing
// damage profile. Their itemization or kit threatens both types meaningfully.
export const HYBRID_DAMAGE: ReadonlySet<string> = new Set([
  "Kayle",
  "Kennen",
]);

// Champions tagged Tank/Fighter that build pure tank items and contribute
// negligible damage of either type. Excluded from both AP and AD counts so
// they don't artificially balance an otherwise-lopsided comp.
export const NEITHER_DAMAGE: ReadonlySet<string> = new Set([
  "Sion",
  "Maokai",
  "Zac",
  "Ornn",
  "Rell",
]);

// ─── Hard counter table ─────────────────────────────────────────────────────

// Format: [counter, victim, bonus]. Picking `counter` against a drafted
// `victim` adds `bonus` to the lane matchup score; the reverse (picking
// `victim` into `counter`) deducts the same amount. ~70 well-known LoL
// matchups across all lanes. Curated, not exhaustive — a missing entry
// just falls back to the generic mobility/phase heuristic. The tuples
// live in lib/data/hardCounters.json.
export const HARD_COUNTERS: ReadonlyArray<readonly [string, string, number]> =
  hardCountersJson as unknown as ReadonlyArray<readonly [string, string, number]>;

// ─── Comp identity templates ────────────────────────────────────────────────

// The AI locks onto an identity once its `trigger` fires (after at least 2
// picks) and rewards subsequent picks that complete it via `needed`
// archetypes. With the best-match selection (see helpers.identityTarget),
// order matters less than `needed` overlap with current picks, but more
// specific identities are still listed first as a tiebreaker.
export const IDENTITIES: ReadonlyArray<{
  label: string;
  trigger: (c: Record<Archetype, number>) => boolean;
  needed: ReadonlyArray<Archetype>;
}> = [
  {
    label: "Wombo Combo",
    trigger: (c) => c.wombo >= 1 && c.engage >= 1,
    needed: ["wombo", "engage"],
  },
  {
    label: "Protect The Carry",
    trigger: (c) => c["hyper-carry"] >= 1 && c.peel >= 1,
    needed: ["peel", "enchanter", "hyper-carry"],
  },
  {
    label: "Hyper Engage",
    trigger: (c) => c.engage >= 2,
    needed: ["engage", "tank", "dive"],
  },
  {
    label: "Pick Comp",
    trigger: (c) => c.pick >= 1 && (c.assassin >= 1 || c.burst >= 1),
    needed: ["pick", "assassin", "burst"],
  },
  {
    label: "Poke / Siege",
    trigger: (c) => c.poke >= 2,
    needed: ["poke"],
  },
  {
    label: "Dive Comp",
    trigger: (c) => c.dive >= 2,
    needed: ["dive", "engage"],
  },
  {
    label: "Tank Stack",
    trigger: (c) => c.tank >= 2 && c.engage >= 1,
    needed: ["tank", "engage"],
  },
  {
    label: "1-3-1 Splitpush",
    trigger: (c) => c.splitpush >= 1,
    needed: ["splitpush", "poke", "wombo"],
  },
  {
    label: "AP Burst",
    trigger: (c) => c.burst >= 2,
    needed: ["burst", "engage", "pick"],
  },
  {
    label: "Bruiser Brawl",
    trigger: (c) => c.skirmish >= 2 && c.sustain >= 1,
    needed: ["skirmish", "sustain", "tank"],
  },
  {
    label: "Standard Teamfight",
    trigger: (c) => c.engage >= 1 && c["hyper-carry"] >= 1,
    needed: ["engage", "peel", "hyper-carry"],
  },
];

// ─── Misc constants ─────────────────────────────────────────────────────────

export const FALLBACK_META: ChampionMeta = {
  phase: "mid",
  archetypes: ["skirmish"],
  cc: "soft",
  mobility: "medium",
  metaTiers: {},
};

// All sampling parameters below are intuition-tuned. Picks are more
// sample-driven (variety matters across runs); bans are more deterministic
// (a wrong ban tends to lose the game; a wrong pick can be salvaged by the
// rest of the draft). Fine-tuning would benefit from playthroughs.

// PICK_TOP_N = 3
// Number of top-scored candidates to sample from when the AI picks. Larger
// = more variety, but past 5 the marginal options become noticeably weak
// vs the top choice.
export const PICK_TOP_N = 3;

// PICK_TEMPERATURE = 2.0
// Softmax temperature for pick sampling. With temperature 2 and a +3 score
// gap, the lower candidate has ~22% relative weight (so chosen wins ~70%).
// Higher = more random picks; lower = more deterministic.
export const PICK_TEMPERATURE = 2.0;

// POCKET_PICK_PROB = 0.05
// Chance per pick to widen sampling pool to top-7 instead of top-3, giving
// a "pocket pick" surprise. 5% means ~1 in 20 picks is a wildcard — visible
// but not destructive across a single draft (4-5 picks per side).
export const POCKET_PICK_PROB = 0.05;
export const POCKET_PICK_TOP_N = 7;

// BAN_TOP_N = 3, BAN_TEMPERATURE = 1.5
// Bans are weighted slightly more toward determinism than picks because the
// scoring signal is generally cleaner (anticipation + threat are concrete
// negative values, not relative comparisons).
export const BAN_TOP_N = 3;
export const BAN_TEMPERATURE = 1.5;

// LOOKAHEAD_TOP_K = 5
// Lookahead is expensive (1 prediction call per candidate, each costing N
// scoring evaluations). Limiting to top-5 keeps the cost bounded — only
// the realistic candidates get re-evaluated. Past top-5 the candidate is
// rarely going to win the sampling roll anyway.
export const LOOKAHEAD_TOP_K = 5;
