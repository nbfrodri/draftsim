# Complete SS history and presentation integration

## Status and goal

Implemented on `feat/ss-history-integration`; verification is recorded below. Builds on the [original SS plan](2026-10-16-season-ss-tier-meta-and-team-cards.md) and the released SS Race. Integrates SS into season history, annual timelines, player careers, historical cards and team-strength explanations without changing the agreed selection balance or rewriting historical participation.

The result must answer: who held SS in each role at each recorded checkpoint, when a player gained or lost it, which team they represented, what tier they actually played with, and how SS affects current team strength.

## Confirmed baseline

- `lib/season/ssPlayers.ts` selects and reconciles holders. Reviews run at completed competitive phases, not transfer windows. `ssReviews` already records phase index/label and holder IDs, roles and selection evidence.
- `lib/season/engine.ts` captures phase rosters using tournament entrants before the closing SS review. Some between-phase lifecycle/transfer operations also precede that review. Do not assume current membership identifies the team that played the event.
- `lib/season/history.ts` copies both `phaseRosters` and `ssReviews` into archived seasons. The review data currently has no presentation consumer.
- `lib/season/playerCard.ts` resolves tier and SS metadata from historical snapshots. A last-played snapshot is not necessarily the final SS ownership of the year.
- `lib/importValidation.ts` validates optional review data; new history fields must be validated through every supported save/import path.
- `lib/players.ts` assigns numeric values S=2, S+=3 and SS=3.5. `deriveStar` averages roster values, adds 3, then rounds to half stars and clamps to 1–5 through `lib/teamStars.ts`. `teamStarRating` prefers roster-derived strength.
- Simulation has SS-specific effects beyond displayed stars. Preserve existing coefficients and verify their callers rather than adding another bonus.

## Decisions to preserve

- At most one current SS per role worldwide, at most five overall. Vacancies are valid.
- Only underlying S/S+ players qualify; no direct B-to-SS promotion from a short strong run.
- Preserve minimum participation, opponent/sample adjustments, title tiebreaks, incumbent replacement margin and new-season carry rules.
- SS is a real effective tier over a development tier. Acquisition is not an All-Pro award or a tournament title.
- Probabilities in SS Race remain estimated and are not historical selection evidence.
- Champion tiers, ADC balance, unrelated awards and team-rating scale changes are outside this plan.

## Historical semantics and data contract

### Two distinct observations

1. **Played with:** the immutable entrant/phase roster tier used for competition and historical match cards.
2. **Held after review:** the actual holders after the phase's SS decision. Use this for timeline checkpoint rows, closing-year ownership and career SS history.

Never overwrite the first with the second. A player may play Worlds as S+ and obtain SS after Worlds; both facts must be visible and consistent. Historical cards must state their context instead of silently falling back to a live tier.

### Additive review metadata

Extend the existing `SSReview` contract with optional, versioned metadata rather than introducing a parallel award store. Final TypeScript field names should follow existing snapshot conventions.

- Preserve existing phase identity, holders, evidence and stable player IDs.
- Freeze player display name, role and team identity (region plus team name; stable ID where available) at the review checkpoint. Reuse existing historical logo resolution/snapshot conventions.
- Keep event roster identity separate from review-time membership when a transfer intervened. Label each correctly; do not attribute old performance to the new club.
- Record decision status per holder: newly selected, retained or carried from a previous season. Carry must not be presented as fresh qualification on current-year results.
- Preserve the evidence's original season/phase when carried. Review checkpoint and evidence origin are separate timestamps.
- Capture an explicit opening ownership baseline for newly recorded seasons. This lets the first review distinguish an incumbent from a first acquisition without guessing from incomplete older archives.
- Record actual ownership transitions outside a review when lifecycle rules remove SS (decline, role change, inactivity or retirement). Store the effective boundary and a known reason at the mutation owner. Do not infer an exact date/reason from two distant snapshots.
- Derive regular gained/retained/lost transitions between comparable checkpoints. Persist reasons only where the producer knows them; avoid maintaining duplicate aggregate counters.
- Idempotency: one review per season/phase, stable ordering by role, no duplicate player or role owners. Reprocessing a completed phase must not add an acquisition or alter frozen history.
- Distinguish a recorded empty holder list from an absent record. Missing history is unknown, not five vacant roles.

