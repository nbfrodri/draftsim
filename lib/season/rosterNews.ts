import { belongsToMarketWindow } from "./marketOrigin";
import type { SeasonState } from "./types";

/** Old carry retains its origin; only rows created after the shop opens belong here. */
export function currentOffseasonRosterNews(season: Pick<SeasonState, "rosterNews" | "offseasonRosterNewsBaseline"> & Partial<Pick<SeasonState, "id" | "franchise">>) {
  return (season.rosterNews ?? []).filter((news, index) => {
    if (news.origin) return !!season.id && belongsToMarketWindow(news.origin, { id: season.id, franchise: season.franchise }, "Offseason");
    return season.offseasonRosterNewsBaseline != null && index >= season.offseasonRosterNewsBaseline && news.timeMark === "Offseason";
  });
}

/** Show the prior offseason during the new year, just like carried transfers.
 * Once the next offseason opens, only its own offseason rows belong in the digest.
 * Prefer recorded windows over legacy display marks without changing saved rows.
 */
export function rosterNewsForDigest(season: SeasonState) {
  const currentOffseason = new Set(currentOffseasonRosterNews(season));
  return (season.rosterNews ?? []).flatMap(news => {
    const timeMark = news.origin
      ? news.origin.windowId.slice(news.origin.seasonId.length + 1)
      : news.timeMark;
    if (season.status === "complete" && timeMark === "Offseason" && !currentOffseason.has(news)) return [];
    return [timeMark === news.timeMark ? news : { ...news, timeMark }];
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
