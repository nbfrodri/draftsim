import { LANE_ORDER } from "../players";
import { createRng } from "../rng";
import type { Lane, Player } from "../types";
import { computePlayerSeasonLines, type PlayerSeasonLine } from "./stats";
import {
	compareSSCandidates,
	evaluateSSCandidates,
	selectSSCandidate,
	ssPerformanceScore,
	SS_MIN_GAMES,
	SS_REPLACE_MARGIN,
	type SSCandidate,
} from "./ssPlayers";
import type { SeasonState, SeasonTeam } from "./types";

export interface SSRacePlayer {
	player: Player;
	team: SeasonTeam;
	stats: PlayerSeasonLine | null;
	games: number;
	requiredGames: number;
	score: number | null;
	eligible: boolean;
	reasons: string[];
	chance: number | null;
	projected: boolean;
	gap: number | null;
	carry: boolean;
}

export interface SSRaceLane {
	lane: Lane;
	holder: SSRacePlayer | null;
	contenders: SSRacePlayer[];
}

const RESAMPLES = 128;

/** Empirical bootstrap of current evidence, not a forecast of future matches. */
function estimateChances(candidates: SSCandidate[]): Map<string, number> {
	const eligible = candidates.filter(c => c.eligible);
	const wins = new Map(eligible.map(c => [c.p.id!, 0]));
	const rng = createRng(73817);
	for (let i = 0; i < RESAMPLES; i++) {
		const resampled = eligible.map(c => ({
			...c,
			score: ssPerformanceScore(c.values.map(() => c.values[Math.floor(rng() * c.values.length)])),
		}));
		const winner = selectSSCandidate(resampled);
		if (winner) wins.set(winner.p.id!, wins.get(winner.p.id!)! + 1);
	}
	return new Map([...wins].map(([id, count]) => [id, Math.round(count / RESAMPLES * 100)]));
}

function visibleSeasonLines(season: SeasonState): Map<string, PlayerSeasonLine> {
	const visibleTournaments = new Set(season.phases.slice(0, season.phaseIndex + 1).flatMap(p => p.tournamentIds));
	const tournaments = Object.fromEntries(Object.entries(season.tournaments)
		.filter(([id]) => visibleTournaments.has(id))
		.map(([id, t]) => [id, {
			...t,
			matches: t.matches.map(m => ({
				...m,
				series: m.series ? {
					...m.series,
					games: m.series.games.filter(g => g.status === "complete" && g.winner),
				} : null,
			})),
		}]));
	return new Map(computePlayerSeasonLines({ ...season, tournaments }).map(line => [line.playerId, line]));
}

/** No store writes, awards, historical backfill or global RNG consumption. */
export function computeSSRace(season: SeasonState): SSRaceLane[] {
	const candidates = evaluateSSCandidates(season, true);
	const lines = visibleSeasonLines(season);
	return LANE_ORDER.map(lane => {
		const rows = candidates.filter(c => c.p.lane === lane).sort(compareSSCandidates);
		const holder = rows.find(c => c.p.tier === "SS");
		const projected = selectSSCandidate(rows.filter(c => c.eligible)) ?? rows.find(c => c.carry);
		const chances = estimateChances(rows);
		const leader = holder?.eligible ? holder : rows.find(c => c.eligible);
		const toRow = (c: SSCandidate): SSRacePlayer => ({
			player: c.p, team: c.team, stats: lines.get(c.p.id!) ?? null, games: c.games, requiredGames: c.requiredGames,
			score: c.games ? c.score : null, eligible: c.eligible, reasons: c.reasons, carry: c.carry,
			chance: c.games < SS_MIN_GAMES ? null : c.eligible ? chances.get(c.p.id!) ?? 0 : 0,
			projected: projected?.p.id === c.p.id,
			gap: leader && c.games ? Math.max(0, leader.score + (leader.p.tier === "SS" && leader.p.id !== c.p.id ? SS_REPLACE_MARGIN : 0) - c.score) : null,
		});
		return { lane, holder: holder ? toRow(holder) : null,
			contenders: rows.filter(c => c !== holder).sort((a, b) => Number(b.eligible) - Number(a.eligible) || compareSSCandidates(a, b)).map(toRow) };
	});
}
