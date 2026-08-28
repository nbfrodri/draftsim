<div align="center">

# ⚔️ DraftSim

**A League of Legends draft + match simulator with strategic AI drafting, an event-driven match engine, tournament brackets, and a full franchise season mode.**

Pick/ban against the AI (or watch AI vs AI), commit a team **game plan** in the War Room, then play the match out as a live timeline of events — KDA, gold, a win-probability curve — finishing with an MVP card, damage-share breakdown, and per-game / per-tournament recap. Run a single series, build a 32-team tournament, or simulate an entire competitive year across six regions with First Stand, MSI, Worlds, and optional franchise timelines that span decades.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-443E38)
![Tauri](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)

*Hobby / portfolio project. Unofficial fan-made — no affiliation with Riot Games.*

</div>

---

## What is DraftSim?

DraftSim is a **desktop-first** (Tauri) and **web-capable** (static Next.js export) simulator for League of Legends competitive play. At its core it is three things wired together:

1. **Draft engine** — tournament pick/ban order, fearless series, AI drafter with ~30 weighted signals, rosters, and meta tier lists.
2. **Match simulator** — event-driven games (~30 event types), War Room strategies, win-probability curves, and full post-match recaps.
3. **Season & franchise layer** — six regional leagues (LCK, LPL, LEC, LCS, CBLOL, LCP), three splits per year, international events (First Stand, MSI, Worlds, Global Cup), transfer windows, offseason roster management, and multi-year **Realities** with career tracking.

**Desktop vs web:** The recommended experience is the **Tauri desktop app** (`npm run desktop:dev` / `desktop:build`). It uses native file dialogs, a higher tournament-history cap, full replay persistence, and **SQLite** storage in AppData. The web build (`npm run dev`) runs the same UI from `localStorage` with clipboard-based import/export codes — great for quick sessions, but long franchise saves are better on desktop.

---

## Contents