Inspect live, bulk, resumed and final-phase execution before changing write order. Do not move SS selection across transfers or development silently: that could change eligibility and balance. If ordering must change, document and test the behavioral difference separately.

## Shared history projection

Add a pure, tested projection near existing season history helpers, consumed by timeline, career and cards.

- Join by player ID, never handle alone; team identity includes region.
- Return ordered checkpoints, role seats, known transitions, evidence origin and completeness indicators.
- Prefer explicit review metadata. For older reviews, resolve identity from matching historical snapshots only when unambiguous; otherwise retain the ID and show an unknown team/name fallback.
- Do not use the player's current club, current name or current SS badge to fill historical gaps.
- Keep actual reviews separate from live projected contenders. Viewing history never runs selection or mutates a save.
- Scope queries to the selected reality/season. Build reusable indices or memoized projections once per relevant input, avoiding repeated full-career scans in every card render.

## User interface

### Annual timeline and Season History

- Add a compact, collapsible SS section at each recorded competitive phase, with the five roles in normal lane order.
- Show holder, historical team logo/name, SS badge and selection score/rated games where recorded. Clearly label vacancies and unavailable history.
- Mark gained, retained, carried and lost ownership. A replacement links both players; a known lifecycle removal appears at its actual recorded boundary.
- Explain that these are holders **after the phase review**, not event-specific All-Pro selections.
- At year summary level show closing holders separately from everyone who held SS during that year. Do not select a fictitious annual SS winner.
- Keep existing team/player hover, focus, navigation and phase context. Use existing typography, role icons and logos.

### Player career and Hall

- Inside the existing **Career History**, add an SS career summary and an expandable **SS history** block within each year. This placement was confirmed with the user during implementation; no new tab or separate career section.
- Display known first acquisition, confirmed acquisition count, recorded review checkpoints held and years with recorded ownership.
- A retained seat is not another acquisition. Carry into a new year is not reacquisition. Regaining after a confirmed loss is a new acquisition.
- Label the unit explicitly as review checkpoints held; this is not games played, days held or evidence of participation in that tournament.
- Across missing checkpoints, report observed ownership without asserting uninterrupted streaks or exact first acquisition. Mark totals as partial where applicable.
- Link each entry to the matching year/phase and historical team. Keep SS separate from title/All-Pro totals and existing greatness formulas.
- Hall player views may filter for recorded SS ownership using the shared projection. New all-time power rankings or trophy points are not required.

### Cards and roster snapshots

- Live cards show effective SS, underlying tier and last decision/evidence context.
- Match/event cards retain the tier actually recorded for competition. Add a separate closing-review annotation when relevant rather than replacing that tier.
- Annual/career cards distinguish last-played tier, closing-year ownership and historical SS summary. Do not call a player currently SS because they held it once.
- Ensure final-phase acquisitions are discoverable even when no later entrant snapshot exists.
- Use the shared `TierChip` presentation consistently, including historical roster cards. Only player tiers receive SS badges; section headers use ordinary icons.
- Preserve keyboard access, topmost-only Escape dismissal and mobile layout. Context must remain readable without hover.

### Team strength and simulation

