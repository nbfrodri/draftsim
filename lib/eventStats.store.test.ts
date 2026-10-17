import { expect, it } from "vitest";
import { useDraftStore } from "../store/draftStore";
import { makeAuditSeason } from "./auditFixtures";
import { createSeries } from "./series";
import { computeEventStats } from "./eventStats";

it("publishes each manual game's stats to its season before the series finishes", () => {
	const season = makeAuditSeason("Live game stats");
	const tournament = Object.values(season.tournaments)[0];
	const m = tournament.matches.find(m => m.blueTeamId && m.redTeamId)!;
	const blue = tournament.teams.find(t => t.id === m.blueTeamId)!;
	const red = tournament.teams.find(t => t.id === m.redTeamId)!;
	const series = createSeries({ format: "bo3", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: blue.name, redTeam: red.name });
	series.status = "between-games"; series.games[0].status = "complete";
	tournament.activeMatchId = m.id; m.series = series; m.format = "bo3";
	useDraftStore.setState({ season, tournament, series, champions: [], playerForms: {}, realities: [], activeRealityId: null });
	useDraftStore.getState().declareWinner("blue", { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: blue.players!.map(p => p.id!), red: red.players!.map(p => p.id!) }, ratings: { blue: [8, 8, 8, 8, 8], red: [5, 5, 5, 5, 5] } });
	const state = useDraftStore.getState();
	expect(state.series!.status).toBe("between-games");
	expect(state.tournament!.matches.find(x => x.id === m.id)!.winner).toBeNull();
	expect(computeEventStats([state.tournament!]).games).toBe(1);
	expect(computeEventStats([state.season!.tournaments[tournament.id]]).players[0].games).toBe(1);
	expect(state.tournament!.eventCheckpoints).toBeUndefined();
	expect(state.season!.ssReviews).toBeUndefined();
});
