import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SeasonHistoryEntry } from "@/lib/season/history";

vi.mock("./desktopStorage", () => ({
  isDesktop: () => true,
  desktopStorage: {
    getItem: vi.fn(),
  },
}));

import {
  loadPersistedStateFromDb,
  resetSqliteStorageForTests,
  savePersistedStateToDb,
  setDesktopDatabaseForTests,
  syncRemovedRealities,
  syncRealityHistory,
  type SqlExecutor,
} from "./desktopSqlite";
import { UPSERT_REALITY_HISTORY_SQL } from "./desktopSqliteSchema";

const STORE_KEY = "draftsim-store";

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

      if (query.includes("entry_id NOT IN")) {
        const [realityId, ...keepIds] = bindValues as string[];
        for (const [key, row] of [...rows.entries()]) {
          if (row.reality_id === realityId && !keepIds.includes(row.entry_id)) {
            rows.delete(key);
          }
        }
        return { rowsAffected: 0 };
      }

      if (query.includes("reality_id NOT IN")) {
        const keepIds = bindValues as string[];
        for (const [key, row] of [...rows.entries()]) {
          if (!keepIds.includes(row.reality_id)) rows.delete(key);
        }
        return { rowsAffected: 0 };
      }

      if (query === "DELETE FROM reality_history") {
        rows.clear();
        return { rowsAffected: 0 };
      }

      throw new Error(`Unexpected query in mock history db: ${query}`);
    },
    async select() {
      return [];
    },
  };

  return { db, rows };
}

function createMockPersistDb() {
  const globalState = new Map<string, { state_json: string; updated_at: number }>();
  const realities = new Map<
    string,
    { id: string; name: string; year: number; season_json: string; updated_at: number }
  >();
  const historyRows = new Map<
    string,
    { reality_id: string; entry_id: string; entry_json: string; sort_order: number }
  >();

  const db: SqlExecutor = {
    async execute(query, bindValues = []) {
      if (query.includes("INSERT INTO global_state")) {
        const [storeKey, stateJson, updatedAt] = bindValues as [string, string, number];
        globalState.set(storeKey, { state_json: stateJson, updated_at: updatedAt });
        return { rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO realities")) {
        const [id, name, year, seasonJson, updatedAt] = bindValues as [
          string,
          string,
          number,
          string,
          number,
        ];
        realities.set(id, {
          id,
          name,
          year,
          season_json: seasonJson,
          updated_at: updatedAt,
        });
        return { rowsAffected: 1 };
      }

      if (query === UPSERT_REALITY_HISTORY_SQL) {
        const [realityId, entryId, entryJson, sortOrder] = bindValues as [
          string,
          string,
          string,
          number,
        ];
        historyRows.set(historyKey(realityId, entryId), {
          reality_id: realityId,
          entry_id: entryId,
          entry_json: entryJson,
          sort_order: sortOrder,
        });
        return { rowsAffected: 1 };
      }

      if (query === "DELETE FROM reality_history WHERE reality_id = ?") {
        const [realityId] = bindValues as [string];
        for (const key of [...historyRows.keys()]) {
          if (key.startsWith(`${realityId}\0`)) historyRows.delete(key);
        }
        return { rowsAffected: 0 };
      }

      if (query === "DELETE FROM realities WHERE id = ?") {
        const [id] = bindValues as [string];
        realities.delete(id);
        return { rowsAffected: 0 };
      }

      if (query.includes("entry_id NOT IN")) {
        const [realityId, ...keepIds] = bindValues as string[];
        for (const [key, row] of [...historyRows.entries()]) {
          if (row.reality_id === realityId && !keepIds.includes(row.entry_id)) {
            historyRows.delete(key);
          }
        }
        return { rowsAffected: 0 };
      }

      if (query.includes("reality_id NOT IN")) {
        const keepIds = bindValues as string[];
        for (const [key, row] of [...historyRows.entries()]) {
          if (!keepIds.includes(row.reality_id)) historyRows.delete(key);
        }
        return { rowsAffected: 0 };
      }

      if (query === "DELETE FROM realities WHERE id = ?") {
        const [id] = bindValues as [string];
        realities.delete(id);
        return { rowsAffected: 0 };
      }

      if (query.includes("id NOT IN")) {
        const keepIds = bindValues as string[];
        for (const id of [...realities.keys()]) {
          if (!keepIds.includes(id)) realities.delete(id);
        }
        return { rowsAffected: 0 };
      }

      if (query === "DELETE FROM reality_history") {
        historyRows.clear();
        return { rowsAffected: 0 };
      }

      if (query === "DELETE FROM realities") {
        realities.clear();
        return { rowsAffected: 0 };
      }

      throw new Error(`Unexpected query in mock persist db: ${query}`);
    },

    async select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
      if (query.includes("FROM global_state")) {
        const [storeKey] = bindValues as [string];
        const row = globalState.get(storeKey);
        return (row ? [{ state_json: row.state_json }] : []) as T[];
      }

      if (query === "SELECT id FROM realities") {
        return [...realities.values()].map((r) => ({ id: r.id })) as T[];
      }

      if (query.includes("FROM realities ORDER BY name")) {
        return [...realities.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => ({
            id: r.id,
            name: r.name,
            year: r.year,
            season_json: r.season_json,
          })) as T[];
      }

      if (query.includes("FROM reality_history")) {
        const [realityId] = bindValues as [string];
        return [...historyRows.values()]
          .filter((r) => r.reality_id === realityId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => ({ entry_json: r.entry_json })) as T[];
      }

      throw new Error(`Unexpected select in mock persist db: ${query}`);
    },
  };

  return { db, globalState, realities, historyRows };
}

