import { computeEventStats, isPlayoffMatch, packEventPlayer, unpackEventPlayer, type EventStats, type EventPlayerPoint } from "../eventStats";
import type { Lane } from "../types";
import type { TournamentState } from "../tournament";
import type { SeasonState, InternationalId, SplitId, LeagueId } from "./types";

export interface EventScope {
	id: string; label: string; stats: EventStats;
	checkpoints: { id: string; label: string; games: number; players: EventPlayerPoint[] }[];
}
export interface EventRecord {
	version: 1; id: string; label: string; phaseIndex?: number; split?: SplitId; event?: InternationalId; leagueId?: LeagueId;
	championLanes: Record<string, Lane[]>;
	scopes: EventScope[];
}

function scopeTournaments(tournaments: readonly TournamentState[], scope: string): TournamentState[] {
	return tournaments.filter(t => scope === "play-in" ? t.seasonSubStage === "play-in" : scope === "main" ? t.seasonSubStage !== "play-in" : true)
		.map(t => scope === "regular" || scope === "playoffs" ? { ...t, matches: t.matches.filter(m => isPlayoffMatch(t, m) === (scope === "playoffs")) } : t);
}

/** Persist only final aggregates and player checkpoint totals, not full recaps. */
export function buildEventRecord(tournaments: readonly TournamentState[], identity: Omit<EventRecord, "version" | "scopes" | "championLanes">): EventRecord {
	const scopeLabels: [string, string][] = [["all", "Whole event"]];
	if (tournaments.some(t => t.seasonSubStage === "play-in")) scopeLabels.push(["play-in", "Play-in"], ["main", "Main event"]);
	if (tournaments.some(t => t.format.includes("playoffs"))) scopeLabels.push(["regular", "Regular / groups"], ["playoffs", "Playoffs"]);
	const scopes = scopeLabels.map(([id, label]) => {
		const selected = scopeTournaments(tournaments, id);
		const finalStats = computeEventStats(selected);
		const identities = new Map(finalStats.players.map(p => [p.key, p]));
		const checkpoints: EventScope["checkpoints"] = [];
		const priorGames = new Set<string>();
		for (const t of tournaments) {
			for (const c of t.eventCheckpoints ?? []) {
				const keys = new Set([...priorGames, ...c.gameIds.map(g => `${t.id}:${g}`)]);
				const stats = computeEventStats(selected, keys);
				if (stats.games && stats.games !== checkpoints.at(-1)?.games) checkpoints.push({ id: `${t.id}:${c.key}`, label: `${t.seasonSubStage === "play-in" ? "Play-in · " : ""}${c.label}`, games: stats.games, players: stats.players.map(p => packEventPlayer(p, identities.get(p.key)!)) });
			}
			for (const m of t.matches) for (const g of m.series?.games ?? []) if (g.status === "complete" && g.winner) priorGames.add(`${t.id}:${g.id}`);
		}
		return { id, label, stats: finalStats, checkpoints };
	});
	return { version: 1, ...identity, championLanes: Object.assign({}, ...tournaments.map(t => t.championLanes ?? {})), scopes };
}

export function eventCheckpointPlayers(scope: EventScope, checkpoint: EventScope["checkpoints"][number]) {
	const identities = new Map(scope.stats.players.map(p => [p.key, p]));
	return checkpoint.players.flatMap(p => {
		const identity = identities.get(p.key);
		return identity ? [unpackEventPlayer(p, identity)] : [];
	});
}

export function seasonEventGroups(season: SeasonState) {
	return season.phases.flatMap<{ tournaments: TournamentState[]; identity: Omit<EventRecord, "version" | "scopes" | "championLanes"> }>((p, phaseIndex) => {
		if (p.kind === "transfer") return [];
		const tournaments = p.tournamentIds.flatMap(id => season.tournaments[id] ? [season.tournaments[id]] : []);
		if (p.kind === "international") return [{ tournaments, identity: { id: `${season.id}:${phaseIndex}`, label: p.label, phaseIndex, event: p.event } }];
		const leagues = [...new Set(tournaments.map(t => t.teams[0]?.leagueId))];
		return leagues.map(leagueId => ({ tournaments: tournaments.filter(t => t.teams[0]?.leagueId === leagueId), identity: { id: `${season.id}:${phaseIndex}:${leagueId ?? "unknown"}`, label: `${leagueId ?? "League"} · ${p.label}`, phaseIndex, split: p.split, leagueId } }));
	});
}

export function buildSeasonEventRecords(season: SeasonState): EventRecord[] {
	return seasonEventGroups(season).filter(g => g.tournaments.length).map(g => buildEventRecord(g.tournaments, g.identity));
}
