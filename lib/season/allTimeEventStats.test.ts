import { describe, expect, it } from "vitest";
import type { EventChampion, EventPlayer, EventStats } from "../eventStats";
import { rankEventPlayers } from "../eventStats";
import type { EventRecord } from "./eventHistory";
import type { SeasonHistoryEntry } from "./history";
import { aggregateAllTimeEventStats, allTimeEventYears, type AllTimeEventFilters } from "./allTimeEventStats";

const ALL: AllTimeEventFilters = { event: "all", leagueId: "all", fromYear: null, toYear: null };

function player(id: string, lane: EventPlayer["lane"], team: string, over: Partial<EventPlayer> = {}, leagueId: EventPlayer["teams"][number]["leagueId"] = "LCK"): EventPlayer {
	return { key: `${id}:${lane}`, playerId: id, name: id.toUpperCase(), lane, teams: [{ id: `${team}-id`, name: team, leagueId }], games: 4, wins: 2, rated: 4, ratingSum: 28, adjusted: 4, sum: 28, squares: 196, goldGames: 4, goldSum: 400, kills: 8, deaths: 4, assists: 12, kdaGames: 4, opportunities: 4, ...over };
}
function champ(championId: number, over: Partial<EventChampion> = {}): EventChampion {
	return { championId, picks: 2, wins: 1, losses: 1, bans: 1, pickGames: 2, banGames: 1, presenceGames: 3, roles: { top: { picks: 2, wins: 1, losses: 1, games: 2 } }, ...over };
}
function record(id: string, stats: Partial<EventStats>, over: Partial<EventRecord> = {}, version: 1 | 2 = 2): EventRecord {
	const full: EventStats = { games: 4, players: [], champions: [], ...stats };
	const base = { id, label: id, championLanes: { "1": ["top"] }, split: "winter", leagueId: "LCK", ...over };
	return (version === 2
		? { version: 2, ...base, scopes: [{ id: "all", label: "Whole event", stats: full, checkpointEncoding: "delta-v2", checkpoints: [] }] }
		: { version: 1, ...base, scopes: [{ id: "all", label: "Whole event", stats: full, checkpoints: [] }] }) as EventRecord;
}
function entry(id: string, year: number | undefined, records?: EventRecord[], archivedAt = year ?? 0): SeasonHistoryEntry {
	return { id, name: `Year ${year}`, archivedAt, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, ...(year ? { franchiseYear: year } : {}), ...(records ? { eventRecords: records } : {}) } as SeasonHistoryEntry;
}

