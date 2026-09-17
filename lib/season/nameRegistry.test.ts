import { describe, expect, it } from "vitest";
import { repairNameRegistry } from "./nameRegistry";
import { generateHandle } from "./playerNames";
import type { SeasonState } from "./types";
import type { SeasonHistoryEntry } from "./history";

describe("legacy reality name registry", () => {
  it("reserves archived-only names before generating new players and survives a reload", () => {
    const season = {
      teams: [],
      franchise: { id: "legacy", year: 30 },
    } as unknown as SeasonState;
    const history = [
      {
        playerCareers: [{ playerId: "retired", playerName: " VEX " }],
        phaseRosters: [{ teams: [{ players: [{ name: "Vexaa" }] }] }],
        inactivePlayers: [{ playerName: "Vexab" }],
        transfers: [{ inName: "Vexac", outName: "Vexad" }],
      },
    ] as unknown as SeasonHistoryEntry[];
    const fixed = repairNameRegistry(season, history);
    expect(generateHandle(() => 0, new Set(fixed.franchise!.usedNames))).toBe(
      "Vexae",
    );
    expect(season.franchise!.usedNames).toBeUndefined();
    const reloaded = JSON.parse(JSON.stringify(fixed));
    expect(repairNameRegistry(reloaded)).toBe(reloaded);
    expect(generateHandle(() => 0, new Set(reloaded.franchise.usedNames))).toBe(
      "Vexae",
    );
  });
  it("preserves identities and existing duplicates while reserving the name for future players", () => {
    const season = {
      teams: [
        {
          players: [
            { id: "a", name: "Vex" },
            { id: "b", name: "Vex" },
          ],
        },
      ],
      franchise: {},
    } as unknown as SeasonState;
    const fixed = repairNameRegistry(season);
    expect(fixed.teams).toBe(season.teams);
    expect(
      generateHandle(() => 0, new Set(fixed.franchise!.usedNames)),
    ).not.toBe("Vex");
  });
});
