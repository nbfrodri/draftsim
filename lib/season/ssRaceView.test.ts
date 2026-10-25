import { describe, expect, it } from "vitest";
import { gamesProgress, remainingReasons, seatLeaderHint } from "./ssRaceView";
import type { SSRacePlayer } from "./ssRace";

const row = (o: Partial<SSRacePlayer> & { name?: string } = {}): SSRacePlayer => ({
	player: { id: "p", name: o.name ?? "Ace" } as SSRacePlayer["player"], team: {} as SSRacePlayer["team"], stats: null,
	games: 4, requiredGames: 8, score: 6.5, eligible: false, reasons: ["Needs 8 rated games (4 recorded)"], chance: null,
	projected: false, gap: null, carry: false, ...o,
});

describe("gamesProgress", () => {
	it("reports progress while no estimate exists", () => {
		expect(gamesProgress(row())).toEqual({ games: 4, required: 8, percent: 50 });
	});
	it("is absent once an estimate exists or the threshold is met", () => {
		expect(gamesProgress(row({ chance: 0 }))).toBeNull();
		expect(gamesProgress(row({ games: 8, chance: null }))).toBeNull();
		expect(gamesProgress(row({ eligible: true }))).toBeNull();
	});
	it("treats zero recorded games as 0%, not missing", () => {
		expect(gamesProgress(row({ games: 0 }))?.percent).toBe(0);
	});
});

describe("remainingReasons", () => {
	it("drops the games reason only when progress is shown", () => {
		const r = row({ reasons: ["Needs 8 rated games (4 recorded)", "No rated participation in the latest domestic split"] });
		expect(remainingReasons(r, true)).toEqual(["No rated participation in the latest domestic split"]);
		expect(remainingReasons(r, false)).toHaveLength(2);
	});
});

describe("seatLeaderHint", () => {
	it("returns the first contender with games still needed", () => {
		expect(seatLeaderHint([row({ name: "Ace" }), row({ name: "B" })])).toEqual({ name: "Ace", score: 6.5, gamesNeeded: 4 });
	});
	it("keeps unknown score null and handles empty lists", () => {
		expect(seatLeaderHint([row({ score: null, games: 0 })])?.score).toBeNull();
		expect(seatLeaderHint([])).toBeNull();
	});
});
