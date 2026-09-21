// International MVP — must be from the winning team, judged on tournament-wide
// average (not just the final), even when a loser played better in the final.

import { describe, expect, it } from "vitest";
import {
  computeChampionTeamTournamentMvp,
  computeFinalsMvp,
  computeTournamentAwards,
} from "./awards";
import type { TournamentState } from "./tournament";

const recap = {
  durationMinutes: 30,
  mvp: null,
  biggestSwing: null,
  ratings: { blue: [9, 6, 6, 6, 6], red: [10, 10, 10, 10, 10] },
  perPickIds: {
    blue: ["w-top", "w-jg", "w-mid", "w-bot", "w-sup"],
    red: ["l-top", "l-jg", "l-mid", "l-bot", "l-sup"],
  },
  perPickNames: {
    blue: ["WTop", "WJg", "WMid", "WBot", "WSup"],
    red: ["LTop", "LJg", "LMid", "LBot", "LSup"],
  },
};

function finalOnly(): TournamentState {
  return {
    status: "complete",
    format: "single-elim",
    teams: [
      { id: "W", name: "Winners", seed: 1, starRating: 3 },
      { id: "L", name: "Losers", seed: 2, starRating: 3 },
    ],
    matches: [
      {
        id: "gf",
        round: 1,
        bracket: "grand-final",
        blueTeamId: "W",
        redTeamId: "L",
        feedsInto: null,
        series: {
          games: [
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap,
            },
          ],
        },
        winner: { teamId: "W", blueWins: 1, redWins: 0 },
      },
    ],
  } as unknown as TournamentState;
}

function tournamentWithGroupAndFinal(): TournamentState {
  const groupRecap = {
    ...recap,
    ratings: { blue: [8.5, 7, 7, 7, 7], red: [6, 6, 6, 6, 6] },
    perPickIds: recap.perPickIds,
    perPickNames: recap.perPickNames,
  };
  return {
    status: "complete",
    format: "single-elim",
    teams: [
      { id: "W", name: "Winners", seed: 1, starRating: 3 },
      { id: "L", name: "Losers", seed: 2, starRating: 3 },
    ],
    matches: [
      {
        id: "sf",
        round: 1,
        blueTeamId: "W",
        redTeamId: "L",
        feedsInto: "gf",
        series: {
          games: [
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap: groupRecap,
            },
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap: groupRecap,
            },
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap: groupRecap,
            },
          ],
        },
        winner: { teamId: "W", blueWins: 2, redWins: 0 },
      },
      {
        id: "gf",
        round: 2,
        bracket: "grand-final",
        blueTeamId: "W",
        redTeamId: "L",
        feedsInto: null,
        series: {
          games: [
            {
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap,
            },
          ],
        },
        winner: { teamId: "W", blueWins: 1, redWins: 0 },
      },
    ],
  } as unknown as TournamentState;
}

describe("computeFinalsMvp", () => {
  it("picks the best player FROM THE WINNING TEAM in the final", () => {
    const mvp = computeFinalsMvp(finalOnly());
    expect(mvp).not.toBeNull();
    expect(mvp!.teamId).toBe("W");
    expect(mvp!.playerId).toBe("w-top");
    expect(mvp!.avgRating).toBe(9);
  });
});

describe("computeChampionTeamTournamentMvp", () => {
  it("picks the best average-rated player on the champion across the whole event", () => {
    const mvp = computeChampionTeamTournamentMvp(tournamentWithGroupAndFinal());
    expect(mvp).not.toBeNull();
    expect(mvp!.teamId).toBe("W");
    expect(mvp!.playerId).toBe("w-top");
    // (8.5 + 8.5 + 8.5 + 9) / 4 = 8.6
    expect(mvp!.avgRating).toBe(8.6);
    expect(mvp!.gamesPlayed).toBe(4);
  });

  it("returns null when nothing is decided", () => {
    const t = { teams: [], matches: [] } as unknown as TournamentState;
    expect(computeChampionTeamTournamentMvp(t)).toBeNull();
  });
});

describe("season tournament MVP agreement", () => {
  it("uses the season international champion MVP instead of the general rating leader", () => {
    const t = { ...tournamentWithGroupAndFinal(), seasonStageKind: "international" as const };
    expect(computeTournamentAwards(t).mvp).toEqual(computeChampionTeamTournamentMvp(t));
    expect(computeTournamentAwards(t).mvp?.teamId).toBe("W");
  });
  it("uses finals MVP for domestic splits", () => {
    const t = { ...tournamentWithGroupAndFinal(), seasonStageKind: "split" as const };
    expect(computeTournamentAwards(t).mvp).toEqual(computeFinalsMvp(t));
  });
  it("does not award a season tournament MVP before a champion exists", () => {
    const t = { ...finalOnly(), status: "in-progress" as const, seasonStageKind: "international" as const };
    expect(computeTournamentAwards(t).mvp).toBeNull();
  });
});
