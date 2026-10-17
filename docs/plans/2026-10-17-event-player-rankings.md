# Event rankings, champion statistics and SS history presentation

## Status and goal

Implemented on `feat/event-rankings-history`. The accepted presentation, stage scopes, event history, champion boards and SS presentation are available. Ban/presence role filters use the recommended catalogue playable lanes; flex champions can appear in multiple role filters. Qualification uses the initial three-rated-game/60% defaults; these are explicit policy choices, not empirically calibrated guarantees.

Provide a live performance ranking for each role within one regional split or international event. Reuse the useful statistical principles from SS Race, while admitting players of every underlying tier. The ranking describes performance in the selected competition; it does not assign SS, change player strength, award All-Pro selections or affect career greatness.

The expanded scope also includes two champion leaderboards (most picked and most banned) alongside Presence, and a visual/UX improvement of SS history within the existing annual timeline. The user explicitly clarified that player rankings must show positions and statistics, without player-tier columns or badges.

## Confirmed request

- Separate TOP, JNG, MID, BOT and SUP classifications for participants in the selected event.
- Statistics update while the event is being played.
- Use performance criteria comparable to SS Race, scoped to that event rather than the whole season.
- Show player/team identities, role, average grade, average gold difference and supporting statistics.
- Do not display or assign S/A/B/SS tiers in the player ranking rows or leader summary. The table describes the best event performers in each role, regardless of their underlying gameplay tier.
- Add Most Picked and Most Banned tables for every split and international, defaulting to Top 10 with an All option, role filters and win rates.
- Improve SS history's timeline layout, hierarchy and interactions, using historical team logos and split/international icons.
- Explicitly redesign each player's **Career History → annual SS history** block for clarity and consistent team/phase iconography, not just the season-wide timeline.
- Show regional league logos for current holders and contenders in **Live Season → SS Race**.
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
- `components/tournament/recap/ChampionTables.tsx` and `lib/tournament.ts::computeChampionStats` provide champion totals and existing Presence/WR views. The current aggregator includes unfinished drafts, so the new live scope must explicitly select completed games. Presence currently sorts by picks+bans but displays a picks+bans+games sum; align its displayed meaning when extending these tables rather than reproducing double counting.
- `components/hall/SSHistoryPanel.tsx` already resolves some historical team logos through `TeamNameLink`. Improve consistency and layout rather than assuming logos are entirely absent. Reuse `SplitIcon` and the international `LeagueIcon` mappings already used by `SeasonHistoryView`.

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
- Collapsed summary: event name and content label. Five role leaders and provisional status appear after expansion, avoiding historical aggregation while collapsed. Expanded view includes role tabs, stage filters and a compact ranking table.
- Default columns: rank, player/team, performance score, average grade, average gold difference, games and win rate. Place KDA and metric sample counts in secondary details on narrow screens.
- Allow sorting by raw grade, gold, games and win rate, clearly labeling the active sort. Sorting by another metric must not silently redefine the overall performance leader.
- Explain scope, score and qualification with a short expandable methodology note. No real-tier or performance-tier badge/column in the player table or five-leader summary. Existing player cards retain their normal contextual information when explicitly opened; they do not determine ranking order.
- Reuse event-context player/team cards; historical views must use historical team/tier data. Support keyboard focus, proper collapse controls and existing topmost-only Escape handling.
- Retain role/filter selection across collapse; avoid heavy computation while collapsed. No broad store subscription or full-season scan for each row.
- Reuse or consolidate overlapping final-recap tables so completion does not produce duplicate, competing rankings.
- The shared component should work with a standalone tournament when participant data exists; season-specific aggregation belongs in a small scope adapter.

## Champion leaderboards

### Presentation and scope

