import { describe, expect, it } from "vitest";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import { overallTimelineEvents } from "./historyTimeline";
import type { LeagueId, TeamRosterSnapshot } from "./types";

const team = (name: string, leagueId: LeagueId = "LCK"): SeasonHistoryTeamRef => ({ name, leagueId, color: "", iconKey: "shield" });
const roster = (ref: SeasonHistoryTeamRef, name: string): TeamRosterSnapshot => ({
  teamId: `${ref.leagueId}:${ref.name}`, teamName: ref.name, leagueId: ref.leagueId,
  players: [{ id: name, name, lane: "top", tier: "S", age: 22 }],
  coach: { name: `${name} coach`, rating: 80 },
});
const archive = (fields: Partial<SeasonHistoryEntry> = {}): SeasonHistoryEntry => ({
  id: "year-1", name: "Year 1", archivedAt: 1, complete: true,
  champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, ...fields,
});

describe("overall timeline finalists", () => {
  it("uses the exact international snapshot and region for both finalists", () => {
    const champion = team("Shared");
    const runnerUp = team("Shared", "LPL");
    const e = archive({
      intlChampions: { msi: champion }, intlRunnersUp: { msi: runnerUp },
      phaseRosters: [
        { kind: "split", split: "spring", phaseIndex: 0, label: "Spring", teams: [roster(runnerUp, "Spring top")] },
        { kind: "international", event: "msi", phaseIndex: 1, label: "MSI", teams: [roster(champion, "Champion top"), { ...roster(runnerUp, "MSI top"), logoUrl: "/archived.png" }] },
        { kind: "international", event: "worlds", phaseIndex: 2, label: "Worlds", teams: [roster(runnerUp, "Worlds top")] },
      ],
    });
    const result = overallTimelineEvents(e, "intl").find((event) => event.key === "msi")!;
    expect(result.champion?.roster?.players[0].id).toBe("Champion top");
    expect(result.runnerUp?.roster?.players[0]).toMatchObject({ id: "MSI top", tier: "S", age: 22 });
    expect(result.runnerUp?.roster?.coach?.name).toBe("MSI top coach");
    expect(result.runnerUp?.team.logoUrl).toBe("/archived.png");
  });

  it("resolves split finalists from placements and preserves each split's roster", () => {
    const champion = team("Winner"); const runnerUp = team("Finalist");
    const e = archive({
      splitPlacements: { winter: { LCK: [champion, runnerUp] }, summer: { LCK: [champion, runnerUp] } },
      phaseRosters: [
        { kind: "split", split: "winter", phaseIndex: 0, label: "Winter", teams: [roster(runnerUp, "Winter top")] },
        { kind: "split", split: "summer", phaseIndex: 1, label: "Summer", teams: [roster(runnerUp, "Summer top")] },
      ],
    });
    const result = overallTimelineEvents(e, "LCK");
    expect(result[0].champion?.team).toEqual(champion);
    expect(result[0].runnerUp?.roster?.players[0].name).toBe("Winter top");
    expect(result[2].runnerUp?.roster?.players[0].name).toBe("Summer top");
    expect(overallTimelineEvents(e, "LEC")[0].runnerUp).toBeNull();
  });

  it("supports recorded split runners-up and legacy Worlds without inventing missing data", () => {
    const runnerUp = team("Finalist");
    const e = archive({ champion: team("Winner"), runnerUp, splitRunnersUp: { spring: { LCK: runnerUp } } });
    const worlds = overallTimelineEvents(e, "intl").find((event) => event.key === "worlds")!;
    expect(worlds.champion?.team.name).toBe("Winner");
    expect(worlds.runnerUp).toEqual({ team: runnerUp, roster: null });
    expect(overallTimelineEvents(e, "intl").find((event) => event.key === "msi")?.runnerUp).toBeNull();
    expect(overallTimelineEvents(e, "LCK")[1].runnerUp).toEqual({ team: runnerUp, roster: null });
  });

  it("uses international placements even when compact title fields are absent", () => {
    const refs = [team("Winner"), team("Finalist"), team("Third")];
    const result = overallTimelineEvents(archive({ intlPlacements: { "global-cup": refs } }), "intl").find((event) => event.key === "global-cup")!;
    expect(result.champion?.team).toEqual(refs[0]);
    expect(result.runnerUp?.team).toEqual(refs[1]);
  });
});
