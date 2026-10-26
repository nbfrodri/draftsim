import { rankEventPlayers } from "./eventStats";
import { eventCheckpointPlayers, type EventScope } from "./season/eventHistory";
import type { Lane } from "./types";

/** Movement follows performance order, independently of the table's display sort. */
export function eventRankMovements(
	scope: EventScope,
	lane: Lane,
	point: string,
	ranked: readonly { key: string; qualified: boolean }[],
): Map<string, string> {
	const pointIndex = scope.checkpoints.findIndex(c => c.id === point);
	let previousIndex = pointIndex >= 0 ? pointIndex - 1 : scope.checkpoints.length - 1;
	// At a round boundary the latest checkpoint already contains current totals.
	// Skip that duplicate snapshot, but retain the latest checkpoint mid-round.
	if (pointIndex < 0) {
		while (previousIndex >= 0 && scope.checkpoints[previousIndex].games >= scope.stats.games) previousIndex--;
	}
	const previous = scope.checkpoints[previousIndex];
	if (!previous) return new Map();
	const previousRanks = new Map(rankEventPlayers(eventCheckpointPlayers(scope, previous), lane)
		.map((p, i) => [p.key, { rank: i + 1, qualified: p.qualified }]));
	return new Map(ranked.map((p, i) => {
		const rank = i + 1, prev = previousRanks.get(p.key);
		const change = !prev ? "New" : p.qualified && !prev.qualified ? "Qualified" : prev.rank === rank ? "—" : `${prev.rank > rank ? "↑" : "↓"}${Math.abs(prev.rank - rank)}`;
		return [p.key, change];
	}));
}
