import { describe, expect, it } from "vitest";

import {
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
