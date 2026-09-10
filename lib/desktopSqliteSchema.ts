/** SQLite schema + migration helpers (testable without Tauri). */

export const DESKTOP_DB_FILENAME = "draftsim.db";
export const STORE_KEY = "draftsim-store";
export const META_CONFIG_KEY = "draftsim-meta-config";
export const JSON_MIGRATION_FLAG = "json_migrated_v1";

/**
 * Zustand persist version stored in the SQLite-backed storage.
 * Must stay in sync with `version` in draftStore's persist options.
 * Returning the correct version prevents Zustand from re-triggering
 * migration (6→7) on every startup due to the stale hardcoded "6".
 */
export const PERSIST_VERSION = 7;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('persist_version', '7');

CREATE TABLE IF NOT EXISTS global_state (
  store_key TEXT PRIMARY KEY NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS realities (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  season_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reality_history (
  reality_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (reality_id, entry_id),
  FOREIGN KEY (reality_id) REFERENCES realities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reality_history_reality
  ON reality_history(reality_id, sort_order);

CREATE TABLE IF NOT EXISTS meta_config (
  config_key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

/** Upsert one Hall history row (idempotent on zustand re-persist). */
export const UPSERT_REALITY_HISTORY_SQL = `
INSERT INTO reality_history (reality_id, entry_id, entry_json, sort_order)
VALUES (?, ?, ?, ?)
ON CONFLICT(reality_id, entry_id) DO UPDATE SET
  entry_json = excluded.entry_json,
  sort_order = excluded.sort_order`;

export type PersistedStoreState = Record<string, unknown> & {
  realities?: Array<{
    id: string;
    name: string;
    year: number;
    season: unknown;
    history?: unknown[];
  }>;
  activeRealityId?: string | null;
};

/** Split zustand partialized state into global blob + per-reality rows. */
export function splitPersistedState(state: PersistedStoreState): {
  global: Record<string, unknown>;
  realities: Array<{
    id: string;
    name: string;
    year: number;
    season: unknown;
    history: unknown[];
  }>;
  activeRealityId: string | null;
} {
  const {
    realities: rawRealities = [],
    activeRealityId = null,
    ...rest
  } = state;
  const global = { ...rest, activeRealityId, realities: [] as unknown[] };
  const realities = rawRealities.map((r) => ({
    id: r.id,
    name: r.name,
    year: r.year,
    season: r.season,
    history: Array.isArray(r.history) ? r.history : [],
  }));
  return { global, realities, activeRealityId: activeRealityId ?? null };
}

/** Merge global blob + reality rows back into one persisted state object. */
export function mergePersistedState(
  global: Record<string, unknown>,
  realities: Array<{
    id: string;
    name: string;
    year: number;
    season: unknown;
    history: unknown[];
  }>,
  options?: { lazyHistoryForInactive?: boolean; activeRealityId?: string | null },
): PersistedStoreState {
  const activeId =
    options?.activeRealityId ??
    (typeof global.activeRealityId === "string" ? global.activeRealityId : null);
  const mergedRealities = realities.map((r) => ({
    id: r.id,
    name: r.name,
    year: r.year,
    season: r.season,
    history:
      options?.lazyHistoryForInactive && activeId && r.id !== activeId
        ? []
        : r.history,
  }));
  return {
    ...global,
    activeRealityId: activeId,
    realities: mergedRealities,
  };
}

/** Extract meta config payload from legacy JSON file contents. */
export function parseMetaConfigJson(raw: string): Record<string, string | null> {
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") out[key] = value;
    else if (value === null) out[key] = null;
  }
  return out;
}
