import { EVENT_METRICS, type EventChampion, type EventPlayer, type EventStats } from "../eventStats";
import type { Lane } from "../types";
import type { EventRecord } from "./eventHistory";
import type { SeasonHistoryEntry } from "./history";
import type { InternationalId, LeagueId, SplitId } from "./types";

/** Event selector: every event, a family, one domestic split or one international event. */
export type AllTimeEventKind = "all" | "domestic" | "international" | SplitId | InternationalId;
export interface AllTimeEventFilters {
	event: AllTimeEventKind;
	/** Domestic league; any league filter excludes international events (they have no league). */
	leagueId: LeagueId | "all";
	fromYear: number | null;
	toYear: number | null;
}
export interface AllTimeEventCoverage {
	/** Seasons inside the year range. */
	seasons: number;
	/** Seasons with at least one readable event record. */
	recordedSeasons: number;
	/** Legacy seasons without readable event records: unknown, not zero. */
	unrecordedSeasons: number;
	/** Seasons outside the year range (or without a known year when a range is set). */
	excludedSeasons: number;
	/** Event records that passed the event and region filters. */
	events: number;
}
export interface AllTimeEventPin {
	seasonId: string;
	phaseScope?: SplitId | InternationalId;
	/** Exact source prevents cross-reality season-id collisions from resolving another archive. */
	archive: SeasonHistoryEntry;
	fromYear?: number;
	toYear?: number;
	undated?: boolean;
}
export interface AllTimeEventStats {
	stats: EventStats; lanes: Record<string, Lane[]>; coverage: AllTimeEventCoverage;
	playerPins: Record<string, AllTimeEventPin>;
	teamPins: Record<string, AllTimeEventPin>;
}

const SPLITS: readonly string[] = ["winter", "spring", "summer"];

/** Known simulation year; legacy archives may only carry it in the entry name. */
export function entryEventYear(e: SeasonHistoryEntry): number | undefined {
	if (e.franchiseYear !== undefined) return e.franchiseYear;
	const m = e.name.match(/Year (\d+)\s*$/);
	return m ? Number(m[1]) : undefined;
}

export function allTimeEventYears(histories: readonly (readonly SeasonHistoryEntry[])[]): number[] {
	return [...new Set(histories.flatMap(h => h.flatMap(e => entryEventYear(e) ?? [])))].sort((a, b) => a - b);
}

/** Re-archived years replace older copies, as in championRecords. */
function uniqueEntries(history: readonly SeasonHistoryEntry[]): SeasonHistoryEntry[] {
	const unique = new Map<string, SeasonHistoryEntry>();
	for (const e of history) if (!unique.has(e.id) || unique.get(e.id)!.archivedAt < e.archivedAt) unique.set(e.id, e);
	return [...unique.values()];
}

const wholeEvent = (r: EventRecord): EventStats | undefined => r.scopes.find(s => s.id === "all")?.stats;

function matchesEvent(r: EventRecord, f: AllTimeEventFilters): boolean {
	if (f.leagueId !== "all" && r.leagueId !== f.leagueId) return false;
	switch (f.event) {
		case "all": return true;
		case "domestic": return !!r.split;
		case "international": return !!r.event;
		default: return SPLITS.includes(f.event) ? r.split === f.event : r.event === f.event;
	}
}

const teamKey = (t: EventPlayer["teams"][number]) => `${t.leagueId ?? ""}|${t.name}`;

/**
 * Sums the final whole-event rows of archived event records (version 1 and 2 share the final shape).
 * `histories` is one list per reality; ids are only deduplicated within a list.
 * Output rows feed rankEventPlayers and the champion tables unchanged.
 */
