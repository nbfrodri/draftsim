# DraftSim

A **League of Legends** tournament draft simulator with a strategic AI drafter
and a full match simulator. Pick / ban a Bo1, Bo3, or Bo5 series, draft against
the AI (or watch AI vs AI), then watch the match play out as a live timeline
of events with KDA, gold, and a win-probability curve — finishing with an MVP
card, a damage-share breakdown, and a per-game series recap.

> Hobby / portfolio project. No affiliation with Riot Games.

---

## What's interesting about this

It's not just a draft tool. The simulator runs an event-driven match (kills,
ganks, drakes, baron, soul, elder, ace, shutdowns, power-spikes, etc.), and
the AI's pick logic factors in identity targeting, lane prio, lookahead,
opponent anticipation, series-state awareness, and side-aware drafting.

- **300+ curated champion synergies + 250+ counter-pick relationships**, all
  hand-tagged from 2024–2026 patches.
- **172 champions** with archetype, phase, mobility, CC, and per-lane meta tier.
- **11 comp identity profiles** with win condition, weakness, peak window, and
  a vs-matrix against every other identity.
- The AI plays differently depending on **difficulty**, **side** (blue =
  power-pick / red = counter-pick), **series score** (losing teams favor meta;
  elimination games drop the "save for later" penalty), and **what the opponent
  ran in prior games** (cross-game adaptation: ban into their last identity,
  pick disengage after they ran wombo).
- Match simulator events fire with **kill-driven lane gold** (an 8/0 mid actually
  out-golds their lane opponent), **role-shaped KDA attribution** (supports
  rarely get kills, mostly assists; ADCs carry kill share but die more),
  **synthetic damage profile** that powers the post-game damage-share bars,
  and **synthesized audio cues** keyed to event severity.

---

## Features

### Draft

- Standard LoL tournament draft order (20 actions: 6 bans → 6 picks → 4 bans → 4 picks).
- **Bo1 / Bo3 / Bo5** with correct win thresholds and side-swap-proof scoring.
- **Fearless Draft** — picks are locked out across games. Bans reset.
- **30s action timer** (toggleable). Bans skip on timeout; picks random-fill.
- **Three modes:** P-vs-P, P-vs-AI, AI-vs-AI.
- **Three AI difficulties:** Easy / Normal / Hard (different sampling temperature,
  lookahead depth, and feature set).

### AI drafter

The AI scores every legal candidate using ~30 weighted signals and samples from
the top-N. Notable strategic features:

- **Identity targeting** — locks onto a comp shape (Wombo, Pick, Dive, Protect,
  Splitpush, etc.) once 2+ picks are committed and rewards completion.
- **Lookahead** — 1-ply for Normal, 2-ply (predict enemy response *and* our
  follow-up) for Hard.
- **Anticipation** — predicts which champions the enemy is likely to pick, used
  for ban targeting.
- **Lane matchup awareness** — 250+ counter-pick relationships factor into the
  candidate's lane fit; magnitude scales with last-pick info advantage.
- **Side-aware drafting** — Blue first-picks favor flex / multi-lane and S+
  meta tier (counter-resistant). Red picks weight matchup edge harder; R5
  amplifies counter signal and refuses to pick into a hard lane counter.
- **Series-state awareness** — when behind, prioritize meta-tier picks.
  Elimination / closeout games drop the "save for later" S+ penalty.
- **Cross-game adaptation** — reads opponent's prior-game identities, banks bans
  on their enabler archetypes, picks counter archetypes against them.
- **Pocket picks** — small randomization budget so the AI sometimes surprises.
- **Rationale UI** — every AI decision surfaces a labeled score breakdown in
  real time + a top-3 alternatives list.

### Match simulator

- **Event-driven timeline** of ~30 event types (level-1 invade, scuttle, gank,
  counter-gank, plates, drake, herald, grubs, atakhan, soul, baron, elder,
  teamfight, skirmish, pick, vision, outplay, objective-trade, wave-crash,
  power-spike, ace, shutdown, backdoor, nexus, etc.).
- **Per-champion KDA** with role-shaped attribution (carries score kills,
  supports score assists, ADCs die more).
- **Kill-driven lane gold** — each event's `kdaDelta` flows into per-lane gold
  via `kdaToLaneGold` (300g/kill, 100g/assist), so an 8/0 lane is visibly ahead.
- **Power-spike events** fire when a key carry hits their first major item (read
  from `championBuilds.ts` build paths).