- Keep Presence and add two comparable tables: **Most Picked** and **Most Banned**. Reuse a small shared table component with distinct ordering and labels. Preserve the separate existing WR board where useful, without duplicating the same board twice at event completion.
- Each table defaults to **Top 10** and supports **All**. Apply stage and role filters before sorting and limiting. Exclude zero-pick rows from Most Picked and zero-ban rows from Most Banned; All means all relevant recorded champions, not the whole unused catalogue.
- Show champion portrait/name, count, event rate, wins/losses, picked-game sample and WR. Use a compact layout and responsive scrolling only within the table when required. Maintain visible headers, accessible filter controls, focus feedback and readable number alignment.
- Use the same event/stage scope as Player Rankings: whole regional split with regular/playoffs filters, whole international with play-in/main filters. Update after completed games and retain final tables in the event recap and archive.
- Do not copy partial drafts into analytical totals. No automatic bans imposed by Fearless rules count as explicit draft bans unless an actual ban is recorded.

### Metric definitions

- **Pick count:** recorded selections in completed games; **Ban count:** recorded explicit bans. Sort by the table's named count descending, then stable champion ID for deterministic ties. Sorting by another visible column must identify that sort.
- **Pick rate / ban rate:** percentage of completed event games in which the champion was picked/banned, deduplicated within a game. Counts remain selections, so custom mirror/duplicate formats cannot create rates above 100%.
- **Presence:** games with at least one pick or ban divided by completed scoped games. Display picks and bans separately; do not add played games to picks+bans as though they were a third source of presence. If the existing ranking retains total picks+bans ordering, label that count separately from the presence percentage.
- **WR:** wins divided by wins+losses in actual picked appearances. A banned-only champion has `—` WR, never 0%. Show the sample, including a small-sample cue; do not hide frequent picks or bans solely because the champion has fewer than three played games.
- **Most Picked role filter:** use the role actually recorded for the pick (`blueRoles`/`redRoles`), not its possible catalogue roles. Recalculate picks and WR for that played role. Unknown legacy roles remain in All roles and cannot be fabricated into a particular lane.
- **Most Banned role filter — implemented default:** catalogue playable lanes (`Champion.lanes`), because a ban has no observed played role. Flex champions may appear in multiple role filters, but never twice within one table. Label this as playable-role filtering. Its WR describes all picked appearances in the selected event/stage, not a win rate for bans or an inferred role.
- For Presence, use catalogue-role filtering consistently with the proposed ban filter and label it as such; do not combine role-specific picks with unlabelled inferred ban roles. Freeze the role metadata needed to keep archived filters stable after catalogue changes.

### Archive and reuse

Extend the event archive record with compact champion totals and role-specific pick aggregates, stable champion IDs, historical role-filter metadata and rate denominators. No need to retain complete drafts or add champion round graphs to meet this request. Live and final archived table results must agree; legacy missing event data stays unavailable. Reuse the event checkpoint cadence for champion snapshots only if a later requirement asks for champion evolution.

## SS history timeline UI/UX

