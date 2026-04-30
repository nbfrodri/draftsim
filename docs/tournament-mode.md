# Tournament / League Mode — Design Doc

> Status: **Phases 1-4 shipped (v1).** Planning fixed at this revision.
> Phase tracker at the bottom marks completion as features ship.

## What this feature is for

A tournament/league layer on top of the existing single-series draft + sim
flow. Lets the user run multi-team competitions with various formats,
flexible per-match configuration, and pick-ban history that can scope across
matches.

### Use cases

1. **Round-robin league** — 6 teams, each plays every other once (Bo1),
   standings table, champion crowned by record.
2. **Single-elim bracket** — 8 teams, single-elim, finals Bo5 vs cuartos
   Bo3.
3. **Esports World Cup-style** — group stage + playoffs with cross-match
   fearless.
4. **Mass simulation** — every match in AI vs AI, watch a full tournament
   spectator-mode.
5. **Mixed mode** — some matches PvP (you play), some PvAI, some AI vs AI.

---

## Design decisions

### 1. Tournament formats

Tradeoffs at a glance:

| Format | Pros | Cons | Effort |
|---|---|---|---|
| Single-elimination | Simple, universally understood, tree UI | One-loss out can punish upsets | ~1 day |
| Round-robin | Most fair for small fields; flat table | `N*(N-1)/2` matches scales fast | ~½ day |
| Double-elimination | Justifies winners more; losers' bracket | UI complexity, twice the matches | ~1.5 days |
| Swiss | Fair pairings for many teams | Pairing logic non-trivial | ~2 days |
| Groups + playoffs | LCS/LEC pro-style | Combination of round-robin + elim | ~2 days on top |

**Phase 1 ships single-elim only. Round-robin in Phase 2.**

### 2. Pick-ban history scope

Three levels, independently toggleable:

- **Per-series fearless** *(existing)* — a champ picked in game 1 of a
  series locks for game 2 of the SAME series only. Resets between matches.
- **Per-team fearless** — a champ picked by team X in any tournament match
  locks for them across the whole tournament. Each team has its own pool.
- **Tournament-wide global fearless** — any champion picked by anyone locks
  for all subsequent matches. LCK Cup style. Most punishing/creative.

**Phase 1 ships per-series fearless only. Cross-match levels in Phase 2.**

### 3. Per-match configuration

- **Uniform** — every match uses the tournament defaults. Simple.
- **Overridable** — each match can set its own format/mode/fearless before
  starting. Pro-style flexibility (`round-robin Bo1 → playoffs Bo3 → finals
  Bo5`).

**Phase 1 ships uniform with no per-match override yet. Override is Phase 2.**
The data model already supports overrides — Phase 2 just wires the UI.

### 4. Seeding

- Manual (drag/edit numeric seed)
- Random (shuffle button)
- (Future) by previous-tournament rank

**Phase 1: manual + random.**

---

## Data model

```ts
// lib/tournament.ts

export type TournamentFormat = "single-elim" | "round-robin"; // phase 2: more

export interface Team {
  id: string;       // uuid
  name: string;
  seed: number;     // 1..N, 1 = top seed
}

export interface TournamentMatch {
  id: string;
  round: number;    // bracket round 1-indexed; for round-robin = matchday
  // null when bracket position is TBD (e.g. winner of an upstream match)
  blueTeamId: string | null;
  redTeamId: string | null;
  // Per-match settings — inherit from tournament defaults at creation,
  // overridable in Phase 2.
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiSide: Side | null;
  aiDifficulty: AIDifficulty;
  // Live state — populated when the user starts the match
  series: SeriesState | null;
  // Result, set when winner is decided
  winner: {
    teamId: string;
    blueWins: number;
    redWins: number;
  } | null;
  // For elim brackets: which match this match's winner advances to.
  // Null for the final match (no destination).
  feedsInto: { matchId: string; slot: "blue" | "red" } | null;
}

export interface TournamentFearlessConfig {
  perSeries: boolean;  // default true (existing behavior)
  perTeam: boolean;    // phase 2
  global: boolean;     // phase 2
}

export interface TournamentDefaults {
  format: SeriesFormat;
  fearless: boolean;
  mode: DraftMode;
  aiDifficulty: AIDifficulty;
  timerEnabled: boolean;
}

export interface TournamentState {
  id: string;
  name: string;
  format: TournamentFormat;
  status: "setup" | "in-progress" | "complete";
  teams: Team[];
  matches: TournamentMatch[];
  fearlessConfig: TournamentFearlessConfig;
  // Cross-match aggregates — empty in Phase 1, populated in Phase 2
  teamPickHistory: Record<string, number[]>; // teamId → champion ids
  globalPickHistory: number[];
  defaults: TournamentDefaults;
  createdAt: number;
  updatedAt: number;
  // Set when a match is in progress so DraftApp routes to its series
  activeMatchId: string | null;
}
```

