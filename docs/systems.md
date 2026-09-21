# Core game systems — technical reference

🇪🇸 **[Versión en español](systems.es.md)**

Deep documentation for DraftSim's AI, season/franchise layer, competitive structure, and realism model. For feature-level UX notes see the [README](../README.md); for subsystem design docs see [Design docs](../README.md#-design-docs).

**Code map:** `lib/draftAI/` · `lib/matchSimulator.ts` · `lib/sim/` · `lib/season/` · `lib/championMeta.ts` · `lib/metaRandomizer.ts` · `lib/chemistry.ts`

---

## Design philosophy & realism goals

DraftSim is a **simulation sandbox**, not a Riot client clone. The goal is to make competitive LoL *legible*: draft choices, macro plans, roster strength, and calendar structure should all matter in ways that feel like watching (or playing) pro LoL — without reproducing patch-specific mechanics that would go stale every two weeks.

| Principle | What it means in code |
|---|---|
| **Pure-function core** | `lib/` has no React/DOM deps. Draft, sim, season, and tournament logic are unit-testable and deterministic given an RNG seed. |
| **Opt-in realism** | Season flags (`formDrift`, `playerTransfers`, …) default **off**. With all flags off, serialization and sim behaviour match the classic model. |
| **Neutral-by-default levers** | War Room strategies, chemistry, and meta overrides contribute **zero** when unset — old saves and “no plan” games stay bit-identical. |
| **Score by team name** | Series wins aggregate by team identity, not blue/red side, so auto side-swap never splits a team's record. |
| **Layered bias, one choke point** | Roster stars, per-lane skill, form, clutch, momentum, coach motivation, and variance presets combine in `starRatingBias()` (`lib/series.ts`) before the match timeline rolls events. |
| **Data + heuristics over ML** | The shipped drafter is hand-tuned scoring (`lib/draftAI/scoring.ts`). A learned policy exists on an optional branch (see below). |
| **Real names, abstracted rules** | Pro team names, logos, and player handles are fetched or bundled; salary caps, visa rules, and scrim schedules are not simulated. |

**What “assimilating reality” looks like:** real regional leagues and event names, split-fed international qualification, play-in / Swiss / groups shapes, fearless draft in series, loser-side conventions, transfer windows between majors, academy pipelines, career IDs tracked in a Hall, meta that drifts like patches, and roster moves driven by performance + champion-pool fit under the current meta.

**What is deliberately abstracted:** individual player mouse clicks, vision pixel games, exact item active timings, coach VOD review, org economics, roster lock deadlines with fines, and geo-based ping/latency.

---

## AI heuristic systems (draft)

The default AI is a **scoring ensemble**, not a single formula. Every legal pick/ban candidate gets a weighted sum of labelled components; the AI samples from the top-N (temperature-controlled) so games vary while strong choices dominate.

### Pipeline

```
chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx)
  → build PickContext / BanContext (lanes, archetypes, identity, series state)
  → scorePick / scoreBan for each candidate (pure, explain=true for rationale)
  → optional lookahead penalty (1-ply Normal, 2-ply Hard)
  → sampleTopN(total scores, temperature, topN)
  → return champion id + breakdown + alternatives
```

Entry points: `lib/draftAI/index.ts`. Scoring: `lib/draftAI/scoring.ts`. Tables: `lib/draftAI/data.ts`. Lookahead / anticipation: `lib/draftAI/anticipation.ts`.

### Scoring component kinds

Personality presets re-weight these buckets (`lib/draftAI/personalities.ts`). Missing weight = 1.0 (bit-identical to historical behaviour).

| Kind | Pick behaviour | Ban behaviour |
|---|---|---|
| **metaTier** | Lane fit, S+ first-pick value, “play meta when behind” | Deny flex, target high-tier threats |
| **synergy** | `CHAMPION_SYNERGIES` pair bonuses | Break enemy synergy pairs |
| **archetypeSynergy** | Implicit comp-shape reinforcement | — |
| **damageBalance** | AP/AD gap fill, stack penalties | — |
| **playerComfort** | Own roster pool nudges | — |
| **laneMatchup** | 250+ hard counters + heuristic lane fit | Counter-deny on enemy lanes |
| **identity** | Complete converging comp (Wombo, Pick, Dive…) | — |
| **crossGameCounter** | Counter last game's identity / archetype profile | Ban enabler archetypes |
| **lookahead** | Penalty if enemy's best response hurts us | — |
| **targetBan** | — | Comfort / anticipated / deny-main bans |
| **threatBan** | — | Protect our comp from hard counters |

