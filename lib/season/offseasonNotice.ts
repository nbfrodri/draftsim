import type { SeasonState } from "./types";

export const OFFSEASON_MARKET_NOTICE =
	"AI offseason moves are resolved when you advance to the next year. They will appear under that year's Offseason moves.";

/** Notice shown while the finished season waits in the offseason shop, before the AI market has run. */
export function offseasonMarketNotice(season: Pick<SeasonState, "status"> | null | undefined): string | null {
	return season?.status === "complete" ? OFFSEASON_MARKET_NOTICE : null;
}
