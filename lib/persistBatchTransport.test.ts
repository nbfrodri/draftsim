import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./desktopStorage", () => ({
  setPersistLoadStage: vi.fn(),
  isDesktop: () => true,
  desktopStorage: { getItem: vi.fn() },
  signalCompactingDatabase: vi.fn(),
  clearDesktopOperation: vi.fn(),
}));

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  forgetDesktopWriteBaselines,
  loadPersistedStateFromDbExecutor,
  resetSqliteStorageForTests,
  savePersistedStateToDbExecutor,
  setDesktopDatabaseForTests,
  type SqlExecutor,
} from "./desktopSqlite";
import { SCHEMA_SQL } from "./desktopSqliteSchema";
import { sendPersistBatch, type PersistInvoke } from "./persistBatchTransport";
import type { SeasonHistoryEntry } from "./season/history";

type Call = { command: string; args?: unknown; headers?: Record<string, string> };

function recordingInvoke() {
  const calls: Call[] = [];
  const invoke: PersistInvoke = async (command, args, options) => {
    calls.push({ command, args, headers: options?.headers as Record<string, string> | undefined });
  };
  return { calls, invoke };
}

describe("sendPersistBatch", () => {
  it("sends a batch of small values inline in one call", async () => {
    const { calls, invoke } = recordingInvoke();
    const statements = [{ query: "INSERT INTO t VALUES (?, ?)", bindValues: ["small", 1] }];
    await sendPersistBatch(invoke, statements, { inlineLimit: 16, chunkBytes: 8 });
    expect(calls).toEqual([{ command: "persist_batch", args: { statements }, headers: undefined }]);
  });

  it("stages large values as ordered raw chunks and references them in place", async () => {
    const { calls, invoke } = recordingInvoke();
    // The multi-byte character straddles a chunk boundary.
    const large = "abcdefg" + "é" + "x".repeat(20);
    const other = "y".repeat(30);
    const statements = [
      { query: "A", bindValues: ["keep", large] },
      { query: "B", bindValues: [other, null, 7] },
    ];
    await sendPersistBatch(invoke, statements, { inlineLimit: 16, chunkBytes: 8 });

    const chunks = calls.filter(c => c.command === "persist_stage_chunk");
    const batch = calls.at(-1)!;
    expect(batch.command).toBe("persist_batch");
    const { statements: sent, stagingToken } = batch.args as { statements: typeof statements; stagingToken: string };
    expect(sent).toEqual([
      { query: "A", bindValues: ["keep", { $staged: 0 }] },
      { query: "B", bindValues: [{ $staged: 1 }, null, 7] },
    ]);
    expect(chunks.every(c => c.args instanceof Uint8Array && (c.args as Uint8Array).byteLength <= 8)).toBe(true);
    expect(new Set(chunks.map(c => c.headers?.["draftsim-stage"]))).toEqual(new Set([stagingToken]));
    const blob = (id: string) => Buffer.concat(chunks.filter(c => c.headers?.["draftsim-blob"] === id).map(c => c.args as Uint8Array)).toString("utf8");
    expect(blob("0")).toBe(large);
    expect(blob("1")).toBe(other);
    // Blob 0 is fully staged before blob 1.
    expect(chunks.map(c => c.headers?.["draftsim-blob"])).toEqual([...Array(4).fill("0"), ...Array(4).fill("1")]);
  });

  it("uses a new staging token for every save", async () => {
    const { calls, invoke } = recordingInvoke();
    const statements = [{ query: "A", bindValues: ["z".repeat(40)] }];
    await sendPersistBatch(invoke, statements, { inlineLimit: 16, chunkBytes: 64 });
    await sendPersistBatch(invoke, statements, { inlineLimit: 16, chunkBytes: 64 });
    const tokens = calls.filter(c => c.command === "persist_batch").map(c => (c.args as { stagingToken: string }).stagingToken);
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(tokens.every(t => /^[a-z0-9-]+$/.test(t))).toBe(true);
  });
});

/**
 * Emulates the native contract (src-tauri/src/storage.rs): chunks for a new
 * token replace older staged data, and persist_batch takes and clears staging,
 * resolves placeholders and runs every statement in one transaction.
 */
