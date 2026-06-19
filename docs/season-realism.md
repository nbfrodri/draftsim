# Season Realism & Seed-Bye Formats — Design Doc

> Status: **Shipped.** Everything below is implemented, type-checked, and
> covered by tests (`lib/season/season.test.ts`, `lib/series.test.ts`,
> `lib/tournament.test.ts`, `lib/season/history.test.ts`).

This doc covers two batches of work layered on top of
[Tournament / League Mode](./tournament-mode.md):

1. **Seed-bye formats** — region #1 seeds earn a structural advantage at
   internationals (skip the group stage / play-in).
2. **Season realism** — opt-in systems that make team strength, the meta,
   and regional pecking order move over the year instead of being static.

Every realism system is **off by default**. With all flags off the engine
behaves and serializes byte-identically to before, so old saves load
unchanged.

---

## Part 1 — Seed-bye formats

### Worlds: Groups + DE, every team plays the group stage

When Worlds runs the **Groups + DE** format (`groups-playoffs-de`), **all
qualified teams play the group stage** — there are no seed-stage byes.
Canonical shape: the 18 direct seeds (seeds 1–3 of every league, +1 for an
additive MSI champion) plus the **2 play-in finalists** make a 20-team field,
split into **4 equal groups of 5**; the **top 2 of each group** advance into
the 8-team double-elim playoff bracket. "Surviving your group" cleanly means
"you made playoffs."

> **History:** an earlier version byed each region's #1 seed straight into the
> playoff bracket (mirroring the MSI swiss-bye). That was removed because it
> clashes with a groups format — some bracket spots came from byes and some
> from the groups, so the playoff field was a confusing hybrid. The
> `groupsByeTeamIds` plumbing still exists on `TournamentState` /
> `CreateTournamentParams` for potential reuse, but the engine no longer sets
> it for Worlds.

- `lib/season/engine.ts` — `createWorldsMain` builds the full group field and
  defers group sizing to `intlFormatParams` (4 groups, advancing sized from
  `playoffTeams`). The default-2 play-in advancing still auto-reduces to keep
  the four groups equal when an additive MSI champion would break divisibility.

### First Stand: #2 seeds play a qualifier, #1 seeds bye in

