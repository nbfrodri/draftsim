# SS players, bottom-lane meta audit and season team cards

## Status and scope

Implemented on the plan branch. User decisions are recorded below; the final parameters and verification section supersede the original proposals. Native interactive WebView validation remains outside the checks performed here.

## Agreed behavior

- Add **SS**, a real player tier above S+, affecting gameplay, progression and market evaluations. Champion meta tiers remain D through S+.
- At most one SS player per position worldwide, hence at most five active holders. Reconsider holders at the end of each competitive phase, with a margin to prevent oscillation.
- Only players whose underlying development tier is S or S+ can qualify for SS. A B player with strong results must progress through the existing development system first; a high average alone cannot promote them directly to SS.
- Rank candidates by sustained individual performance in the current season, accounting for sample reliability, consistency and opponent strength. Titles are a tiebreaker, not the primary criterion. Require participation relative to the region's competitive calendar and recent activity; eight games alone are insufficient.
- SS persists across season boundaries, but is not irrevocable: a stronger challenger can replace its holder, who loses SS. Progression and decline continue to matter. The final exclusivity decision supersedes the earlier suggestion that permanent SS players could accumulate.
- In MSI's “Pre-Qualified to Playoffs”, display existing team logos.
- In Season Recap, “Winningest Team” and “Most Titles” use existing hover/focus team cards, not large permanently expanded cards.
- Investigate champion meta tiers in bottom lane throughout a season: the user observes most champions in D/low tiers and sometimes no S/S+. This concerns champions, not ADC player tiers.

## Evidence from current code

- `lib/types.ts` and `lib/players.ts` define player tiers, numeric strength, skill weights and champion-pool preferences. Multiple UI maps and import validators enumerate the six current tiers.
- `lib/season/teamGen.ts::assignRoleElites` selects up to five S+ players per role from S/S+ candidates using team stars, incumbent advantage and a stable name hash. It does not select on season performance. SS must coordinate with this existing assignment instead of being overwritten by it.
- `lib/season/allPro.ts` already selects annual global players by average rating, with at least eight rated games and games played as a tiebreaker. Reuse underlying participation/identity aggregation, but do not silently change All-Pro award rules to match SS.
- `lib/season/playerLifecycle.ts`, `franchise.ts`, `transfers.ts`, `playerAgency.ts`, `history.ts` and `stats.ts` own affected lifecycle, market and archive paths. Trace their actual callers before implementation.
- `lib/metaRandomizer.ts` allocates tiers proportionally within each eligible lane pool: baseline targets are 12% S+, 18% S, 30% A, 25% B, 11% C and 4% D, perturbed per run. Baseline C/D off-meta picks remain outside that allocation. This alone does not explain the reported seasonal drift.
- `lib/metaEvolution.ts` promotes/demotes individual champions using presence and shrunk win rate, with bounded emerging picks. Inspect patch-shift and season propagation callers too; no root cause is confirmed yet.
- `components/tournament/bracket/FormatViews.tsx` explicitly sets `showLogo={false}` in the pre-qualified list.
- `components/SeasonDashboard.tsx::SeasonRecapPanel` currently renders the two team statistics through `RecapChip` with names and icons. Existing `TeamNameLink`, `TeamLogoLink` and team-card providers supply reusable interactions.

## SS selection and lifecycle design

### Original design proposals

