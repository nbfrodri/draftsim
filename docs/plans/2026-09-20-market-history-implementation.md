# Market history in the Hall

## Accepted behavior

Add a Roster Moves tab for each reality, including the current unfinished year. Default to newest first, with reversible order. Dates mean simulation year and window only. Support year, window, team, region, role, movement type/status and player-name filters. Reuse region, team and lane icons, with explicit Main roster, Academy, Free Agent, Rookie and Retired badges. Paginate large histories and preserve reality isolation.

## Data contract

Archive optional market news with frozen team identities alongside existing transfers, adding stable player IDs to transfer snapshots and the known franchise year to new archives. Preserve origin metadata. Capture offseason lifecycle news in the closing archive before discarding its season body. Legacy archives remain valid; never manufacture missing movements or real-world dates. Report incomplete coverage clearly.

Normalize archive and live records into display rows, retaining both directions of swaps, unknown endpoints where the old event did not record them, and deterministic ordering within a window. Deduplicate carried explicit-origin rows against archives without discarding repeated occurrences. No new SQLite schema or storage version is needed.

## Tasks

1. Extend lib/season/history.ts, rollover archive assembly in franchise.ts and importValidation.ts. Verify export/import and lifecycle preservation.
2. Add lib/season/marketHistory.ts for normalization, chronology, deduplication and filtering, with behavior tests.
3. Add components/hall/MarketHistoryPanel.tsx and integrate it in SeasonHistoryView.tsx. Load inactive season/history read-only with loading/error/retry handling, without activating the reality or authorizing empty writes.
4. Add UI regression coverage for filtering, sort order, icons, empty first-year Hall, source switching and pagination. Inspect desktop and narrow screenshots.
5. Update domain/interaction documentation and run types, lint, unit tests, production build and relevant browser E2E. No tag, release or commit is requested for this feature.

## Verification record

Implemented the Roster Moves tab, current-year and inactive-reality reads, archive fields, rollover capture, chronology, filters, icon/status presentation and 50-row pagination. The user selected newest-first order and simulation year/window only.

Validation: full lint, typecheck, 1,343 unit tests and production build passed. Nine new domain regressions cover frozen identities, import validation, chronological ordering, repeated events, filters, legacy carry and actual store persistence of a generated retirement. All 38 browser E2E cases passed, including four new Hall cases for filters, source isolation, pagination and recoverable reads. Desktop-width and 480px screenshots were inspected; the player search field was expanded to the full narrow row in the refinement pass.

Changes are local; no version bump, commit, push or release was requested. Tests use disposable fixtures. Native installer validation was not rerun for this frontend/domain feature; existing SQLite APIs and the physical format remain unchanged.

Important implementation detail: startNextSeasonWithArchive returns the final market archive to the store, avoiding loss of lifecycle news generated during rollover. Competitive results still derive from the original closing season, while market events include the closing operations. Older unrecorded news remains unavailable and is labelled as incomplete coverage.


## Follow-up refinements (2026-09-21)

Implemented post-Winter/Spring/Summer labels with permanent filter options; compact movement rows; shared player-name cards (including replaced IDs); archived-year links to Timeline; uniform Hall dropdowns for single-value filters and sort order; team logos in options and selected values; multi-select icon buttons for regions and roles (OR within a group, AND between groups).

Added immutable main-roster before/after snapshots at market updates and individual swaps, preserved in annual archives and import/export. Team hover cards default to After and allow Before without navigating away. Legacy events explicitly show that no roster was recorded. Automatic lifecycle batches share the pre/post roster of their committed update, as documented in domain contracts.

Validation: 1,350 unit tests, all 40 browser E2E tests, lint, TypeScript and static build passed. Six Hall E2E cases cover selectors, source isolation, paging, failed reads, Timeline links, Escape, snapshot toggles and player cards. Final spacing refinement was rebuilt and the six Hall cases rerun successfully. Desktop-width and 480px layouts were visually inspected. Desktop-only card UI was exercised in a browser fixture; native WebView/installer testing is not claimed for these Hall refinements. No personal save data was changed.

The final user preference replaces region/role dropdowns with multi-select buttons. Added domain coverage for combining groups and UI coverage for toggling two roles, deselecting and restoring All.

Role labels use Top, Jungle, Mid, Bot and Support. The visual review corrected the snapshot card to use the standard opaque player-card-body surface.


## Multi-year, academy and retirement follow-up

The user reproduced the year selector issue in a new reality without restarting desktop:dev. Added a five-rollover regression with a real disposable in-memory SQLite database and a save/load after every year. All five years and their Winter/MSI window filters survive. This does not inspect the user's database or prove which stale dev action ran; restarting the process is required to exclude retained store closures.

Year options now include known archive metadata and the current franchise year, including years with no market rows. Added academy before/after snapshots, import validation and UI coverage. Team icons resolve bundled logos by name, tested with T1 and no explicit logo URL. Retirements now retain the prior committed Academy/Free Agent state, age and optional observed year-end counts for the continuous inactive spell; legacy unknowns remain unknown.

