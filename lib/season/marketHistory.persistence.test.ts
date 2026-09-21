import { it, expect } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { makeAuditSeason } from "../auditFixtures";
import { localChampions } from "../communityDragon";
import { SCHEMA_SQL, type PersistedStoreState } from "../desktopSqliteSchema";
import { loadPersistedStateFromDbExecutor, savePersistedStateToDbExecutor, resetSqliteStorageForTests, type SqlExecutor } from "../desktopSqlite";
import { rollFranchiseToNextYearState } from "../../store/draftStore";
import { marketOrigin } from "./marketOrigin";
import { collectMarketHistory, filterMarketHistory, DEFAULT_MARKET_FILTERS } from "./marketHistory";
import type { SeasonHistoryEntry } from "./history";

it("keeps movements and window filters for all five years through real SQLite save/load boundaries", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  const executor: SqlExecutor = {
    execute: async (query, values = []) => ({ rowsAffected: Number(db.prepare(query).run(...values as SQLInputValue[]).changes) }),
    select: async <T>(query: string, values: unknown[] = []) => db.prepare(query).all(...values as SQLInputValue[]) as T[],
  };
  try {
    let season = makeAuditSeason("Five year market");
    season.franchise.aging = false;
    season.config.playerTransfers = false;
    let history: SeasonHistoryEntry[] = [];
    const rid = season.franchise.id;
    for (let year = 1; year <= 5; year++) {
      season.status = "complete";
      season.rosterNews = ["Winter", "MSI window"].map(window => ({ teamId: season.teams[0].id, lane: "top", entrantName: `Year ${year} ${window}`, entrantId: `p-${year}-${window}`, entrantTier: "A", entrantPotential: "A", entrantSource: "rookie", marketNote: "academy-rookie", timeMark: window, origin: marketOrigin(season, window) }));
      ({ season, history } = rollFranchiseToNextYearState(season, localChampions(), history));
      // Simulate dev losing module-local flags while the live store retains its new archives.
      resetSqliteStorageForTests();
      await savePersistedStateToDbExecutor(executor, "draftsim-store", { season, activeRealityId: rid, realities: [{ id: rid, name: "Five year market", year: season.franchise!.year, season, history }] } as PersistedStoreState);
      const restored = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
      history = restored.realities![0].history as SeasonHistoryEntry[];
      season = restored.realities![0].season as typeof season;
      expect(history).toHaveLength(year);
    }
    const rows = collectMarketHistory(history, season);
    expect([...new Set(rows.map(row => row.year))].sort()).toEqual([1, 2, 3, 4, 5]);
    for (let year = 1; year <= 5; year++) {
      expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, year: String(year), window: "Winter" })).toHaveLength(1);
      expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, year: String(year), window: "MSI window" })).toHaveLength(1);
    }
  } finally { db.close(); }
});
