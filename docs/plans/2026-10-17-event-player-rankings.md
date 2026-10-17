# Event player rankings by role

## Status and goal

Planned; product scope confirmed. The user confirmed presentation, stage scopes and history depth below. Planning only; no application behavior has changed. Statistical thresholds remain proposed calibration defaults, not measured guarantees.

Provide a live performance ranking for each role within one regional split or international event. Reuse the useful statistical principles from SS Race, while admitting players of every underlying tier. The ranking describes performance in the selected competition; it does not assign SS, change player strength, award All-Pro selections or affect career greatness.

## Confirmed request

- Separate TOP, JNG, MID, BOT and SUP classifications for participants in the selected event.
- Statistics update while the event is being played.
- Use performance criteria comparable to SS Race, scoped to that event rather than the whole season.
- Show player/team identities, role, average grade, average gold difference and supporting statistics.
- Prepare a plan and resolve product choices before implementing it.

## Confirmed product decisions

| Choice | Accepted behavior |
| --- | --- |
| Presentation | Numbered ranking with performance score and statistics |
| Regional split scope | Whole split by default; regular season and playoffs filters |
| Availability | Live, final recap and archived event history |
| Evolution | Live updates plus past round/matchday checkpoints |
| International scope | Entire event, with play-in/main-stage filters |

Implementation recommendations: call the section **Player Rankings**; start collapsed; show all participants, including eliminated players; mark small samples as provisional; omit probabilities from the first version. Probabilities would need a separate definition such as uncertainty about the current leader, not the probability of earning SS or winning the event. None of these introduces a new gameplay tier or award.

## Existing implementation to reuse

- `lib/tournamentPlayerStats.ts` already aggregates rating, KDA and gold by tournament participant, including side swaps and separate counts for each available metric. `components/tournament/recap/PlayerTables.tsx` provides role filters and player/team identity UI, currently within the completed-event recap.
- `lib/season/ssPlayers.ts` provides the existing performance score: ratings adjusted by opponent strength, shrinkage towards a neutral rating, and a consistency penalty. Its candidate selection also contains season-only eligibility, incumbent and carry rules; those must not be reused for this feature.
- `lib/season/ssRace.ts` is a read-only projection, but scans season evidence and performs bootstrap estimation. Do not invoke it for event rankings.
- `components/TournamentDashboard.tsx` is the natural event-level entry point. `components/SeasonDashboard.tsx` already has per-phase results and stage statistics. Seasonal internationals can comprise multiple tournament IDs, including a separate play-in.
- `lib/season/history.ts` archives annual aggregates and roster/SS snapshots, not the complete per-game tournament data needed for these rankings. Durable event rankings need an explicit optional archive representation.
- `GameDraft` does not record a global completion timestamp. `compareMatchChronology` documents ordering for an individual team's history; it must not be assumed to reproduce the actual global order in which all matches were simulated.

## Ranking and statistical contract

### Scope and identities

1. Resolve an explicit event scope: season/reality, phase, league for domestic splits, constituent tournament IDs and optional stage filter. A regional split compares only its league. An international event compares its participating regions together.
2. Read only finished games with a recorded result. Drafts, byes, future games and unrelated events contribute nothing. Update after each completed game, even while its series is unfinished.
3. Join recorded participants by stable player ID and played role. Resolve teams from that game's sides and event roster snapshots. Reuse region-aware team identity and existing logo fallbacks.
4. Merge a player's play-in and main-event contributions within the same role when the combined scope is selected; do not double-count games. Preserve team attribution for each contribution. A role change produces separate role rows, and a substitute has their own row.
5. Missing legacy participant identity must remain unknown. Do not silently assign an unidentified appearance to the current starter. Any roster fallback requires reliable, unambiguous evidence from the event snapshot.

### Proposed score

