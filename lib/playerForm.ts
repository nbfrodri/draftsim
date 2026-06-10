import type { Lane } from "./types";
import { LANE_ORDER } from "./players";

// Per-player form model. Form is a single number in [-1, +1] (0 = neutral)
// tracking whether a player is hot or cold based on their recent per-game
// performance ratings (see computeGameRatings in lib/matchSimulator.ts).
//
// Players have no stable ids — a player's identity is (team, lane): the
// Player record lives in a team's Roster, positionally keyed by lane, and
// teams are identified by id (tournament) or name (series). Form state is
// therefore kept in a flat map keyed by `${teamKey}:${lane}` so a single
// PlayerFormMap can carry every player in a tournament.
//
// Pure + framework-free: the store owns persistence; everything here is
// plain data in, plain data out.

// Form value clamp range.
export const FORM_MIN = -1;
export const FORM_MAX = 1;

// EMA blend weight: how much a single game's normalized rating moves form.
export const FORM_ALPHA = 0.35;

// Regression-to-the-mean applied to the PREVIOUS form each game, before the
// EMA blend. <1 means form decays toward 0 even before averaging in the new
// game, so streaks must be sustained to hold a high form.
export const FORM_DECAY = 0.85;

// Rating that maps to neutral form pressure (an unremarkable game neither
// builds nor protects form), and the rating distance that saturates at ±1.
export const FORM_RATING_CENTER = 5.5;
export const FORM_RATING_SCALE = 3.5;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function clampForm(form: number): number {
  if (!Number.isFinite(form)) return 0;
  return clamp(form, FORM_MIN, FORM_MAX);
}

// Map a 1-10 game rating onto the form axis: 5.5 → 0, ≥9 → +1, ≤2 → -1.
export function normalizeRating(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return clamp((rating - FORM_RATING_CENTER) / FORM_RATING_SCALE, -1, 1);
}

// Advance a player's form by one game. EMA toward the normalized rating,
// with regression to the mean on the previous value:
//
//   next = clamp( prev·DECAY·(1-ALPHA) + normalize(rating)·ALPHA )
//
// Tuning (ALPHA 0.35, DECAY 0.85):
//   • 2 strong games (rating 8.5) from neutral → ~+0.47; 3 → ~+0.56.
//   • From +0.5, average games (rating 5.5) decay: 0.28 → 0.15 → 0.08 —
//     back to effectively neutral in ~3 games.
//   • Fixed point of endless 10s ≈ +0.78, so form never pins at the clamp.
export function updateForm(prev: number, gameRating: number): number {
  const p = clampForm(prev);
  const t = normalizeRating(gameRating);
  return clampForm(p * FORM_DECAY * (1 - FORM_ALPHA) + t * FORM_ALPHA);
}

// ── Sim / AI modifiers ──────────────────────────────────────────────────────

// Max form expressed in player-tier-value units (PLAYER_TIER_VALUE steps are
// 1.0 apart). 0.5 = a red-hot player performs half a tier above their sheet
// tier in lane. At the simulator's PLAYER_LANE_BIAS_K (8 g/min per tier-value
// unit) that is ±4 g/min — a third of a champion meta-tier step (12 g/min),
// so form colors outcomes without ever dominating champion/tier effects.
export const FORM_TIER_FRACTION = 0.5;

// Form → tier-value modifier, in the same units as PLAYER_TIER_VALUE
// deviations. Consumed by the simulator at the same seam as the player tier
// micro-bias (see playerLaneFormBias in lib/matchSimulator.ts).
export function formTierBias(form: number): number {
  return clampForm(form) * FORM_TIER_FRACTION;
}

// Small comfort-weighting bonus the draft AI can add when valuing a pick for
// a player (e.g. on top of rosterComfortWeight). Scaled to ±0.15 — one
// PLAYER_SKILL_WEIGHT step (D = 0.15) at max form — so a hot player's
// signature pick reads slightly scarier, never tier-defining. Not wired into
// the AI here; exported for later use.
export const FORM_COMFORT_SCALE = 0.15;

export function formComfortBonus(form: number): number {
  return clampForm(form) * FORM_COMFORT_SCALE;
}

// ── Keyed form maps ─────────────────────────────────────────────────────────

// Flat store of every tracked player's form. `teamKey` is whatever uniquely
// identifies the team in the caller's context (TournamentTeam.id, or the
// team name in a standalone series).
export type PlayerFormMap = Record<string, number>;

// Per-side lane → form view, the shape simulateMatch consumes via
// SimulateOptions.playerForms. Missing lanes are treated as neutral (0).
export type SideForms = Partial<Record<Lane, number>>;

export function playerFormKey(teamKey: string, lane: Lane): string {
  return `${teamKey}:${lane}`;
}

// Project a team's five lanes out of the flat map, for handing to
// SimulateOptions.playerForms. Lanes with no entry are omitted (neutral).
export function sideFormsFor(
  forms: PlayerFormMap | null | undefined,
  teamKey: string,
): SideForms {
  const out: SideForms = {};
  if (!forms) return out;
  for (const lane of LANE_ORDER) {
    const v = forms[playerFormKey(teamKey, lane)];
    if (typeof v === "number") out[lane] = clampForm(v);
  }
  return out;
}

// Fold one game's lane-ordered ratings (computeGameRatings output for one
// side: [top, jungle, middle, bottom, support]) into the map. Returns a NEW
// map — the input is not mutated, so store updates stay immutable.
export function applyRatingsToForms(
  forms: PlayerFormMap | null | undefined,
  teamKey: string,
  laneRatings: readonly number[],
): PlayerFormMap {
  const out: PlayerFormMap = { ...(forms ?? {}) };
  for (let i = 0; i < LANE_ORDER.length; i++) {
    const rating = laneRatings[i];
    if (typeof rating !== "number" || !Number.isFinite(rating)) continue;
    const key = playerFormKey(teamKey, LANE_ORDER[i]);
    out[key] = updateForm(out[key] ?? 0, rating);
  }
  return out;
}
