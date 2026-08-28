# Franchise save performance (69+ season realities)

## Root causes of lag

1. **`partialize` on every `set()`** — Zustand persist runs `partialize` after each state update. During season/tournament bulk sim that means hundreds of passes over the full persisted slice.

2. **Uncompressed franchise `realities`** — Each `SavedReality` carries a full `SeasonState` (all stage tournaments + game recaps). Before v6-style encoding was applied to realities, inactive slots were persisted verbatim — the largest field in long franchises.

3. **Synchronous web `JSON.stringify`** — Web builds used `createJSONStorage`, which stringified the entire persisted object on every `set()`, blocking the main thread during bulk simulation.

4. **Eager rehydration decode** — On load, every tournament in the active season was decoded from `recapC` back to full recaps, even for data not needed until opening a replay.

5. **Large Hall history** — 69 archived `SeasonHistoryEntry` rows (player careers, phase rosters, H2H) are heavier than raw match logs but still add parse/render cost in the Hall UI. History entries are résumés, not full match timelines.

## Optimizations implemented

| Change | File(s) | Expected impact |
|--------|---------|-----------------|
| **Compact-encode franchise `realities` on persist** | `store/draftStore.ts`, `lib/recapCompression.ts` | Large drop in save file size and stringify time for multi-year franchises (same `recapC` treatment as live season). |
| **Memoized `compactEncodeSeasonForPersist`** | `lib/recapCompression.ts` | Unchanged season reference → zero re-encode cost across batched sim commits. |
| **Memoized `compactEncodeRealitiesForPersist`** | `store/draftStore.ts` | Same for the realities array reference. |
| **Lazy decode on rehydrate** | `store/draftStore.ts` | Only the **active** season is decoded at load; inactive reality slots decode when switched via `switchReality`. |
| **Web lazy + debounced persist** | `lib/desktopStorage.ts` (`createWebLazyStorage`) | Defers stringify and localStorage write by 500ms; coalesces bulk-sim bursts (matches desktop behavior). |

Existing mitigations retained: recap `recapC` compression, tournament/match/recap WeakMap caches, bulk-sim commit batching (`BATCH = 4`), `MatchCard` streak memoization, Hall matrix `useMemo`.

## Migration / compatibility

- **Persist version unchanged (v6)** — No schema bump. Realities that were saved uncompressed load normally; the next save writes compact form.
- **Kill totals** — New optional `blueKills` / `redKills` on `GameRecap`; UI falls back to summing `perPickKDA` for older recaps.
- **Inactive reality decode** — If code reads an inactive reality's tournaments before `switchReality`, recaps may still be compact (`recapC`). Always use the live `season` field or call `decodeCompactSeason` before replay UI.

## Measuring locally

- **Save size**: DevTools → Application → Local Storage (web) or `%APPDATA%/draftsim-store.json` (desktop).
- **Encode hot path**: `npm test -- lib/recapCompression.bench.test.ts`
- **Regression**: `npm test` + `npx tsc --noEmit`
