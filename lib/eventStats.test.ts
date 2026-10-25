import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
import { createSeries } from "./series";
import { computeEventStats, rankEventPlayers, recordEventCheckpoint } from "./eventStats";
import type { TournamentState } from "./tournament";
import type { SeasonState } from "./season/types";
import { recordMatchWinner } from "./tournament";
import { buildEventRecord, eventCheckpointPlayers } from "./season/eventHistory";
import { validEventRecords, validEventCheckpoints } from "./eventStatsValidation";
import { ssPerformanceScore } from "./season/ssPlayers";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SCHEMA_SQL, type PersistedStoreState } from "./desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, savePersistedStateToDbExecutor, resetSqliteStorageForTests, type SqlExecutor } from "./desktopSqlite";
import { buildSeasonHistoryEntry } from "./season/history";
import { compactEncodeSeasonForPersist, decodeCompactSeason } from "./recapCompression";
import { encodeRealityShareCode, decodeRealityShareCode } from "./realityShare";

function fixture(): TournamentState {
	const t = structuredClone(Object.values(makeAuditSeason("Event stats").tournaments)[0]);
	t.teams = t.teams.slice(0, 2);
	t.teams[0].players![0].tier = "B";
	const series = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: t.teams[0].name, redTeam: t.teams[1].name });
	t.matches = Array.from({ length: 3 }, (_, i) => ({ ...t.matches[0], id: `m${i}`, round: i + 1, isBye: false, blueTeamId: t.teams[0].id, redTeamId: t.teams[1].id, winner: { teamId: t.teams[0].id, blueWins: 1, redWins: 0 }, series: { ...series, games: [{ ...series.games[0], id: `g${i}`, status: "complete", winner: "blue", bluePicks: [1, null, null, null, null], redPicks: [2, null, null, null, null], blueBans: [3, null, null, null, null], blueRoles: ["top", null, null, null, null], redRoles: ["top", null, null, null, null], recap: { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: t.teams[0].players!.map(p => p.id!), red: t.teams[1].players!.map(p => p.id!) }, ratings: { blue: [9, 7, 7, 7, 7], red: [4, 5, 5, 5, 5] }, laneGoldDiff: { top: 1000 } } }] } }));
	return t;
}

