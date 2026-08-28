/**
 * desktopSqlite.ts — SQLite persistence for DraftSim desktop (Tauri).
 *
 * Replaces monolithic draftsim-store.json with normalized tables so writes
 * touch only the active reality row (+ global metadata) instead of re-stringifying
 * the entire franchise on every set().
 */

import type { StorageValue } from "zustand/middleware";
import type { SavedReality } from "@/store/draftStore";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import {
  DESKTOP_DB_FILENAME,
  JSON_MIGRATION_FLAG,
  META_CONFIG_KEY,
  SCHEMA_SQL,
  UPSERT_REALITY_HISTORY_SQL,
  mergePersistedState,
  parseMetaConfigJson,
  splitPersistedState,
  type PersistedStoreState,
} from "./desktopSqliteSchema";
import {
  clearDesktopOperation,
  isDesktop,
  desktopStorage,
  signalCompactingDatabase,
} from "./desktopStorage";

export type SqlExecutor = {
  execute: (query: string, bindValues?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T[]>;
};

let dbPromise: Promise<SqlExecutor> | null = null;

/** Reality ids whose history rows are fully loaded in memory (lazy history). */
const loadedHistoryRealityIds = new Set<string>();

/** @internal test helper */
export function resetSqliteStorageForTests(): void {
  dbPromise = null;
  loadedHistoryRealityIds.clear();
}

/** @internal test helper — inject a mock SqlExecutor instead of opening Tauri DB. */
export function setDesktopDatabaseForTests(db: SqlExecutor | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}

/** @internal test helper */
export function markRealityHistoryLoaded(realityId: string): void {
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
      const db = await Database.load(`sqlite:${dbPath}`);
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute(SCHEMA_SQL);
      return db as unknown as SqlExecutor;
    })();
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
): Promise<void> {
  const now = Date.now();
  await db.execute(
    `INSERT INTO global_state (store_key, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(store_key) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`,
    [storeKey, JSON.stringify(global), now],
  );
}

async function upsertRealityRow(
  db: SqlExecutor,
  reality: Pick<SavedReality, "id" | "name" | "year" | "season">,
): Promise<void> {
  const now = Date.now();
  await db.execute(
    `INSERT INTO realities (id, name, year, season_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       year = excluded.year,
       season_json = excluded.season_json,
       updated_at = excluded.updated_at`,
    [reality.id, reality.name, reality.year, JSON.stringify(reality.season), now],
  );
}

/** Immediate upsert of one reality row (+ optional history sync). */
export async function upsertRealityInDb(
  reality: Pick<SavedReality, "id" | "name" | "year" | "season"> & {
    history?: SeasonHistoryEntry[];
  },
  options?: { syncHistory?: boolean },
): Promise<void> {
  const db = await loadDatabase();
  await upsertRealityRow(db, reality);
  if (options?.syncHistory && reality.history) {
    await syncRealityHistory(db, reality.id, reality.history);
    loadedHistoryRealityIds.add(reality.id);
  }
}