- Keep SS history inside the existing annual timeline and its relevant phase entries. Give the year a compact summary, then chronologically ordered, collapsible phase rows with a clear icon, phase label and occupied-seat count. Reduce repeated explanations and avoid several large blocks repeating the same holders.
- Use `SplitIcon` for domestic splits and the established international icons for First Stand, MSI, Worlds and other configured events. Resolve kind/ID from structured phase metadata or matching phase snapshots. Add optional explicit phase metadata to future reviews if required; never guess solely from a translated label. A legacy unknown phase gets a neutral icon and its recorded label.
- Each expanded phase shows the five roles in standard order, with aligned role icon, player name, **historical team logo/name**, decision and evidence. SS badges belong to actual historical holders here; the ban on tier badges applies to the new performance ranking.
- Reuse existing official-logo resolution and accessible fallbacks. Team identity must be the recorded review-time team, not the player's present club. Do not invent a logo/team for unknown legacy membership; prevent broken images, clipped logos and misaligned names.
- Visually distinguish Gained, Retained, Carried, Lost and Vacant with concise text and restrained existing colors; meaning cannot depend on color alone. Keep counts, dates and descriptions readable at narrow widths. Preserve player/team hover and keyboard-focus cards and topmost-only Escape dismissal.
- Place lifecycle losses at their recorded boundary, including **Offseason**, instead of making them look like a loss at the next tournament. Keep closing-year ownership and new-year continuity distinct. In Career History, use the same visual language within its existing annual SS block, without introducing a new section or tab.
- Clearly explain carry: **Carried from previous season** with the evidence's original phase. A continuation is not a new SS acquisition or fresh performance in the new event.
- Explain a known decline as **Lost SS — base tier no longer eligible**. Show an exact S→A transition only when both values are recorded; existing loss metadata may only establish decline, so do not infer the resulting tier from the player's current card. Adding future transition details requires optional validated fields at the actual mutation owner.
- Produce a before/after visual check on desktop and mobile, including long names, absent logos, all five seats, vacancies, retained holders, offseason decline and partial legacy history. Reuse project typography and UI conventions; apply relevant frontend/accessibility skills during implementation.

### Player Career History: dedicated UI/UX work

- Treat `SSCareerSummary` and `SSCareerYear` in `components/hall/SSHistoryPanel.tsx` as explicit design targets. Keep the annual SS block inside existing Career History; do not add a new tab or repeat the full player identity in every row of that player's own history.
- Replace dense, repetitive prose with an aligned chronological layout: **phase icon + phase name → SS change/status → historical team logo + team name**. Put score, rated games and original evidence phase in a clearly labeled secondary line or expandable detail.
- Use team logos consistently in opening ownership, gains, renewals, carry and loss rows, with uniform sizing/alignment and readable fallbacks. Preserve the recorded team for that occurrence; do not substitute the current club or assume a transfer caused the SS change.
- Display the established split and international icons wherever the phase identity is known. Use a distinct neutral treatment for opening/offseason and unknown phases, rather than borrowing a tournament icon for a lifecycle event.
- Make the summary explain its units: **times gained SS**, **reviews held**, and **years with recorded SS**. A renewal is not another acquisition; opening carry is not a new award. Keep partial-history notices close to affected figures rather than burying them in a long paragraph.
- Visually separate the opening status, competitive reviews and subsequent offseason losses. Preserve before/after-review ordering when several events share a phase index. A missing record must not read as “never held SS”; only show a loss reason or precise tier transition supported by recorded evidence.
- Keep concise explanations of Gained/Retained/Carried/Lost available without requiring a hover. Distinguish the tier used during a competition from ownership after its review; avoid unexplained labels and repeated SS badges competing with the phase/team identity.
- Verify desktop and narrow/mobile views, long names, multiple changes in one year, team transfers, missing logos, unknown phases and partial archives. Check spacing, contrast, keyboard expansion, focus cards and one-Escape dismissal. The result must let the user quickly answer **when SS changed, with which team, and why**.

### Live Season SS Race: regional identity

- Add the existing regional league logo next to player/team identity in `components/season/SSRacePanel.tsx`, for both current SS holders and all contender rows. Reuse `LeagueIcon`, existing labels and consistent icon sizing; retain the team logo and role icon with clear visual separation.
- Interpret region as the player's **current competing league**, obtained from `row.team.leagueId`, consistent with the live event context. Do not silently substitute nationality or `player.homeRegion`; an imported player's origin can differ from their team's league.
- Provide an accessible region name and a readable fallback when the league is unknown. Keep icons aligned and avoid overflow or relying on logos alone to identify a region.
- Preserve collapse/role-filter behavior, current metrics and SS-selection logic. Do not add clutter or an SS tier badge back to the collapsed panel heading. Verify regional identity after transfers and on narrow screens.

### Existing SS year-boundary rules to preserve

Verified in `lib/playerSS.ts`, `lib/season/playerLifecycle.ts`, `lib/season/franchise.ts` and `lib/season/ssPlayers.ts`:

- SS sits above an underlying development tier S or S+. `withDevelopmentTier` keeps SS when progression leaves that base at S/S+; a drop to A or below removes SS and its current evidence.
- An active holder in the same role can enter the new year retaining SS. New-year carry is supported while the region has fewer than eight domestic opportunity games under the existing opportunity calculation. It is not eight mandatory games played by that specific player.
- Actual selection remains at competitive phase closure. Once carry no longer applies, the current evidence and eligibility rules decide ownership; being last year's holder does not guarantee retention. A vacancy is allowed.
- Role changes, inactive status and lifecycle outcomes can also remove ownership. Reconciliation and recorded losses must continue to respect these existing rules. This visual enhancement does not change balance or replay historical selection.

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

1. **Confirm implementation contracts.** Preserve the accepted choices and resolve the pending ban-role filter. Map the event/stage adapters and completion boundaries, validate proposed sample defaults, and prepare a small UI sketch using existing components.
2. **Build the pure event projection.** Add an event-scoped sample/aggregation helper and role ranking projection near `lib/tournamentPlayerStats.ts`. Extract only the shared score math from SS if useful; retain SS selection policy unchanged. Use behavior-first tests for scope, identity and samples.
3. **Add the live panel.** Reuse identity components and role filters, wire the event dashboard and seasonal split/event entry points, and make the completed recap use the same projection. Verify collapse, sorting, cards, empty states, absence of tier badges and mobile layout.
4. **Add champion tables.** Implement scoped pick/ban/presence aggregates and role semantics, then Most Picked/Most Banned with Top 10/All, WR and matching phase filters. Correct the existing Presence display inconsistency in this bounded area.
5. **Implement event history and evolution.** Add final player/champion archive records and player round checkpoints at verified mutation boundaries. Update serializers/validators and historical event consumers together.
6. **Improve SS history and live identity UI/UX.** Redesign both the annual season timeline and each player's existing Career History SS block, with consistent historical logos, phase icons, clearer chronology and lifecycle explanations. Add regional league logos to live SS holders/contenders. Verify visual consistency and accessibility without changing SS selection.
7. **Verify and document.** Update system documentation with score semantics and historical limitations. Record checks and any calibration findings here. Commit verified milestones. A version bump/release is a separate delivery step when requested.

## Acceptance and verification

- A player can lead their event role through supported performance regardless of underlying tier. Ranking rows and leader summaries show positions/statistics without tier labels and never modify player tiers.
- Only the selected competition/stage contributes; regular/playoffs and play-in/main filters are exact. Multiple tournament IDs do not duplicate a player's samples.
- Blue/red swaps, substitutes, same-named teams in different regions and played-role changes retain correct attribution. Missing values remain unknown.
- One excellent game is visibly provisional; a qualified eliminated player remains visible. Qualification never treats a bye as a played game.
- New finished games update the table; future/drafting games do not. No SS ownership, team rating, awards, RNG or simulation outcome changes from opening the panel.
- Final live/archive equality, stable historical identities, no duplicate checkpoints after resume, manual/bulk equivalence, supported stage ordering, legacy partial-data states and import/export round trips.
- Champion tables: Top 10/All after filtering, correct picked-role WR, banned-only unknown WR, flex filter semantics, completed-game-only counts, no Fearless implicit bans, correct blue/red wins, unique-game percentages, missing-role handling and archive parity.
- SS timeline: correct historical logos and event icons; keyboard/collapse/card behavior; responsive visual checks; no new acquisition for carry; loss reasons at the right boundary; unknown historical values not fabricated. Existing S/S+ retention and A-decline behavior remains unchanged.
- Player Career History: clear status/change/team per phase, consistent logos and phase icons, meaningful summary units, correct ordering of reviews/offseason losses, partial-history labeling and no repeated player identity clutter.
- Live SS Race: correct current-league logo and accessible name for every holder/contender, imported-player origin distinguished from competing league, preserved team/role identity and no collapsed-header badge regression.
- Red/green domain tests, focused SS regression tests if shared math moves, component/browser checks for keyboard/collapse/filters/cards/mobile, typecheck and lint. Run `npm test` and build before delivery; run relevant native persistence tests and disposable-profile checks if save contracts change.
- Measure a long split and a many-season archive for rendering cost and stored size. Extend verification only for unresolved concerns; no simulation retuning or forced band distribution merely to make an example look balanced.