- Keep the 1–5 star scale and half-star rounding. SS contributes 3.5 to the roster mean; S+ contributes 3.
- For five players, S+ → SS adds 0.1 to the unrounded rating. Visible stars may stay unchanged due to rounding or the five-star cap; S → SS adds 0.3 before rounding.
- Add a concise explanation through the existing team-rating details/tooltip pattern, identifying the effective roster calculation and rounding/cap. Avoid making stars look like a direct win probability.
- Use the same shared calculation for live teams and historical roster contexts. Historical ratings must use their own roster, not today's team.
- Verify tournament creation uses the effective tier for the next competition and does not rewrite completed series. Preserve existing SS-specific simulation advantages at the star cap.
- Audit market evaluation, progression/decline, free agency, retirement and season rollover for accidental SS stripping, duplicate holders or treatment of SS as random potential. Fix demonstrated integration defects with regressions; do not retune coefficients as part of this work.

## Persistence and compatibility

- Read hydration, save mutation owners, desktop write queues, browser persistence, reality import/export, backup/restore and archive update paths before implementation.
- Keep fields optional and additive. Old saves and archives load unchanged; old reviews remain useful even without enriched identity or transition metadata.
- Never replay selection against old results to fabricate awards. No retrospective change to match tiers, awards or final results.
- Validate new objects at import boundaries: finite evidence, valid roles/tiers, unique ownership, valid phase references and coherent origin metadata. Define whether each invalid case is rejected or normalized using existing import policy; avoid silent data loss.
- Test full JSON/export and SQLite round trips on disposable fixtures, including restoration and failed import/hydration. No personal save testing and no copying live WAL databases.
- Prefer no database-schema migration. If one becomes necessary, require a recoverable snapshot, transactional migration and rollback design before implementation. Additive fields alone do not justify rewriting all archives.

## Implementation sequence and acceptance gates

1. **Contract and producer audit.** Trace phase close, transfers, lifecycle loss, rollover, archive and all simulation modes. Add failing fixtures for final-phase acquisition, transfer attribution, retained ownership, carry and missing history. Finalize optional metadata and event semantics.
2. **Recording and persistence.** Implement enriched reviews/opening baseline and genuine non-review transitions at their owners. Extend validation and save coverage. Gate: idempotent writes, maximum five holders, no historical mutation, equivalent live/bulk/resume outcomes.
3. **Shared projection.** Implement chronological resolution and career summaries. Gate: stable IDs, same-name clubs in different regions, partial history, reacquisition and cross-year carry all produce correct results without stored duplicate totals.
4. **Timeline and annual summary.** Render phase review seats, transitions and closing holders with historical links. Gate: final-phase SS appears without changing the phase roster; absent and empty records look different.
5. **Career, Hall and cards.** Reuse the projection and contextual tier semantics throughout. Gate: identical data agrees across all views, retained/carry states never inflate acquisitions, retired/transferred players resolve historically.
6. **Team strength and remaining gameplay integration.** Explain rounding/cap, verify shared callers and fix demonstrated lifecycle gaps. Gate: unrounded +0.1 for a five-player S+ → SS change, correct rounded stars, preserved simulation edge and unchanged completed matches.
7. **End-to-end verification and documentation.** Update system/domain documentation in EN/ES where applicable and record actual results in this plan. Release notes describe implemented behavior and legacy limits. Publication, version bump and installers are a separate delivery step when requested.

## Verification matrix

