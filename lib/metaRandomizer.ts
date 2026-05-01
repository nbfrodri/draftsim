// Meta randomization. Generates a fresh tier per (champion, lane) using a
// BALANCED bucket-fill — for each role, the target counts of S+/S/A/B/C/D
// follow a realistic LoL meta distribution.
//
// Two design rules to keep results sensible:
//
// 1. Off-meta secondary roles (baseline tier C or D) are EXCLUDED from each
//    role's pool. We don't want Pantheon mid/jungle showing up in the
//    randomized tier list just because the baseline tagged him there as a
//    pocket pick.
//
// 2. Each randomization perturbs the target proportions ±25%, then
//    renormalizes. So the count of S+ champions in mid varies between runs
//    instead of locking to a fixed number.
//
// Persisted via localStorage so the chosen meta only changes when the user
// clicks "Randomize" again.

import {
  CHAMPION_META,
  TIER_ORDER,
  type CounterPair,
  type MetaOverride,
  type MetaTier,
  type Synergy,
} from "./championMeta";
import type { Champion, Lane } from "./types";

// Baseline target proportion of each tier in any given role. Sums to 1.0.
// Real-patch shape: most picks land in A/B, a handful at the extremes.
const TARGET_PROPS: Record<MetaTier, number> = {
  "S+": 0.12,
  S: 0.18,
  A: 0.3,
  B: 0.25,
  C: 0.11,
  D: 0.04,
};

// Tiers eligible to enter the random pool. Champions whose baseline tier in
// a lane is C or D are considered off-meta in that lane and excluded — they
// won't appear in the randomized tier list for that lane.
const ELIGIBLE_BASELINE: ReadonlySet<MetaTier> = new Set(["S+", "S", "A", "B"]);

const LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Per-randomization perturbation of TARGET_PROPS. Each tier's weight is
// multiplied by a random factor in [0.75, 1.25], then the whole vector is
// renormalized so it sums to 1. Result: noticeable run-to-run variance in
// how many S+ vs A vs B champs end up in each role.
function variedProps(): Record<MetaTier, number> {
  const factor = (): number => 0.75 + Math.random() * 0.5;
  const adjusted: Record<MetaTier, number> = {
    "S+": TARGET_PROPS["S+"] * factor(),
    S: TARGET_PROPS.S * factor(),
    A: TARGET_PROPS.A * factor(),
    B: TARGET_PROPS.B * factor(),
    C: TARGET_PROPS.C * factor(),
    D: TARGET_PROPS.D * factor(),
  };
  const sum = TIER_ORDER.reduce((s, t) => s + adjusted[t], 0);
  for (const t of TIER_ORDER) adjusted[t] /= sum;
  return adjusted;
}

// Convert proportions to integer counts matching the lane's exact pool size.
// Reconcile rounding by bumping A up or trimming D → C → B down.
function targetCounts(
  total: number,
  props: Record<MetaTier, number>,
): Record<MetaTier, number> {
  const counts: Record<MetaTier, number> = {
    "S+": 0,
    S: 0,
    A: 0,
    B: 0,
    C: 0,
    D: 0,
  };
  for (const t of TIER_ORDER) counts[t] = Math.round(total * props[t]);
  let sum = TIER_ORDER.reduce((s, t) => s + counts[t], 0);
  while (sum < total) {
    counts.A++;
    sum++;
  }
  while (sum > total) {
    if (counts.D > 0) counts.D--;
    else if (counts.C > 0) counts.C--;
    else if (counts.B > 0) counts.B--;
    else counts.A--;
    sum--;
  }
  return counts;
}

