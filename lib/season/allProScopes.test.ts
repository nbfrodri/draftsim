import { describe, expect, it } from "vitest";
import { archivedAllProCounts } from "./allProScopes";
import { computePlayerCareers } from "./historyRecords";
import type { SeasonHistoryEntry } from "./history";
import type { PlayerSeasonRecord } from "./stats";
const player = { playerId: "p1", playerName: "Ace", allPro: 7, allProSplit: 1, allProSeason: 1 } as PlayerSeasonRecord;
const entry = { archivedAt: 1, playerCareers: [player], allProTeams: ["split-league", "split-global", "season-global"].map(scope => ({ scope, members: [{ playerId: "p1" }] })) } as SeasonHistoryEntry;
describe("archived All-Pro scopes", () => {
  it("reconstructs domestic, global and annual honors instead of counting legacy internationals", () => {
    expect(archivedAllProCounts(entry, player)).toEqual({ split: 1, global: 1, season: 1, total: 3, complete: true });
    expect(computePlayerCareers([entry])[0]).toMatchObject({ allPro: 3, allProSplit: 1, allProGlobalSplit: 1, allProSeason: 1, allProIncomplete: false });
    expect(player.allPro).toBe(7);
  });
  it("does not infer scope or identity from a legacy total or name", () => {
    expect(archivedAllProCounts({} as SeasonHistoryEntry, player)).toMatchObject({ total: 2, global: 0, complete: false });
    expect(archivedAllProCounts(entry, { ...player, playerId: "other" }).total).toBe(0);
  });
  it("round-trips new explicit zero counters without mutating archives", () => {
    const record = { ...player, allProSplit: 0, allProGlobalSplit: 0, allProSeason: 0 };
    const saved = JSON.parse(JSON.stringify({ playerCareers: [record] })) as SeasonHistoryEntry;
    expect(archivedAllProCounts(saved, saved.playerCareers![0])).toMatchObject({ total: 0, complete: true });
  });
});
