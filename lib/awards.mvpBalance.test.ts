// MVP balancing — role-relative scoring and decisive-match weighting.

import { describe, expect, it } from "vitest";
import {
  computeChampionTeamTournamentMvp,
  computeFinalsMvp,
  computeTournamentAwards,
} from "./awards";
import type { TournamentState, TournamentMatch, TournamentTeam } from "./tournament";
import type { GameDraft, GameRecap, SeriesState } from "./types";

function makeTeam(id: string, name: string, seed: number): TournamentTeam {
  return { id, name, seed, starRating: 3 };
}

function makeRecap(blueRatings: number[], redRatings: number[]): GameRecap {
  return {
    durationMinutes: 32,
    mvp: null,
    biggestSwing: null,
    ratings: { blue: blueRatings, red: redRatings },
  };
}

function makeGame(
  gameNumber: number,
  blueTeam: string,
  redTeam: string,
  winner: "blue" | "red",
  recap: GameRecap,
): GameDraft {
  return {
    id: `g-${gameNumber}`,
    gameNumber,
    blueTeam,
    redTeam,
    blueBans: [],
    redBans: [],
    bluePicks: [],
    redPicks: [],
    blueRoles: [null, null, null, null, null],
    redRoles: [null, null, null, null, null],
    actionIndex: 0,
    status: "complete",
    winner,
    recap,
  };
}

function makeSeries(blueTeam: string, redTeam: string, games: GameDraft[]): SeriesState {
  return {
    id: `series-${blueTeam}-${redTeam}`,
    format: "bo3",
    fearless: false,
    timerEnabled: false,
    blueTeam,
    redTeam,
    games,
    status: "complete",
    winner: "blue",
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
  };
}

function makeMatch(
  id: string,
  round: number,
  blueTeamId: string,
  redTeamId: string,
  winnerTeamId: string,
  series: SeriesState,
  feedsInto: string | null = null,
): TournamentMatch {
  const blueWins = winnerTeamId === blueTeamId ? 2 : 0;
  const redWins = winnerTeamId === redTeamId ? 2 : 0;
  return {
    id,
    round,
    blueTeamId,
    redTeamId,
    format: "bo3",
    fearless: false,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: "normal",
    series,
    winner: { teamId: winnerTeamId, blueWins, redWins },
    feedsInto: feedsInto ? { matchId: feedsInto, slot: "blue" } : null,
  };
}

function baseTournament(matches: TournamentMatch[]): TournamentState {
  return {
    id: "balance-test",
    name: "Balance Test",
    format: "single-elim",
    status: "complete",
    teams: [
      makeTeam("t-a", "Alpha", 1),
      makeTeam("t-b", "Beta", 2),
      makeTeam("t-c", "Gamma", 3),
      makeTeam("t-d", "Delta", 4),
    ],
    matches,
    fearlessConfig: { perSeries: false, perTeam: false, global: false },
    teamPickHistory: {},
    globalPickHistory: [],
    defaults: {
      format: "bo3",
      fearless: false,
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "normal",
      timerEnabled: false,
    },
    createdAt: 0,
    updatedAt: 0,
    activeMatchId: null,
  };
}

describe("role-relative tournament MVP", () => {
  it("picks top over jungle when top leads lane-relative despite lower absolute avg", () => {
    // Four teams, three games each for eligible players.
    // Jungle pool averages ~7.5; Alpha jungle at 7.7 is only +0.2 above lane mean.
    // Top pool averages ~6.2; Alpha top at 7.0 is +0.8 above lane mean → MVP.
    const groupRatings = (
      aTop: number,
      aJg: number,
      bTop: number,
      bJg: number,
      cTop: number,
      cJg: number,
      dTop: number,
      dJg: number,
    ) =>
      makeRecap(
        [aTop, aJg, 6.5, 6.5, 6.5],
        [bTop, bJg, 6.5, 6.5, 6.5],
      );

    const r1g1 = makeGame(1, "Alpha", "Beta", "blue", groupRatings(7, 7.7, 6, 7.5, 6.2, 7.6, 6.1, 7.4));
    const r1g2 = makeGame(2, "Alpha", "Beta", "blue", groupRatings(7, 7.7, 6, 7.5, 6.2, 7.6, 6.1, 7.4));
    const r1g3 = makeGame(3, "Alpha", "Beta", "blue", groupRatings(7, 7.7, 6, 7.5, 6.2, 7.6, 6.1, 7.4));

    const r2g1 = makeGame(1, "Gamma", "Delta", "blue", groupRatings(6.2, 7.6, 6, 7.5, 6.2, 7.6, 6.1, 7.4));
    const r2g2 = makeGame(2, "Gamma", "Delta", "blue", groupRatings(6.2, 7.6, 6, 7.5, 6.2, 7.6, 6.1, 7.4));
    const r2g3 = makeGame(3, "Gamma", "Delta", "blue", groupRatings(6.2, 7.6, 6, 7.5, 6.2, 7.6, 6.1, 7.4));

    const sfg1 = makeGame(1, "Alpha", "Gamma", "blue", groupRatings(7, 7.7, 6.2, 7.6, 6.2, 7.6, 6.1, 7.4));
    const sfg2 = makeGame(2, "Alpha", "Gamma", "blue", groupRatings(7, 7.7, 6.2, 7.6, 6.2, 7.6, 6.1, 7.4));
    const sfg3 = makeGame(3, "Alpha", "Gamma", "blue", groupRatings(7, 7.7, 6.2, 7.6, 6.2, 7.6, 6.1, 7.4));

    const m1 = makeMatch("m1", 1, "t-a", "t-b", "t-a", makeSeries("Alpha", "Beta", [r1g1, r1g2, r1g3]), "m3");
    const m2 = makeMatch("m2", 1, "t-c", "t-d", "t-c", makeSeries("Gamma", "Delta", [r2g1, r2g2, r2g3]), "m3");
    const m3 = makeMatch("m3", 2, "t-a", "t-c", "t-a", makeSeries("Alpha", "Gamma", [sfg1, sfg2, sfg3]));

    const awards = computeTournamentAwards(baseTournament([m1, m2, m3]));
    expect(awards.mvp).not.toBeNull();
    expect(awards.mvp!.teamId).toBe("t-a");
    expect(awards.mvp!.lane).toBe("top");
    expect(awards.mvp!.avgRating).toBe(7);
  });

  it("distributes MVP lanes less toward jungle/mid than absolute-only would", () => {
    const scenarios: Array<{ topRel: number; jgRel: number; midRel: number }> = [
      { topRel: 0.9, jgRel: 0.15, midRel: 0.1 },
      { topRel: 0.85, jgRel: 0.2, midRel: 0.05 },
      { topRel: 0.95, jgRel: 0.1, midRel: 0.2 },
    ];
    let topWins = 0;
    for (const { topRel, jgRel, midRel } of scenarios) {
      const jgAbs = 7.6;
      const midAbs = 7.5;
      const topAbs = 6.8 + topRel * 0.2;
      const recap = (t: number, j: number, m: number) =>
        makeRecap([t, j, m, 6.5, 6.5], [6, 7.4, 7.3, 6.5, 6.5]);

      const games = [1, 2, 3].map((n) =>
        makeGame(
          n,
          "Alpha",
          "Beta",
          "blue",
          recap(topAbs, jgAbs + jgRel * 0.1, midAbs + midRel * 0.1),
        ),
      );
      const t = baseTournament([
        makeMatch("m1", 1, "t-a", "t-b", "t-a", makeSeries("Alpha", "Beta", games)),
      ]);
      const mvp = computeTournamentAwards(t).mvp;
      if (mvp?.lane === "top") topWins++;
    }
    expect(topWins).toBeGreaterThanOrEqual(2);
  });
});

