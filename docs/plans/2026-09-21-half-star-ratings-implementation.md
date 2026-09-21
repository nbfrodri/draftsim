# Half-star team ratings implementation

## Contract and acceptance
Team strength uses nine values from 1 to 5 in increments of 0.5. Round the roster mean to the nearest half, clamp to the existing limits, and retain neutral 3 for absent information. Player tiers remain discrete; coaches retain their separate decimal rating. A mixed A/S roster can now have 4.5 stars and must receive an intermediate simulation advantage.

## Implementation sequence
1. Add a pure normalization contract in `lib/teamStars.ts`. Apply it to `lib/players.ts` derivation, randomized tier generation and legacy roster reconstruction. Test all nine targets with seeded randomness and invalid inputs.
2. Use the same contract in `lib/tournament.ts` and replace the duplicate historical formula in `lib/season/historySearch.ts`. Audit series creation, side swaps, normal autoplay and bulk-worker orchestration. Keep continuous bias coefficients and upset thresholds; fractional inputs must reach them unchanged.
3. Audit consumers in season engine, power rankings, team generation, market attraction/transfers, coach generation and season stories. Existing arithmetic must retain fractional values. Record any intentionally separate rating scales.
4. Add shared `components/TeamStars.tsx` rendering and an accessible half-step picker. Replace whole-star glyph repetition in setup, roster editing, match cards and market snapshots. Update both season and tournament setup and random rating generation. Preserve numeric fractional labels elsewhere and discrete player-tier badges.
5. Verify integer and fractional JSON/import compatibility. No SQLite schema rewrite: ratings are numbers already. Preserve existing archived match outcomes and explicit in-progress series strengths. Histories with roster snapshots derive their display from those snapshots, never the current roster.
6. Run focused domain tests, full unit tests, typecheck, lint, static build and browser checks covering selection, fractional rendering and existing market/record interactions. Document actual outcomes, limitations and all audited consumers in `docs/technical-design.md` and `docs/systems.md`.

## Data preservation and rollout
No personal saves or backups are modified for testing. Existing integer ratings remain valid. New simulation results can change because roster-derived strength becomes more precise; previously completed results are not recomputed. Rollback means reverting the implementation, not rounding persisted historical values or restoring personal databases. Worker compilation must use the normal build script so bulk simulations use the same engine.

## Verification status
Completed all six implementation steps.

- `npm test`: 113 files, 1,374 tests passed. Coverage includes all nine generation targets with seeded randomness, half-step bias under every variance preset, final underdog threshold, side swaps, historical snapshots, share import and unchanged completed series.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed. The normal build regenerated the bulk worker.
- `PLAYWRIGHT_CHANNEL=msedge npx playwright test`: all 46 browser tests passed against the static production export. New tests exercise season and tournament keyboard selection, save/reload, bracket rendering and a real compiled worker completing a match with fractional roster strengths. The market snapshot regression verifies a 4.5-star After roster.
- Inspected the generated half-star screenshot: four full glyphs plus a half-filled fifth. Existing records, search-logo alignment, market filtering, recovery, Escape, offseason and live-stat regressions also pass.
- Verification used disposable fixtures. This iteration did not launch the native Tauri WebView; browser/worker checks are not native installer validation.

Implementation refinement: initial league targets now include halves while preserving each region's former total target strength. Existing continuous coefficients and final underdog thresholds are unchanged. The complete consumer audit is recorded in `docs/technical-design.md` under Half-star team strength.
