# Desktop SQLite storage

DraftSim desktop (`app.draftsim.desktop`) persists game state in an embedded **SQLite** database instead of a monolithic JSON file. The web build continues to use `localStorage` unchanged.

For current write-queue, transaction, failure and recovery contracts, see the [persistence and recovery guide](persistence-and-recovery.md).

## Location

| Artifact | Path |
|----------|------|
| Database | `%APPDATA%\app.draftsim.desktop\draftsim.db` |
| Legacy store (after migration) | `draftsim-store.json.bak` |
| Legacy meta config (after migration) | `draftsim-meta-config.json.bak` |

The DB is created automatically on first launch after updating to a build that includes SQLite storage.

## Schema

```sql
schema_meta       (key, value)           -- migration flags
global_state      (store_key, state_json, updated_at)
realities         (id, name, year, season_json, updated_at)
reality_history   (reality_id, entry_id, entry_json, sort_order)
meta_config       (config_key, value)    -- champion meta mirror
```

- **global_state** — everything from Zustand `partialize` except per-reality bodies (`series`, `tournament`, presets, active season mirror, etc.). The `realities` array in this blob is always empty; reality data lives in normalized tables.
- **realities** — one row per franchise slot; `season_json` is the compact-encoded active year.
- **reality_history** — one row per Hall-of-Seasons entry for a franchise (69+ years → 69+ small rows instead of one giant JSON array rewrite).
- **meta_config** — replaces `draftsim-meta-config.json` on desktop.

## Migration flow (first launch after update)

1. `createDesktopSqliteStorage.getItem` runs before Zustand rehydration.
2. If `schema_meta.json_migrated_v1` is unset **and** `global_state` is empty **and** `draftsim-store.json` exists in AppData:
   - Parse the legacy JSON `StorageValue` (persist v6).
   - Split into `global_state` + `realities` + `reality_history` rows (full history for all franchises).
   - Import `draftsim-meta-config.json` into `meta_config` if present.
   - Rename JSON files to `.bak` (non-destructive backup).
   - Set `json_migrated_v1 = 1`.
3. Subsequent loads read only from SQLite.

If migration fails, the app keeps the JSON file and logs a warning; the user can retry after fixing disk permissions.

## Read / write behaviour

### Load (startup)

- Read `global_state` + all `realities` rows (metadata + compact season per slot).
- Load **Hall history only for the active reality**; inactive franchises get `history: []` in memory.
- `onRehydrateStorage` still decodes only the active season (unchanged).

### Lazy history

When the user calls `switchReality(id)` on desktop, if the target slot has empty in-memory history, `loadRealityHistoryFromDb(id)` fetches rows asynchronously and patches the store.

### Save (every Zustand `set`)

- Debounced **500 ms** (same as the old file adapter).
- Computes changes to `global_state`, reality rows and loaded history. Reference caches avoid serializing and rewriting unchanged aggregates; caches advance only after commit.
- History rows are written only for realities whose history is **loaded in memory** (active reality, or one the user switched to). This prevents wiping dormant franchise halls when their history was not hydrated.

### Flush

- Window close / bulk-year sim: `flushPendingPersistWrites()` → SQLite flush + legacy file flush (file path is unused on desktop after migration).

## Export / import

Portable backup **`.draftsim-reality.json`** is unchanged — `exportReality` / `importReality` in the store, not the persist layer.

## Persist version

Zustand persist **version 7** marks the desktop storage backend change. State shape is compatible with v6; no field migrations were required.

## Tests

Pure schema helpers, write queues, SQL planning, save failures and season-exit persistence have automated unit coverage. Rust tests cover native transaction and backup behavior. CI also runs installer, migration, native navigation, reopen and reinstall checks on disposable Windows runners; consult the result of the specific run before claiming validation. See the [development and release guide](development-and-release.md).

## Follow-ups (optional)

- Lazy-load inactive reality **season** blobs (hub currently loads compact seasons for all slots; history was the main win).
- Rust-side migrations via `tauri_plugin_sql::Migration` instead of `CREATE TABLE IF NOT EXISTS` from JS.
- Incremental `global_state` columns (settings vs tournament) to shrink the remaining global JSON blob.