- **Combat resolution** uses per-champion damage / EHP estimated from item
  builds, archetype, and meta tier — the closing fight outcome emerges from
  state, not from a pre-decided winner.
- **Identity multipliers** — Wombo amped by no-disengage enemies, Dive amped
  vs unprotected carries, Tank Stack walls mono-damage comps, etc.
- **Comeback mechanics** — momentum, shutdowns, baron-pivot, atakhan effects
  (Voracious +20% kill gold, Ruinous one-shot revive).

### Post-match

- **Live win-probability sparkline** (Recharts) — smooth area chart with
  side-tinted gradients, ReferenceDots at game-defining events, custom
  hover tooltip, and **side-aware Y-axis** (top half labeled in blue from
  blue's perspective; bottom half in red from red's perspective — never any
  negative percentages).
- **Lane Gold strip** with KDA per champion and event-flash highlights when
  the latest event involves them (kill = side glow, death = red, objective = gold).
- **MVP card** — composite score (`K + 0.7·A − 0.5·D + (laneGoldDiff/1000) +
  winnerBonus`). Lane gold diff is signed from each player's perspective so the
  metric is additive merit, not side-bias. Always shows the underdog if they
  outperform.
- **Damage-share bars** per champion (synthetic damage from KDA × archetype
  damage profile).