### Strategic signals (detail)

- **Identity targeting** — After two picks, `identityTarget()` locks a comp label from `IDENTITIES` in `data.ts`. Subsequent picks earn bonuses for `needed` archetypes (Wombo needs `wombo` + `engage`, etc.).
- **Side-aware drafting** — Blue favours flex and counter-resistant S+ meta; Red weights matchup edge and refuses R5 into a hard lane counter (`scoring.ts` + `helpers.laneMatchup`).
- **Series-state** — `SeriesAIContext` feeds elimination/closeout flags, win differential, fearless prior picks, and opponent prior identities. Behind in series → stronger meta priority; on match point → less pocket-pick risk.
- **Tournament live meta** — Optional `tournamentChampionWR` map applies Bayesian-shrunk W/L nudges per champion id (observed picks in the bracket so far).
- **Enemy-roster scouting** — When rosters exist: target-ban enemy mains weighted by `PLAYER_SKILL_WEIGHT`, deny comfort on own picks, respect enemy laner tier in matchup term, skip bans on enemy bad-pool champs.
- **Pocket picks** — `POCKET_PICK_PROB` widens sampling pool occasionally; personalities like `cheese` multiply this heavily.

### Difficulty & sampling

| Difficulty | Lookahead | Anticipation | Temperature |
|---|---|---|---|
| Easy | Off | Off | Higher (more random top-N) |
| Normal | 1-ply | On | Default `PICK_TEMPERATURE` |
| Hard | 2-ply | On | Sharper |

Knobs: `PICK_TOP_N`, `BAN_TOP_N`, `PICK_TEMPERATURE`, `BAN_TEMPERATURE` in `lib/draftAI/data.ts`; `knobsFor()` in `index.ts`.

### Draft personalities

Per-team profiles multiply component weights and sampling knobs. Assigned on `SeasonTeam.personalityId` and `Coach.personalityId`.

| ID | Style |
|---|---|
| `balanced` | Default — empty weights, historical behaviour |
| `meta-slave` | Tier-list maximalist, near-deterministic sampling |
| `comfort-first` | Player pools over meta; high target-ban on signatures |
| `counter-picker` | Lane counters, lookahead, cross-game adaptation |
| `cheese` | High temperature, wide top-N, pocket-pick merchant |

### Coaches (draft strength)

`Coach.rating` (1–5) maps to AI difficulty per team (`coachDifficulty`). `adaptability` feeds meta-shift form swings; `motivation` scales form drift with results (`lib/season/coach.ts`).

### Neural draft policy (optional branch)

**Not on `main` by default.** Branch `feat/neural-draft-policy` adds:

- `lib/draftAI/neural/` — state encoder + policy inference in pure TypeScript (no runtime ML deps).
- `public/models/draft-policy.json` — exported weights (large JSON).
- `training/` — PyTorch training pipeline (`dataset`, `model`, checkpoints).

Integration pattern: `chooseAIActionWithRationale` tries neural policy first, falls back to heuristic scoring silently. The shipped experience on `main` is the heuristic drafter above.

Validate heuristic tuning: `npm run calibrate` (TeamScore ↔ win-rate correlation).

---

## Match simulator

`simulateMatch()` in `lib/matchSimulator.ts` orchestrates phase modules under `lib/sim/timeline/` (laning, objectives, fights, closing). Types and event flavours: `lib/sim/types.ts`, `lib/sim/descriptions.ts`.

### Timeline model

~30 `EventType` values (level-1 invade, scuttle, gank, plates, drakes, grubs, herald, atakhan, soul, baron, elder, teamfight, pick, vision, power-spike, ace, shutdown, backdoor, nexus…). Each event:

1. Rolls side advantage from comp diff, lane leads, momentum, objective state, strategies.
2. Applies `kdaDelta` to lane KDA and flows gold via `kdaToLaneGold` (300g/kill, 100g/assist).
3. Updates win-probability timeline for the UI sparkline.

Game length is capped (roughly 24–50 min simulated); scaling/passive strategies stretch duration; aggressive tempo shortens it.

### Combat resolution

Closing fights use per-champion **damage and EHP** estimated from:

- Item build paths (`lib/championBuilds.ts`, spike minutes from `getKeyPowerSpike`).
- Archetype damage profile and meta tier (`TIER_VALUE`).
- Ability lockdown profiles (`lib/championAbilities.ts`) for CC chains.

**Power spikes** — When a carry's key item comes online, mid-game fight rolls tilt toward that side (up to two spike beats per side for multi-carry comps).

**Late scaling** — Deciding fight adds a duration-ramped term so comps that peak late genuinely win long games.

**Identity multipliers** — `lib/sim/identities.ts` — Wombo vs no-disengage, Dive vs unprotected carry, etc. Surfaced in Team Comparison scouting reports.

### Pre-fight bias stack (no double-counting)

| Source | Effect |
|---|---|
| `starRatingBias()` | Team star gap, form, clutch, streak, variance preset |
| Per-lane roster | Zero-sum micro: strong laner over-performs in that lane only |
| Champion-pool fit | Comfort / discomfort on picked champ |
| Lane chemistry | Stored pair synergies + bot-duo / same-region nudges (`lib/chemistry.ts`) |
| War Room plan fit | ±~10pp tailwind when plan matches draft (`strategyFit`) |
| Strategy timeline mods | Event frequency, objective tilt, steal chance, risk variance |

War Room levers (`lib/sim/strategies.ts`): 16 neutral-by-default settings across Team Plan, Map & Resources, and Lane Assignments. AI selects via sampled `chooseAIStrategy()` (series-aware risk, pick target on enemy carry, lane swap on hard counter).

### Recaps & ratings

`buildGameRecap()` persists MVP (winning team only), per-pick KDA, win-prob swing, `perPickIds` for career stats. `computeGameRatings()` produces 1–10 match ratings used by transfer value and All-Pro.

---

## Decision-making beyond draft (franchise layer)

Season and franchise logic live in `lib/season/`. The store (`store/draftStore.ts`) drives UI; engine functions are pure.

### Season calendar (competitive structure)

Six regional leagues (**LCK, LPL, LEC, LCS, CBLOL, LCP**), 10 teams each. Fixed inter-league power order for seeding when region tides are off: LCK > LPL > LEC > LCS > CBLOL > LCP.

**Annual phase order** (`buildSeasonPhases` in `lib/season/engine.ts`):

| Phase | Event / split | Qualification feed |
|---|---|---|
| Winter split | 6 league tournaments | → First Stand (top 2 per league) |
| Transfer window | (optional) | After First Stand |
| First Stand | 12 teams, play-in for #2 seeds | Champion may add MSI slot |
| Spring split | 6 leagues | → MSI (top 3 per league) |
| Transfer window | (optional) | After MSI |
| MSI | 18 (+1) teams, Swiss + DE or play-in trim | Champion affects Worlds seeding |
| Summer split | 6 leagues | → Worlds (top 4 per league) |
| Worlds | Play-in + groups/Swiss main | World champion |
| Global Cup | Quadrennial franchise years | Top 32 global ranking (not split-fed) |

Each stage is a normal `TournamentState` — brackets, fearless series, drafts, replays, and meta snapshots reuse the tournament engine wholesale.

**Simulation controls:** `Sim Regular Season`, beside `Sim Matchday`, finishes only the remaining regular stage of the current domestic split across all regions (round-robin, groups or Swiss). It is disabled outside splits or when no regular matches remain. It never plays a playoff match; `Sim Matchday` or the full-phase action can continue into playoffs. Cancellation, player form, meta updates and the final persistence flush use the existing season simulation path.

