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
6. **Verification and delivery.** Run focused tests, types, lint and the full unit suite. Build the desktop package with `npm run desktop:build -- --ci` (its prebuild creates the static export). Run Playwright against that export for live updates, filters, error/empty states, responsiveness and replay role gaps. Save screenshots under `docs/screenshots/roster-outlook/`. Inspect screenshots and refine visible defects. Report browser/native limits and actual installer paths. Commit scoped work with conventional commit messages and no coauthor trailers; preserve existing screenshots and `training/`.

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

### Review screenshots

All images are in `docs/screenshots/roster-outlook/`. Panel crops omit the dashboard's fixed menu/save controls so those controls do not obscure the section.

1. [Main roster and demotion evidence](../screenshots/roster-outlook/01-main-roster-and-role-gap.png)
2. [Academy probabilities and destinations](../screenshots/roster-outlook/02-academy.png)
3. [Free agents](../screenshots/roster-outlook/03-free-agents.png)
4. [Region/team/role filters at minimum desktop width](../screenshots/roster-outlook/04-filtered-minimum-desktop.png)
5. [Current window and pending user choice](../screenshots/roster-outlook/05-current-window-user-choice.png)
6. [Automatic refresh after proceeding, with search retained](../screenshots/roster-outlook/06-updated-next-window.png)
7. [Offseason outlook](../screenshots/roster-outlook/07-offseason.png)
8. [Series and first-game role gap](../screenshots/roster-outlook/08-role-gap-series.png)
9. [Second-game role gaps after swapping sides](../screenshots/roster-outlook/09-role-gap-swapped-sides.png)

Visually inspected academy, offseason, filtered minimum-width and updated-window panels, plus the swapped-side replay. The thresholds remain 2.0 for replay labels and 0.9 / five rated underperformance checkpoints for demotions; fixes concern rounding, attribution and unknown-data handling, not a rebalance.
