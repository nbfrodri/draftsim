import { markRealityHistoryLoaded, loadRealitySeasonFromDb, loadRealityHistoryFromDb, savePersistedStateToDbExecutor, SELECT_FRAGMENT_PART_SQL, SELECT_FRAGMENT_SIZES_SQL, SELECT_HISTORY_PART_SQL, SELECT_HISTORY_SIZES_SQL, SELECT_SEASON_PART_SQL, SELECT_SEASON_SIZE_SQL, SELECT_EVENT_RECORD_COUNTS_SQL, SELECT_EVENT_RECORDS_PART_SQL, SELECT_EVENT_RECORDS_SIZE_SQL } from "./desktopSqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SeasonHistoryEntry } from "@/lib/season/history";

vi.mock("./desktopStorage", () => ({
  setPersistLoadStage: vi.fn(),
  isDesktop: () => true,
  desktopStorage: {
    getItem: vi.fn(),
  },
  signalCompactingDatabase: vi.fn(),
  clearDesktopOperation: vi.fn(),
}));

import {
  deleteRealityFromDb,
  forgetDesktopWriteBaselines,
  loadPersistedStateFromDb,
  loadPersistedStateFromDbExecutor,
  resetSqliteStorageForTests,
  savePersistedStateToDb,
  setDesktopDatabaseForTests,
  syncRemovedRealities,
  syncRealityHistory,
  compactDesktopDatabase,
  measureDesktopDbFootprint,
  formatDesktopDbBytes,
  formatCompactResultMessage,
  recompactAllRealitySeasonsInDb,
  shouldSuggestCompactAfterDelete,
  COMPACT_SUGGEST_HISTORY_THRESHOLD,
  COMPACT_SUGGEST_SEASON_BYTES,
  type SqlExecutor,
} from "./desktopSqlite";
import { signalCompactingDatabase, clearDesktopOperation } from "./desktopStorage";
import { UPDATE_REALITY_HISTORY_ORDER_SQL, UPSERT_EVENT_RECORDS_SQL, UPSERT_REALITY_HISTORY_SQL } from "./desktopSqliteSchema";
import { getSaveDiagnostics, setSaveDiagnosticsEnabled } from "./saveDiagnostics";
import { decompressStoredJson } from "./storedJson";
import { setBreadcrumbInvokeForTests, setBulkBreadcrumbContext } from "./bulkBreadcrumbs";
import {
  compactEncodeTournamentForPersist,
  type RecapCompact,
} from "./recapCompression";
import type { GameRecap } from "./types";
import type { SeasonState } from "./season/types";
import type { TournamentState } from "./tournament";

const STORE_KEY = "draftsim-store";

function historyKey(realityId: string, entryId: string): string {
  return `${realityId}\0${entryId}`;
}

/** Shared reality_event_records emulation for the hand-written SQL mocks. */
function mockEventRecords() {
  const rows = new Map<string, { reality_id: string; entry_id: string; records_json: string; record_count: number }>();
  const execute = (query: string, bindValues: unknown[]): { rowsAffected: number } | undefined => {
    if (query === UPSERT_EVENT_RECORDS_SQL) {
      const [reality_id, entry_id, records_json, record_count] = bindValues as [string, string, string, number];
      rows.set(historyKey(reality_id, entry_id), { reality_id, entry_id, records_json, record_count });
      return { rowsAffected: 1 };
    }
    if (!query.includes("reality_event_records")) return undefined;
    if (query === "DELETE FROM reality_event_records") rows.clear();
    else if (query === "DELETE FROM reality_event_records WHERE reality_id = ? AND entry_id = ?") rows.delete(historyKey(bindValues[0] as string, bindValues[1] as string));
    else if (query === "DELETE FROM reality_event_records WHERE reality_id = ?") { for (const [k, r] of [...rows]) if (r.reality_id === bindValues[0]) rows.delete(k); }
    else if (query.includes("entry_id NOT IN")) { const [rid, ...keep] = bindValues as string[]; for (const [k, r] of [...rows]) if (r.reality_id === rid && !keep.includes(r.entry_id)) rows.delete(k); }
    else throw new Error(`Unexpected records query: ${query}`);
    return { rowsAffected: 0 };
  };
  const select = <T,>(query: string, bindValues: unknown[]): T[] | undefined => {
    if (query === SELECT_EVENT_RECORD_COUNTS_SQL) return [...rows.values()].filter(r => r.reality_id === bindValues[0]).map(r => ({ entry_id: r.entry_id, record_count: r.record_count })) as T[];
    if (query === SELECT_EVENT_RECORDS_SIZE_SQL) { const r = rows.get(historyKey(bindValues[0] as string, bindValues[1] as string)); return (r ? [{ chars: r.records_json.length }] : []) as T[]; }
    if (query === SELECT_EVENT_RECORDS_PART_SQL) { const [start, length, rid, eid] = bindValues as [number, number, string, string]; const r = rows.get(historyKey(rid, eid)); return (r ? [{ part: r.records_json.slice(start - 1, start - 1 + length) }] : []) as T[]; }
    return undefined;
  };
  return { rows, execute, select };
}

