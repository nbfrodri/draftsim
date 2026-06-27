# Player Identity, Careers & Franchise Mode

Documentation for the player-identity, season/career-stats, and continuous
"reality" (franchise) features, plus the refinements shipped alongside them.

All changes are covered by the test suite (`npm test`) and pass a clean
`npx tsc --noEmit`.

---

## 1. Player identity & careers (the backbone)

Players now have a **stable, permanent identity** so their stats and honours
can be followed across teams and seasons — not just per roster slot.

### Stable `Player.id`
- New optional field on `Player` (`lib/types.ts`): `id?`, plus `name?`, `age?`,
  and `potential?`.
- `makePlayerId(rng)` lives in `lib/players.ts` (dependency-free, so the name
  and lifecycle modules can both stamp ids without an import cycle).
- Assigned at roster creation in `nameRoster()` (`lib/season/playerNames.ts`),
  so every season player gets one. **Preserved** through:
  - **Transfers** — `Player` objects move between teams carrying their id.
  - **Saves/loads** — `normalizeRoster()` (`lib/players.ts`) round-trips
    `id`/`name`/`age`/`potential`.
  - **Seasons** — carried forward by the franchise offseason (see §2).
- **Threaded into match recaps** (`lib/matchSimulator.ts` `buildGameRecap`):
  - `GameRecap.mvp.playerId` — the MVP's stable id.
  - `GameRecap.perPickIds` — per-pick ids (5 per side, lane order), parallel to
    the existing `perPickNames`.
- **Threaded into awards** (`lib/awards.ts`): `PlayerAward.playerId` /
  `AllProPlayer.playerId`, populated from the roster at award time.

### Season player leaders — `SeasonDashboard`
- `computePlayerSeasonLines(season)` / `computePlayerLeaders(season)`
  (`lib/season/stats.ts`) walk every completed game's recap and aggregate
  **by `playerId`** (kills/deaths/assists from `perPickKDA`, rating from
  `ratings`, MVPs from `mvp.playerId`, pentakills mapped via `perPickIds`).
- Exposed on `SeasonStats.playerLeaders`: `byKills`, `byRating` (min games),
  `byMVP`, `byPentakills`.
- Rendered as a **"Player Leaders"** panel on the season dashboard. Because it
  keys on id, a player who transfers mid-season keeps a single, unified line.

### Career Hall — `SeasonHistoryView`
- Per-season archival: `computePlayerCareerRecords(season)`
  (`lib/season/stats.ts`) produces a `PlayerSeasonRecord[]` (kills, MVPs,
  all-pro, split titles, international appearances, international titles).
  Team-level honours are credited to the player's **end-of-season roster** (a
  clean approximation given transfers happen between splits).
- Stored on each archived season: `SeasonHistoryEntry.playerCareers`
  (`lib/season/history.ts`), written in `buildSeasonHistoryEntry`.
- Cross-season aggregation: `computePlayerCareers(entries)`
  (`lib/season/historyRecords.ts`) sums each `PlayerSeasonRecord` **by id**
  across every archived season → `PlayerCareerLine[]`.
- Rendered as **all-time career boards** in the Hall: Most MVPs, Most Kills,
  Most All-Pro, Region Titles, International Appearances, International Titles.

---

## 2. Franchise / Realities (new continuous mode)

A **"reality"** is a continuous timeline where the same teams (names, logos,
rosters, careers) carry across many seasons. Each year is a normal
`SeasonState`; between years an **offseason** evolves the rosters.

### Reality is a top-level game mode
- Entered from the main menu's **"Realities"** card → `RealitiesHub`
  (`components/RealitiesHub.tsx`), routed in `components/DraftApp.tsx`
  (`entryView === "realities-hub"`).
- The hub lists saved realities (resume / open / delete) and creates new ones.
  **New Reality** sets a name + aging toggle (`beginNewReality`, stored as
  `pendingReality`), then sends the user to season setup; the next
  `startSeason` (`store/draftStore.ts`) **promotes** its result into Year 1 of
  a reality (`seedFranchise`) and registers the save.
