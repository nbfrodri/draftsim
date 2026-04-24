# DraftSim

A tournament-style **League of Legends** draft simulator. Pick champions, ban
champions, play series in Bo1 / Bo3 / Bo5 formats with or without **Fearless
Draft**, swap sides between games, hear the real client sounds, and review
picks, bans, roles, and the fearless pool after the series ends.

Built with **Next.js 16** (App Router + Turbopack), **React 19**, **TypeScript**
(strict), **Tailwind CSS**, **Zustand** for state, and **GSAP** for animations.
Champion data is pulled live from **CommunityDragon** (Riot's client assets
mirror) and **Meraki Analytics** (curated lane/position data).

---

## Features

### Draft format
- **Standard LoL tournament draft order** — 20 actions total:
  - Ban phase 1: alternating, blue first (B-R-B-R-B-R)
  - Pick phase 1: snake (B-R-R-B-B-R)
  - Ban phase 2: alternating, red first (R-B-R-B)
  - Pick phase 2: R-B-B-R
- **Bo1, Bo3, Bo5** with correct win thresholds (1 / 2 / 3 wins).
- **Fearless Draft** toggle (Bo3/Bo5 only) — once a champion is *picked* in any
  game of the series, they're locked out of every subsequent game. Bans reset
  each game.
- **30-second action timer** (toggleable). On timeout: bans *skip* (slot left
  empty), picks *random-fill* from the available pool.

### Post-draft
- **Role assignment** — when a game's draft completes, champions are
  auto-assigned to `top / jungle / middle / bottom / support` using a greedy
  match against their primary lanes (Meraki data), then laid out in positional
  order.
- **Swap champions** — click any two picks on the same team to exchange them
  between role slots. Works in both *BetweenGames* and *Series Complete* views.
- **Side swap between games** — loser-picks-side convention is supported.
  Critically, scores are aggregated by **team identity**, not by side, so
  swapping doesn't split a team's wins across the blue/red counters.
- **Series recap** — each game card shows picks, bans, role assignments,
  winner, and (when fearless is enabled) the champion pool that was locked
  entering that game.

### Sound
All sound effects are pulled directly from Riot's client via CommunityDragon:
| Event | Sound |
|---|---|
| Champion selected in grid | `sfx-cs-button-thumbnail-click.ogg` |
| Blue side pick locked | `sfx-cs-draft-left-pick-single.ogg` |
| Red side pick locked | `sfx-cs-draft-right-pick-single.ogg` |
| Blue side ban locked | `sfx-cs-draft-ban-your-team.ogg` |
| Red side ban locked | `sfx-cs-draft-ban-enemy-team.ogg` |

A speaker icon in the draft header toggles mute. Sounds are `.ogg (Vorbis)`
only, so Safari and iOS silently no-op.

### UX
- Fully responsive — 3-column desktop, horizontal strips on mobile.
- Viewport-fit draft view — only the champion grid scrolls; the rest never
  grows past the viewport on desktop.
- Smooth 30s countdown bar via a CSS keyframe animation keyed to the action
  index (restarts each new action).
- GSAP-animated lock-in flash (picks scale + desaturate fade-in, bans spin in).
- Rift-themed visual language: gold ornate corners, diamond score pips,
  side-colored glows on the active slot, and a scrolling rune grid backdrop.
- Portal-based confirm modal with Enter/Escape shortcuts, focus trap, and
  focus restoration on close.

### Accessibility
- Phase banner uses `role="status"` + `aria-live="polite"` so screen readers
  announce ban/pick phase transitions.
- All interactive controls have `aria-label` or associated `<label>` elements.
- Modal uses `role="dialog"`, `aria-modal`, `aria-labelledby`, autofocuses the
  confirm button, traps Tab, and restores focus to the invoker on close.
- Keyboard: all buttons are focusable; Enter/Esc work in the modal.

---

## Architecture

```
draftsim/
├── app/
│   ├── layout.tsx            Fonts (Cinzel + Inter), metadata
│   ├── page.tsx              Server component — fetches champions + lanes
│   ├── error.tsx             Graceful boundary for data-fetch failures
│   └── globals.css           Theme, slot frames, timer keyframes
├── lib/                      Pure, framework-free domain code
│   ├── types.ts              Side / Lane / Champion / GameDraft / SeriesState
│   ├── draftOrder.ts         The 20-action DRAFT_ORDER constant + phase labels
│   ├── draftEngine.ts        applyLock / applyTimeout / assign + reorder + swap
│   ├── series.ts             Series lifecycle + fearless pool + score-by-name
│   ├── lanes.ts              Lane labels + Meraki-to-Lane map
│   ├── sounds.ts             CommunityDragon URLs + SoundPlayer
│   └── communityDragon.ts    Parallel CDragon + Meraki fetch, doom-bot filter
├── store/
│   └── draftStore.ts         Zustand — single source of UI state
└── components/
    ├── DraftApp.tsx          View router based on series.status
    ├── CreateSimulationForm  Landing: format / fearless / timer / team names
    ├── DraftView             Viewport-fit draft layout
    ├── DraftHeader           Brand / score / timer / mute
    ├── TeamPanel             Team side panel (bans + picks)
    ├── ChampionGrid          Filterable pool + lock-in
    ├── BetweenGamesView      Winner select + swap sides + role swap
    ├── SeriesCompleteView    Final recap + all-game review
    ├── Modal                 Portal-based confirm dialog
    └── LaneIcon              Shared Riot position icon
```