function createMockHistoryDb() {
  const rows = new Map<
    string,
    { reality_id: string; entry_id: string; entry_json: string; sort_order: number }
  >();

  const records = mockEventRecords();
  const db: SqlExecutor = {
    async execute(query, bindValues = []) {
      const handled = records.execute(query, bindValues);
      if (handled) return handled;
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

      if (query === UPDATE_REALITY_HISTORY_ORDER_SQL) {
        const [sortOrder, realityId, entryId] = bindValues as [number, string, string];
        const row = rows.get(historyKey(realityId, entryId));
        if (row) row.sort_order = sortOrder;
        return { rowsAffected: row ? 1 : 0 };
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
    async select<T>(query: string, bindValues: unknown[] = []) {
      return records.select<T>(query, bindValues) ?? [];
    },
  };

  return { db, rows, records: records.rows };
}

function createMockPersistDb() {
  let schemaVersion = "7";
  const catalog = new Map<string, string>();
  const fragments = new Map<string, { store_key: string; fragment_key: string; value_json: string }>();
  const globalState = new Map<string, { state_json: string; updated_at: number }>();
  const realities = new Map<
    string,
    { id: string; name: string; year: number; season_json: string; updated_at: number }
  >();
  const historyRows = new Map<
    string,
    { reality_id: string; entry_id: string; entry_json: string; sort_order: number }
  >();
  const records = mockEventRecords();

  const db: SqlExecutor = {
    async execute(query, bindValues = []) {
      const handled = records.execute(query, bindValues);
      if (handled) return handled;
      if (query.startsWith("INSERT INTO reality_catalog")) {
        catalog.set(bindValues[0] as string, bindValues[1] as string); return { rowsAffected: 1 };
      }
      if (query.startsWith("UPDATE realities SET name")) {
        const row = realities.get(bindValues[2] as string);
        if (row) { row.name = bindValues[0] as string; row.year = bindValues[1] as number; }
        return { rowsAffected: row ? 1 : 0 };
      }
      if (query.startsWith("INSERT INTO global_fragments")) {
        const [store_key, fragment_key, value_json] = bindValues as string[];
        fragments.set(`${store_key}:${fragment_key}`, { store_key, fragment_key, value_json });
        return { rowsAffected: 1 };
      }
      if (query.startsWith("DELETE FROM global_fragments")) {
        for (const [key, row] of fragments) if (row.store_key === bindValues[0] && (!bindValues[1] || row.fragment_key === bindValues[1])) fragments.delete(key);
        return { rowsAffected: 1 };
      }
      if (query.startsWith("INSERT INTO schema_meta")) { schemaVersion = bindValues[0] as string; return { rowsAffected: 1 }; }
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

      if (query === UPDATE_REALITY_HISTORY_ORDER_SQL) {
        const [sortOrder, realityId, entryId] = bindValues as [number, string, string];
        const row = historyRows.get(historyKey(realityId, entryId));
        if (row) row.sort_order = sortOrder;
        return { rowsAffected: row ? 1 : 0 };
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
      const recordRows = records.select<T>(query, bindValues);
      if (recordRows) return recordRows;
      // Chunked large-text reads: sizes first, then substr parts (1-based, like SQLite).
      const part = (text: string | undefined) => {
        const [start, length] = bindValues as [number, number];
        return (text == null ? [] : [{ part: text.slice(start - 1, start - 1 + length) }]) as T[];
      };
      if (query === SELECT_SEASON_SIZE_SQL) { const r = realities.get(bindValues[0] as string); return (r ? [{ chars: r.season_json?.length ?? null }] : []) as T[]; }
      if (query === SELECT_SEASON_PART_SQL) return part(realities.get(bindValues[2] as string)?.season_json);
      if (query === SELECT_FRAGMENT_SIZES_SQL) return [...fragments.values()].filter(row => row.store_key === bindValues[0]).map(row => ({ fragment_key: row.fragment_key, chars: row.value_json.length })) as T[];
      if (query === SELECT_FRAGMENT_PART_SQL) return part([...fragments.values()].find(row => row.store_key === bindValues[2] && row.fragment_key === bindValues[3])?.value_json);
      if (query === SELECT_HISTORY_SIZES_SQL) {
        return [...historyRows.values()].filter(r => r.reality_id === bindValues[0]).sort((a, b) => a.sort_order - b.sort_order)
          .map(r => ({ entry_id: r.entry_id, sort_order: r.sort_order, chars: r.entry_json.length })) as T[];
      }
      if (query === SELECT_HISTORY_PART_SQL) return part(historyRows.get(historyKey(bindValues[2] as string, bindValues[3] as string))?.entry_json);
      if (query.includes("FROM schema_meta")) return [{ value: schemaVersion }] as T[];
      if (query.includes("FROM global_fragments")) return [...fragments.values()].filter(row => row.store_key === bindValues[0]) as T[];
      if (query.includes("FROM global_state")) {
        const [storeKey] = bindValues as [string];
        const row = globalState.get(storeKey);
        return (row ? [{ state_json: row.state_json }] : []) as T[];
      }

      if (query === "SELECT id FROM realities WHERE id = ?") return (realities.has(bindValues[0] as string) ? [{ id: bindValues[0] }] : []) as T[];
      if (query === "SELECT season_json FROM realities WHERE id = ?") return (realities.has(bindValues[0] as string) ? [{ season_json: realities.get(bindValues[0] as string)!.season_json }] : []) as T[];
      if (query === "SELECT id FROM realities") {
        return [...realities.values()].map((r) => ({ id: r.id })) as T[];
      }

      if (query.includes("FROM realities LEFT JOIN reality_catalog")) {
        return [...realities.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((r) => ({
            id: r.id,
            name: r.name,
            year: r.year,
            season_json: r.id === bindValues[0] ? r.season_json : null,
            summary_json: catalog.get(r.id) ?? "{}",
          })) as T[];
      }

      if (query.includes("FROM reality_history")) {
        const [realityId] = bindValues as [string];
        return [...historyRows.values()]
          .filter((r) => r.reality_id === realityId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => ({ entry_id: r.entry_id, entry_json: r.entry_json, sort_order: r.sort_order })) as T[];
      }

      throw new Error(`Unexpected select in mock persist db: ${query}`);
    },
  };

  return { db, globalState, realities, historyRows, fragments };
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
    expect(await decompressStoredJson(rows.get(historyKey("reality-1", "season-2026"))!.entry_json)).toBe(
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
    expect(await decompressStoredJson(rows.get(historyKey("reality-1", "season-2026"))!.entry_json)).toBe(
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

  it("delete reality → reload → gone (via deleteRealityFromDb + persist flush)", async () => {
    // Simulates the real deleteReality() flow:
    //   1. deleteRealityFromDb() removes the row directly.
    //   2. The background Zustand persist flush fires with realities: [].
    // Because the DB is already empty when the flush runs, the wipe guard
    // lets it through (DB count = 0).
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

    // Step 1: direct DB removal (deleteRealityFromDb is called by deleteReality action)
    await deleteRealityFromDb("r1");
    expect(realities.size).toBe(0);

    // Step 2: Zustand persist flush with empty in-memory realities.
    // Guard should pass because DB is already empty.
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

  it("wipe guard: empty-state persist does NOT delete existing realities", async () => {
    // Reproduces the post-reboot failure: getItem() returned null (DB briefly
    // locked during WAL recovery) → store initialised with empty state →
    // enablePersistWrites() fired → setChampions useEffect triggered setItem()
    // with realities:[] → savePersistedStateToDb called while DB has data.
    // The guard must abort and leave the existing rows untouched.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { db, realities } = createMockPersistDb();
    setDesktopDatabaseForTests(db);

    // Seed the DB with two realities (simulates a prior healthy session).
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

    // Now simulate the failed-hydration write: realities: [] with DB non-empty.
    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: null,
        realities: [],
      },
      { forceAllHistory: true },
    );

    // Guard must have fired — both realities must still be in the DB.
    expect(realities.size).toBe(2);
    expect(realities.has("r1")).toBe(true);
    expect(realities.has("r2")).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SAFETY"));

    warnSpy.mockRestore();
  });

  it("wipe guard: empty-state persist IS allowed when DB is already empty", async () => {
    // After the user deletes all realities, the DB should be empty already
    // (deleteRealityFromDb handled each individual removal). An empty-state
    // persist flush should succeed and not be blocked by the guard.
    const { db, realities } = createMockPersistDb();
    setDesktopDatabaseForTests(db);

    // DB is empty from the start — no realities ever written.
    await savePersistedStateToDb(
      STORE_KEY,
      {
        soundEnabled: true,
        activeRealityId: null,
        realities: [],
      },
      { forceAllHistory: true },
    );

    // Should succeed (global_state written, no wipe attempted).
    expect(realities.size).toBe(0);
    const reloaded = await loadPersistedStateFromDb(STORE_KEY);
    expect(reloaded?.realities).toEqual([]);
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
            season: { franchise: { id: "r1", year: 1 }, status: "in-progress" },
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

describe("shouldSuggestCompactAfterDelete", () => {
  it("suggests compact when history exceeds threshold", () => {
    const history = Array.from({ length: COMPACT_SUGGEST_HISTORY_THRESHOLD + 1 }, (_, i) => ({
      id: `h${i}`,
    }));
    expect(shouldSuggestCompactAfterDelete({ history, season: {} })).toBe(true);
  });

  it("suggests compact when season JSON exceeds size threshold", () => {
    const bigSeason = { blob: "x".repeat(COMPACT_SUGGEST_SEASON_BYTES + 1) };
    expect(shouldSuggestCompactAfterDelete({ history: [], season: bigSeason })).toBe(true);
  });

  it("does not suggest compact for small realities", () => {
    expect(shouldSuggestCompactAfterDelete({ history: [], season: { year: 1 } })).toBe(false);
  });
});

describe("compactDesktopDatabase", () => {
  beforeEach(() => {
    resetSqliteStorageForTests();
    vi.mocked(signalCompactingDatabase).mockClear();
    vi.mocked(clearDesktopOperation).mockClear();
  });

  afterEach(() => {
    resetSqliteStorageForTests();
  });

  it("runs VACUUM and toggles the operation overlay", async () => {
    const queries: string[] = [];
    let pageCount = 8;
    const db: SqlExecutor = {
      async execute(query) {
        queries.push(query);
        if (query === "VACUUM") pageCount = 4;
        return { rowsAffected: 0 };
      },
      async select(query) {
        if (query === "PRAGMA page_count") return [{ page_count: pageCount }];
        if (query === "PRAGMA page_size") return [{ page_size: 4096 }];
        if (query === "PRAGMA freelist_count") return [{ freelist_count: 0 }];
        return [];
      },
    };
    setDesktopDatabaseForTests(db);

    const result = await compactDesktopDatabase();

    expect(queries).toContain("VACUUM");
    expect(signalCompactingDatabase).toHaveBeenCalledOnce();
    expect(clearDesktopOperation).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      freedBytes: (8 - 4) * 4096,
      footprint: {
        globalBytes: 0,
        seasonBytes: 0,
        historyBytes: 0,
        fileBytes: 4 * 4096,
      },
    });
  });
});

describe("formatDesktopDbBytes", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatDesktopDbBytes(512)).toBe("512 B");
    expect(formatDesktopDbBytes(2048)).toBe("2.0 KB");
    expect(formatDesktopDbBytes(12.3 * 1024 * 1024)).toBe("12.3 MB");
  });
});

describe("formatCompactResultMessage", () => {
  it("includes freed space and footprint breakdown", () => {
    const message = formatCompactResultMessage({
      freedBytes: 12.3 * 1024 * 1024,
      footprint: {
        globalBytes: 1000,
        seasonBytes: 41 * 1024 * 1024,
        historyBytes: 2 * 1024 * 1024,
        fileBytes: 50 * 1024 * 1024,
        freelistCount: 0,
        realities: [],
      },
    });
    expect(message).toBe(
      "Database compacted — freed 12.3 MB (season 41.0 MB · history 2.0 MB · global 1000 B · file 50.0 MB)",
    );
  });
});

describe("measureDesktopDbFootprint", () => {
  it("returns expected lengths for fake rows", async () => {
    const seasonJson = '{"tournaments":{}}';
    const historyJson = '{"id":"h1"}';
    const globalJson = '{"version":1}';

    const db: SqlExecutor = {
      async execute() {
        return { rowsAffected: 0 };
      },
      async select(query) {
        if (query.includes("FROM global_state")) {
          return [{ bytes: globalJson.length }];
        }
        if (query.includes("FROM realities") && query.includes("season_bytes")) {
          return [
            { id: "r1", name: "Alpha", season_bytes: seasonJson.length },
            { id: "r2", name: "Beta", season_bytes: 10 },
          ];
        }
        if (query.includes("FROM reality_history")) {
          return [
            {
              reality_id: "r1",
              history_bytes: historyJson.length * 2,
              history_count: 2,
            },
          ];
        }
        if (query === "PRAGMA page_count") return [{ page_count: 4 }];
        if (query === "PRAGMA page_size") return [{ page_size: 4096 }];
        if (query === "PRAGMA freelist_count") return [{ freelist_count: 1 }];
        throw new Error(`Unexpected select: ${query}`);
      },
    };

    const fp = await measureDesktopDbFootprint(db);
    expect(fp.globalBytes).toBe(globalJson.length);
    expect(fp.seasonBytes).toBe(seasonJson.length + 10);
    expect(fp.historyBytes).toBe(historyJson.length * 2);
    expect(fp.fileBytes).toBe(4 * 4096);
    expect(fp.freelistCount).toBe(1);
    expect(fp.realities).toEqual([
      {
        id: "r1",
        name: "Alpha",
        seasonBytes: seasonJson.length,
        historyBytes: historyJson.length * 2,
        historyCount: 2,
      },
      {
        id: "r2",
        name: "Beta",
        seasonBytes: 10,
        historyBytes: 0,
        historyCount: 0,
      },
    ]);
  });
});

describe("recompactAllRealitySeasonsInDb", () => {
  it("slims completed tournaments and keeps compact recaps on incomplete ones", async () => {
    const fatRecap: GameRecap = {
      durationMinutes: 32,
      mvp: {
        side: "blue",
        lane: "bottom",
        championId: 1,
        kills: 9,
        deaths: 1,
        assists: 6,
        laneGoldDiff: 2800,
        playerName: "MVP",
      },
      biggestSwing: null,
      winProbTimeline: Array.from({ length: 40 }, (_, i) => ({
        minute: i,
        blueProb: 0.5,
      })),
      goldLeadTimeline: Array.from({ length: 40 }, (_, i) => ({
        minute: i,
        goldLead: i * 100,
      })),
      notableEvents: [
        {
          minute: 12,
          side: "blue",
          type: "baron",
          description: "Baron",
          probDelta: 0.1,
        },
      ],
      perPickKDA: {
        blue: [
          { k: 1, d: 0, a: 2 },
          { k: 2, d: 1, a: 3 },
          { k: 3, d: 0, a: 4 },
          { k: 4, d: 1, a: 5 },
          { k: 5, d: 0, a: 6 },
        ],
        red: [
          { k: 0, d: 1, a: 1 },
          { k: 1, d: 2, a: 1 },
          { k: 0, d: 3, a: 2 },
          { k: 1, d: 2, a: 0 },
          { k: 0, d: 4, a: 1 },
        ],
      },
      ratings: {
        blue: [8.5, 7.2, 9.1, 6.5, 5.8],
        red: [3.2, 4.1, 2.9, 3.5, 4.8],
      },
    };

    const makeT = (id: string, status: TournamentState["status"]) =>
      ({
        id,
        status,
        matches: [
          {
            id: `${id}-m`,
            series: { games: [{ recap: { ...fatRecap } }] },
          },
        ],
      }) as unknown as TournamentState;

    const season: SeasonState = {
      tournaments: {
        done: makeT("done", "complete"),
        live: makeT("live", "in-progress"),
      },
    } as unknown as SeasonState;

    // Store a bloated (decoded) season like an old import.
    let stored = JSON.stringify(season);
    const updates: string[] = [];

    const db: SqlExecutor = {
      async execute(query, bindValues = []) {
        if (query.includes("UPDATE realities SET season_json")) {
          stored = bindValues[0] as string;
          updates.push(stored);
          return { rowsAffected: 1 };
        }
        return { rowsAffected: 0 };
      },
      async select(query) {
        if (query.includes("FROM realities")) {
          return [
            {
              id: "r1",
              name: "Test",
              year: 2026,
              season_json: stored,
            },
          ];
        }
        return [];
      },
    };

    const rewritten = await recompactAllRealitySeasonsInDb(db);
    expect(rewritten).toBe(1);
    expect(updates).toHaveLength(1);

    const next = JSON.parse(updates[0]!) as SeasonState;
    const doneRecap = next.tournaments.done!.matches[0]!.series!.games[0]!
      .recap as GameRecap & { recapC?: RecapCompact };
    expect(doneRecap.winProbTimeline).toBeUndefined();
    expect(doneRecap.goldLeadTimeline).toBeUndefined();
    expect(doneRecap.notableEvents).toBeUndefined();
    expect(doneRecap.perPickKDA).toBeUndefined();
    expect(doneRecap.recapC).toEqual({ kda: [1, 0, 2, 2, 1, 3, 3, 0, 4, 4, 1, 5, 5, 0, 6, 0, 1, 1, 1, 2, 1, 0, 3, 2, 1, 2, 0, 0, 4, 1] });
    expect(doneRecap.mvp?.playerName).toBe("MVP");

    const liveRecap = next.tournaments.live!.matches[0]!.series!.games[0]!
      .recap as GameRecap & { recapC?: RecapCompact };
    expect(liveRecap.winProbTimeline).toBeUndefined();
    expect(liveRecap.recapC?.wp).toBeDefined();
    expect(liveRecap.mvp?.playerName).toBe("MVP");

    // Idempotent second pass.
    const again = await recompactAllRealitySeasonsInDb(db);
    expect(again).toBe(0);
  });

  it("compact-encodes incomplete tournaments that already had recapC", async () => {
    const recap: GameRecap = {
      durationMinutes: 28,
      mvp: null,
      biggestSwing: null,
      winProbTimeline: [{ minute: 1, blueProb: 0.6 }],
    };
    const live = compactEncodeTournamentForPersist({
      id: "live",
      status: "in-progress",
      matches: [{ id: "m", series: { games: [{ recap }] } }],
    } as unknown as TournamentState);

    let stored = JSON.stringify({
      tournaments: { live },
    });

    const db: SqlExecutor = {
      async execute(query, bindValues = []) {
        if (query.includes("UPDATE realities SET season_json")) {
          stored = bindValues[0] as string;
          return { rowsAffected: 1 };
        }
        return { rowsAffected: 0 };
      },
      async select() {
        return [
          { id: "r1", name: "Test", year: 2026, season_json: stored },
        ];
      },
    };

    await recompactAllRealitySeasonsInDb(db);
    const next = JSON.parse(stored) as SeasonState;
    const out = next.tournaments.live!.matches[0]!.series!.games[0]!
      .recap as GameRecap & { recapC?: RecapCompact };
    expect(out.recapC?.wp).toBeDefined();
    expect(out.winProbTimeline).toBeUndefined();
  });
});


describe("lazy-history safety and write budget", () => {
  beforeEach(() => resetSqliteStorageForTests());
  it("an active but unloaded placeholder never deletes existing history", async () => {
    const { db, historyRows } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    const reality = makeReality("r", "Saved");
    await savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [reality] }, { forceAllHistory: true });
    resetSqliteStorageForTests(); setDesktopDatabaseForTests(db);
    await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: "r", realities: [{ ...reality, history: [] }] });
    expect(historyRows.size).toBe(1);
    // A read discarded by a later switch must not authorize the stale [] either.
    expect(await loadRealityHistoryFromDb("r")).toHaveLength(1);
    await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: "other", realities: [{ ...reality, history: [] }] });
    expect(historyRows.size).toBe(1);
  });
  it("does not rewrite 100 unchanged realities and 10000 historical seasons", async () => {
    const { db } = createMockPersistDb();
    const realities = Array.from({ length: 100 }, (_, n) => ({
      ...makeReality("r"+n, "Reality "+n),
      history: Array.from({ length: 100 }, (_, y) => makeEntry("year"+y, "Year "+y)),
    }));
    const execute = vi.spyOn(db, "execute");
    await savePersistedStateToDbExecutor(db, STORE_KEY, { realities }, { forceAllHistory: true });
    const initialHistoryWrites = execute.mock.calls.filter(([query]) => query === UPSERT_REALITY_HISTORY_SQL).length;
    execute.mockClear();
    await savePersistedStateToDbExecutor(db, STORE_KEY, { realities, soundEnabled: false });
    expect(initialHistoryWrites).toBe(10000);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toContain("global_state");
  });
});