- Inside a reality, `components/FranchisePanel.tsx` (on the dashboard) shows the
  reality/year banner and the **"Continue to Year N"** button once Worlds is
  done. Multiple realities are independent saves; **switching** snapshots the
  live season back into its slot first.

### Offseason transfer window (post-Worlds)
- Between seasons, `startNextSeason` runs `offseasonTransferPass(...)`
  (`lib/season/transfers.ts`) — the **biggest window of the year**: automatic
  cross-region roster movement across every team, weighted by last season's
  per-lane grades (incl. Worlds) and team strength/prestige. The moves are
  surfaced in the new year's transfer recap (`transfersByEvent.worlds`).
- This is in addition to the in-season First Stand / MSI windows (which remain
  interactive for the followed team). The offseason pass is currently automatic
  for all teams.

### Aging engine — `lib/season/playerLifecycle.ts`
- Pure, deterministic-given-an-RNG model of careers:
  - `initCareer(player, rng)` / `seedRosterCareers(roster, rng)` — stamp an age
    and a hidden **potential** (ceiling) onto existing players.
  - `agePlayer(player, perf, rng)` — one year of ageing: young talent climbs
    toward potential, veterans decline, and `retireChance(age, tier)` may
    retire them (returns `null`). **Driven by last season's grade** (`perf`):
    a good year speeds growth / slows decline; a bad year accelerates decline.
  - `makeRookie(lane, champions, rng, taken)` — a fresh young player (id, low
    starting tier, real upside, generated handle, champion pool).
  - `offseasonEvolveRoster(roster, gradesByLane, champions, rng, taken)` — ages
    a whole roster, replacing retirees with rookies at the same lane.
- Tunable constants at the top of the file (debut/prime/decline ages,
  retirement ramp, performance weight, change rate).

### Offseason loop — `lib/season/franchise.ts`
- `seedFranchise(season, name, aging, rng)` — promotes a freshly-created season
  into **Year 1** of a reality: stamps ages/potentials and attaches the
  `franchise` context `{ id, name, year, aging }`.
- `startNextSeason(prev, champions, rng)` — rolls a finished year into the next:
  1. (If `franchise.aging`) age every roster via `offseasonEvolveRoster`,
     using last year's per-lane grades (`teamSeasonGrades`) as the perf signal.
     If aging is **off**, carry the exact same players forward untouched.
  2. Apply champion-pool drift (when `playerDevelopment` is on).
  3. Re-create the season with the **same teams** (ids/names/logos/rosters),
     carrying the meta and region tides forward, and bump `franchise.year`.
- The prior year is archived to the reality's Hall by the caller.
- **Aging is a per-reality toggle** chosen at creation (`franchise.aging`),
  surfaced as a checkbox in the Realities panel (default ON). Tested both ways.

### Multiple named realities — store + `FranchisePanel`
- Store (`store/draftStore.ts`) gains `realities: SavedReality[]` +
  `activeRealityId`, persisted. A `SavedReality` is `{ id, name, year, season,
  history }`; the active reality mirrors into the live `season`/`seasonHistory`.
- Actions:
  - `startReality(name, aging)` — promote the current season to Year 1.
  - `continueSeasonToNextYear()` — archive the finished year, roll forward via
    `startNextSeason`, update the active reality slot.
  - `switchReality(id)` — snapshot the live season back, load another timeline.
  - `deleteReality(id)`.
- `components/FranchisePanel.tsx` (on the season dashboard): name input + aging
  toggle to start a reality, a **"Continue to Year N"** button when the year is
  complete, and a list of saved realities with switch/delete.
- **Limitation:** inactive realities are persisted un-compacted — fine for a
  handful of saves; the first thing to optimise if many long timelines stack up.

---

## 3. Refinements

