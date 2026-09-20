import { belongsToMarketWindow } from "./marketOrigin";
import type { SeasonState } from "./types";

/** Old carry retains its origin; only rows created after the shop opens belong here. */
export function currentOffseasonRosterNews(season: Pick<SeasonState, "rosterNews" | "offseasonRosterNewsBaseline"> & Partial<Pick<SeasonState, "id" | "franchise">>) {
  return (season.rosterNews ?? []).filter((news, index) => {
    if (news.origin) return !!season.id && belongsToMarketWindow(news.origin, { id: season.id, franchise: season.franchise }, "Offseason");
    return season.offseasonRosterNewsBaseline != null && index >= season.offseasonRosterNewsBaseline && news.timeMark === "Offseason";
  });
}


/** Legacy completed saves cannot distinguish prior-year carry from current news.
 * Keep every original row, but only newly appended moves are confirmed current.
 */
export function initializeOffseasonRosterNewsBoundary(season: SeasonState): SeasonState {
  return season.status === "complete" && season.offseasonRosterNewsBaseline == null
    ? { ...season, offseasonRosterNewsBaseline: season.rosterNews?.length ?? 0 }
    : season;
}