1. Use a pure selector over recorded player-season lines, keyed by stable player ID and position. Aggregate across transfers and count domestic and international games. Do not assign results to the current occupant of an old roster slot. Compare within each position, never raw cross-position ratings.
2. Review once after a competitive phase is fully complete and its results are recorded. Transfer windows and offseason navigation are not new performance samples. Run identically for manual play, bulk simulation and resumed saves; make repeated processing idempotent.
3. Require an underlying tier of S or S+, an absolute rated-game minimum and sufficient participation relative to the region's elapsed competitive calendar. Eight rated games is only a proposed absolute floor, not sufficient qualification. Define the relative threshold using comparable scheduled opportunities, not only the eliminated team's own short run; account for different formats, series lengths and transfers. Preserve vacancies rather than inventing participation. Fresh worlds start without SS until evidence exists.
4. Rank by an adjusted season-to-date individual performance score, not raw average alone. Reduce the influence of small samples, assess consistency across competitive checkpoints and account for opponent strength using pre-match evidence without circular dependence on the SS selection being computed. Calibrate the formula with seeded fixtures and document its components before implementation. Use actual participated titles only for exact score ties, then rated games and stable player ID for deterministic resolution. Reuse existing title participation contracts; no award for merely being on the latest roster.
5. A challenger must exceed the eligible incumbent by a calibrated margin. The earlier 0.15 rating-point proposal is provisional and must be revisited against the adjusted score's scale. Titles break a vacant-seat ranking tie but do not bypass incumbent protection. Eligibility gates apply before ranking and cannot be bypassed by a high score or a title.
6. Carry the holder into the next season during a bounded grace period while new evidence accumulates. Reset season performance samples, not holder identity. Define recent activity and grace periods in competitive opportunities, not wall-clock time; do not penalize a player solely because their region is idle during an international event. Early elimination alone is not automatic disqualification, but an old high average cannot preserve ownership indefinitely once participation or recency requirements fail. Recheck the incumbent's underlying S/S+ tier, participation and recent activity at competitive checkpoints; loss of eligibility vacates SS even without an eligible replacement. Vacate a retired holder; do not automatically promote a replacement without evidence. Track ownership across transfers, temporary inactivity and role changes, enforcing exclusivity on every relevant mutation.
7. Separate underlying development tier from the exclusive SS assignment in domain state. The effective gameplay tier becomes SS while held; development continues on the underlying tier. On replacement or loss, reveal the evolved underlying tier rather than forcing everyone to S+ or D. Centralize effective-tier resolution so simulation, drafting, UI, market and stars all agree. Audit whether an optional underlying-tier field or a season-owned assignment best fits existing consumers before choosing storage shape.
8. Coordinate with `assignRoleElites` using underlying tiers so S+ quotas and SS ownership cannot overwrite one another or compound boosts. SS is not random potential, a recruit roll or an extra automatic academy promotion step. Retirement/inactivity and phase completion must have one explicit ownership order.

### Eligibility acceptance examples

- A B player records an exceptional average over eight games and is eliminated early: ineligible for SS regardless of rank; normal development remains responsible for any later promotion to S.
- An S/S+ player has eight strong games but insufficient calendar-relative participation: ineligible until the participation requirements are satisfied.
- A qualified S player with sustained results can beat an S+ candidate; underlying S+ is not mandatory.
- A brief run against weak opposition must not win solely because its raw average exceeds a larger, consistent sample against strong opposition. Test the calibrated adjustment, not a hardcoded preference for the larger sample.
- An eliminated player may remain eligible temporarily if participation and recency still qualify; their frozen average does not grant indefinite ownership. An idle domestic calendar or lack of international qualification alone must not count as missed domestic participation.
- A holder whose underlying tier falls to A loses eligibility at review. A role with no eligible candidate remains vacant, and insufficient evidence is never replaced with invented results.

### Gameplay and market effects

- Add SS to the player-tier contract, ordering, labels, colors, filters, editors and all exhaustive lookup tables. Keep `MetaTier` unchanged.
- Calibrate a modest, measurable increase above S+ in the existing player skill/comfort and draft evaluation paths. Inventory each consumer before choosing numeric values; do not assume increasing one enum affects all simulation paths.
- Preserve team star rounding and the 1–5 ceiling. Keep underlying development and potential coherent, and ensure a lost SS assignment removes its advantage exactly once.
- Apply effective SS strength to existing market valuations and power rankings. Review cross-region restrictions that currently special-case S/S+; SS must not accidentally escape them. Avoid new market subsystems or special guaranteed transfers.
- Detect feedback loops where SS strength produces higher ratings that make ownership effectively permanent. Seeded long-run comparisons must assess turnover, win-rate effects, team concentration and role fairness, including incumbents in weaker teams.
- Show why a player holds SS, the last evaluated phase, relevant performance and the underlying-tier fallback. Display S+ and SS distinctly using existing typography and player-card patterns.

### Saves and historical integrity

- Inspect hydration, store mutation, write queues, import/export, restore and archive creation before changing contracts. Extend validators and normalization for SS only on player data.
- Prefer optional additive metadata for ownership, source season/phase, underlying tier and selection evidence as needed by the selected state model. Legacy saves retain their original tiers and do not acquire fabricated historical SS awards.
- Archive actual SS ownership/effective tiers without rewriting completed games or changing existing All-Pro counts. Preserve historical team region/name identity and stable player IDs.
- Validate duplicate holders, invalid lanes, non-finite evidence and malformed tiers at import boundaries. Define consistent reject/normalize behavior explicitly; do not silently discard valid save data.
- Exercise disposable SQLite and browser fixtures, transaction boundaries and round-trip exports. If a storage migration proves necessary, specify a recoverable original and rollback before implementation.

## Bottom-lane champion meta investigation