function nativeSqlite() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA_SQL);
  const run = (query: string, values: unknown[] = []) => sqlite.prepare(query).run(...values as SQLInputValue[]);
  let staged = { token: "", blobs: new Map<number, Uint8Array[]>() };
  const faults = { failNextChunk: false, statement: null as string | null };
  let chunkCalls = 0;
  const invoke: PersistInvoke = async (command, args, options) => {
    if (command === "persist_stage_chunk") {
      chunkCalls++;
      if (faults.failNextChunk) { faults.failNextChunk = false; throw new Error("chunk lost"); }
      const headers = options!.headers as Record<string, string>;
      if (staged.token !== headers["draftsim-stage"]) staged = { token: headers["draftsim-stage"], blobs: new Map() };
      const id = Number(headers["draftsim-blob"]);
      staged.blobs.set(id, [...staged.blobs.get(id) ?? [], (args as Uint8Array).slice()]);
      return;
    }
    if (command !== "persist_batch") throw new Error(`unexpected ${command}`);
    const { statements, stagingToken } = args as { statements: { query: string; bindValues: unknown[] }[]; stagingToken?: string };
    const taken = staged.token === stagingToken ? staged.blobs : new Map<number, Uint8Array[]>();
    staged = { token: "", blobs: new Map() };
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const resolved = statements.map(s => ({ ...s, bindValues: s.bindValues.map(v => {
      if (!v || typeof v !== "object") return v;
      const parts = taken.get((v as { $staged: number }).$staged);
      if (!parts) throw new Error("A staged save chunk is missing");
      return decoder.decode(Buffer.concat(parts));
    }) }));
    sqlite.exec("BEGIN");
    try {
      for (const s of resolved) {
        if (faults.statement && s.query.includes(faults.statement)) { faults.statement = null; throw new Error("disk full"); }
        run(s.query, s.bindValues);
      }
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  };
  const executor: SqlExecutor = {
    execute: async (query, values = []) => ({ rowsAffected: Number(run(query, values).changes) }),
    select: async <T>(query: string, values: unknown[] = []) => sqlite.prepare(query).all(...values as SQLInputValue[]) as T[],
    batch: statements => sendPersistBatch(invoke, statements, { inlineLimit: 200, chunkBytes: 256 }),
  };
  return { sqlite, executor, faults, chunkCount: () => chunkCalls };
}

describe("chunked persist_batch through the save path", () => {
  beforeEach(() => resetSqliteStorageForTests());
  afterEach(() => { resetSqliteStorageForTests(); setDesktopDatabaseForTests(null); });

  const entry = (year: number): SeasonHistoryEntry => ({
    id: `year-${year}`, archivedAt: year, name: `Year ${year} ${"é".repeat(150)}`, complete: true,
    champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
  });
  const stateWith = (history: SeasonHistoryEntry[], note = "") => ({
    activeRealityId: "r",
    realities: [{ id: "r", name: "Bulk", year: 2026, season: { franchise: { id: "r", year: 2026 }, note: note + "s".repeat(600) }, history }],
  });
  const storedHistory = (sqlite: DatabaseSync) =>
    sqlite.prepare("SELECT entry_id FROM reality_history ORDER BY sort_order").all().map(r => r.entry_id);

  it("round-trips staged rows in order", async () => {
    const { executor, sqlite, chunkCount } = nativeSqlite();
    const history = [entry(3), entry(2), entry(1)];
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith(history));
    expect(chunkCount()).toBeGreaterThan(3);
    expect(storedHistory(sqlite)).toEqual(["year-3", "year-2", "year-1"]);
    resetSqliteStorageForTests();
    const loaded = (await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!;
    expect(loaded.realities![0].history).toEqual(history);
    expect(loaded.realities![0].season).toEqual(stateWith(history).realities[0].season);
  });

  it("rolls back the whole save when a statement fails after staging", async () => {
    const { executor, sqlite, faults } = nativeSqlite();
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith([entry(1)]));
    faults.statement = "reality_history";
    await expect(savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith([entry(2), entry(1)], "new"))).rejects.toThrow("disk full");
    expect(storedHistory(sqlite)).toEqual(["year-1"]);
    const season = sqlite.prepare("SELECT season_json FROM realities").get()!.season_json as string;
    expect(JSON.parse(season).note.startsWith("new")).toBe(false);
  });

  it("retries the whole save after a lost chunk without trusting unsaved rows", async () => {
    const { executor, sqlite, faults } = nativeSqlite();
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith([entry(1)]));
    const next = [entry(2), entry(1)];
    faults.failNextChunk = true;
    await expect(savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith(next))).rejects.toThrow("chunk lost");
    expect(storedHistory(sqlite)).toEqual(["year-1"]);
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith(next));
    expect(storedHistory(sqlite)).toEqual(["year-2", "year-1"]);
    resetSqliteStorageForTests();
    expect((await loadPersistedStateFromDbExecutor(executor, "draftsim-store"))!.realities![0].history).toEqual(next);
  });

  it("rewrites every row through staging after a backup restore drops the baselines", async () => {
    const { executor, sqlite } = nativeSqlite();
    setDesktopDatabaseForTests(executor);
    const history = [entry(2), entry(1)];
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith(history));
    // Simulate a restored file that lacks the history rows.
    sqlite.exec("DELETE FROM reality_history");
    await forgetDesktopWriteBaselines();
    await savePersistedStateToDbExecutor(executor, "draftsim-store", stateWith(history));
    expect(storedHistory(sqlite)).toEqual(["year-2", "year-1"]);
  });
});
