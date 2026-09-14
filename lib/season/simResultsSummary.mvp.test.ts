import { describe, expect, it } from "vitest";
import { buildIntlResultEntry, collectSimResultUpdates } from "./simResultsSummary";
import { computeSeasonIntlMvps } from "./stats";
import type { InternationalId, SeasonState } from "./types";

function eventSeason(event: InternationalId): SeasonState {
  const recap = {
    ratings: { blue: [9, 6, 6, 6, 6], red: [10, 10, 10, 10, 10] },
    perPickIds: {
      blue: ["w-top", "w-jg", "w-mid", "w-bot", "w-sup"],
      red: ["l-top", "l-jg", "l-mid", "l-bot", "l-sup"],
    },
    perPickNames: {
      blue: ["WinnerTop", "WinnerJg", "WinnerMid", "WinnerBot", "WinnerSup"],
      red: ["LoserTop", "LoserJg", "LoserMid", "LoserBot", "LoserSup"],
    },
  };
  const teams = [
    { id: "W", name: "Winners", leagueId: "LCK", seed: 1, color: "#fff", iconKey: "shield", players: [] },
    { id: "L", name: "Losers", leagueId: "LPL", seed: 2, color: "#000", iconKey: "shield", players: [] },
  ];
  return {
    id: "season-4", name: "Year 4", status: "in-progress",
    franchise: { id: "reality", name: "Test", year: 4 },
    config: {}, teams, splitResults: {},
    intlResults: { [event]: ["W", "L"] },
    phases: [{ kind: "international", event, tournamentIds: ["main"] }],
    tournaments: {
      main: {
        id: "main", name: event, status: "complete", format: "single-elim", teams,
        matches: [{
          id: "final", round: 1, bracket: "grand-final", feedsInto: null,
          blueTeamId: "W", redTeamId: "L",
          winner: { teamId: "W", blueWins: 3, redWins: 0 },
          series: { games: Array.from({ length: 3 }, () => ({
            blueTeam: "Winners", redTeam: "Losers", status: "complete", winner: "blue", recap,
          })) },
        }],
      },
    },
  } as unknown as SeasonState;
}

describe("international MVP in live results", () => {
  it.each(["first-stand", "msi", "worlds", "global-cup"] as const)(
    "records the %s winner's tournament MVP even when the runner-up has higher ratings",
    (event) => {
      const season = eventSeason(event);
      const result = buildIntlResultEntry(season, event);
      expect(result.mvp).toMatchObject({
        teamId: "W", teamName: "Winners", playerId: "w-top", playerName: "WinnerTop",
        lane: "top", avgRating: 9, gamesPlayed: 3,
      });
      expect(result.mvp).toEqual(computeSeasonIntlMvps(season)[0].mvp);
      const game = season.tournaments.main.matches[0].series!.games[0];
      game.recap!.perPickNames!.blue[0] = "Changed later";
      expect(result.mvp!.playerName).toBe("WinnerTop");
    },
  );

  it("keeps the MVP in an emitted live result and emits the event only once", () => {
    const season = eventSeason("msi");
    const seen = new Set<string>();
    const entry = collectSimResultUpdates(season, seen).find((result) => result.kind === "intl");
    expect(entry?.kind === "intl" && entry.mvp?.playerId).toBe("w-top");
    expect(collectSimResultUpdates(season, seen)).toEqual([]);
  });

  it("does not invent an MVP for manual results without rated games", () => {
    const season = eventSeason("worlds");
    season.tournaments.main.matches[0].series!.games = [];
    expect(buildIntlResultEntry(season, "worlds").mvp).toBeUndefined();
  });

  it("does not use a play-in winner when the main champion has no statistics", () => {
    const season = eventSeason("worlds");
    season.intlResults.worlds = ["L", "W"];
    expect(buildIntlResultEntry(season, "worlds").mvp).toBeUndefined();
  });

  it("does not copy another event's MVP into an unplayed event", () => {
    const season = eventSeason("first-stand");
    expect(buildIntlResultEntry(season, "global-cup").mvp).toBeUndefined();
    expect(computeSeasonIntlMvps(season, "msi")).toEqual([]);
  });
});
