import { assertShareInputSize,base64UrlDecode,base64UrlEncode,deflateString as deflate,inflateString as inflate } from "./shareCodec";
// Curated champion meta-dataset for the match simulator.
//
// SOURCE: community-consensus knowledge (LoL Wiki, Mobalytics, op.gg patterns)
// for the 2024–2026 patches. There is no public API that classifies champions
// by power-curve, archetype, mobility, CC type, or tier — these are hand-tagged.
// Review when:
//   • a champion gets reworked (recent: Skarner, Aurelion Sol, Udyr, Shyvana)
//   • a new champion releases (verify alias matches CommunityDragon)
//   • the meta shifts a champion's typical power curve significantly
//   • a balance patch significantly changes a champion's tier
//
// Aliases match the `alias` field returned by CommunityDragon (Riot internal).
// Notable quirks: Wukong → "MonkeyKing", Nunu & Willump → "Nunu",
// Renata Glasc → "Renata", K'Sante → "KSante".
//
// Mobility classification rule of thumb:
//   high   — has a real dash/blink/jump on a short cooldown (Riven Q, Lee Sin Q,
//            Kassadin R, Akali E, Yasuo E on minions). Stays mobile in fights.
//   medium — one strong mobility tool on long CD or speed buff (Camille E,
//            Pantheon W, Fiora Q, Sivir R, Xayah E recall).
//   low    — stationary or only slow/zone control (Veigar, Jinx, Karthus,
//            most enchanters and traditional control mages).
//
// Meta tier rule of thumb (per role, ~patch 26.08 snapshot):
//   S+   — premier, near-mandatory pick or ban (3-5 per role)
//   S    — clear strong contender, regularly seen in pro/high elo
//   A    — solid, playable, depending on draft
//   B    — situational, flex, niche
//   C    — pocket pick, off-meta but viable
//   D    — weak / off-meta, not recommended
//
// metaTiers is a partial record — only roles a champion can be played in
// receive a tier. Missing roles imply "not played there meaningfully".
//
// The data tables themselves live in lib/data/championMeta.json and
// lib/data/championSynergies.json — this module keeps the types, the
// typed re-exports, and the accessor/override functions.

export type Phase = "early" | "mid" | "mid-late" | "late";
export type CC = "hard" | "soft" | "none";
export type Mobility = "low" | "medium" | "high";
export type MetaTier = "S+" | "S" | "A" | "B" | "C" | "D";

import championMetaJson from "./data/championMeta.json";
import championSynergiesJson from "./data/championSynergies.json";
import type { Lane } from "./types";

export type Archetype =
  | "engage"
  | "peel"
  | "poke"
  | "dive"
  | "pick"
  | "wombo"
  | "hyper-carry"
  | "splitpush"
  | "assassin"
  | "tank"
  | "enchanter"
  | "burst"
  | "skirmish"
  | "sustain";

export interface ChampionMeta {
  phase: Phase;
  archetypes: Archetype[];
  cc: CC;
  mobility: Mobility;
  metaTiers: Partial<Record<Lane, MetaTier>>;
}