export function aggregateAllTimeEventStats(histories: readonly (readonly SeasonHistoryEntry[])[], filters: AllTimeEventFilters): AllTimeEventStats {
	const coverage: AllTimeEventCoverage = { seasons: 0, recordedSeasons: 0, unrecordedSeasons: 0, excludedSeasons: 0, events: 0 };
	const players = new Map<string, EventPlayer>();
	const champions = new Map<number, EventChampion>();
	const lanes: Record<string, Lane[]> = {};
	const playerPins: Record<string, AllTimeEventPin> = {};
	const teamPins: Record<string, AllTimeEventPin> = {};
	const pin = (pins: Record<string, AllTimeEventPin>, key: string, e: SeasonHistoryEntry, r: EventRecord) => {
		const previous = pins[key];
		const year = entryEventYear(e);
		const years = [previous?.fromYear, previous?.toYear, year].filter((y): y is number => y !== undefined);
		pins[key] = { seasonId: e.id, archive: e, ...(r.split || r.event ? { phaseScope: r.split ?? r.event } : {}), ...(years.length ? { fromYear: Math.min(...years), toYear: Math.max(...years) } : {}), ...(year === undefined || previous?.undated ? { undated: true } : {}) };
	};
	let games = 0;
	const inRange: SeasonHistoryEntry[] = [];
	for (const h of histories) for (const e of uniqueEntries(h)) {
		const year = entryEventYear(e);
		const ranged = filters.fromYear !== null || filters.toYear !== null;
		if (ranged && (year === undefined || (filters.fromYear !== null && year < filters.fromYear) || (filters.toYear !== null && year > filters.toYear))) { coverage.excludedSeasons++; continue; }
		inRange.push(e);
	}
	// Chronological order keeps floating-point sums, names and team order deterministic.
	inRange.sort((a, b) => (entryEventYear(a) ?? Infinity) - (entryEventYear(b) ?? Infinity) || a.archivedAt - b.archivedAt || a.id.localeCompare(b.id));
	for (const e of inRange) {
		coverage.seasons++;
		const records = (e.eventRecords ?? []).filter(r => wholeEvent(r)).sort((a, b) => (a.phaseIndex ?? -1) - (b.phaseIndex ?? -1) || a.id.localeCompare(b.id));
		if (!records.length) { coverage.unrecordedSeasons++; continue; }
		coverage.recordedSeasons++;
		for (const r of records) {
			if (!matchesEvent(r, filters)) continue;
			const s = wholeEvent(r)!;
			coverage.events++;
			games += s.games;
			for (const [id, l] of Object.entries(r.championLanes ?? {})) lanes[id] = [...new Set([...lanes[id] ?? [], ...l])];
			for (const p of s.players) {
				if (p.games > 0) {
					pin(playerPins, p.key, e, r);
					for (const team of p.teams) pin(teamPins, teamKey(team), e, r);
				}
				let t = players.get(p.key);
				if (!t) { t = { ...p, teams: [], ...Object.fromEntries(EVENT_METRICS.map(k => [k, 0])) }; players.set(p.key, t); }
				else t.name = p.name;
				for (const k of EVENT_METRICS) t[k] += p[k];
				for (const team of p.teams) {
					const previous = t.teams.find(x => teamKey(x) === teamKey(team));
					if (previous) Object.assign(previous, team);
					else t.teams.push({ ...team });
				}
			}
			for (const c of s.champions) {
				let t = champions.get(c.championId);
				if (!t) { t = { championId: c.championId, picks: 0, wins: 0, losses: 0, bans: 0, pickGames: 0, banGames: 0, presenceGames: 0, roles: {} }; champions.set(c.championId, t); }
				for (const k of ["picks", "wins", "losses", "bans", "pickGames", "banGames", "presenceGames"] as const) t[k] += c[k];
				for (const [role, v] of Object.entries(c.roles) as [Lane, NonNullable<EventChampion["roles"][Lane]>][]) {
					const x = t.roles[role] ?? { picks: 0, wins: 0, losses: 0, games: 0 };
					t.roles[role] = { picks: x.picks + v.picks, wins: x.wins + v.wins, losses: x.losses + v.losses, games: x.games + v.games };
				}
			}
		}
	}
	return {
		stats: { games, players: [...players.values()], champions: [...champions.values()].sort((a, b) => a.championId - b.championId) },
		lanes, coverage, playerPins, teamPins,
	};
}
