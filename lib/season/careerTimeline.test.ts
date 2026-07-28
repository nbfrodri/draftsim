import { describe, expect, it } from "vitest";

import { playerProfile } from "./historySearch";
import type { SeasonHistoryEntry } from "./history";
import type { PhaseRosterSnapshot } from "./types";

// A career year is played in windows: Winter → First Stand → Spring → MSI →
// Summer → Worlds → Offseason. Roster membership comes from the phase roster;
// where a player stood in the windows he did NOT play comes from the academy /
// FA stamp taken at the same checkpoint.

const roster = (teamId: string, leagueId: string, ...playerIds: string[]) => ({
  teamId,
  teamName: teamId,
  leagueId,
  players: playerIds.map((id) => ({ id, name: id, lane: "top", tier: "A" })),
});

type PhaseSpec = {
  kind: "split" | "international";
  key: string;
  label: string;
  teams: ReturnType<typeof roster>[];
  inactive?: Array<{ playerId: string; status: "academy" | "free-agent"; teamId?: string }>;
};

function phases(specs: PhaseSpec[]): PhaseRosterSnapshot[] {
  return specs.map((s, i) => ({
    phaseIndex: i,
    label: s.label,
    kind: s.kind,
    ...(s.kind === "split" ? { split: s.key } : { event: s.key }),
    teams: s.teams,
    ...(s.inactive ? { inactive: s.inactive } : {}),
  })) as unknown as PhaseRosterSnapshot[];
}

function entry(parts: Partial<SeasonHistoryEntry>): SeasonHistoryEntry {
  return {
    id: "S1",
    archivedAt: 1,
    name: "Year 1",
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
    ...parts,
  } as unknown as SeasonHistoryEntry;
}