- [What is DraftSim](#what-is-draftsim)
- [At a glance](#-at-a-glance)
- [Gallery](#-gallery)
- [Quick start](#-quick-start)
- [Modes & major screens](#-modes--major-screens)
- [Core game systems](#-core-game-systems)
- [Features](#-features)
- [Tech stack & infrastructure](#-tech-stack--infrastructure)
- [Architecture](#-architecture)
- [Scripts](#-scripts)
- [Data sources](#-data-sources)
- [Data files, exports & backup](#-data-files-exports--backup)
- [Tuning the AI](#-tuning-the-ai)
- [Desktop (Tauri)](#desktop-tauri)
- [Development](#-development)
- [Design docs](#-design-docs)
- [Attribution & licensing](#-attribution--licensing)

---

## ✨ At a glance

It's not just a draft tool — the draft feeds a **game plan**, and the plan feeds a
real match. The simulator runs an event-driven game (kills, ganks, drakes, baron,
soul, elder, ace, shutdowns, power-spikes…), and the AI's pick logic factors in
identity targeting, lane prio, lookahead, opponent anticipation, series-state
awareness, **enemy-roster scouting**, and side-aware drafting.

| | |
|---|---|
| 🧠 **Strategic AI** | Scores every legal pick/ban with ~30 weighted signals, samples from the top-N, and plays differently by **difficulty**, **side**, **series score**, **prior-game adaptation**, and the **opposing roster**. |
| 🗺️ **Team strategies** | A post-draft **War Room** of 16 game-plan levers (jungle, weakside, splitpush, objectives, tempo, risk…) that shape the match. Picking a plan that fits your draft is a win-prob tailwind; the AI auto-picks a **varied, context-aware** plan that adapts to the enemy draft/roster and the series scoreline. |
| 🎲 **Real match sim** | ~30 event types with kill-driven lane gold, role-shaped KDA, item-build combat resolution, power-spike timing windows, late-game scaling payoffs, comeback mechanics, and a win-probability curve. |
| 🏆 **Tournaments** | Six formats (single/double-elim, round-robin, Swiss, Swiss+playoffs, groups+playoffs), up to 32 teams, save/load, history, and a full post-tournament recap. |
| 🌍 **Season mode** | Full competitive year: 6 leagues × 3 splits, First Stand / MSI / Worlds, shifting meta, transfer windows, All-Pro, power rankings, and a world champion. |
| 📜 **Franchise / Realities** | Continuous timelines where teams and players carry across years — offseason transfers, aging, academy, free agency, Hall of Seasons, bulk sim, and portable exports. |
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

Production static build (used by Tauri packaging):

```bash
npm run build      # emits to out/
```

**Desktop (recommended for franchise play):**

```bash
npm run desktop:dev    # Next.js dev server + Tauri window
npm run desktop:build  # static export + NSIS/MSI installer
```

See [Desktop (Tauri)](#desktop-tauri) for Rust prerequisites and installer paths.

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

## 🎮 Modes & major screens

The main menu routes into distinct play modes. Each mode reuses the same draft → War Room → match → recap flow for individual series.

| Mode | Entry | What you can do |
|---|---|---|
| **Single Series** | Menu → Single Series | Quick Bo1/Bo3/Bo5 between two teams. PvP, PvAI, or AI vs AI. Fearless, side-swap, timer, roster editor. |
| **Tournament** | Menu → Tournament | Create a bracket (up to 32 teams, six formats). Sim remaining matches, per-match overrides, save/load (`TOUR1:` codes), post-tournament recap and replay viewer. |
| **Season** | Menu → Season Mode | One competitive year across six leagues. Follow a team, play or sim splits and internationals, transfer windows, All-Pro, power rankings, season story. Save/load season slots. |
| **Realities** | Menu → Realities | Franchise hub: create, resume, switch, delete, import/export timelines. Each reality is an independent multi-year save with its own Hall of Seasons. |
| **Hall of Seasons** | Menu → Hall (or click any player/team/coach card) | All-time records, career boards, rivalries, dynasty tiers, search, XLSX export. Scoped to the active reality in franchise mode, or global for one-off seasons. |
| **Meta Library** | Menu → Meta Tier Lists | Create, edit, randomize, import/export (`META1:`) tier lists. Apply presets before series/tournament/season. |
| **Pairings Library** | Menu → Synergies & Counters | Custom synergy pairs and counter relationships used by AI and simulator. |

**Season dashboard** (in-season): phase timeline, standings, match cards, transfer window panel, free agents, team browser, franchise panel, bulk-years control, live sim results feed, offseason view (agency demands, FA/academy shopping, coach hire).

**Desktop vs web caveats:**

| Feature | Desktop (Tauri) | Web |
|---|---|---|
| Persistence | SQLite `draftsim.db` in AppData | `localStorage` (~5 MB quota) |
| Tournament save/load | Native `.draftsim.json` dialogs | `TOUR1:` clipboard codes |
| Reality export | Native `.draftsim-reality.json` dialogs | File picker or `REAL1:` codes |
| Meta export | Native file dialogs | `META1:` clipboard codes |
| Tournament history cap | 200 entries, full replay data | 5 entries, slim recaps on persist |
| Bulk franchise sim | Full flush on window close | Same logic, smaller storage headroom |

---

## 🏗 Core game systems

High-level map of the complex systems. See [Design docs](#-design-docs) for deep dives.

### Draft engine

- 20-action tournament order (6 bans → 6 picks → 4 bans → 4 picks).
- Bo1/Bo3/Bo5, Fearless Draft, auto side-swap, optional 30s timer.
- Role assignment, flex-pick optimization, synergy/counter badges.
- AI drafter: ~30 signals, difficulty tiers, lookahead, roster scouting, rationale UI.

### Match simulator

- Event-driven timeline (~30 types): ganks, objectives, teamfights, power spikes, ace, elder, backdoor, etc.
- War Room strategies (16 levers) shape event frequency, objective tilt, and game length.
- Combat resolution from item builds + archetypes; identity multipliers; comeback mechanics.
- Post-match: win-prob sparkline, lane gold, MVP, damage share, scouting report.

### Tournaments

- Formats: single/double elim, round-robin, Swiss (+ playoffs), groups + playoffs.
- Swiss pairing with Buchholz tiebreakers; seed byes at First Stand and MSI.
- `Sim All` / `Sim Round` / `Sim Stage` with deferred loading overlay.
- Tournament-aware AI meta from observed champion W/L.

### Season mode

- **Calendar:** Winter → First Stand → Spring → MSI → Summer → Worlds (+ quadrennial **Global Cup** in franchise years).
- **Six leagues:** LCK, LPL, LEC, LCS, CBLOL, LCP — 10 teams each, round-robin splits.
- **International seeding** from split results; configurable realism flags (meta drift, region tides, player development, coach effects).
- **Transfer windows** after First Stand and MSI (interactive for your team); offseason pass after Worlds.
- **Awards & stats:** All-Pro teams, split MVPs, power rankings, player leaders, season story narrative.

### Franchise / Realities

- A **reality** is a named, persistent timeline: same team identities, rosters, and player careers across many years.
- **Year cycle:** play season → archive to Hall → offseason (transfers, aging, pool drift) → next year.
- **Offseason shop:** free-agent board, academy recalls/releases, rookie signings, agency demands, coach upgrades, AI market resolution.
- **Aging toggle** (per reality): careers evolve with performance-weighted tier changes, retirements, and rookies.
- **Bulk simulation:** auto-advance N years (up to 50) with live results feed, optional per-year save/export, ETA display.
- **Sharing:** `.draftsim-reality.json` files or `REAL1:` share codes; community gallery from `public/community-realities/manifest.json`.

### Hall of Fame / Season History

- Per-season archival résumés: champions, placements, All-Pro, player careers, transfer logs, meta snapshots.
- Cross-season aggregation: career kills/MVPs/titles, dynasty tiers, rivalries, region strength, head-to-head matrices.
- Player/team/coach profiles with deep links from anywhere in the live app.
- XLSX export/import for spreadsheet analysis.

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

### Strategies (War Room)

After the draft locks and before the match simulates, each team commits a **game
plan**. A plan is **16 levers in three groups**, and it genuinely changes the
simulated game.

<details>
<summary><b>The 16 levers</b></summary>

- **Team Plan** — Game Plan (early-snowball / teamfight / scaling) · Tempo (aggressive / standard / passive) · Risk (safe / standard / high-roll) · Macro (group / splitpush 1-3-1 / pick / siege) · Teamfight Style (front-to-back / flank / poke / balanced) · Objectives (dragon / herald / atakhan / baron / balanced) · Vision (proactive / standard / reactive)
- **Map & Resources** — Jungle (invade / counter-jungle / gank / balanced / farm) · Weakside Lane (top / bottom / none) · Win Condition (funnel into a carry lane) · **Pick Target** (hunt the enemy's strongest carry lane) · **Lane Swap** (dodge a losing top matchup)
- **Lane Assignments** — Top (group / splitpush / rotate) · Mid (hold / roam / push-prio) · Bot (trade / dive / scale) · Support (lane / roam / protect)

</details>

<details>
<summary><b>How it affects the sim</b></summary>

Two channels:

- **Comp fit → win probability.** A plan that suits your draft is a small tailwind; a mismatched one backfires (scaling with an all-early comp, splitpush with no splitpusher, funnelling a tank…). A good-vs-bad plan is worth roughly ±10pp — meaningful, but below the roster/draft lever. A live **Plan Fit** meter (Strong / Balanced / Poor) updates as you toggle.
- **Timeline flow.** Plans reshape *which* events fire and *who tends to win them* — gank frequency & side, mid-lane roams, dragon/baron/atakhan tilt, splitpush backdoors, **objective steal chances + closing-fight variance** (the Risk dial), and game length (scaling/passive stretch games toward the 24–50 min cap; aggressive ones shorten them). Pick Target denies the hunted enemy lane gold; Lane Swap softens a losing top.

Neutral on every lever by default, so a game with no plan set simulates exactly as before.

</details>

<details>
<summary><b>Varied, context-aware AI plans</b></summary>

AI sides don't pick the same plan every game. `chooseAIStrategy` weights each
lever by comp fit **and** match context, then *samples* — so two teams differ and
the same team adapts across a series:

- **Series-aware Risk** — facing elimination → `high-roll` (embrace variance); on match point → `safe` (close it out).
- **Enemy scouting** — Pick Target hunts the opponent's highest-tier player / strongest carry; Lane Swap triggers when your toplaner is hard-countered or tier-outmatched.
- Plans show **read-only** for AI sides (so you can counter-plan) and **editable** for human sides with the AI's suggestion marked. Tournaments use the same context-aware selector for auto-simmed matches.

</details>

### Match simulator

<details>
<summary><b>Event timeline & combat model</b></summary>

- **Event-driven timeline** of ~30 event types (level-1 invade, scuttle, gank, counter-gank, plates, drake, herald, grubs, atakhan, soul, baron, elder, teamfight, skirmish, pick, vision, outplay, objective-trade, wave-crash, power-spike, ace, shutdown, backdoor, nexus…).
- **Per-champion KDA** with role-shaped attribution (carries score kills, supports score assists, ADCs die more).
- **Kill-driven lane gold** — each event's `kdaDelta` flows into per-lane gold via `kdaToLaneGold` (300g/kill, 100g/assist), so an 8/0 lane is visibly ahead.
- **Power-spike timing windows** — each carry's key-item spike minute (build paths from `championBuilds.ts`) opens an "online" window; the team with more carries online tilts the mid-game fights (the real "fight on your item timing"). Up to two spike beats per side for multi-carry comps.
- **Late-game scaling payoff** — the deciding fight has a duration-ramped term, so a scaling comp that drags the game past ~30 min genuinely out-classes an early comp (short games favor the early team; long games favor the scaler).
- **Strategy-driven flow** — both teams' War Room plans bias event frequency, objective tilt, steal chances, closing-fight variance, and game length (see [Strategies](#strategies-war-room)).
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
- **History** — last 5 completed tournaments archived locally with slim recaps (200 on desktop).
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

**Web (`localStorage`):**

- Active series + tournament + season + realities survive reload via Zustand `persist`.
- **Quota-safe wrapper** — on hitting the ~5 MB ceiling it drops `tournamentHistory` and retries; on a second failure removes the key.
- **Slim archive on persist** — full replay payloads are stripped before the localStorage write but kept in memory for the active session. A tournament `Save` (TOUR1: code) preserves the full payload.
- **Lazy debounced writes** (500 ms) coalesce bulk-sim bursts.

**Desktop (SQLite — current):**

- Game state lives in `%APPDATA%\app.draftsim.desktop\draftsim.db` (see [Desktop SQLite storage](docs/desktop-sqlite-storage.md)).
- Franchise data is **normalized**: one row per reality, separate rows per Hall-of-Seasons entry — so 69+ archived years no longer rewrite one giant JSON blob.
- **Lazy history load** — only the active reality's Hall history is hydrated at startup; switching realities fetches the rest asynchronously.
- **Automatic migration** from legacy `draftsim-store.json` on first launch (renamed to `.bak`, non-destructive).
- Meta config mirrored in `meta_config` table (replaces `draftsim-meta-config.json`).

**Both:**

- Champions are not persisted — re-fetched from CommunityDragon each load.
- Current meta is snapshotted onto each tournament/season at creation.

Performance notes for long franchises: [`docs/performance-franchise-saves.md`](docs/performance-franchise-saves.md).

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

## 🛠 Tech stack & infrastructure

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router + Turbopack, `output: "export"` for Tauri) |
| UI | **React 19** + **TypeScript 5.7** (strict) |
| Styling | **Tailwind CSS 3.4** |
| State | **Zustand 5** with `persist` middleware (v7 on desktop) |
| Desktop | **Tauri 2** + `@tauri-apps/plugin-sql` (SQLite), `plugin-fs`, `plugin-dialog` |
| Charts | **Recharts 3** (win-probability curve) |
| Icons | **Tabler Icons React** |
| Animation | **GSAP 3.12** |
| Export | **ExcelJS** (Hall XLSX export) |
| Tooling | **tsx** (calibration) · **Vitest** (unit tests) · **esbuild** (bulk-sim worker) |

**Build pipeline:**

- `npm run dev` — Turbopack dev server + bundled `bulkSim.worker.js`.
- `npm run build` — static export to `out/` (champions fetched at build time).
- `npm run desktop:build` — `tauri build` packages `out/` into NSIS/MSI/portable `.exe`.

**Persistence architecture:**

| Platform | Backend | Location |
|---|---|---|
| Web | `localStorage` via lazy debounced JSON | Browser profile |
| Desktop | SQLite (`draftsim.db`) | `%APPDATA%\app.draftsim.desktop\` |

Zustand persist version **7** on desktop marks the SQLite backend. State shape is compatible with v6; JSON files migrate automatically on first launch.

---

## 🏗 Architecture

The entire `lib/` core is **framework-free and unit-testable** — AI scoring,
simulator, draft engine, series, season, and tournament logic have no React/DOM deps.

<details>
<summary><b>Repository layout</b></summary>

```
draftsim/
├── app/                          Next.js App Router (static export)
├── components/                   React UI (DraftApp, SeasonDashboard, RealitiesHub, …)
├── lib/
│   ├── draftAI/                  Heuristic AI drafter + scoring
│   ├── sim/                      Match simulator events, strategies, identities
│   ├── season/                   Season engine, franchise, transfers, history, bulk years
│   ├── tournament.ts             Bracket formats, advancement, TOUR1: codes
│   ├── matchSimulator.ts         Event timeline + combat + recaps
│   ├── desktopStorage.ts         Tauri file adapter + web lazy storage
│   ├── desktopSqlite.ts          SQLite schema, migration, read/write split
│   └── recapCompression.ts       Compact tournament/recap encoding for saves
├── store/draftStore.ts           Single Zustand store (series, tournament, season, realities)
├── public/workers/bulkSim.worker.js   Off-main-thread bulk franchise sim
├── scripts/                      Data fetchers, calibration, worker bundler
├── src-tauri/                    Tauri v2 Rust shell
├── training/                     Optional PyTorch draft-policy training (separate branch)
└── docs/                         Design docs (see below)
```

</details>

<details>
<summary><b>Data flow</b></summary>

1. `app/page.tsx` (server component) fetches champions + lanes from CommunityDragon + Meraki at build time. Pending-release champions missing from CDragon are injected from a local fallback table.
2. `<DraftApp>` populates the Zustand store and routes by mode (single series, tournament, season, realities hub, Hall).
3. All state transitions go through the store; pure logic lives in `lib/`.
4. AI decisions: `chooseAIActionWithRationale(...)` → samples from `scorePick` / `scoreBan` top-N.
5. Game plans: `confirmStrategies(...)` stores each side's `TeamStrategy`; fit + timeline modifiers feed the sim.
6. Match sim: `simulateMatch(game, champions)` runs the event-timeline generator.
7. Season/franchise: `lib/season/engine.ts` drives the year calendar; `lib/season/franchise.ts` rolls years forward; history archived to Hall.

</details>

<details>
<summary><b>Key design decisions</b></summary>

- **Pure-function core.** Everything in `lib/` is framework-free and testable.
- **Single Zustand store with persist.** Series + tournament + season + realities hydrate from storage; champions reset on reload.
- **Score by team name, not by side.** Side swaps don't split a team's wins.
- **MVP follows the winner.** Player of the Game is selected only from the winning side.
- **Strategies are neutral-by-default.** No plan set = bit-identical to pre-strategy builds.
- **Desktop SQLite normalization.** Franchise Hall history as per-row inserts — the main fix for 69+ year save lag (see performance doc).
- **Deferred sim work for UI feedback.** All `Sim *` actions paint a loading overlay, then defer heavy loops via `setTimeout(0)`.

</details>

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Turbopack dev server at `http://localhost:3000` |
| `npm run build` | Production static export to `out/` |
| `npm start` | Serve the production build (web only) |
| `npm run lint` | Next.js ESLint |
| `npm test` | Vitest unit suite (`lib/**/*.test.ts`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run desktop:dev` | Tauri dev window + Next.js hot reload |
| `npm run desktop:build` | Static export + Tauri installer bundle |
| `npm run refresh-data` | Pull latest Meraki ability + item data into `lib/data/*.json` |
| `npm run fetch-player-names` | Refresh real pro player handles from Leaguepedia (~68%+ coverage, run repeatedly to fill gaps) |
| `npm run fetch-team-logos` | Download team logo assets |
| `npm run fetch-rookie-names` | Fetch rookie name pool |
| `npm run fetch-coaches` | Fetch coach name data |
| `npm run calibrate` | Run N drafts × M sims; report TeamScore↔win-rate correlation. Tweak via `CALIB_DRAFTS=600 CALIB_SIMS_PER_DRAFT=40`. |
| `npm run build:worker` | Bundle `public/workers/bulkSim.worker.js` (runs automatically before dev/build) |

---

## 🔌 Data sources

| Source | Purpose |
|---|---|
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json) | Champion roster, aliases, class tags, icon URLs |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/) | Draft SFX |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json) | Per-champion lane positions |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/abilities.json) | Ability descriptions (CC parsing) |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json) | Item stats for build-progression damage |
| Leaguepedia (via `fetch-player-names`) | Accurate pro starter handles for season rosters |
| Hand-curated | 172 champion metas, 340+ synergies, 250+ counters, 11 identity profiles |

> Doom Bot variants (`Ruby_*`) are filtered at fetch time; pending-release champions missing from CDragon are injected from a local fallback table.

---

## 💾 Data files, exports & backup

### Windows desktop paths

All persistent data for the Tauri app lives under:

```
%APPDATA%\app.draftsim.desktop\
```

| File | Purpose |
|---|---|
| `draftsim.db` | **Primary store** — global state, realities, Hall history, meta config |
| `draftsim-store.json.bak` | Legacy JSON store (created after SQLite migration) |
| `draftsim-meta-config.json.bak` | Legacy meta config (after migration) |

macOS: `~/Library/Application Support/app.draftsim.desktop/`  
Linux: `~/.local/share/app.draftsim.desktop/`

### Export formats

| Extension / code | Contents |
|---|---|
| `.draftsim.json` | Full active tournament (in-flight draft, meta, history) |
| `.draftsim-reality.json` | Franchise timeline: live season + Hall history + metadata |
| `.draftsim-season.json` | Single season save slot |
| `TOUR1:…` | Deflate-base64 tournament code (clipboard-friendly) |
| `REAL1:…` | Deflate-base64 reality share code |
| `META1:…` | Deflate-base64 meta tier list |

### Delete reality

From **Realities → Saved realities → Delete**: removes the reality from the store and SQLite. If it was the **active** reality, the live season is cleared and you return to the hub. This is permanent — export first if you want a backup.

### Backup recommendations

1. **Export realities** you care about as `.draftsim-reality.json` (Realities hub → Export).
2. **Copy `draftsim.db`** while the app is closed for a full-fidelity backup (includes all realities, tournaments, meta).
3. After SQLite migration, keep the `.bak` JSON files until you've verified your saves loaded correctly.
4. For very long timelines (50+ years), prefer desktop over web — `localStorage` will hit quota limits.

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

> **Neural draft policy (optional):** A separate branch (`feat/neural-draft-policy`) adds a learned draft policy with ONNX/JSON weights (`public/models/draft-policy.json`) and a Python training pipeline under `training/`. It is not on `main` by default — the heuristic drafter above is the shipped experience.

---

## Desktop (Tauri)

DraftSim ships as a native desktop app via [Tauri v2](https://tauri.app/).

### Prerequisites

- **Node 20+** and **npm 10+** (same as web build).
- **Rust 1.77+** — install from [rustup.rs](https://rustup.rs/).
- **Windows**: Visual Studio Build Tools 2022 (C++ workload) or VS 2022.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev` (distro-specific).

### Dev (hot-reload)

```bash
npm run desktop:dev
```

Starts the Next.js dev server on `:3000` and opens the Tauri window pointing at it.

### Production build

```bash
npm run desktop:build
```

Runs `npm run build` (Next.js static export to `out/`) then packages the app with Tauri.

The build produces (paths relative to the repo root; not committed — `src-tauri/target` is gitignored):

| Artifact | Path |
|---|---|
| NSIS installer (recommended) | `src-tauri/target/release/bundle/nsis/DraftSim_<version>_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/DraftSim_<version>_x64_en-US.msi` |
| Portable executable (no install) | `src-tauri/target/release/app.exe` |

### Where data lives (SQLite)

Persistent state is stored in an embedded **SQLite** database:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\app.draftsim.desktop\draftsim.db` |
| macOS | `~/Library/Application Support/app.draftsim.desktop/draftsim.db` |
| Linux | `~/.local/share/app.draftsim.desktop/draftsim.db` |

**First launch after updating** to a build with SQLite storage automatically migrates from the legacy `draftsim-store.json` (renamed to `.bak`). See [`docs/desktop-sqlite-storage.md`](docs/desktop-sqlite-storage.md) for schema, migration flow, and lazy-history behaviour.

Desktop-specific advantages over web:

- Tournament history cap raised from 5 → **200** entries with full replay data.
- Native Save/Open dialogs for tournaments, realities, seasons, and meta.
- Normalized franchise storage — Hall-of-Seasons rows written individually instead of one monolithic JSON rewrite.
- `flushPendingSqliteWrites()` on window close and bulk-year boundaries.

### Export / Import (desktop)

- **Tournament Save** — native Save dialog → `.draftsim.json`.
- **Tournament Import** — native Open dialog.
- **Reality Export/Import** — `.draftsim-reality.json` from the Realities hub.
- **Season Save/Import** — `.draftsim-season.json` from the season dashboard / menu.
- **Meta Export / Import** — native dialogs in the Meta Editor.

Web builds use clipboard copy/paste for `TOUR1:` / `REAL1:` / `META1:` codes and textarea/file-input import.

---

## 🔧 Development

```bash
npm install
npm run dev          # web dev server
npm test             # Vitest unit tests
npx tsc --noEmit     # typecheck
npm run desktop:dev  # desktop with hot reload
```

**Roster data:** Run `npm run fetch-player-names` periodically to refresh pro player handles used in season creation. The script is throttled and accumulates across runs — re-run until coverage meets your needs.

**Bulk sim worker:** `npm run build:worker` bundles `public/workers/bulkSim.worker.js` (auto-run before dev/build). Edit the source and rebuild if you change off-thread franchise simulation.

**Calibration:** Use `npm run calibrate` after AI scoring changes to verify draft-strength still correlates with win rate.

**Type safety:** Strict TypeScript throughout; season/franchise types in `lib/season/types.ts`, core game types in `lib/types.ts`.

---

## 📚 Design docs

| Doc | Topic |
|---|---|
| [`docs/tournament-mode.md`](docs/tournament-mode.md) | Tournament formats, Swiss pairing, save codes |
| [`docs/players-feature.md`](docs/players-feature.md) | Rosters, skill tiers, AI scouting |
| [`docs/player-identity-and-franchise.md`](docs/player-identity-and-franchise.md) | Player IDs, careers, realities, aging, transfers |
| [`docs/season-realism.md`](docs/season-realism.md) | Seed byes, meta drift, region tides, realism flags |
| [`docs/reality-sharing.md`](docs/reality-sharing.md) | REAL1 codes, community gallery |
| [`docs/desktop-sqlite-storage.md`](docs/desktop-sqlite-storage.md) | SQLite schema, migration, lazy history |
| [`docs/performance-franchise-saves.md`](docs/performance-franchise-saves.md) | Save lag root causes and optimizations |

---

## 📄 Attribution & licensing

Unofficial fan-made simulator. League of Legends and all champion names, splash
art, icons, and sound effects are property of **Riot Games, Inc.** Data sources
(CommunityDragon, Meraki Analytics) are community mirrors of public Riot client
assets. No affiliation with, or endorsement by, Riot Games.