export const TIER_VALUE: Record<MetaTier, number> = {
  "S+": 6,
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export const TIER_ORDER: readonly MetaTier[] = ["S+", "S", "A", "B", "C", "D"];

export const CHAMPION_META: Record<string, ChampionMeta> =
  championMetaJson as unknown as Record<string, ChampionMeta>;

export function getChampionMeta(alias: string): ChampionMeta | null {
  return CHAMPION_META[alias] ?? null;
}

// ─── Meta override (randomized meta) ─────────────────────────────────────
// A user-applied override that swaps tiers per (alias, lane). When set, all
// tier lookups consult this first; falling through to CHAMPION_META otherwise.
// Stored as module state so non-React consumers (matchSimulator) see the
// active override without prop drilling.

export type MetaOverride = Record<string, Partial<Record<Lane, MetaTier>>>;

let _activeOverride: MetaOverride | null = null;
// Global "meta enabled" flag. When false, getMetaTier returns null for
// everyone — effectively flattening the meta so the AI and simulator
// treat all champions as equivalent in their playable lanes. Useful for
// users who want to draft / sim without the meta tier list nudging
// outcomes.
let _metaEnabled = true;

export function setActiveMetaOverride(o: MetaOverride | null): void {
  _activeOverride = o;
}

export function getActiveMetaOverride(): MetaOverride | null {
  return _activeOverride;
}

export function setMetaEnabled(b: boolean): void {
  _metaEnabled = b;
}

export function getMetaEnabled(): boolean {
  return _metaEnabled;
}

// Returns the active tier for (alias, lane). When an override is active and
// has an entry for this champion, the override is AUTHORITATIVE — lanes not
// listed in the override are treated as "not played" (returns null), even if
// the baseline had them. This means randomizing the meta can drop a champion
// from off-role tier lists (Pantheon's baseline mid/jg "C" disappears unless
// the override re-includes them).
//
// If no override entry exists for the champion at all (e.g., default meta or
// the champion wasn't part of the randomization), the baseline applies.
export function getMetaTier(alias: string, lane: Lane): MetaTier | null {
  // Meta disabled — treat the world as if no tier data exists. AI's
  // bestLaneTierValue falls back to "C" baseline; simulator's
  // metaStrengthScore averages out; UI hides the tier badges.
  if (!_metaEnabled) return null;
  if (_activeOverride) {
    const overrideTiers = _activeOverride[alias];
    if (overrideTiers !== undefined) {
      return overrideTiers[lane] ?? null;
    }
  }
  const meta = CHAMPION_META[alias];
  if (!meta) return null;
  return meta.metaTiers[lane] ?? null;
}

// Returns the active tier map for a champion. Same authoritative semantics
// as getMetaTier — when override has the champion, it fully replaces the
// baseline tiers (no merging).
export function getMetaTiers(alias: string): Partial<Record<Lane, MetaTier>> {
  if (_activeOverride) {
    const override = _activeOverride[alias];
    if (override !== undefined) return { ...override };
  }
  return CHAMPION_META[alias]?.metaTiers ?? {};
}

const ALL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

// Map a numeric tier value back to its tier label. TIER_ORDER runs S+→D
// for values 6→1, so the index is (6 - value).
function tierForValue(value: number): MetaTier {
  const clamped = Math.max(TIER_VALUE.D, Math.min(TIER_VALUE["S+"], value));
  return TIER_ORDER[TIER_VALUE["S+"] - clamped];
}

// The tier a champion effectively has in a lane, INCLUDING an off-position
// fallback. When the champion has an explicit tier for the lane, that wins.
// Otherwise — a champion played off its meta roles — the tier is derived
// from the tiers it DOES have: the median of its known tiers, floored to a
// whole tier, then dropped one notch (floored at D). Rationale: an off-role
// pick is meaningfully worse than the champion's real footprint, but a
// strong champion flexed into a NEARBY role it can still play is better than
// a baseline pocket pick, and a weak champion stays weak.
//
// When `playableLanes` is supplied (the champion's Meraki roles) and the
// lane is NOT one of them, the champion is being forced into a role it can't
// really play — it floors at "D" (hard off-meta) no matter how strong it is
// in its real roles. That's the realistic outcome: a mid-only champion
// jammed into support is bad regardless of its mid tier. A champion that CAN
// play the lane but simply lacks a meta tier there gets the softer median-1
// fallback. Omit `playableLanes` to skip the gate (callers that only want
// the strength-based fallback, e.g. the champ-select badge, which already
// renders only champions that play the filtered lane).
//
// Returns null only when meta is disabled, or the champion has no tier in
// ANY lane (truly unknown) — callers keep their own last-resort default
// (historically "C") for that case.
export function getEffectiveTier(
  alias: string,
  lane: Lane,
  playableLanes?: readonly Lane[],
): MetaTier | null {
  const explicit = getMetaTier(alias, lane);
  if (explicit) return explicit;
  // getMetaTier returns null when the meta is disabled; mirror that so the
  // fallback never resurrects tier data the user turned off.
  if (!_metaEnabled) return null;
  const known: number[] = [];
  for (const l of ALL_LANES) {
    if (l === lane) continue;
    const t = getMetaTier(alias, l);
    if (t) known.push(TIER_VALUE[t]);
  }
  if (known.length === 0) return null;
  // Out-of-position realism: a champion shoved into a lane it can't play is
  // hard off-meta, full stop — strength in its real roles doesn't carry over.
  if (playableLanes && !playableLanes.includes(lane)) return "D";
  known.sort((a, b) => a - b);
  const mid =
    known.length % 2 === 1
      ? known[(known.length - 1) / 2]
      : (known[known.length / 2 - 1] + known[known.length / 2]) / 2;
  // Floor the median toward the lower tier, then drop one notch.
  return tierForValue(Math.floor(mid) - 1);
}

// ─── Meta override serialization ───────────────────────────────────────────
//
// Format used for exporting / importing custom meta tier lists. Wrapped in
// a versioned envelope so the format can evolve without breaking imports.
//
//   {
//     "version": 1,
//     "exportedAt": "2026-04-30T12:34:56Z",
//     "tiers": {
//       "Aatrox":   { "top": "S+" },
//       "Caitlyn":  { "bottom": "S+" },
//       ...
//     }
//   }

const META_EXPORT_VERSION = 1;
const VALID_LANES: ReadonlySet<Lane> = new Set([
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
]);
const VALID_TIERS: ReadonlySet<MetaTier> = new Set(TIER_ORDER);

export function serializeMetaOverride(override: MetaOverride): string {
  // Sort keys alphabetically so diffs and copy-pastes are stable.
  const sortedAliases = Object.keys(override).sort();
  const tiers: MetaOverride = {};
  for (const alias of sortedAliases) {
    const championTiers = override[alias];
    if (!championTiers) continue;
    // Drop empty entries (no lanes set) — they convey no information.
    const lanes = Object.keys(championTiers) as Lane[];
    if (lanes.length === 0) continue;
    // Sort lanes by canonical positional order so the JSON reads naturally.
    const sortedLanes: Partial<Record<Lane, MetaTier>> = {};
    for (const l of [
      "top",
      "jungle",
      "middle",
      "bottom",
      "support",
    ] as Lane[]) {
      const tier = championTiers[l];
      if (tier) sortedLanes[l] = tier;
    }
    tiers[alias] = sortedLanes;
  }
  const envelope = {
    version: META_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    tiers,
  };
  return JSON.stringify(envelope, null, 2);
}

export interface ParseMetaResult {
  override: MetaOverride | null;
  error: string | null;
  // Counts for user feedback after a successful parse.
  championCount: number;
  skippedEntries: number;
}

// ─── Encoded meta codes (opaque copy/paste format) ────────────────────────
//
// Deflate-compressed + base64url-encoded MetaOverride, prefixed so the
// format is self-describing. Looks like `META1:H4sIAAAA...`. Compared to
// raw JSON the encoded form is:
//   • Roughly half the size (a full meta is ~3 kB JSON → ~1.3 kB code).
//   • Opaque — no champion names or tiers visible to the user, so it
//     reads as a "share code" rather than editable data.
//   • URL-safe — base64url uses `-_` not `+/=` so it survives query strings.
//   • Reversible (no key/secret needed; this is encoding, not encryption).
//
// `encodeMetaOverride` is async because CompressionStream is async. The
// import path also accepts raw JSON for backward compatibility with codes
// users may have copied before this format existed.

const META_CODE_PREFIX = "META1:";

export async function encodeMetaOverride(
  override: MetaOverride,
): Promise<string> {
  // Reuse the existing JSON serializer so encoded output matches what
  // `parseMetaOverride` expects after decompression — single source of
  // truth for the on-the-wire format.
  const json = serializeMetaOverride(override);
  const compressed = await deflate(json);
  return META_CODE_PREFIX + base64UrlEncode(compressed);
}

export async function decodeMetaOverride(
  input: string,
  validAliases?: ReadonlySet<string>,
): Promise<ParseMetaResult> {
  try { assertShareInputSize(input); } catch (error) {
    return { override: null, error: (error as Error).message, championCount: 0, skippedEntries: 0 };
  }
  const trimmed = input.trim();
  if (trimmed.startsWith(META_CODE_PREFIX)) {
    let json: string;
    try {
      const b64 = trimmed.slice(META_CODE_PREFIX.length);
      const bytes = base64UrlDecode(b64);
      json = await inflate(bytes);
    } catch (e) {
      return {
        override: null,
        error: `Invalid meta code: ${e instanceof Error ? e.message : "decode failed"}`,
        championCount: 0,
        skippedEntries: 0,
      };
    }
    return parseMetaOverride(json, validAliases);
  }
  // Backward-compat: also accept raw JSON. Same forgiving parser.
  return parseMetaOverride(trimmed, validAliases);
}

// Parse a JSON string into a MetaOverride. Forgiving: silently skips
// unknown champion aliases (rosters change between patches), invalid lanes,
// and invalid tiers. Hard-fails only on structural problems (not JSON,
// missing tiers object, etc.).
//
// `validAliases` is optional. When provided, alias entries that aren't in
// the set are dropped (not an error — Riot champion list can change).
// When omitted, all syntactically-valid aliases are kept.
export function parseMetaOverride(
  json: string,
  validAliases?: ReadonlySet<string>,
): ParseMetaResult {
  try { assertShareInputSize(json); } catch (error) {
    return { override: null, error: (error as Error).message, championCount: 0, skippedEntries: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      override: null,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      championCount: 0,
      skippedEntries: 0,
    };
  }
  if (parsed == null || typeof parsed !== "object") {
    return {
      override: null,
      error: "Expected a JSON object at the root",
      championCount: 0,
      skippedEntries: 0,
    };
  }
  // Allow either an envelope (with tiers field) or a bare MetaOverride. The
  // bare form is convenient for users who want to type the JSON by hand.
  const envelope = parsed as { version?: unknown; tiers?: unknown };
  let rawTiers: unknown;
  if (envelope.tiers !== undefined) {
    if (
      typeof envelope.version === "number" &&
      envelope.version > META_EXPORT_VERSION
    ) {
      // Newer format — try to parse anyway but warn.
      console.warn(
        `[meta] Importing meta version ${envelope.version} (current is ${META_EXPORT_VERSION}); some fields may be ignored`,
      );
    }
    rawTiers = envelope.tiers;
  } else {
    // Bare MetaOverride form.
    rawTiers = parsed;
  }
  if (
    rawTiers == null ||
    typeof rawTiers !== "object" ||
    Array.isArray(rawTiers)
  ) {
    return {
      override: null,
      error:
        "Expected `tiers` to be an object mapping champion alias → lane tiers",
      championCount: 0,
      skippedEntries: 0,
    };
  }
  const out: MetaOverride = {};
  let championCount = 0;
  let skippedEntries = 0;
  for (const [alias, value] of Object.entries(
    rawTiers as Record<string, unknown>,
  )) {
    if (validAliases && !validAliases.has(alias)) {
      skippedEntries++;
      continue;
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      skippedEntries++;
      continue;
    }
    const championTiers: Partial<Record<Lane, MetaTier>> = {};
    let kept = 0;
    for (const [laneKey, tierVal] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (!VALID_LANES.has(laneKey as Lane)) continue;
      if (typeof tierVal !== "string" || !VALID_TIERS.has(tierVal as MetaTier))
        continue;
      championTiers[laneKey as Lane] = tierVal as MetaTier;
      kept++;
    }
    if (kept === 0) {
      skippedEntries++;
      continue;
    }
    out[alias] = championTiers;
    championCount++;
  }
  return {
    override: out,
    error: null,
    championCount,
    skippedEntries,
  };
}

// ─── Champion-pair synergies ───────────────────────────────────────────────
//
// Famous champion pairings whose kits combo or amplify each other beyond what
// archetype-level scoring captures. Keys are alphabetical aliases so order
// doesn't matter when looking up. Bonus 1-3:
//   3 — iconic, frame-perfect combos that define drafts (Malphite-Yasuo)
//   2 — strong paired play patterns regularly seen in pro
//   1 — minor situational synergy
// Tag is the cast-friendly label shown in the UI.

export interface Synergy {
  champs: [string, string];
  bonus: number;
  tag: string;
}

export const CHAMPION_SYNERGIES: Synergy[] =
  championSynergiesJson as unknown as Synergy[];

// ─── Synergy override ──────────────────────────────────────────────────────
// Mirrors the meta-tier override pattern. When an override is active, the
// override list REPLACES CHAMPION_SYNERGIES — getSynergy and any UI that
// reads getActiveSynergies() see only the overridden pairs. Bumped version
// counter lets dependent caches (counter lookup in helpers.ts, etc.)
// invalidate without prop drilling.
let _activeSynergyOverride: Synergy[] | null = null;
let _synergyOverrideVersion = 0;

export function setActiveSynergyOverride(o: Synergy[] | null): void {
  _activeSynergyOverride = o;
  _synergyOverrideVersion++;
}

export function getActiveSynergyOverride(): Synergy[] | null {
  return _activeSynergyOverride;
}

export function getActiveSynergies(): readonly Synergy[] {
  return _activeSynergyOverride ?? CHAMPION_SYNERGIES;
}

export function getSynergyOverrideVersion(): number {
  return _synergyOverrideVersion;
}

// Pre-built lookup map for the BASELINE table — built once at module load.
// When an override is active we build a fresh map from the override list
// on demand and memoize it against the override version so consumers
// don't pay the rebuild on every getSynergy call.
const BASELINE_SYNERGY_LOOKUP: Map<string, Synergy> = (() => {
  const map = new Map<string, Synergy>();
  for (const s of CHAMPION_SYNERGIES) {
    const [a, b] = s.champs;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, s);
  }
  return map;
})();

