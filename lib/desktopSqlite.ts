import { FRAGMENT_MANIFEST, GLOBAL_FRAGMENT_KEYS, joinGlobalState, partitionGlobalState } from "./globalStateFragments";
import { beginSaveDiagnostic, encodeWithSaveDiagnostic } from "./saveDiagnostics";
import { getBulkBreadcrumbContext, recordBulkBreadcrumb } from "./bulkBreadcrumbs";
import { sendPersistBatch, type PersistInvoke, type SqlStatement } from "./persistBatchTransport";
import { advanceOperationProgress, recordOperationSuccess } from "@/lib/operationProgress";
/**
 * desktopSqlite.ts — SQLite persistence for DraftSim desktop (Tauri).
 *
 * Replaces monolithic draftsim-store.json with normalized tables so writes
 * touch only the active reality row (+ global metadata) instead of re-stringifying
 * the entire franchise on every set().
 */

import { encodeSeasonForDesktopDb } from "@/lib/recapCompression";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import type { SeasonState } from "@/lib/season/types";
import type { SavedReality } from "@/store/draftStore";
import type { StorageValue } from "zustand/middleware";
import {
DATABASE_VERSION,
DESKTOP_DB_FILENAME,
JSON_MIGRATION_FLAG,
META_CONFIG_KEY,
PERSIST_VERSION,
SCHEMA_SQL,
UPDATE_REALITY_HISTORY_ORDER_SQL,
UPSERT_REALITY_HISTORY_SQL,
mergePersistedState,
parseMetaConfigJson,
splitPersistedState,
type PersistedStoreState,
} from "./desktopSqliteSchema";
import {
clearDesktopOperation,
desktopStorage,
isDesktop,
signalCompactingDatabase,
setPersistLoadStage,
} from "./desktopStorage";

export { PERSIST_VERSION } from "./desktopSqliteSchema";

