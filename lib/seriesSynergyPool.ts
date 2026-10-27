/**
 * Persist-only dedupe of the per-match roster snapshots' `synergy` maps.
 *
 * Every played series keeps a copy of both lineups as they were at that match.
 * Their synergy maps (~1 KB per player) were about half of a mid-year season
 * save, yet a player has only a few distinct versions per season. Each distinct
 * map is stored once in `seriesSynergyPool` and the snapshot keeps a content key
 * in `synergyRef`; restoring returns every snapshot exactly as it was. Older
 * builds that ignore the pool only lose synergy of matches already played.
 */
import type { Player } from "./types";
import type { SeasonState } from "./season/types";
import type { TournamentState } from "./tournament";

type Synergy = NonNullable<Player["synergy"]>;
type PooledPlayer = Player & { synergyRef?: string };
type Pool = Record<string, Synergy>;
type PooledTournament = { tournament: TournamentState; entries: Map<string, string> };

/** cyrb53 + length: a content key, checked against the stored JSON on collision. */
function contentKey(json: string): string {
	let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
	for (let i = 0; i < json.length; i++) {
		const c = json.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 2654435761);
		h2 = Math.imul(h2 ^ c, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${json.length.toString(36)}`;
}

// Tournaments are replaced wholesale on change, so identity memoization is safe.
const pooledTournaments = new WeakMap<TournamentState, PooledTournament>();

function poolTournament(t: TournamentState): PooledTournament {
	const cached = pooledTournaments.get(t);
	if (cached) return cached;
	const entries = new Map<string, string>();
	let changed = false;
	const roster = (players: Player[] | undefined) => {
		if (!players?.some(p => p.synergy)) return players;
		changed = true;
		return players.map(p => {
			if (!p.synergy) return p;
			const json = JSON.stringify(p.synergy);
			const key = contentKey(json);
			entries.set(key, json);
			const { synergy: _synergy, ...rest } = p;
			return { ...rest, synergyRef: key } as PooledPlayer;
		});
	};
	const matches = t.matches.map(m => {
		if (!m.series) return m;
		const bluePlayers = roster(m.series.bluePlayers), redPlayers = roster(m.series.redPlayers);
		return bluePlayers === m.series.bluePlayers && redPlayers === m.series.redPlayers ? m : { ...m, series: { ...m.series, bluePlayers, redPlayers } };
	});
	const result = { tournament: changed ? { ...t, matches } : t, entries };
	pooledTournaments.set(t, result);
	return result;
}

export function poolSeriesSynergies(season: SeasonState): SeasonState {
	const pool = new Map<string, string>();
	const tournaments: Record<string, TournamentState> = {};
	let changed = false;
	for (const [id, t] of Object.entries(season.tournaments)) {
		const pooled = poolTournament(t);
		for (const [key, json] of pooled.entries) {
			const existing = pool.get(key);
			// A real hash collision keeps the season unpooled: larger, never wrong.
			if (existing !== undefined && existing !== json) return season;
			pool.set(key, json);
		}
		tournaments[id] = pooled.tournament;
		changed ||= pooled.tournament !== t;
	}
	if (!changed) return season;
	return { ...season, tournaments, seriesSynergyPool: Object.fromEntries([...pool].map(([key, json]) => [key, JSON.parse(json) as Synergy])) };
}

export function restoreSeriesSynergies(season: SeasonState): SeasonState {
	const pool: Pool | undefined = season.seriesSynergyPool;
	if (!pool) return season;
	const roster = (players: Player[] | undefined) => players?.some(p => (p as PooledPlayer).synergyRef !== undefined)
		? players.map(p => {
			const { synergyRef, ...rest } = p as PooledPlayer;
			if (synergyRef === undefined) return p;
			const synergy = pool[synergyRef];
			if (!synergy) throw new Error("Saved series synergy is missing; refusing to overwrite it.");
			return { ...rest, synergy } as Player;
		})
		: players;
	const { seriesSynergyPool: _pool, ...rest } = season;
	return {
		...rest,
		tournaments: Object.fromEntries(Object.entries(season.tournaments).map(([id, t]) => [id, {
			...t,
			matches: t.matches.map(m => m.series ? { ...m, series: { ...m.series, bluePlayers: roster(m.series.bluePlayers), redPlayers: roster(m.series.redPlayers) } } : m),
		}])),
	} as SeasonState;
}