function makeReality(id: string, name: string) {
  return {
    id,
    name,
    year: 2026,
    season: { franchise: { id, year: 2026 } },
    history: [makeEntry(`${id}-season`, name)],
  };
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

describe("syncRemovedRealities", () => {
  it("deletes removed reality rows and their history", async () => {
    const { db, realities, historyRows } = createMockPersistDb();
    realities.set("r1", {
      id: "r1",
      name: "A",
      year: 1,
      season_json: "{}",
      updated_at: 1,
    });
    realities.set("r2", {
      id: "r2",
      name: "B",
      year: 2,
      season_json: "{}",
      updated_at: 1,
    });
    historyRows.set(historyKey("r1", "h1"), {
      reality_id: "r1",
      entry_id: "h1",
      entry_json: "{}",
      sort_order: 0,
    });
    historyRows.set(historyKey("r2", "h2"), {
      reality_id: "r2",
      entry_id: "h2",
      entry_json: "{}",
      sort_order: 0,
    });

    await syncRemovedRealities(db, ["r1"]);

    expect(realities.has("r1")).toBe(true);
    expect(realities.has("r2")).toBe(false);
    expect(historyRows.has(historyKey("r1", "h1"))).toBe(true);
    expect(historyRows.has(historyKey("r2", "h2"))).toBe(false);
  });
});

describe("savePersistedStateToDb reality CRUD", () => {
  beforeEach(() => {
    resetSqliteStorageForTests();
  });

  afterEach(() => {
    resetSqliteStorageForTests();
  });

  it("delete reality → reload → gone", async () => {
    const { db, realities } = createMockPersistDb();
    setDesktopDatabaseForTests(db);

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: "r1",
        realities: [makeReality("r1", "LCK")],
      },
      { forceAllHistory: true },
    );
    expect(realities.size).toBe(1);

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: null,
        realities: [],
      },
      { forceAllHistory: true },
    );
    expect(realities.size).toBe(0);

    const reloaded = await loadPersistedStateFromDb(STORE_KEY);
    expect(reloaded?.realities).toEqual([]);
    expect(reloaded?.activeRealityId).toBeNull();
  });

  it("2 realities → delete 1 → reload → 1 remains", async () => {
    const { db, realities, historyRows } = createMockPersistDb();
    setDesktopDatabaseForTests(db);

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: "r1",
        realities: [makeReality("r1", "LCK"), makeReality("r2", "LEC")],
      },
      { forceAllHistory: true },
    );

    expect(realities.size).toBe(2);
    expect(historyRows.size).toBe(2);

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: "r1",
        realities: [makeReality("r1", "LCK")],
      },
      { forceAllHistory: true },
    );

    expect(realities.size).toBe(1);
    expect(realities.has("r2")).toBe(false);
    expect(historyRows.size).toBe(1);
    expect(historyRows.has(historyKey("r2", "r2-season"))).toBe(false);

    const reloaded = await loadPersistedStateFromDb(STORE_KEY);
    expect(reloaded?.realities).toHaveLength(1);
    expect(reloaded?.realities?.[0]?.id).toBe("r1");
  });

  it("update season → reload → changes kept", async () => {
    const { db, realities } = createMockPersistDb();
    setDesktopDatabaseForTests(db);

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: "r1",
        realities: [
          {
            id: "r1",
            name: "LCK",
            year: 1,
            season: { franchise: { id: "r1", year: 1 }, status: "in_progress" },
            history: [],
          },
        ],
      },
      { forceAllHistory: true },
    );

    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: "r1",
        realities: [
          {
            id: "r1",
            name: "LCK",
            year: 3,
            season: { franchise: { id: "r1", year: 3 }, status: "complete" },
            history: [],
          },
        ],
      },
      { forceAllHistory: true },
    );

    const reloaded = await loadPersistedStateFromDb(STORE_KEY);
    expect(reloaded?.realities).toHaveLength(1);
    expect(reloaded?.realities?.[0]?.year).toBe(3);
    const season = reloaded?.realities?.[0]?.season as {
      franchise?: { year?: number };
      status?: string;
    };
    expect(season.franchise?.year).toBe(3);
    expect(season.status).toBe("complete");
    expect(realities.get("r1")?.year).toBe(3);
  });
});