export type SqlExecutor = {
  execute: (query: string, bindValues?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T[]>;
  batch?: (statements: SqlStatement[]) => Promise<void>;
};


/** Approximate persist_batch payload: string lengths (UTF-16 units, equal to bytes for ASCII JSON), 8 per scalar. */
function statementPayloadSize(statements: SqlStatement[]): number {
  let size = 0;
  for (const s of statements) {
    size += s.query.length;
    for (const v of s.bindValues) size += typeof v === "string" ? v.length : 8;
  }
  return size;
}
let dbPromise: Promise<SqlExecutor> | null = null;
const readHistorySources = new WeakMap<SeasonHistoryEntry[], { db: SqlExecutor; realityId: string; baseline: HistoryBaseline }>();
const writeTails = new WeakMap<SqlExecutor, Promise<unknown>>();
const savedGlobals = new WeakMap<SqlExecutor, { storeKey: string; value: Record<string, unknown> }>();

function sameGlobalSnapshot(previous: Record<string, unknown> | undefined, next: Record<string, unknown>): boolean {
  if (!previous) return false;
  // splitPersistedState always creates an empty realities placeholder; actual
  // reality rows are reconciled independently below.
  const keys = Object.keys(next).filter(key => key !== "realities");
  return keys.length === Object.keys(previous).filter(key => key !== "realities").length
    && keys.every(key => Object.hasOwn(previous, key) && previous[key] === next[key]);
}
const savedRealities = new WeakMap<SqlExecutor, Map<string, {
  name: string; year: number; season: unknown; history: unknown[]; historySynced: boolean;
}>>();

/**
 * Durable `reality_history` rows per database and reality: entry id → the
 * in-memory entry object whose JSON the row holds, and its `sort_order`.
 * Archived entries are replaced, never mutated, so object identity is the
 * fingerprint. Advanced only after a commit; any failure drops the database's
 * baselines so a retry rewrites rows instead of trusting unsaved ones.
 */
type HistoryBaseline = Map<string, { entry: SeasonHistoryEntry; index: number }>;
let committedHistory = new WeakMap<SqlExecutor, Map<string, HistoryBaseline>>();
/** Baselines planned by an atomic write, keyed by its writer; committed on success. */
const historyTransactions = new WeakMap<SqlExecutor, { db: SqlExecutor; staged: Map<string, HistoryBaseline> }>();

/** Stop trusting history rows (deleted, restored or uncertain). Always safe: it only adds writes. */
function forgetHistoryBaseline(writer: SqlExecutor, realityId?: string): void {
  const transaction = historyTransactions.get(writer);
  const db = transaction?.db ?? writer;
  if (realityId === undefined) {
    committedHistory.delete(db);
    transaction?.staged.clear();
  } else {
    committedHistory.get(db)?.delete(realityId);
    transaction?.staged.delete(realityId);
  }
}

/** Baseline for rows read from SQLite; rows whose id or order cannot be trusted are left out. */
function baselineFromRows(rows: { entry_id?: unknown; sort_order?: unknown }[], entries: unknown[]): HistoryBaseline {
  const baseline: HistoryBaseline = new Map();
  rows.forEach((row, i) => {
    const entry = entries[i] as SeasonHistoryEntry | null | undefined;
    if (entry && typeof row.entry_id === "string" && entry.id === row.entry_id && typeof row.sort_order === "number") {
      baseline.set(row.entry_id, { entry, index: row.sort_order });
    }
  });
  return baseline;
}

function serializeDbWrite<T>(db: SqlExecutor, operation: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(db) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  writeTails.set(db, next);
  return next;
}

/** Native batch owns a single SQLx transaction; test executors may execute directly. */
async function atomicWrite(db: SqlExecutor, operation: (writer: SqlExecutor) => Promise<void>): Promise<void> {
  const loadedBefore = new Set(loadedHistoryRealityIds);
  const statements: SqlStatement[] = [];
  // A distinct writer object identifies this transaction's staged history baselines.
  const writer: SqlExecutor = db.batch ? {
    select: (query, values) => db.select(query, values),
    execute: async (query, bindValues = []) => {
      statements.push({ query, bindValues });
      return { rowsAffected: 0 };
    },
  } : {
    select: (query, values) => db.select(query, values),
    execute: (query, values) => db.execute(query, values),
  };
  const transaction = { db, staged: new Map<string, HistoryBaseline>() };
  historyTransactions.set(writer, transaction);
  try {
    const planDone = beginSaveDiagnostic("plan");
    try { await operation(writer); planDone(); } catch (error) { planDone(false); throw error; }
    if (db.batch && statements.length) {
      const payloadBytes = statementPayloadSize(statements);
      const bulk = getBulkBreadcrumbContext();
      if (bulk) await recordBulkBreadcrumb({ stage: "persist-batch", ...bulk, statements: statements.length, payloadBytes });
      const commitDone = beginSaveDiagnostic("commit");
      try { await db.batch(statements); commitDone(true, payloadBytes, statements.length); }
      catch (error) { commitDone(false, payloadBytes, statements.length); throw error; }
    }
  } catch (error) {
    loadedHistoryRealityIds.clear();
    for (const id of loadedBefore) loadedHistoryRealityIds.add(id);
    savedRealities.delete(db);
    savedGlobals.delete(db);
    committedHistory.delete(db);
    throw error;
  }
  if (transaction.staged.size) {
    let committed = committedHistory.get(db);
    if (!committed) committedHistory.set(db, committed = new Map());
    for (const [realityId, baseline] of transaction.staged) committed.set(realityId, baseline);
  }
}

/** Reality ids whose history rows are fully loaded in memory (lazy history). */
const loadedHistoryRealityIds = new Set<string>();

/** @internal test helper */
export function resetSqliteStorageForTests(): void {
  dbPromise = null;
  loadedHistoryRealityIds.clear();
  committedHistory = new WeakMap();
}

/**
 * Drop every write baseline for the open database after its file was replaced
 * (backup restore), so a later save cannot skip rows the new file lacks.
 */
export async function forgetDesktopWriteBaselines(): Promise<void> {
  const db = await dbPromise?.catch(() => null);
  if (!db) return;
  savedRealities.delete(db);
  savedGlobals.delete(db);
  committedHistory.delete(db);
}

/** @internal test helper — inject a mock SqlExecutor instead of opening Tauri DB. */
export function setDesktopDatabaseForTests(db: SqlExecutor | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}

export const isRealityHistoryLoaded = (id: string): boolean => loadedHistoryRealityIds.has(id);

/** Mark history installed in state (including intentionally empty histories). */
export function markRealityHistoryLoaded(realityId: string, history?: SeasonHistoryEntry[]): void {
  // A full unchanged DB read is already durable. Installing it must not encode
  // and upsert every archive again. Call only after draining older snapshots.
  const source = history && readHistorySources.get(history);
  if (source?.realityId === realityId) {
    const cached = savedRealities.get(source.db)?.get(realityId);
    if (cached && !cached.historySynced) {
      cached.history = history!;
      cached.historySynced = true;
    }
    // Rows committed after this read are newer than it; never replace them.
    let committed = committedHistory.get(source.db);
    if (!committed) committedHistory.set(source.db, committed = new Map());
    if (!committed.has(realityId)) committed.set(realityId, source.baseline);
  }
  loadedHistoryRealityIds.add(realityId);
}

export async function getDesktopDatabase(): Promise<SqlExecutor> {
  return loadDatabase();
}

async function loadDatabase(): Promise<SqlExecutor> {
  if (!isDesktop()) {
    throw new Error("SQLite storage is desktop-only");
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const { appDataDir, join } = await import("@tauri-apps/api/path");
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      const dbPath = await join(await appDataDir(), DESKTOP_DB_FILENAME);
      setPersistLoadStage("Connecting to SQLite");
      const db = await Database.load(`sqlite:${dbPath}`);
      // Ensure WAL mode is active (tauri-plugin-sql/SQLx may already set this,
      // but being explicit prevents surprises if the plugin default changes).
      // WAL + synchronous=NORMAL gives good durability without blocking reads.
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA synchronous = NORMAL");
      await db.execute("PRAGMA foreign_keys = ON");
      setPersistLoadStage("Checking saved database schema");
      await db.execute(SCHEMA_SQL);
      const versions = await db.select<{ value: string }[]>("SELECT value FROM schema_meta WHERE key = 'persist_version'");
      if (!["7", String(DATABASE_VERSION)].includes(versions[0]?.value)) throw new Error("Unsupported saved database version. Update DraftSim before opening it.");
      const { invoke, Channel } = await import("@tauri-apps/api/core");
      if (versions[0]?.value === "7") {
        const existing = await db.select<{ c: number }[]>("SELECT COUNT(*) AS c FROM global_state");
        if (existing[0]?.c) {
          // Preserve a coherent v7 database before any partitioned writes.
          setPersistLoadStage("Creating recovery copy before storage upgrade");
          const onProgress = new Channel<string>();
          onProgress.onmessage = step => {
            const stages: Record<string, string> = {
              snapshot: "Creating recovery copy before storage upgrade",
              verify: "Verifying recovery copy before storage upgrade",
              retention: "Checking older recovery copies before storage upgrade",
              external: "Finishing external recovery copy before storage upgrade",
            };
            if (stages[step]) setPersistLoadStage(stages[step]);
          };
          await invoke("backup_create", { name: "Before storage format 8", onProgress });
        }
      }
      return {
        execute: (query: string, values?: unknown[]) => db.execute(query, values),
        select: <T>(query: string, values?: unknown[]) => db.select<T[]>(query, values),
        // Large values travel as raw chunks; the batch still commits in one transaction.
        batch: (statements: SqlStatement[]) => sendPersistBatch(invoke as PersistInvoke, statements),
      } satisfies SqlExecutor;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function getMetaValue(key: string): Promise<string | null> {
  const db = await loadDatabase();
  const rows = await db.select<{ value: string }>(
    "SELECT value FROM schema_meta WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function setMetaValue(key: string, value: string): Promise<void> {
  const db = await loadDatabase();
  await db.execute(
    "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

async function isDatabaseEmpty(storeKey: string): Promise<boolean> {
  const db = await loadDatabase();
  const rows = await db.select<{ c: number }>(
    "SELECT COUNT(*) as c FROM global_state WHERE store_key = ?",
    [storeKey],
  );
  return (rows[0]?.c ?? 0) === 0;
}

function keyToFilename(key: string): string {
  const safe = key.replace(/[/\\:*?"<>|]/g, "_");
  return `${safe}.json`;
}

/** One-time import: draftsim-store.json (+ meta config) → SQLite, then .bak backup. */
export async function migrateJsonFilesToSqlite(storeKey: string): Promise<boolean> {
  if (!isDesktop()) return false;
  if ((await getMetaValue(JSON_MIGRATION_FLAG)) === "1") return false;

  const db = await loadDatabase();
  const empty = await isDatabaseEmpty(storeKey);
  if (!empty) {
    await setMetaValue(JSON_MIGRATION_FLAG, "1");
    return false;
  }

  const { readTextFile, rename, BaseDirectory, exists } = await import(
    "@tauri-apps/plugin-fs"
  );
  const base = BaseDirectory.AppData;
  const filename = keyToFilename(storeKey);
  const jsonExists = await exists(filename, { baseDir: base });
  if (!jsonExists) {
    await setMetaValue(JSON_MIGRATION_FLAG, "1");
    return false;
  }

  let raw: string;
  try {
    raw = await readTextFile(filename, { baseDir: base });
  } catch (err) {
    console.warn("[desktopSqlite] could not read legacy JSON store:", err);
    return false;
  }

  let parsed: StorageValue<PersistedStoreState>;
  try {
    parsed = JSON.parse(raw) as StorageValue<PersistedStoreState>;
  } catch (err) {
    console.warn("[desktopSqlite] corrupt legacy JSON — skipping migration:", err);
    return false;
  }

  await savePersistedStateToDb(storeKey, parsed.state, { forceAllHistory: true });

  const metaFilename = keyToFilename(META_CONFIG_KEY);
  if (await exists(metaFilename, { baseDir: base })) {
    try {
      const metaRaw = await readTextFile(metaFilename, { baseDir: base });
      const metaPayload = parseMetaConfigJson(metaRaw);
      for (const [configKey, value] of Object.entries(metaPayload)) {
        await db.execute(
          "INSERT INTO meta_config (config_key, value) VALUES (?, ?) ON CONFLICT(config_key) DO UPDATE SET value = excluded.value",
          [configKey, value],
        );
      }
    } catch (err) {
      console.warn("[desktopSqlite] meta config migration failed (non-fatal):", err);
    }
  }

  const backupName = `${filename}.bak`;
  try {
    await rename(filename, backupName, {
      oldPathBaseDir: base,
      newPathBaseDir: base,
    });
  } catch {
    // rename failed — leave original JSON in place; DB is still authoritative
  }

  if (await exists(metaFilename, { baseDir: base })) {
    try {
      await rename(metaFilename, `${metaFilename}.bak`, {
        oldPathBaseDir: base,
        newPathBaseDir: base,
      });
    } catch {
      // non-fatal
    }
  }

  await setMetaValue(JSON_MIGRATION_FLAG, "1");
  console.info("[desktopSqlite] migrated legacy JSON to SQLite:", storeKey);
  return true;
}

async function upsertGlobalState(
  db: SqlExecutor,
  storeKey: string,
  global: Record<string, unknown>,
  previous?: Record<string, unknown>,
): Promise<void> {
  const now = Date.now();
  const { root, fragments } = partitionGlobalState(global);
  const before = previous ? partitionGlobalState(previous) : undefined;
  for (const key of GLOBAL_FRAGMENT_KEYS) {
    if (fragments.has(key)) {
      if (before?.fragments.has(key) && before.fragments.get(key) === fragments.get(key)) continue;
      const json = encodeWithSaveDiagnostic("global-encode", () => JSON.stringify(fragments.get(key)));
      await db.execute("INSERT INTO global_fragments (store_key, fragment_key, value_json) VALUES (?, ?, ?) ON CONFLICT(store_key, fragment_key) DO UPDATE SET value_json = excluded.value_json", [storeKey, key, json]);
    } else if (!before || before.fragments.has(key)) {
      await db.execute("DELETE FROM global_fragments WHERE store_key = ? AND fragment_key = ?", [storeKey, key]);
    }
  }
  const manifestSame = before && JSON.stringify(before.root[FRAGMENT_MANIFEST]) === JSON.stringify(root[FRAGMENT_MANIFEST]);
  const smallBefore = before ? { ...before.root, [FRAGMENT_MANIFEST]: null } : undefined;
  const smallNext = { ...root, [FRAGMENT_MANIFEST]: null };
  if (manifestSame && sameGlobalSnapshot(smallBefore, smallNext)) return;
  await db.execute(
    `INSERT INTO global_state (store_key, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(store_key) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`,
    [storeKey, encodeWithSaveDiagnostic("global-encode", () => JSON.stringify(root)), now],
  );
  if (!previous) await db.execute("INSERT INTO schema_meta (key, value) VALUES ('persist_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(DATABASE_VERSION)]);
}

/** Persist seasons: slim completed stages, compact-encode live ones. */
function seasonJsonForDb(season: SeasonState): string {
  if (!season?.tournaments || typeof season.tournaments !== "object") {
    return JSON.stringify(season ?? {});
  }
  return encodeWithSaveDiagnostic("season-encode", () => JSON.stringify(encodeSeasonForDesktopDb(season)));
}

/**
 * Rewrite every reality's season_json with desktop-db encoding (slim completed
 * + compact incomplete), then callers may VACUUM.
 * Fixes DBs that grew far past the JSON export size after importing decoded seasons.
 */
export async function recompactAllRealitySeasonsInDb(db: SqlExecutor): Promise<number> {
  const rows = await db.select<{
    id: string;
    name: string;
    year: number;
    season_json: string;
  }>("SELECT id, name, year, season_json FROM realities");

  let rewritten = 0;
  for (const row of rows) {
    let season: SeasonState;
    try {
      season = JSON.parse(row.season_json) as SeasonState;
    } catch {
      continue;
    }
    if (!season?.tournaments || typeof season.tournaments !== "object") continue;

    const recompressed = encodeSeasonForDesktopDb(season);
    const nextJson = JSON.stringify(recompressed);
    if (nextJson === row.season_json) continue;

    await db.execute(
      `UPDATE realities SET season_json = ?, updated_at = ? WHERE id = ?`,
      [nextJson, Date.now(), row.id],
    );
    rewritten++;
  }
  return rewritten;
}

async function upsertRealityRow(
  db: SqlExecutor,
  reality: Pick<SavedReality, "id" | "name" | "year" | "season">,
): Promise<void> {
  if (!reality.season) throw new Error("Cannot replace a saved reality with an unloaded season.");
  const now = Date.now();
  await db.execute(
    `INSERT INTO realities (id, name, year, season_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       year = excluded.year,
       season_json = excluded.season_json,
       updated_at = excluded.updated_at`,
    [
      reality.id,
      reality.name,
      reality.year,
      seasonJsonForDb(reality.season!),
      now,
    ],
  );
  await db.execute("INSERT INTO reality_catalog (reality_id, summary_json) VALUES (?, ?) ON CONFLICT(reality_id) DO UPDATE SET summary_json = excluded.summary_json",
    [reality.id, JSON.stringify({ status: reality.season?.status ?? null })]);
}

/** Immediate upsert of one reality row (+ optional history sync). */
export async function upsertRealityInDb(
  reality: Pick<SavedReality, "id" | "name" | "year" | "season"> & {
    history?: SeasonHistoryEntry[];
  },
  options?: { syncHistory?: boolean },
): Promise<void> {
  const db = await loadDatabase();
  await serializeDbWrite(db, () => atomicWrite(db, async (writer) => {
    await upsertRealityRow(writer, reality);
    if (options?.syncHistory && reality.history) {
      await syncRealityHistory(writer, reality.id, reality.history);
      loadedHistoryRealityIds.add(reality.id);
    }
  }));
  savedRealities.delete(db);
}

/** Remove one reality and its Hall history from SQLite. */
export async function deleteRealityFromDb(realityId: string): Promise<void> {
  const db = await loadDatabase();
  await serializeDbWrite(db, () => atomicWrite(db, async (writer) => {
    forgetHistoryBaseline(writer, realityId);
    await writer.execute("DELETE FROM reality_history WHERE reality_id = ?", [realityId]);
    await writer.execute("DELETE FROM realities WHERE id = ?", [realityId]);
    loadedHistoryRealityIds.delete(realityId);
  }));
  savedRealities.delete(db);
}

/** History entry count above which a delete may leave reclaimable free pages. */
export const COMPACT_SUGGEST_HISTORY_THRESHOLD = 10;

/** Serialized season_json size (bytes) that triggers a compact prompt after delete. */
export const COMPACT_SUGGEST_SEASON_BYTES = 1_000_000;

export type RealityFootprint = {
  history?: unknown[];
  season?: unknown;
};

/** True when deleting this reality likely left significant free space in the DB file. */
export function shouldSuggestCompactAfterDelete(reality: RealityFootprint): boolean {
  const historyCount = reality.history?.length ?? 0;
  if (historyCount > COMPACT_SUGGEST_HISTORY_THRESHOLD) return true;
  try {
    const seasonBytes = JSON.stringify(reality.season ?? {}).length;
    if (seasonBytes > COMPACT_SUGGEST_SEASON_BYTES) return true;
  } catch {
    // non-serializable season — skip size check
  }
  return false;
}

export type DesktopDbRealityFootprint = {
  id: string;
  name?: string;
  seasonBytes: number;
  historyBytes: number;
  historyCount: number;
};

export type DesktopDbFootprint = {
  globalBytes: number;
  seasonBytes: number;
  historyBytes: number;
  fileBytes: number;
  freelistCount: number | null;
  realities: DesktopDbRealityFootprint[];
};

export type DesktopDbCompactResult = {
  footprint: DesktopDbFootprint;
  /** On-disk file bytes reclaimed (0 if the file grew). */
  freedBytes: number;
};

/** Human-readable size for compact summaries and UI flash messages. */
export function formatDesktopDbBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCompactResultMessage(result: DesktopDbCompactResult): string {
  const fp = result.footprint;
  return (
    `Database compacted — freed ${formatDesktopDbBytes(result.freedBytes)} ` +
    `(season ${formatDesktopDbBytes(fp.seasonBytes)} · ` +
    `history ${formatDesktopDbBytes(fp.historyBytes)} · ` +
    `global ${formatDesktopDbBytes(fp.globalBytes)} · ` +
    `file ${formatDesktopDbBytes(fp.fileBytes)})`
  );
}

function pragmaNumber(rows: Record<string, unknown>[], key: string): number | null {
  const row = rows[0];
  if (!row) return null;
  const direct = row[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  // Some drivers return a single anonymous column.
  for (const value of Object.values(row)) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Approximate on-disk payload sizes for diagnostics after compact / VACUUM. */
export async function measureDesktopDbFootprint(
  db: SqlExecutor,
): Promise<DesktopDbFootprint> {
  const globalRows = await db.select<{ bytes: number }>(
    "SELECT (SELECT COALESCE(SUM(LENGTH(state_json)), 0) FROM global_state) + (SELECT COALESCE(SUM(LENGTH(value_json)), 0) FROM global_fragments) AS bytes",
  );
  const globalBytes = Number(globalRows[0]?.bytes ?? 0);

  setPersistLoadStage("Reading reality catalogue and active season");
  const realityRows = await db.select<{
    id: string;
    name: string;
    season_bytes: number;
  }>("SELECT id, name, LENGTH(season_json) AS season_bytes FROM realities");

  const historyRows = await db.select<{
    reality_id: string;
    history_bytes: number;
    history_count: number;
  }>(
    `SELECT reality_id,
            COALESCE(SUM(LENGTH(entry_json)), 0) AS history_bytes,
            COUNT(*) AS history_count
     FROM reality_history
     GROUP BY reality_id`,
  );
  const historyById = new Map(
    historyRows.map((r) => [
      r.reality_id,
      {
        historyBytes: Number(r.history_bytes ?? 0),
        historyCount: Number(r.history_count ?? 0),
      },
    ]),
  );

  const realities: DesktopDbRealityFootprint[] = realityRows.map((r) => {
    const hist = historyById.get(r.id);
    return {
      id: r.id,
      name: r.name,
      seasonBytes: Number(r.season_bytes ?? 0),
      historyBytes: hist?.historyBytes ?? 0,
      historyCount: hist?.historyCount ?? 0,
    };
  });

  const seasonBytes = realities.reduce((sum, r) => sum + r.seasonBytes, 0);
  const historyBytes = realities.reduce((sum, r) => sum + r.historyBytes, 0);

  const pageCount =
    pragmaNumber(
      (await db.select<Record<string, unknown>>("PRAGMA page_count")) as Record<
        string,
        unknown
      >[],
      "page_count",
    ) ?? 0;
  const pageSize =
    pragmaNumber(
      (await db.select<Record<string, unknown>>("PRAGMA page_size")) as Record<
        string,
        unknown
      >[],
      "page_size",
    ) ?? 0;
  const freelistCount = pragmaNumber(
    (await db.select<Record<string, unknown>>("PRAGMA freelist_count")) as Record<
      string,
      unknown
    >[],
    "freelist_count",
  );

  return {
    globalBytes,
    seasonBytes,
    historyBytes,
    fileBytes: pageCount * pageSize,
    freelistCount,
    realities,
  };
}

/**
 * Checkpoint the WAL file into the main DB file on close / flush.
 *
 * tauri-plugin-sql / SQLx enables WAL mode by default.  In WAL mode,
 * committed data lives in the -wal sidecar until a checkpoint copies it
 * to the main .db file.  SQLite automatically replays the WAL on the next
 * open, so there is no *correctness* risk — but running a FULL checkpoint
 * before the process exits ensures the main DB file is self-contained and
 * reduces recovery work on the next startup.
 *
 * Called from desktopStorage.flushPendingWritesOnClose() after all pending
 * writes have been flushed.
 */
export async function checkpointDesktopDatabase(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const db = await loadDatabase();
    await serializeDbWrite(db, () => db.execute("PRAGMA wal_checkpoint(FULL)"));
  } catch {
    // Best-effort — do not block close on checkpoint failure.
  }
}

async function runDesktopDatabaseCompact(
  db: SqlExecutor,
): Promise<DesktopDbCompactResult> {
  const before = await measureDesktopDbFootprint(db);
  advanceOperationProgress("encode");
  await recompactAllRealitySeasonsInDb(db);
  advanceOperationProgress("vacuum");
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.execute("VACUUM");
  advanceOperationProgress("measure");
  const footprint = await measureDesktopDbFootprint(db);
  return {
    footprint,
    freedBytes: Math.max(0, before.fileBytes - footprint.fileBytes),
  };
}

/**
 * Reclaim disk space: re-encode every reality season (slim completed + compact
 * live), VACUUM, then return an approximate footprint summary. Desktop only.
 */
export async function compactDesktopDatabase(): Promise<DesktopDbCompactResult | undefined> {
  if (!isDesktop()) return undefined;
  signalCompactingDatabase();
  try {
    const db = await loadDatabase();
    return await serializeDbWrite(db, async () => {
      savedRealities.delete(db);
      const result = await runDesktopDatabaseCompact(db);
      recordOperationSuccess();
      return result;
    });
  } finally {
    clearDesktopOperation();
  }
}

/**
 * Compact during app close. Caller owns the closing overlay — no desktop
 * operation phase is toggled here.
 */
export async function compactDesktopDatabaseOnClose(): Promise<
  DesktopDbCompactResult | undefined
> {
  if (!isDesktop()) return undefined;
  try {
    const db = await loadDatabase();
    return await serializeDbWrite(db, async () => {
      savedRealities.delete(db);
      return runDesktopDatabaseCompact(db);
    });
  } catch (err) {
    console.warn("[desktopSqlite] close compact failed:", err);
    return undefined;
  }
}

/**
 * Sync history rows: write new or replaced entries, move reordered ones, then
 * drop rows removed from state.
 *
 * Inside an atomic write, entries whose object and index match the committed
 * baseline are skipped, so archiving a year encodes only that year (entries are
 * several MB each). `force` or a call outside an atomic write rewrites every row.
 */
export async function syncRealityHistory(
  db: SqlExecutor,
  realityId: string,
  history: SeasonHistoryEntry[],
  options?: { force?: boolean },
): Promise<void> {
  const transaction = historyTransactions.get(db);
  const baseline = transaction && !options?.force
    ? transaction.staged.get(realityId) ?? committedHistory.get(transaction.db)?.get(realityId)
    : undefined;
  const next: HistoryBaseline = new Map();
  for (let i = 0; i < history.length; i++) {
    const entry = history[i]!;
    const saved = baseline?.get(entry.id);
    // A repeated id is always written so the last occurrence wins, as before.
    if (!saved || saved.entry !== entry || next.has(entry.id)) {
      await db.execute(UPSERT_REALITY_HISTORY_SQL, [
        realityId,
        entry.id,
        encodeWithSaveDiagnostic("history-encode", () => JSON.stringify(entry)),
        i,
      ]);
    } else if (saved.index !== i) {
      await db.execute(UPDATE_REALITY_HISTORY_ORDER_SQL, [i, realityId, entry.id]);
    }
    next.set(entry.id, { entry, index: i });
  }
  transaction?.staged.set(realityId, next);

  if (history.length === 0) {
    await db.execute("DELETE FROM reality_history WHERE reality_id = ?", [realityId]);
    return;
  }

  const placeholders = history.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM reality_history WHERE reality_id = ? AND entry_id NOT IN (${placeholders})`,
    [realityId, ...history.map((e) => e.id)],
  );
}


/** Drop realities (and their history) removed from persisted state. */
export async function syncRemovedRealities(
  db: SqlExecutor,
  keepIds: string[],
): Promise<void> {
  const existing = await db.select<{ id: string }>("SELECT id FROM realities");
  const keep = new Set(keepIds);

  if (keepIds.length === 0) {
    forgetHistoryBaseline(db);
    await db.execute("DELETE FROM reality_history");
    await db.execute("DELETE FROM realities");
    loadedHistoryRealityIds.clear();
    return;
  }

  for (const row of existing) {
    if (!keep.has(row.id)) {
      forgetHistoryBaseline(db, row.id);
      await db.execute("DELETE FROM reality_history WHERE reality_id = ?", [row.id]);
      await db.execute("DELETE FROM realities WHERE id = ?", [row.id]);
      loadedHistoryRealityIds.delete(row.id);
    }
  }
}

export async function savePersistedStateToDb(
  storeKey: string,
  state: PersistedStoreState,
  options?: { forceAllHistory?: boolean },
): Promise<void> {
  const db = await loadDatabase();
  await savePersistedStateToDbExecutor(db, storeKey, state, options);
}

/** @internal testable — full reconcile: global + realities + history sync + stale deletes. */
export async function savePersistedStateToDbExecutor(
  db: SqlExecutor,
  storeKey: string,
  state: PersistedStoreState,
  options?: { forceAllHistory?: boolean },
): Promise<void> {
  return serializeDbWrite(db, async () => {
    const previous = savedRealities.get(db);
    const savedGlobal = savedGlobals.get(db);
    let committedGlobal: Record<string, unknown> | undefined;
    await atomicWrite(db, async (writer) => {
      committedGlobal = await reconcilePersistedState(writer, storeKey, state, options, previous,
        savedGlobal?.storeKey === storeKey ? savedGlobal.value : undefined);
    });
    if (!committedGlobal) return;
    savedGlobals.set(db, { storeKey, value: committedGlobal });
    savedRealities.set(db, new Map((state.realities ?? []).map((r) => [r.id, {
      name: r.name, year: r.year, season: r.season, history: r.history ?? [],
      historySynced: !!options?.forceAllHistory || loadedHistoryRealityIds.has(r.id),
    }])));
  });
}

async function reconcilePersistedState(
  db: SqlExecutor, storeKey: string, state: PersistedStoreState,
  options?: { forceAllHistory?: boolean },
  previous?: Map<string, { name: string; year: number; season: unknown; history: unknown[]; historySynced: boolean }>,
  previousGlobal?: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const { global, realities } = splitPersistedState(state);

  // ── Empty-state wipe guard ─────────────────────────────────────────────────
  // If the in-memory realities list is empty but the DB already has rows, this
  // write almost certainly originates from a failed/incomplete hydration (e.g.
  // SQLite WAL recovery kept the DB briefly locked on reboot so getItem()
  // returned null, leaving the store in its initial empty state).  Writing that
  // empty state would call syncRemovedRealities(db, []) and DELETE all rows.
  //
  // Individual reality deletions are handled by deleteRealityFromDb(), which
  // removes the row *before* the background persist flush fires, so by the time
  // this path runs after a legitimate "delete last reality" action the DB is
  // already empty and the guard correctly lets the write through.
  if (realities.length === 0) {
    const existingRows = await db.select<{ id: string }>(
      "SELECT id FROM realities",
    );
    if (existingRows.length > 0) {
      console.warn(
        `[desktopSqlite] SAFETY: aborting empty-state persist — DB has ${existingRows.length} ` +
          "existing realities but in-memory state is empty. " +
          "This is likely a failed-hydration overwrite, not a user deletion.",
      );
      return;
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (!sameGlobalSnapshot(previousGlobal, global)) await upsertGlobalState(db, storeKey, global, previousGlobal);

  for (const r of realities) {
    const prev = previous?.get(r.id);
    if (r.season == null) {
      if (!prev) {
        const stored = await db.select<{ id: string }>("SELECT id FROM realities WHERE id = ?", [r.id]);
        if (!stored.length) throw new Error("Unloaded reality is missing from storage; refusing incomplete save.");
      }
      if (!prev || prev.name !== r.name || prev.year !== r.year) {
        await db.execute("UPDATE realities SET name = ?, year = ? WHERE id = ?", [r.name, r.year, r.id]);
      }
    } else if (!prev || prev.name !== r.name || prev.year !== r.year || prev.season !== r.season) await upsertRealityRow(db, {
      id: r.id,
      name: r.name,
      year: r.year,
      season: r.season as SavedReality["season"],
    });
    const historyLoaded =
      options?.forceAllHistory ||
      loadedHistoryRealityIds.has(r.id) ||
      // Lazy placeholders are empty. A populated archive is complete data,
      // including years produced by store actions retained through dev HMR.
      r.history.length > 0;
    if (historyLoaded && (!prev?.historySynced || prev.history !== r.history || options?.forceAllHistory)) {
      await syncRealityHistory(db, r.id, r.history as SeasonHistoryEntry[], { force: options?.forceAllHistory });
      loadedHistoryRealityIds.add(r.id);
    }
  }

  await syncRemovedRealities(
    db,
    realities.map((r) => r.id),
  );
  return global;
}

export async function loadPersistedStateFromDb(
  storeKey: string,
): Promise<PersistedStoreState | null> {
  const db = await loadDatabase();
  return loadPersistedStateFromDbExecutor(db, storeKey);
}

/** @internal testable — load global blob + reality rows (+ active history). */
export async function loadPersistedStateFromDbExecutor(
  db: SqlExecutor,
  storeKey: string,
): Promise<PersistedStoreState | null> {
  setPersistLoadStage("Reading saved global state");
  const globalRows = await db.select<{ state_json: string }>(
    "SELECT state_json FROM global_state WHERE store_key = ?",
    [storeKey],
  );
  if (!globalRows[0]) return null;

  let global: Record<string, unknown>;
  try {
    global = JSON.parse(globalRows[0].state_json) as Record<string, unknown>;
    if (!global || typeof global !== "object" || Array.isArray(global)) throw new Error("Invalid global root");
  } catch {
    throw new Error("Saved global state is invalid; refusing to overwrite it.");
  }

  const partitioned = Object.hasOwn(global, FRAGMENT_MANIFEST);
  if (!partitioned) {
    const version = await db.select<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'persist_version'");
    if (version[0]?.value === String(DATABASE_VERSION)) throw new Error("Saved global fragment manifest is missing; refusing to overwrite it.");
  }
  if (partitioned) {
    setPersistLoadStage("Reading competitive save fragments");
    const fragments = await db.select<{ fragment_key: string; value_json: string }>("SELECT fragment_key, value_json FROM global_fragments WHERE store_key = ?", [storeKey]);
    global = joinGlobalState(global, fragments);
  }
  const activeRealityId =
    typeof global.activeRealityId === "string" ? global.activeRealityId : null;

  setPersistLoadStage("Reading reality catalogue and active season");
  const realityRows = await db.select<{
    id: string;
    name: string;
    year: number;
    season_json: string | null;
    summary_json: string;
  }>(`SELECT realities.id, realities.name, realities.year,
      CASE WHEN realities.id = ? THEN realities.season_json ELSE NULL END AS season_json,
      COALESCE(reality_catalog.summary_json,
        CASE WHEN json_valid(realities.season_json)
          THEN json_object('status', json_extract(realities.season_json, '$.status')) ELSE '{}' END) AS summary_json
      FROM realities LEFT JOIN reality_catalog ON reality_catalog.reality_id = realities.id
      ORDER BY realities.name`, [activeRealityId]);

  loadedHistoryRealityIds.clear();
  // A load replaces every baseline; a failed load leaves none to trust.
  committedHistory.delete(db);
  const historyBaselines = new Map<string, HistoryBaseline>();
  const realities: Array<{
    id: string;
    name: string;
    year: number;
    season: unknown;
    seasonSummary?: { status: string | null };
    history: unknown[];
  }> = [];

  for (const row of realityRows) {
    let season: unknown;
    try {
      season = row.season_json == null ? null : JSON.parse(row.season_json);
    } catch {
      throw new Error("Saved reality is invalid; refusing to overwrite it.");
    }

    let history: unknown[] = [];
    if (activeRealityId && row.id === activeRealityId) {
      setPersistLoadStage("Reading active reality history");
      const histRows = await db.select<{ entry_id: string; entry_json: string; sort_order: number }>(
        "SELECT entry_id, entry_json, sort_order FROM reality_history WHERE reality_id = ? ORDER BY sort_order",
        [row.id],
      );
      const parsed = histRows.map((h) => {
        try {
          return JSON.parse(h.entry_json);
        } catch {
          throw new Error("Saved history is invalid; refusing to overwrite it.");
        }
      });
      history = parsed.filter((e): e is unknown => e != null);
      historyBaselines.set(row.id, baselineFromRows(histRows, parsed));
      loadedHistoryRealityIds.add(row.id);
    }

    realities.push({
      id: row.id,
      name: row.name,
      year: row.year,
      season,
      seasonSummary: (() => {
        try {
          const summary = JSON.parse(row.summary_json ?? "{}");
          return { status: ["in-progress", "complete"].includes(summary.status) ? summary.status : null };
        } catch { return { status: null }; }
      })(),
      history,
    });
  }

  const loaded = mergePersistedState(global, realities, {
    lazyHistoryForInactive: true,
    activeRealityId,
  });
  // The first autosave already has a durable baseline. Without it, startup
  // rewrites every reality and serializes the entire active Hall again.
  // Seed only after every row has been read and parsed successfully.
  if (partitioned) savedGlobals.set(db, { storeKey, value: global });
  else savedGlobals.delete(db);
  savedRealities.set(db, new Map((loaded.realities ?? []).map(r => [r.id, {
    name: r.name, year: r.year, season: r.season, history: r.history ?? [],
    historySynced: loadedHistoryRealityIds.has(r.id),
  }])));
  committedHistory.set(db, historyBaselines);
  return loaded;
}

/** Load an inactive season without activating it or changing write ownership. */
export async function loadRealitySeasonFromDb(realityId: string): Promise<SeasonState> {
  const db = await loadDatabase();
  const rows = await db.select<{ season_json: string }>("SELECT season_json FROM realities WHERE id = ?", [realityId]);
  if (!rows[0]) throw new Error("Saved reality is missing; refusing to open an empty season.");
  try {
    const season = JSON.parse(rows[0].season_json);
    if (!season || typeof season !== "object" || Array.isArray(season)) throw new Error("Invalid season");
    return season as SeasonState;
  } catch { throw new Error("Saved reality is invalid; existing data has been preserved."); }
}

/** Lazy-load a dormant reality's Hall history when switching franchises. */
export async function loadRealityHistoryFromDb(
  realityId: string,
): Promise<SeasonHistoryEntry[]> {
  const db = await loadDatabase();
  const rows = await db.select<{ entry_id: string; entry_json: string; sort_order: number }>(
    "SELECT entry_id, entry_json, sort_order FROM reality_history WHERE reality_id = ? ORDER BY sort_order",
    [realityId],
  );
  const parsed = rows.map((r) => {
    try {
      return JSON.parse(r.entry_json) as SeasonHistoryEntry | null;
    } catch {
      throw new Error("Saved history is invalid; refusing to overwrite it.");
    }
  });
  const history = parsed.filter((e): e is SeasonHistoryEntry => e != null);
  readHistorySources.set(history, { db, realityId, baseline: baselineFromRows(rows, parsed) });
  // Reading alone does not authorize empty snapshots to replace this history.
  // The caller marks it loaded only when installing the result into state.
  return history;
}

/** Seed localStorage meta keys from SQLite meta_config table. */
export async function hydrateMetaConfigFromSqlite(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const db = await loadDatabase();
    const rows = await db.select<{ config_key: string; value: string | null }>(
      "SELECT config_key, value FROM meta_config",
    );
    if (rows.length === 0) return;
    for (const row of rows) {
      if (typeof row.value === "string") {
        localStorage.setItem(row.config_key, row.value);
      } else if (row.value === null) {
        localStorage.removeItem(row.config_key);
      }
    }
  } catch {
    // fall back to localStorage / file mirror
  }
}

/** Mirror meta localStorage keys into SQLite. */
export async function syncMetaConfigToSqlite(
  payload: Record<string, string | null>,
): Promise<void> {
  if (!isDesktop()) return;
  try {
    const db = await loadDatabase();
    for (const [configKey, value] of Object.entries(payload)) {
      await db.execute(
        "INSERT INTO meta_config (config_key, value) VALUES (?, ?) ON CONFLICT(config_key) DO UPDATE SET value = excluded.value",
        [configKey, value],
      );
    }
  } catch {
    // best-effort
  }
}

export async function clearDesktopStoreFromDb(storeKey: string): Promise<void> {
  const db = await loadDatabase();
  await serializeDbWrite(db, () => atomicWrite(db, async (writer) => {
    await writer.execute("DELETE FROM global_fragments WHERE store_key = ?", [storeKey]);
    await writer.execute("DELETE FROM global_state WHERE store_key = ?", [storeKey]);
    forgetHistoryBaseline(writer);
    await writer.execute("DELETE FROM reality_history");
    await writer.execute("DELETE FROM realities");
    loadedHistoryRealityIds.clear();
    savedRealities.delete(db);
    savedGlobals.delete(db);
  }));
}

export async function loadStorageValueFromSqlite<S>(
  storeKey: string,
): Promise<StorageValue<S> | null> {
  const state = await loadPersistedStateFromDb(storeKey);
  if (!state) return null;
  // Return the actual current persist version so Zustand does NOT re-trigger
  // migration (6→7) on every single startup.  Previously this was hardcoded to
  // 6, which caused Zustand to see a version mismatch and call setItem() before
  // onRehydrateStorage fired — a blocked-but-noisy extra code path.
  return { state: state as S, version: PERSIST_VERSION };
}

export async function saveStorageValueToSqlite<S>(
  storeKey: string,
  value: StorageValue<S>,
): Promise<void> {
  await savePersistedStateToDb(storeKey, value.state as PersistedStoreState);
}

export async function loadLegacyJsonStorageValue<S>(
  storeKey: string,
): Promise<StorageValue<S> | null> {
  const raw = await desktopStorage.getItem(storeKey);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as StorageValue<S>;
  } catch {
    throw new Error("Legacy saved state is invalid; refusing to overwrite it.");
  }
}