### One transfer per role per window
- A team (including the followed team / user) may make **at most one transfer
  per lane per window** — closes the infinite-shopping exploit where the user
  could swap a lane repeatedly to collect S-tier players.
- Enforced in `lib/season/transfers.ts` via `teamMovedAtLane(...)` (guards
  `executeUserTransfer`, filters `transferCandidates`); used roles show
  **"✓ signed this window"** in `TransferWindowPanel`. Tested.

### Champion-pool drift between splits
- `applyPoolDrift(season, champions, rng)` (`lib/season/poolDrift.ts`) swaps ~one
  pool champion for a different lane-eligible one for a fraction of players each
  pass, keeping pools valid (size, mains-first, good/bad disjoint).
- Hooked into the between-split flow in `lib/season/engine.ts`
  (`applyTournamentUpdate`), gated behind the existing `playerDevelopment` flag.
  Tested.

### Live-sim player names
- During live game playback, player **handles replace champion names** in:
  - the head-to-head **lane gold** + **KDA** rows
    (`components/betweenGames/scoreboard/LaneGoldStrip.tsx`,
    `contributions/ContributionRow.tsx`), and
  - the **event log / timeline** descriptions
    (`scoreboard/MatchTimelinePanel.tsx` + `playback/TimelineRow.tsx`, via a
    champion-name → handle map built from the rosters in `betweenGames/shared.ts`).
- Falls back to champion names when a handle isn't available.

### Region / team browser — `components/TeamBrowserPanel.tsx`
- A collapsible **"Browse Leagues & Rosters"** panel on the season dashboard:
  pick a region, expand any team, and see each player's lane, **tier, name,
  age, potential, and champion pool** (icons).

### Player-name accuracy
- **Root cause:** the LoL Esports persisted feed (`getTeams`) lists each org's
  *full squad* (starters + subs + academy) with **no starter flag** and
  arbitrary order, so "first per role" often picked a sub.
- **Fix:** switched the bundled snapshot source to **Leaguepedia** (accurate
  current starters) — `scripts/fetch-player-names.mjs`. The importer is
  **chunked + throttled** and **accumulates across runs** (merges with the
  existing file and only re-queries still-missing teams), since Leaguepedia
  rate-limits hard. Coverage ~68% and climbing per run.
- The live season-creation fetch (`lib/season/realTeams.ts` `fetchRealTeams`)
  now **prefers the accurate bundled handles**, filling any gaps from the live
  squad. Re-run `npm run fetch-player-names` to top up coverage.

---

## File map (quick reference)

| Area | Key files |
|------|-----------|
| Player model + ids | `lib/types.ts`, `lib/players.ts` |
| Names (gen + real) | `lib/season/playerNames.ts`, `lib/season/realPlayerNames.json`, `scripts/fetch-player-names.mjs` |
| Recap/award ids | `lib/matchSimulator.ts`, `lib/awards.ts` |
| Season player stats | `lib/season/stats.ts`, `components/SeasonDashboard.tsx` |
| Career hall | `lib/season/history.ts`, `lib/season/historyRecords.ts`, `components/SeasonHistoryView.tsx` |
| Aging engine | `lib/season/playerLifecycle.ts` |
| Franchise loop | `lib/season/franchise.ts`, `store/draftStore.ts`, `components/FranchisePanel.tsx` |
| Transfers (1/role) | `lib/season/transfers.ts`, `components/TransferWindowPanel.tsx` |
| Pool drift | `lib/season/poolDrift.ts`, `lib/season/engine.ts` |
| Live-sim names | `components/betweenGames/scoreboard/*`, `components/betweenGames/playback/*`, `components/betweenGames/shared.ts` |
| Team browser | `components/TeamBrowserPanel.tsx` |

## Tests

`lib/season/playerLifecycle.test.ts`, `franchise.test.ts`, `transfers.test.ts`,
`poolDrift.test.ts`, `playerNames.test.ts`, `season.test.ts` — plus the existing
suite. Run with `npm test`.