it("does not rewrite loaded history on the first startup save, but persists subsequent changes", async () => {
  const { db, historyRows } = createMockPersistDb();
  setDesktopDatabaseForTests(db);
  const reality = { ...makeReality("startup", "Startup"), history: Array.from({ length: 100 }, (_, i) => makeEntry(`year-${i}`, `Year ${i}`)) };
  await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: reality.id, realities: [reality] }, { forceAllHistory: true });
  resetSqliteStorageForTests();
  setDesktopDatabaseForTests(db);
  const loaded = (await loadPersistedStateFromDb(STORE_KEY))!;
  const execute = vi.spyOn(db, "execute");
  await savePersistedStateToDbExecutor(db, STORE_KEY, { ...loaded, soundEnabled: false });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][0]).toContain("global_state");
  expect(historyRows.size).toBe(100);
  const active = loaded.realities![0];
  await savePersistedStateToDbExecutor(db, STORE_KEY, { ...loaded, realities: [{ ...active, history: [...(active.history ?? []), makeEntry("next", "Next")] }] });
  expect(historyRows.size).toBe(101);
});


it("skips unchanged global snapshots but commits changed fields and retries failed batches", async () => {
  const { db } = createMockPersistDb();
  const reality = makeReality("manual", "Manual save");
  const season = { tournaments: {}, largePayload: "x".repeat(100_000) };
  const state = { realities: [reality], season, volume: 0.5 };
  const execute = vi.spyOn(db, "execute");
  await savePersistedStateToDbExecutor(db, STORE_KEY, state);
  execute.mockClear();
  await savePersistedStateToDbExecutor(db, STORE_KEY, { ...state, realities: [{ ...reality }] });
  expect(execute).not.toHaveBeenCalled();
  await savePersistedStateToDbExecutor(db, STORE_KEY, { ...state, volume: 0.7 });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(JSON.parse(execute.mock.calls[0][1]![1] as string).volume).toBe(0.7);

  const batch = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
  db.batch = batch;
  const changed = { ...state, volume: 0.9 };
  await expect(savePersistedStateToDbExecutor(db, STORE_KEY, changed)).rejects.toThrow("disk full");
  await savePersistedStateToDbExecutor(db, STORE_KEY, changed);
  expect(batch).toHaveBeenCalledTimes(2);
  expect(batch.mock.calls[1][0].some((s: { query: string }) => s.query.includes("global_state"))).toBe(true);
});