let _cachedSynergyLookup: Map<string, Synergy> = BASELINE_SYNERGY_LOOKUP;
let _cachedSynergyVersion = 0;

function activeSynergyLookup(): Map<string, Synergy> {
  if (!_activeSynergyOverride) return BASELINE_SYNERGY_LOOKUP;
  if (_cachedSynergyVersion === _synergyOverrideVersion)
    return _cachedSynergyLookup;
  const map = new Map<string, Synergy>();
  for (const s of _activeSynergyOverride) {
    const [a, b] = s.champs;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, s);
  }
  _cachedSynergyLookup = map;
  _cachedSynergyVersion = _synergyOverrideVersion;
  return map;
}

export function getSynergy(aliasA: string, aliasB: string): Synergy | null {
  const key = aliasA < aliasB ? `${aliasA}|${aliasB}` : `${aliasB}|${aliasA}`;
  return activeSynergyLookup().get(key) ?? null;
}

// ─── Counter override ──────────────────────────────────────────────────────
// Same pattern as the synergy override. The counter list lives in
// lib/draftAI/data.ts (HARD_COUNTERS) — when an override is active, the
// counter lookup in lib/draftAI/helpers.ts swaps to this list instead.
// Pairs are [counter, victim, bonus] so a single lane matchup can produce
// directional swings.
export type CounterPair = readonly [string, string, number];