A 12-team single-elim First Stand (6 region #1 seeds, 6 #2 seeds) now opens
with a **play-in**: the six **#2 seeds** play a qualifier, the six **#1
seeds** bye straight into the main 8-team single-elim bracket alongside the 2
play-in finalists.

- Reuses the Worlds/MSI play-in lifecycle (`startPhase` →
  `applyTournamentUpdate` spawns the main event when the play-in completes).
- The play-in bracket format is **configurable: SE or DE**
  (`cfg.playInFormat`), and the structure can be toggled off entirely
  (`playInEnabled: false` → plain 12-team single-elim).
- `lib/season/engine.ts` — `firstStandUsesSeedByes`,
  `createFirstStandPlayIn`, `createFirstStandMain`.

### "Direct to Playoffs" badge

Seed-bye teams aren't in any group/qualifier, so they'd otherwise be
invisible while the stage plays out. A reusable `DirectQualifierBadge`
(⚡ Direct) plus a "Direct to Playoffs" panel surfaces them in the groups
view, and the same badge was added to the existing swiss "Pre-Qualified"
panel (MSI #1 seeds) for consistency.

- `components/QualifierBadge.tsx`,
  `components/tournament/bracket/FormatViews.tsx`.

---

## Part 2 — Season realism

All systems are opt-in `SeasonConfig` flags, surfaced as toggles in the
Season Options bar (`components/SeasonSetup.tsx`). Dynamic state lives as
**optional maps on `SeasonState`** (absent unless the feature is on), so
default seasons serialize unchanged.

| Flag | Name in UI | What it does |
|---|---|---|
| `formDrift` | Team Form | Hot/cold strength modifier driven by results, shown as a trending tier badge |
| `playerDevelopment` | Player Dev | Player tiers drift between splits (regression to the mean) |
| `metaAdaptability` | Meta Adapt | Patch shifts reward adaptable teams, punish rigid ones |
| `clutchFactor` | Clutch | Elimination-round tilt + within-series momentum |
| `regionTides` | Region Tides | Region strength reorders inter-league seeding (anchored to the fixed ranking) |
| `patchShift` | Patch Shifts | (existing) Gentle between-split meta patch — now tuned subtle |

### Shared plumbing

Per-team modifiers flow:

```
season maps → tagSeason → TournamentTeam.form/.clutch
            → tournamentSeriesContext → SeriesState → starRatingBias
```

`starRatingBias` (`lib/series.ts`) is the single choke point where star
rating, win streaks, form, clutch, and momentum combine into the simulator's
score-diff bias. New `SeriesState` fields: `blueForm`/`redForm`,
`blueClutch`/`redClutch` (all optional → classic model untouched when
absent).

### A — Team Form (`formDrift`)

A hidden signed modifier per team in `[-1, 1]`, stored in
`season.teamForm`.

- After every completed tournament, each participant's form **decays toward
  0** and is **nudged by finish-vs-seed**: outperforming the seed warms a
  team up, underperforming cools it down (`updateFormFromTournament`).
- Decay = regression to the roster baseline, so form is self-correcting.
- Feeds `starRatingBias` (±1 ≈ ±0.3★) and a **trending tier badge**
  (`TeamFormBadge`: ▲ emerald / ▼ red with the tier letter) in the
  SeasonDashboard standings.

### B — Player Development (`playerDevelopment`)

Between splits, individual player **tiers drift one step**
(`applyPlayerDevelopment`, run as each split phase completes):

- Lower tiers trend up, peaked (S/A) regress down — regression to the mean.
- Recent team form tilts the odds (good form → likelier to improve).
- Star ratings follow automatically via `deriveStar`, so the change shows up
  in the next event's seeding and sim.

### D — Meta Adaptability (`metaAdaptability`)

Each team carries a stable hidden adaptability trait in `[-1, 1]`
(`season.teamAdaptability`, seeded deterministically at season creation). On
each between-phase **patch shift**, adaptability converts into a one-off
**form swing** (`applyMetaAdaptability`) — adaptable teams warm up, rigid
teams cool down. Reuses the form channel, so it composes with A and shows on
the same badge. Only meaningful with `patchShift` on.

### E — Clutch & Momentum (`clutchFactor`)

- **Clutch:** a stable hidden trait in `[-1, 1]` (`season.teamClutch`) that
  tilts win probability **only in elimination rounds** (quarterfinal →
  final), layered on top of the existing finals-only underdog protection.
- **Within-series momentum:** the side currently ahead in a series gets a
  small, capped per-game-lead bump (winning game 1 of a Bo5 → slightly
  favored in game 2). Gated on the clutch trait being present.

### F — Region Tides (`regionTides`)

Per-league strength score (`season.leagueStrength`) updated after each
international (`updateLeagueStrength`): regions whose teams place well rise,
floppers fall, decayed toward neutral over time.

**Anchored to the fixed ranking.** Inter-league seeding always starts from
the canonical **LCK > LPL > LEC > LCS > CBLOL > LCP** prestige order; the
tide is *added* to that baseline (`leagueSeedScore`), never replaces it. A
region only climbs past another when its tide advantage exceeds the prestige
gap (`REGION_PRESTIGE_STEP = 0.6`). So the canonical order is the default,
and only sustained over/under-performance reshuffles it.

**Cross-season carryover.** Region reputation persists across years via the
Hall of Seasons:

- The archived `SeasonHistoryEntry` stores the evolved end-of-season
  `leagueStrength`.
- A new season seeds its tides from the prior season
  (`regionStrengthSeed`), **decayed 50%** (`CARRYOVER_DECAY`) toward
  neutral. If the prior entry has no recorded tide (older/imported history),
  it falls back to a **champion-region reputation** (Worlds winner's region
  +0.5, MSI +0.3, First Stand +0.15).
- `startSeason` passes the most recent completed season (the just-finished
  one in memory, else the latest archived entry — survives reloads).

### M — Subtle meta shifts between splits (`patchShift`)

The existing patch-shift system, tuned to be gentle: `applyPatchShift` is now
parameterized by a `fraction`, and the engine calls it between phases with a
subtle `PATCH_SHIFT_FRACTION = 0.08` — like real LoL patches, the competitive
meta moves a little each split, not a teardown. (This is what D's
adaptability reacts to.)

---

## Part 3 — Variance, rankings & storytelling

A later batch layered three more systems on top, plus a planned-only design.

### G — Match Variance preset (`variancePreset`)

A single **Off · Chalky · Balanced · Chaotic** dial (Season Options bar) over
how often the better team actually wins. Plumbed through the one
`starRatingBias` choke point (`lib/series.ts`) and applied to **every game of
every series**; absent ⇒ classic model, byte-identical. Three levers, all
keyed to the one preset:

- **Bias scaling** (`BIAS_SCALE`) — multiplies the star-rating edge. Chalky
  ×1.25 (favorites dominate), Chaotic ×0.75 (the rating gap matters less).
- **Deciding-game coin-flippiness** (`DECIDER_DAMPEN`) — on a series decider
  (Bo5 at 2-2, Bo3 at 1-1, any Bo1) the whole bias is pulled toward 50/50, so
  game 5s and reverse sweeps become real.
- **Favorites choking under elimination** (`CHOKE_FLAT`) — in a knockout round,
  when the higher-rated side is one loss from elimination, a flat nudge shifts
  to the underdog. Generalizes the finals-only `UNDERDOG_FLAT`.

Plumbing: `SeasonConfig.variancePreset` → `TournamentState.variancePreset`
(set in every engine `createTournament` call) → `tournamentSeriesContext` →
`SeriesState.variancePreset` → `starRatingBias`.

### H — Power Rankings (always-on UI)

A derived, **pure-UI** board (`lib/season/powerRankings.ts`,
`computePowerRankings`) shown in the SeasonDashboard. Ranks every team by a
blend of roster strength (`deriveStar`), current form (`teamForm`), most recent
event finish (walks `phases` newest-first for the team's last completed
tournament), and a **light meta-fit** (each player's `goodChamps` tiers under
`season.currentMeta`). Adds ▲/▼ trend glyphs and *Team of the Split / Riser /
Faller* tags. No persisted state — works with every realism flag off (form
terms read 0).

### I — Per-season Story recap (`story` on `SeasonHistoryEntry`)

A deterministic, **templated** narrative (`lib/season/seasonStory.ts`,
`buildSeasonStory`) computed at archive time from the full `SeasonState`:
champion + runner-up, **biggest upset** (largest star-gap a winner overcame,
scanned across every tournament's matches), **team of the year** (most weighted
titles), **region that rose** (top `leagueStrength`, else most intl titles),
and the **meta arc** (biggest champion-lane tier swing start→finish). Stored as
optional `story` on the archive entry (older entries omit it) and rendered by a
shared `components/SeasonStoryCard` at season end (live) and in the Hall of
Seasons timeline.

### J — Regional playstyle identities (`regionIdentity`) — *design only, not built*

The idea: give each league a **meta lean** (early-game vs scaling) that
interacts with the champion tier table, so a patch can structurally favor a
region's style — a *cause* for Region Tides (F) instead of an abstract score.

Existing hooks to build on:

- `lib/championMeta.ts` — every champion already carries a `phase`
  (`early`/`mid`/`mid-late`/`late`) and `archetypes`, plus per-lane `metaTiers`.
- `applyPatchShift` (`lib/season/engine.ts`) already nudges ~8% of
  (champion, lane) tiers each phase — the natural place to *bias* moves toward
  a region's favored phase/archetypes.
- Region Tides (`leagueStrength`, `leagueSeedScore`) already exists to receive
  the downstream effect.

Sketch: store `regionIdentity?: Record<LeagueId, "early" | "scaling" |
"balanced">` seeded at season start; on a patch shift that happens to favor a
phase, teams from the matching region get a one-off **form swing** (reuse the
`applyMetaAdaptability` channel). Closes the loop: region good at a style →
patches favoring that style → region climbs the tides → better seeding.

---

## Tuning reference

All levers are named constants — easy to adjust.

**`lib/series.ts`**

| Constant | Value | Meaning |
|---|---|---|
| `STAR_RATING_BIAS_K` | 9.0 | score points per star of rating gap |
| `WIN_STREAK_BIAS_K` / `_CAP` | 1.5 / 6.0 | per-result streak bonus, capped |
| `FORM_BIAS_K` | 3.0 | form ±1 → ±3 points (≈ ±0.3★) |
| `CLUTCH_BIAS_K` | 3.0 | clutch ±1 in elimination rounds |
| `MOMENTUM_BIAS_K` / `_CAP` | 1.2 / 3.0 | per-game series-lead bump, capped |
| `BIAS_SCALE` | 1.25 / 1.0 / 0.75 | star-bias multiplier (chalky / balanced / chaotic) |
| `DECIDER_DAMPEN` | 1.0 / 0.8 / 0.6 | decider-game flattening (chalky / balanced / chaotic) |
| `CHOKE_FLAT` | 0.0 / 1.5 / 2.5 | favorite-on-the-brink underdog nudge |

**`lib/season/engine.ts`**

| Constant | Value | Meaning |
|---|---|---|
| `FORM_DECAY` / `FORM_LEARN` | 0.6 / 0.5 | form regression / learning rate |
| `ADAPT_FORM_SWING` | 0.25 | form delta per adaptability unit on a patch |
| `DEV_RATE` | 0.16 | per-player tier-drift chance each split |
| `DEV_REGRESS` / `DEV_FORM` | 0.18 / 0.22 | regression / form bias on drift direction |
| `LEAGUE_STRENGTH_DECAY` | 0.5 | region tide fade toward neutral |
| `PATCH_SHIFT_FRACTION` | 0.08 | share of tiers a between-split patch nudges |
| `REGION_PRESTIGE_STEP` | 0.6 | prestige gap a tide must beat to climb a spot |
| `CARRYOVER_DECAY` | 0.5 | fraction of last year's tide carried forward |

---

## State & serialization

New optional fields (all absent unless the relevant feature ran):

- `SeasonState`: `teamForm`, `teamClutch`, `teamAdaptability`,
  `leagueStrength`.
- `SeasonConfig`: `variancePreset`.
- `TournamentTeam`: `form`, `clutch`. `TournamentState`: `groupsByeTeamIds`,
  `variancePreset`.
- `SeriesState`: `blueForm`/`redForm`, `blueClutch`/`redClutch`,
  `variancePreset`.
- `SeasonHistoryEntry`: `leagueStrength`, `story`.

Traits (clutch, adaptability) are seeded deterministically from a hash of the
team id (FNV-1a), so they're stable across reloads without persisting a seed.

---

## Future ideas — more realism

Roughly ordered by impact-to-effort. Several are now **✅ Shipped** (see
Part 3); the rest remain open.

### Teams & players

1. **Player age / career arc.** Give players a hidden age + peak so
   development isn't pure tier regression: rookies rise for a few years, vets
   decline, prime players plateau. Makes "young team improving" a real arc
   rather than RNG. (B already leaves a clean hook.)
2. **Off-season transfers.** Between seasons, shuffle a few top players
   between teams (strong regions get raided, weak teams rebuild). Prevents
   the same rosters dominating every year and creates super-team narratives.
   Hooks into `startSeason` alongside the region-tide carryover.
3. **Per-player champion-pool depth.** Tie a player's `goodChamps`/`badChamps`
   to the live meta so a patch can buff/nerf a star's comfort picks —
   adaptability becomes about *which* champions a roster mains, not an
   abstract trait.
4. **Synergy / chemistry.** A roster that stays together gains a small
   stacking bonus; a freshly-rebuilt roster starts cold and warms up over a
   split. Pairs naturally with transfers (2).
5. **Coaching / drafting identity per team.** Persist a draft personality per
   team across the season (already partly modeled) and let it *evolve* —
   teams that lose adapt their style.

### Competition & variance

6. **✅ Shipped (Part 3 G).** Best-of variance / reverse sweeps — deciding
   games (Bo5 game 5, Bo3 game 3) are now coin-flippier via the Match Variance
   preset's `DECIDER_DAMPEN`.
7. **Home / crowd advantage.** A small bias for the host region's teams at an
   international, or for the higher seed in a fixed-venue final.
8. **Patch-timing mismatches.** Some teams "read the patch" faster — a region
   or team gets a temporary boost in the first event after a big shift, fading
   as others catch up. A richer version of D.
9. **✅ Shipped (Part 3 G).** Favorites choking — `CHOKE_FLAT` raises upset
   odds when a heavy favorite faces elimination in a knockout round.

### Regions & meta

10. **📐 Designed (Part 3 J), not built.** Regional playstyle identities —
    each league gets a meta lean (early-game vs scaling) interacting with the
    champion tier table, a structural reason for region tides.
11. **Import slots / inter-region talent flow.** Let strong regions export
    players to weaker ones, slowly lifting the weak region's ceiling (a
    long-horizon counter-force to the prestige anchor).
12. **Meta archetypes instead of flat tiers.** Track comp archetypes
    (poke, dive, teamfight) rising/falling with patches, and let team/roster
    fit decide draft strength — deeper than per-champion tiers.
13. **✅ Shipped (Part 3 H).** Narrative power rankings — a SeasonDashboard
    board blending form + results + light meta-fit, with team-of-the-split /
    riser / faller callouts.

### Infrastructure

14. **✅ Shipped.** Season-over-season records (dynasties, droughts, region
    rise/fall, player titles) live in `historyRecords.ts` / the "Records &
    Dynasties" tab; the per-season narrative **Story recap** is Part 3 I.
15. **✅ Shipped (Part 3 G).** Difficulty/variance presets — the Match Variance
    preset bundles the variance constants into chalky / balanced / chaotic.