---

## UX flow

### Screen 1 — entry point
The current `CreateSimulationForm` becomes a chooser:
- "Single Series" (existing flow)
- "Tournament Mode" (new flow → setup screen)

### Screen 2 — Tournament Setup
- Tournament name
- Format radio (single-elim / round-robin in Phase 2)
- Team count selector (2 / 4 / 8 for elim Phase 1)
- Editable team list: name + seed input. "Random seed" button.
- Defaults section: format Bo1/3/5, fearless, mode, difficulty, timer
- "Generate Tournament" button → builds matches, transitions to dashboard

### Screen 3 — Tournament Dashboard
- Bracket view (single-elim): horizontal tree
- Match cards: round, format/mode badges, both teams, status, score
- Click pending match → "Start Match" → opens existing DraftView
- Click completed match → "View Results" → opens existing SeriesComplete recap
- Tournament status bar: champion crowned when status = complete

### Screen 4 — Match in progress
- Reuses existing `DraftView` → `BetweenGamesView` → `SeriesCompleteView`
- "Main Menu" button at end is replaced with "Back to Tournament"
- The series's blue/red team names come from the match's team data

### Screen 5 — Tournament Complete
- Champion crowning animation
- Final bracket / standings frozen
- (Phase 3) Tournament MVP, champion stats, export

---

## Integration with existing code

**Reused as-is:**
- `DraftView` / `BetweenGamesView` / `SeriesCompleteView` — agnostic of tournament context
- `simulateMatch`, `chooseAIAction`, `simulateMatch` — full simulator/AI
- Meta tier system, persistence
- `createSeries`, `recordWinner` — single-match lifecycle

**New files (Phase 1):**
- `lib/tournament.ts` — types + bracket generation + advancement (pure)
- `components/TournamentSetup.tsx` — setup screen
- `components/TournamentDashboard.tsx` — bracket / standings dashboard
- `components/BracketView.tsx` — visual bracket tree
- `components/MatchCard.tsx` — single match block (reusable)

**Modified files (Phase 1):**
- `store/draftStore.ts` — add `tournament: TournamentState | null` + actions
- `components/DraftApp.tsx` — route to tournament views when `tournament !== null`
- `components/CreateSimulationForm.tsx` — add mode toggle (Single / Tournament)
- `components/SeriesCompleteView.tsx` — when `tournament` is active, exit goes back to dashboard not main menu
- `lib/series.ts` — `recordWinner` may need to also update the parent tournament match if active

---

## Bracket generation algorithm

Standard tournament seeding for `N` teams (must be power of 2 in Phase 1):

```ts
// Returns the seed positions in bracket order.
// For 8: [1, 8, 4, 5, 3, 6, 2, 7]
// Adjacent pairs are round-1 matches:
//   (1, 8), (4, 5), (3, 6), (2, 7)
function bracketSeedOrder(n: number): number[] {
  if (n === 2) return [1, 2];
  const half = bracketSeedOrder(n / 2);
  const out: number[] = [];
  for (const seed of half) {
    out.push(seed, n + 1 - seed);
  }
  return out;
}
```

Match generation walks rounds 1..log2(N):
- Round 1: N/2 matches between adjacent seed pairs from bracket order
- Round k+1: N/2^(k+1) matches; each takes winners from two round-k matches
- `feedsInto` set on round-k matches pointing to round-(k+1)
- Final round has `feedsInto: null`

---

## Storage

Single-elim Bo5 16-team = 15 matches × up to 5 games × ~5 KB serialized = **~375 KB**. Within the ~5 MB localStorage budget comfortably.

Round-robin Bo3 8-team = 28 × ~15 KB = ~420 KB. Also fine.

Phase 4 future: if tournament *history* gets large, compress with the same `META1:` deflate-base64 pattern used for meta exports.

---

## Edge cases / open questions

| Question | Phase 1 decision |
|---|---|
| Odd team counts (with byes)? | Phase 1: powers of 2 only (2/4/8). Bye support deferred. |
| Re-seeding between rounds? | No. Seeds are fixed at creation. |
| Match dropouts / abandonment? | Persist resumes mid-tournament. No "withdraw" UI. |
| Edit bracket after creation? | No (data integrity). Reset = start over. |
| Meta tier list freeze at creation? | Yes. Tournament uses the `metaOverride` snapshot at create time. |
| Per-team AI difficulty? | No. Tournament-level default only. |
| Spectator "simulate all remaining"? | Phase 3 polish. |
| Tournament MVP / champion stats? | Phase 3 polish. |