- **Domain:** vacancy, first selection, retention, replacement, reacquisition, loss without replacement, carry, final-phase award, decline/retirement, role change, transfer and same-name identities.
- **Chronology:** entrant tier versus post-review tier; transfer before/after review; missing intermediate records; year boundary; existing saved season resumed midway; custom competition schedules.
- **Persistence:** legacy without reviews, legacy reviews without enrichment, new complete history, malformed imports, duplicate holders, failed hydration, archive/export/import/restore round trips.
- **Execution:** manual completion, bulk simulation, resumed completion and repeated close/reconcile. Read-only historical rendering cannot alter state or consume simulation RNG.
- **Browser:** open timeline → phase → player career/card → team card; verify correct phase/team/tier; keyboard and Escape, narrow viewport, long names, missing logos and partial legacy records. Verify SS Race still folds and retains its role filter.
- **Performance:** reuse projections in a multi-year fixture; avoid per-row whole-history scans and heavy work for collapsed sections.
- **Commands:** focused `npm test -- <paths>` during red/green; then `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, affected Playwright tests against the fresh export, and the configured changed-code review. Run `npm run test:desktop` and disposable native persistence smoke for touched desktop save paths. Report browser versus native validation separately.
- **Completion:** all seven milestones verified, documented legacy behavior, no unexplained new diagnostics, consistent SS ownership across views and no unrelated balance changes. A plan or passing build alone is not completion evidence.

## Implementation and verification record

- Recording: optional opening holders, versioned reviews with frozen review-time identities and explicit gained/retained/carried decisions; review idempotency; mutation-owned losses for development, mid-split demotions, user benching/signings and offseason rollover. Inactive SS reconciliation now also runs after attaching the new year's franchise pool. Review ordering relative to transfers and event snapshots is preserved.
- Projection and UI: shared chronological helpers, separate closing ownership, phase-by-phase timeline seats, replacements/losses, career summary inside **Career History** and an expandable SS block within each year, including opening continuity. Historical event/year/career cards retain played tiers and explain their SS context. Team cards explain the existing star calculation. No new award points, selection parameters or simulation bonuses.
- Compatibility: old optional review data remains readable. Legacy review-time clubs are left unknown rather than borrowed from potentially earlier entrant rosters. Missing baselines/checkpoints mark career totals partial. No schema migration or historical selection replay.
- Red/green: enriched review metadata failed before recording was implemented; development-loss recording failed before the mutation owner was connected; the browser journey failed against the old export because the SS history section did not exist. All corresponding regressions now pass.
- Full unit suite: **136 files, 1,557 tests passed** with `npm test -- --maxWorkers=1`. Focused reruns cover later projection/validation edits, SQLite archive and active-season round trips, portable reality codes, hydration/exit persistence and malformed imports.
- Native storage/backup suite: **12 tests passed** with `npm run test:desktop`. SQLite payload coverage uses a disposable real SQLite database. Personal saves were not used; native WebView interaction and installation were not exercised for this change.
- Browser regression set: **12 tests passed** across SS history, SS presentation, career controls and timeline honors. Includes phase-specific played-tier versus final SS acquisition, keyboard expansion/Escape, profile navigation, and 390px overflow checks. Final SS presentation is rechecked after the opening-continuity display update.
- `npm run lint`, `npm run typecheck`, and production static builds passed. The final build includes regenerated workers through the project script; no generated bundle was hand-edited.
- Changed-code analysis: **0 errors, 136 warnings**. The new SS projection/component/tests have no diagnostics, and none of the non-generated diagnostics fall on added source lines. Remaining findings concern pre-existing touched-file size/duplication/accessibility/import conventions and generated worker declarations. Broad unrelated rewrites and manual bundle edits do not belong to this implementation; no rule or hook was disabled.
- Delivery scope: implementation and documentation only. The application version remains 1.9.2; publication, a release tag, installers and local installation are not part of this plan's implementation step.

### Follow-up hook review

Removed four unnecessary empty-object fallbacks in engine object spreads and merged the duplicate placements import in the Hall. These are behavior-preserving mechanical corrections. The worker build produces identical bundles. All 93 affected unit tests, ESLint and the TypeScript check pass.

The complete branch scan against `main` now reports **0 errors and 131 warnings**: **52 in the generated roster-outlook bundle** and **79 in pre-existing source constructs** in touched files. Generated unused declarations are esbuild output and must not be removed by hand. The remaining source findings concern existing large functions/files, repeated view markup, unused legacy declarations, decorative comments, static-export images and semantic-role/event-handler conventions outside the new SS modules. They are documented maintenance work, not demonstrated SS regressions. Rewriting those unrelated views or suppressing rules would expand this feature without improving its verified behavior. No hook or rule was bypassed.