describe("inactive season persistence", () => {
  beforeEach(() => resetSqliteStorageForTests());
  it("preserves an unfinished season without Hall entries through lazy startup and settings saves", async () => {
    const { db, realities } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    const active = makeReality("active", "Active");
    const dormant = { ...makeReality("dormant", "Dormant"), history: [], season: {
      status: "in-progress", tournaments: {}, franchise: { year: 2 },
      fixtureProgress: { split: "winter", played: 12, wins: 7 },
    } };
    await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: active.id, realities: [active, dormant] }, { forceAllHistory: true });
    const original = realities.get(dormant.id)!.season_json;
    resetSqliteStorageForTests(); setDesktopDatabaseForTests(db);
    const loaded = (await loadPersistedStateFromDb(STORE_KEY))!;
    expect(loaded.realities!.find(r => r.id === dormant.id)!.season).toBeNull();
    expect(loaded.realities!.find(r => r.id === active.id)!.season).not.toBeNull();
    await savePersistedStateToDbExecutor(db, STORE_KEY, { ...loaded, soundEnabled: false });
    expect(realities.get(dormant.id)!.season_json).toBe(original);
    expect(await loadRealitySeasonFromDb(dormant.id)).toEqual(JSON.parse(original));
    expect(await loadRealityHistoryFromDb(dormant.id)).toEqual([]);
  });
  it("refuses to replace a missing inactive body with an empty season", async () => {
    const { db } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    await expect(savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [{ ...makeReality("missing", "Missing"), season: null }] })).rejects.toThrow();
    await expect(loadRealitySeasonFromDb("missing")).rejects.toThrow();
  });
  it("fails hydration when a required competitive fragment is missing", async () => {
    const { db, fragments } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    await savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [], season: { status: "in-progress" } });
    fragments.clear();
    await expect(loadPersistedStateFromDb(STORE_KEY)).rejects.toThrow();
  });
});