---

## Phasing

### Phase 1 — Single-elim MVP — *✅ shipped*
- [x] `lib/tournament.ts` types + bracket-generation + advancement
- [x] Tournament state in `store/draftStore.ts`
- [x] `TournamentSetup` component (manual seed, default config, format/fearless/mode/difficulty)
- [x] `TournamentDashboard` + bracket view + match cards (consolidated in dashboard file)
- [x] Match flow integration: start match → existing draft flow → result returns to dashboard
- [x] Entry-mode chooser: Single Series / Tournament (in `DraftApp` rather than form)
- [x] `SeriesCompleteView` "Back to Tournament" exit when tournament is active
- [x] Persistence (tournament added to `partialize`, persist version bumped to 3)
- Per-series fearless only (existing). No cross-match.
- Powers of 2 only (2/4/8 teams). No byes.
- Uniform per-match config (no per-match override).

### Phase 2 — Round-robin + cross-match fearless — *✅ shipped (except byes)*
- [x] Round-robin format + standings table (W / L / +-, head-to-head + game diff tiebreakers)
- [x] Per-team fearless — each team can't reuse their tournament picks
- [x] Global fearless toggle — any pick locks for the entire tournament
- [x] Per-match config override UI (modal before "Start Match")
- [x] Meta access (TierList / Synergies / Editor) shared between single-series + tournament setup via `MetaPanel`
- [ ] Bye support for non-power-of-2 elim brackets — *deferred to Phase 3*

### Phase 3 — Polish — *✅ shipped*
- [x] Bye support for non-power-of-2 elim brackets (carried over from Phase 2)
- [x] Tournament MVP card (aggregated from match recaps)
- [x] Champion stats table (most picked / banned / win rate)
- [x] Export tournament code (`TOUR1:` deflate-base64 format)
- [x] Responsive bracket on mobile (horizontal scroll)
- [x] Champion-crown GSAP animation when tournament completes
- [x] "Simulate all remaining" button for spectator mode (auto-plays
      every pending match in AI vs AI, runs the full draft + sim pipeline)
- [x] Team star rating (1-5) — biases per-game win probability so stronger
      rosters favor in head-to-head
- [x] Tournament champion WR tracking + AI meta shift — observed per-
      champion WR feeds the AI scoring with Bayesian shrinkage so the
      in-tournament meta evolves as matches resolve. Live panel surfaces
      the shift on the dashboard
- Mobile collapsible round groups deferred — horizontal scroll covers
  the typical 8-team / 5-round layout cleanly enough.

### Phase 4 — *✅ shipped (v1)*
- [x] Double-elimination — winners + losers brackets, losers-side drop-
      down advancement, grand final. Powers of 2 ≥ 4 (4/8/16-team UI
      verified). Stacked W/L panels in the dashboard.
- [x] Bracket reset for double-elim grand final — when the L-bracket
      champion wins the first grand final, a reset match is dynamically
      generated and decides the tournament.
- [x] Swiss system — round 1 pairs by seed; subsequent rounds pair by
      record (greedy avoid-rematches), `ceil(log₂(N))` rounds total.
      Standings include strength-of-schedule. v1 requires even N.
- [x] Groups + playoffs — round-robin group stage; user-triggered
      promotion to a single-elim playoff with the top-N standings as
      seeds (default top 4).
- [x] Multi-tournament history view — completed tournaments archived to
      a persisted history list (cap 20). Entry-menu button opens a list
      with re-open / delete / clear-all.
- [x] Per-team AI difficulty inside tournament context — each team can
      override the tournament-default difficulty via a chip in setup.
- [x] Re-seeding between rounds (single-elim) — opt-in toggle that
      re-pairs each round so the highest-seeded survivor faces the
      lowest. Cosmetic when chalk holds; meaningful on upsets.
- [x] Match replay viewer — completed match cards become clickable
      post-tournament; opens a per-game modal with picks, bans, recap.
- [x] Champion search + team-pick breakdown in post-tournament recap.

### Phase 5 — Future
- Bracket reset for the double-elim "true" grand final convention
  (W-side requires only one win to take the title; right now the reset
  is mandatory whenever L-side wins game one — already standard but
  some pro circuits play different conventions).
- Swiss tiebreaker upgrades (Buchholz, Median Buchholz).
- Double-elim 32-team UI tuning.
