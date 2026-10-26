import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeEventStats, packEventPlayer, rankEventPlayers } from "./eventStats";
import { eventRankMovements } from "./eventRankMovement";
import { rosterFromStar } from "./players";
import { createRng } from "./rng";
import { createSeries } from "./series";
import { buildEventRecord, eventCheckpointPlayers, type EventScope, type EventScopeV1 } from "./season/eventHistory";
import { createTournament, recordMatchWinner } from "./tournament";
import type { Lane } from "./types";

beforeEach(() => vi.spyOn(Math, "random").mockImplementation(createRng(42)));
afterEach(() => vi.restoreAllMocks());

// Hand-built recaps make the fourth round reverse the top-lane ranking,
// after both players have qualified. Checkpoints use the real result owner.
function fixture(rounds = 4) {
	let t = createTournament({
		name: "Rank movement", format: "round-robin", sideRule: "alternate",
		teams: ["a", "b"].map((id, i) => ({ id, name: id, seed: i + 1, starRating: 3,
			players: rosterFromStar(3).map(p => ({ ...p, tier: "B" as const, id: `${id}-${p.lane}`, name: `${id}-${p.lane}` })),
		})),
		defaults: { format: "bo1", fearless: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false },
	});
	const template = t.matches[0];
	t.matches = [];
	for (let i = 0; i < rounds; i++) {
		const [blue, red] = t.teams;
		const series = createSeries({ ...t.defaults, blueTeam: blue.name, redTeam: red.name });
		series.games[0] = { ...series.games[0], id: `g${i}`, status: "complete", winner: "blue",
			recap: { durationMinutes: 30, mvp: null, biggestSwing: null,
				perPickIds: { blue: blue.players!.map(p => p.id!), red: red.players!.map(p => p.id!) },
				ratings: { blue: [i < 3 ? 7 : 1, 7, 7, 7, 7], red: [i < 3 ? 6 : 10, 6, 6, 6, 6] },
			},
		};
		t.matches.push({ ...template, id: `m${i}`, round: i + 1, isBye: false, feedsInto: null,
			blueTeamId: blue.id, redTeamId: red.id, series, winner: null });
		t = recordMatchWinner(t, `m${i}`, { teamId: blue.id, blueWins: 1, redWins: 0 });
	}
	return t;
}

function scopeFor(version: 1 | 2, rounds = 4): EventScope {
	const t = fixture(rounds);
	if (version === 2) return buildEventRecord([t], { id: "event", label: "Event" }).scopes[0];
	const stats = computeEventStats([t]);
	const identities = new Map(stats.players.map(p => [p.key, p]));
	return { id: "all", label: "Whole event", stats, checkpoints: t.eventCheckpoints!.map(c => {
		const at = computeEventStats([t], new Set(c.gameIds.map(id => `${t.id}:${id}`)));
		return { id: `${t.id}:${c.key}`, label: c.label, games: at.games,
			players: at.players.map(p => packEventPlayer(p, identities.get(p.key)!)) };
	}) };
}

function movements(scope: EventScope, point = "current", lane: Lane = "top") {
	const checkpoint = scope.checkpoints.find(c => c.id === point);
	return eventRankMovements(scope, lane, point,
		rankEventPlayers(checkpoint ? eventCheckpointPlayers(scope, checkpoint) : scope.stats.players, lane));
}

describe.each([1, 2] as const)("event rank movement (v%i)", version => {
	it("shows up/down in current standings when the last checkpoint contains the current games", () => {
		const scope = scopeFor(version);
		expect(scope.checkpoints.map(c => c.games)).toEqual([1, 2, 3, 4]);
		expect(rankEventPlayers(eventCheckpointPlayers(scope, scope.checkpoints[2]), "top").map(p => p.key)).toEqual(["a-top:top", "b-top:top"]);
		expect(rankEventPlayers(scope.stats.players, "top").map(p => p.key)).toEqual(["b-top:top", "a-top:top"]);
		expect(rankEventPlayers(eventCheckpointPlayers(scope, scope.checkpoints[3]), "top")).toEqual(rankEventPlayers(scope.stats.players, "top"));
		expect(Object.fromEntries(movements(scope))).toEqual({ "b-top:top": "↑1", "a-top:top": "↓1" });
	});
	it("compares a selected checkpoint with its predecessor", () => {
		const scope = scopeFor(version);
		expect(Object.fromEntries(movements(scope, scope.checkpoints[3].id))).toEqual({ "b-top:top": "↑1", "a-top:top": "↓1" });
	});
	it("uses the latest checkpoint while the next round is in progress", () => {
		const scope = scopeFor(version);
		scope.checkpoints.pop();
		expect(Object.fromEntries(movements(scope))).toEqual({ "b-top:top": "↑1", "a-top:top": "↓1" });
	});
	it("shows equal for unchanged ranks instead of searching back to an older rank change", () => {
		const scope = scopeFor(version, 5);
		expect([...movements(scope).values()]).toEqual(["—", "—"]);
	});
	it("compares ranks within the selected lane", () => {
		expect([...movements(scopeFor(version), "current", "jungle").values()]).toEqual(["—", "—"]);
	});
	it("shows qualification when players meet the rated-games threshold", () => {
		const scope = scopeFor(version, 3);
		expect([...movements(scope).values()]).toEqual(["Qualified", "Qualified"]);
	});
	it("shows no chip for the first checkpoint, first completed round or missing history", () => {
		const scope = scopeFor(version, 1);
		expect(movements(scope, scope.checkpoints[0].id).size).toBe(0);
		expect(movements(scope).size).toBe(0);
		scope.checkpoints = [];
		expect(movements(scope).size).toBe(0);
	});
	it("treats a stale checkpoint selection as current standings", () => {
		const scope = scopeFor(version);
		expect(Object.fromEntries(movements(scope, "removed-checkpoint"))).toEqual({ "b-top:top": "↑1", "a-top:top": "↓1" });
	});
});

it("shows New for a participant absent from the previous checkpoint", () => {
	const t = fixture();
	t.matches[3].series!.games[0].recap!.perPickIds!.blue[1] = "substitute";
	const scope = buildEventRecord([t], { id: "event", label: "Event" }).scopes[0];
	expect(movements(scope, "current", "jungle").get("substitute:jungle")).toBe("New");
});

it("shows qualification before numeric movement", () => {
	const t = fixture(3);
	const ratings = t.matches[2].series!.games[0].recap!.ratings!;
	ratings.blue[0] = 1;
	ratings.red[0] = 10;
	const scope = buildEventRecord([t], { id: "event", label: "Event" }).scopes[0];
	expect(rankEventPlayers(scope.stats.players, "top").map(p => p.key)).toEqual(["b-top:top", "a-top:top"]);
	expect(Object.fromEntries(movements(scope))).toEqual({ "b-top:top": "Qualified", "a-top:top": "Qualified" });
});

it("keeps exact score ties stable by identity", () => {
	const scope = scopeFor(1) as EventScopeV1;
	const a = scope.stats.players.find(p => p.key === "a-top:top")!;
	const b = scope.stats.players.find(p => p.key === "b-top:top")!;
	const tied = [{ ...a, ...b, key: a.key, playerId: a.playerId }, b];
	scope.stats.players = tied;
	scope.checkpoints = [{ id: "tie", label: "Tie", games: 3, players: tied.map(p => packEventPlayer(p, p)) }];
	expect([...movements(scope).values()]).toEqual(["—", "—"]);
});
