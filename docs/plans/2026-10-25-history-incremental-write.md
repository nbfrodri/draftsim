# Incremental desktop history writes

Follow-up to `2026-10-25-bulk-white-screen.md`. In desktop SQLite persistence, `syncRealityHistory` encoded and upserted every `SeasonHistoryEntry` of a reality whenever that reality's history array changed. A bulk run archives one entry (about 5 MB) per year, so year *n* re-encoded and re-sent *n* entries: write volume and main-thread `JSON.stringify` time grew quadratically.

## History persistence path

- **Schema.** `reality_history(reality_id, entry_id, entry_json, sort_order)`, primary key `(reality_id, entry_id)`. Reads order by `sort_order`; writes store the array index, so index 0 is the newest year.
- **Write queue.** Zustand `setItem` schedules a debounced snapshot (`desktopSqliteStorage.ts`); `flushPendingSqliteWrites` drains snapshots in order and retains a failed snapshot for retry. `serializeDbWrite` orders all writes per executor. `atomicWrite` collects the statements of one save and commits them through the native `persist_batch` command (one SQLx transaction). On failure it restores `loadedHistoryRealityIds` and drops the `savedRealities`/`savedGlobals` baselines.
- **Reconcile.** `reconcilePersistedState` keeps the empty-state wipe guard, upserts changed reality rows, and calls `syncRealityHistory` for a reality only when its history is loaded (or non-empty) and the array reference differs from the committed `savedRealities` baseline, or `forceAllHistory` is set. It then deletes realities missing from state.
- **Hydration.** `loadPersistedStateFromDbExecutor` parses only the active reality's history; other realities get empty lazy placeholders that must never delete stored rows. After every row parses, it seeds `savedRealities`/`savedGlobals` so the first save does not rewrite the save.
- **Lazy loads.** `loadRealityHistoryFromDb` (switching realities, Hall tabs, export, market history) reads a dormant history; `markRealityHistoryLoaded(id, history)` authorizes saves for it after older snapshots drain.
- **Other writers.** `upsertRealityInDb(..., { syncHistory: true })` (new reality, reality import), `deleteRealityFromDb`, `syncRemovedRealities`, `clearDesktopStoreFromDb` (persist `removeItem`), JSON-to-SQLite migration (`forceAllHistory`). Compaction rewrites only `season_json`. Backup restore replaces the database file natively with writes paused, then reloads the page.

## Are archived entries immutable?

Yes in normal play, by object identity. Archive and rollover build a new entry and prepend it (`[entry, ...prev.filter(id !== entry.id)].slice(0, cap)`); existing entries keep their references. Re-archiving the same season id replaces the entry with a new object. Removal (`removeSeasonFromHistory`) and the cap filter entries out. Imports (`importReality`, `importSeasonHistory` for the global Hall) create new objects. No code mutates a stored entry in place: the only in-place assignment (`historyImport.ts`) fills a freshly built entry before it is returned. Hydration keeps the parsed entry objects (`mergePersistedState` and the persist merge do not copy them).

Because years are prepended, every existing row's `sort_order` shifts by one each year.

## Design

- A per-executor, per-reality baseline of committed rows: `entry_id -> { entry reference, index }`. The fingerprint is object identity, the convention already used for reality rows and global fragments; it costs nothing and needs no stored JSON.
- `syncRealityHistory` compares each entry with the baseline: new or replaced objects are upserted with their JSON; unchanged objects whose index moved get a JSON-free `UPDATE ... SET sort_order`; unchanged rows are skipped. Duplicate ids within one array are always written so the last occurrence wins, as before. The stale-row delete (`entry_id NOT IN (...)`, or delete-all for an empty history) still runs on every sync.
- Baselines are staged on the transaction writer and become committed only after `persist_batch` succeeds. A failed plan or commit drops every baseline for that database, so the retry rewrites the whole history. Deletes (`deleteRealityFromDb`, removed realities, store clear) drop baselines before committing; dropping only causes extra writes. `forceAllHistory` ignores baselines and rewrites every row. Backup restore drops all write baselines after the native call.
- Hydration seeds the active reality's baseline from the rows it parsed (with their stored `sort_order`); a lazy read seeds a dormant reality's baseline when `markRealityHistoryLoaded` installs that exact array, and never replaces a baseline set by a commit. `switchReality` now passes the read history, so opening a dormant reality no longer re-encodes its whole Hall on the next save.
- No schema change and no migration. Rows are written exactly as before.

## Results

A scratch script saved 30 archived years (about 0.65 MB of nested JSON each, newest first) through `savePersistedStateToDbExecutor` into a disposable file database (`node:sqlite`, WAL, one transaction per save). Node 26 on Linux:

| Metric | Before | After |
| --- | --- | --- |
| History JSON encoded and sent to the batch | 304.2 MB | 19.6 MB (one entry per year) |
| WAL bytes written | 40.8 MB | 40.8 MB |
| Total save time, 30 years | 2.30 s | 0.69 s |
| Save time, year 30 | 114 ms | 56 ms |

SQLite already avoided rewriting unchanged pages when an identical row was upserted, so disk writes were not the quadratic part. The quadratic part was frontend work: `JSON.stringify` of every year and the IPC payload to `persist_batch`. With real archives (about 5.1–5.3 MB in `scripts/measure-bulk-years.ts`) one entry takes roughly 45–75 ms to stringify, against about 0.8–1 s each for archive and rollover. Before this change, year *n* stringified and sent *n* entries (about 160 MB at year 30). The single per-year stringify stays on the main thread; moving it would be a larger redesign.

Each year still issues one `UPDATE ... sort_order` per older row (tiny statements; in the 1 MB-row test, about 37 KB of WAL each).

## Verification limits

Unit tests use the fake executors in `lib/desktopSqlite.test.ts` plus one real in-memory `node:sqlite` round trip with an injected failed transaction. The measurement used a real SQLite file. Neither WebView2 on Windows nor the Tauri `persist_batch` path with a real application database was exercised.