- Preserve the established SS score initially: adjust each grade by `0.1 * (opponent base stars - 3)`, apply the existing `-0.1` correction when the player actually competed as SS, and clamp to 1–10. Use frozen event strength/tier, not current-season membership or current SS ownership.
- Aggregate adjusted grades using `(sum + 6 * 12) / (ratedGames + 12) - 0.1 * standardDeviation`. This preserves the existing protection against an unusually high average over very few games. Explain it as **Performance score**, alongside the unadjusted **Avg grade**.
- Missing adjustment inputs must be declared partial; do not silently mix raw grades and fully adjusted scores as equivalent evidence. Define and test the fallback policy before implementation, keeping any existing safe rating reconstruction distinct from invented observations.
- Do not impose S/S+ eligibility, annual domestic participation, recent-split activity, an incumbent margin, retained ownership or season carry. Any tier can lead this performance table.
- KDA, gold difference and win rate remain explanatory columns rather than additional score terms; avoid counting the same contribution twice through a composite that already uses match grade.
- Recommended exact-score tiebreak: more rated games, then stable participant key for deterministic display. No external season titles. Unlike SS ownership, a local ranking should not change solely because an unrelated event finished. A stable display tiebreak is not evidence that one tied player performed better.
- Show full-precision score ordering and rounded display values, with a brief explanation for apparently equal displayed scores.

### Participation and uncertainty

- Proposed initial threshold: at least three rated games and rated participation in at least 60% of the player's team's completed games in the selected scope. Aggregate relevant team opportunities explicitly for participants who change teams; do not count another stage or league.
- Below the threshold, retain the row and raw statistics under **Provisional**. Place qualified rows first; if no one qualifies, show provisional standings without asserting a qualified role winner.
- Display both played and rated games where data completeness differs. Compute each metric from its own denominator. Missing gold/grade is `—`, never zero.
- Eliminated players remain in the table with an elimination label where known. They cannot gain new samples, but their existing results remain valid. Do not penalize elimination separately from observed performance.
- Play-in byes must not count as missed participation. Very short tournaments can finish with provisional rankings; do not lower the threshold merely to force five confirmed leaders.
- Validate the proposed threshold and unchanged score on short internationals, long splits, substitutes and early eliminations before settling the tuning. Do not copy the SS minimum of eight games automatically.

The selected numbered presentation needs no letter-band thresholds, forced tier distribution or performance-tier badges.

## User interface

- Reusable collapsible **Player Rankings** section within the selected split/tournament. Use existing Rift panels, typography, role artwork, team logos and player cards. Keep bracket navigation visible and avoid repeating the full SS Race layout.
- Collapsed summary: event/stage name and the current five role leaders or a small-sample status. Expanded view: role tabs, stage filter where applicable, and a compact ranking table.
- Default columns: rank, player/team, performance score, average grade, average gold difference, games and win rate. Place KDA and metric sample counts in secondary details on narrow screens.
- Allow sorting by raw grade, gold, games and win rate, clearly labeling the active sort. Sorting by another metric must not silently redefine the overall performance leader.
- Explain scope, score and qualification with a short expandable methodology note. Keep analytical rank separate from any real tier shown in a player card.
- Reuse event-context player/team cards; historical views must use historical team/tier data. Support keyboard focus, proper collapse controls and existing topmost-only Escape handling.
- Retain role/filter selection across collapse; avoid heavy computation while collapsed. No broad store subscription or full-season scan for each row.
- Reuse or consolidate overlapping final-recap tables so completion does not produce duplicate, competing rankings.
- The shared component should work with a standalone tournament when participant data exists; season-specific aggregation belongs in a small scope adapter.

## Evolution and archive design

### Current live values

Derive rankings from existing finished games without writing state on render. A resumed reality with usable game data can immediately show the current event standings. Cache by relevant event inputs; no stochastic estimation is necessary.

### Round/matchday history

Record compact checkpoints at actual supported round/matchday boundaries, not on render or every UI refresh. First inspect the single-game, series, auto-simulation, bulk, resume and stage-transition owners and define one shared completion boundary.

