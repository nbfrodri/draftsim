import type { LeagueId } from "@/lib/season/types";
import LeagueIcon from "./LeagueIcon";

// Region logo with an accessible name that survives a failed logo load
// (LeagueIcon renders nothing on error).
export default function RegionMark({ league, size = 14, className = "" }: { league: LeagueId | undefined; size?: number; className?: string }) {
	if (!league) return null;
	return <span title={league} className={`inline-flex shrink-0 items-center ${className}`}><LeagueIcon league={league} size={size} /><span className="sr-only">{league}</span></span>;
}
