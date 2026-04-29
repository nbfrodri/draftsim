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
  type MetaOverride,
  type MetaTier,
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
  //       picks are dropped from the random pool.
  const byAlias = new Map(champions.map((c) => [c.alias, c]));
  const laneToChamps: Record<Lane, string[]> = {
    top: [],
    jungle: [],
    middle: [],
    bottom: [],
    support: [],
  };
  for (const [alias, meta] of Object.entries(CHAMPION_META)) {
    const champ = byAlias.get(alias);
    if (!champ) continue;
    for (const [laneKey, tier] of Object.entries(meta.metaTiers)) {
      const lane = laneKey as Lane;
      if (!champ.lanes.includes(lane)) continue; // Meraki must agree
      if (tier && ELIGIBLE_BASELINE.has(tier)) {
        laneToChamps[lane].push(alias);
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

  // 4. Champions whose baseline only had off-meta (C/D) tiers wouldn't have
  // been added to any pool — explicitly mark them with an empty override so
  // they disappear from all tier lists in the randomized meta.
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