1. Reproduce distributions at creation and every phase/patch with fixed seeds and the bundled real champion catalogue. Record all five lanes, eligible picks versus preserved off-meta picks, promotions/demotions, presence, win rates and effective UI tiers.
2. Cover default/randomized/custom meta, live evolution and patch shifts independently and combined. Check actual lane attribution, swapped game sides, repeated checkpoint processing, stale snapshots and cumulative evidence reused across successive shifts.
3. Check whether a small viable pool concentrates pick/ban exposure and repeatedly demotes the same champions, while low-presence alternatives recover too slowly. Treat this as a hypothesis until measured.
4. First fix demonstrated attribution, accumulation or display defects. If balancing is still needed, prefer lane-aware exposure/recovery and bounded drift from a patch baseline. Keep custom edits intentional and preserve off-meta distinctions.
5. Do not guarantee S+ or S merely to fill rows: absence can be valid for absolute strength tiers. A sustained collapse of most normally viable ADCs into D is a balance smell, not a consequence justified solely by pool size. If relative per-role rankings are desired instead, present that as a separate product decision before changing tier meaning.
6. Acceptance: deterministic reproduction, meaningful diversity through multiple seasons, no systematic bottom-lane collapse under the agreed measurement, and no weakening of other roles to hide the issue. Select numerical distribution limits only after baseline measurement; record before/after results.

## UI implementation

1. MSI: enable the existing logo in the pre-qualified `TeamNameLink`; preserve names, seeds, provider context and hover/focus behavior. Check configured custom logos, missing-logo fallback, narrow layout and multiple international formats using this shared view. Qualification logic stays unchanged.
2. Recap: compose team name/logo links into the existing chips (allow a React node value only if necessary). Resolve live versus archived teams using the appropriate provider and historical context. Keep match records and title counts visible; handle the same team winning both stats and absent data.
3. Verify mouse, keyboard focus, profile navigation and topmost-only Escape dismissal. Use existing assets and Inter typography; no dependencies or artwork regeneration.

## Implementation sequence and verification

1. Deliver the two UI improvements independently with focused browser checks.
2. Measure and document champion-meta behavior, add a failing regression for any confirmed defect, then fix and compare seeded simulations. Keep unrelated dataset changes out of scope.
3. Finalize SS storage ownership and calibrate the relative participation threshold, recency/grace windows, sample adjustment, consistency/opponent weighting and replacement/strength parameters. Document the formula and its rationale; these numerical choices remain open. Implement pure selection with red/green tests, then lifecycle integration, consumers and persistence compatibility.
4. Test the eligibility acceptance examples, vacancies, minimum samples, calendar/format differences, ties, incumbent margin, transfers, side swaps, inactive/retired holders, role changes, insufficient new-season samples, underlying-tier restoration, S+ coexistence, repeated checkpoints and manual/bulk parity. Include frozen early-elimination averages and pre-match opponent-strength attribution.
5. Test SS's actual gameplay and valuation effects, capped stars, import validation, legacy reads, archive identity and save round trips. Test several seasons with deterministic RNG, at most one holder per role, and no mutation of completed results.
6. Run focused `npm test -- <paths>`, then relevant full unit suite, `npm run typecheck`, `npm run lint` and `npm run build`. Run Playwright against the export; if desktop persistence changes, also native tests and affected Linux/Windows WebView checks. Report browser and native verification separately.
7. Update `docs/systems.md` and affected contracts, including `docs/technical-design.md`; keep maintained translations consistent. No version bump or release. Commit verified milestones with Conventional Commits.

## Final implementation decisions

- `Player.tier` is the effective tier. An SS holder carries optional `ss` evidence with its S/S+ development tier, source season/phase, lane, score and rated games. Normal progression, aging and S+ reassignment operate on the underlying tier. Setup/random generation cannot mint SS; losing eligibility restores the evolved base tier.
- Qualification requires eight rated games, 60% of accumulated regional opportunity baselines and participation in the current region's latest completed domestic split. The baseline is the 75th percentile of teams' completed games in each split; transfers combine overlapping regions using the maximum per split. International games contribute to performance and do not create domestic inactivity for non-qualifiers. New-year carry lasts until the region accumulates eight domestic opportunities.
- For each recorded rating, add `0.1 × (opponent frozen base-roster stars − 3)` and subtract 0.1 if played as SS. Clamp to the rating range. Score = `(sum(adjusted ratings) + 12 × 6) / (rated games + 12) − 0.1 × standard deviation`. This combines sample reliability, opposition and consistency without using opponents' newly assigned SS status.
- Exact score ties use participated titles, games and stable ID. An eligible incumbent retains the seat unless surpassed by at least 0.15. SS has value 3.5 versus S+'s 3, comfort weight 1.1 and a small absolute lane edge (2 gold/minute with the default coefficient) so the five-star cap cannot erase its whole advantage.
- Reviews run after competitive phase completion and roster consequences, before constructing the next event. Frozen played rosters remain unchanged. Optional `ssReviews` and roster evidence archive actual ownership without manufacturing legacy awards. JSON payloads in existing browser/SQLite storage retain the fields; no schema migration, restore or write-queue changes were needed. Import validation rejects duplicate live holders, malformed evidence and SS potential; read-time reconciliation safely removes invalid ownership.
- Meta regressions fixed: repeated cumulative evidence at successive rounds, future-round leakage when catching up sleeper eligibility, and patch shifts dropping authoritative empty overrides. Each round now supplies fresh evidence; default/random/custom meta semantics and champion tiers remain intact. No mandatory S/S+ quotas were introduced.
- MSI pre-qualified teams display their existing logos. Recap team chips reuse team name/logo cards. Independent name triggers can receive keyboard focus, while names already inside buttons do not add a second tab stop. Player cards show SS evidence and the development tier.

