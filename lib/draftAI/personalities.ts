// Draft personalities — per-team drafting profiles (propuestas-profundidad
// item 2). A personality is a vector of weight multipliers over the labeled
// scoring components of scorePick/scoreBan, plus sampling overrides
// (temperature / top-N) applied at the selection layer in index.ts, plus a
// couple of flavor knobs (pocket-pick affinity, off-meta comfort bonus).
//
// HARD INVARIANT: the 'balanced' preset (and omitting the personality
// entirely) must be bit-identical to the AI's historical behavior. To
// guarantee that, weights are applied CONDITIONALLY — a component is only
// multiplied when its weight exists and differs from 1, so the default path
// never performs a floating-point multiplication that could perturb results.
// The same rule applies to sampling overrides (undefined → knobs object is
// returned untouched) and to the pocket-pick probability multiplier.

// ─── Component kinds ────────────────────────────────────────────────────────

// Scoring-component buckets a personality can re-weight. Each `add()` call
// site in scoring.ts that belongs to one of these buckets passes the kind;
// untagged components always run at weight 1.
//
//   metaTier         — tier-driven value: lane fit, power first pick, meta
//                      priority when behind, tournament WR shift; ban-side
//                      meta tier + flex denial.
//   synergy          — explicit CHAMPION_SYNERGIES pair bonuses (pick) and
//                      enemy-synergy denial (ban).
//   archetypeSynergy — implicit archetype-pair synergy + comp-shape
//                      reinforcement.
//   damageBalance    — AP/AD gap fill / stack penalty / resist-wall terms.
//   playerComfort    — own roster pool nudges (comfort / off-pool).
//   laneMatchup      — lane counters, red-side counter advantage, team-level
//                      counter-comp terms, deny-counter picks.
//   identity         — comp identity completion + identity amplifiers.
//   crossGameCounter — cross-game adaptation (counters last game's identity,
//                      anti-pattern prep, enabler bans, opp pocket-pick bans).
//   lookahead        — 1-ply / 2-ply lookahead penalties (selection layer).
//   targetBan        — "ban style" knob: target-bans on enemy comfort picks,
//                      anticipated picks, and deny-the-main picks.
//   threatBan        — "ban style" knob: comfort-bans protecting our own comp
//                      (Threat: X components).
export type ScoreComponentKind =
  | "metaTier"
  | "synergy"
  | "archetypeSynergy"
  | "damageBalance"
  | "playerComfort"
  | "laneMatchup"
  | "identity"
  | "crossGameCounter"
  | "lookahead"
  | "targetBan"
  | "threatBan";

// Missing key = weight 1 (component unchanged).
export type ComponentWeights = Partial<Record<ScoreComponentKind, number>>;

// Sampling overrides applied on top of the difficulty knobs at the selection
// layer. Multipliers compose with the difficulty's own temperature (so a
// low-temperature personality stays *relatively* sharper on Easy too);
// deltas shift the top-N pool size (clamped to ≥1).
export interface SamplingOverrides {
  pickTemperatureMul?: number;
  banTemperatureMul?: number;
  pickTopNDelta?: number;
  banTopNDelta?: number;
}

export interface DraftPersonality {
  id: string;
  // Display name (UI language — English, matching the rest of the app).
  name: string;
  // One-line description for setup screens / tooltips.
  description: string;
  weights: ComponentWeights;
  sampling?: SamplingOverrides;
  // Multiplier on POCKET_PICK_PROB (chance to widen the sampling pool to the
  // pocket-pick top-N). 0 = never pockets; 6 = pockets ~30% of picks.
  // Omitted / 1 = default 5%.
  pocketPickProbMul?: number;
  // Flat score bonus added when the lane player's pool contains the
  // candidate AND the candidate is below A-tier in the intended lane — the
  // "pocket pick affinity" that makes comfort/cheese drafters reach for
  // off-meta signature champs. Omitted / 0 = off (default behavior).
  offMetaComfortBonus?: number;
}

