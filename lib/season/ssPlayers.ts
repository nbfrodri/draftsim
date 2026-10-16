import { LANE_ORDER, deriveStar } from "../players";
import { developmentTier, withoutSS, validSSEvidence } from "../playerSS";
import type { GameDraft, Lane, Player } from "../types";
import type { TournamentState, TournamentTeam } from "../tournament";
import { gameSideTeamId } from "./stats";
import type { LeagueId, SeasonState } from "./types";

export const SS_MIN_GAMES = 8;
export const SS_PARTICIPATION = 0.6;
export const SS_REPLACE_MARGIN = 0.15;
const PRIOR_GAMES = 12;
const NEUTRAL_RATING = 6;

interface Sample {
	values: number[];
	lastDomestic: number;
	leagues: Set<LeagueId>;
	titles: number;
}

/** Remove invalid live ownership without touching frozen tournament copies. */
export function reconcileSSPlayers(season: SeasonState): SeasonState {
	const holders = new Set<Lane>();
	let changed = false;
	const teams = season.teams.map(t => ({ ...t, players: t.players.map(p => {
		if (p.tier !== "SS" && !p.ss) return p;
		if (p.tier === "SS" && p.id && validSSEvidence(p.ss) && p.ss.lane === p.lane && !holders.has(p.lane)) {
			holders.add(p.lane);
			return p;
		}
		changed = true;
		return withoutSS(p);
	}) }));
	const inactivePool = season.franchise?.inactivePool?.map(entry => {
		const player = withoutSS(entry.player);
		if (player === entry.player) return entry;
		changed = true;
		return { ...entry, player };
	});
	return changed ? { ...season, teams, ...(season.franchise && inactivePool ? { franchise: { ...season.franchise, inactivePool } } : {}) } : season;
}

interface PhaseSampleContext {
	index: number;
	domestic: boolean;
	samples: Map<string, Sample>;
	teamGames: Map<string, number>;
	leagues: Set<LeagueId>;
	titlePlayers: Set<string>;
}

interface RecordedGame {
	game: GameDraft;
	blue: TournamentTeam;
	red: TournamentTeam;
	strengths: Map<string, number>;
}

function ensureSample(samples: Map<string, Sample>, id: string): Sample {
	let sample = samples.get(id);
	if (!sample) {
		sample = { values: [], lastDomestic: -1, leagues: new Set(), titles: 0 };
		samples.set(id, sample);
	}
	return sample;
}

function* recordedGames(tournament: TournamentState): Generator<RecordedGame> {
	const teams = new Map(tournament.teams.map(team => [team.id, team]));
	const strengths = new Map(tournament.teams.map(team => [team.id, deriveStar(team.players?.map(player => ({ tier: developmentTier(player) })))]));
	for (const match of tournament.matches) {
		if (match.isBye || !match.series || !match.blueTeamId || !match.redTeamId) continue;
		const blue = teams.get(match.blueTeamId);
		const red = teams.get(match.redTeamId);
		if (!blue || !red) continue;
		for (const game of match.series.games) {
			if (game.status === "complete" && game.winner) yield { game, blue, red, strengths };
		}
	}
}

function collectGameSamples(frame: RecordedGame, context: PhaseSampleContext, winnerId: string | undefined): void {
	const { game, blue, red, strengths } = frame;
	for (const side of ["blue", "red"] as const) {
		const teamId = gameSideTeamId(blue.id, red.id, blue.name, red.name, game.blueTeam, side);
		const team = teamId === blue.id ? blue : red;
		const opponent = teamId === blue.id ? red : blue;
		if (context.domestic && team.leagueId) {
			context.teamGames.set(team.id, (context.teamGames.get(team.id) ?? 0) + 1);
			context.leagues.add(team.leagueId);
		}
		for (const [li, lane] of LANE_ORDER.entries()) {
			const id = game.recap?.perPickIds?.[side]?.[li];
			const rating = game.recap?.ratings?.[side]?.[li];
			if (!id || typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > 10) continue;
			const entrant = team.players?.find(player => player.id === id && player.lane === lane);
			if (!entrant) continue;
			const sample = ensureSample(context.samples, `${id}:${lane}`);
			const strength = strengths.get(opponent.id) ?? 3;
			const ssCorrection = entrant.tier === "SS" ? 0.1 : 0;
			sample.values.push(Math.max(1, Math.min(10, rating + (strength - 3) * 0.1 - ssCorrection)));
			if (context.domestic && team.leagueId) {
				sample.lastDomestic = context.index;
				sample.leagues.add(team.leagueId);
			}
			if (teamId === winnerId) context.titlePlayers.add(`${id}:${lane}`);
		}
	}
}

