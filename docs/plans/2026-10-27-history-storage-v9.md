# History storage v9: compressed rows, event records on demand, compaction

Status: proposed (2026-10-27). Target release v1.16.0. Workflow level: strict (schema change and data migration on the user's saves).

## Why

Measured on the affected user's save (57 archived years, read-only copy): `reality_history` holds 562 MB of JSON and startup reads all of it for the active reality (v1.15.0 made the reads chunked, not smaller). `eventRecords` are 58% of it (328 MB) and are used only by Event Statistics views and the bulk year summary. Each year's JSON compresses 5-7x with deflate.

Goal: startup reads roughly 35-40 MB instead of ~500 MB for this save, the database file shrinks accordingly, and nothing the user can see is lost.

## Design

1. **Compressed rows, still JSON objects.** `reality_history.entry_json` stores `{"$z":"deflate-raw","d":"<base64>"}` for compressed entries. It stays a valid JSON object, so the Rust backup validation (`src-tauri/src/backups.rs`, `json_valid`/`json_type = 'object'`) and SQL `json_extract` keep working. Reuse the deflate-raw helpers in `lib/shareCodec.ts` (`CompressionStream`/`DecompressionStream`, available in WebView2, WebKitGTK and Node). Plain JSON rows remain readable (mixed tables are valid during and after migration).
2. **Event records in their own table.** Additive `reality_event_records(reality_id, entry_id, records_json, PRIMARY KEY(reality_id, entry_id))`, compressed the same way. History rows are written without `eventRecords`; the in-memory entry carries a marker that records exist but are not loaded, so "not loaded" is never shown as "not recorded".
3. **Load on demand.** `loadEventRecordsFromDb(realityId, entryIds?)` (chunked like v1.15.0). `components/hall/ArchivedEventStats.tsx` and `components/hall/AllTimeEventStats.tsx` show a loading state, then data, with error + retry. The bulk summary keeps using the records of the year just archived from memory. Export/import (`lib/realityExport.ts`, `lib/importValidation.ts`) join records back so the export format does not change.
4. **Schema v9.** `DATABASE_VERSION` 8 -> 9. Older builds already refuse an unknown version ("Update DraftSim before opening it"), so they never misread v9 rows.

## Migration (first launch of v1.16.0)

1. Before writing anything: the existing pre-upgrade recovery copy (the same `VACUUM INTO` snapshot path used for v7 -> v8, with verify and retention) — never a copy of the live WAL file.
2. Move and compress per history row in bounded transactions: write `reality_event_records`, rewrite the row compressed without records. Each row is self-contained, so the migration is resumable: rows already in the new form are skipped after an interruption.
3. Mark v9 only after every row is converted and a verification pass (decompress + parse every row and record) succeeds.
4. `VACUUM` once at the end, with the existing operation overlay and progress (`advanceOperationProgress`), so the file actually shrinks.
5. Rollback: restore the recovery copy from Backups (previous app version opens it). If the migration fails midway, the app keeps working on the mixed table and retries on the next launch; it never overwrites a row it could not read.

## Tests

- Unit (fake executor + real `node:sqlite`): compress/decompress round-trip (Unicode, empty, large); mixed plain/compressed tables; records split and joined; "not loaded" vs "not recorded"; migration idempotence and resume after an injected failure at each step; v9 marked only after verification; export unchanged before and after migration.
- Rust: backup validation accepts compressed rows (`npm run test:desktop`).
- E2E: Event Statistics loading state and retry; all-time stats after migration.
- Real data: run the migration on a copy of the user's DB (`~/draftsim-debug/work.db`), report file size before/after, startup read volume and time, and diff every decoded entry against the original.

## Out of scope

Dropping round-by-round checkpoints or old market news (both would lose visible data; not needed once compressed and loaded on demand).

## Delivery

Own branch, red/green tests, `npm run check`, full e2e, `npm run test:desktop`; the user tests on Windows with a disposable copy of the save before the release is published; push/PR/merge/tag only with the user's yes.