let _activeCounterOverride: readonly CounterPair[] | null = null;
let _counterOverrideVersion = 0;

export function setActiveCounterOverride(
  o: readonly CounterPair[] | null,
): void {
  _activeCounterOverride = o;
  _counterOverrideVersion++;
}

export function getActiveCounterOverride(): readonly CounterPair[] | null {
  return _activeCounterOverride;
}

export function getCounterOverrideVersion(): number {
  return _counterOverrideVersion;
}

// ─── Pairings (synergies + counters) export/import ────────────────────────
//
// Mirrors the META1 share-code format for a combined synergies + counters
// preset: deflate-compressed base64url JSON prefixed with `PAIR1:`. Raw
// JSON is accepted on import too (hand-written or older exports).

const PAIR_CODE_PREFIX = "PAIR1:";
const PAIRINGS_EXPORT_VERSION = 1;

export const SYNERGY_BONUS_MIN = 1;
export const SYNERGY_BONUS_MAX = 3;
export const COUNTER_SEVERITY_MIN = 2;
export const COUNTER_SEVERITY_MAX = 6;

export interface ParsePairingsResult {
  synergies: Synergy[] | null;
  counters: CounterPair[] | null;
  /** Optional preset name carried in the envelope. */
  name: string | null;
  error: string | null;
  skippedEntries: number;
}