describe("aggregateAllTimeEventStats", () => {
	it("pins the most recent actual contribution within filters, with per-entity year coverage", () => {
		const h = [entry("s2", 2, [record("late", { players: [player("p", "top", "Nova", {}, "LPL")] }, { split: "summer", phaseIndex: 3 })]), entry("s1", 1, [record("early", { players: [player("p", "top", "Nova")] }, { phaseIndex: 0 })]), entry("s3", 3, [record("empty", { players: [player("p", "top", "Nova", { games: 0 })] })])];
		const all = aggregateAllTimeEventStats([h], ALL);
		expect(all.playerPins["p:top"]).toMatchObject({ seasonId: "s2", phaseScope: "summer", fromYear: 1, toYear: 2 });
		expect(all.teamPins["LCK|Nova"]).toMatchObject({ seasonId: "s1", phaseScope: "winter" });
		expect(all.teamPins["LPL|Nova"]).toMatchObject({ seasonId: "s2" });
		expect(aggregateAllTimeEventStats([h], { ...ALL, event: "winter" }).playerPins["p:top"]).toMatchObject({ seasonId: "s1", fromYear: 1, toYear: 1 });
		expect(aggregateAllTimeEventStats([h], { ...ALL, toYear: 1 }).playerPins["p:top"]?.seasonId).toBe("s1");
	});
	it("pins the latest phase in source order and preserves exact archives across reality id collisions", () => {
		const winter = record("winter", { players: [player("p", "top", "Nova")] }, { phaseIndex: 0 });
		const worlds = record("worlds", { players: [player("p", "top", "Nova")] }, { split: undefined, event: "worlds", phaseIndex: 4 });
		const first = entry("same-id", 1, [winter]);
		const latest = entry("same-id", 2, [worlds, winter]);
		const data = aggregateAllTimeEventStats([[latest], [first]], ALL);
		expect(data.playerPins["p:top"].archive).toBe(latest);
		expect(data.playerPins["p:top"].phaseScope).toBe("worlds");
		expect(data.teamPins["LCK|Nova"].archive).toBe(latest);
	});
	it("leaves missing years and phases unknown and keeps mixed coverage order independent", () => {
		const undated = entry("legacy", undefined, [record("legacy-event", { players: [player("p", "top", "Nova")] }, { split: undefined })], 2);
		const dated = entry("dated", 1, [record("winter", { players: [player("p", "top", "Nova")] })], 3);
		const one = aggregateAllTimeEventStats([[undated, dated]], ALL);
		expect(one).toEqual(aggregateAllTimeEventStats([[dated, undated]], ALL));
		expect(one.playerPins["p:top"]).toMatchObject({ seasonId: "legacy", fromYear: 1, toYear: 1, undated: true });
		expect(one.playerPins["p:top"]).not.toHaveProperty("phaseScope");
		expect(aggregateAllTimeEventStats([[undated]], ALL).playerPins["p:top"]).not.toHaveProperty("fromYear");
	});
	it("sums raw totals per playerId:lane across events and years, merging teams and versions", () => {
		const a = entry("s1", 1, [record("e1", { players: [player("p1", "top", "Alpha")] }, {}, 1)]);
		const b = entry("s2", 2, [record("e2", { players: [player("p1", "top", "Beta", { games: 6, wins: 3, rated: 6, adjusted: 6, ratingSum: 30, sum: 30, squares: 150, opportunities: 6 })] }, {}, 2)]);
		const r = aggregateAllTimeEventStats([[b, a]], ALL);
		const p = r.stats.players.find(x => x.key === "p1:top")!;
		expect(r.stats.players).toHaveLength(1);
		expect([p.games, p.wins, p.rated, p.ratingSum, p.opportunities]).toEqual([10, 5, 10, 58, 10]);
		expect(p.teams.map(t => t.name)).toEqual(["Alpha", "Beta"]);
		expect(r.stats.games).toBe(8);
		expect(r.coverage).toMatchObject({ seasons: 2, recordedSeasons: 2, unrecordedSeasons: 0, events: 2 });
	});

	it("uses summed totals for qualification and score like rankEventPlayers", () => {
		const e = entry("s1", 1, [record("e1", { players: [player("p1", "top", "Alpha", { rated: 1, adjusted: 1, games: 1, opportunities: 1, ratingSum: 8, sum: 8, squares: 64 })] }), record("e2", { players: [player("p1", "top", "Alpha", { rated: 2, adjusted: 2, games: 2, opportunities: 2, ratingSum: 16, sum: 16, squares: 128 })] }, { split: "spring" })]);
		const [row] = rankEventPlayers(aggregateAllTimeEventStats([[e]], ALL).stats.players, "top");
		expect(row.rated).toBe(3);
		expect(row.qualified).toBe(true);
	});

	it("keeps substitutes and same-named teams in different regions distinct", () => {
		const e = entry("s1", 1, [record("e1", { players: [player("p1", "top", "Rift", {}, "LCK"), player("p2", "top", "Rift", {}, "LPL"), player("p1", "jungle", "Rift", {}, "LCK")] })]);
		const r = aggregateAllTimeEventStats([[e]], ALL);
		expect(r.stats.players.map(p => p.key).sort()).toEqual(["p1:jungle", "p1:top", "p2:top"]);
		const sameName = entry("s2", 2, [record("e2", { players: [player("p1", "top", "Rift", {}, "LPL")] })]);
		const merged = aggregateAllTimeEventStats([[e, sameName]], ALL).stats.players.find(p => p.key === "p1:top")!;
		expect(merged.teams.map(t => `${t.leagueId}:${t.name}`)).toEqual(["LCK:Rift", "LPL:Rift"]);
	});

	it("counts legacy years without eventRecords as not recorded, never zero", () => {
		const r = aggregateAllTimeEventStats([[entry("old", 1), entry("empty", 2, []), entry("s3", 3, [record("e", { players: [player("p", "top", "A")] })])]], ALL);
		expect(r.coverage).toMatchObject({ seasons: 3, recordedSeasons: 1, unrecordedSeasons: 2, events: 1 });
		expect(r.stats.players[0].games).toBe(4);
	});

	it("keeps deferred seasons unknown until records are resolved", () => {
		const deferred = { ...entry("s2", 2), eventRecordsDeferred: { realityId: "A", count: 1 } };
		for (const recordsFor of [undefined, () => undefined, () => []]) {
			const r = aggregateAllTimeEventStats([[entry("old", 1), deferred]], ALL, recordsFor);
			expect(r.coverage).toMatchObject({ seasons: 2, recordedSeasons: 0, unrecordedSeasons: 1, unloadedSeasons: 1, events: 0 });
			expect(r.stats.games).toBe(0);
		}
		expect(aggregateAllTimeEventStats([[deferred]], { ...ALL, toYear: 1 }).coverage).toMatchObject({ seasons: 0, excludedSeasons: 1, unloadedSeasons: 0 });
	});

	it("aggregates resolved records like inline records, preserving filters and archive pins", () => {
		const records = [record("winter", { players: [player("p", "top", "A")], champions: [champ(1)] }), record("worlds", { players: [player("p", "top", "B")] }, { split: undefined, leagueId: undefined, event: "worlds", phaseIndex: 4 })];
		const e = { ...entry("s1", 1), eventRecordsDeferred: { realityId: "A", count: records.length } };
		const loaded = new Map<SeasonHistoryEntry, EventRecord[]>([[e, records]]);
		for (const filters of [ALL, { ...ALL, event: "worlds" as const }, { ...ALL, leagueId: "LCK" as const }]) {
			const inline = aggregateAllTimeEventStats([[e]], filters, () => records);
			e.eventRecords = records;
			expect(inline).toEqual(aggregateAllTimeEventStats([[e]], filters));
			delete e.eventRecords;
			const resolved = aggregateAllTimeEventStats([[e]], filters, source => loaded.get(source));
			expect(resolved).toEqual(inline);
			expect(resolved.playerPins["p:top"].archive).toBe(e);
		}
	});

	it("resolves same-id seasons by entry object across realities", () => {
		const a = { ...entry("s1", 1), eventRecordsDeferred: { realityId: "A", count: 1 } };
		const b = { ...entry("s1", 1), eventRecordsDeferred: { realityId: "B", count: 1 } };
		const loaded = new Map<SeasonHistoryEntry, EventRecord[]>([[a, [record("a", { players: [player("p", "top", "A", { games: 2 })] })]], [b, [record("b", { players: [player("q", "top", "B", { games: 3 })] })]]]);
		const r = aggregateAllTimeEventStats([[a], [b]], ALL, source => loaded.get(source));
		expect(r.stats.players.map(p => [p.playerId, p.games])).toEqual([["p", 2], ["q", 3]]);
		expect(r.playerPins["p:top"].archive).toBe(a);
		expect(r.playerPins["q:top"].archive).toBe(b);
		expect(r.coverage).toMatchObject({ recordedSeasons: 2, unrecordedSeasons: 0, unloadedSeasons: 0 });
	});

	it("filters by event kind, split, region and year range", () => {
		const intl = record("i", { players: [player("pi", "top", "Intl")] }, { split: undefined, leagueId: undefined, event: "worlds" });
		const lck = record("l", { players: [player("pl", "top", "K")] }, { split: "winter", leagueId: "LCK" });
		const lpl = record("p", { players: [player("pp", "top", "P", {}, "LPL")] }, { split: "summer", leagueId: "LPL" });
		const h = [entry("s1", 1, [lck, lpl, intl]), entry("s2", 5, [lck]), entry("noyear", undefined, [lpl])];
		const keys = (f: Partial<AllTimeEventFilters>) => aggregateAllTimeEventStats([h], { ...ALL, ...f }).stats.players.map(p => p.playerId).sort();
		expect(keys({})).toEqual(["pi", "pl", "pp"]);
		expect(keys({ event: "domestic" })).toEqual(["pl", "pp"]);
		expect(keys({ event: "international" })).toEqual(["pi"]);
		expect(keys({ event: "summer" })).toEqual(["pp"]);
		expect(keys({ event: "worlds" })).toEqual(["pi"]);
		expect(keys({ leagueId: "LPL" })).toEqual(["pp"]);
		expect(keys({ fromYear: 2 })).toEqual(["pl"]);
		expect(keys({ toYear: 1 })).toEqual(["pi", "pl", "pp"]);
		const r = aggregateAllTimeEventStats([h], { ...ALL, fromYear: 2 });
		expect(r.coverage.excludedSeasons).toBe(2);
	});

	it("aggregates champion boards and merges lane maps", () => {
		const a = entry("s1", 1, [record("e1", { champions: [champ(1), champ(2, { picks: 0, wins: 0, losses: 0, pickGames: 0, roles: {} })] })]);
		const b = entry("s2", 2, [record("e2", { champions: [champ(1, { picks: 3, wins: 3, losses: 0 })] }, { championLanes: { "1": ["top"], "2": ["support"] } }, 1)]);
		const r = aggregateAllTimeEventStats([[a, b]], ALL);
		const c1 = r.stats.champions.find(c => c.championId === 1)!;
		expect([c1.picks, c1.wins, c1.losses, c1.bans, c1.presenceGames, c1.roles.top?.picks, c1.roles.top?.games]).toEqual([5, 4, 1, 2, 6, 4, 4]);
		expect(r.lanes["2"]).toEqual(["support"]);
		expect(r.stats.champions.map(c => c.championId)).toEqual([1, 2]);
	});

	it("is order independent and keeps the latest archive of a re-archived year", () => {
		const old = entry("s1", 1, [record("e1", { players: [player("p", "top", "A", { games: 1 })] })], 1);
		const fresh = entry("s1", 1, [record("e1", { players: [player("p", "top", "A", { games: 9 })] })], 2);
		const other = entry("s2", 2, [record("e2", { players: [player("q", "top", "B")] })]);
		const one = aggregateAllTimeEventStats([[old, fresh, other]], ALL);
		const two = aggregateAllTimeEventStats([[other, fresh, old]], ALL);
		expect(two).toEqual(one);
		expect(one.stats.players.find(p => p.playerId === "p")!.games).toBe(9);
	});

	it("aggregates several realities independently of id collisions between them", () => {
		const a = entry("s1", 1, [record("e1", { players: [player("p", "top", "A", { games: 2 })] })]);
		const b = entry("s1", 1, [record("e1", { players: [player("p", "top", "A", { games: 3 })] })]);
		const r = aggregateAllTimeEventStats([[a], [b]], ALL);
		expect(r.stats.players[0].games).toBe(5);
		expect(r.coverage.seasons).toBe(2);
	});

	it("skips records with no whole-event scope", () => {
		const bad = { ...record("e", {}), scopes: [] } as unknown as EventRecord;
		const r = aggregateAllTimeEventStats([[entry("s", 1, [bad])]], ALL);
		expect(r.coverage).toMatchObject({ recordedSeasons: 0, unrecordedSeasons: 1, events: 0 });
	});
});

describe("allTimeEventYears", () => {
	it("lists known years ascending", () => {
		expect(allTimeEventYears([[entry("a", 3), entry("b", 1), entry("c", undefined), entry("d", 3)]])).toEqual([1, 3]);
	});
});
