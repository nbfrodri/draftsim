import { describe, expect, it } from "vitest";

import { computePlayerTitleCounts } from "./stats";
import type { SeasonState } from "./types";

// Minimal season: only the fields computePlayerTitleCounts reads
// (teams, splitResults, intlResults, phases, tournaments, phaseRosters).
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

const roster = (teamId: string, ...playerIds: string[]) => ({
  teamId,
  teamName: teamId,
  leagueId: "LCK",
  players: playerIds.map((id) => ({ id, lane: "top", tier: "A" })),
});

describe("computePlayerTitleCounts — title attribution", () => {
  it("credits a split title to who was on the roster THEN, not the end-of-season team", () => {
    // P1 won Winter with team A, then transferred to team B.
    const season = fabricate({
      teams: [
        { id: "A", players: [{ id: "P3" }] }, // A's Winter winner P1 left, replaced by P3
        { id: "B", players: [{ id: "P1" }, { id: "P2" }] }, // P1 now here
      ] as unknown as SeasonState["teams"],
      splitResults: { winter: { LCK: ["A", "B"] } },
      phaseRosters: [
        { phaseIndex: 0, kind: "split", split: "winter", teams: [roster("A", "P1"), roster("B", "P2")] },
      ] as unknown as SeasonState["phaseRosters"],
    });
    const counts = computePlayerTitleCounts(season);
    expect(counts.get("P1")?.split).toBe(1); // kept the title he won
    expect(counts.get("P3")?.split ?? 0).toBe(0); // didn't win it despite now on A
  });

  it("falls back to the current roster when no phaseRosters snapshot exists (legacy save)", () => {
    const season = fabricate({
      teams: [{ id: "A", players: [{ id: "P1" }] }] as unknown as SeasonState["teams"],
      splitResults: { winter: { LCK: ["A"] } },
      // no phaseRosters
    });
    expect(computePlayerTitleCounts(season).get("P1")?.split).toBe(1);
  });

  it("never credits an academy or free-agent player with their org's title", () => {
    // ACY sat in A's academy all Winter; FA was unsigned. Both are back on A's
    // main roster by the time the season is read.
    const season = fabricate({
      teams: [
        { id: "A", players: [{ id: "P1" }, { id: "ACY" }, { id: "FA" }] },
      ] as unknown as SeasonState["teams"],
      splitResults: { winter: { LCK: ["A"] } },
      phaseRosters: [
        { phaseIndex: 0, kind: "split", split: "winter", teams: [roster("A", "P1")] },
      ] as unknown as SeasonState["phaseRosters"],
    });
    const counts = computePlayerTitleCounts(season);
    expect(counts.get("P1")?.split).toBe(1);
    expect(counts.get("ACY")?.split ?? 0).toBe(0);
    expect(counts.get("FA")?.split ?? 0).toBe(0);
  });

  it("does not fall back to the live roster for a stage the season never snapshotted", () => {
    // Winter was recorded; Summer's champion has no stage roster, so nobody
    // can be credited for it — least of all whoever happens to be here now.
    const season = fabricate({
      teams: [{ id: "A", players: [{ id: "LATE" }] }] as unknown as SeasonState["teams"],
      splitResults: { winter: { LCK: ["A"] }, summer: { LCK: ["A"] } },
      phaseRosters: [
        { phaseIndex: 0, kind: "split", split: "winter", teams: [roster("A", "P1")] },
      ] as unknown as SeasonState["phaseRosters"],
    });
    const counts = computePlayerTitleCounts(season);
    expect(counts.get("P1")?.split).toBe(1);
    expect(counts.get("LATE")?.split ?? 0).toBe(0);
  });

  it("counts international titles and appearances by stage roster", () => {
    const season = fabricate({
      teams: [
        { id: "A", players: [{ id: "P9" }] },
        { id: "B", players: [{ id: "P1" }] },
      ] as unknown as SeasonState["teams"],
      intlResults: { worlds: ["A", "B"] },
      phases: [
        { kind: "international", event: "worlds", tournamentIds: ["wrl"] },
      ] as unknown as SeasonState["phases"],
      tournaments: { wrl: { teams: [{ id: "A" }, { id: "B" }] } } as unknown as SeasonState["tournaments"],
      phaseRosters: [
        { phaseIndex: 0, kind: "international", event: "worlds", teams: [roster("A", "P1"), roster("B", "P2")] },
      ] as unknown as SeasonState["phaseRosters"],
    });
    const counts = computePlayerTitleCounts(season);
    expect(counts.get("P1")?.intlTitles).toBe(1); // P1 won Worlds with A (stage roster), even though now on B
    expect(counts.get("P1")?.intlApps).toBe(1);
    expect(counts.get("P2")?.intlApps).toBe(1); // attended with B
    expect(counts.get("P9")?.intlTitles ?? 0).toBe(0); // now on A but wasn't on the Worlds roster
  });
});