**Completed Season Results:** champion links, placements and statistics pin team identity and hover-card rosters to that phase's tournament entrants, with `phaseRosters` as a legacy fallback. Tournament entrants are deep-cloned when created and survive SQLite/browser persistence and exports. Later transfers or renames do not change these cards. Missing historical rosters remain unavailable; the UI does not substitute current players. No database migration is needed.

**Season recap and roster digest:** Most MVPs and Rookie of the Year share a compact three-row card layout: role icon + player name (with MVP count or rating on the right), team name with logo and region, then KDA average or title counts. Most MVPs no longer shows a signature-champion icon (it did not add useful information). The roster digest defaults to all splits even after season completion, so the closing year's post-split moves remain accessible until advancing to the next year. Explicit window filters and the exclusion of prior-year offseason carry remain available.

**Match replay:** team marks in Key Events, Damage Dealt and Game MVP open the existing team cards. Recorded pentakills tint the relevant game tab gold and show a Pentakill badge, recorded player name, lane artwork and champion icon, with a matching banner in the selected game. Repeated pentakills by the same player/champion in one game share a single `Pentakill ×N` badge; different participants remain separate. Identity follows that game's sides and positional recap lanes. Older recaps without pentakill data are not inferred from kill totals; missing player names display `Unknown player`.


**Configurable league formats:** round-robin (+ optional DE / triple-elim / stepladder playoffs), groups + playoffs, Swiss (+ playoffs). Per-league playoff team count, series lengths (regular / semis / finals), double round-robin legs, true grand final, Swiss threshold mode.

**International formats** (`SeasonIntlConfig`): First Stand SE with #1 seed byes; MSI Swiss into 12-team DE with region #1 pre-qualified; Worlds play-in (6 teams) feeding groups (4×5) or Swiss main event; optional play-in toggles and series overrides.

See [`season-realism.md`](season-realism.md) for seed-bye details and UI badges (Direct to Playoffs / Pre-Qualified).

### Transfer windows

`lib/season/transfers.ts` — automatic free-agency between splits (and a heavier offseason after Worlds).

**Transfer value** blends:

```
value ≈ skill tier + W_PERF×(split grade − 5.5) + W_META×pool fit under current meta
```

- **Pool fit** uses patch-shifted meta snapshot (`SeasonMetaSnapshot`) — a star whose mains are cold on the current patch can lose a seat to an equal-tier player with S-tier comfort picks.
- **Cross-region moves** capped: S/S+ players do not auto-move abroad (`CROSS_REGION_TIER_CAP`); they can still move within region.
- Volume limited per lane per window (`MAX_MOVES_PER_LANE`, `VALUE_GAP_MIN`). Offseason window is looser (`OFFSEASON_GAP_MIN`, higher cap).

User-controlled team: interactive swap proposals in transfer UI; AI auto-resolves other teams.

### Player agency

`lib/season/playerAgency.ts` — A-tier and above (plus transfer-value floor) can **demand** moves at transfer windows and offseason.

| Demand | Trigger |
|---|---|
| **leave** | Better org / starter role elsewhere (ranked preferences) |
| **call-up** | Academy prospect wants main roster slot |
| **depart-academy** | Stuck on weak org academy |

Demands are soft-scored (org star, starter vs academy, region, vacancy bonus). User can **override** (player stays); AI auto-honors when gap is large. Caps per team and league-wide prevent roster meltdown (`AGENCY_MAX_LEAVES_*`).

### Free-agent & academy market

`lib/season/faMarket.ts` — league-wide inactive pool and roster vacancy fills.

**Player lifecycle path** (`lib/season/playerLifecycle.ts`):

```
Active starter → (underperform streak) → Academy (2–4y tenure) → FA (4y) → Retired if unsigned
```

- **Demotion checkpoints** after each split and post-Worlds offseason — not age-forced retirement.
- **Academy tenure** varies by player value (weak depth exits earlier; stars stay longer).
- **Year-end cap** on academy graduates (`ACADEMY_GRADUATE_CAP_PER_YEAR`) prevents synchronized waves.
- **Vacancy fills** prefer scored returnees over rookies; open FA replaces when roster has `__vacancy__` placeholders.
- **AI market** — mid-split academy rookies, FA signings, academy stash of desirable FAs, releases; user limits on manual FA signs and demotes.

