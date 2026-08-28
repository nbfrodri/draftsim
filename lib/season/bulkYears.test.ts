import { describe, expect, it } from "vitest";
import {
  BULK_YEARS_CONFIRM_THRESHOLD,
  BULK_YEARS_MAX,
  bulkSimRealityMatches,
  clampBulkYearCount,
  nextBulkYearStep,
} from "./bulkYears";
import type { SeasonState } from "./types";

function mockSeason(overrides: Partial<SeasonState> = {}): SeasonState {
  return {
    id: "s1",
    name: "Test",
    createdAt: 0,
    updatedAt: 0,
    config: {
      name: "Test",
      sharedLeagueConfig: true,
      leagueConfigs: {} as SeasonState["config"]["leagueConfigs"],
      liveMeta: false,
      patchShift: false,
      fearless: false,
      aiDifficulty: "normal",
      controlledTeamId: null,
    },
    teams: [],
    phases: [{ kind: "split", label: "Winter", status: "in-progress", tournamentIds: ["t1"] }],
    phaseIndex: 0,
    tournaments: {
      t1: {
        id: "t1",
        name: "LCK Winter",
        status: "in-progress",
        format: "round-robin",
        teams: [],
        matches: [{ id: "m1", round: 1, blueTeamId: "a", redTeamId: "b" }],
      } as SeasonState["tournaments"][string],
    },
    splitResults: {},
    intlResults: {},
    currentMeta: {
      metaOverride: null,
      metaEnabled: true,
      synergyOverride: null,
      counterOverride: null,
    },
    champion: null,
    status: "in-progress",
    franchise: {
      id: "r1",
      name: "Reality",
      year: 1,
      aging: true,
    },
    ...overrides,
  };
}

describe("clampBulkYearCount", () => {
  it("clamps to [1, BULK_YEARS_MAX]", () => {
    expect(clampBulkYearCount(0)).toBe(1);
    expect(clampBulkYearCount(-3)).toBe(1);
    expect(clampBulkYearCount(99)).toBe(BULK_YEARS_MAX);
    expect(clampBulkYearCount(3.7)).toBe(3);
    expect(clampBulkYearCount(Number.NaN)).toBe(1);
  });
});

describe("nextBulkYearStep", () => {
  it("requires a franchise reality", () => {
    expect(nextBulkYearStep(mockSeason({ franchise: undefined }))).toBe("unsupported");
    expect(nextBulkYearStep(null)).toBe("unsupported");
  });

  it("finalize_offseason when the year is complete", () => {
    expect(nextBulkYearStep(mockSeason({ status: "complete" }))).toBe("finalize_offseason");
  });

  it("resolve_transfer during an open transfer window", () => {
    const s = mockSeason({
      phases: [
        {
          kind: "transfer",
          label: "Transfer",
          status: "in-progress",
          event: "first-stand",
          tournamentIds: [],
        },
      ],
      phaseIndex: 0,
    });
    expect(nextBulkYearStep(s)).toBe("resolve_transfer");
  });

  it("sim_match when tournaments remain in the current phase", () => {
    expect(nextBulkYearStep(mockSeason())).toBe("sim_match");
  });
});

describe("bulkSimRealityMatches", () => {
  it("matches the same franchise across season id changes", () => {
    const y1 = mockSeason({ id: "season-y1", franchise: { id: "r1", name: "Reality", year: 1, aging: true } });
    const y2 = mockSeason({ id: "season-y2", franchise: { id: "r1", name: "Reality", year: 2, aging: true } });
    expect(bulkSimRealityMatches(y1, "r1")).toBe(true);
    expect(bulkSimRealityMatches(y2, "r1")).toBe(true);
    expect(bulkSimRealityMatches(y2, "other")).toBe(false);
    expect(bulkSimRealityMatches(null, "r1")).toBe(false);
    expect(bulkSimRealityMatches(mockSeason({ franchise: undefined }), "r1")).toBe(false);
  });
});

describe("bulk year constants", () => {
  it("confirm threshold is below the hard cap", () => {
    expect(BULK_YEARS_CONFIRM_THRESHOLD).toBeLessThan(BULK_YEARS_MAX);
  });
});
