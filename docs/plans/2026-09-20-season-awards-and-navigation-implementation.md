# Season awards, recaps, roster moves, and navigation implementation plan

Date: 2026-09-20. Status: implemented; verification results and remaining runtime limitation are recorded below.

## Scope and verified starting point

Implement all nine requested fixes using the current UI and bundled assets. No new dependencies or visual redesign are needed.

- `lib/season/stats.ts::computeSeasonRookiesOfYear` considers debut-year roster members without requiring a career record or rated games. Missing ratings become zero. `lib/season/rookieOfYear.test.ts` currently expects an award from a fixture with no tournaments.
- All-Pro has three intentional scopes in `lib/season/allPro.ts`: `split-league`, `split-global`, and `season-global`. However, the separate `allPro` career field counts every tournament's selection, including internationals; `allProSplit` counts domestic league selections and `allProSeason` counts Team of the Year. Global split selections currently have no corresponding career counter. Thus the three current profile chips are overlapping/incomplete, not three clean award categories.
- `components/tournament/replay/MatchReplayModal.tsx` renders `(B)`/`(R)` on game tabs and already resolves per-game teams elsewhere in the component.
- Offseason protections already exist: event-stamped transfer grouping, `worldsOffseasonBaseline`, and copying only newly generated roster news during year advancement. Tests already cover several carryover cases. The reported remaining path is not yet reproduced; do not assume the existing safeguards are missing.
- Timeline champions follow `LEAGUE_IDS`; split MVPs alphabetically sort league IDs. Region Strength currently renders text without `LeagueIcon`.
- `components/SeasonDashboard.tsx::StageStatsRow` already accepts icons through `StageStatCell`, but supplies only a team logo for MVP, no champion portraits, and includes Longest Series.
- `components/season/BulkYearsControl.tsx` has no collapsed state. Escape listeners exist in many independent modals/popovers, but there is no consistent app-wide dismissal/back contract.
- Tooling: Vitest, Playwright, ESLint, TypeScript, and static Next.js build. Playwright serves `out/` through `scripts/serve-static.mjs`; rebuild before browser verification.
- Initial working tree contains untracked `training/`; leave it untouched. No repository `AGENTS.md` was found by the file search.

## Behavior decisions

1. Rookie eligibility requires debut in the current franchise year, actual games played, and at least one valid rated game. Do not add an arbitrary larger minimum. Preserve existing ranking and one-winner-per-role behavior among eligible players; leave a role empty when nobody qualifies.
2. Keep the existing three All-Pro scopes, labeled consistently everywhere:
   - **Domestic Split All-Pro**: one selection per role for each league and split.
   - **Global Split All-Pro**: one selection per role across leagues for each split.
   - **All-Pro Team of the Year**: one selection per role across the whole season.
   Remove the unexplained standalone All-Pro chip. Any aggregate used in comparisons or records must say **Total All-Pro Selections** and use the same documented sum of these scopes.
3. International tournaments grant no event-specific All-Pro selection. Their games remain eligible inputs to Team of the Year, preserving the current season-wide rating definition. International MVPs and other awards remain supported.
4. Offseason sections show events that occurred during that offseason, not all changes involving the current roster. Earlier moves remain available under their original season/window.
5. Bulk Simulation keeps a visible expandable heading and starts collapsed. Running/paused job status and stop/resume access remain discoverable.
6. Escape dismisses one topmost interaction or performs the visible Back/Return action. At the root it does nothing. It does not close the OS window/browser tab, cancel simulations implicitly, or bypass existing unsaved-change/operation guards.

## Ordered implementation tasks

### 1. Fix rookie eligibility and invalid archived displays

Files: `lib/season/stats.ts`, `lib/season/rookieOfYear.test.ts`, `lib/season/history.ts`, `lib/season/history.test.ts`, `components/SeasonHistoryView.tsx`.

- Reject candidates before scoring when their current-season record has no games, no rated sample, or a non-finite rating average. Use actual participation, not roster membership or title credit, as eligibility evidence.
- Update the existing positive test with real rated recap data. Add regressions for an unused rookie on a title-winning roster, no eligible rookie in a role, missing/unrated records, a veteran with a higher score, and a qualifying rookie with games.
- Ensure both live awards and newly archived timeline awards use the corrected calculation.
- Filter demonstrably invalid historical rookie rows with zero games/non-finite ratings at the history presentation boundary. Do not invent a replacement winner from an archive that lacks game data. Missing legacy evidence is not proof of zero participation; show an unavailable rating rather than manufacturing `0.0` where appropriate.