export function randomizeMeta(champions: Champion[]): MetaOverride {
  // 1. Group champions by lane. Two filters apply:
  //    a) The champion must actually be played in that lane per Meraki's data
  //       (champion.lanes) — same source of truth as champ select. This stops
  //       off-role flex tags from leaking into the wrong tier list.
  //    b) The baseline tier in that lane must be B or higher — C/D off-meta
  //       picks are dropped from the random pool so they don't get
  //       randomized up to S+. They are preserved at their baseline tier
  //       in the override (see step 4) so champ select still shows a
  //       tier badge for pocket picks instead of a missing one.
  const byAlias = new Map(champions.map((c) => [c.alias, c]));
  const laneToChamps: Record<Lane, string[]> = {
    top: [],
    jungle: [],
    middle: [],
    bottom: [],
    support: [],
  };
  // Off-meta (C/D) baseline tiers preserved verbatim into the override.
  // Pocket picks stay pocket picks; they just keep their tier instead of
  // being dropped entirely.
  const offMetaPreserve: MetaOverride = {};
  for (const [alias, meta] of Object.entries(CHAMPION_META)) {
    const champ = byAlias.get(alias);
    if (!champ) continue;
    for (const [laneKey, tier] of Object.entries(meta.metaTiers)) {
      const lane = laneKey as Lane;
      if (!champ.lanes.includes(lane)) continue; // Meraki must agree
      if (!tier) continue;
      if (ELIGIBLE_BASELINE.has(tier)) {
        laneToChamps[lane].push(alias);
      } else {
        if (!offMetaPreserve[alias]) offMetaPreserve[alias] = {};
        offMetaPreserve[alias][lane] = tier;
      }
    }
  }

  // 2. Generate this run's perturbed tier proportions.
  const props = variedProps();

  // 3. For each lane, shuffle pool and bucket-fill into target counts.
  const override: MetaOverride = {};
  for (const lane of LANES) {
    const shuffled = shuffle(laneToChamps[lane]);
    const counts = targetCounts(shuffled.length, props);
    let idx = 0;
    for (const tier of TIER_ORDER) {
      const n = counts[tier];
      for (let j = 0; j < n && idx < shuffled.length; j++, idx++) {
        const alias = shuffled[idx];
        if (!override[alias]) override[alias] = {};
        override[alias][lane] = tier;
      }
    }
  }

  // 4. Layer preserved off-meta tiers on top of the randomized override
  // — these were skipped during pool construction so they don't compete
  // for random S+/S/A spots, but we still want a tier badge to render
  // in champ select instead of nothing.
  for (const [alias, lanes] of Object.entries(offMetaPreserve)) {
    if (!override[alias]) override[alias] = {};
    for (const [lane, tier] of Object.entries(lanes)) {
      if (override[alias][lane as Lane] == null) {
        override[alias][lane as Lane] = tier;
      }
    }
  }

  // 5. Champions whose baseline didn't intersect Meraki's lanes wouldn't
  // have been touched — give them an empty override entry so they
  // disappear from all tier lists rather than falling through to baseline.
  for (const alias of Object.keys(CHAMPION_META)) {
    if (!override[alias]) override[alias] = {};
  }

  return override;
}

// ─── Persistence ──────────────────────────────────────────────────────────

const STORAGE_KEY = "draftsim:metaOverride:v1";
const SOURCE_KEY = "draftsim:metaSource:v1";

export function saveMetaSource(source: "default" | "randomized" | "custom"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // ignore
  }
}

export function loadMetaSource(): "default" | "randomized" | "custom" {
  if (typeof window === "undefined") return "default";
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (raw === "randomized" || raw === "custom") return raw;
  } catch {
    // ignore
  }
  return "default";
}

const ENABLED_KEY = "draftsim:metaEnabled:v1";

export function saveMetaEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadMetaEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return true;
}

export function saveMetaOverride(o: MetaOverride | null): void {
  if (typeof window === "undefined") return;
  try {
    if (o == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    // Quota errors / privacy mode — silently no-op.
  }
}

export function loadMetaOverride(): MetaOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed == null) return null;
    return parsed as MetaOverride;
  } catch {
    return null;
  }
}

// ─── Random synergies ─────────────────────────────────────────────────────
//
// Generate a fresh CHAMPION_SYNERGIES-shaped list with random pairs, random
// bonuses, and random tags. Pairs are unordered + de-duplicated; bonus
// follows a triangular distribution biased toward 2-star (matches the
// baseline shape: most synergies are situational/strong, few are iconic).

const RANDOM_SYNERGY_TAGS: readonly string[] = [
  "Random Synergy",
  "Patch Synergy",
  "Comp Combo",
  "Team Combo",
  "Wild Wombo",
  "Mystery Pair",
  "Surprise Combo",
  "Hidden Synergy",
  "Power Pair",
  "Dark Horse",
];

const DEFAULT_SYNERGY_COUNT = 120;

// Triangular-ish bonus distribution. Returns 1, 2, or 3 with probability
// roughly 0.45/0.40/0.15. Matches CHAMPION_SYNERGIES (mostly 2s, some 1s,
// rare 3s).
function randomSynergyBonus(): number {
  const r = Math.random();
  if (r < 0.45) return 1;
  if (r < 0.85) return 2;
  return 3;
}

// Minimum synergies that every champion must appear in. Drives the
// per-champion seed phase; extras are added on top up to the target count.
const MIN_SYNERGIES_PER_CHAMP = 5;