describe("event performance", () => {
	it("ranks every tier using only completed games without mutating players", () => {
		const t = fixture(); const before = JSON.stringify(t);
		const stats = computeEventStats([t]);
		const top = rankEventPlayers(stats.players, "top")[0];
		expect(top.playerId).toBe(t.teams[0].players![0].id);
		expect(top.qualified).toBe(true);
		expect(top.ratingSum / top.rated).toBe(9);
		expect(top.goldSum / top.goldGames).toBe(1000);
		expect(JSON.stringify(t)).toBe(before);
		t.matches[2].series!.games[0].winner = null;
		expect(rankEventPlayers(computeEventStats([t]).players, "top")[0].qualified).toBe(false);
	});
	it("credits swapped sides and separates played-role picks from catalogue bans", () => {
		const t = fixture(); const g = t.matches[0].series!.games[0];
		[g.blueTeam, g.redTeam] = [g.redTeam, g.blueTeam];
		[g.recap!.perPickIds!.blue, g.recap!.perPickIds!.red] = [g.recap!.perPickIds!.red, g.recap!.perPickIds!.blue];
		const stats = computeEventStats([t]);
		expect(stats.players.find(p => p.playerId === t.teams[0].players![0].id)!.wins).toBe(2);
		expect(stats.champions.find(c => c.championId === 3)).toMatchObject({ bans: 3, wins: 0, losses: 0, presenceGames: 3 });
		expect(stats.champions.find(c => c.championId === 1)!.roles.top).toMatchObject({ picks: 3, wins: 3 });
	});
	it("records idempotent round boundaries without including future results", () => {
		const t = fixture(); const first = structuredClone(t);
		first.matches = first.matches.slice(0, 1);
		const recorded = recordEventCheckpoint(first, "m0");
		expect(recorded.eventCheckpoints).toHaveLength(1);
		expect(recordEventCheckpoint(recorded, "m0")).toBe(recorded);
		expect(recorded.eventCheckpoints![0].gameIds).toEqual(["g0"]);
		expect(computeEventStats([t], new Set([`${t.id}:g0`])).games).toBe(1);
	});
	it("isolates stages, combines play-in appearances by ID and preserves checkpoint cutoffs", () => {
		const playIn = fixture(); playIn.seasonSubStage = "play-in";
		const main = structuredClone(playIn); main.id = "main"; delete main.seasonSubStage;
		main.matches[2].bracket = "winners";
		main.eventCheckpoints = [{ key: "regular:2", label: "Round 2", gameIds: ["g0", "g1"] }];
		const e = buildEventRecord([playIn, main], { id: "worlds", label: "Worlds" });
		expect(e.scopes.find(s => s.id === "all")!.stats.games).toBe(6);
		expect(e.scopes.find(s => s.id === "all")!.stats.players).toHaveLength(10);
		expect(e.scopes.find(s => s.id === "main")!.stats.games).toBe(3);
		expect(e.scopes.find(s => s.id === "play-in")!.stats.games).toBe(3);
		expect(e.scopes.find(s => s.id === "playoffs")!.stats.games).toBe(1);
		expect(e.scopes[0].checkpoints[0].games).toBe(5);
		expect(eventCheckpointPlayers(e.scopes[0], e.scopes[0].checkpoints[0])[0].games).toBe(5);
		expect(validEventRecords([e])).toBe(true);
	});
	it("does not duplicate tournament inputs or attribute unknown appearances to starters", () => {
		const t = fixture();
		expect(computeEventStats([t, t]).games).toBe(3);
		for (const m of t.matches) delete m.series!.games[0].recap!.perPickIds;
		expect(computeEventStats([t]).players).toEqual([]);
		expect(computeEventStats([t]).champions.length).toBeGreaterThan(0);
	});
	it("matches SS's performance math but reports incomplete adjustment evidence separately", () => {
		const t = fixture();
		const row = rankEventPlayers(computeEventStats([t]).players, "top")[0];
		expect(row.score).toBeCloseTo(ssPerformanceScore(Array(3).fill(row.sum / 3)), 10);
		delete t.teams[1].players;
		const partial = computeEventStats([t]).players.find(p => p.playerId === t.teams[0].players![0].id)!;
		expect(rankEventPlayers([partial], "top")[0]).toMatchObject({ score: null, qualified: false, rated: 3 });
	});
	it("records through the shared series-result owner and distinguishes reset brackets", () => {
		const t = fixture(); t.format = "single-elim";
		t.matches = t.matches.slice(0, 1); t.matches[0].winner = null; t.matches[0].feedsInto = null;
		const done = recordMatchWinner(t, "m0", { teamId: t.teams[0].id, blueWins: 1, redWins: 0 });
		expect(done.eventCheckpoints?.[0].gameIds).toEqual(["g0"]);
		const reset = structuredClone(done); reset.matches[0].id = "reset"; reset.matches[0].bracket = "grand-final-reset";
		expect(recordEventCheckpoint(reset, "reset").eventCheckpoints).toHaveLength(2);
	});
	it("keeps elimination play-in games out of main-event regular and playoffs scopes", () => {
		const playIn = fixture(); playIn.seasonSubStage = "play-in"; playIn.format = "single-elim";
		const main = structuredClone(playIn); main.id = "main"; delete main.seasonSubStage; main.format = "groups-playoffs";
		main.matches[0].bracket = "winners"; main.matches[1].bracket = undefined; main.matches[1].feedsInto = null; main.matches[2].bracket = undefined; main.matches[2].feedsInto = null;
		const e = buildEventRecord([playIn, main], { id: "worlds", label: "Worlds" });
		const games = (id: string) => e.scopes.find(s => s.id === id)!.stats.games;
		expect(games("all")).toBe(6);
		expect(games("play-in")).toBe(3);
		expect(games("main")).toBe(3);
		expect(games("playoffs") + games("regular")).toBe(3);
		expect(games("playoffs")).toBe(1);
		expect(validEventRecords([e])).toBe(true);
	});
	it("resolves same-name teams by participant IDs and leaves unresolvable sides unattributed", () => {
		const same = () => { const t = fixture(); t.teams[1].name = t.teams[0].name; for (const m of t.matches) { const g = m.series!.games[0]; g.blueTeam = g.redTeam = t.teams[0].name; } return t; };
		const t = same();
		const a = t.teams[0].players![0].id!, b = t.teams[1].players![0].id!;
		const nominal = computeEventStats([t]);
		expect(nominal.players.find(p => p.playerId === a)!.teams.map(x => x.id)).toEqual([t.teams[0].id]);
		expect(nominal.players.find(p => p.playerId === b)!.teams.map(x => x.id)).toEqual([t.teams[1].id]);
		expect(nominal.players.find(p => p.playerId === a)!.wins).toBe(3);
		const swapped = same(); const g = swapped.matches[0].series!.games[0];
		[g.recap!.perPickIds!.blue, g.recap!.perPickIds!.red] = [g.recap!.perPickIds!.red, g.recap!.perPickIds!.blue];
		g.winner = "red";
		const s = computeEventStats([swapped]);
		expect(s.players.find(p => p.playerId === swapped.teams[0].players![0].id)!.wins).toBe(3);
		const unknown = same(); const u = unknown.matches[0].series!.games[0];
		u.recap!.perPickIds = { blue: Array(5).fill("x"), red: Array(5).fill("y") }; u.recap!.perPickIds.blue = ["x1", "x2", "x3", "x4", "x5"]; u.recap!.perPickIds.red = ["y1", "y2", "y3", "y4", "y5"];
		const r = computeEventStats([unknown]);
		expect(r.games).toBe(3);
		expect(r.players.some(p => p.playerId === "x1")).toBe(false);
		expect(r.players.find(p => p.playerId === unknown.teams[0].players![0].id)!.games).toBe(2);
	});
	it("rejects malformed archive metrics and checkpoint references before import", () => {
		const e = buildEventRecord([fixture()], { id: "event", label: "Event" });
		expect(validEventRecords(JSON.parse(JSON.stringify([e])))).toBe(true);
		e.scopes[0].stats.players[0].wins = 500;
		expect(validEventRecords([e])).toBe(false);
		expect(validEventCheckpoints([{ key: "r1", label: "Round 1", gameIds: ["future"] }], new Set(["g0"]))).toBe(false);
		expect(validEventCheckpoints([{ key: "r1", label: "Round 1", gameIds: ["g0"] }, { key: "r1", label: "Round 1", gameIds: ["g0"] }], new Set(["g0"]))).toBe(false);
	});
	it("counts duplicate mirror picks as two appearances but only one presence or role game", () => {
		const t = fixture(); t.matches = t.matches.slice(0, 1);
		t.matches[0].series!.games[0].redPicks[0] = 1;
		const c = computeEventStats([t]).champions.find(c => c.championId === 1)!;
		expect(c).toMatchObject({ picks: 2, pickGames: 1, presenceGames: 1, wins: 1, losses: 1, roles: { top: { picks: 2, games: 1, wins: 1, losses: 1 } } });
	});
	it("round-trips nonempty event history and checkpoints through compression, sharing and SQLite", async () => {
		const season = makeAuditSeason("Event persistence");
		let t = fixture(); t = recordEventCheckpoint(t, "m2"); t.championLanes = { "1": ["top"], "3": ["top", "middle"] };
		season.tournaments = { [t.id]: t }; season.phases[0].tournamentIds = [t.id];
		const history = [JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)))];
		const expected = history[0].eventRecords;
		expect(expected[0].scopes[0].stats.players.length).toBe(10);
		expect(validEventRecords(expected)).toBe(true);
		expect(decodeCompactSeason(compactEncodeSeasonForPersist(season)).tournaments[t.id].eventCheckpoints).toEqual(t.eventCheckpoints);
		const reality = { id: season.franchise.id, name: "Event persistence", year: 1, season, history };
		const shared = await decodeRealityShareCode(await encodeRealityShareCode(JSON.stringify({ kind: "reality", version: 1, reality })));
		expect(JSON.parse(shared.json!).reality.history[0].eventRecords).toEqual(expected);
		const db = new DatabaseSync(":memory:"); db.exec(SCHEMA_SQL);
		const executor: SqlExecutor = { execute: async (q, values = []) => ({ rowsAffected: Number(db.prepare(q).run(...values as SQLInputValue[]).changes) }), select: async <T>(q: string, values: unknown[] = []) => db.prepare(q).all(...values as SQLInputValue[]) as T[] };
		try {
			resetSqliteStorageForTests();
			await savePersistedStateToDbExecutor(executor, "draftsim-store", { season, activeRealityId: reality.id, realities: [reality] } as PersistedStoreState);
			const loaded = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
			expect(loaded.realities![0].history[0].eventRecords).toEqual(expected);
			expect(loaded.season!.tournaments[t.id].eventCheckpoints).toEqual(t.eventCheckpoints);
			resetSqliteStorageForTests(); await savePersistedStateToDbExecutor(executor, "draftsim-store", loaded);
			expect((await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!.realities![0].history[0].eventRecords).toEqual(expected);
		} finally { db.close(); resetSqliteStorageForTests(); }
	});
	it("keeps completed-stage KDA through a desktop save so a later archive retains KDA totals", async () => {
		const season = makeAuditSeason("Event KDA restart");
		const t = fixture(); t.status = "complete";
		for (const m of t.matches) m.series!.games[0].recap!.perPickKDA = { blue: Array.from({ length: 5 }, (_, i) => ({ k: i + 1, d: 1, a: 2 })), red: Array.from({ length: 5 }, () => ({ k: 0, d: 3, a: 1 })) };
		season.tournaments = { [t.id]: t }; season.phases[0].tournamentIds = [t.id];
		const expected = buildSeasonHistoryEntry(season, 1).eventRecords!;
		expect(expected[0].scopes[0].stats.players.find(p => p.kdaGames)?.kills).toBeGreaterThan(0);
		const reality = { id: season.franchise.id, name: "Event KDA restart", year: 1, season, history: [] };
		const db = new DatabaseSync(":memory:"); db.exec(SCHEMA_SQL);
		const executor: SqlExecutor = { execute: async (q, values = []) => ({ rowsAffected: Number(db.prepare(q).run(...values as SQLInputValue[]).changes) }), select: async <T>(q: string, values: unknown[] = []) => db.prepare(q).all(...values as SQLInputValue[]) as T[] };
		try {
			resetSqliteStorageForTests();
			await savePersistedStateToDbExecutor(executor, "draftsim-store", { season, activeRealityId: reality.id, realities: [reality] } as PersistedStoreState);
			resetSqliteStorageForTests();
			// Switching realities restores the season from its reality row, not the active-season fragment.
			const row = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!.realities![0].season as SeasonState;
			const restored = decodeCompactSeason(row);
			expect(restored.tournaments[t.id].matches[0].series!.games[0].recap!.perPickKDA).toEqual(t.matches[0].series!.games[0].recap!.perPickKDA);
			expect(buildSeasonHistoryEntry(restored, 1).eventRecords).toEqual(expected);
		} finally { db.close(); resetSqliteStorageForTests(); }
	});
	it("keeps a 300-game split archive bounded without storing recaps", () => {
		let t = fixture(); const templates = t.matches; t.matches = [];
		for (let i = 0; i < 300; i++) {
			const m = structuredClone(templates[i % 3]); m.id = `large-${i}`; m.round = Math.floor(i / 10) + 1; m.series!.games[0].id = `large-game-${i}`;
			t.matches.push(m);
			if (i % 10 === 9) t = recordEventCheckpoint(t, m.id);
		}
		const started = performance.now();
		const event = buildEventRecord([t], { id: "large", label: "Large split" });
		const bytes = Buffer.byteLength(JSON.stringify(event));
		console.info(`Event archive benchmark: 300 games, 30 checkpoints, ${bytes} bytes, ${Math.round(performance.now() - started)} ms`);
		expect(bytes).toBeLessThan(180_000);
		expect(event.scopes[0].checkpoints).toHaveLength(30);
		expect(event.scopes[0].stats.games).toBe(300);
	});
});

