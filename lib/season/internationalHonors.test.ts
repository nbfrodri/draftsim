import { describe, expect, it } from "vitest";
import { internationalHonor } from "./internationalHonors";
import { matchesTitleFilters, listPlayers } from "./historySearch";
import { computePlayerTitlesByEvent, computeTeamRecords } from "./historyRecords";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import type { InternationalId } from "./types";

describe("international career honors", () => {
  it("distinguishes the three standard titles from all four", () => {
    const triple = { "first-stand": 1, msi: 2, worlds: 1 };
    expect(internationalHonor(triple)).toBe("triple-crown");
    expect(internationalHonor({ ...triple, "global-cup": 1 })).toBe("grand-slam");
    expect(internationalHonor({ ...triple, "global-cup": 0 })).toBe("triple-crown");
    expect(internationalHonor({ msi: 20, worlds: 20, "global-cup": 20 })).toBeNull();
    expect(internationalHonor({})).toBeNull();
  });

  it("requires every selected event with AND while preserving OR and split filters", () => {
    const filters = { kinds: ["intl" as const], intlEvents: ["msi" as const, "worlds" as const], intlEventMatch: "all" as const };
    expect(matchesTitleFilters(0, { msi: 2 }, filters)).toBe(false);
    expect(matchesTitleFilters(0, { msi: 1, worlds: 1 }, filters)).toBe(true);
    expect(matchesTitleFilters(0, { msi: 1 }, { ...filters, intlEventMatch: "any" })).toBe(true);
    expect(matchesTitleFilters(0, { msi: 1, worlds: 1 }, { ...filters, kinds: ["intl", "split"] })).toBe(false);
    expect(matchesTitleFilters(1, { msi: 1, worlds: 1 }, { ...filters, kinds: ["intl", "split"] })).toBe(true);
    expect(matchesTitleFilters(0, { worlds: 1 }, { ...filters, intlEvents: [] })).toBe(true);
    expect(matchesTitleFilters(0, {}, { ...filters, intlEvents: [] })).toBe(false);
  });

  it("collects a player's career across teams and years only when they participated, keeping team regions separate", () => {
    const events: InternationalId[] = ["first-stand", "msi", "worlds", "global-cup"];
    const entries = events.map((event, index): SeasonHistoryEntry => {
      const team: SeasonHistoryTeamRef = { name: "Shared", leagueId: index < 3 ? "LCK" : "LPL", color: "", iconKey: "shield" };
      return {
        id: `year-${index}`, name: `Year ${index}`, archivedAt: index, complete: true,
        champion: null, runnerUp: null, intlChampions: { [event]: team }, splitChampions: {},
        playerCareers: ["hero", index < 3 ? "triple" : "cup-only"].map((id) => ({
          playerId: id, playerName: id, leagueId: team.leagueId, teamName: team.name,
          lane: "top", games: 1, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlTitles: 1, intlAppearances: 1,
        })),
        phaseRosters: [{ kind: "international", event, phaseIndex: 0, label: event, teams: [{
          teamId: `${team.leagueId}:Shared`, teamName: team.name, leagueId: team.leagueId,
          players: [
            { id: "hero", name: "Hero", lane: "top", tier: "S" },
            { id: index < 3 ? "triple" : "cup-only", name: "Same name", lane: "middle", tier: "A" },
          ],
        }] }],
      };
    });
    const totals = computePlayerTitlesByEvent(entries);
    expect(totals.get("hero")).toMatchObject({ firstStand: 1, msi: 1, worlds: 1, globalCup: 1 });
    const players = listPlayers(entries);
    expect(internationalHonor(players.find((player) => player.id === "hero")!.intlByEvent)).toBe("grand-slam");
    expect(internationalHonor(players.find((player) => player.id === "triple")!.intlByEvent)).toBe("triple-crown");
    expect(internationalHonor(players.find((player) => player.id === "cup-only")!.intlByEvent)).toBeNull();
    const teams = computeTeamRecords(entries);
    expect(internationalHonor(teams.find((team) => team.key === "LCK:Shared")!.intlTitles)).toBe("triple-crown");
    expect(internationalHonor(teams.find((team) => team.key === "LPL:Shared")!.intlTitles)).toBeNull();
  });
});
