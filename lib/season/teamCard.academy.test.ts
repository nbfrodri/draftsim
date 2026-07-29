import { describe, expect, it } from "vitest";

import type { SeasonHistoryEntry } from "./history";
import {
  archivedAcademyCount,
  latestAcademyCount,
  liveAcademyCount,
} from "./teamCard";

const LANES = ["top", "jungle", "middle", "bottom", "support"] as const;

function rosterPlayers(prefix: string) {
  return LANES.map((lane, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix}${i}`,
    tier: "B" as const,
    lane,
    goodChamps: [1],
    badChamps: [] as number[],
  }));
}

describe("liveAcademyCount", () => {
  it("counts academy rows by lastTeamId and lastTeamName", () => {
    const pool = [
      { status: "academy", lastTeamId: "T0", lastTeamName: "Gen.G" },
      { status: "academy", lastTeamId: "T0", lastTeamName: "Gen.G" },
      { status: "free-agent", lastTeamId: "T0", lastTeamName: "Gen.G" },
      { status: "academy", lastTeamId: "T1", lastTeamName: "T1" },
    ];
    expect(liveAcademyCount(pool, { id: "T0", name: "Gen.G" })).toBe(2);
    expect(liveAcademyCount(pool, { name: "Gen.G" })).toBe(2);
    expect(liveAcademyCount(pool, { id: "T1" })).toBe(1);
  });
});

describe("archivedAcademyCount", () => {
  it("prefers PhaseInactiveSnapshot on the roster phase", () => {
    const entry = {
      id: "Y1",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Summer",
          kind: "split",
          split: "summer",
          teams: [
            {
              teamId: "tid-geng",
              teamName: "Gen.G",
              leagueId: "LCK",
              players: rosterPlayers("g"),
            },
          ],
          inactive: [
            {
              playerId: "a1",
              status: "academy",
              teamId: "tid-geng",
              teamName: "Gen.G",
            },
            {
              playerId: "a2",
              status: "academy",
              teamId: "tid-geng",
              teamName: "Gen.G",
            },
            {
              playerId: "fa1",
              status: "free-agent",
              teamId: "tid-geng",
              teamName: "Gen.G",
            },
            {
              playerId: "a3",
              status: "academy",
              teamId: "other",
              teamName: "T1",
            },
          ],
        },
      ],
      // Would say 1 if phase stamp were ignored — ensure phase wins.
      inactivePlayers: [
        {
          playerId: "only-year-end",
          lane: "middle",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 1,
          lastTeamId: "tid-geng",
          lastTeamName: "Gen.G",
        },
      ],
    } as unknown as SeasonHistoryEntry;

    expect(
      archivedAcademyCount(entry, { name: "Gen.G", leagueId: "LCK" }),
    ).toBe(2);
  });

  it("falls back to inactivePlayers when phase inactive is missing", () => {
    const entry = {
      id: "Y1",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Summer",
          kind: "split",
          split: "summer",
          teams: [
            {
              teamId: "tid-geng",
              teamName: "Gen.G",
              leagueId: "LCK",
              players: rosterPlayers("g"),
            },
          ],
        },
      ],
      inactivePlayers: [
        {
          playerId: "a1",
          lane: "top",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 1,
          lastTeamId: "tid-geng",
          lastTeamName: "Gen.G",
        },
        {
          playerId: "a2",
          lane: "jungle",
          tier: "A",
          status: "academy",
          inactiveYears: 2,
          demotedYear: 1,
          lastTeamId: "tid-geng",
          lastTeamName: "Gen.G",
        },
        {
          playerId: "fa",
          lane: "middle",
          tier: "B",
          status: "free-agent",
          inactiveYears: 3,
          demotedYear: 1,
          lastTeamId: "tid-geng",
          lastTeamName: "Gen.G",
        },
      ],
    } as unknown as SeasonHistoryEntry;

    expect(
      archivedAcademyCount(entry, { name: "Gen.G", leagueId: "LCK" }),
    ).toBe(2);
  });
});

describe("latestAcademyCount", () => {
  it("uses the newest archive that recorded pool data", () => {
    const old = {
      id: "Y1",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [],
      inactivePlayers: [
        {
          playerId: "old",
          lane: "top",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 1,
          lastTeamId: "tid",
          lastTeamName: "Gen.G",
        },
      ],
    } as unknown as SeasonHistoryEntry;
    const neu = {
      id: "Y2",
      archivedAt: 2,
      name: "Year 2",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [],
      inactivePlayers: [
        {
          playerId: "n1",
          lane: "top",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 2,
          lastTeamId: "tid",
          lastTeamName: "Gen.G",
        },
        {
          playerId: "n2",
          lane: "jungle",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 2,
          lastTeamId: "tid",
          lastTeamName: "Gen.G",
        },
        {
          playerId: "n3",
          lane: "middle",
          tier: "B",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 2,
          lastTeamId: "tid",
          lastTeamName: "Gen.G",
        },
      ],
    } as unknown as SeasonHistoryEntry;

    expect(
      latestAcademyCount([old, neu], { name: "Gen.G", leagueId: "LCK" }),
    ).toBe(3);
  });
});
