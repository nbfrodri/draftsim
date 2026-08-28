import { describe, it, expect } from "vitest";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { syncRealityHistory, type SqlExecutor } from "./desktopSqlite";
import { UPSERT_REALITY_HISTORY_SQL } from "./desktopSqliteSchema";

function historyKey(realityId: string, entryId: string): string {
  return `${realityId}\0${entryId}`;
}

function createMockHistoryDb() {
  const rows = new Map<
    string,
    { reality_id: string; entry_id: string; entry_json: string; sort_order: number }
  >();

  const db: SqlExecutor = {
    async execute(query, bindValues = []) {
      if (query === UPSERT_REALITY_HISTORY_SQL) {
        const [realityId, entryId, entryJson, sortOrder] = bindValues as [
          string,
          string,
          string,
          number,
        ];
        rows.set(historyKey(realityId, entryId), {
          reality_id: realityId,
          entry_id: entryId,
          entry_json: entryJson,
          sort_order: sortOrder,
        });
        return { rowsAffected: 1 };
      }

      if (query === "DELETE FROM reality_history WHERE reality_id = ?") {
        const [realityId] = bindValues as [string];
        for (const key of [...rows.keys()]) {
          if (key.startsWith(`${realityId}\0`)) rows.delete(key);
        }
        return { rowsAffected: 0 };
      }

      if (query.includes("NOT IN")) {
        const [realityId, ...keepIds] = bindValues as string[];
        for (const [key, row] of [...rows.entries()]) {
          if (row.reality_id === realityId && !keepIds.includes(row.entry_id)) {
            rows.delete(key);
          }
        }
        return { rowsAffected: 0 };
      }

      throw new Error(`Unexpected query in mock db: ${query}`);
    },
    async select() {
      return [];
    },
  };

  return { db, rows };
}

function makeEntry(id: string, name: string): SeasonHistoryEntry {
  return {
    id,
    archivedAt: 1,
    name,
    complete: true,
    champion: null,
    runnerUp: null,
    intlChampions: {},
    splitChampions: {},
  };
}

describe("syncRealityHistory", () => {
  it("upserts the same entry_id twice without duplicate rows", async () => {
    const { db, rows } = createMockHistoryDb();
    const entry = makeEntry("season-2026", "2026");

    await syncRealityHistory(db, "reality-1", [entry]);
    await syncRealityHistory(db, "reality-1", [entry]);

    expect(rows.size).toBe(1);
    expect(rows.get(historyKey("reality-1", "season-2026"))?.entry_json).toBe(
      JSON.stringify(entry),
    );
  });

  it("updates entry_json and sort_order on conflict", async () => {
    const { db, rows } = createMockHistoryDb();
    const first = makeEntry("season-2026", "2026");
    const updated = makeEntry("season-2026", "2026 Updated");

    await syncRealityHistory(db, "reality-1", [first]);
    await syncRealityHistory(db, "reality-1", [updated, makeEntry("season-2027", "2027")]);

    expect(rows.size).toBe(2);
    expect(rows.get(historyKey("reality-1", "season-2026"))?.entry_json).toBe(
      JSON.stringify(updated),
    );
    expect(rows.get(historyKey("reality-1", "season-2026"))?.sort_order).toBe(0);
    expect(rows.get(historyKey("reality-1", "season-2027"))?.sort_order).toBe(1);
  });

  it("deletes rows removed from persisted history", async () => {
    const { db, rows } = createMockHistoryDb();

    await syncRealityHistory(db, "reality-1", [
      makeEntry("season-2025", "2025"),
      makeEntry("season-2026", "2026"),
    ]);
    await syncRealityHistory(db, "reality-1", [makeEntry("season-2026", "2026")]);

    expect(rows.size).toBe(1);
    expect(rows.has(historyKey("reality-1", "season-2025"))).toBe(false);
    expect(rows.has(historyKey("reality-1", "season-2026"))).toBe(true);
  });

  it("clears all rows when history is empty", async () => {
    const { db, rows } = createMockHistoryDb();

    await syncRealityHistory(db, "reality-1", [makeEntry("season-2026", "2026")]);
    await syncRealityHistory(db, "reality-1", []);

    expect(rows.size).toBe(0);
  });
});