Done when an unused rookie cannot win, an eligible rookie still can, and known zero-game legacy rows no longer appear as timeline winners.

### 2. Unify All-Pro scopes, counts, and compatibility

Core files: `lib/season/allPro.ts`, `lib/season/stats.ts`, `lib/season/history.ts`, `lib/season/historyRecords.ts`, `lib/season/historySearch.ts`, `lib/importValidation.ts`.

Presentation files: `components/SeasonDashboard.tsx`, `components/SeasonHistoryView.tsx`, `components/tournament/recap/AwardsPanel.tsx`, `components/tournament/recap/PostTournamentRecap.tsx`, `components/hall/ComparePanel.tsx`, `components/player/PlayerCardContext.tsx`, and consumers of its award fields.

- Centralize scope labels and per-player scoped counts in `allPro.ts`. Keep domestic/global/year counters distinct; add an optional global-split counter to archived player records if needed. Avoid creating a dependency cycle: `allPro.ts` currently depends on `stats.ts`, so enrich records at the history boundary or extract a small neutral helper instead of importing it back into `stats.ts`.
- Use phase kind/tournament membership to exclude international All-Pro from career and team-position tallies. Do not merely hide the UI while continuing to count the award.
- Give live stats and tournament recap award panels explicit scope/context. Hide the All-Pro strip for international events in every entry point, including direct tournament recap navigation. Generic standalone tournaments can retain their existing generic awards unless classified as an international season event.
- Render Domestic Split, Global Split, and Team of the Year counts in Search profiles and per-season history. Apply the same labels/semantics to timeline teams, live strips, comparisons, records, and hover data. Any retained aggregate must have an explicit total label; earning a domestic and global selection is two separately labeled honors.
- Keep persisted `allPro` data readable as a legacy field rather than silently reinterpreting it. Prefer deriving corrected scoped counts from archived `allProTeams` using stable player IDs. Preserve existing known domestic/year fields when detailed teams are absent. Do not infer award scope by player name alone or assume an absent optional counter means a verified zero.
- For older archives with only an inseparable per-tournament total, show an explicit legacy/unavailable value instead of presenting it as a corrected modern total. Exclude unresolvable values from modern scoped leaderboards. Do not pretend international counts can always be subtracted from old aggregate-only data.
- Prefer read-time normalization and additive optional fields; do not rewrite whole saved realities on load. Ensure import/export validation accepts old and new shapes. New archives should contain enough scope data to reproduce profile totals.

Tests: extend `lib/season/allPro.test.ts`, `lib/season/history.test.ts`, `lib/season/historyRecords.test.ts`, `lib/season/historySearch.test.ts`, and `lib/importValidation.test.ts` as relevant. Cover one player earning domestic/global/year honors, international events granting none, annual ratings retaining international games, profile/leaderboard agreement, transfers with stable IDs, and legacy records with/without detailed selections.

Done when award names and counts agree across all surfaces, new internationals contribute no event All-Pro selections, and old saves remain loadable without fabricated counts.

### 3. Reproduce and fix offseason event attribution

Files: `lib/season/franchise.ts`, `lib/season/playerLifecycle.ts`, `lib/season/transfers.ts`, `lib/season/simResultsSummary.ts`, `components/TransferWindowPanel.tsx`, `components/season/SimResultsFeedPanel.tsx`; archive handling in `lib/season/history.ts` if implicated.

- Start with an end-to-end fixture containing a Winter rookie entry, a midseason transfer, a genuine offseason replacement, and a previous-year offseason carry. Follow it through season completion, next-year advancement, and a second rollover.
- Inspect both user-facing roster-move surfaces: transfer-window digest and simulation feed. Check event creation stamps, grouping/filter defaults at season completion, source-array carryover, feed cache/emission keys, and whether the displayed season/window matches the event's origin.
- Preserve original `timeMark`/transfer `event`; never re-stamp old news according to the currently displayed phase. Use existing baseline/provenance helpers and fix the reproduced path at its owner.
- If a summary is explicitly labeled Offseason, derive its rows and count from that exact window. Keep season-wide browsing available under an accurately labeled all-windows view.
- Distinguish prior-year carry from current-year offseason events, including the zero-baseline case. Do not deduplicate by player alone: the same player can legitimately move twice.
- Preserve missing legacy timing as Unknown instead of asserting it occurred in offseason. Add new persisted provenance only if existing stamps cannot distinguish the reproduced case; keep any addition optional and import-compatible.

Tests: extend `lib/season/franchise.test.ts`, `lib/season/transfers.test.ts`, `lib/season/simResultsSummary.test.ts`, and archive tests if affected. Cover manual and bulk year advancement, mixed legacy buckets, repeated players in different windows, and save/reload continuity.