**News feed** — every move tagged (`fa-sign`, `agency-leave`, `became-fa`, `retired`, …) for dashboard and Hall archives.

### Franchise / Realities year loop

`lib/season/franchise.ts` — multi-year timelines.

1. Play `SeasonState` year (splits + internationals).
2. `buildSeasonHistoryEntry` → Hall archive (placements, careers, transfers, meta drift).
3. Offseason: `runOffseasonLifecycle` (aging, demotions, pool drift, chemistry drift), `offseasonTransferPass`, agency expiry, coach reassignment, `createSeason` for next year with evolved rosters.
4. Optional **bulk years** (`lib/season/bulkYears.ts`) — sim N years in worker with ETA (`lib/sim/simEta.ts`) and live results feed.

Persistence: desktop SQLite normalizes realities + per-row Hall history ([`desktop-sqlite-storage.md`](desktop-sqlite-storage.md), [`performance-franchise-saves.md`](performance-franchise-saves.md)).

### Season realism flags (opt-in)

| Config flag | Behaviour |
|---|---|
| `formDrift` | Per-team hot/cold modifier from results; trending badge |
| `playerDevelopment` | Tier drift between splits (regression to mean) |
| `playerTransfers` | Transfer windows + offseason market |
| `metaAdaptability` | Patch shifts reward adaptable teams (needs `patchShift`) |
| `clutchFactor` | Elimination-round tilt + series momentum |
| `regionTides` | International results reorder inter-league seeding |
| `patchShift` | Between-phase meta nudges on tiers/synergies/counters |
| `liveMeta` | Within-event champion W/L feeds micro meta shifts |
| `variancePreset` | `chalky` / `balanced` / `chaotic` upset dial |

All map through `tagSeason` → `TournamentTeam.form` / `.clutch` → `tournamentSeriesContext` → `starRatingBias`.

---

## Competitive realism — real data & formats

### Real teams & players

| Asset | Source | Script |
|---|---|---|
| Team names + logos | LoL Esports API + bundled `realTeamNames.json` | `npm run fetch-team-logos` |
| Starter handles | Leaguepedia via `fetch-player-names` (~68%+ coverage, accumulates) | `npm run fetch-player-names` |
| Rookie / sub pool | Lane-bucketed names | `npm run fetch-rookie-names` |
| Coach names | Bundled + fetch | `npm run fetch-coaches` |

`lib/season/realTeams.ts` — live fetch walks league standings newest-first until 10 teams; bundled snapshot for offline "Real Names" button. `realPlayersForTeam()` maps handles to lanes when available; otherwise `playerNames.ts` generates position-authentic handles.

**Franchise continuity** — stable `Player.id` (`makePlayerId`) survives transfers and years; Hall aggregates by id (`lib/season/historyRecords.ts`).

### Tournament formats mirrored from pro play

| Real structure | DraftSim analogue |
|---|---|
| Fearless draft in series | `fearless` on series / season config |
| Bo1 groups, Bo3/Bo5 playoffs | `SeriesFormat` per round via `FormatOverrides` |
| Swiss + Buchholz | `swiss` format, tiebreakers in `tournament.ts` |
| Worlds play-in → groups | `createWorldsPlayIn` + `createWorldsMain` |
| MSI / Worlds region #1 byes | `swissByeTeamIds`, `firstStandUsesSeedByes` |
| First Stand #2 play-in | Six #2 seeds qualify; #1 seeds bye in |
| Groups 4×5 → 8-team bracket | Worlds groups-playoffs-de default |
| Double elim + bracket reset | `trueGrandFinal` toggle |

**Not simulated:** coin toss for side choice (app uses loser-blue or configurable `SideRule`), rematch rules beyond Swiss avoidance, and FPTV broadcast delays.

### Standings, placements & Hall