describe("event record validation against simulated data", () => {
	async function simulated(format: "round-robin-playoffs" | "single-elim", seed: string) {
		const { createTournament } = await import("./tournament");
		const { autoPlayMatch } = await import("./sim/autoPlayMatch");
		const { LANE_ORDER, rosterFromStar } = await import("./players");
		const champions = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, alias: `C${i + 1}`, roles: [], iconUrl: "", lanes: [LANE_ORDER[i % 5]] }));
		let t = createTournament({
			name: seed, format, sideRule: "alternate",
			teams: Array.from({ length: 6 }, (_, i) => ({ id: `${seed}${i}`, name: `Team ${i}`, seed: i + 1, starRating: 2 + (i % 3), players: rosterFromStar(2 + (i % 3)).map(p => ({ ...p, id: `${seed}${i}-${p.lane}`, name: `${p.lane} ${i}` })) })),
			defaults: { format: "bo3", fearless: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false },
		});
		for (let i = 0; i < 200; i++) {
			const next = t.matches.find(m => !m.winner && !m.isBye && m.blueTeamId && m.redTeamId);
			if (!next) break;
			[t] = autoPlayMatch(t, next.id, champions);
		}
		return t;
	}
	it("always validates records built from simulated tournaments, v2 and the v1 equivalent", async () => {
		const t = await simulated("round-robin-playoffs", "a");
		expect(t.eventCheckpoints?.length).toBeGreaterThan(2);
		const e = buildEventRecord([t], { id: "event", label: "Event" });
		expect(e.scopes.find(s => s.id === "all")!.stats.players.length).toBeGreaterThan(5);
		expect(validEventRecords(JSON.parse(JSON.stringify([e])))).toBe(true);
		const { computeEventStats: compute, packEventPlayer } = await import("./eventStats");
		const final = compute([t]), ids = new Map(final.players.map(p => [p.key, p]));
		const v1 = { version: 1 as const, id: "event", label: "Event", championLanes: {}, scopes: [{ id: "all" as const, label: "Whole event", stats: final,
			checkpoints: t.eventCheckpoints!.map(c => { const at = compute([t], new Set(c.gameIds.map(id => `${t.id}:${id}`))); return { id: c.key, label: c.label, games: at.games, players: at.players.map(p => packEventPlayer(p, ids.get(p.key)!)) }; }) }] };
		expect(validEventRecords(JSON.parse(JSON.stringify([v1])))).toBe(true);
	});
	it("rejects impossible rating moments and checkpoint totals beyond the final row", () => {
		const base = async () => buildEventRecord([await simulated("single-elim", "b")], { id: "event", label: "Event" });
		return base().then(e => {
			const clone = () => JSON.parse(JSON.stringify([e]));
			const mutate = (f: (p: Record<string, number>) => void) => { const r = clone(); f(r[0].scopes[0].stats.players[0]); return validEventRecords(r); };
			expect(mutate(() => {})).toBe(true);
			expect(mutate(p => { p.adjusted = 1; p.rated = Math.max(p.rated, 1); p.games = Math.max(p.games, 1); p.sum = 10; p.squares = 0; })).toBe(false);
			expect(mutate(p => { p.adjusted = 1; p.rated = 1; p.games = Math.max(p.games, 1); p.opportunities = Math.max(p.opportunities, p.games); p.sum = 0.5; p.squares = 0.25; })).toBe(false);
			expect(mutate(p => { p.rated = 1; p.ratingSum = 0; })).toBe(false);
			const r = clone(); const cp = r[0].scopes[0].checkpoints.at(-1);
			const [, values] = cp.players[0]; values[3] = r[0].scopes[0].stats.players[cp.players[0][0]].ratingSum + 5;
			expect(validEventRecords(r)).toBe(false);
			const g = clone(); const gp = g[0].scopes[0].checkpoints.at(-1).players[0];
			gp[1][8] = g[0].scopes[0].stats.players[gp[0]].goldSum - 1000; // signed gold may decrease
			expect(validEventRecords(g)).toBe(true);
		});
	});
});
