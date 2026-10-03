import { describe, expect, it } from "vitest";
import type { SeasonHistoryEntry } from "./history";
import { archivedCoachSnapshot } from "./coachCard";

function archive(): SeasonHistoryEntry {
  return {
    id: "year-1", name: "Year 1", archivedAt: 1, complete: true,
    champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
    phaseRosters: [
      { kind: "split", split: "winter", label: "Winter", phaseIndex: 0, teams: [{
        teamId: "old", teamName: "Old Team", leagueId: "LCK", players: [],
        coach: { name: "Coach", rating: 3, playstyle: "Aggressive" },
      }] },
      { kind: "international", event: "msi", label: "MSI", phaseIndex: 1, teams: [{
        teamId: "old", teamName: "Old Team", leagueId: "LCK", players: [],
        coach: { name: "Coach", rating: 4, playstyle: "Balanced" },
      }] },
      { kind: "split", split: "summer", label: "Summer", phaseIndex: 2, teams: [{
        teamId: "new", teamName: "New Team", leagueId: "LPL", players: [],
        coach: { name: "Coach", rating: 5, playstyle: "Defensive" },
      }] },
    ],
  };
}

describe("archived coach cards", () => {
  it("pins team, rating and playstyle to the requested split or international", () => {
    expect(archivedCoachSnapshot(archive(), "Coach", "winter")).toMatchObject({ teamName: "Old Team", leagueId: "LCK", rating: 3, playstyle: "Aggressive", stage: "Winter" });
    expect(archivedCoachSnapshot(archive(), "Coach", "msi")).toMatchObject({ teamName: "Old Team", leagueId: "LCK", rating: 4, playstyle: "Balanced", stage: "MSI" });
    expect(archivedCoachSnapshot(archive(), "Coach", "summer")).toMatchObject({ teamName: "New Team", leagueId: "LPL", rating: 5, stage: "Summer" });
  });
  it("preserves latest-appearance cards without an event scope", () => {
    expect(archivedCoachSnapshot(archive(), "Coach")?.teamName).toBe("New Team");
  });
  it("leaves missing events and coach appearances unknown", () => {
    expect(archivedCoachSnapshot(archive(), "Coach", "worlds")).toBeNull();
    expect(archivedCoachSnapshot(archive(), "Other Coach", "msi")).toBeNull();
    expect(archivedCoachSnapshot({ ...archive(), phaseRosters: undefined }, "Coach")).toBeNull();
  });
});