### Data flow
1. `app/page.tsx` is a **server component** with `revalidate = 86400` (daily
   ISR). At build / revalidation time it calls `fetchChampions()` in parallel:
   - Champion list from CommunityDragon's `champion-summary.json`
   - Lane data from Meraki Analytics' `champions.json`
   The results are merged into a single `Champion[]` and passed to the client
   `<DraftApp>`.
2. `DraftApp` populates the Zustand store via `setChampions(...)` on mount and
   routes between the four views based on `series.status`:
   - `null` → `<CreateSimulationForm>`
   - `"drafting"` → `<DraftView>`
   - `"between-games"` → `<BetweenGamesView>`
   - `"complete"` → `<SeriesCompleteView>`
3. All state transitions (`lockIn`, `timeout`, `declareWinner`,
   `proceedToNextGame`, `swapPickSlots`, `resetAll`) go through the store; the
   store calls into pure functions in `lib/draftEngine` and `lib/series`.

### Key design decisions

- **Pure-function core.** Everything in `lib/` (draftEngine, series,
  role-assignment) is framework-free, has no React/DOM dependencies, and is
  trivially unit-testable. Only `lib/sounds.ts` touches the browser Audio API,
  and it no-ops cleanly server-side.

- **Single Zustand store.** Components subscribe to the slices they need; all
  mutations go through actions. No component-local state leaks into the domain
  layer.

- **CSS-only responsive.** Tailwind breakpoints drive layout — desktop = three
  columns side-by-side, mobile = strips stacked vertically. No `useMediaQuery`
  hooks, so no SSR hydration mismatches.

- **Score by team name, not by side.** `seriesScore()` aggregates wins through
  `winsByTeamName(series)`. When teams swap sides between games, a team's wins
  stay under their team name rather than being split across the blue/red
  buckets. This makes `isSeriesDecided` correct across swaps.

- **Draft-order vs positional-order picks.** During a draft, `bluePicks[i]` is
  indexed by pick-action slot (the order in which picks were locked in). When
  a game completes, picks are *reordered* into positional order — `[0]` is the
  top laner, `[1]` jungle, … `[4]` support — and `blueRoles` is frozen to
  `[top, jungle, middle, bottom, support]`. This makes the recap readable and
  lets `swapPickSlots(gameIndex, side, slotA, slotB)` exchange champions
  between positional slots while role labels stay put.

- **Modal via React portal.** A `backdrop-filter` on the header creates a
  containing block that traps `position: fixed` descendants. Rendering the
  modal through `createPortal(document.body)` escapes that so `inset-0`
  covers the viewport.

- **Latest-callback ref pattern in Modal.** The main `useEffect` depends only
  on `open`, not on `onConfirm`/`onCancel`, which are parked in refs. Parent
  re-renders (e.g. once per second while the timer ticks) don't restart the
  entrance animation.

---

## Running locally

Prerequisites: **Node 20+** and **npm 10+**.

```bash
npm install
npm run dev        # http://localhost:3000 — Turbopack
```

Production:

```bash
npm run build      # static prerender of /
npm start          # serve
```

### Known build warning
```
Failed to set Next.js data cache for https://cdn.merakianalytics.com/...
items over 2MB can not be cached (17486494 bytes)
```
Meraki's `champions.json` is ~17 MB and exceeds Next's 2 MB data-cache limit.
This is cosmetic: `/` is a static page with daily ISR, so Meraki is actually
fetched at most once per day per server instance. It just isn't stored in the
cross-request data cache.

---

## Data sources

| Source | Purpose |
|---|---|
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json) | Champion roster, aliases, class tags, icon URLs |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/) | Lane position icons (top / jungle / middle / bottom / utility) |
| [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/sounds/) | Draft SFX |
| [Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json) | Per-champion curated lane/position list |

Doom Bot variants (aliases starting with `Ruby_`) are filtered out of the
roster at fetch time.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Turbopack dev server at `http://localhost:3000` |
| `npm run build` | Production build (static) |
| `npm start` | Serve the production build |
| `npm run lint` | Next.js ESLint (disabled in this project; no config) |

---

## Tech stack

- **Next.js 16** (App Router, Turbopack, ISR)
- **React 19** + **TypeScript 5.7 strict**
- **Tailwind CSS 3.4**
- **Zustand 5** (state)
- **GSAP 3.12** (animations)
- No test framework configured; `lib/` is structured to be unit-testable with
  any runner.

---

## Attribution & licensing

This project is an unofficial fan-made simulator. League of Legends and all
champion names, splash art, icons, and sound effects are property of
**Riot Games, Inc.** Data sources (CommunityDragon, Meraki Analytics) are
community mirrors of public Riot client assets.

No affiliation with, or endorsement by, Riot Games.
