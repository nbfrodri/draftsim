import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { createSeries } from "../series";
import { LANE_ORDER } from "../players";
import { computeEventStats, packEventPlayer, rankEventPlayers } from "../eventStats";
import { validEventRecords } from "../eventStatsValidation";
import { validHistoryEntry } from "../importValidation";
import { buildSeasonHistoryEntry } from "./history";
import { buildEventRecord, eventCheckpointPlayers, type EventRecord } from "./eventHistory";
import type { TournamentState } from "../tournament";

function fixture(): TournamentState {
	const t = structuredClone(Object.values(makeAuditSeason("Delta checkpoints").tournaments)[0]);
	t.format = "round-robin";
	t.matches = Array.from({ length: 40 }, (_, i) => {
		const blue = t.teams[(i * 2) % 10], red = t.teams[(i * 2 + 1) % 10];
		const series = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: blue.name, redTeam: red.name });
		series.games[0] = { ...series.games[0], id: `g${i}`, status: "complete", winner: "blue",
			recap: { durationMinutes: 30, mvp: null, biggestSwing: null,
				perPickIds: { blue: blue.players!.map(p => p.id!), red: red.players!.map(p => p.id!) },
				ratings: { blue: [8.1, 7.2, 9.3, 6.4, 5.5], red: [4.6, 5.7, 6.8, 7.9, 8] },
				laneGoldDiff: { top: 300 },
			},
		};
		return { ...t.matches[0], id: `m${i}`, round: i + 1, isBye: false, feedsInto: null, blueTeamId: blue.id, redTeamId: red.id, series, winner: { teamId: blue.id, blueWins: 1, redWins: 0 } };
	});
	t.eventCheckpoints = t.matches.map((_, i) => ({ key: `r${i}`, label: `Round ${i}`, gameIds: t.matches.slice(0, i + 1).map(m => m.series!.games[0].id) }));
	return t;
}

// Version 1's independently recomputed cumulative snapshots are the compatibility oracle.
function legacyRecord(t: TournamentState): EventRecord {
	const stats = computeEventStats([t]);
	const identities = new Map(stats.players.map(p => [p.key, p]));
	return { version: 1, id: "event", label: "Event", championLanes: {}, scopes: [{ id: "all", label: "Whole event", stats,
		checkpoints: t.eventCheckpoints!.map(c => {
			const at = computeEventStats([t], new Set(c.gameIds.map(id => `${t.id}:${id}`)));
			return { id: `${t.id}:${c.key}`, label: c.label, games: at.games, players: at.players.map(p => packEventPlayer(p, identities.get(p.key)!)) };
		}),
	}] };
}

