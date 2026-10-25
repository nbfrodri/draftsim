import { expect, it } from "vitest";
import { useDraftStore } from "../store/draftStore";
import { makeAuditSeason } from "./auditFixtures";
import { createSeries } from "./series";

it("applies each manual game's ratings to player form exactly once through series completion", () => {
  const season = makeAuditSeason("Form once");
  const tournament = Object.values(season.tournaments)[0];
  const m = tournament.matches.find((x) => x.blueTeamId && x.redTeamId)!;
  const blue = tournament.teams.find((t) => t.id === m.blueTeamId)!;
  const red = tournament.teams.find((t) => t.id === m.redTeamId)!;
  const series = createSeries({
    format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null,
    fearless: false, timerEnabled: false, blueTeam: blue.name, redTeam: red.name,
  });
  series.status = "between-games";
  series.games[0].status = "complete";
  tournament.activeMatchId = m.id;
  m.series = series;
  m.format = "bo1";
  useDraftStore.setState({ season, tournament, series, champions: [], playerForms: {}, realities: [], activeRealityId: null });
  useDraftStore.getState().declareWinner("blue", {
    durationMinutes: 30, mvp: null, biggestSwing: null,
    perPickIds: { blue: blue.players!.map((p) => p.id!), red: red.players!.map((p) => p.id!) },
    ratings: { blue: [9, 9, 9, 9, 9], red: [2, 2, 2, 2, 2] },
  });
  const afterGame = { ...useDraftStore.getState().playerForms };
  expect(afterGame[`${blue.id}:top`]).toBeGreaterThan(0);
  useDraftStore.getState().finishMatch();
  expect(useDraftStore.getState().playerForms).toEqual(afterGame);
});
