import { describe, expect, it } from "vitest";
import { computeNotableGames } from "./notableGames";
import { createTournament } from "./tournament";
import { createSeries } from "./series";
import type { GameRecap } from "./types";

function fixture(recaps: GameRecap[]) {
  const tournament = createTournament({ name: "Highlights", format: "single-elim",
    teams: [{ id: "a", name: "Alpha", seed: 1 }, { id: "b", name: "Beta", seed: 2 }],
    defaults: { format: "bo3", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false } });
  const series = createSeries({ ...tournament.defaults, blueTeam: "Alpha", redTeam: "Beta" });
  series.games = recaps.map((recap, i) => ({ ...series.games[0], id: `game-${i}`, gameNumber: i + 1,
    blueTeam: i % 2 ? "Beta" : "Alpha", redTeam: i % 2 ? "Alpha" : "Beta",
    status: "complete", winner: i % 2 ? "red" : "blue", recap }));
  tournament.matches[0].series = series;
  return tournament;
}
const recap = (extra: Partial<GameRecap> = {}): GameRecap => ({ durationMinutes: 30, mvp: null, biggestSwing: null, ...extra });

describe("notable game metrics", () => {
  it("selects independent extremes and preserves side-swapped winners and replay indices", () => {
    const result = computeNotableGames(fixture([
      recap({ blueKills: 20, redKills: 10, biggestSwing: { minute: 10, side: "blue", type: "fight", description: "Fight", probDelta: .2 } }),
      recap({ blueKills: 24, redKills: 25, biggestSwing: { minute: 20, side: "red", type: "fight", description: "Fight", probDelta: -.4 } }),
    ]));
    expect(result.mostKills).toMatchObject({ metric: 49, gameIdx: 1, winnerLabel: "Alpha", blueTeamLabel: "Beta" });
    expect(result.closestKills).toMatchObject({ metric: 1, gameIdx: 1 });
    expect(result.biggestSwing).toMatchObject({ metric: .4, gameIdx: 1 });
  });
  it("does not turn absent legacy data into zero", () => {
    const result = computeNotableGames(fixture([recap()]));
    expect(result.mostKills).toBeNull(); expect(result.closestKills).toBeNull(); expect(result.biggestSwing).toBeNull();
    expect(result.fastest).not.toBeNull();
  });
  it("accepts observed zero kills and stable first-encounter ties", () => {
    const result = computeNotableGames(fixture([recap({ blueKills: 0, redKills: 0 }), recap({ blueKills: 0, redKills: 0 })]));
    expect(result.mostKills).toMatchObject({ metric: 0, gameIdx: 0 });
    expect(result.closestKills).toMatchObject({ metric: 0, gameIdx: 0 });
  });
  it("uses complete KDA as fallback but skips partial or invalid totals", () => {
    const rows = Array.from({ length: 5 }, () => ({ k: 2, d: 1, a: 3 }));
    const result = computeNotableGames(fixture([
      recap({ perPickKDA: { blue: rows.slice(1), red: rows } }),
      recap({ perPickKDA: { blue: rows, red: rows } }),
      recap({ blueKills: NaN, redKills: 90 }),
    ]));
    expect(result.mostKills).toMatchObject({ metric: 20, gameIdx: 1 });
  });
  it("ranks peak absolute gold lead, including a losing side, without fabricating missing data", () => {
    const result = computeNotableGames(fixture([
      recap({ goldLeadTimeline: [{ minute: 10, goldLead: 7000 }, { minute: 20, goldLead: -9000 }] }),
      recap({ goldLeadTimeline: [{ minute: 10, goldLead: 8000 }] }),
      recap(),
    ]));
    expect(result.largestGoldLead).toMatchObject({ metric: 9000, gameIdx: 0 });
    expect(computeNotableGames(fixture([recap()])).largestGoldLead).toBeNull();
    expect(computeNotableGames(fixture([recap({ goldLeadTimeline: [{ minute: 10, goldLead: 0 }] })])).largestGoldLead?.metric).toBe(0);
  });
  it("excludes unfinished games from highlights", () => {
    const tournament = fixture([recap({ blueKills: 50, redKills: 50 })]);
    tournament.matches[0].series!.games[0].winner = null;
    const result = computeNotableGames(tournament);
    expect(result.any).toBe(false); expect(result.mostKills).toBeNull();
  });
});