export function serializePairings(
  synergies: readonly Synergy[],
  counters: readonly CounterPair[],
  name?: string,
): string {
  const envelope = {
    version: PAIRINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    ...(name ? { name } : {}),
    synergies,
    counters,
  };
  return JSON.stringify(envelope, null, 2);
}

export async function encodePairings(
  synergies: readonly Synergy[],
  counters: readonly CounterPair[],
  name?: string,
): Promise<string> {
  const json = serializePairings(synergies, counters, name);
  const compressed = await deflate(json);
  return PAIR_CODE_PREFIX + base64UrlEncode(compressed);
}

export async function decodePairings(
  input: string,
  validAliases?: ReadonlySet<string>,
): Promise<ParsePairingsResult> {
  const trimmed = input.trim();
  if (trimmed.startsWith(PAIR_CODE_PREFIX)) {
    let json: string;
    try {
      const b64 = trimmed.slice(PAIR_CODE_PREFIX.length);
      const bytes = base64UrlDecode(b64);
      json = await inflate(bytes);
    } catch (e) {
      return {
        synergies: null,
        counters: null,
        name: null,
        error: `Invalid pairings code: ${e instanceof Error ? e.message : "decode failed"}`,
        skippedEntries: 0,
      };
    }
    return parsePairings(json, validAliases);
  }
  // Raw JSON form.
  return parsePairings(trimmed, validAliases);
}