it("does not reinterpret a damaged format-8 root as a legacy save", async () => {
  const { db, globalState, fragments } = createMockPersistDb();
  setDesktopDatabaseForTests(db);
  await savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [], season: { status: "in-progress" } });
  const row = globalState.get(STORE_KEY)!;
  const root = JSON.parse(row.state_json);
  delete root._draftsimFragments;
  row.state_json = JSON.stringify(root);
  await expect(loadPersistedStateFromDb(STORE_KEY)).rejects.toThrow("manifest is missing");
  expect(fragments.size).toBe(1);
});

it("does not re-encode or rewrite a dormant archive just read from SQLite, but saves subsequent edits", async () => {
  resetSqliteStorageForTests();
  const { db, historyRows } = createMockPersistDb();
  setDesktopDatabaseForTests(db);
  const active = makeReality("active", "Active");
  const dormant = { ...makeReality("dormant", "Dormant"), history: Array.from({ length: 5 }, (_, i) => makeEntry(`year-${i}`, `Year ${i}`)) };
  await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: active.id, realities: [active, dormant] }, { forceAllHistory: true });
  resetSqliteStorageForTests(); setDesktopDatabaseForTests(db);
  const loaded = (await loadPersistedStateFromDb(STORE_KEY))!;
  const history = await loadRealityHistoryFromDb(dormant.id);
  markRealityHistoryLoaded(dormant.id, history);
  const installed = { ...loaded, realities: loaded.realities!.map(r => r.id === dormant.id ? { ...r, history } : r) };
  const execute = vi.spyOn(db, "execute");
  await savePersistedStateToDbExecutor(db, STORE_KEY, installed);
  expect(execute).not.toHaveBeenCalled();
  const edited = { ...installed, realities: installed.realities.map(r => r.id === dormant.id ? { ...r, history: history.slice(1) } : r) };
  await savePersistedStateToDbExecutor(db, STORE_KEY, edited);
  // The removed year is deleted and the remaining rows move up without re-encoding.
  expect(execute.mock.calls.some(([query]) => query === UPSERT_REALITY_HISTORY_SQL)).toBe(false);
  expect([...historyRows.values()].filter(r => r.reality_id === dormant.id).map(r => [r.entry_id, r.sort_order]).sort())
    .toEqual(history.slice(1).map((e, i) => [e.id, i]).sort());
  resetSqliteStorageForTests();
});

