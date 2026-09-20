import type { SeasonState } from "./types";

/** Old carry retains its origin; only rows created after the shop opens belong here. */
export function currentOffseasonRosterNews(season: Pick<SeasonState, "rosterNews" | "offseasonRosterNewsBaseline">) {
  if (season.offseasonRosterNewsBaseline == null) return [];
  return (season.rosterNews ?? []).slice(season.offseasonRosterNewsBaseline)
    .filter(news => news.timeMark === "Offseason");
}


/** Legacy completed saves cannot distinguish prior-year carry from current news.
 * Keep every original row, but only newly appended moves are confirmed current.
 */
export function initializeOffseasonRosterNewsBoundary(season: SeasonState): SeasonState {
  return season.status === "complete" && season.offseasonRosterNewsBaseline == null
    ? { ...season, offseasonRosterNewsBaseline: season.rosterNews?.length ?? 0 }
    : season;
}
