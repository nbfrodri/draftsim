import { createEventStatsAccumulator, EVENT_METRICS, isPlayoffMatch, packEventPlayer, unpackEventPlayer, type EventStats, type EventPlayer, type EventPlayerPoint } from "../eventStats";
import type { Lane, GameDraft } from "../types";
import type { TournamentMatch, TournamentState } from "../tournament";
import type { SeasonState, InternationalId, SplitId, LeagueId } from "./types";

interface Checkpoint<P> { id: string; label: string; games: number; players: P[] }
/** Absolute totals for a player that changed since the previous checkpoint; `player` indexes the final identities. */
export type EventPlayerDelta = [player: number, values: number[], teams?: number[], name?: string];
interface ScopeBase { id: string; label: string; stats: EventStats }
/** Version 1: every checkpoint is a complete snapshot. */
export interface EventScopeV1 extends ScopeBase { checkpointEncoding?: undefined; checkpoints: Checkpoint<EventPlayerPoint>[] }
/** Version 2: a checkpoint lists only changed players; unchanged rows carry over from earlier checkpoints. */
export interface EventScopeV2 extends ScopeBase { checkpointEncoding: "delta-v2"; checkpoints: Checkpoint<EventPlayerDelta>[] }
export type EventScope = EventScopeV1 | EventScopeV2;
interface EventRecordBase {
	id: string; label: string; phaseIndex?: number; split?: SplitId; event?: InternationalId; leagueId?: LeagueId;
	championLanes: Record<string, Lane[]>;
}
export type EventRecord = EventRecordBase & ({ version: 1; scopes: EventScopeV1[] } | { version: 2; scopes: EventScopeV2[] });
export type EventRecordIdentity = Omit<EventRecordBase, "championLanes">;

function scopeTournaments(tournaments: readonly TournamentState[], scope: string): TournamentState[] {
	// Play-in games belong only to "all" and "play-in"; main-event stage scopes never include them.
	const mainOnly = scope === "main" || scope === "regular" || scope === "playoffs";
	return tournaments.filter(t => scope === "play-in" ? t.seasonSubStage === "play-in" : mainOnly ? t.seasonSubStage !== "play-in" : true)
		.map(t => scope === "regular" || scope === "playoffs" ? { ...t, matches: t.matches.filter(m => isPlayoffMatch(t, m) === (scope === "playoffs")) } : t);
}

interface SourceGame { ordinal: number; t: TournamentState; m: TournamentMatch; g: GameDraft }

/**
 * Accumulates checkpoint game sets (which only grow) in the source order used by
 * computeEventStats, so totals, floating-point sums, names and team order match
 * an independent recomputation. A late game earlier in source order triggers a replay.
 */
function sourceOrderedStats(selected: readonly TournamentState[]) {
	const source = new Map<string, SourceGame[]>();
	let ordinal = 0;
	for (const t of selected) for (const m of t.matches) for (const g of m.series?.games ?? []) {
		const key = `${t.id}:${g.id}`;
		source.set(key, [...source.get(key) ?? [], { ordinal: ordinal++, t, m, g }]);
	}
	const included: SourceGame[] = [];
	const includedKeys = new Set<string>();
	let accumulator = createEventStatsAccumulator();
	return {
		include(keys: Iterable<string>) {
			const added: SourceGame[] = [];
			for (const key of keys) {
				const games = source.get(key);
				if (games && !includedKeys.has(key)) { includedKeys.add(key); added.push(...games); }
			}
			if (!added.length) return;
			added.sort((a, b) => a.ordinal - b.ordinal);
			const appended = added[0].ordinal > (included.at(-1)?.ordinal ?? -1);
			included.push(...added);
			if (appended) { for (const x of added) accumulator.add(x.t, x.m, x.g); return; }
			included.sort((a, b) => a.ordinal - b.ordinal);
			accumulator = createEventStatsAccumulator();
			for (const x of included) accumulator.add(x.t, x.m, x.g);
		},
		stats: () => accumulator.stats(),
	};
}

const signature = (p: EventPlayer) => JSON.stringify([p.name, p.teams.map(t => [t.id, t.leagueId ?? null]), EVENT_METRICS.map(k => p[k])]);

