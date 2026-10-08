# Live roster outlook and role-gap audit

## Agreed behavior

Add a global, filterable **Roster outlook** section to the live season dashboard, available during splits, internationals, transfer windows and the offseason. Cover main rosters, academies and free agents. Reuse lane icons, team logos and region logos; retain Inter and the existing visual language. UI text stays in English.

Forecast the **next roster decision window**, using current results, rosters and meta. When a window is already open, forecast its remaining automatic decisions. Split checkpoints count as roster windows; Worlds and Global Cup do not create extra transfer windows. Explain the actual horizon on screen.

Estimate mutually exclusive final destinations by sampling the existing market/lifecycle rules with a private seeded RNG: same seat, another team, own academy, own main roster, free agency, signed main roster, signed academy, retirement where applicable. Do not interpret a per-rule chance as a final movement probability. Percentages describe a current-data scenario, not a prediction of future match results or manual choices. Pending user decisions remain explicit and are not randomly accepted.

Recalculate after season changes while the section is open; never mutate the save or consume the live simulation RNG. Do not persist forecasts. Handle loading, unavailable data, failure/retry, disabled market rules and empty filters. Region order follows `LEAGUE_IDS`; identity uses stable IDs.

## Implementation

1. **Audit and share roster evaluations.** Inspect `lib/season/franchise.ts`, `playerLifecycle.ts`, `franchiseAgency.ts`, `transfers.ts` and `stats.ts`. Extract the existing offseason player-market transition for use by the live engine and forecast without constructing a new season/archive. Share current-player grades across team changes and scopes; an empty split scope must not accidentally include the whole season. Preserve lifecycle rules and save boundaries.
2. **Forecast domain model.** Add `lib/season/rosterOutlook.ts` and behavior tests. Resolve the next applicable checkpoint from config, phase and deferred demotions. Reuse live transfer, agency, split and offseason functions. Sample independent seeded scenarios and classify final locations by player ID. Include explanatory grade/role-gap/streak evidence and pending manual decisions. Test determinism, nonmutation, probability totals, scope boundaries, active windows, disabled rules, academy/FA movement and controlled teams.
3. **Background calculation.** Add a dedicated worker using the existing esbuild worker pipeline in `scripts/build-bulk-sim-worker.mjs`. Calculate only while visible. Terminate obsolete requests and workers; hide stale percentages immediately. Keep rendering/filtering independent of simulation work.
4. **Interface.** Add `components/season/RosterOutlookPanel.tsx` and mount it in `components/SeasonDashboard.tsx`. Provide search, status, role, region and team filters, sorting, pagination and expandable explanations. Reuse existing player/team links and artwork. Do not add persistence, dependencies or versions.
5. **Role-gap correctness.** Review `lib/roleGap.ts` and replay summaries in `components/tournament/replay/MatchReplayModal.tsx`, plus role-relative demotions in `playerLifecycle.ts`. Check threshold boundaries, unknown/nonfinite ratings, game side swaps, recorded player identity and title/streak rules. Add regression tests for confirmed defects; document unchanged balancing constants.
6. **Verification and delivery.** Run focused tests, types, lint and the full unit suite. Build the desktop package with `npm run desktop:build -- --ci` (its prebuild creates the static export). Run Playwright against that export for live updates, filters, error/empty states, responsiveness and replay role gaps. Save screenshots under the ignored `test-results/playwright/roster-outlook/` directory. Inspect screenshots and refine visible defects. Report browser/native limits and actual installer paths. Commit scoped work with conventional commit messages and no coauthor trailers; preserve unrelated `training/` data.

## Acceptance examples

- A main-roster player at risk of an automatic demotion shows the next checkpoint, estimated academy/FA/other-team destinations, and the current same-role performance gap.
- An academy player and FA can be searched even before they have played. Missing performance is shown as unknown; academy estimates use the engine's existing shadow grade rules.
- Advancing into an international or an already-open transfer window changes the horizon without rerunning market actions already completed in the live save.
- Opening, closing and filtering the panel does not change any season data or live random outcome.
- Replay role-gap labels remain attached to the correct game-side player when sides swap.

## Validation results

