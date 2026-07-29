import { describe, expect, it } from "vitest";

import type { SeasonHistoryEntry } from "./history";
import {
  careerArchivedTeamH2H,
  liveAllTimeTeamH2H,
  liveTeamH2H,
  liveTeamSeriesResults,
  liveTeamWinRates,
  liveTitleCounts,
  liveTitleHighlights,
} from "./teamCard";
import type { SeasonState, SeasonTeam } from "./types";

function team(id: string, leagueId: SeasonTeam["leagueId"] = "LCK"): SeasonTeam {
  return {
    id,
    name: `Team ${id}`,
    leagueId,
    color: "#fff",
    iconKey: "shield",
    players: [],
    personalityId: "",
  };
}

function namedTeam(
  id: string,
  name: string,
  leagueId: SeasonTeam["leagueId"] = "LCK",
): SeasonTeam {
  return { ...team(id, leagueId), name };
}

function fabricate(parts: Partial<SeasonState>): SeasonState {
  return {
    teams: [],
    splitResults: {},
    intlResults: {},
    phases: [],
    tournaments: {},
    ...parts,
  } as unknown as SeasonState;
}

function hallEntry(
  id: string,
  archivedAt: number,
  headToHead: NonNullable<SeasonHistoryEntry["headToHead"]>,
): SeasonHistoryEntry {
  return {
    id,
    archivedAt,
    name: id,
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    headToHead,
  };
}

describe("live team card metrics", () => {
  it("walks phases for series W-L and last-N", () => {
    const season = fabricate({
      teams: [team("A"), team("B")],
      phases: [
        {
          kind: "split",
          split: "winter",
          label: "Winter",
          tournamentIds: ["t1"],
          status: "complete",
        },
        {
          kind: "international",
          event: "first-stand",
          label: "First Stand",
          tournamentIds: ["t2"],
          status: "in-progress",
        },
      ],
      tournaments: {
        t1: {
          id: "t1",
          matches: [
            {
              id: "m1",
              round: 1,
              blueTeamId: "A",
              redTeamId: "B",
              winner: { teamId: "A", blueWins: 1, redWins: 0 },
              isBye: false,
            },
            {
              id: "m2",
              round: 2,
              blueTeamId: "A",
              redTeamId: "B",
              winner: { teamId: "B", blueWins: 0, redWins: 1 },
              isBye: false,
            },
          ],
        },
        t2: {
          id: "t2",
          matches: [
            {
              id: "m3",
              round: 1,
              blueTeamId: "A",
              redTeamId: "B",
              winner: { teamId: "A", blueWins: 2, redWins: 1 },
              isBye: false,
            },
          ],
        },
      },
    } as unknown as Partial<SeasonState>);

    expect(liveTeamSeriesResults(season, "A")).toEqual(["W", "L", "W"]);
    const wr = liveTeamWinRates(season, "A");
    expect(wr.overall).toEqual({ wins: 2, losses: 1, winRate: 2 / 3 });
    expect(wr.recent).toMatchObject({ wins: 2, losses: 1, sampleSize: 3 });
  });

  it("still counts series from tournaments missing from phases", () => {
    const season = fabricate({
      teams: [team("A"), team("B")],
      phases: [],
      tournaments: {
        orphan: {
          id: "orphan",
          matches: [
            {
              id: "m1",
              round: 1,
              blueTeamId: "A",
              redTeamId: "B",
              winner: { teamId: "A", blueWins: 1, redWins: 0 },
              isBye: false,
            },
          ],
        },
      },
    } as unknown as Partial<SeasonState>);

    expect(liveTeamSeriesResults(season, "A")).toEqual(["W"]);
  });

  it("tallies live split + intl titles", () => {
    const a = team("A");
    const season = fabricate({
      teams: [a, team("B")],
      splitResults: {
        winter: { LCK: ["A", "B"] },
        spring: { LCK: ["B", "A"] },
      },
      intlResults: {
        "first-stand": ["A", "B"],
        worlds: ["B", "A"],
      },
    });

    expect(liveTitleCounts(season, a)).toEqual({
      split: 1,
      intl: 1,
      worlds: 0,
      total: 2,
    });
    expect(liveTitleHighlights(season, a)).toEqual(
      expect.arrayContaining(["Winter Split", "First Stand", "Season finalist"]),
    );
  });
});

