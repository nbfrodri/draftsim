// Curated data tables used across the draft AI. Pure data — no logic.
// Each table is keyed by champion alias (matching `Champion.alias` from
// CommunityDragon).

import type { Archetype, ChampionMeta } from "../championMeta";

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
// just falls back to the generic mobility/phase heuristic.
export const HARD_COUNTERS: ReadonlyArray<readonly [string, string, number]> = [
  // ─── Top lane ─────────────────────────────────────────────────────
  ["Malphite", "Yasuo", 6],
  ["Malphite", "Yone", 6],
  ["Malphite", "Tryndamere", 4],
  ["Pantheon", "Yone", 5],
  ["Pantheon", "Yasuo", 5],
  ["Pantheon", "Akali", 4],
  ["Pantheon", "Riven", 4],
  ["Renekton", "Aatrox", 4],
  ["Renekton", "Riven", 4],
  ["Renekton", "Camille", 3],
  ["Garen", "Darius", 3],
  ["Yorick", "Nasus", 5],
  ["Olaf", "MasterYi", 5],
  ["Olaf", "Nocturne", 4],
  ["Cassiopeia", "Akali", 3],
  ["Quinn", "Darius", 4],
  ["Quinn", "Sett", 3],
  ["Vayne", "Nasus", 4],
  ["Teemo", "Tryndamere", 4],
  ["Singed", "Tryndamere", 3],
  ["Kennen", "Renekton", 3],
  ["Gnar", "Renekton", 3],
  ["Jayce", "Aatrox", 3],
  ["Fiora", "Sett", 3],
  ["Shen", "Riven", 3],
  ["Camille", "Aatrox", 3],
  ["Mordekaiser", "Hecarim", 3],
  // Top — extended set
  ["Yorick", "Vladimir", 3],
  ["Mordekaiser", "Tryndamere", 4],
  ["Volibear", "Yasuo", 3],
  ["Heimerdinger", "Tryndamere", 4],
  ["Wukong", "Vayne", 3],
  ["TahmKench", "Riven", 3],
  ["KSante", "Aatrox", 3],
  ["Gwen", "Riven", 3],
  ["Jax", "Riven", 3],
  ["Garen", "Mordekaiser", 3],
  ["Singed", "MasterYi", 4],
  ["Sion", "Akali", 3],
  ["Quinn", "Yone", 3],
  ["Vayne", "Tryndamere", 4],
  ["Sett", "Renekton", 3],
  ["Camille", "Quinn", 3],
  ["Pantheon", "Mordekaiser", 3],
  ["Renekton", "Yorick", 3],
  ["Maokai", "Akali", 3],
  ["Shen", "Akali", 3],
  ["Kennen", "Aatrox", 3],
  ["Ornn", "Riven", 3],

  // ─── Mid lane ─────────────────────────────────────────────────────
  ["Diana", "Yasuo", 3],
  ["LeBlanc", "Karthus", 3],
  ["Talon", "Cassiopeia", 3],
  ["Annie", "Yasuo", 3],
  ["Galio", "Yasuo", 3],
  ["Anivia", "Yasuo", 4],
  ["Yasuo", "Lissandra", -3], // Lissandra R cancels Yasuo's flow
  ["Lissandra", "Yasuo", 3],
  ["Vladimir", "Talon", 3],
  ["Kassadin", "Xerath", 4],
  ["Fizz", "Lux", 3],
  ["Sylas", "Karma", 2],
  ["Annie", "Veigar", 3],
  // Mid — extended set
  ["Veigar", "Yasuo", 4],
  ["Lissandra", "Kassadin", 3],
  ["Anivia", "Yone", 3],
  ["Brand", "Karthus", 3],
  ["Cassiopeia", "Lux", 3],
  ["Syndra", "Akali", 3],
  ["Orianna", "Kassadin", 3],
  ["ChoGath", "Yasuo", 3],
  ["Akali", "Lux", 3],
  ["LeBlanc", "Akali", 3],
  ["Talon", "LeBlanc", 3],
  ["Diana", "Akali", 3],
  ["Vladimir", "Akali", 3],
  ["Ekko", "Akali", 3],
  ["Karma", "Yone", 3],
  ["Zoe", "Yasuo", 3],
  ["Annie", "Zed", 3],
  ["Galio", "Akali", 3],
  ["Lissandra", "Talon", 3],
  ["Malzahar", "Yasuo", 3],
  ["Pantheon", "Yasuo", 4],
  ["Veigar", "Akali", 3],
  ["Xerath", "Yasuo", 3],
  ["Lux", "Akali", -2], // Lux struggles vs Akali shroud

  // ─── Jungle ───────────────────────────────────────────────────────
  ["Khazix", "Rengar", 3],
  ["Vi", "LeBlanc", 3],
  ["Kindred", "MasterYi", 4],
  ["Ekko", "MasterYi", 3],
  ["LeeSin", "Yasuo", 2],
  // Jungle — extended set
  ["Rammus", "MasterYi", 5],
  ["Khazix", "LeBlanc", 3],
  ["Fiddlesticks", "Kindred", 3],
  ["Hecarim", "Kindred", 3],
  ["Graves", "LeeSin", 3],
  ["Karthus", "MasterYi", 3],
  ["Olaf", "Karthus", 4],
  ["Vi", "Kassadin", 3],
  ["Diana", "Kayn", 3],
  ["Nocturne", "Caitlyn", 3],
  ["Shaco", "Yi", 2],
  ["JarvanIV", "Yasuo", 3],
  ["Skarner", "MasterYi", 4],
  ["Lillia", "Hecarim", 3],

  // ─── Bot ADC ──────────────────────────────────────────────────────
  ["Vayne", "ChoGath", 5],
  ["Vayne", "Sion", 4],
  ["Caitlyn", "Draven", 3],
  ["Caitlyn", "Lucian", 3],
  ["Draven", "Caitlyn", 2], // Draven wins early all-ins
  ["Tristana", "Caitlyn", 2],
  ["Ezreal", "Draven", 3],
  ["MissFortune", "Twitch", 3],
  ["Jhin", "Vayne", 2],
  ["Lucian", "Caitlyn", -1],
  // Bot — extended set
  ["Caitlyn", "Sivir", 3],
  ["Lucian", "Vayne", 3],
  ["Caitlyn", "Twitch", 3],
  ["Sivir", "Vayne", 3],
  ["Tristana", "Vayne", 3],
  ["Smolder", "Draven", 3],
  ["Caitlyn", "MissFortune", 2],
  ["Vayne", "Aphelios", 2],
  ["Draven", "Vayne", 2],

  // ─── Support ──────────────────────────────────────────────────────
  ["Pyke", "Senna", 3],
  ["Pyke", "Soraka", 3],
  ["Blitzcrank", "Yuumi", 5],
  ["Leona", "Yuumi", 4],
  ["Brand", "Yuumi", 4],
  ["Zyra", "Janna", 3],
  ["Morgana", "Blitzcrank", 4],
  ["Nautilus", "Yuumi", 4],
  ["Karma", "Brand", 2],
  ["Thresh", "Blitzcrank", 2],
  // Support — extended set
  ["Janna", "Pyke", 3],
  ["Lulu", "Pyke", 3],
  ["Karma", "Blitzcrank", 3],
  ["Bard", "Blitzcrank", 3],
  ["Janna", "Leona", 3],
  ["Lulu", "Leona", 3],
  ["Senna", "Pyke", 3],
  ["Lux", "Pyke", 3],
  ["Soraka", "Brand", 3],
  ["Sona", "Brand", 3],
  ["Milio", "Pyke", 3],
  ["Renata", "Pyke", 3],
  ["Yuumi", "Brand", -3], // Yuumi has no escape from Brand zone control
];

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
