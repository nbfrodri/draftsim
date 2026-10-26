# Large-save performance: startup size, bulk heap growth, duplicated active season

Status: proposed (2026-10-26). Follows v1.15.0, which made startup reads chunked (<= 1 MiB per select) but did not reduce how much is read.

## Evidence (read-only copy of the affected user's database, 540 MB, reality at year 58)

| Data | Size |
|---|---|
| `reality_history`, 57 years | 498 MB, parsed ~950 MB of JS heap |
| Years 44-57 (`eventRecords` v2) | ~12-15 MB per year, of which `eventRecords` ~6.4 MB |
| Years 25-43 (`eventRecords` v1) | ~14-15 MB per year, of which `eventRecords` ~10.3 MB |
| Years 1-24 (no event records) | 2-4 MB per year |
| Global `season` fragment (live season, mid-year) | 32 MB |
| `realities.season_json` (same reality, slim encoding, last checkpoint) | 4.5 MB |

Correction to the earlier diagnosis: the large years are the RECENT ones. `eventRecords` (per-event player/champion rankings, added in v1.13/v1.14) are ~60-70% of every recent year and are read at startup although only two Hall views use them (`components/hall/ArchivedEventStats.tsx`, `lib/season/allTimeEventStats.ts`) plus the bulk year summary at archive time (`store/draftStore.ts` `buildYearEventSummary`). Every new year adds ~12 MB to startup.

Bulk log: JS heap at the start of each year grows ~200-250 MB per simulated year (1.52 -> 1.79 -> 1.98 GB), well above the ~17 MB per year that parsed history alone explains.

## 1. Load event records on demand (largest win; strict: schema + data move)

Goal: startup reads history WITHOUT `eventRecords`; they load when an event-statistics view opens.

1. Additive table `reality_event_records(reality_id, entry_id, records_json, PRIMARY KEY(reality_id, entry_id))` in `lib/desktopSqliteSchema.ts`; bump `DATABASE_VERSION`.
2. Write path (`lib/desktopSqlite.ts` history sync): store `eventRecords` in the new table and the entry without them in `reality_history`; same transaction, same chunked `persist_batch`.
3. Read path: startup and `loadRealityHistoryFromDb` skip records; new `loadEventRecordsFromDb(realityId, entryIds?)` (chunked like v1.15.0). In memory the entry carries `eventRecords: undefined` plus a marker that records exist but are not loaded, so "not loaded" is never shown as "not recorded" (AGENTS.md: missing is unknown, not zero).
4. Consumers: `AllTimeEventStats` and `ArchivedEventStats` request records when opened (loading state, error + retry); the bulk summary uses the in-memory records of the year just archived. Export/import (`lib/realityExport.ts`, `lib/importValidation.ts`) keep the current JSON format by joining records back.
5. Migration on first launch of the new version: before it, the existing backup/snapshot workflow takes a recoverable copy (never copy the live WAL); move records row by row in bounded transactions; resumable if interrupted (rows already moved are skipped); rollback = the previous app version still reads the original file from the snapshot, and the new version can rejoin records into `reality_history` with a one-off command if needed.
6. Optional in the same migration: convert v1 records to v2 (saves ~4 MB per year for years 25-43, ~75 MB in this save).

Expected effect on this save: startup history ~498 MB -> ~200 MB, and each new year adds ~5 MB instead of ~12 MB.

Tests: fake executor and real SQLite (`node:sqlite`, pattern in `lib/persistBatchTransport.test.ts`): round-trip with and without records, migration idempotence and resume, export unchanged, views show "loading" then data, legacy years stay "not recorded". Verification: run the migration and the load on a copy of the user's DB (`~/draftsim-debug/work.db`) and report sizes and time.

## 2. Find and fix the bulk heap growth (measure first; standard)

1. Reproduce in Node with `scripts/measure-bulk-years.ts` on a large fixture (or the user's DB copy loaded through the real loader), taking `v8.getHeapSnapshot()` at the start of years N and N+2 and diffing retained sizes by constructor/path.
2. Suspects to confirm or discard: `savedRealities` / `committedHistory` baselines in `lib/desktopSqlite.ts` keeping old season objects; the memoized compact-encoding cache in `store/draftStore.ts` (identity-keyed, may retain every year's tournaments); `entryCache`/`seen` and `simResultsFeed` in `store/actions/simulation.ts`; Zustand history of `realities` copies.
3. Fix what the snapshot shows (bounded caches, WeakMap, releasing baselines after a checkpoint) with a test that the retained heap per simulated year stays under a budget.

Expected effect: the heap at the start of each year should only grow by the parsed size of the new archive (~5-12 MB), not 200+ MB.

## 3. The active season stored twice (needs a user decision)

Facts: the global `season` fragment holds the live season in full compact encoding (32 MB mid-year: match recaps and charts of events already played this year). The reality row holds a slim copy (`encodeSeasonForDesktopDb`: completed tournaments lose chart data) written only at checkpoints. On load the fragment wins. So it is not a byte-for-byte duplicate: the row is a lossy fallback and the fragment is the source of truth.

Options:
- A (recommended): keep both, but write the reality row only at year checkpoints and when switching realities (already mostly true), and slim completed tournaments of the current year inside the fragment after their event ends, keeping replay data only for the event in progress. Cuts the fragment from ~32 MB to a few MB. Cost: replay charts of events already finished this year are no longer available (same as archived years today).
- B: store the live season only in the reality row (full encoding) and drop the fragment for franchise seasons. Removes the duplicate, but every mid-year save rewrites the reality row and the load/ownership code changes (riskier).
- C: leave it as is.

## Order and release

1. Item 2 measurement (cheap, no schema change) -> fix -> release.
2. Item 3 after the user picks an option.
3. Item 1 (migration) last, behind a backup, with a Windows test on a disposable copy before release.

Each step on its own branch, red/green tests, `npm run check`, e2e; push/PR/merge/tag only with the user's yes.
