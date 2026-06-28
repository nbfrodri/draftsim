import { describe, expect, it } from "vitest";

import { buildSeasonHistoryEntry, diffMetaOverrides } from "./history";
import type { MetaOverride } from "../championMeta";
import type { SeasonState } from "./types";

// Minimal fabricated season — only the fields the résumé builder reads.
function fabricate(overrides: Partial<SeasonState> = {}): SeasonState {
  const team = (id: string, league = "LCK") => ({
    id,
    leagueId: league,
    name: id.toUpperCase(),
    color: "#fff",
    iconKey: "sword",
    players: [],
    personalityId: "balanced",
  });
  return {
    id: "season-x",
    name: "2026 Season",
    status: "complete",
    champion: "t1",
    teams: [team("t1"), team("t2", "LPL"), team("t3", "LEC")],
    splitResults: {
      winter: { LCK: ["t1", "t2"], LEC: ["t3"] },
      summer: { LCK: ["t2", "t1"] },
    },
    intlResults: {
      "first-stand": ["t3", "t1"],
      msi: ["t1", "t2"],
      worlds: ["t1", "t2", "t3"],
    },
    ...overrides,
  } as unknown as SeasonState;
}

describe("buildSeasonHistoryEntry", () => {
  it("captures champion, runner-up, intl and split champions", () => {
    const entry = buildSeasonHistoryEntry(fabricate(), 123);
    expect(entry).toMatchObject({
      id: "season-x",
      archivedAt: 123,
      name: "2026 Season",
      complete: true,
      champion: { name: "T1", leagueId: "LCK" },
      runnerUp: { name: "T2", leagueId: "LPL" },
    });
    expect(entry.intlChampions["first-stand"]?.name).toBe("T3");
    expect(entry.intlChampions.msi?.name).toBe("T1");
    expect(entry.intlChampions.worlds?.name).toBe("T1");
    expect(entry.splitChampions.winter?.LCK?.name).toBe("T1");
    expect(entry.splitChampions.winter?.LEC?.name).toBe("T3");
    expect(entry.splitChampions.summer?.LCK?.name).toBe("T2");
    expect(entry.splitChampions.spring).toBeUndefined();
    // Runners-up (2nd place) captured per event/split for the by-season recap.
    expect(entry.intlRunnersUp?.["first-stand"]?.name).toBe("T1"); // ["t3","t1"]
    expect(entry.intlRunnersUp?.msi?.name).toBe("T2");
    expect(entry.splitRunnersUp?.winter?.LCK?.name).toBe("T2"); // ["t1","t2"]
    expect(entry.splitRunnersUp?.winter?.LEC).toBeUndefined(); // only one team
  });

  it("captures the starting and final tier tables", () => {
    const initial: MetaOverride = { ahri: { middle: "A" } };
    const final: MetaOverride = { ahri: { middle: "S" } };
    const entry = buildSeasonHistoryEntry(
      fabricate({
        initialMeta: {
          metaOverride: initial,
          metaEnabled: true,
          synergyOverride: null,
          counterOverride: null,
        },
        currentMeta: {
          metaOverride: final,
          metaEnabled: true,
          synergyOverride: null,
          counterOverride: null,
        },
      } as Partial<SeasonState>),
      1,
    );
    expect(entry.initialMetaOverride).toEqual(initial);
    expect(entry.finalMetaOverride).toEqual(final);
  });

  it("carries the region tide forward when present, omits it otherwise", () => {
    const tided = buildSeasonHistoryEntry(
      fabricate({ leagueStrength: { LCK: 0.3, LPL: -0.1 } } as Partial<SeasonState>),
      1,
    );
    expect(tided.leagueStrength).toEqual({ LCK: 0.3, LPL: -0.1 });
    // A season that didn't run Region Tides archives without the field.
    const plain = buildSeasonHistoryEntry(fabricate(), 1);
    expect("leagueStrength" in plain).toBe(false);
  });

  it("freezes the year's transfers with team names, grouped under the entry", () => {
    const move = {
      event: "msi" as const,
      lane: "middle" as const,
      fromTeamId: "t2",
      toTeamId: "t1",
      star: { name: "Faker", tier: "S", grade: 8, goodChamps: [] },
      swap: { name: "Chovy", tier: "A", grade: 7, goodChamps: [] },
    };
    const entry = buildSeasonHistoryEntry(
      fabricate({ transfersByEvent: { msi: [move] } } as Partial<SeasonState>),
      1,
    );
    expect(entry.transfers).toHaveLength(1);
    expect(entry.transfers![0]).toMatchObject({
      event: "msi",
      lane: "middle",
      from: { name: "T2" }, // denormalized name, not the id
      to: { name: "T1" },
      inName: "Faker",
      inTier: "S",
      outName: "Chovy",
      outTier: "A",
    });
    // No transfers → field omitted entirely (legacy-safe serialization).
    expect("transfers" in buildSeasonHistoryEntry(fabricate(), 1)).toBe(false);
  });

  it("marks the starting meta unknown for seasons that pre-date initialMeta", () => {
    const entry = buildSeasonHistoryEntry(
      fabricate({
        currentMeta: {
          metaOverride: null,
          metaEnabled: true,
          synergyOverride: null,
          counterOverride: null,
        },
      } as Partial<SeasonState>),
      1,
    );
    expect("initialMetaOverride" in entry).toBe(false);
    expect(entry.finalMetaOverride).toBeNull();
  });

  it("handles unfinished seasons (no Worlds result yet)", () => {
    const entry = buildSeasonHistoryEntry(
      fabricate({
        status: "in-progress",
        champion: null,
        intlResults: { "first-stand": ["t3"] },
      }),
      1,
    );
    expect(entry.complete).toBe(false);
    expect(entry.champion).toBeNull();
    expect(entry.runnerUp).toBeNull();
    expect(entry.intlChampions["first-stand"]?.name).toBe("T3");
  });

  it("attaches a narrative story, and it survives JSON persistence", () => {
    const entry = buildSeasonHistoryEntry(fabricate(), 1);
    expect(entry.story).toBeDefined();
    expect(entry.story?.champion?.name).toBe("T1");
    // t1 won Winter LCK + MSI + Worlds → 3 trophies.
    expect(entry.story?.teamOfTheYear?.team.name).toBe("T1");
    expect(entry.story?.teamOfTheYear?.titles).toBe(3);
    expect(entry.story?.regionThatRose).toBe("LCK");
    // History persists as JSON (localStorage / desktop file) — round-trip it.
    const roundTripped = JSON.parse(JSON.stringify(entry));
    expect(roundTripped.story).toEqual(entry.story);
  });

  it("omits the story for a season with no results to tell", () => {
    const entry = buildSeasonHistoryEntry(
      fabricate({
        status: "in-progress",
        champion: null,
        splitResults: {},
        intlResults: {},
        tournaments: {},
        currentMeta: {
          metaOverride: null,
          metaEnabled: true,
          synergyOverride: null,
          counterOverride: null,
        },
      } as Partial<SeasonState>),
      1,
    );
    expect("story" in entry).toBe(false);
  });
});

describe("diffMetaOverrides", () => {
  it("reports effective tier changes, biggest swings first", () => {
    const initial: MetaOverride = {
      x: { middle: "A", top: "B" },
      y: { jungle: "C" },
    };
    const final: MetaOverride = {
      x: { middle: "S", top: "B" }, // mid rose one step; top unchanged
      y: { jungle: "S" }, //            rose three steps
    };
    const shifts = diffMetaOverrides(initial, final);
    expect(shifts).toEqual([
      { alias: "y", lane: "jungle", from: "C", to: "S" },
      { alias: "x", lane: "middle", from: "A", to: "S" },
    ]);
  });

  it("returns no shifts for identical snapshots", () => {
    const o: MetaOverride = { x: { middle: "A" } };
    expect(diffMetaOverrides(o, o)).toEqual([]);
    expect(diffMetaOverrides(null, null)).toEqual([]);
  });
});