// Forgiving parser, same philosophy as parseMetaOverride: skip invalid
// entries (unknown aliases, malformed rows, duplicate pairs), hard-fail
// only on structural problems. Bonuses/severities are clamped into their
// valid ranges rather than rejected.
export function parsePairings(
  json: string,
  validAliases?: ReadonlySet<string>,
): ParsePairingsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return {
      synergies: null,
      counters: null,
      name: null,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`,
      skippedEntries: 0,
    };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      synergies: null,
      counters: null,
      name: null,
      error: "Expected a JSON object at the root",
      skippedEntries: 0,
    };
  }
  const envelope = parsed as {
    name?: unknown;
    synergies?: unknown;
    counters?: unknown;
  };
  if (
    !Array.isArray(envelope.synergies) &&
    !Array.isArray(envelope.counters)
  ) {
    return {
      synergies: null,
      counters: null,
      name: null,
      error: "Expected `synergies` and/or `counters` arrays",
      skippedEntries: 0,
    };
  }
  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(n)));
  const aliasOk = (a: unknown): a is string =>
    typeof a === "string" &&
    a.length > 0 &&
    (!validAliases || validAliases.has(a));
  let skippedEntries = 0;

  const synergies: Synergy[] = [];
  const seenPairs = new Set<string>();
  if (Array.isArray(envelope.synergies)) {
    for (const raw of envelope.synergies) {
      const s = raw as {
        champs?: unknown;
        bonus?: unknown;
        tag?: unknown;
      } | null;
      const champs = s?.champs;
      if (
        s == null ||
        !Array.isArray(champs) ||
        champs.length !== 2 ||
        !aliasOk(champs[0]) ||
        !aliasOk(champs[1]) ||
        champs[0] === champs[1] ||
        typeof s.bonus !== "number" ||
        !Number.isFinite(s.bonus)
      ) {
        skippedEntries++;
        continue;
      }
      const [a, b] = champs;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenPairs.has(key)) {
        skippedEntries++;
        continue;
      }
      seenPairs.add(key);
      synergies.push({
        champs: a < b ? [a, b] : [b, a],
        bonus: clamp(s.bonus, SYNERGY_BONUS_MIN, SYNERGY_BONUS_MAX),
        tag: typeof s.tag === "string" ? s.tag : "",
      });
    }
  }

  const counters: CounterPair[] = [];
  const seenCounters = new Set<string>();
  if (Array.isArray(envelope.counters)) {
    for (const raw of envelope.counters) {
      if (
        !Array.isArray(raw) ||
        raw.length < 3 ||
        !aliasOk(raw[0]) ||
        !aliasOk(raw[1]) ||
        raw[0] === raw[1] ||
        typeof raw[2] !== "number" ||
        !Number.isFinite(raw[2])
      ) {
        skippedEntries++;
        continue;
      }
      // Counters are one-directional: A-beats-B and B-beats-A contradict
      // each other, so the matchup is deduped on the UNORDERED pair —
      // first occurrence wins, the reverse (or a repeat) is skipped.
      const key =
        raw[0] < raw[1] ? `${raw[0]}|${raw[1]}` : `${raw[1]}|${raw[0]}`;
      if (seenCounters.has(key)) {
        skippedEntries++;
        continue;
      }
      seenCounters.add(key);
      counters.push([
        raw[0],
        raw[1],
        clamp(raw[2], COUNTER_SEVERITY_MIN, COUNTER_SEVERITY_MAX),
      ]);
    }
  }

  return {
    synergies: Array.isArray(envelope.synergies) ? synergies : null,
    counters: Array.isArray(envelope.counters) ? counters : null,
    name: typeof envelope.name === "string" ? envelope.name : null,
    error: null,
    skippedEntries,
  };
}
