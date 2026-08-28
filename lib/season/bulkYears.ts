import { currentPhase, nextPendingTournament } from "./engine";
import type { SeasonState } from "./types";

/** Hard cap on bulk franchise advance requests. */
export const BULK_YEARS_MAX = 50;

/** Ask for confirmation when simulating this many years or more. */
export const BULK_YEARS_CONFIRM_THRESHOLD = 5;

export type BulkYearStep =
  | "sim_match"
  | "resolve_transfer"
  | "finalize_offseason"
  | "year_complete"
  | "unsupported";

/** Next action when auto-advancing a franchise reality by N years. */
export function nextBulkYearStep(season: SeasonState | null | undefined): BulkYearStep {
  if (!season?.franchise) return "unsupported";
  if (season.status === "complete") return "finalize_offseason";
  const phase = currentPhase(season);
  if (phase?.kind === "transfer" && phase.status === "in-progress") {
    return "resolve_transfer";
  }
  if (nextPendingTournament(season)) return "sim_match";
  return "unsupported";
}

/** Clamp and validate a user-entered year count. */
export function clampBulkYearCount(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(BULK_YEARS_MAX, Math.max(1, Math.floor(raw)));
}

/** True while bulk sim should keep running the same franchise reality. */
export function bulkSimRealityMatches(
  season: SeasonState | null | undefined,
  realityId: string,
): season is SeasonState & { franchise: NonNullable<SeasonState["franchise"]> } {
  return !!season?.franchise && season.franchise.id === realityId;
}