// Weight for a component kind: 1 when no personality, no entry, or entry is
// exactly 1. Callers should skip multiplication when this returns 1 to keep
// the default path bit-identical.
export function componentWeight(
  personality: DraftPersonality | undefined,
  kind: ScoreComponentKind,
): number {
  const w = personality?.weights[kind];
  return w == null ? 1 : w;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const DEFAULT_PERSONALITY_ID = "balanced";

export const PERSONALITIES: Readonly<Record<string, DraftPersonality>> = {
  balanced: {
    id: "balanced",
    name: "Balanced",
    description:
      "The default drafter — weighs meta, synergy, matchups and comfort evenly.",
    // Empty = every component at weight 1 → exact current behavior.
    weights: {},
  },
  "meta-slave": {
    id: "meta-slave",
    name: "Meta Slave",
    description:
      "Follows the tier list religiously — S-tier or nothing, no pocket picks.",
    weights: {
      metaTier: 1.6,
      playerComfort: 0.6,
      laneMatchup: 0.9,
      crossGameCounter: 0.85,
    },
    // Sharp, near-deterministic sampling: always the top of the tier list.
    sampling: {
      pickTemperatureMul: 0.45,
      banTemperatureMul: 0.45,
      pickTopNDelta: -1,
      banTopNDelta: -1,
    },
    pocketPickProbMul: 0,
  },
  "comfort-first": {
    id: "comfort-first",
    name: "Comfort First",
    description:
      "Drafts around its players' champion pools, even when they're off-meta.",
    weights: {
      playerComfort: 3.5,
      metaTier: 0.75,
      // Values enemy pools too — understands what a signature pick is worth.
      targetBan: 1.4,
    },
    sampling: { pickTemperatureMul: 0.9 },
    pocketPickProbMul: 2,
    offMetaComfortBonus: 2.5,
  },
  "counter-picker": {
    id: "counter-picker",
    name: "Counter Picker",
    description:
      "Reactive drafter — lives for lane counters, target bans and prediction.",
    weights: {
      laneMatchup: 1.8,
      crossGameCounter: 1.7,
      targetBan: 1.5,
      threatBan: 1.3,
      lookahead: 1.5,
      metaTier: 0.85,
    },
    sampling: { pickTemperatureMul: 0.8 },
  },
  cheese: {
    id: "cheese",
    name: "Cheese Merchant",
    description:
      "Chaotic pocket picks and surprise bans — expect the unexpected.",
    weights: {
      metaTier: 0.6,
      playerComfort: 1.5,
      laneMatchup: 0.8,
      // Its bans are unpredictable rather than surgical.
      targetBan: 0.7,
      threatBan: 0.7,
    },
    sampling: {
      pickTemperatureMul: 2.2,
      pickTopNDelta: 3,
      banTemperatureMul: 2.0,
      banTopNDelta: 2,
    },
    pocketPickProbMul: 6,
    offMetaComfortBonus: 3,
  },
  "synergy-architect": {
    id: "synergy-architect",
    name: "Synergy Architect",
    description:
      "Builds the perfect comp — synergies and identity over raw tier power.",
    weights: {
      synergy: 1.9,
      archetypeSynergy: 1.9,
      identity: 1.8,
      metaTier: 0.85,
      laneMatchup: 0.85,
    },
    sampling: { pickTemperatureMul: 0.9 },
  },
};

// Stable display order for setup UIs.
export const PERSONALITY_LIST: readonly DraftPersonality[] = [
  PERSONALITIES.balanced,
  PERSONALITIES["meta-slave"],
  PERSONALITIES["comfort-first"],
  PERSONALITIES["counter-picker"],
  PERSONALITIES.cheese,
  PERSONALITIES["synergy-architect"],
];

// Resolve an id (e.g. persisted on a TournamentTeam or series config) to its
// preset. Unknown / missing ids fall back to 'balanced' so legacy state and
// typos degrade to the default behavior instead of crashing.
export function getPersonality(id?: string | null): DraftPersonality {
  if (id == null) return PERSONALITIES[DEFAULT_PERSONALITY_ID];
  return PERSONALITIES[id] ?? PERSONALITIES[DEFAULT_PERSONALITY_ID];
}