Validation: 1,355 unit tests in 111 files, typecheck, lint and static build passed. All six Hall browser E2E cases passed using Edge, including real team logos and both academy snapshots. Inspected the rendered roster card. These browser tests enable the desktop card branch with a fixture and do not claim native WebView validation. No personal AppData was read or modified. No release or commit was made.


## Shared Hall history regression

Confirmed the report that only Roster Moves displayed data for dormant realities. The market child privately loaded SQLite history, while the other Hall tabs consumed an unloaded in-memory placeholder. `SeasonHistoryView` now owns a shared load via `loadHallRealityHistory`, installing the complete archive without switching active reality or fetching the dormant season body. The loader drains pending writes before and after reading, rejects cancelled/replaced targets, and marks history loaded only when installing it. Errors retain saved data and offer a shared Retry action; loading is not shown as an empty archive.

Focused validation: 38 loader/SQLite/queue unit tests passed, as did typecheck, lint and the static build. A browser regression mocks native reads after hydration and checks the dormant archive across Timeline, Records, Search, Best Rosters and Roster Moves, including navigation back to its year. This is UI verification with disposable fixtures, not a native WebView or personal-save check.

Browser validation: 40 of 41 cases passed in the full suite. The remaining Title Playground fixture enabled Desktop cards with an empty native bridge; it was updated to return separate histories for each selected reality, and its focused rerun passed (9.4 seconds). All 41 browser scenarios have now passed. No native WebView claim is made.


## Missing five-year archive and Hall load cost

A reported reality reached year 6 but its Hall displayed the empty-archive message. Authorized read-only metadata queries (`mode=ro`, `query_only`) confirmed zero annual entries in the current database and available snapshots, with no misplaced entries in other realities or the global archive. The current season remained present. No personal database was modified or restored; absent historical results were not fabricated.

Reproduced a dev failure path: a module-local loaded-history flag can be absent while retained store actions still produce complete nonempty histories. Such histories must be persisted, and the Hall must not replace them with empty/older DB contents. Added regression coverage for both, including five actual rollovers with real SQLite save/load boundaries and cleared load flags between saves. Empty lazy placeholders remain unable to delete stored archives.

Performance changes: simultaneous Hall requests share one read/drain sequence; a history freshly read from SQLite is registered as already synchronized when installed, avoiding redundant full-history encoding/upserts. Regression verifies zero write statements on that install and confirms subsequent edits still persist. The empty state now distinguishes a reality with a current season but no annual archive from one-off Season Mode instructions. No end-to-end native timing claim is made.

Validation so far: 1,364 unit tests in 112 files, TypeScript and lint passed. An older serialization assertion was made JSON-aware because generated chemistry can contain negative zero; the encoded record still has to match in full. Dev was not reachable and no Desktop/Next dev process was running when production build verification was started.

Final verification for this follow-up: static build passed and all eight targeted Hall/Title Playground browser E2E tests passed (18.1 seconds). No native WebView latency was measured and no Rust change was needed.


## Records performance and final market presentation follow-up

Implemented bounded rendering via RecordRows (20 rows per long classification, full rankings retained), centered the team label in live player-search suggestions, removed Preseason from selectable windows and agency-override retention from movement rows, added historical tier filtering/badges, and added frozen-roster average tier/stars to Before/After cards. Main/academy swaps record the demoted destination explicitly; normalization also accepts snapshot evidence and avoids duplicates or invented vacancy demotions.

Performance fixture: 100 seasons, 20,000 annual career lines, 5,000 distinct players. Baseline exhausted its 120-second browser timeout; optimized opening measured 665 ms with 204 rendered record rows. This measures a synthetic browser fixture, not the user's native WebView. The test enforces bounded DOM work and lower-rank access, not timing.

Unit verification: all 1,366 tests in 112 files passed. Static build passed. Browser coverage includes paired demotion/tier filters, removed options, changing historical strength with Before/After, and measured vertical logo alignment in live suggestions.

Final validation: all 43 browser E2E tests passed, with the Records fixture repeating at 681 ms / 204 rows. TypeScript, lint and production build passed. The rendered Before/After card with average tier, stars and academy was visually inspected. No personal saves were modified and no release or commit was requested.

Presentation follow-up: Records pagination now uses compact bordered controls with chevrons and accessible disabled/focus states; market roster cards show graphical filled/dimmed stars. Production build and all nine focused browser tests passed; both rendered controls were visually inspected. Fractional strength was assessed and documented as a separate coordinated simulation change, not implemented by this visual adjustment.

## Release integration

The later release request authorizes packaging this work in v0.8.0, together with the completed half-star implementation. Earlier local-only and integer-strength notes above describe intermediate checkpoints. Current behavior and release scope are summarized in [v0.8.0 notes](../releases/v0.8.0.md).