- `npm run typecheck`: passed, including the final production build's TypeScript check.
- `npm run lint`: passed.
- `npm test -- --maxWorkers=2`: **131 files / 1,505 tests passed**. The initial unrestricted run hit the existing 5-second limit in two Excel workbook tests; both passed in isolation and the complete suite passed with two workers. No test timeouts or dependencies were changed.
- Focused regression coverage includes frozen-input/nonmutation checks and a throwing live RNG for split, transfer and offseason forecasts; deterministic samples; real academy promotion and competing FA bids; roster updates; role thresholds; side swaps; transfer identity; unknown grades and empty scopes.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e -- e2e/roster-outlook.spec.ts e2e/verify-fixes.spec.ts --grep 'outlook|transfer window updates|offseason probabilities|match replay shows'`: **4 passed** against the final static export. Verified filters, artwork, all three roster categories, live Proceed/recalculation with filters retained, worker failure/retry, unchanged saved rosters after inspection, 1024px desktop width and replay role-gap attribution. Used installed Edge because this Playwright version's Chromium binary was absent.
- `npm run desktop:build -- --ci`: **passed**, including the final frontend/static export, Windows executable and both NSIS/MSI installers. Version remains **1.4.9**. Artifacts: `src-tauri/target/release/app.exe`, `src-tauri/target/release/bundle/nsis/DraftSim_1.4.9_x64-setup.exe`, `src-tauri/target/release/bundle/msi/DraftSim_1.4.9_x64_en-US.msi`.
- No native installation or interactive WebView session was performed. Browser tests used disposable localStorage fixtures; personal AppData was not accessed.

### Visual verification

Historical review captures were removed during repository cleanup. Current outlook tests write reproducible captures to the ignored `test-results/playwright/roster-outlook/` directory; replay checks use `test-results/verify-fixes/`.

Visually inspected academy, offseason, filtered minimum-width and updated-window panels, plus the swapped-side replay. The thresholds remain 2.0 for replay labels and 0.9 / five rated underperformance checkpoints for demotions; fixes concern rounding, attribution and unknown-data handling, not a rebalance.

## Post-implementation review and v1.5.0

The review reproduced and fixed three domain regressions: legacy grades could be assigned to a replacement despite a different recorded name; obsolete transfer proposals and requests could be counted as pending user decisions; and a disabled roster market still required champion data and sampled misleading 100% retention. Regression tests failed before these fixes and pass afterward.

Filter controls now stay mounted during refresh, errors and retry, preserving search and keyboard focus while stale probabilities remain hidden. Explanations name their performance period, show every sampled destination with region identity, and are computed inside the worker. The UI imports a lightweight view model instead of the simulation engine. Zero probabilities retain readable contrast; the table and destination list support keyboard scrolling.

Release validation:

- Full unit suite: **131 files / 1,508 tests passed** with two workers. Focused outlook and role-gap tests also passed after the final eligibility guard.
- Full browser suite: **107 passed** using installed Edge and disposable browser saves. The final static export additionally passed **5 focused browser tests** covering outlook, worker recovery, disabled movement and replay role gaps.
- Full lint and TypeScript passed; changed-file lint and the final production TypeScript build passed again after the last edits.
- Release/version tests: **14 passed**. Package, npm lock, Tauri and Cargo metadata agree on **1.5.0** and validate against `v1.5.0`.
- Production dependency audit is clean after updating only sharp and its platform binaries to **0.35.5**, which fixes [the upstream librsvg advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). The repository's existing development-only exceptions remain unchanged. Reinstalled with `npm ci` and rebuilt successfully.
- Native Rust suite: **12 passed**. Final `npm run desktop:build -- --ci` passed and produced `src-tauri/target/release/app.exe`, `src-tauri/target/release/bundle/nsis/DraftSim_1.5.0_x64-setup.exe` and `src-tauri/target/release/bundle/msi/DraftSim_1.5.0_x64_en-US.msi`.
- Local UI validation used a browser, not an interactive native WebView. No personal AppData or installed saves were used. Installation smoke verification runs separately in the release workflow's disposable Windows runner.

Review captures covered filter preservation during refresh, worker failure/retry and disabled automatic movement. They were removed during repository cleanup and can be regenerated from the browser tests.

Inspected the academy destinations, error state and final 1024px filtered table visually. Unrelated `training/` data remains outside these commits.