describe("decisive-match weighting", () => {
  it("finals MVP favors a final-series carry over a steady group-stage jungler", () => {
    const groupRecap = {
      durationMinutes: 30,
      mvp: null,
      biggestSwing: null,
      ratings: { blue: [7, 7.4, 7, 7, 7], red: [6, 6, 6, 6, 6] },
      perPickIds: {
        blue: ["w-top", "w-jg", "w-mid", "w-bot", "w-sup"],
        red: ["l-top", "l-jg", "l-mid", "l-bot", "l-sup"],
      },
      perPickNames: {
        blue: ["WTop", "WJg", "WMid", "WBot", "WSup"],
        red: ["LTop", "LJg", "LMid", "LBot", "LSup"],
      },
    };
    const finalRecap = {
      ...groupRecap,
      ratings: { blue: [9.5, 7.2, 7, 7, 7], red: [6, 6, 6, 6, 6] },
    };

    const tournament = {
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
          feedsInto: { matchId: "gf", slot: "blue" },
          series: {
            games: [1, 2, 3].map((n) => ({
              gameNumber: n,
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap: groupRecap,
            })),
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
                gameNumber: 1,
                blueTeam: "Winners",
                redTeam: "Losers",
                status: "complete",
                winner: "blue",
                recap: finalRecap,
              },
              {
                gameNumber: 2,
                blueTeam: "Winners",
                redTeam: "Losers",
                status: "complete",
                winner: "blue",
                recap: finalRecap,
              },
            ],
          },
          winner: { teamId: "W", blueWins: 2, redWins: 0 },
        },
      ],
    } as unknown as TournamentState;

    const mvp = computeFinalsMvp(tournament);
    expect(mvp).not.toBeNull();
    expect(mvp!.lane).toBe("top");
    expect(mvp!.playerId).toBe("w-top");
  });

  it("intl MVP weights the final heavily — monster final beats steady jungler", () => {
    const ids = {
      blue: ["w-top", "w-jg", "w-mid", "w-bot", "w-sup"],
      red: ["l-top", "l-jg", "l-mid", "l-bot", "l-sup"],
    };
    const names = {
      blue: ["WTop", "WJg", "WMid", "WBot", "WSup"],
      red: ["LTop", "LJg", "LMid", "LBot", "LSup"],
    };
    const groupRecap = {
      durationMinutes: 30,
      mvp: null,
      biggestSwing: null,
      ratings: { blue: [7, 7.5, 7, 7, 7], red: [6, 6, 6, 6, 6] },
      perPickIds: ids,
      perPickNames: names,
    };
    const finalRecap = {
      ...groupRecap,
      ratings: { blue: [10, 7.3, 7, 7, 7], red: [6, 6, 6, 6, 6] },
    };

    const tournament = {
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
          feedsInto: { matchId: "gf", slot: "blue" },
          series: {
            games: [1, 2, 3].map((n) => ({
              gameNumber: n,
              blueTeam: "Winners",
              redTeam: "Losers",
              status: "complete",
              winner: "blue",
              recap: groupRecap,
            })),
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
                gameNumber: 1,
                blueTeam: "Winners",
                redTeam: "Losers",
                status: "complete",
                winner: "blue",
                recap: finalRecap,
              },
            ],
          },
          winner: { teamId: "W", blueWins: 1, redWins: 0 },
        },
      ],
    } as unknown as TournamentState;

    const mvp = computeChampionTeamTournamentMvp(tournament);
    expect(mvp).not.toBeNull();
    expect(mvp!.lane).toBe("top");
    expect(mvp!.playerId).toBe("w-top");
  });
});