describe("delta event archives", () => {
	it("preserves source-order names and floating-point totals when rounds complete out of order", () => {
		const t = fixture(); t.matches = t.matches.slice(0, 16);
		for (const [i, m] of t.matches.entries()) {
			const recap = m.series!.games[0].recap!;
			recap.perPickNames = { blue: Array(5).fill(`Name ${i}`), red: Array(5).fill(`Opponent ${i}`) };
			recap.ratings!.blue = Array(5).fill(4.1 + i / 10);
		}
		const order = [15, 10, 5, 0, ...Array.from({ length: 16 }, (_, i) => i).filter(i => i % 5 !== 0)];
		t.eventCheckpoints = order.map((_, i) => ({ key: `r${i}`, label: `Round ${i}`, gameIds: order.slice(0, i + 1).map(n => `g${n}`) }));
		const old = legacyRecord(t), next = buildEventRecord([t], { id: "event", label: "Event" });
		expect(next.scopes[0].stats).toEqual(old.scopes[0].stats);
		for (let i = 0; i < order.length; i++) for (const lane of LANE_ORDER) {
			expect(rankEventPlayers(eventCheckpointPlayers(next.scopes[0], next.scopes[0].checkpoints[i]), lane)).toEqual(rankEventPlayers(eventCheckpointPlayers(old.scopes[0], old.scopes[0].checkpoints[i]), lane));
		}
	});
	it("stores materially less JSON while reconstructing every version-1 ranking", () => {
		const t = fixture(), before = JSON.stringify(t);
		const old = legacyRecord(t), next = buildEventRecord([t], { id: "event", label: "Event" });
		expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThan(Buffer.byteLength(JSON.stringify(old)) * 0.65);
		expect(next.version).toBe(2);
		const scope = next.scopes[0];
		for (let i = 0; i < scope.checkpoints.length; i++) {
			const actual = eventCheckpointPlayers(scope, scope.checkpoints[i]);
			const expected = eventCheckpointPlayers(old.scopes[0], old.scopes[0].checkpoints[i]);
			for (const lane of LANE_ORDER) expect(rankEventPlayers(actual, lane)).toEqual(rankEventPlayers(expected, lane));
		}
		expect(JSON.stringify(t)).toBe(before);
		expect(validEventRecords([next])).toBe(true);
	});
	it("imports and reads v1 without modifying its persisted representation", () => {
		const old = JSON.parse(JSON.stringify(legacyRecord(fixture())));
		const before = JSON.stringify(old);
		const entry = { ...buildSeasonHistoryEntry(makeAuditSeason(), 1), eventRecords: [old] };
		expect(validHistoryEntry(entry)).toBe(true);
		expect(eventCheckpointPlayers(old.scopes[0], old.scopes[0].checkpoints[0])).toHaveLength(10);
		expect(eventCheckpointPlayers(old.scopes[0], old.scopes[0].checkpoints.at(-1))).toEqual(old.scopes[0].stats.players);
		expect(JSON.stringify(old)).toBe(before);
	});
	it("preserves substitute opportunities, side swaps, missing evidence and multi-stage cutoffs", () => {
		const playIn = fixture(); playIn.seasonSubStage = "play-in";
		const main = fixture(); main.id = "main";
		for (const t of [playIn, main]) { t.matches = t.matches.slice(0, 12); t.eventCheckpoints = t.eventCheckpoints!.slice(0, 12); }
		const first = main.matches[0].series!.games[0];
		[first.blueTeam, first.redTeam] = [first.redTeam, first.blueTeam];
		[first.recap!.perPickIds!.blue, first.recap!.perPickIds!.red] = [first.recap!.perPickIds!.red, first.recap!.perPickIds!.blue];
		main.matches[5].series!.games[0].recap!.perPickIds!.blue[0] = "substitute";
		delete main.matches[10].series!.games[0].recap!.perPickIds;
		main.format = "round-robin-playoffs";
		for (const m of main.matches.slice(8)) m.bracket = "winners";
		const next = buildEventRecord([playIn, main], { id: "event", label: "Event" });
		expect(next.scopes.map(s => s.id)).toEqual(["all", "play-in", "main", "regular", "playoffs"]);
		const stage = (t: TournamentState, playoffs: boolean) => ({ ...t, matches: t.matches.filter(m => !!m.bracket === playoffs) });
		for (const scope of next.scopes) {
			const selected = scope.id === "main" ? [main] : scope.id === "play-in" ? [playIn]
				: scope.id === "regular" ? [stage(main, false)]
					: scope.id === "playoffs" ? [stage(main, true)] : [playIn, main];
			expect(scope.stats).toEqual(computeEventStats(selected));
			expect(scope.checkpoints.length).toBeGreaterThan(0);
			for (const c of scope.checkpoints) {
				const source = c.id.startsWith("main:") ? main : playIn;
				const checkpoint = source.eventCheckpoints!.find(p => c.id === `${source.id}:${p.key}`)!;
				const keys = new Set(checkpoint.gameIds.map(id => `${source.id}:${id}`));
				if (source === main) for (const m of playIn.matches) keys.add(`${playIn.id}:${m.series!.games[0].id}`);
				const expected = computeEventStats(selected, keys);
				const actual = eventCheckpointPlayers(scope, c);
				expect(actual.map(p => p.key).sort()).toEqual(expected.players.map(p => p.key).sort());
				for (const lane of LANE_ORDER) expect(rankEventPlayers(actual, lane)).toEqual(rankEventPlayers(expected.players, lane));
			}
		}
	});
	it("rejects malformed delta indices, metrics, teams and mixed encodings at import", () => {
		const record = buildEventRecord([fixture()], { id: "event", label: "Event" });
		const entry = { ...buildSeasonHistoryEntry(makeAuditSeason(), 1), eventRecords: [record] };
		expect(validHistoryEntry(entry)).toBe(true);
		for (const invalid of [[-1, Array(14).fill(1)], [9999, Array(14).fill(1)], [0, [1]], [0, Array(14).fill(Infinity)], [0, Array(14).fill(1), [999]], [0, Array(14).fill(1), [0], ""]]) {
			const copy = structuredClone(entry);
			copy.eventRecords[0].scopes[0].checkpoints[0].players = [invalid as never];
			expect(validHistoryEntry(copy)).toBe(false);
		}
		const duplicate = structuredClone(entry);
		duplicate.eventRecords[0].scopes[0].checkpoints[0].players.push(duplicate.eventRecords[0].scopes[0].checkpoints[0].players[0]);
		expect(validHistoryEntry(duplicate)).toBe(false);
		const mixed = structuredClone(entry); mixed.eventRecords[0].version = 1;
		expect(validHistoryEntry(mixed)).toBe(false);
	});
});