describe("match-box H2H (all-time overall + recent)", () => {
  const t1 = namedTeam("t1", "T1");
  const geng = namedTeam("geng", "Gen.G");

  const liveSeason = fabricate({
    teams: [t1, geng],
    phases: [
      {
        kind: "split",
        split: "winter",
        label: "Winter",
        tournamentIds: ["t-live"],
        status: "in-progress",
      },
    ],
    tournaments: {
      "t-live": {
        id: "t-live",
        matches: [
          {
            id: "m1",
            round: 1,
            blueTeamId: "t1",
            redTeamId: "geng",
            winner: { teamId: "t1", blueWins: 2, redWins: 0 },
            isBye: false,
          },
          {
            id: "m2",
            round: 2,
            blueTeamId: "t1",
            redTeamId: "geng",
            winner: { teamId: "geng", blueWins: 0, redWins: 2 },
            isBye: false,
          },
        ],
      },
    },
  } as unknown as Partial<SeasonState>);

  it("sums Hall seasons for career archive H2H", () => {
    const hall = [
      hallEntry("y1", 1000, [
        {
          teamA: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" },
          teamB: {
            name: "Gen.G",
            leagueId: "LCK",
            color: "",
            iconKey: "shield",
          },
          meetings: 4,
          aWins: 3,
          bWins: 1,
        },
      ]),
      hallEntry("y2", 2000, [
        {
          teamA: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" },
          teamB: {
            name: "Gen.G",
            leagueId: "LCK",
            color: "",
            iconKey: "shield",
          },
          meetings: 2,
          aWins: 0,
          bWins: 2,
        },
      ]),
    ];
    const h2h = careerArchivedTeamH2H(
      hall,
      { name: "T1", leagueId: "LCK" },
      { name: "Gen.G", leagueId: "LCK" },
    );
    expect(h2h).toMatchObject({
      meetings: 6,
      overall: { wins: 3, losses: 3, winRate: 0.5 },
      recent: { sampleSize: 0 },
    });
  });

  it("with empty Hall, all-time overall matches current-season H2H", () => {
    const seasonOnly = liveTeamH2H(liveSeason, "t1", "geng");
    const allTime = liveAllTimeTeamH2H(liveSeason, [], "t1", "geng");
    expect(allTime).toEqual(seasonOnly);
    expect(allTime?.overall).toEqual({ wins: 1, losses: 1, winRate: 0.5 });
    expect(allTime?.recent.sampleSize).toBe(2);
  });

  it("adds live meetings on top of Hall archive for overall", () => {
    const hall = [
      hallEntry("y1", 1000, [
        {
          teamA: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" },
          teamB: {
            name: "Gen.G",
            leagueId: "LCK",
            color: "",
            iconKey: "shield",
          },
          meetings: 4,
          aWins: 3,
          bWins: 1,
        },
      ]),
    ];
    const h2h = liveAllTimeTeamH2H(liveSeason, hall, "t1", "geng");
    // Archive 3-1 + live 1-1 → 4-2
    expect(h2h).toMatchObject({
      meetings: 6,
      overall: { wins: 4, losses: 2, winRate: 4 / 6 },
      recent: { wins: 1, losses: 1, sampleSize: 2 },
    });
  });
});

describe("buildLiveTeamStatsMap / empty-season UI labels", () => {
  it("always yields a map entry and 0-0 / — labels before any series", async () => {
    const { buildLiveTeamStatsMap, formatSeriesCompact } = await import(
      "@/components/team/TeamLiveStats"
    );
    const a = team("A");
    const season = fabricate({ teams: [a, team("B")] });
    const map = buildLiveTeamStatsMap(season);
    expect(map.size).toBe(2);
    const stats = map.get("A");
    expect(stats).toBeDefined();
    expect(stats!.winRates.overall).toEqual({
      wins: 0,
      losses: 0,
      winRate: null,
    });
    expect(stats!.titles.total).toBe(0);
    // UI must not hide early-season emptiness — show "— · 0-0".
    expect(formatSeriesCompact(stats!.winRates.overall)).toBe("— · 0-0");
  });

  it("formats mid-season series compactly", async () => {
    const { formatSeriesCompact } = await import(
      "@/components/team/TeamLiveStats"
    );
    expect(
      formatSeriesCompact({ wins: 12, losses: 6, winRate: 12 / 18 }),
    ).toBe("67% · 12-6");
  });
});