function collectSSEvidence(season: SeasonState) {
	const samples = new Map<string, Sample>();
	const opportunities = new Map<LeagueId, Map<number, number>>();
	const domesticPhases = new Map<LeagueId, number[]>();
	for (const [pi, p] of season.phases.entries()) {
		if (pi > season.phaseIndex || p.status !== "complete" || p.kind === "transfer") continue;
		const context: PhaseSampleContext = { index: pi, domestic: p.kind === "split", samples,
			teamGames: new Map(), leagues: new Set(), titlePlayers: new Set() };
		for (const tid of p.tournamentIds) {
			const t = season.tournaments[tid];
			if (!t) continue;
			const winnerId = p.kind === "split" ? season.splitResults[p.split!]?.[t.teams[0]?.leagueId as LeagueId]?.[0] : season.intlResults[p.event!]?.[0];
			for (const frame of recordedGames(t)) collectGameSamples(frame, context, winnerId);
		}
		for (const key of context.titlePlayers) ensureSample(samples, key).titles++;
		for (const league of context.leagues) {
			const counts = [...context.teamGames].filter(([id]) => season.teams.find(t => t.id === id)?.leagueId === league).map(([, n]) => n).sort((a, b) => a - b);
			const typical = counts[Math.min(counts.length - 1, Math.floor(counts.length * 0.75))] ?? 0;
			const phases = opportunities.get(league) ?? new Map<number, number>();
			phases.set(pi, typical);
			opportunities.set(league, phases);
			domesticPhases.set(league, [...(domesticPhases.get(league) ?? []), pi]);
		}
	}
	return { samples, opportunities, domesticPhases };
}

/** Phase-boundary selection; recorded IDs and frozen entrant strength only. */
export function reviewSSPlayers(input: SeasonState): SeasonState {
	const season = reconcileSSPlayers(input);
	const phase = season.phases[season.phaseIndex];
	if (!phase || phase.kind === "transfer" || phase.status !== "complete") return season;
	const { samples, opportunities, domesticPhases } = collectSSEvidence(season);
	const selected = new Map<string, { score: number; games: number; carry?: boolean }>();
	const idCounts = new Map<string, number>();
	for (const team of season.teams) for (const p of team.players) if (p.id) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
	for (const lane of LANE_ORDER) {
		const candidates: Array<{ p: Player; score: number; games: number; titles: number }> = [];
		let carry: Player | undefined;
		for (const team of season.teams) for (const player of team.players) {
			if (player.lane !== lane || !player.id || idCounts.get(player.id) !== 1 || !["S", "S+"].includes(developmentTier(player))) continue;
			const sample = samples.get(`${player.id}:${lane}`);
			const domestic = domesticPhases.get(team.leagueId) ?? [];
			const regionalOpportunities = [...(opportunities.get(team.leagueId)?.values() ?? [])].reduce((sum, n) => sum + n, 0);
			if (player.tier === "SS" && player.ss?.seasonId !== season.id && regionalOpportunities < SS_MIN_GAMES) carry = player;
			if (!sample || sample.values.length < SS_MIN_GAMES) continue;
			const leagues = new Set([...sample.leagues, team.leagueId]);
			const elapsed = new Map<number, number>();
			for (const league of leagues) for (const [pi, n] of opportunities.get(league) ?? []) elapsed.set(pi, Math.max(elapsed.get(pi) ?? 0, n));
			const required = [...elapsed.values()].reduce((a, b) => a + b, 0) * SS_PARTICIPATION;
			if (sample.values.length < required) continue;
			if (domestic.length && sample.lastDomestic < domestic[domestic.length - 1]) continue;
			const n = sample.values.length;
			const mean = sample.values.reduce((a, b) => a + b, 0) / n;
			const variance = sample.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
			const score = (mean * n + NEUTRAL_RATING * PRIOR_GAMES) / (n + PRIOR_GAMES) - Math.sqrt(variance) * 0.1;
			candidates.push({ p: player, score, games: n, titles: sample.titles });
		}
		candidates.sort((a, b) => b.score - a.score || b.titles - a.titles || b.games - a.games || a.p.id!.localeCompare(b.p.id!));
		const incumbent = candidates.find(c => c.p.tier === "SS");
		const best = candidates[0];
		const winner = incumbent && best && best.score < incumbent.score + SS_REPLACE_MARGIN ? incumbent : best;
		if (winner) selected.set(winner.p.id!, winner);
		else if (carry?.id) selected.set(carry.id, { score: carry.ss!.score, games: carry.ss!.games, carry: true });
	}
	const teams = season.teams.map(t => ({ ...t, players: t.players.map(p => {
		const evidence = p.id ? selected.get(p.id) : undefined;
		if (!evidence) return withoutSS(p);
		if (evidence.carry) return p;
		return { ...p, tier: "SS" as const, ss: { baseTier: developmentTier(p) as "S" | "S+", lane: p.lane, seasonId: season.id, phaseIndex: season.phaseIndex, phaseLabel: phase.label, score: evidence.score, games: evidence.games } };
	}) }));
	return { ...season, teams, ssReviews: [
		...(season.ssReviews ?? []).filter(review => review.phaseIndex !== season.phaseIndex),
		{ phaseIndex: season.phaseIndex, label: phase.label, holders: teams.flatMap(t => t.players.filter(p => p.tier === "SS" && p.id && p.ss).map(p => ({ playerId: p.id!, lane: p.lane, evidence: { ...p.ss! } }))) },
	] };
}