- **Team Comparison panel** — single tug-of-war view replacing the old dual
  cards. Each metric anchors at center and pulls toward the stronger team.
  Includes per-side **Scouting Report** (playstyle / win condition / weakness)
  and an **Identity Matchup** verdict (e.g. "Pick Comp hard-counters Protect
  The Carry").
- **End-of-series narrative recap** — synthesizes a 1–3 line storyline per
  game from the persisted MVP + biggest win-prob swing.

### Meta tier list

- **Custom tier editor** with drag-and-drop tiering per role.
- **Export / Import** as opaque base64-encoded codes (`META1:...`) — deflate-
  compressed, ~50% smaller than raw JSON, URL-safe. Backward-compatible: import
  also accepts raw JSON.
- **Randomize meta** — generates a plausible randomized tier list with
  per-role distributions matching real meta shape.
- Master toggle to disable the meta tier system entirely (AI / sim treat all
  champions as equivalent in their playable lanes).

### Persistence

- **Active series survives reload** via Zustand `persist` middleware
  (`localStorage`). Sound preferences (enabled / volume) and the per-game AI
  rationale history also persist.
- Champions roster is **not** persisted — re-fetched fresh from CommunityDragon
  on each load so icon URLs and patch-shipped meta tiers stay current.
- Custom meta override + meta-source preference are persisted independently.

### Sound

- Real Riot champ-select SFX (lock-in, ban, button click, timer tick) sourced
  from CommunityDragon.
- **Synthesized event blips** during match playback — three severities (minor /
  mid / major) rendered via WebAudio. Major events (soul, baron, elder, ace,
  shutdown, backdoor, nexus) play a staggered A-major chord; mid (drake / tower
  / teamfight) gets a higher single tone; minor (kills / plates / scuttle / etc.)
  a soft blip.
- Single mute toggle in the draft header. Volume slider via `setVolume`.
- Safari/iOS silently no-op for `.ogg` (Vorbis) and may delay AudioContext start
  until first user gesture — the code handles both gracefully.

### UX

- Fully responsive (mobile / desktop).
- GSAP-animated lock-ins, draft-phase transitions, and series-complete reveal.
- Rift-themed visual language: gold ornate corners, diamond score pips,
  side-colored glows, and a scrolling rune grid backdrop.
- All event icons are **Tabler Icons** for visual consistency.
- A11y: `role="status"` for phase banner, `role="dialog"` + focus trap on the
  confirm modal, `aria-label` on all interactive controls.

---

## Tech stack

- **Next.js 16** (App Router + Turbopack, daily ISR for the champion roster)
- **React 19** + **TypeScript 5.7** strict
- **Tailwind CSS 3.4**
- **Zustand 5** with `persist` middleware (state + localStorage hydration)
- **Recharts 3** (win-probability chart)
- **Tabler Icons React** (event iconography)
- **GSAP 3.12** (animations)
- **tsx** (running the calibration script as TypeScript)
- **Vitest** (unit-test scaffold; light coverage)

---

## Architecture

```
draftsim/
├── app/
│   ├── layout.tsx                fonts (Cinzel + Inter), metadata
│   ├── page.tsx                  server component — fetches champions
│   ├── error.tsx                 graceful boundary for data-fetch failures
│   └── globals.css               theme, slot frames, keyframes (event-flash, etc.)
├── lib/
│   ├── types.ts                  Side / Lane / Champion / GameDraft / SeriesState / GameRecap
│   ├── draftOrder.ts             20-action DRAFT_ORDER constant + phase labels
│   ├── draftEngine.ts            applyLock / applyTimeout / role assignment / swap
│   ├── series.ts                 series lifecycle + fearless pool + score-by-name
│   ├── lanes.ts                  Lane labels + Meraki-to-Lane map
│   ├── sounds.ts                 SFX (CDragon URLs + WebAudio synthesis)
│   ├── communityDragon.ts        parallel CDragon + Meraki fetch + pending-release injection
│   ├── championMeta.ts           172 champion metas, 340+ synergies, meta override persistence
│   ├── championAbilities.ts      ability lockdown profiles
│   ├── championBuilds.ts         archetype build paths + key-spike helper
│   ├── matchSimulator.ts         orchestrator — event timeline + combat resolution
│   ├── metaRandomizer.ts         randomize-meta + localStorage helpers for the override
│   ├── draftAI/
│   │   ├── index.ts              chooseAIAction + chooseAIActionWithRationale + SeriesAIContext
│   │   ├── scoring.ts            scorePick / scoreBan + counter/enabler tables
│   │   ├── helpers.ts            stateless helpers (laneMatchup, identityTarget, etc.)
│   │   ├── anticipation.ts       1-ply / 2-ply lookahead + enemy prediction
│   │   ├── data.ts               250+ HARD_COUNTERS + IDENTITIES + sampling constants
│   │   └── __tests__/            vitest scaffold (helpers.test.ts)
│   ├── sim/
│   │   ├── descriptions.ts       event flavor + KDA helpers + damage-share weights
│   │   ├── identities.ts         11 IDENTITY_PROFILES + identityMatchupEdge
│   │   ├── identitiesTypes.ts    GameDuration + IdentityVsIdentity types
│   │   └── types.ts              EventType / MatchEvent / EventKDA / SimulationResult
│   └── data/
│       ├── abilities.json        Meraki-derived ability data
│       └── items.json            Meraki item stats
├── store/
│   └── draftStore.ts             single Zustand store w/ persist middleware
├── components/
│   ├── DraftApp.tsx              view router based on series.status
│   ├── CreateSimulationForm.tsx
│   ├── DraftView.tsx             draft layout
│   ├── DraftHeader.tsx
│   ├── TeamPanel.tsx
│   ├── ChampionGrid.tsx
│   ├── BetweenGamesView.tsx      live match playback + post-match cards
│   ├── SeriesCompleteView.tsx    final recap + per-game card + series narrative
│   ├── AIRationalePanel.tsx      score breakdown overlay during AI turns
│   ├── AIRationaleHistory.tsx    post-draft AI decisions recap
│   ├── MetaEditor.tsx            tier list editor + export/import
│   ├── TierListView.tsx
│   ├── SynergyView.tsx
│   ├── EventIcon.tsx             event → Tabler icon mapping
│   ├── LaneIcon.tsx
│   └── Modal.tsx                 portal-based confirm dialog
├── scripts/
│   ├── refresh-meraki-data.mjs   pulls latest Meraki ability + item data
│   └── calibrate.ts              runs N drafts × M sims, reports
│                                 correlation between TeamScore and win rate
└── package.json
```

### Data flow

1. `app/page.tsx` (server component) fetches champions + lanes from
   CommunityDragon + Meraki at build / daily ISR. Pending-release champions
   not yet shipped by CDragon (e.g., Zaahen post-25.23) are injected from a
   local fallback table with placeholder icons.
2. `<DraftApp>` populates the Zustand store and routes between four views
   based on `series.status` (`null` / `drafting` / `between-games` / `complete`).
3. All draft + series state transitions go through the store. Pure logic lives
   in `lib/draftEngine.ts` and `lib/series.ts` (framework-free, testable).
4. AI decisions: `chooseAIActionWithRationale(game, champions, fearlessLocked,
   seriesCtx)` → samples from `scorePick` / `scoreBan` top-N. Lookahead and
   anticipation are gated by difficulty.
5. Match simulation: `simulateMatch(game, champions)` runs the event timeline
   generator, with per-event side rolls weighted by composition diff,
   accumulated gold lead, momentum, objective state, and lane priority bias.
6. `buildGameRecap(game, champions, result)` extracts a compact MVP + biggest-
   swing summary that gets persisted on the GameDraft when the simulation
   winner is applied. The series-complete view reads it for the narrative.

### Key design decisions

- **Pure-function core.** Everything in `lib/` is framework-free. The AI
  scoring, simulator, draft engine, and series logic have no React/DOM
  dependencies and are unit-testable with any runner.
- **Single Zustand store with persist.** All UI state in one place; series +
  sound prefs hydrate from localStorage; champions and ephemeral UI state
  reset on reload.
- **Score by team name, not by side.** `seriesScore()` aggregates wins via
  team name so side swaps between games don't split a team's wins.
- **Draft-order vs positional-order picks.** During draft, picks are indexed
  by lock-in order. On game completion, picks are reordered into positional
  order (`[0]` top → `[4]` support) and `blueRoles` is frozen — makes the
  recap readable and lets the swap UI exchange champions between role slots.
- **Identity-driven scoring.** The AI doesn't optimize a single objective;
  it sees the team converging toward a comp identity (e.g., Wombo) and
  rewards picks that complete it. Encoded as the `IDENTITIES` trigger →
  `needed` archetype table.
- **Modal via React portal.** Escapes the header's `backdrop-filter`
  containing block so the modal can `fixed inset-0` over the viewport.

---

## Running locally

Prerequisites: **Node 20+** and **npm 10+**.

```bash
npm install
npm run dev        # http://localhost:3000 — Turbopack
```

Production:

```bash
npm run build
npm start
```

### Known build warning

```
Failed to set Next.js data cache for https://cdn.merakianalytics.com/...
items over 2MB can not be cached (~17 MB)
```

Meraki's `champions.json` exceeds Next's 2 MB data-cache limit. Cosmetic — `/`
is statically prerendered with daily ISR, so Meraki is fetched at most once
per server instance per day; it just isn't stored in the cross-request cache.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Turbopack dev server at `http://localhost:3000` |
| `npm run build` | Production build (static prerender) |
| `npm start` | Serve the production build |
| `npm run lint` | Next.js ESLint |
| `npm run test` | Vitest |
| `npm run refresh-data` | Pull latest Meraki ability + item data into `lib/data/*.json` |
| `npm run calibrate` | Run N random drafts × M sims, report correlation between TeamScore.diff and actual blue win rate, plus per-component leave-one-out analysis. Tweak via `CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40`. |

---

## Data sources

| Source | Purpose |
|---|---|
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json) | Champion roster, aliases, class tags, icon URLs |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/) | Draft SFX |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json) | Per-champion lane positions |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/abilities.json) | Champion ability descriptions (CC parsing) |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json) | Item stats for build-progression damage |
| Hand-curated | 172 champion metas, 340+ synergies, 250+ counters, 11 identity profiles |

