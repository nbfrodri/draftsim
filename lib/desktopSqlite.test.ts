import { loadRealityHistoryFromDb, savePersistedStateToDbExecutor } from "./desktopSqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SeasonHistoryEntry } from "@/lib/season/history";

vi.mock("./desktopStorage", () => ({
  isDesktop: () => true,
  desktopStorage: {
    getItem: vi.fn(),
  },
  signalCompactingDatabase: vi.fn(),
  clearDesktopOperation: vi.fn(),
}));

import {
  deleteRealityFromDb,
  loadPersistedStateFromDb,
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
import { UPSERT_REALITY_HISTORY_SQL } from "./desktopSqliteSchema";
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
    expect(doneRecap.recapC).toBeUndefined();
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
    const initialWrites = execute.mock.calls.length;
    execute.mockClear();
    await savePersistedStateToDbExecutor(db, STORE_KEY, { realities, soundEnabled: false });
    expect(initialWrites).toBe(10201);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toContain("global_state");
  });
});