Done when Winter moves remain in Winter, genuine offseason moves appear once in the appropriate offseason summary, and a second rollover does not reintroduce old moves. If fixtures pass, trace a failing serialized input before making speculative lifecycle changes; the reported cause remains unconfirmed until reproduced.

### 4. Show the game winner's team logo in recap tabs

File: `components/tournament/replay/MatchReplayModal.tsx`.

- Replace `(B)`/`(R)` with the winner's team logo next to `Game N`, retaining current scores and active-tab styling.
- Resolve each tab independently from that game's winner and its own blue/red team identity. Reuse `resolveReplayTeam`; do not use the currently active game's resolved teams or assume match-level sides remain fixed throughout the series.
- Reuse the existing team-logo rendering/fallback with non-interactive markup inside the tab button. Include the winner's name in the accessible label/tooltip. Unknown winners show no invented winner logo.

Done when a series with side swaps displays the correct winner on every tab, including inactive tabs and teams with generated icons rather than downloaded logos.

### 5. Align timeline region ordering and add region logos

File: `components/SeasonHistoryView.tsx`; reuse `components/LeagueIcon.tsx` and `lib/season/types.ts::LEAGUE_IDS`.

- Render split MVP regions in the same `LEAGUE_IDS` order as split champions, retaining chronological split order. Omit missing entries without changing the relative region ordering or mutating archived arrays.
- Add `LeagueIcon` beside each Region Strength league label. Retain labels, ranking, numeric values, and existing missing-asset fallback.

Done when both timeline panels use the same region order, and Region Strength uses bundled logos while remaining readable if an image is unavailable. Verify visually with complete and partial split data; no new unit tests needed for icon markup alone.

### 6. Update live stage statistics

File: `components/SeasonDashboard.tsx::StageStatsRow`.

- Add `LaneIcon` for the MVP alongside the existing team logo/name.
- Supply portraits from the resolved `Champion.iconUrl` for Most Contested and Best Win Rate, following the existing portrait pattern in `components/tournament/recap/PostTournamentRecap.tsx`. Keep champion names and provide a clean missing-image fallback.
- Remove the Longest Series cell from live split/international statistics and adjust the desktop grid to three award cells. Keep existing statistical calculations and the standalone recap summary unless it shares the affected live component.
- Apply task 2's international All-Pro visibility rules in this same component.

Done when split and international live statistics show role/champion icons, have no Longest Series cell, and lay out cleanly when some awards are unavailable.

### 7. Collapse Bulk Simulation by default

File: `components/season/BulkYearsControl.tsx`.

- Add local expansion state initialized to false and a heading disclosure button with `aria-expanded`/`aria-controls`. Collapsed configuration controls must not remain keyboard-focusable.
- Preserve inputs and options when toggling. Keep callbacks/job state mounted so collapsing cannot stop or restart a simulation.
- Show a compact running/paused indicator in the header. Automatically reveal active/resumable job controls when appropriate so progress, cancellation, errors, and resume are accessible; idle initial state remains collapsed.
- Keep the confirmation modal outside the collapsible body and retain the results link.

Done when a fresh idle view starts collapsed, keyboard activation expands it, entered options survive toggling, and running/resumable jobs remain controllable.

### 8. Establish consistent Escape handling

Proposed new files: `lib/escapeNavigation.ts` and `lib/useEscapeLayer.ts` (or an equivalent small shared registration implementation).

Integration owners: `components/DraftApp.tsx`, `components/Modal.tsx`, `components/SeasonHistoryView.tsx`, `components/SeasonDashboard.tsx`, `components/tournament/replay/MatchReplayModal.tsx`, and existing custom Escape handlers discovered in the source audit (detail/editor overlays, player/team/coach hover cards, popovers, pickers, and library views).

- Inventory visible Close/Back/Return controls and reuse their existing callbacks and guards. Register only active surfaces. Distinguish popup/modal layers from page-level navigation, with the most recently opened top layer taking precedence.
- Use a single coordinated dispatcher or explicit consumed-event protocol. Replace conflicting listeners in participating surfaces; adding another global listener alone can close both child and parent on one press.
- Escape priority: open picker/popover, top modal/detail window, then current view's Back/Return action. A search profile returns to its parent search/list before exiting the Hall. Do not use blind browser `history.back()` for local UI state.
- Restore focus after dismissal. Honor composition/repeated-key handling and prevent one held key from unwinding the entire stack.
- Preserve blocked dismissal during active confirmation/save operations and `components/AppDesktopOperationOverlay.tsx`. A blocked top layer must consume Escape rather than allow a lower page to navigate away.
- Clean up registrations on unmount; callbacks must remain current after re-render.