## Balance audit

Reproduce with `node --import tsx scripts/audit-season-tiers.ts`. The script uses disposable in-memory state, the bundled real champion catalogue and seeds 7, 19 and 43. It covers default/randomized/custom meta and the four live-evolution/patch combinations, with four LCK teams over two years of three double round-robin splits: **36 scenarios / 2,592 actual simulated games**. This is a controlled balance sample, not proof of long-term full-world balance with transfers, aging and internationals.

The final run recorded **50 SS replacements**, never more than one holder per position, and three or five holders at the final checkpoint depending on the seeded eligible roles. Static controls retained their initial meta distribution. Maximum bottom-lane D counts across checkpoints were 1/28 (default), 3/28 (randomized) and 2/28 (custom); no sustained bottom-lane collapse appeared in these scenarios. The sample justified fixing evidence reuse rather than imposing tier quotas. Eligibility, score and strength parameters remain explicit tuning constants for future larger-world calibration.

## Verification

- Red/green regressions cover fresh meta evidence, authoritative empty patch overrides and SS's advantage at the star cap. Domain coverage includes direct B/A rejection, participation, opposition/sample adjustment, ties, incumbency, transfers, game side swaps, recency, grace, progression, S+ quotas, malformed imports, duplicate identities, gameplay and market effects, archive evidence and save round trips.
- Real in-memory SQLite save/load/rewrite checks preserve SS and review evidence; existing persistence/restore tests also ran. Native Rust tests: **12 passed**. No personal saves or AppData were accessed.
- Full unit run: **1,534 passed / 2 timed out**, before the final additional title-tiebreak test. Both expensive existing tests (`awards.mvpDistribution` and lifecycle FA metrics) also time out on an untouched `HEAD` copy in this environment; their assertions and timeout limits were not weakened. Final focused verification: **7 files / 158 tests passed**, including that extra test and simulator golden checks.
- Full lint passed, followed by a passing changed-file lint after the final test edits. The final production build and its TypeScript check passed using `npm run build -- --webpack`. Default Turbopack hit an environment port restriction. Playwright used installed system Chromium through a temporary config because the version-specific downloaded browser was absent.
- Final browser checks: **4 passed**, exercising MSI logos, recap focus/hover/Escape, SS player evidence and reload, plus existing tournament/history team cards. Screenshots under ignored `test-results/playwright/` were inspected visually, including the cyan SS card with its score and base tier. This is browser validation of desktop card behavior using a post-hydration Tauri-presence shim; no interactive native WebView session or Windows UI validation was performed.

## Post-implementation hook review

- Reviewed all 372 `aislop` warnings against the implementation diff. Fixed the four introduced source issues: a focusable noninteractive span, the SS selector's length/deep nesting, and the `TeamIcon` import left unused after replacing recap icons. Evidence collection, recorded-game iteration and ranking now have separate responsibilities; independent team-card triggers use native buttons, while names inside existing controls remain spans.
- The final full implementation scan reports **368 warnings / 0 errors**: 116 in generated worker bundles and 252 on pre-existing source lines. The generated files come from the worker build script and are already excluded by the project's ESLint configuration; hand-editing their exported constants/declarations would be inappropriate. Remaining source warnings concern existing imports, large functions, comments, duplication and project-specific policies (including static-export images), outside the added behavior. No scanner/hook configuration or thresholds were weakened. There are no remaining diagnostics in the new SS module or the changed team-name control.
- Repeated the full unit suite with one worker: **1,535 passed / the same 2 timeouts**, covering the final extra title-tiebreak test. The MVP distribution test exceeds 5 seconds and the lifecycle metrics test exceeds its explicit 20-second limit; both were reproduced on the untouched pre-implementation source. No assertion failures were reported.
- After the refactor: **158 focused tests passed**, **4 browser tests passed**, full lint plus changed-file lint passed, and the Webpack production export with its TypeScript check passed. Worker regeneration produced no further bundle diff because the selector refactor is outside their retained code.