## Planning verification

- Reviewed existing event aggregates, SS scoring, dashboard entry points, archive fields and game chronology contracts.
- `npm test -- lib/tournamentPlayerStats.test.ts lib/season/ssPlayers.test.ts`: 2 files, 30 tests passed. This verifies the inspected baseline, not the proposed feature.
- Documentation whitespace check passed. Application code and save data are unchanged; the implementation checks above remain pending.
- Expansion review: inspected SS development/carry and offseason owners, historical-logo/phase-icon consumers, champion aggregation and Presence rendering. `npm test -- lib/season/ssPlayers.test.ts lib/season/ssHistory.test.ts lib/tournamentPlayerStats.test.ts`: 3 files, 40 tests passed. This remains baseline verification of the documented behavior, not implementation of the proposed UI or tables.

## Implementation and verification — 2026-10-17

- `lib/eventStats.ts` owns completed-game aggregation, qualification and scoring. Event adapters expose the same panel in the tournament and season dashboards; the annual archive exposes each recorded event. The final recap no longer repeats its old Presence/player-leader tables.
- Manual game completion publishes the ongoing series into the tournament and season immediately, without ending the series or reviewing SS early. The shared `recordMatchWinner` boundary records completed bracket/round checkpoints for manual and automated callers, including reset brackets. Existing tournament-format tests remain green.
- Live checkpoints contain cumulative completed-game IDs. Archived version-1 records store final identities once and compact checkpoint metric tuples/team indexes. The fixed tuple order is `EVENT_METRICS`; changing it requires a new version. Champion aggregates are final/current scoped totals, not historical round graphs.
- Import validation bounds collections, validates finite counters, versions and identity references, and rejects malformed checkpoint data. Existing browser/SQLite JSON ownership and transaction boundaries remain unchanged; no database migration is required.
- SS review metadata now optionally records split/international identity. Timeline and Career History use historical team logos, phase icons and chronological status rows. Live SS Race shows the current team's regional league logo, including imported players whose origin differs. Selection, development and carry rules are unchanged.
- Compatibility: usable current games can produce standings, but unrecorded past checkpoints are not reconstructed. Old annual archives without event records show unavailable information. Eliminated participants remain ranked; this version does not infer an elimination badge. Player role/stage/checkpoint/sort choices survive collapse; champion controls initialize to All roles/Top 10 when reopened.
- Full `npm test -- --maxWorkers=1`: **138 files, 1,569 tests passed**. A legacy partial-season regression found during the first full run was fixed at the archive owner; existing tests were not weakened.
- `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack`: passed. Worker output was regenerated through the build script.
- Six Playwright tests passed for live/archive rankings, round selection, role and Top 10/All filters, collapse, SS regional identity, historical cards, timeline and Career History. Desktop/mobile screenshots were reviewed. This verifies Chromium, not the native WebKitGTK/WebView2 presentation.
- Twelve native Rust tests passed. Disposable in-memory SQLite tests additionally exercise compression, export/import validation and two successive save/load cycles containing the new records; no personal saves were used.
- The archive-size regression fixture covers 300 games and 30 checkpoints, under a 180 KB JSON budget for ten participants. The uncompressed representation failed that budget before tuple packing (237,433 bytes). An additional ad-hoc larger benchmark was blocked by the execution hook and was not retried through another mechanism; no many-season performance guarantee is claimed.