- **Live standings** — `computeStandings`, triple-elim lives, Swiss records in tournament engine.
- **Season placements** — `splitResults`, `intlResults` on `SeasonState`; derived labels in `lib/season/placements.ts` (play-ins-exit vs playoffs-exit vs finalist).
- **Hall of Seasons** — `SeasonHistoryEntry` résumés: champions, full placement arrays, All-Pro, `playerCareers`, transfer logs, phase rosters, meta start vs end, H2H matrices, dynasty tiers, rivalries. Timeline → By Season shows each archived year's Split Placements: Winter, Spring and Summer tables for every region (`LEAGUE_IDS`), with region logos and team logos resolved from the archive / bundled catalogue. Legacy archives without `splitPlacements` fall back to champion and runner-up only.
- **Career boards** — cross-season kills, MVPs, regional titles, international appearances/titles keyed by `playerId`.
- **Exports** — XLSX (`historyExport.ts`), `.draftsim-reality.json`, `REAL1:` codes ([`reality-sharing.md`](reality-sharing.md)).

### Awards & narrative

All-Pro teams, split MVPs, Rookie of the Year, S+ elites, power rankings (`lib/season/powerRankings.ts`), season story generator (`lib/season/seasonStory.ts`), team season grades from match ratings.

---

## Meta systems

Hand-curated baseline in `lib/championMeta.ts`:

- **172** champion metas with per-lane tiers `S+` … `D`
- **340+** explicit synergy pairs (`CHAMPION_SYNERGIES`)
- **250+** hard counter relationships (`lib/data/hardCounters.json`)
- **11** comp identity profiles for sim + UI scouting

### Overrides & persistence

| Mechanism | Code |
|---|---|
| Tier editor UI | `MetaOverride` map, `META1:` export |
| Synergy / counter libraries | Pairings Library UI → overrides replace defaults |
| Master toggle | `metaEnabled` — AI/sim treat all lanes as equal tier |
| Off-position fallback | `getEffectiveTier()` — median lane tier − 1 notch; unplayable → D |
| Desktop meta mirror | SQLite `meta_config` table |

### Meta randomizer

`lib/metaRandomizer.ts`:

- **Tier randomization** — per-lane bucket fill with realistic `S+/S/A/B/C/D` proportions (±25% jitter per run); off-meta baseline C/D excluded from pools.
- **Synergy / counter randomization** — plausible pair counts per archetype; can export as part of meta preset.
- **Season integration** — `patchShift` and `liveMeta` drift tiers/synergies/counters on `SeasonMetaSnapshot`; `initialMeta` vs `currentMeta` shows year drift in archives.

### Chemistry (player pairs)

Separate from champion synergies: `lib/chemistry.ts` rolls stored pair values on first roster use, plus bot-duo and same-region nudges. Drifts over franchise years (`driftSynergiesOverTime`, preseason steps). Feeds lane bias in sim only as blue−red difference.

---

## Related documentation

| Doc | Topic |
|---|---|
| [`systems.es.md`](systems.es.md) | Spanish translation of this reference |
| [`players-feature.md`](players-feature.md) | Rosters, tiers, pool fit validation |
| [`player-identity-and-franchise.md`](player-identity-and-franchise.md) | IDs, careers, realities hub |
| [`season-realism.md`](season-realism.md) | Seed byes, realism flags detail |
| [`tournament-mode.md`](tournament-mode.md) | Bracket formats, TOUR1 codes |
| [`desktop-sqlite-storage.md`](desktop-sqlite-storage.md) | DB schema, migration |
| [`performance-franchise-saves.md`](performance-franchise-saves.md) | Long-save optimizations |

## Half-star team strength

Team strength ranges from 1 to 5 in steps of 0.5. `normalizeTeamStars` centralizes rounding and `deriveStar` derives the result from the main roster. A roster of three S and two A players yields 4.5; academy players do not contribute. Team setup, random generation, current and historical cards, match context, strength rankings and market attractiveness share this contract. Classic simulation bias remains nine points per star difference; a half-star gap contributes 4.5 points before other modifiers. Both interactive and worker simulations preserve fractional values and swap them with the team when sides change.

Regional starting targets include halves without changing their aggregate target strength. Player tiers and coach ratings retain their separate scales. Integer saves remain supported and completed historical results are not recomputed. See [technical design](technical-design.md#half-star-team-strength) for the consumer audit and compatibility details.