function pickSynergyTag(): string {
  return RANDOM_SYNERGY_TAGS[
    Math.floor(Math.random() * RANDOM_SYNERGY_TAGS.length)
  ];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function randomizeSynergies(
  champions: Champion[],
  count: number = DEFAULT_SYNERGY_COUNT,
): Synergy[] {
  // Use only champions that exist in CHAMPION_META so the synergy list
  // stays in sync with the rest of the data layer (alias mismatches → no
  // lookup hit).
  const aliases = champions
    .map((c) => c.alias)
    .filter((a) => CHAMPION_META[a]);
  if (aliases.length < 2) return [];

  const seen = new Set<string>();
  const out: Synergy[] = [];
  const synergyCount: Record<string, number> = {};
  for (const a of aliases) synergyCount[a] = 0;

  const addPair = (a: string, b: string): boolean => {
    if (a === b) return false;
    const key = pairKey(a, b);
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({
      champs: a < b ? [a, b] : [b, a],
      bonus: randomSynergyBonus(),
      tag: pickSynergyTag(),
    });
    synergyCount[a]++;
    synergyCount[b]++;
    return true;
  };

  // Phase 1 — seed minimums. For each champion in shuffled order, top up
  // their synergy count to MIN_SYNERGIES_PER_CHAMP. We pick partners
  // preferentially from those also below the minimum (keeps the
  // distribution tight), then fall back to a fully-shuffled walk through
  // every other alias to guarantee we exhaust the partner space — random
  // sampling can otherwise leave a champion stuck if it keeps hitting
  // already-paired partners.
  for (const alias of shuffle(aliases)) {
    while (synergyCount[alias] < MIN_SYNERGIES_PER_CHAMP) {
      // Prefer partners also below the minimum — addPair returns false
      // for duplicates so we naturally skip pairs we've already made.
      const underMin = shuffle(
        aliases.filter(
          (a) => a !== alias && synergyCount[a] < MIN_SYNERGIES_PER_CHAMP,
        ),
      );
      let progress = false;
      for (const partner of underMin) {
        if (addPair(alias, partner)) {
          progress = true;
          if (synergyCount[alias] >= MIN_SYNERGIES_PER_CHAMP) break;
        }
      }
      if (synergyCount[alias] >= MIN_SYNERGIES_PER_CHAMP) break;
      // Fallback — exhaust every other alias in shuffled order. This
      // can't loop forever: if every possible partner is already paired
      // with us, we break out and accept whatever count we have.
      const fallback = shuffle(aliases.filter((a) => a !== alias));
      for (const partner of fallback) {
        if (addPair(alias, partner)) {
          progress = true;
          if (synergyCount[alias] >= MIN_SYNERGIES_PER_CHAMP) break;
        }
      }
      if (!progress) break;
    }
  }

  // Phase 2 — random extras up to the target count. Hard cap on attempts
  // so we exit if the pair space is exhausted (small rosters, etc.).
  const target = Math.max(count, out.length);
  const maxAttempts = target * 5;
  let attempts = 0;
  while (out.length < target && attempts < maxAttempts) {
    attempts++;
    const i = Math.floor(Math.random() * aliases.length);
    let j = Math.floor(Math.random() * aliases.length);
    if (i === j) j = (j + 1) % aliases.length;
    addPair(aliases[i], aliases[j]);
  }
  return out;
}

const SYNERGY_STORAGE_KEY = "draftsim:synergyOverride:v1";

export function saveSynergyOverride(o: Synergy[] | null): void {
  if (typeof window === "undefined") return;
  try {
    if (o == null) localStorage.removeItem(SYNERGY_STORAGE_KEY);
    else localStorage.setItem(SYNERGY_STORAGE_KEY, JSON.stringify(o));
  } catch {
    // ignore
  }
}

export function loadSynergyOverride(): Synergy[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNERGY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as Synergy[];
  } catch {
    return null;
  }
}

// ─── Random counters ──────────────────────────────────────────────────────
//
// Random counter pairs constrained to "same role/lane" — both champions in
// the pair must share at least one Meraki-listed lane. Bonus is a positive
// integer 2-6 (matching the curated severity scale: medium → extreme).

const DEFAULT_COUNTER_COUNT = 90;

function randomCounterBonus(): number {
  // Bias toward 2-3 (medium counters), some 4-5 (hard), rare 6 (extreme).
  const r = Math.random();
  if (r < 0.55) return 2 + Math.floor(Math.random() * 2); // 2 or 3
  if (r < 0.9) return 4 + Math.floor(Math.random() * 2); // 4 or 5
  return 6;
}

// Minimum counter pairs each champion must appear in:
//   • 5 outgoing — they counter at least 5 other champions
//   • 5 incoming — at least 5 other champions counter them
// Both seeded in Phase 1 of the randomizer below; Phase 2 adds extras up
// to the target count.
const MIN_COUNTERS_OUTGOING = 5;
const MIN_COUNTERS_INCOMING = 5;

