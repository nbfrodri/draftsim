# Bulk simulation white screen: archive size and responsiveness

Reported on Windows desktop (WebView2): a long bulk simulation turns the window blank part-way through. The suspected cause is renderer memory and long synchronous work while each year is archived and saved. Node measurements can rank contributors but cannot prove the cause of a WebView2 renderer exit.

## Measurement

`node --expose-gc --import tsx scripts/measure-bulk-years.ts 10` runs a disposable headless franchise with the production season engine, archive and rollover (synthetic best-of-one recaps; `--full-match-sim` adds AI drafting and match simulation). It touches no store, database or personal save. Results for 10 years, seed 731, Node 26 on Linux:

| Metric (year 10 unless noted) | Version 1 archives (main) | Version 2 archives |
| --- | --- | --- |
| History entry JSON | 8.68 MB (8.3–8.7 MB per year) | 5.46 MB (5.1–5.5 MB) |
| `eventRecords` JSON | 7.14 MB, 84% of entries | 3.92 MB, 74% of entries |
| Archive (`buildSeasonHistoryEntry`), mean | 2.93 s | 0.86 s |
| Rollover (`startNextSeasonWithArchive`), mean | 3.30 s | 0.93 s |
| Cumulative history JSON | 90.1 MB | 57.6 MB |
| Stringify of that history | 1.73 s | 0.69 s |
| Heap after GC | 216 MB | 174 MB |

Event records dominated the archives, and their per-checkpoint `computeEventStats` recomputation dominated archive time.

## Changes

- **Version 2 event archives.** Each scope is built in one source-ordered pass. A checkpoint stores absolute totals only for players whose totals, name or teams changed since the previous checkpoint, indexed into the final identities. Games that complete out of source order trigger a replay so floating-point sums, names and team order match an independent recomputation. On three simulated years, all 2,753 checkpoints rebuilt rankings identical to version 1 (0 mismatches).
- **Compatibility.** Version 1 records are read, validated and imported unchanged; there is no migration or rewrite. Import validation accepts both versions and rejects mixed encodings, bad indices, metrics and team references. Older binaries reject version 2 records on import.
- **KDA retention.** Desktop SQLite slimming of completed tournaments now keeps per-pick KDA as a compact `recapC.kda`. Before this change, a season reloaded from its reality row (after switching realities) lost KDA for completed stages, so its event archive, awards fallback and form lacked it. Stages slimmed by earlier versions remain without KDA (unknown, not zero).
- **Bulk loop.** The loop yields after publishing the completed year (a queued cancel then stops before archival, leaving a resumable completed season) and before each flush. Season and history are still published in one `set`, and every archived year is flushed.
- **Error fallbacks.** `app/error.tsx` and the new `app/global-error.tsx` share a generic fallback with Retry and Copy details. Fonts move to `app/fonts.ts` so the global boundary, which replaces the root layout, can apply them. Boundaries cannot recover a terminated renderer or catch errors in async simulation code.

## Remaining risks

- Event records are still about 74% of each entry: most players change at every round, and the regular-season scope repeats the whole-event checkpoints.
- Desktop history sync re-serializes and upserts every history entry whenever the history array changes (`syncRealityHistory`), so each archived year rewrites the whole history. Over a long bulk run this write load grows quadratically and is a likely remaining contributor.
- Not verified on Windows WebView2 or in a native desktop build.
