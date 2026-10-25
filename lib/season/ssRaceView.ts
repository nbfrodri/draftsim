import { SS_MIN_GAMES } from "./ssPlayers";
import type { SSRacePlayer } from "./ssRace";

/** Shown once above the contender list instead of repeating it on every early-season row. */
export const SS_ESTIMATE_NOTE = `Chance estimates start at ${SS_MIN_GAMES} rated games. Until then each row shows its game progress.`;

const GAMES_REASON = /^Needs \d+ rated games/;

export interface GamesProgress {
	games: number;
	required: number;
	/** 0-100, never above 100. */
	percent: number;
}

/** Progress towards the rated-game threshold while no chance can be estimated yet. */
export function gamesProgress(row: Pick<SSRacePlayer, "chance" | "games" | "requiredGames" | "eligible">): GamesProgress | null {
	if (row.chance !== null || row.eligible || row.games >= row.requiredGames || row.requiredGames <= 0) return null;
	return { games: row.games, required: row.requiredGames, percent: Math.min(100, Math.round(row.games / row.requiredGames * 100)) };
}

/** Unmet requirements other than the rated-game count, which the progress indicator already covers. */
export function remainingReasons(row: Pick<SSRacePlayer, "reasons">, hasProgress: boolean): string[] {
	return hasProgress ? row.reasons.filter(r => !GAMES_REASON.test(r)) : row.reasons;
}

export interface SeatLeaderHint {
	name: string;
	score: number | null;
	gamesNeeded: number;
}

/** Best current candidate for a vacant seat. Score stays null when nothing was recorded. */
export function seatLeaderHint(contenders: readonly SSRacePlayer[]): SeatLeaderHint | null {
	const lead = contenders[0];
	if (!lead?.player.name) return null;
	return { name: lead.player.name, score: lead.score, gamesNeeded: Math.max(0, lead.requiredGames - lead.games) };
}
