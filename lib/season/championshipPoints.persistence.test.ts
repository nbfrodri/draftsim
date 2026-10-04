import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { localChampions } from "../communityDragon";
import { SCHEMA_SQL, type PersistedStoreState } from "../desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, savePersistedStateToDbExecutor, resetSqliteStorageForTests, type SqlExecutor } from "../desktopSqlite";
import { rollFranchiseToNextYearState } from "../../store/draftStore";
import { championshipPointsRows } from "./championshipPoints";
import type { SeasonHistoryEntry } from "./history";

it("retains frozen year-end points through rollover and real SQLite save/reload without backfilling legacy history", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const executor: SqlExecutor = {
    execute: async (query, values = []) => ({ rowsAffected: Number(db.prepare(query).run(...values as SQLInputValue[]).changes) }),
    select: async <T>(query: string, values: unknown[] = []) => db.prepare(query).all(...values as SQLInputValue[]) as T[],
  };
  try {
    const season = makeAuditSeason("Points persistence");
    season.status = "complete";
    season.franchise.aging = false;
    season.config.playerTransfers = false;
    const team = season.teams[0];
    team.logoUrl = "/team-logos/t1.png";
    season.splitResults = { winter: { LCK: [team.id] }, spring: { LCK: [team.id] }, summer: { LCK: [team.id] } };
    season.intlResults = { "first-stand": [team.id], msi: [team.id] };
    const expected = championshipPointsRows(season);
    const legacy: SeasonHistoryEntry = { id: "legacy-points-year", archivedAt: 1, name: "Older year", complete: true,
      champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} };
    const next = rollFranchiseToNextYearState(season, localChampions(), [legacy]);
    expect(next.history[0].championshipPoints).toEqual(expected);
    next.season.teams[0].name = "Changed next year";
    const rid = next.season.franchise!.id;
    resetSqliteStorageForTests();
    await savePersistedStateToDbExecutor(executor, "draftsim-store", {
      season: next.season, activeRealityId: rid,
      realities: [{ id: rid, name: "Points persistence", year: 2, season: next.season, history: next.history }],
    } as PersistedStoreState);
    const restored = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
    const history = restored.realities![0].history as SeasonHistoryEntry[];
    expect(history.find(entry => entry.id === season.id)!.championshipPoints).toEqual(expected);
    expect(history.find(entry => entry.id === legacy.id)!.championshipPoints).toBeUndefined();
    expect(history.find(entry => entry.id === season.id)!.championshipPoints![0].total).toBe(60);
  } finally {
    db.close();
    resetSqliteStorageForTests();
  }
});
