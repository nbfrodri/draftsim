import { describe, expect, it } from "vitest";
import { seriesTeamPlayerSummaries } from "./seriesPlayerSummaries";
import { roleGaps } from "./roleGap";
import type { GameDraft, Roster } from "./types";

function game(swapped: boolean): GameDraft {
  return { id: swapped ? "second" : "first", status: "complete", winner: "red",
    blueTeam: swapped ? "Beta" : "Alpha", redTeam: swapped ? "Alpha" : "Beta",
    recap: { ratings: { blue: swapped ? [5.04, 0, 0, 0, 0] : [7, 0, 0, 0, 0], red: swapped ? [7, 0, 0, 0, 0] : [5.04, 0, 0, 0, 0] },
      perPickIds: { blue: [swapped ? "beta" : "alpha"], red: [swapped ? "alpha" : "beta"] },
      perPickNames: { blue: [swapped ? "B" : "A"], red: [swapped ? "A" : "B"] } },
  } as unknown as GameDraft;
}

describe("series role-gap evidence", () => {
  it("follows swapped sides and recorded identity even when there is no KDA", () => {
    const games = [game(false), game(true)];
    const roster = [{ id: "replacement", name: "New player" }] as Roster;
    const alpha = seriesTeamPlayerSummaries(games, "Alpha", roster)!;
    const beta = seriesTeamPlayerSummaries(games, "Beta")!;
    expect(alpha[0]).toMatchObject({ name: "A", playerId: "alpha", rawAvgRating: 7 });
    expect(beta[0]).toMatchObject({ name: "B", playerId: "beta", rawAvgRating: 5.04 });
    // Displayed 7.0 - 5.0 must not create a false 2.0 role gap.
    expect(roleGaps(alpha.map(p => p.rawAvgRating), beta.map(p => p.rawAvgRating))).toEqual([]);
    games[1].recap!.ratings!.red[0] = 8;
    const improved = seriesTeamPlayerSummaries(games, "Alpha")!;
    expect(roleGaps(improved.map(p => p.rawAvgRating), beta.map(p => p.rawAvgRating))[0])
      .toMatchObject({ lane: "top", side: "blue", diff: 2.5 });
  });

  it("does not treat zero, NaN or Infinity as recorded ratings", () => {
    const bad = game(false);
    bad.recap!.ratings!.blue = [0, NaN, Infinity, -1, 0];
    expect(seriesTeamPlayerSummaries([bad], "Alpha")).toBeNull();
  });
});
