import { describe, expect, it } from "vitest";
import type { Player } from "./types";
import type { SeasonState } from "./season/types";
import type { TournamentState } from "./tournament";
import { poolSeriesSynergies, restoreSeriesSynergies } from "./seriesSynergyPool";

const player = (id: string, synergy?: Record<string, number>): Player => ({ id, name: id, lane: "top", tier: "A", ...(synergy ? { synergy } : {}) } as Player);
const tournament = (id: string, rosters: [Player[], Player[]][]): TournamentState => ({
	id, status: "in-progress",
	matches: rosters.map(([blue, red], i) => ({ id: `${id}-m${i}`, series: { bluePlayers: blue, redPlayers: red } })),
} as unknown as TournamentState);
const season = (...tournaments: TournamentState[]) => ({ id: "s", tournaments: Object.fromEntries(tournaments.map(t => [t.id, t])) } as unknown as SeasonState);

describe("series synergy pool", () => {
	it("stores each distinct synergy once and restores every match exactly", () => {
		const a1 = { "1": 3, "2": 1 }, a2 = { "1": 4 };
		const s = season(
			tournament("t1", [[[player("a", a1), player("b", { "9": 2 })], [player("c")]], [[player("a", { ...a1 })], [player("c")]]]),
			tournament("t2", [[[player("a", a2)], [player("b", { "9": 2 })]]]),
		);
		const pooled = poolSeriesSynergies(s);
		expect(Object.keys(pooled.seriesSynergyPool ?? {})).toHaveLength(3);
		const first = pooled.tournaments.t1.matches[0].series!.bluePlayers![0];
		expect(first.synergy).toBeUndefined();
		expect(first.name).toBe("a");
		expect(restoreSeriesSynergies(pooled)).toEqual(s);
	});

	it("leaves seasons without series synergy and unpooled saves untouched", () => {
		const s = season(tournament("t1", [[[player("a")], [player("b")]]]));
		expect(poolSeriesSynergies(s)).toBe(s);
		expect(restoreSeriesSynergies(s)).toBe(s);
	});

	it("never resolves a missing pool entry to another player's synergy", () => {
		const pooled = poolSeriesSynergies(season(tournament("t1", [[[player("a", { "1": 1 })], [player("b")]]])));
		const broken = { ...pooled, seriesSynergyPool: {} };
		expect(() => restoreSeriesSynergies(broken)).toThrow("synergy");
	});
});