function buildScope(tournaments: readonly TournamentState[], id: string, label: string): EventScopeV2 {
	const ordered = sourceOrderedStats(scopeTournaments(tournaments, id));
	const checkpoints: Checkpoint<EventPlayerDelta>[] = [];
	const changedRows: EventPlayer[][] = [];
	const previous = new Map<string, string>();
	for (const t of tournaments) {
		for (const c of t.eventCheckpoints ?? []) {
			ordered.include(c.gameIds.map(g => `${t.id}:${g}`));
			const stats = ordered.stats();
			if (!stats.games || stats.games === checkpoints.at(-1)?.games) continue;
			const changed: EventPlayer[] = [];
			for (const p of stats.players) {
				const current = signature(p);
				if (previous.get(p.key) === current) continue;
				previous.set(p.key, current);
				changed.push({ ...p, teams: [...p.teams] });
			}
			changedRows.push(changed);
			checkpoints.push({ id: `${t.id}:${c.key}`, label: `${t.seasonSubStage === "play-in" ? "Play-in · " : ""}${c.label}`, games: stats.games, players: [] });
		}
		ordered.include(t.matches.flatMap(m => (m.series?.games ?? []).map(g => `${t.id}:${g.id}`)));
	}
	const stats = ordered.stats();
	const index = new Map(stats.players.map((p, i) => [p.key, i]));
	checkpoints.forEach((c, i) => {
		c.players = changedRows[i].map(p => {
			const at = index.get(p.key)!, identity = stats.players[at];
			const point = packEventPlayer(p, identity);
			const delta: EventPlayerDelta = [at, point.values];
			const renamed = p.name !== identity.name;
			if (renamed || point.teams.length !== identity.teams.length || point.teams.some((team, j) => team !== j)) delta.push(point.teams);
			if (renamed) delta.push(p.name);
			return delta;
		});
	});
	return { id, label, stats, checkpointEncoding: "delta-v2", checkpoints };
}

/** Persist only final aggregates and changed player checkpoint totals, not full recaps. */
export function buildEventRecord(tournaments: readonly TournamentState[], identity: EventRecordIdentity): EventRecord {
	const scopeLabels: [string, string][] = [["all", "Whole event"]];
	if (tournaments.some(t => t.seasonSubStage === "play-in")) scopeLabels.push(["play-in", "Play-in"], ["main", "Main event"]);
	if (tournaments.some(t => t.seasonSubStage !== "play-in" && t.format.includes("playoffs"))) scopeLabels.push(["regular", "Regular / groups"], ["playoffs", "Playoffs"]);
	const scopes = scopeLabels.map(([id, label]) => buildScope(tournaments, id, label));
	return { version: 2, ...identity, championLanes: Object.assign({}, ...tournaments.map(t => t.championLanes ?? {})), scopes };
}

/** Expands a checkpoint of either encoding; players without recorded rows stay absent. */
export function eventCheckpointPlayers(scope: EventScope, checkpoint: EventScope["checkpoints"][number]): EventPlayer[] {
	if (scope.checkpointEncoding === "delta-v2") {
		const players = new Map<number, EventPlayer>();
		for (const c of scope.checkpoints) {
			for (const [index, values, teams, name] of c.players) {
				const identity = scope.stats.players[index];
				if (identity) players.set(index, unpackEventPlayer({ key: identity.key, name: name ?? identity.name, teams: teams ?? identity.teams.map((_, i) => i), values }, identity));
			}
			if (c.id === checkpoint.id) break;
		}
		return [...players.values()];
	}
	const identities = new Map(scope.stats.players.map(p => [p.key, p]));
	return checkpoint.players.flatMap(p => {
		if (Array.isArray(p)) return [];
		const identity = identities.get(p.key);
		return identity ? [unpackEventPlayer(p, identity)] : [];
	});
}

export function seasonEventGroups(season: SeasonState) {
	return season.phases.flatMap<{ tournaments: TournamentState[]; identity: EventRecordIdentity }>((p, phaseIndex) => {
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