// P1 wins Winter with T1, is demoted to T1's academy for the rest of the year,
// and finishes it as a free agent. P2 is called up in his place and wins Spring.
const DEMOTED_YEAR = entry({
  splitChampions: {
    winter: { LCK: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" } },
    spring: { LCK: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" } },
  },
  phaseRosters: phases([
    { kind: "split", key: "winter", label: "Winter Split", teams: [roster("T1", "LCK", "P1")], inactive: [{ playerId: "P2", status: "academy", teamId: "T1" }] },
    { kind: "international", key: "first-stand", label: "First Stand", teams: [roster("T1", "LCK", "P1")], inactive: [{ playerId: "P2", status: "academy", teamId: "T1" }] },
    { kind: "split", key: "spring", label: "Spring Split", teams: [roster("T1", "LCK", "P2")], inactive: [{ playerId: "P1", status: "academy", teamId: "T1" }] },
    { kind: "international", key: "msi", label: "MSI", teams: [roster("T1", "LCK", "P2")], inactive: [{ playerId: "P1", status: "free-agent", teamId: "T1" }] },
  ]),
  inactivePlayers: [
    {
      playerId: "P1",
      playerName: "P1",
      lane: "top",
      tier: "A",
      status: "free-agent",
      inactiveYears: 4,
      demotedYear: 1,
      lastTeamId: "T1",
      lastTeamName: "T1",
    },
  ] as unknown as SeasonHistoryEntry["inactivePlayers"],
});

describe("career timeline by split / international window", () => {
  const windows = playerProfile([DEMOTED_YEAR], "P1")!.tenures[0]!.windows!;

  it("reports one row per window, in play order, ending on the offseason", () => {
    expect(windows.map((w) => w.key)).toEqual([
      "winter",
      "first-stand",
      "spring",
      "msi",
      "offseason",
    ]);
    expect(windows.map((w) => w.label)).toEqual([
      "Winter",
      "First Stand",
      "Spring",
      "MSI",
      "Offseason",
    ]);
  });

  it("switches from main roster to academy to FA mid-year", () => {
    expect(windows.map((w) => w.status)).toEqual([
      "active",
      "active",
      "academy",
      "free-agent",
      "free-agent",
    ]);
    expect(windows[0]!.team?.name).toBe("T1");
    // Academy rows still name the org holding the deal.
    expect(windows[2]!.team?.name).toBe("T1");
  });

  it("marks the trophy only on the window it was actually won in", () => {
    expect(windows.filter((w) => w.title).map((w) => w.title)).toEqual(["winter"]);
  });

  it("never credits the org's later title to the player sitting in its academy", () => {
    const p1 = playerProfile([DEMOTED_YEAR], "P1")!;
    // T1 also won Spring — P1 was in their academy for it.
    expect(p1.splitTitles).toBe(1);
    expect(p1.tenures[0]!.titles.splits).toEqual(["winter"]);
    const p2 = playerProfile([DEMOTED_YEAR], "P2")!;
    expect(p2.tenures[0]!.titles.splits).toEqual(["spring"]);
    // …and P2 was in the academy when T1 lifted Winter.
    expect(p2.splitTitles).toBe(1);
    const p2Winter = p2.tenures[0]!.windows!.find((w) => w.key === "winter")!;
    expect(p2Winter.status).toBe("academy");
    expect(p2Winter.title).toBeUndefined();
  });
});

describe("legacy archives without phase stamps", () => {
  // Same year, but nothing recorded about the pool at each checkpoint.
  const LEGACY = entry({
    splitChampions: {
      winter: { LCK: { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" } },
    },
    phaseRosters: phases([
      { kind: "split", key: "winter", label: "Winter Split", teams: [roster("T1", "LCK", "P1")] },
      { kind: "split", key: "spring", label: "Spring Split", teams: [roster("T1", "LCK", "P2")] },
    ]),
    inactivePlayers: [
      {
        playerId: "P1",
        playerName: "P1",
        lane: "top",
        tier: "A",
        status: "academy",
        inactiveYears: 1,
        demotedYear: 1,
        lastTeamId: "T1",
        lastTeamName: "T1",
      },
    ] as unknown as SeasonHistoryEntry["inactivePlayers"],
  });

  it("degrades to the windows it can prove — no invented academy rows", () => {
    const windows = playerProfile([LEGACY], "P1")!.tenures[0]!.windows!;
    expect(windows.map((w) => w.key)).toEqual(["winter", "offseason"]);
    // Spring is simply absent: the archive never said where he was.
    expect(windows.map((w) => w.status)).toEqual(["active", "academy"]);
  });

  it("keeps the year-end badge as the annual clock, untouched by windows", () => {
    const p = playerProfile([LEGACY], "P1")!;
    expect(p.careerStatus).toBe("academy");
    expect(p.academyYears).toBe(1);
  });

  it("emits no windows at all for a year the player never appeared in", () => {
    const poolOnly = entry({
      id: "S0",
      name: "Year 0",
      phaseRosters: phases([
        { kind: "split", key: "winter", label: "Winter Split", teams: [roster("T1", "LCK", "P9")] },
      ]),
      inactivePlayers: [
        {
          playerId: "P1",
          playerName: "P1",
          lane: "top",
          tier: "A",
          status: "academy",
          inactiveYears: 1,
          demotedYear: 0,
          lastTeamId: "T1",
          lastTeamName: "T1",
        },
      ] as unknown as SeasonHistoryEntry["inactivePlayers"],
    });
    expect(playerProfile([poolOnly], "P1")!.tenures[0]!.windows).toBeUndefined();
  });
});

describe("titles grouped by the region they were won in", () => {
  const lck = { name: "T1", leagueId: "LCK", color: "", iconKey: "shield" };
  const lec = { name: "G2", leagueId: "LEC", color: "", iconKey: "shield" };
  const YEAR_ONE = entry({
    id: "S1",
    archivedAt: 1,
    name: "Year 1",
    splitChampions: { winter: { LCK: lck }, summer: { LCK: lck } },
    phaseRosters: phases([
      { kind: "split", key: "winter", label: "Winter Split", teams: [roster("T1", "LCK", "P1")] },
      { kind: "split", key: "summer", label: "Summer Split", teams: [roster("T1", "LCK", "P1")] },
    ]),
  });
  const YEAR_TWO = entry({
    id: "S2",
    archivedAt: 2,
    name: "Year 2",
    splitChampions: { summer: { LEC: lec } },
    intlChampions: { worlds: lec },
    phaseRosters: phases([
      { kind: "split", key: "summer", label: "Summer Split", teams: [roster("G2", "LEC", "P1")] },
      { kind: "international", key: "worlds", label: "Worlds", teams: [roster("G2", "LEC", "P1")] },
    ]),
  });

  it("keeps each trophy under the league it was lifted for", () => {
    const groups = playerProfile([YEAR_ONE, YEAR_TWO], "P1")!.titlesByRegion;
    // Both regions gave him two majors; the international breaks the tie.
    expect(groups.map((g) => g.leagueId)).toEqual(["LEC", "LCK"]);
    const [lecRow, lckRow] = groups;
    expect(lckRow).toMatchObject({
      splits: { winter: 1, summer: 1 },
      splitTotal: 2,
      intlTotal: 0,
    });
    expect(lecRow).toMatchObject({
      splits: { summer: 1 },
      splitTotal: 1,
      intl: { worlds: 1 },
      intlTotal: 1,
    });
    expect(lckRow!.teams.map((t) => t.name)).toEqual(["T1"]);
    expect(lecRow!.teams.map((t) => t.name)).toEqual(["G2"]);
    expect(lecRow!.seasons).toEqual(["Year 2"]);
  });

  it("still totals the same trophies as the flat career counters", () => {
    const p = playerProfile([YEAR_ONE, YEAR_TWO], "P1")!;
    const grouped = p.titlesByRegion.reduce(
      (n, g) => n + g.splitTotal + g.intlTotal,
      0,
    );
    expect(grouped).toBe(
      p.splitTitles + Object.values(p.intlTitles).reduce((n, v) => n + (v ?? 0), 0),
    );
  });

  it("is empty for a player who never won anything", () => {
    const winless = entry({
      phaseRosters: phases([
        { kind: "split", key: "winter", label: "Winter Split", teams: [roster("T1", "LCK", "P7")] },
      ]),
    });
    expect(playerProfile([winless], "P7")!.titlesByRegion).toEqual([]);
  });
});
