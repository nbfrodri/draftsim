import { describe, expect, it } from "vitest";
import {
  buildTitleDataset,
  selectTitleRows,
  TROPHIES,
  type TitleFilters,
} from "./titlePlayground";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import { LEAGUE_IDS, type PhaseRosterSnapshot } from "./types";
const korea: SeasonHistoryTeamRef = {
  name: "T1",
  leagueId: "LCK",
  color: "#e33",
  iconKey: "shield",
};
const europe: SeasonHistoryTeamRef = {
  name: "G2",
  leagueId: "LEC",
  color: "#eee",
  iconKey: "sword",
};
const entry = (
  year: number,
  overrides: Partial<SeasonHistoryEntry> = {},
): SeasonHistoryEntry => ({
  id: `s${year}`,
  name: `Reality — Year ${year}`,
  archivedAt: year,
  complete: true,
  champion: null,
  runnerUp: null,
  intlChampions: {},
  splitChampions: {},
  ...overrides,
});
const phase = (
  team: SeasonHistoryTeamRef,
  overrides: Partial<PhaseRosterSnapshot> = {},
): PhaseRosterSnapshot => ({
  phaseIndex: 0,
  label: "Winter",
  kind: "split",
  split: "winter",
  teams: [
    {
      teamId: team.name,
      teamName: team.name,
      leagueId: team.leagueId,
      players: [
        { id: "traveller", name: "SameName", lane: "middle", tier: "S" },
      ],
    },
  ],
  ...overrides,
});
const all: TitleFilters = {
  mode: "teams",
  regions: LEAGUE_IDS,
  trophies: TROPHIES,
  from: 1,
  to: 100,
};

describe("title playground", () => {
  it("filters player titles by the position played at the win", () => {
    const winter = phase(korea);
    const msi = phase(europe, {
      kind: "international",
      split: undefined,
      event: "msi",
    });
    msi.teams[0].players[0].lane = "support";
    const data = buildTitleDataset([
      entry(1, {
        splitChampions: { winter: { LCK: korea } },
        intlChampions: { msi: europe },
        phaseRosters: [winter, msi],
      }),
    ]);
    const support = selectTitleRows(data, {
      ...all,
      mode: "players",
      position: "support",
    });
    expect(support.rows[0].total).toBe(1);
    expect(support.rows[0].counts.msi).toBe(1);
    expect(support.rows[0].lane).toBe("support");
    const middle = selectTitleRows(data, {
      ...all,
      mode: "players",
      position: "middle",
    });
    expect(middle.rows[0].counts.winter).toBe(1);
    expect(middle.rows[0].counts.msi).toBe(0);
    expect(
      selectTitleRows(data, { ...all, mode: "players", position: "top" }).rows,
    ).toEqual([]);
    expect(selectTitleRows(data, { ...all, position: "support" }).awards).toBe(
      2,
    );
  });

  it("credits a transferred player to the region of each winning roster", () => {
    const data = buildTitleDataset([
      entry(1, {
        splitChampions: { winter: { LCK: korea } },
        intlChampions: { msi: europe },
        phaseRosters: [
          phase(korea),
          phase(europe, {
            kind: "international",
            split: undefined,
            event: "msi",
          }),
        ],
      }),
    ]);
    const global = selectTitleRows(data, { ...all, mode: "players" });
    expect(global.rows[0].total).toBe(2);
    expect(global.rows[0].team).toEqual(europe);
    const regional = selectTitleRows(data, {
      ...all,
      mode: "players",
      regions: ["LCK"],
    });
    expect(regional.rows[0].counts.winter).toBe(1);
    expect(regional.rows[0].counts.msi).toBe(0);
    expect(regional.rows[0].team).toEqual(korea);
  });
  it("counts Worlds once and deduplicates players across play-in and main snapshots", () => {
    const snapshot = phase(korea, {
      kind: "international",
      split: undefined,
      event: "worlds",
    });
    const data = buildTitleDataset([
      entry(1, {
        champion: korea,
        intlChampions: { worlds: korea },
        phaseRosters: [snapshot, { ...snapshot, phaseIndex: 1 }],
      }),
    ]);
    expect(selectTitleRows(data, all).rows[0].total).toBe(1);
    expect(
      selectTitleRows(data, { ...all, mode: "players" }).rows[0].total,
    ).toBe(1);
  });
  it("keeps same-name players and same-name teams in different regions separate", () => {
    const other = { ...europe, name: "T1" };
    const a = phase(korea),
      b = phase(other);
    b.teams[0].players[0].id = "someone-else";
    const data = buildTitleDataset([
      entry(1, {
        splitChampions: { winter: { LCK: korea, LEC: other } },
        phaseRosters: [a, b],
      }),
    ]);
    expect(selectTitleRows(data, all).rows).toHaveLength(2);
    expect(
      selectTitleRows(data, { ...all, mode: "players" }).rows.map(
        (row) => row.total,
      ),
    ).toEqual([1, 1]);
  });
  it("uses inclusive years and accumulates only titles inside the chosen range", () => {
    const data = buildTitleDataset([
      entry(4, { intlChampions: { "global-cup": korea } }),
      entry(2, { intlChampions: { msi: korea } }),
      entry(1, { champion: korea }),
    ]);
    const result = selectTitleRows(data, { ...all, from: 2, to: 4 });
    expect(result.rows[0].total).toBe(2);
    expect(result.rows[0].yearly).toEqual([
      { year: 2, total: 1 },
      { year: 4, total: 2 },
    ]);
    expect(
      selectTitleRows(data, { ...all, trophies: ["global-cup"] }).rows[0].total,
    ).toBe(1);
  });
  it("does not invent player winners when old archives lack phase rosters", () => {
    const data = buildTitleDataset([entry(1, { champion: korea })]);
    expect(selectTitleRows(data, all).rows[0].total).toBe(1);
    const result = selectTitleRows(data, { ...all, mode: "players" });
    expect(result.rows).toHaveLength(0);
    expect(result.missingRosters).toBe(1);
  });
  it("keeps archived participants with zero titles available", () => {
    const data = buildTitleDataset([
      entry(1, {
        champion: korea,
        intlPlacements: { worlds: [korea, europe] },
      }),
    ]);
    expect(
      selectTitleRows(data, all).rows.map((row) => [row.name, row.total]),
    ).toEqual([
      ["T1", 1],
      ["G2", 0],
    ]);
  });
  it("takes the newest duplicate archive without mutating input", () => {
    const input = [
      entry(1, { champion: korea }),
      entry(1, { archivedAt: 10, champion: europe }),
    ];
    const before = JSON.stringify(input);
    expect(selectTitleRows(buildTitleDataset(input), all).rows[0].name).toBe(
      "G2",
    );
    expect(JSON.stringify(input)).toBe(before);
  });
  it("supports empty selections and flags fallback chronological season labels", () => {
    const data = buildTitleDataset([
      entry(1, { name: "Untitled", champion: korea }),
    ]);
    expect(data.inferredYears).toBe(true);
    expect(selectTitleRows(data, { ...all, regions: [] }).rows).toEqual([]);
    expect(selectTitleRows(data, { ...all, trophies: [] }).rows).toEqual([]);
    expect(buildTitleDataset([]).years).toEqual([]);
  });
});
