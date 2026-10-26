# Windows bulk simulation blank screen: measurements, instrumentation and first fixes

Follow-up to `2026-10-25-bulk-white-screen.md` and `2026-10-25-history-incremental-write.md`. On the Windows build of v1.14.0 (WebView2), a multi-year bulk simulation turns the whole window white after about 2 or 3 simulated years. Nothing here was run on Windows or WebView2: every statement about the cause is an inference until the user's next Windows run produces the breadcrumb log described below.

## 1. Measurements (Node, disposable data)

Command, seed 731, Node 26 on Linux, in-memory `node:sqlite`, no store or personal save:

```
node --expose-gc --import tsx scripts/measure-bulk-years.ts 6 --full-match-sim --app-formats --persist
```

`--app-formats` uses the New Season defaults (bo1 regular season, bo5 playoffs, bo3/bo5 internationals). `--persist` saves the store's persisted shape (a copy of `partialize`) through the real `savePersistedStateToDbExecutor`, the real encoders and one executor whose baselines carry across years, and records every `persist_batch` statement. Two saves are measured per year:

- **Mid-year:** the debounced snapshot of the completed season just before rollover, the largest snapshot a save made during the season can carry. Only the global `season` fragment changes; `realities[].season` is updated only at checkpoints.
- **Checkpoint:** the flush after the bulk loop publishes the rolled-over season and the new history entry together.

"Payload" is `JSON.stringify({ statements })`, the string Tauri's IPC script builds (with a replacer) before `fetch()`. Statement sizes include JSON escaping of the nested JSON text. Worker sizes are `v8.serialize` byte lengths (same serializer as structured clone), sampled every 25th match.