Tests: proposed `lib/escapeNavigation.test.ts` for one-action dispatch, priority, unregistering, and blocking; proposed `e2e/season-ui-navigation.spec.ts` for nested popup/modal dismissal, focus restoration, profile return, page return, and protected operations.

Done when one Escape performs exactly one appropriate close/back action throughout the app, without losing unsaved data or closing the native application.

## Verification and delivery

1. Run relevant existing tests before changing behavior, then run the targeted regression suites for tasks 1–3 and 8. The current rookie positive fixture must change intentionally because it codifies the bug.
2. After implementation: `npm run typecheck`, `npm run lint`, and `npm test`.
3. Build current assets with `npm run build`, then run `npm run test:e2e`. Browser prerequisites: installed Playwright Chromium or a supported `PLAYWRIGHT_CHANNEL`; use existing fixture patterns rather than personal save data.
4. Add focused browser coverage for side-swapped winner logos, bulk disclosure/state preservation, and nested Escape behavior. Visually check region order/logos and live statistics with domestic/international fixtures, missing assets, and narrow desktop widths. Avoid tests that merely assert CSS or source wording.
5. Verify a disposable older exported history and a newly generated history through import, profile/timeline display, export, and reload. Check corrected scoped totals and explicit unknown legacy values. If persisted fields change, extend existing import/history round-trip tests; no SQLite schema migration is expected.
6. Smoke-test Escape in the Tauri desktop build/runtime as well as Chromium, especially protected operation overlays. Web Playwright alone does not verify native WebView behavior.

Implement data fixes first (1–3), then UI changes (4–7), then coordinated navigation (8), followed by integration verification. Tasks 4–7 are otherwise independent, except live All-Pro presentation depends on task 2.

Use disposable fixtures for save-related verification. Preserve original history fields and user data; do not silently bulk-repair saved realities. If an unavoidable persisted migration is discovered, document its backup/transaction/rollback path before introducing it.

## Implementation results

All nine requested changes are implemented, along with the project-root `AGENTS.md`.

- Rookie awards require recorded, rated participation; known invalid archived zero-game winners are hidden.
- Domestic split, global split, and annual All-Pro honors now have separate labels and counts. International events grant no event All-Pro; their games remain eligible for annual selections. Legacy unknown totals are explicitly marked and excluded from corrected total rankings.
- Offseason news has an optional completion boundary, including zero, to distinguish prior-year carry from current offseason events. Window-aware merging and rollover filtering prevent old news from reappearing. Legacy records without enough provenance cannot have their exact timing reconstructed; existing marks remain readable.
- Recap tabs use each game's winner logo, including side swaps. Region Strength uses region logos; timeline MVPs follow the champions' region order.
- Live domestic and international statistics display MVP role and champion icons, with the Longest Series cell removed.
- Bulk Simulation starts collapsed, retains entered values, and exposes active/resumable jobs.
- A shared Escape dispatcher closes one active surface at a time, reuses existing navigation callbacks, restores focus, and respects operation guards.
- Spreadsheet round-trip regression coverage exposed archived career/All-Pro fields being discarded on import. Those optional fields are now retained through existing validators. No SQLite schema migration or rewrite of personal saves was introduced.

## Release verification follow-up (v0.6.0)

The release audit adds real installed-WebView navigation checks on the disposable Windows CI runner: root Escape, modal dismissal, held keys, nested native dialogs, focus restoration, and season exit followed by a SQLite read confirming the commit. The check runs on first install, reopen, and reinstall. Publication is gated on these checks.

The Escape save regression is covered with three realities and 300 archived years: exiting uses one transaction and does not rewrite dormant realities or unchanged histories. Save-button confirmation now waits for durable persistence; unchanged global snapshots are not rewritten.

Additional offseason coverage includes mixed previous-year/Winter/current news, save/reload, repeated rollover, mis-bucketed transfers, zero boundaries, Worlds and Global Cup completion, and legacy completed saves. Existing legacy rows without a reliable boundary remain stored but are not asserted to belong to the current offseason. New moves after initialization have a reliable boundary. Prior-year Worlds transfers are hidden in the current offseason and are not carried forward again.

Local checks include full unit tests, native Rust tests, lint, TypeScript, production build, browser regressions, dependency audit, and release version validation. GitHub CI performs native installer/WebView checks before the release tag is created. The pre-existing `training/` directory is excluded from the release commit. `SIMULATION-IDEAS.md` is removed at the user's request.