it("persists nonempty history after module load flags are lost, while empty dormant placeholders stay protected", async () => {
  resetSqliteStorageForTests();
  const { db, historyRows } = createMockPersistDb();
  const populated = { ...makeReality("hmr", "HMR"), history: Array.from({ length: 5 }, (_, i) => makeEntry(`y-${i}`, `Year ${i}`)) };
  await savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [populated] });
  expect(historyRows.size).toBe(5);
  resetSqliteStorageForTests();
  await savePersistedStateToDbExecutor(db, STORE_KEY, { realities: [{ ...populated, history: [] }] });
  expect(historyRows.size).toBe(5);
});

describe("incremental history sync", () => {
  beforeEach(() => resetSqliteStorageForTests());
  afterEach(() => resetSqliteStorageForTests());

  const realityWith = (history: SeasonHistoryEntry[]) => ({
    id: "r", name: "Bulk", year: 2026, season: { franchise: { id: "r", year: 2026 } }, history,
  });
  const stateWith = (history: SeasonHistoryEntry[]) => ({ activeRealityId: "r", realities: [realityWith(history)] });
  /** Entry ids whose JSON was encoded and upserted, in call order. */
  const upsertedIds = (execute: { mock: { calls: unknown[][] } }) =>
    execute.mock.calls.filter(([query]) => query === UPSERT_REALITY_HISTORY_SQL).map(([, values]) => (values as unknown[])[1]);
  const storedOrder = (rows: ReturnType<typeof createMockPersistDb>["historyRows"]) =>
    [...rows.values()].sort((a, b) => a.sort_order - b.sort_order).map(r => r.entry_id);

  it.each([
    ["prepended (archive order)", (history: SeasonHistoryEntry[], entry: SeasonHistoryEntry) => [entry, ...history]],
    ["appended", (history: SeasonHistoryEntry[], entry: SeasonHistoryEntry) => [...history, entry]],
  ])("encodes each %s year exactly once across sequential saves", async (_label, add) => {
    const { db, historyRows } = createMockPersistDb();
    const execute = vi.spyOn(db, "execute");
    let history: SeasonHistoryEntry[] = [];
    for (let year = 1; year <= 8; year++) {
      history = add(history, makeEntry(`year-${year}`, `Year ${year}`));
      await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(history));
    }
    const ids = upsertedIds(execute);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(storedOrder(historyRows)).toEqual(history.map(e => e.id));
    expect([...historyRows.values()].map(r => r.sort_order).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("rewrites an entry replaced by a new object with the same id", async () => {
    const { db, historyRows } = createMockPersistDb();
    const a = makeEntry("a", "A"); const b = makeEntry("b", "B");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([b, a]));
    const execute = vi.spyOn(db, "execute");
    const rearchived = { ...b, name: "B rearchived" };
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([rearchived, a]));
    expect(upsertedIds(execute)).toEqual(["b"]);
    expect(JSON.parse(await decompressStoredJson(historyRows.get(historyKey("r", "b"))!.entry_json)).name).toBe("B rearchived");
  });

  it("updates sort order for reordered rows without re-encoding them", async () => {
    const { db, historyRows } = createMockPersistDb();
    const entries = ["a", "b", "c"].map(id => makeEntry(id, id));
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(entries));
    const execute = vi.spyOn(db, "execute");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([entries[2], entries[0], entries[1]]));
    expect(upsertedIds(execute)).toEqual([]);
    expect(storedOrder(historyRows)).toEqual(["c", "a", "b"]);
  });

  it("deletes a removed entry without rewriting the others", async () => {
    const { db, historyRows } = createMockPersistDb();
    const entries = ["a", "b", "c"].map(id => makeEntry(id, id));
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(entries));
    const execute = vi.spyOn(db, "execute");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([entries[0], entries[2]]));
    expect(upsertedIds(execute)).toEqual([]);
    expect(storedOrder(historyRows)).toEqual(["a", "c"]);
  });

  it("writes the last occurrence of a duplicated id", async () => {
    const { db, historyRows } = createMockPersistDb();
    const a = makeEntry("a", "A");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([a]));
    const newer = { ...a, name: "A newer" };
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([newer, a]));
    expect(historyRows.size).toBe(1);
    expect(historyRows.get(historyKey("r", "a"))).toMatchObject({ sort_order: 1 });
    expect(await decompressStoredJson(historyRows.get(historyKey("r", "a"))!.entry_json)).toBe(JSON.stringify(a));
  });

  it("does not let a failed commit make the retry skip rows that never reached the database", async () => {
    const { db, historyRows } = createMockPersistDb();
    const committed: { query: string; bindValues: unknown[] }[][] = [];
    db.batch = vi.fn(async (statements) => {
      committed.push(statements);
      for (const s of statements) await db.execute(s.query, s.bindValues);
    });
    const a = makeEntry("a", "A"); const b = makeEntry("b", "B");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([a]));
    vi.mocked(db.batch!).mockRejectedValueOnce(new Error("disk full"));
    await expect(savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([b, a]))).rejects.toThrow("disk full");
    expect(historyRows.has(historyKey("r", "b"))).toBe(false);
    committed.length = 0;
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([b, a]));
    const retried = committed.flat().filter(s => s.query === UPSERT_REALITY_HISTORY_SQL).map(s => s.bindValues[1]);
    expect(retried).toEqual(["b", "a"]);
    expect(storedOrder(historyRows)).toEqual(["b", "a"]);
  });

  it("does not trust rows planned by a save whose plan failed", async () => {
    const { db, historyRows } = createMockPersistDb();
    const a = makeEntry("a", "A"); const b = makeEntry("b", "B");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([a]));
    const execute = db.execute.bind(db);
    // Without a native batch statements run directly: fail after b's upsert.
    vi.spyOn(db, "execute").mockImplementation(async (query, values) => {
      if (query.includes("entry_id NOT IN")) throw new Error("locked");
      return execute(query, values);
    });
    await expect(savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([b, a]))).rejects.toThrow("locked");
    historyRows.delete(historyKey("r", "b"));
    vi.mocked(db.execute).mockImplementation(execute);
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([b, a]));
    expect(storedOrder(historyRows)).toEqual(["b", "a"]);
  });

  it("forceAllHistory rewrites every entry", async () => {
    const { db } = createMockPersistDb();
    const entries = ["a", "b", "c"].map(id => makeEntry(id, id));
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(entries));
    const execute = vi.spyOn(db, "execute");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(entries), { forceAllHistory: true });
    expect(upsertedIds(execute)).toEqual(["a", "b", "c"]);
  });

  it("rewrites everything after write baselines are forgotten (backup restore)", async () => {
    const { db } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    const entries = ["a", "b"].map(id => makeEntry(id, id));
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(entries));
    await forgetDesktopWriteBaselines();
    const execute = vi.spyOn(db, "execute");
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith([makeEntry("c", "c"), ...entries]));
    expect(upsertedIds(execute)).toEqual(["c", "a", "b"]);
  });

  it("encodes only the new year after hydrating the active history", async () => {
    const { db, historyRows } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    const history = Array.from({ length: 20 }, (_, i) => makeEntry(`year-${i}`, `Year ${i}`));
    await savePersistedStateToDbExecutor(db, STORE_KEY, stateWith(history), { forceAllHistory: true });
    resetSqliteStorageForTests(); setDesktopDatabaseForTests(db);
    const loaded = (await loadPersistedStateFromDb(STORE_KEY))!;
    const active = loaded.realities![0];
    expect(active.history).toEqual(history);
    const execute = vi.spyOn(db, "execute");
    const next = [makeEntry("year-20", "Year 20"), ...(active.history as SeasonHistoryEntry[])];
    await savePersistedStateToDbExecutor(db, STORE_KEY, { ...loaded, realities: [{ ...active, history: next }] });
    expect(upsertedIds(execute)).toEqual(["year-20"]);
    expect(storedOrder(historyRows)).toEqual(next.map(e => e.id));
  });

  it("encodes only the new year after installing a lazily read dormant history", async () => {
    const { db } = createMockPersistDb();
    setDesktopDatabaseForTests(db);
    const active = makeReality("active", "Active");
    const dormant = { ...makeReality("dormant", "Dormant"), history: Array.from({ length: 5 }, (_, i) => makeEntry(`d-${i}`, `D ${i}`)) };
    await savePersistedStateToDbExecutor(db, STORE_KEY, { activeRealityId: active.id, realities: [active, dormant] }, { forceAllHistory: true });
    resetSqliteStorageForTests(); setDesktopDatabaseForTests(db);
    const loaded = (await loadPersistedStateFromDb(STORE_KEY))!;
    const history = await loadRealityHistoryFromDb(dormant.id);
    markRealityHistoryLoaded(dormant.id, history);
    const execute = vi.spyOn(db, "execute");
    const next = [makeEntry("d-5", "D 5"), ...history];
    await savePersistedStateToDbExecutor(db, STORE_KEY, { ...loaded, realities: loaded.realities!.map(r => r.id === dormant.id ? { ...r, history: next } : r) });
    expect(upsertedIds(execute)).toEqual(["d-5"]);
  });

  it("round-trips incrementally written years through a real SQLite database", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { SCHEMA_SQL } = await import("./desktopSqliteSchema");
    const sqlite = new DatabaseSync(":memory:"); sqlite.exec(SCHEMA_SQL);
    type Value = import("node:sqlite").SQLInputValue;
    const run = (query: string, values: unknown[] = []) => sqlite.prepare(query).run(...values as Value[]);
    let failNext = false;
    let historyWrites = 0;
    const executor: SqlExecutor = {
      execute: async (query, values = []) => ({ rowsAffected: Number(run(query, values).changes) }),
      select: async <T>(query: string, values: unknown[] = []) => sqlite.prepare(query).all(...values as Value[]) as T[],
      batch: async (statements) => {
        sqlite.exec("BEGIN");
        try {
          statements.forEach((s, i) => {
            if (failNext && i === statements.length - 1) throw new Error("injected failure");
            if (s.query === UPSERT_REALITY_HISTORY_SQL) historyWrites++;
            run(s.query, s.bindValues);
          });
          sqlite.exec("COMMIT");
        } catch (error) { sqlite.exec("ROLLBACK"); failNext = false; throw error; }
      },
    };
    try {
      let history: SeasonHistoryEntry[] = [];
      for (let year = 1; year <= 6; year++) {
        history = [{ ...makeEntry(`year-${year}`, `Year ${year}`), archivedAt: year }, ...history];
        if (year === 4) {
          failNext = true;
          await expect(savePersistedStateToDbExecutor(executor, STORE_KEY, stateWith(history))).rejects.toThrow("injected failure");
        }
        await savePersistedStateToDbExecutor(executor, STORE_KEY, stateWith(history));
      }
      // 6 new years, plus one full rewrite of 4 years after the injected failure.
      expect(historyWrites).toBeLessThanOrEqual(6 + 4);
      resetSqliteStorageForTests();
      const loaded = (await loadPersistedStateFromDbExecutor(executor, STORE_KEY))!;
      expect(loaded.realities![0].history).toEqual(history);
    } finally { sqlite.close(); }
  });
});