Doom Bot variants (aliases starting with `Ruby_`) are filtered out of the roster
at fetch time. Pending-release champions missing from CDragon's feed are
injected from a local fallback table.

---

## Screenshots

> Add screenshots to `/docs/screenshots/` and reference them here:
>
> ```
> ![Draft view](docs/screenshots/draft.png)
> ![Match simulation](docs/screenshots/sim.png)
> ![Series recap](docs/screenshots/recap.png)
> ![Team comparison](docs/screenshots/comparison.png)
> ```

---

## Tuning the AI

Sampling and difficulty knobs live in `lib/draftAI/data.ts` (`PICK_TOP_N`,
`PICK_TEMPERATURE`, etc.). Per-difficulty knobs are in `lib/draftAI/index.ts`
under `knobsFor()`. Score weights live inline in `lib/draftAI/scoring.ts` —
each `add(...)` call has a comment explaining the rationale.

To validate that a tuning change is moving things in the right direction, run:

```bash
CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40 npm run calibrate
```

Output reports headline Pearson correlation between draft-strength diff and
simulated win rate, plus a leave-one-out analysis flagging components whose
removal *improves* correlation (potential noise) vs components that are load-
bearing (don't touch).

---

## Attribution & licensing

Unofficial fan-made simulator. League of Legends and all champion names,
splash art, icons, and sound effects are property of **Riot Games, Inc.**
Data sources (CommunityDragon, Meraki Analytics) are community mirrors of
public Riot client assets. No affiliation with, or endorsement by, Riot Games.