export function randomizeCounters(
  champions: Champion[],
  count: number = DEFAULT_COUNTER_COUNT,
): CounterPair[] {
  // Bucket champions by lane so we can pull pairs from within a single
  // lane. Keeps every counter relationship "same role/lane" by
  // construction.
  const laneToChamps: Record<Lane, string[]> = {
    top: [],
    jungle: [],
    middle: [],
    bottom: [],
    support: [],
  };
  // Track which lanes each alias plays for fast pair selection during
  // the per-champion seed phase. Built off the same lane filter as
  // laneToChamps so they stay in sync.
  const aliasLanes: Record<string, Lane[]> = {};
  for (const c of champions) {
    if (!CHAMPION_META[c.alias]) continue;
    aliasLanes[c.alias] = [];
    for (const lane of c.lanes) {
      laneToChamps[lane].push(c.alias);
      aliasLanes[c.alias].push(lane);
    }
  }
  const lanes = LANES.filter((l) => laneToChamps[l].length >= 2);
  if (lanes.length === 0) return [];
  const aliases = Object.keys(aliasLanes).filter(
    (a) => aliasLanes[a].length > 0,
  );

  const seen = new Set<string>();
  const out: CounterPair[] = [];
  const outgoing: Record<string, number> = {};
  const incoming: Record<string, number> = {};
  for (const a of aliases) {
    outgoing[a] = 0;
    incoming[a] = 0;
  }

  const addPair = (counter: string, victim: string): boolean => {
    if (counter === victim) return false;
    const key = `${counter}>${victim}`;
    if (seen.has(key)) return false;
    // Block the reverse too so we don't generate Akali>Yasuo +5 alongside
    // Yasuo>Akali +4 (which would collapse to a near-zero net matchup).
    if (seen.has(`${victim}>${counter}`)) return false;
    seen.add(key);
    seen.add(`${victim}>${counter}`);
    out.push([counter, victim, randomCounterBonus()]);
    outgoing[counter]++;
    incoming[victim]++;
    return true;
  };

  // Pick a partner from a lane the alias plays. Returns null if the
  // alias's lanes are all too small or every plausible partner is
  // already used in both directions (extreme edge case).
  const pickLanePartner = (alias: string): string | null => {
    const myLanes = aliasLanes[alias];
    if (!myLanes.length) return null;
    // Try each of the alias's lanes in random order so we don't always
    // funnel the same alias into the same lane's pool.
    const shuffled = shuffle(myLanes);
    for (const lane of shuffled) {
      const pool = laneToChamps[lane];
      if (pool.length < 2) continue;
      // 30 attempts per lane is enough to hit a fresh partner unless
      // the lane is essentially saturated. We bail on saturation rather
      // than burning attempts on dead lookups.
      for (let i = 0; i < 30; i++) {
        const cand = pool[Math.floor(Math.random() * pool.length)];
        if (cand !== alias) return cand;
      }
    }
    return null;
  };

  // Phase 1a — every champion counters ≥ MIN_COUNTERS_OUTGOING others.
  // Iterate in shuffled order so the seed pairs aren't biased toward
  // alphabetical winners.
  for (const alias of shuffle(aliases)) {
    let attempts = 0;
    while (
      outgoing[alias] < MIN_COUNTERS_OUTGOING &&
      attempts < MIN_COUNTERS_OUTGOING * 50
    ) {
      attempts++;
      const victim = pickLanePartner(alias);
      if (!victim) break;
      addPair(alias, victim);
    }
  }
  // Phase 1b — every champion is countered by ≥ MIN_COUNTERS_INCOMING
  // others. Adds counter→alias pairs where alias is the victim.
  for (const alias of shuffle(aliases)) {
    let attempts = 0;
    while (
      incoming[alias] < MIN_COUNTERS_INCOMING &&
      attempts < MIN_COUNTERS_INCOMING * 50
    ) {
      attempts++;
      const counter = pickLanePartner(alias);
      if (!counter) break;
      addPair(counter, alias);
    }
  }

  // Phase 2 — random extras up to the target count.
  const target = Math.max(count, out.length);
  const maxAttempts = target * 5;
  let attempts = 0;
  while (out.length < target && attempts < maxAttempts) {
    attempts++;
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const pool = laneToChamps[lane];
    const i = Math.floor(Math.random() * pool.length);
    let j = Math.floor(Math.random() * pool.length);
    if (i === j) j = (j + 1) % pool.length;
    addPair(pool[i], pool[j]);
  }
  return out;
}

const COUNTER_STORAGE_KEY = "draftsim:counterOverride:v1";

export function saveCounterOverride(o: CounterPair[] | null): void {
  if (typeof window === "undefined") return;
  try {
    if (o == null) localStorage.removeItem(COUNTER_STORAGE_KEY);
    else localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(o));
  } catch {
    // ignore
  }
}

export function loadCounterOverride(): CounterPair[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as CounterPair[];
  } catch {
    return null;
  }
}