describe("save payload diagnostics", () => {
  beforeEach(() => resetSqliteStorageForTests());
  afterEach(() => { resetSqliteStorageForTests(); setSaveDiagnosticsEnabled(false); setBulkBreadcrumbContext(null); setBreadcrumbInvokeForTests(null); });
  const state = () => ({ activeRealityId: "r", realities: [{ id: "r", name: "Bulk", year: 2026, season: { franchise: { id: "r", year: 2026 } }, history: [makeEntry("y1", "Year 1")] }] });
  const payloadSize = (statements: { query: string; bindValues: unknown[] }[]) =>
    statements.reduce((n, s) => n + s.query.length + s.bindValues.reduce<number>((m, v) => m + (typeof v === "string" ? v.length : 8), 0), 0);

  it("records the persist_batch payload size with each commit", async () => {
    const { db } = createMockPersistDb();
    let sent: { query: string; bindValues: unknown[] }[] = [];
    db.batch = vi.fn(async statements => { sent = statements; });
    setSaveDiagnosticsEnabled(true);
    await savePersistedStateToDbExecutor(db, STORE_KEY, state());
    const commit = getSaveDiagnostics().entries.find(e => e.phase === "commit")!;
    expect(commit.statements).toBe(sent.length);
    expect(commit.bytes).toBe(payloadSize(sent));
  });

  it("logs a persist-batch breadcrumb before sending a bulk save", async () => {
    const { db } = createMockPersistDb();
    const order: string[] = [];
    let crumb: Record<string, unknown> = {};
    setBreadcrumbInvokeForTests(async (_command, args) => { crumb = (args as { breadcrumb: Record<string, unknown> }).breadcrumb; order.push(String(crumb.stage)); });
    db.batch = vi.fn(async () => { order.push("batch"); });
    setBulkBreadcrumbContext({ realityId: "r", year: 2027 });
    await savePersistedStateToDbExecutor(db, STORE_KEY, state());
    expect(order).toEqual(["persist-batch", "batch"]);
    expect(crumb).toMatchObject({ stage: "persist-batch", realityId: "r", year: 2027, statements: vi.mocked(db.batch!).mock.calls[0][0].length });
    expect(crumb.payloadBytes).toBeGreaterThan(0);
  });

  it("does not log breadcrumbs for saves outside a bulk run", async () => {
    const { db } = createMockPersistDb();
    const invoke = vi.fn();
    setBreadcrumbInvokeForTests(invoke);
    db.batch = vi.fn(async () => {});
    await savePersistedStateToDbExecutor(db, STORE_KEY, state());
    expect(invoke).not.toHaveBeenCalled();
  });
});