| Year | Live season JSON in `global_fragments.season` (MB) | Mid-year payload (MB) | Checkpoint payload (MB) | Largest checkpoint statement (MB) | Season row + season fragment at checkpoint (MB) | Tauri stringify, mid-year / checkpoint (ms) | Heap after GC (MiB) | Worker request mean / max (KB) | Worker response max (KB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 13.94 | 13.96 | 8.38 | history row 6.33 | 1.03 + 1.03 | 113 / 60 | 49 | 312 / 853 | 848 |
| 2 | 15.45 | 15.47 | 8.48 | history row 6.27 | 1.10 + 1.10 | 129 / 67 | 61 | 287 / 721 | 716 |
| 3 | 16.21 | 16.22 | 8.51 | history row 6.25 | 1.13 + 1.13 | 146 / 78 | 73 | 310 / 820 | 809 |
| 4 | 17.14 | 17.15 | 9.32 | history row 6.52 | 1.40 + 1.40 | 141 / 79 | 86 | 299 / 799 | 794 |
| 5 | 17.10 | 17.12 | 9.73 | history row 6.54 | 1.60 + 1.60 | 137 / 97 | 97 | 310 / 909 | 905 |
| 6 | 17.75 | 17.77 | 9.56 | history row 6.49 | 1.54 + 1.54 | 163 / 84 | 108 | 308 / 776 | 760 |

Other per-year values: about 1,055 matches; archive 0.8-1.3 s and rollover 0.8-1.2 s; history entry JSON 5.1-5.3 MB; cumulative history 5.7 MB (year 1) to 34.4 MB (year 6); the encoded completed season (`encodeSeasonForDesktopDb`, the reality-row format) 9.9 MB (year 1) to 13.5 MB (year 6); `simResultsFeed` 0.27 to 1.1 MB. The all-bo1 fast mode (synthetic recaps without charts) gives 4.3-5.6 MB mid-year and 6.4-8.1 MB checkpoint payloads.

Measured facts:

- **The single largest IPC string is the mid-year save of the live season** (the global `season` fragment, 14.0 MB in year 1, 17.8 MB in year 6). It keeps the compact chart payloads of every finished stage of the current season, and it grows with the franchise (roster news, inactive pool, phase rosters).
- A checkpoint save sends 8.4-9.7 MB, dominated by the new history row (6.3-6.5 MB). Because v1.14.0 writes history incrementally, checkpoint payloads do not accumulate with years.
- The same season is sent twice per checkpoint (reality row and global fragment, about 1.0-1.6 MB each at the start of a year).
- Before any `fetch()`, Tauri's IPC script stringifies the whole payload again on the main thread: 113-163 ms for a mid-year save, 60-97 ms for a checkpoint.
- **Mid-year saves do happen during bulk.** The bulk loop publishes after every match, and the 500 ms debounce fires whenever a match takes 500 ms or more. In a one-year full simulation (same configuration), 29 of 1,034 matches took at least 500 ms and 153 at least 250 ms on this Linux machine (maximum 702 ms). Each such gap sent a 14-18 MB save. A slower CPU means more of them; how many on the user's machine is unknown.
- Worker messages are 0.3 MB on average and below 1 MB; the champion catalogue adds 36 KB per request. They do not grow with years.
- Node heap after GC, retaining history, season, feed and encoding caches, grows about 12 MB per year (49 to 108 MiB over 6 years).

Inferred, not measured:

- A white WebView2 window usually means the renderer process exited (`ProcessFailed`) and nothing reloaded it. On Windows, wry reads each IPC request body on the UI thread in 1 KB `IStream::Read` calls (read in `wry-0.55.1/src/webview2/mod.rs`, not profiled), so a 14-18 MB body costs about 15,000 COM calls there.
- The Node heap is far from V8's limit, so a pure JS heap exhaustion within 2-3 years would need retention specific to the WebView (React trees, duplicate state) that Node does not model.
- The leading suspect is therefore the repeated 14-18 MB IPC transfers of the live season during bulk and the main-thread work around them, but no measurement on Windows connects them to the crash.

## 2. Instrumentation for the next Windows run

- **Native breadcrumb log.** `src-tauri/src/diagnostics.rs` adds `diagnostics_breadcrumb` and `diagnostics_breadcrumb_log` (main window only). Each line is JSON: timestamp, stage, reality id, year, phase index, completed/total years, JS heap (`performance.memory`: used, total, limit) and, for saves, statement count and payload size. The command accepts only those fields (`deny_unknown_fields`, stage `[a-z-]`, id `[A-Za-z0-9-_.:]`), so no names, save contents or paths are written. The file is `logs/bulk-diagnostics.log` in the app data folder (on Windows `%APPDATA%\app.draftsim.desktop\logs\`), rotated at 256 KB with one older copy (`bulk-diagnostics.1.log`). Lines are written with `write_all` (no fsync): they survive a renderer or app crash, not a power loss.
- **Bulk stages.** `simulateRealityYears` awaits a breadcrumb before each heavy step: `start`, `season-sim`, `phase` (each phase change inside `runFranchiseSeasonSim`), `offseason`, `archive`, `publish`, `save`, `persist-batch` (every SQLite save during bulk, with its size), `export`, `year-done`, `guard-stop` and finally `idle`. Closing the window during bulk writes `app-closed`.
- **Next launch.** `components/BulkCrashNotice.tsx` (mounted by `PersistenceNotice`) reads the log on desktop. If the last breadcrumb is not `idle`, `app-closed` or `acknowledged`, it shows "The previous session ended unexpectedly during bulk year N, stage X." with Copy log and Dismiss (Dismiss appends `acknowledged`). The decision logic is `unexpectedBulkEnd` in `lib/bulkBreadcrumbs.ts`.
- **Save diagnostics.** `commit` entries now carry the `persist_batch` payload size (string lengths, equal to bytes for ASCII JSON) and every entry carries the JS heap when available. The export (Backups > Save performance diagnostics) also includes the parsed bulk log. These entries are session-only, so after a crash the breadcrumb log is the evidence.
- **WebView2 process failure from Rust: not available.** In the installed Tauri 2.11.2, `Builder::on_web_content_process_terminate` exists only on macOS and iOS, and wry 0.55.1 wires its terminate handler only for WKWebView. Logging WebView2 `ProcessFailed` would need `WebviewWindow::with_webview` plus a direct dependency on `webview2-com` (already in the lockfile through wry) to call `add_ProcessFailed`. That dependency was not added; it needs approval.

## 3. Changes

Each change has a measured before/after where Node can measure it.

1. **Hold debounced saves during bulk** (`holdDebouncedSqliteWrites` in `lib/desktopSqliteStorage.ts`, used by `simulateRealityYears`). While a bulk run is active the latest snapshot stays queued without its timer; only explicit flushes write it: the checkpoint after each archived year, the final flush when the run ends (pause, error or completion) and the close handler. Releasing the hold re-arms the debounce. Before: a 14-18 MB save for every match gap of 500 ms or more (at least 29 per year here). After: one 8.4-9.7 MB checkpoint per year. Trade-off: a crash mid-year loses that partial year, which bulk resume simulates again from the last checkpoint.
2. **Chunked `persist_batch` transport** (`lib/persistBatchTransport.ts`, `persist_stage_chunk` in `src-tauri/src/storage.rs`). Text bindings longer than 256 K characters are sent first as raw UTF-8 chunks of at most 1 MiB, and the batch carries `{"$staged": n}` placeholders. The native side resolves them and runs every statement in the one existing transaction, in the original order; staging never writes. Only the newest save token is kept, `persist_batch` always takes and clears staged data, UTF-8 is validated after joining, and a lost chunk fails the save before any SQL so the existing retry path re-sends everything. No schema change. Largest single IPC message: before, the whole payload (8.4-9.7 MB at checkpoints, 14-18 MB mid-year); after, 1 MiB. See the after table below for main-thread cost.
3. **Memory guard.** Before each year, if `performance.memory` reports the JS heap at 85% or more of its limit, bulk stops with a `guard-stop` breadcrumb and a message on the paused job ("Bulk simulation paused before year N: the app is close to its memory limit ... Completed years are saved. Restart DraftSim, then resume the simulation."). Unknown heap sizes never stop the run. The threshold is a guess: no Windows heap reading exists yet.

Not changed, with reasons:

- The global `season` fragment duplicates the active reality's season. Writing it slimmer or not at all changes what hydration restores (chart data of finished stages in the current season) and the save format; it needs a separate decision.
- Worker structured cloning is flat (0.3 MB per match on average) and is not a growth factor.
- No size cap refuses a save, because refusing would lose data; the guard stops the run instead.

### After (chunked transport, same command and seed)

`node --expose-gc --import tsx scripts/measure-bulk-years.ts 3 --full-match-sim --app-formats --persist` sends the same recorded statements through `sendPersistBatch` with a recording invoke. Payloads are identical to the table above (same seed). "Prepare" is the Node main-thread time to encode the staged values with `TextEncoder` and stringify the remaining small batch, against Tauri's stringify of the single payload before the change. WebView2 transfer costs are not measured.

| Year | Mid-year save: before (1 message) | Mid-year save: after | Checkpoint: before (1 message) | Checkpoint: after |
| --- | --- | --- | --- | --- |
| 1 | 13.96 MB, 124 ms | 13 messages, max 1 MiB, 10.0 ms | 8.38 MB, 66 ms | 9 messages, max 1 MiB, 7.7 ms |
| 2 | 15.47 MB, 119 ms | 15 messages, max 1 MiB, 10.0 ms | 8.48 MB, 63 ms | 9 messages, max 1 MiB, 5.2 ms |
| 3 | 16.22 MB, 133 ms | 15 messages, max 1 MiB, 10.8 ms | 8.51 MB, 66 ms | 9 messages, max 1 MiB, 5.4 ms |

With change 1, mid-year saves no longer happen during bulk; the mid-year columns show what a save outside bulk (or a pause) now costs. The same run also shows how load-dependent the mid-year saves were: while other processes competed for the CPU, 84 and 69 matches per year took 500 ms or more, against 10 in the uncontended third year (and 29 in the earlier one-year run).

## 4. What the Windows run must show

Use the instrumented build. Before starting, open Backups > Save performance diagnostics and enable "Record save performance". Then run bulk simulations of 3, 5 and 10 years on a disposable reality (or after a manual backup).

- If the window still turns white: restart DraftSim. The notice "The previous session ended unexpectedly during bulk year N, stage X" should appear; press Copy log and send it, or send `%APPDATA%\app.draftsim.desktop\logs\bulk-diagnostics.log` (and `bulk-diagnostics.1.log` if present). The last lines give the year, stage, phase, heap and the last save size.
- If it completes: export the diagnostics from the same panel; the file includes save sizes, durations, heap and the bulk log.
- If the run stops with the memory message, send the log too: the heap readings show whether memory grows by year.

The blank screen is not declared fixed until that run.
