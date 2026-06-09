<div align="center">

# ⚔️ DraftSim

**A League of Legends draft + match simulator with a strategic AI drafter and a full event-driven match engine.**

Pick/ban against the AI (or watch AI vs AI), then play the match out as a live timeline of events — KDA, gold, a win-probability curve — finishing with an MVP card, damage-share breakdown, and a per-game / per-tournament recap. Run a single series or build a 32-team tournament.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-443E38)
![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02?logo=greensock&logoColor=black)

*Hobby / portfolio project. Unofficial fan-made — no affiliation with Riot Games.*

</div>

---

## Contents

- [At a glance](#-at-a-glance)
- [Gallery](#-gallery)
- [Quick start](#-quick-start)
- [Features](#-features)
  - [Single series](#single-series) · [AI drafter](#ai-drafter) · [Match simulator](#match-simulator) · [Post-match](#post-match)
  - [Tournament mode](#tournament-mode) · [Meta tier list](#meta-tier-list) · [Player rosters](#player-rosters)
  - [Persistence](#persistence) · [Sound](#sound) · [UX](#ux--accessibility)
- [Tech stack](#-tech-stack)
- [Architecture](#-architecture)
- [Scripts](#-scripts)
- [Data sources](#-data-sources)
- [Tuning the AI](#-tuning-the-ai)
- [Attribution](#-attribution--licensing)

---

## ✨ At a glance

It's not just a draft tool — the draft feeds a real match. The simulator runs an
event-driven game (kills, ganks, drakes, baron, soul, elder, ace, shutdowns,
power-spikes…), and the AI's pick logic factors in identity targeting, lane prio,
lookahead, opponent anticipation, series-state awareness, **enemy-roster scouting**,
and side-aware drafting.

| | |
|---|---|
| 🧠 **Strategic AI** | Scores every legal pick/ban with ~30 weighted signals, samples from the top-N, and plays differently by **difficulty**, **side**, **series score**, **prior-game adaptation**, and the **opposing roster**. |
| 🎲 **Real match sim** | ~30 event types with kill-driven lane gold, role-shaped KDA, item-build combat resolution, comeback mechanics, and a win-probability curve. |
| 🏆 **Tournaments** | Six formats (single/double-elim, round-robin, Swiss, Swiss+playoffs, groups+playoffs), up to 32 teams, save/load, history, and a full post-tournament recap. |
| 📚 **Hand-curated data** | 172 champions · 300+ synergies · 250+ counters · 11 comp-identity profiles · per-lane meta tiers — all tagged from 2024–2026 patches. |
| 👥 **Player rosters** | Optional 5-player rosters with skill tiers and champion pools that bias both the AI's draft and the match outcome. |

---

## 📸 Gallery

| Draft board | Match simulation |
|---|---|
| ![Draft view](docs/screenshots/draft.png) | ![Match simulation](docs/screenshots/sim.png) |
| Live role assignment, synergy badges, the AI's hovered choice + rationale, and per-team champion pools. | Event-driven playback with the win-probability curve, gold/KDA, comp identities, and playback controls. |

| Team comparison | Roster editor | Series recap |
|---|---|---|
| ![Team comparison](docs/screenshots/comparison.png) | ![Player roster editor](docs/screenshots/roster-editor.png) | ![Series recap](docs/screenshots/recap.png) |
| Tug-of-war scouting + per-metric pull. | Player tiers and champion pools, star derived live. | Per-game MVP + biggest-swing narrative. |

---

## 🚀 Quick start

> Prerequisites: **Node 20+** and **npm 10+**.

```bash
npm install
npm run dev        # http://localhost:3000  (Turbopack)
```

Production build:

```bash
npm run build && npm start
```

<details>
<summary><b>Known build warning (harmless)</b></summary>

```
Failed to set Next.js data cache for https://cdn.merakianalytics.com/...
items over 2MB can not be cached (~17 MB)
```

Meraki's `champions.json` exceeds Next's 2 MB data-cache limit. Cosmetic — `/`
is statically prerendered with daily ISR, so Meraki is fetched at most once per
server instance per day; it just isn't stored in the cross-request cache.
</details>

---

## 🧩 Features

### Single series

- Standard LoL tournament draft order — 20 actions (6 bans → 6 picks → 4 bans → 4 picks).
- **Bo1 / Bo3 / Bo5** with correct win thresholds and side-swap-proof scoring.
- **Fearless Draft** — picks lock out across games; bans reset.
- **Auto side-swap** — loser of the previous game plays blue next (pro convention; manual override available).
- **30s action timer** (toggleable) — bans skip on timeout, picks random-fill.
- **Three modes:** P-vs-P · P-vs-AI · AI-vs-AI.
- **Three AI difficulties:** Easy / Normal / Hard — different sampling temperature, lookahead depth, and feature set. **Per-side override** in AI vs AI for handicap matches.

### AI drafter

The AI scores every legal candidate using ~30 weighted signals and samples from
the top-N.

<details>
<summary><b>Strategic signals</b></summary>

- **Identity targeting** — locks onto a comp shape (Wombo, Pick, Dive, Protect, Splitpush…) once 2+ picks are committed and rewards completion.
- **Lookahead** — 1-ply for Normal, 2-ply (predict enemy response *and* our follow-up) for Hard.
- **Anticipation** — predicts which champions the enemy is likely to pick, used for ban targeting.
- **Lane-matchup awareness** — 250+ counter-pick relationships factor into lane fit; magnitude scales with last-pick info advantage.
- **Side-aware drafting** — Blue first-picks favor flex / multi-lane and S+ meta tier (counter-resistant); Red weights matchup edge harder and R5 refuses to pick into a hard lane counter.
- **Series-state awareness** — when behind, prioritize meta-tier picks; elimination / closeout games drop the "save for later" S+ penalty.
- **Cross-game adaptation** — reads the opponent's prior-game identities, banks bans on their enabler archetypes, picks counter archetypes against them.
- **Enemy-roster scouting** *(when rosters are set)* — **target-bans the enemy's comfort picks weighted by that player's skill tier**, **denies enemy mains** on its own picks, **respects the enemy laner's skill** in the matchup term, and won't waste a ban on a champion the enemy is weak on.
- **Pocket picks** — a small randomization budget so the AI sometimes surprises.
- **Rationale UI** — every decision surfaces a labeled score breakdown in real time, plus a top-3 alternatives list.

</details>

### Match simulator

<details>
<summary><b>Event timeline & combat model</b></summary>

- **Event-driven timeline** of ~30 event types (level-1 invade, scuttle, gank, counter-gank, plates, drake, herald, grubs, atakhan, soul, baron, elder, teamfight, skirmish, pick, vision, outplay, objective-trade, wave-crash, power-spike, ace, shutdown, backdoor, nexus…).
- **Per-champion KDA** with role-shaped attribution (carries score kills, supports score assists, ADCs die more).
- **Kill-driven lane gold** — each event's `kdaDelta` flows into per-lane gold via `kdaToLaneGold` (300g/kill, 100g/assist), so an 8/0 lane is visibly ahead.
- **Power-spike events** fire when a key carry hits their first major item (build paths from `championBuilds.ts`).
- **Combat resolution** uses per-champion damage / EHP estimated from item builds, archetype, and meta tier — the closing fight outcome emerges from state, not a pre-decided winner.
- **Identity multipliers** — Wombo amped by no-disengage enemies, Dive amped vs unprotected carries, Tank Stack walls mono-damage comps, etc.
- **Comeback mechanics** — momentum, shutdowns, baron-pivot, atakhan effects (Voracious +20% kill gold, Ruinous one-shot revive).

</details>

### Post-match

- **Live win-probability sparkline** (Recharts) — side-tinted gradient area chart, ReferenceDots at game-defining events, and a **side-aware Y-axis** (blue's perspective up top, red's below — never negative percentages).
- **Lane Gold strip** with per-champion KDA and event-flash highlights (kill = side glow, death = red, objective = gold).
- **MVP card** — **Player of the Game always goes to the winning team** (broadcast convention); within the winners it's ranked by `K + 0.7·A − 0.5·D + laneGoldDiff/1000`.
- **Damage-share bars** per champion (synthetic damage from KDA × archetype damage profile).
- **Team Comparison panel** — a single tug-of-war view: each metric anchors at center and pulls toward the stronger team, with a per-side **Scouting Report** (playstyle / win condition / weakness) and an **Identity Matchup** verdict (e.g. "Pick Comp hard-counters Protect the Carry").
- **End-of-series narrative recap** — a 1–3 line storyline per game from the persisted MVP + biggest win-prob swing.

### Tournament mode

<details>
<summary><b>Formats, controls & recap</b></summary>

- **Six formats** picked at creation:
  - **Single Elimination** (2–8 teams, bye support, optional re-seeding between rounds)
  - **Double Elimination** (4 / 8 / 16 / 32 teams, mandatory bracket-reset OR "True GF" toggle)
  - **Round Robin** (3–10 teams)
  - **Swiss** (4–16 teams, ceil(log₂N) rounds, dynamic pairing avoiding rematches, Buchholz + Median Buchholz tiebreakers)
  - **Swiss + Playoffs** (Swiss stage → top-N seeded into single-elim)
  - **Groups + Playoffs** (1–8 groups of 3–4, snake-seed into a single-elim playoff)
- **Up to 32 teams** with per-team name, seed, icon (64-icon Tabler set + custom), color (64-color palette + custom), **1–5★ rating** (biases per-game win probability), and **per-team AI difficulty override**.
- **Cross-format Sim controls** — `Sim All Remaining`, `Sim Round` / `Sim Day` / `Sim Stage`, `Sim This Match`. All run AI vs AI behind a deferred loading overlay so the UI never freezes.
- **Per-match overrides** — change format/mode/fearless/AI difficulty before launching a match.
- **Tournament-aware AI** — layers in a "live tournament meta" from observed champion W/L (Bayesian-shrunk so 1-game outliers don't dominate).
- **Save / Load** the full active tournament (in-flight draft, meta snapshot, history) as a `TOUR1:` deflate-base64 code — paste it back to land exactly where you left off.
- **History** — last 5 completed tournaments archived locally with slim recaps.
- **Post-tournament recap** — summary tiles, most-contested champion, best WR (≥3 games), presence + win-rate tables, meta-shift movers, champion lookup with per-team attribution, per-team champion pools, and a per-match replay viewer.

</details>

### Meta tier list

- **Custom tier editor** with drag-and-drop tiering per role.
- **Per-lane meta tiers** `S+ S A B C D` shown as badges in champ select (the badge reflects the position you're filtering by; in "All" it shows the champion's *best* role).
- **Off-position fallback** — when a champion is played in a lane it has no explicit tier for, its effective tier is derived from the tiers it *does* have (median − 1 notch). Shoved into a lane it can't play at all, it floors at **D**. The simulator and the badges use the same rule.
- **Export / Import** as `META1:...` codes (deflate-compressed, URL-safe; also accepts raw JSON).
- **Randomize meta** — plausible randomized tier list matching real per-role shape.
- **Master toggle** to disable the meta system entirely (AI / sim treat all champions as equal in their playable lanes).

### Player rosters

Optional per-team rosters of **5 players** (one per lane), each with a fixed skill
**tier (S–D)** and **champion pools** (≤3 played well, ≤3 played badly).
Randomizable (with a slot-machine reveal animation) or hand-edited, and
**persistent** for the life of a series and — in tournaments — across every match.

- **Team rating derives from the roster** — the 1–5★ star is the mean of the five player tiers, so a 5★ team can never be five D-tier players. Set a star to generate a matching roster, or hand-edit the roster and the star follows.
- **Shown live during the draft** — each team panel lists its players' good/bad champion pools (and a team aggregate), and the pools **react to the board**: champions banned, picked, or fearless-locked grey out so you see what's actually still draftable.
- **The simulator factors it in three ways, no double-counting** — a team-wide **macro** bias from the derived star; a **zero-sum per-lane micro** bias (a strong toplaner over-performs in top *specifically*); and **champion-pool fit** (a laner on a liked champ over-performs; a disliked one under-performs).
- **The AI drafts for both rosters** — its own players' comfort nudges its picks, and it scouts the **opponent's** roster to target-ban their mains and deny their signatures (weighted by skill tier) — always *alongside*, never overriding, meta tier / matchup / synergy.
- **Flex-pick role optimization** — before simulating, AI teams reassign their five champions to the lanes that maximize meta tier + player comfort.

> Validated end-to-end (real sims): **5★ vs 1★ rosters win ~83%**, an all-comfort draft wins **~57%** vs a neutral one at equal rating, equal rosters stay ~50%. Design doc: [`docs/players-feature.md`](docs/players-feature.md).

### Persistence

<details>
<summary><b>Storage details</b></summary>

- **Active series + tournament + history survive reload** via Zustand `persist` (`localStorage`). Sound prefs and per-game AI rationale history persist too.
- **Quota-safe wrapper** — on hitting the ~5 MB ceiling it drops `tournamentHistory` and retries; on a second failure removes the key. The store stays usable in memory for the current tab.
- **Slim archive on persist** — full replay payloads (`winProbTimeline`, `notableEvents`, `perPickKDA`) are stripped before the localStorage write but kept in memory for the active session. A tournament `Save` (TOUR1: code) preserves the full payload.
- **Champions are not persisted** — re-fetched from CommunityDragon each load so icons and patch meta stay current.
- The current meta is **snapshotted onto each tournament at creation** so a save/load restores the AI's view of the meta it was played on.

</details>

### Sound

- Real Riot champ-select SFX (lock-in, ban, click, timer tick) from CommunityDragon.
- **Synthesized event blips** during playback — three severities via WebAudio (major events play a staggered A-major chord; mid a higher single tone; minor a soft blip).
- Single mute toggle + volume slider. Safari/iOS `.ogg` and delayed-AudioContext quirks handled gracefully.

### UX & accessibility

- Fully responsive (mobile / desktop).
- GSAP-animated lock-ins, draft-phase transitions, series-complete reveal, and the roster randomize flourish.
- Rift-themed visual language: gold ornate corners, diamond score pips, side-colored glows, scrolling rune-grid backdrop. All event icons are **Tabler Icons**.
- A11y: `role="status"` phase banner, `role="dialog"` + focus trap on the confirm modal, `aria-label` on interactive controls.

---

## 🛠 Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router + Turbopack, daily ISR for the champion roster) |
| UI | **React 19** + **TypeScript 5.7** (strict) |
| Styling | **Tailwind CSS 3.4** |
| State | **Zustand 5** with `persist` middleware |
| Charts | **Recharts 3** (win-probability curve) |
| Icons | **Tabler Icons React** |
| Animation | **GSAP 3.12** |
| Tooling | **tsx** (calibration script) · **Vitest** (unit tests) |

---

## 🏗 Architecture

The entire `lib/` core is **framework-free and unit-testable** — AI scoring,
simulator, draft engine, series, and tournament logic have no React/DOM deps.

<details>
<summary><b>Repository layout</b></summary>

```
draftsim/
├── app/
│   ├── layout.tsx                fonts (Cinzel + Inter), metadata
│   ├── page.tsx                  server component — fetches champions
│   ├── error.tsx                 graceful boundary for data-fetch failures
│   └── globals.css               theme, slot frames, keyframes
├── lib/
│   ├── types.ts                  Side / Lane / Champion / GameDraft / SeriesState / GameRecap / Player
│   ├── draftOrder.ts             20-action DRAFT_ORDER constant + phase labels
│   ├── draftEngine.ts            applyLock / applyTimeout / role assignment / swap
│   ├── series.ts                 series lifecycle + fearless pool + side-swap rule + star-rating bias
│   ├── tournament.ts             tournament state, format generators, advancement, history, standings, TOUR1:
│   ├── lanes.ts                  Lane labels + Meraki-to-Lane map
│   ├── players.ts                roster utilities, star derivation, champ pools, enemy-scouting weights
│   ├── sounds.ts                 SFX (CDragon URLs + WebAudio synthesis)
│   ├── communityDragon.ts        parallel CDragon + Meraki fetch + pending-release injection
│   ├── championMeta.ts           172+ champion metas, 340+ synergies, meta override, getEffectiveTier
│   ├── championAbilities.ts      ability lockdown profiles
│   ├── championBuilds.ts         archetype build paths + key-spike helper
│   ├── matchSimulator.ts         event timeline + combat resolution + recap (winProbTimeline, perPickKDA)
│   ├── metaRandomizer.ts         randomize-meta + localStorage helpers
│   ├── draftAI/
│   │   ├── index.ts              chooseAIAction(+WithRationale) + SeriesAIContext (my/opp rosters, WR shift)
│   │   ├── scoring.ts            scorePick / scoreBan + counter / enabler tables
│   │   ├── helpers.ts            stateless helpers (laneMatchup, identityTarget, …)
│   │   ├── anticipation.ts       1-ply / 2-ply lookahead + enemy prediction
│   │   ├── data.ts               250+ HARD_COUNTERS + IDENTITIES + sampling constants
│   │   └── *.test.ts             vitest coverage (scoring, players, helpers)
│   ├── sim/
│   │   ├── descriptions.ts       event flavor + KDA helpers + damage-share weights
│   │   ├── identities.ts         11 IDENTITY_PROFILES + identityMatchupEdge
│   │   ├── identitiesTypes.ts    GameDuration + IdentityVsIdentity types
│   │   └── types.ts              EventType / MatchEvent / EventKDA / SimulationResult
│   └── data/                     Meraki-derived abilities.json + items.json
├── store/
│   └── draftStore.ts             single Zustand store w/ persist (quota-safe, slim-archive, tournament actions)
├── components/                   DraftApp, DraftView, TeamPanel, ChampionGrid, BetweenGamesView,
│                                 SeriesCompleteView, RosterEditor, MetaEditor, TournamentDashboard, …
├── scripts/
│   ├── refresh-meraki-data.mjs   pulls latest Meraki ability + item data
│   └── calibrate.ts              runs N drafts × M sims, reports TeamScore↔win-rate correlation
└── package.json
```

</details>

<details>
<summary><b>Data flow</b></summary>

1. `app/page.tsx` (server component) fetches champions + lanes from CommunityDragon + Meraki at build / daily ISR. Pending-release champions missing from CDragon are injected from a local fallback table.
2. `<DraftApp>` populates the Zustand store and routes between four views by `series.status` (`null` / `drafting` / `between-games` / `complete`).
3. All state transitions go through the store; pure logic lives in `lib/draftEngine.ts` and `lib/series.ts`.
4. AI decisions: `chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx)` → samples from `scorePick` / `scoreBan` top-N. Lookahead and anticipation are gated by difficulty.
5. Match sim: `simulateMatch(game, champions)` runs the event-timeline generator, with per-event side rolls weighted by comp diff, gold lead, momentum, objective state, and lane priority.
6. `buildGameRecap(game, champions, result)` extracts a compact MVP + biggest-swing summary persisted on the GameDraft; the series-complete view reads it for the narrative.

</details>

<details>
<summary><b>Key design decisions</b></summary>

- **Pure-function core.** Everything in `lib/` is framework-free and testable with any runner.
- **Single Zustand store with persist.** Series + sound prefs + tournament + history hydrate from localStorage; champions and ephemeral UI reset on reload.
- **Score by team name, not by side.** `seriesScore()` aggregates wins via team name so side swaps don't split a team's wins.
- **MVP follows the winner.** Player of the Game is selected only from the winning side — no fed loser steals it, and side swaps can't misattribute it.
- **Auto side-swap rule.** After each game the loser plays blue ("loser picks side, always picks blue").
- **Draft-order vs positional-order picks.** Picks are indexed by lock-in order during draft, then reordered into positional order (`[0]` top → `[4]` support) with `blueRoles` frozen on completion.
- **Identity-driven scoring.** The AI rewards picks that complete a converging comp identity rather than optimizing a single scalar.
- **Tournament formats append matches.** Most generators emit the full match list up front; Swiss appends rounds dynamically, and playoff brackets / grand-final resets append on trigger.
- **Deferred sim work for UI feedback.** All `Sim *` actions paint a loading overlay synchronously, then defer the heavy AI-vs-AI loop via `setTimeout(0)`, wrapped in `try / finally`.
- **Modal via React portal.** Escapes the header's `backdrop-filter` containing block so it can cover the viewport.

</details>

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Turbopack dev server at `http://localhost:3000` |
| `npm run build` | Production build (static prerender) |
| `npm start` | Serve the production build |
| `npm run lint` | Next.js ESLint |
| `npm test` | Vitest unit suite (`lib/**/*.test.ts`) |
| `npm run refresh-data` | Pull latest Meraki ability + item data into `lib/data/*.json` |
| `npm run calibrate` | Run N drafts × M sims; report TeamScore.diff ↔ blue win-rate correlation + leave-one-out analysis. Tweak via `CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40`. |

---

## 🔌 Data sources

| Source | Purpose |
|---|---|
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json) | Champion roster, aliases, class tags, icon URLs |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/) | Draft SFX |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json) | Per-champion lane positions |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/abilities.json) | Ability descriptions (CC parsing) |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json) | Item stats for build-progression damage |
| Hand-curated | 172 champion metas, 340+ synergies, 250+ counters, 11 identity profiles |

> Doom Bot variants (`Ruby_*`) are filtered at fetch time; pending-release champions missing from CDragon are injected from a local fallback table.

---

## 🎛 Tuning the AI

Sampling and difficulty knobs live in `lib/draftAI/data.ts` (`PICK_TOP_N`,
`PICK_TEMPERATURE`, …) and `lib/draftAI/index.ts` (`knobsFor()`). Score weights
live inline in `lib/draftAI/scoring.ts` — each `add(...)` call has a comment
explaining its rationale.

To validate a tuning change:

```bash
CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40 npm run calibrate
```

It reports the Pearson correlation between draft-strength diff and simulated win
rate, plus a leave-one-out analysis flagging components whose removal *improves*
correlation (noise) vs load-bearing ones (don't touch).

**More design docs:** [`docs/tournament-mode.md`](docs/tournament-mode.md) ·
[`docs/players-feature.md`](docs/players-feature.md)

---

## 📄 Attribution & licensing

Unofficial fan-made simulator. League of Legends and all champion names, splash
art, icons, and sound effects are property of **Riot Games, Inc.** Data sources
(CommunityDragon, Meraki Analytics) are community mirrors of public Riot client
assets. No affiliation with, or endorsement by, Riot Games.