/** Remove one reality and its Hall history from SQLite. */
export async function deleteRealityFromDb(realityId: string): Promise<void> {
  const db = await loadDatabase();
  await db.execute("DELETE FROM reality_history WHERE reality_id = ?", [realityId]);
  await db.execute("DELETE FROM realities WHERE id = ?", [realityId]);
  loadedHistoryRealityIds.delete(realityId);
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

/**
 * Reclaim disk space after large deletes (SQLite does not shrink the file
 * automatically). Desktop only — runs PRAGMA vacuum on the app database.
 */
export async function compactDesktopDatabase(): Promise<void> {
  if (!isDesktop()) return;
  signalCompactingDatabase();
  try {
    const db = await loadDatabase();
    await db.execute("VACUUM");
  } finally {
    clearDesktopOperation();
  }
}

/** Sync history rows: upsert each entry, then drop rows removed from state. */
export async function syncRealityHistory(
  db: SqlExecutor,
  realityId: string,
  history: SeasonHistoryEntry[],
): Promise<void> {
  for (let i = 0; i < history.length; i++) {
    const entry = history[i]!;
    await db.execute(UPSERT_REALITY_HISTORY_SQL, [
      realityId,
      entry.id,
      JSON.stringify(entry),
      i,
    ]);
  }

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
    await db.execute("DELETE FROM reality_history");
    await db.execute("DELETE FROM realities");
    loadedHistoryRealityIds.clear();
    return;
  }

  for (const row of existing) {
    if (!keep.has(row.id)) {
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
  const { global, realities, activeRealityId } = splitPersistedState(state);
  await upsertGlobalState(db, storeKey, global);

  for (const r of realities) {
    await upsertRealityRow(db, {
      id: r.id,
      name: r.name,
      year: r.year,
      season: r.season as SavedReality["season"],
    });
    const historyLoaded =
      options?.forceAllHistory ||
      loadedHistoryRealityIds.has(r.id) ||
      r.id === activeRealityId;
    if (historyLoaded) {
      await syncRealityHistory(db, r.id, r.history as SeasonHistoryEntry[]);
      loadedHistoryRealityIds.add(r.id);
    }
  }

  await syncRemovedRealities(
    db,
    realities.map((r) => r.id),
  );
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
  const globalRows = await db.select<{ state_json: string }>(
    "SELECT state_json FROM global_state WHERE store_key = ?",
    [storeKey],
  );
  if (!globalRows[0]) return null;

  let global: Record<string, unknown>;
  try {
    global = JSON.parse(globalRows[0].state_json) as Record<string, unknown>;
  } catch {
    return null;
  }

  const activeRealityId =
    typeof global.activeRealityId === "string" ? global.activeRealityId : null;

  const realityRows = await db.select<{
    id: string;
    name: string;
    year: number;
    season_json: string;
  }>("SELECT id, name, year, season_json FROM realities ORDER BY name");

  loadedHistoryRealityIds.clear();
  const realities: Array<{
    id: string;
    name: string;
    year: number;
    season: unknown;
    history: unknown[];
  }> = [];

  for (const row of realityRows) {
    let season: unknown;
    try {
      season = JSON.parse(row.season_json);
    } catch {
      season = null;
    }

    let history: unknown[] = [];
    if (activeRealityId && row.id === activeRealityId) {
      const histRows = await db.select<{ entry_json: string }>(
        "SELECT entry_json FROM reality_history WHERE reality_id = ? ORDER BY sort_order",
        [row.id],
      );
      history = histRows
        .map((h) => {
          try {
            return JSON.parse(h.entry_json);
          } catch {
            return null;
          }
        })
        .filter((e): e is unknown => e != null);
      loadedHistoryRealityIds.add(row.id);
    }

    realities.push({
      id: row.id,
      name: row.name,
      year: row.year,
      season,
      history,
    });
  }

  return mergePersistedState(global, realities, {
    lazyHistoryForInactive: true,
    activeRealityId,
  });
}

/** Lazy-load a dormant reality's Hall history when switching franchises. */
export async function loadRealityHistoryFromDb(
  realityId: string,
): Promise<SeasonHistoryEntry[]> {
  const db = await loadDatabase();
  const rows = await db.select<{ entry_json: string }>(
    "SELECT entry_json FROM reality_history WHERE reality_id = ? ORDER BY sort_order",
    [realityId],
  );
  const history = rows
    .map((r) => {
      try {
        return JSON.parse(r.entry_json) as SeasonHistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is SeasonHistoryEntry => e != null);
  loadedHistoryRealityIds.add(realityId);
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
  await db.execute("DELETE FROM global_state WHERE store_key = ?", [storeKey]);
  await db.execute("DELETE FROM realities");
  await db.execute("DELETE FROM reality_history");
}

export async function loadStorageValueFromSqlite<S>(
  storeKey: string,
): Promise<StorageValue<S> | null> {
  const state = await loadPersistedStateFromDb(storeKey);
  if (!state) return null;
  return { state: state as S, version: 6 };
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
    return null;
  }
}
