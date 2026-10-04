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

const WINDOW_ORDER: Record<string, number> = {
  Winter: 1, "First Stand window": 2, Spring: 3, "MSI window": 4,
  Summer: 5, "Worlds window": 6, Offseason: 7,
};

/** Carried offseason precedes the new year's splits; the closing offseason follows them. */
export function groupRosterNewsByTime(
  items: NonNullable<SeasonState["rosterNews"]>,
  season: Pick<SeasonState, "status">,
) {
  type News = (typeof items)[number];
  const groups = new Map<string, { timeMark: string; year?: number; items: News[] }>();
  for (const news of items) {
    const timeMark = news.timeMark?.trim() || "Unknown";
    const year = timeMark === "Offseason" ? news.origin?.year : undefined;
    const key = year == null ? timeMark : `${timeMark}:${year}`;
    const group = groups.get(key);
    if (group) group.items.push(news);
    else groups.set(key, { timeMark, year, items: [news] });
  }
  const rank = (mark: string) => mark === "Offseason" && season.status !== "complete"
    ? 0 : WINDOW_ORDER[mark] ?? 50;
  return [...groups.entries()].sort(([a, x], [b, y]) =>
    rank(x.timeMark) - rank(y.timeMark)
    || (x.year != null && y.year != null ? x.year - y.year : 0)
    || a.localeCompare(b));
}


/** Legacy completed saves cannot distinguish prior-year carry from current news.
 * Keep every original row, but only newly appended moves are confirmed current.
 */
export function initializeOffseasonRosterNewsBoundary(season: SeasonState): SeasonState {
  return season.status === "complete" && season.offseasonRosterNewsBaseline == null
    ? { ...season, offseasonRosterNewsBaseline: season.rosterNews?.length ?? 0 }
    : season;
}