- A checkpoint needs event identity, stage/bracket/round identity, a monotonic sequence and enough cumulative per-player values to explain rank and score changes. A round number alone is not unique across playoffs/brackets.
- Show previous rank, current rank and cumulative score/grade evolution. **New** and **Newly qualified** are different from a rank increase. Comparisons require the same role, scope and sorting rule.
- Checkpoint production must be idempotent and produce the same logical checkpoints in manual and bulk execution. Persist compact totals/moments rather than copied recaps; use append-only changes with a measured save-size budget.
- Current standings between checkpoints may be marked **Live**. Earlier checkpoints never include games completed after their boundary.
- Do not pretend an old tournament has a recorded global simulation order. Reconstruct only boundaries that existing structural data can establish, label reconstructed history, and otherwise start recording from the current known state.
- Test formats with parallel rounds, losers brackets, triple elimination and grand-final resets before claiming universal historical ordering.

### Final event records

Add optional, versioned per-event ranking records to the season archive. Freeze final rows, score policy version, scope/stage identity, qualification, metric counts and historical identities, together with the recorded evolution checkpoints. Preserve the raw metric aggregates needed by the UI; do not archive entire tournament simulations just for this feature. Optional fields support old saves; new complete records include all supported stage scopes.

- Live, recap and archive should agree at event completion. Capture once/upsert by stable event key, including the closing phase and bulk rollover paths.
- Add an expandable block inside each existing event/split history entry. Ranking placement is analytical and does not increment MVP, All-Pro, title, SS-acquisition or greatness totals.
- Maintain backward compatibility: an absent field means unavailable, an explicit empty ranking means recorded but no qualifying data. Never manufacture event rows from whole-season career averages.
- Validate new fields through supported import/export paths, including bounded collections, finite values, IDs and schema versions. Inspect hydration, write queues and restore boundaries before changing persistence. Test with disposable fixtures only.
- Do not migrate personal saves or require a destructive storage conversion. Preserve recoverability and existing transactional boundaries.

## Implementation sequence

1. **Confirm implementation contracts.** Product choices above are settled. Map the event/stage adapters and completion boundaries, validate proposed sample defaults, and prepare a small UI sketch using existing components.
2. **Build the pure event projection.** Add an event-scoped sample/aggregation helper and role ranking projection near `lib/tournamentPlayerStats.ts`. Extract only the shared score math from SS if useful; retain SS selection policy unchanged. Use behavior-first tests for scope, identity and samples.
3. **Add the live panel.** Reuse identity components and role filters, wire the event dashboard and seasonal split/event entry points, and make the completed recap use the same projection. Verify collapse, sorting, cards, empty states and mobile layout.
4. **Implement event history and evolution.** Add final event archive records and round checkpoints at verified mutation boundaries. Update serializers/validators and historical event consumers together.
5. **Verify and document.** Update system documentation with score semantics and historical limitations. Record checks and any calibration findings here. Commit verified milestones. A version bump/release is a separate delivery step when requested.

## Acceptance and verification

- A base-tier B participant can lead an event table through supported performance without changing their actual tier or becoming SS.
- Only the selected competition/stage contributes; regular/playoffs and play-in/main filters are exact. Multiple tournament IDs do not duplicate a player's samples.
- Blue/red swaps, substitutes, same-named teams in different regions and played-role changes retain correct attribution. Missing values remain unknown.
- One excellent game is visibly provisional; a qualified eliminated player remains visible. Qualification never treats a bye as a played game.
- New finished games update the table; future/drafting games do not. No SS ownership, team rating, awards, RNG or simulation outcome changes from opening the panel.
- Final live/archive equality, stable historical identities, no duplicate checkpoints after resume, manual/bulk equivalence, supported stage ordering, legacy partial-data states and import/export round trips.
- Red/green domain tests, focused SS regression tests if shared math moves, component/browser checks for keyboard/collapse/filters/cards/mobile, typecheck and lint. Run `npm test` and build before delivery; run relevant native persistence tests and disposable-profile checks if save contracts change.
- Measure a long split and a many-season archive for rendering cost and stored size. Extend verification only for unresolved concerns; no simulation retuning or forced band distribution merely to make an example look balanced.

## Planning verification

- Reviewed existing event aggregates, SS scoring, dashboard entry points, archive fields and game chronology contracts.
- `npm test -- lib/tournamentPlayerStats.test.ts lib/season/ssPlayers.test.ts`: 2 files, 30 tests passed. This verifies the inspected baseline, not the proposed feature.
- Documentation whitespace check passed. Application code and save data are unchanged; the implementation checks above remain pending.
