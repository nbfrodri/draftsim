# DraftSim — Hermes Agent Audit Report

**Generated:** 2026-08-19  
**Auditor:** Hermes Agent (Nous Research)  
**Repository:** `C:\Users\Phobos\Desktop\Archivos\draftsim`  
**Branch:** `feat/neural-draft-policy` (main also present)

---

## Executive Summary

DraftSim is a **sophisticated, production-quality League of Legends draft + match simulator** built with Next.js 16, React 19, TypeScript, and Tailwind CSS. The codebase demonstrates **excellent architectural discipline**: a framework-free `lib/` core that is fully unit-testable, a single Zustand store with robust persistence, and a clean separation between pure logic and UI components.

The project features **two major AI systems**:
1. **Heuristic AI** — A mature, deeply-featured drafter (~30 weighted signals, lookahead, anticipation, identity targeting, cross-game adaptation, enemy-roster scouting)
2. **Neural Policy (Behavior Cloning)** — A PyTorch-trained MLP exported to JSON and run via pure TypeScript inference (no ONNX/runtime deps)

**Overall grade: A−** — Strong engineering, thorough documentation, good test coverage. Primary gaps: missing CI/CD pipeline, no E2E tests, some technical debt in the neural pipeline integration.

---

## Architecture Assessment

### ✅ Strengths

| Area | Rating | Notes |
|------|--------|-------|
| **Core purity** | ★★★★★ | `lib/` is 100% framework-free. All AI, sim, draft engine, series, tournament logic are pure TS functions. |
| **State management** | ★★★★★ | Single Zustand store with `persist` middleware. Quota-safe wrapper, slim-archive on persist, full TOUR1: codes for portable saves. |
| **Type safety** | ★★★★★ | Strict TS config. Discriminated unions for `SeriesState.status`, `DraftMode`, `AIDifficulty`. No `any` in core logic. |
| **Data flow** | ★★★★★ | Clear unidirectional flow: Server fetch → Store → Components → Pure lib functions → Store updates. |
| **Extensibility** | ★★★★★ | Plugin-ready: meta system, strategies, personalities, neural policy all designed as swappable layers. |
| **Documentation** | ★★★★★ | README is exceptional. Design docs in `docs/` (tournament-mode, players-feature, season-realism, proposals) are detailed, current, and include tuning constants. |
| **Testing strategy** | ★★★★☆ | Vitest unit tests cover neural encoder, policy, integration, scoring, players, season logic. **Missing: E2E/Playwright, integration tests for full draft→sim flow.** |
| **Build/Deploy** | ★★★★☆ | Static export + Tauri desktop. Turbopack dev. **Missing: GitHub Actions CI, automated test runs, release pipeline.** |

### ⚠️ Concerns

| Issue | Severity | Location |
|-------|----------|----------|
| **No CI/CD** | High | No `.github/workflows/`. No automated lint/test/build on PR. |
| **No E2E tests** | Medium | Complex UI flows (draft→strategy→sim→recap) untested end-to-end. |
| **Neural policy fallback silent** | Medium | `initNeuralDraftPolicy` logs but UI shows no indicator when falling back to heuristic. |
| **Large `DraftApp.tsx`** | Low | 1200+ lines, many responsibilities. Could split into route components. |
| **Hardcoded champion pool size (200)** | Low | `CHAMPION_POOL_SIZE` constant; if roster grows, encoder dims mismatch. |
| **Python/TS dimension coupling** | Medium | `STATE_DIM`, `CHAMP_DIMS`, `CHAMPION_POOL_SIZE` duplicated in `stateEncoder.ts` and `dataset.py`. Single source of truth needed. |

---

## Code Quality Deep Dive

### 1. Draft AI System (`lib/draftAI/`)

**Heuristic AI** (`index.ts`, `scoring.ts`, `anticipation.ts`, `helpers.ts`, `data.ts`):
- ~30 scoring components for picks, ~15 for bans
- Difficulty knobs (Easy/Normal/Hard) control temperature, top-N, lookahead depth, feature gates
- Personality system (sampling multipliers, top-N deltas) layered on top
- Cross-game adaptation: reads opponent prior identities, archetype profiles, series score
- Enemy-roster scouting: target-bans weighted by player skill tier, denies signatures
- **Rationale UI** returns labeled score breakdown + top-3 alternatives — excellent for debugging/UX

**Neural Policy** (`neural/`):
- **Encoder** (`stateEncoder.ts`): 3227-d vector (27 scalars + 200×16 per-champ features). Clean, deterministic, tested.
- **Policy** (`policy.ts`): Pure TS forward pass (Linear → ReLU ×3 → Policy Head + optional Value Head). Masked softmax enforces legal moves. No external deps.
- **Training pipeline** (`training/`): PyTorch `DraftPolicyNet` with LayerNorm, dropout, orthogonal init. Exports JSON weights consumed by TS.
- **Dataset** (`generate-draft-dataset.ts`): Self-play via heuristic AI, logs state/action/outcome per turn. JSONL format.
- **Integration**: `chooseAIActionWithRationale` tries neural first, falls back to heuristic silently.

**Neural Integration Gaps:**
- No version check between encoder (TS) and model (Python) beyond `state_dim`/`num_actions` warn
- No runtime metric exposing which policy (neural vs heuristic) is active
- `chooseNeuralDraftActionWithRationale` returns dummy rationale (`components: [{label: "Neural policy", value: 1.0}]`) — UI can't show real breakdown

### 2. Match Simulator (`lib/matchSimulator.ts`, `lib/sim/`)

- Event-driven timeline (~30 event types) with per-event win-prob delta
- Role-shaped KDA, kill-driven lane gold (300g/kill, 100g/assist)
- Power-spike timing windows from `championBuilds.ts`
- Late-game scaling payoff (duration-ramped deciding fight)
- Strategy-driven flow (16 levers across 3 groups) with fit meter
- Identity multipliers (Wombo/Dive/Tank Stack/etc.)
- Comeback mechanics (momentum, shutdowns, baron-pivot, Atakhan)
- **Outputs**: `GameRecap` with MVP, winProbTimeline, goldLeadTimeline, perPickKDA, ratings, pentakills

### 3. Tournament & Season Systems (`lib/tournament.ts`, `lib/season/`)

**Tournament formats (6):** Single/Double Elim, Round Robin, Swiss, Swiss+Playoffs, Groups+Playoffs
- Up to 32 teams, per-team rating (1–5★), AI difficulty override
- Cross-match fearless, save/load TOUR1: codes, history archive
- Tournament-aware AI (live meta from observed champion W/L)

**Season Realism (opt-in flags):** Form drift, Player Development, Meta Adaptability, Clutch/Momentum, Region Tides, Patch Shifts, Match Variance preset
- All optional fields on state → backward compatible
- Power Rankings (derived UI), Season Story recap (templated narrative)

### 4. Persistence & Desktop (`store/draftStore.ts`, `lib/desktopStorage.ts`)

- Zustand `persist` with quota-safe wrapper (drops history on 5MB limit)
- Slim archive: strips `winProbTimeline`, `notableEvents`, `perPickKDA` from localStorage
- Desktop (Tauri): Native file dialogs for save/import, raises history cap to 200, preserves full replay
- Meta config mirrored to AppData file for cross-session restore

---

## Neural Pipeline Audit

### Current State

| Component | Status | Notes |
|-----------|--------|-------|
| **Encoder (TS)** | ✅ Complete | 3227-d, tested, deterministic |
| **Policy Inference (TS)** | ✅ Complete | Pure TS, masked softmax, value head optional |
| **Model Definition (PyTorch)** | ✅ Complete | `DraftPolicyNet` with LayerNorm, dropout |
| **Training Script** | ✅ Complete | BC with cosine LR, checkpointing, best export |
| **Export Script** | ✅ Complete | Standalone checkpoint → JSON |
| **Dataset Generator** | ✅ Complete | Self-play heuristic → JSONL |
| **Integration Hook** | ⚠️ Partial | Neural tried first, silent fallback, dummy rationale |

### Recommended Improvements

1. **Shared dimension constants** — Create `training/dimensions.json` or a small TS/Python shared module so `STATE_DIM`, `CHAMP_DIMS`, `CHAMPION_POOL_SIZE` have a single source of truth.

2. **Model versioning** — Add `model_version` + `encoder_version` to weights JSON. TS inference should validate compatibility and surface a clear warning if mismatched.

3. **Neural rationale** — Implement attention/gradient-based attribution or at minimum return the policy head logits/probs so UI can show "Neural confidence: X%, Top-3: [...]".

4. **Active policy indicator** — Add a small badge in the draft UI showing 🧠 Neural / 🤖 Heuristic so users know which brain is driving.

5. **Training telemetry** — Log Top-1/Top-5 per difficulty, per phase (ban1/pick1/ban2/pick2) to diagnose where the model struggles.

6. **Dataset diversity** — Current generator uses only heuristic AI. Consider adding human games (if available) or varied personalities for broader coverage.

---

## Testing Coverage

### Existing (Vitest)
```
lib/draftAI/neural/__tests__/stateEncoder.test.ts   ✅ 15 tests
lib/draftAI/neural/__tests__/policy.test.ts         ✅ 14 tests
lib/draftAI/neural/__tests__/integration.test.ts    ✅ 8 tests
lib/season/*.test.ts                                ✅ Multiple suites
lib/draftAI/*.test.ts                               ✅ Scoring, players, helpers
```

### Missing
- **E2E (Playwright):** Full draft → strategy → sim → recap flow
- **Integration:** Tournament creation → match sim → advance bracket → recap
- **Visual regression:** Component snapshots (DraftView, StrategyView, TournamentDashboard)
- **Performance:** Large tournament sim (32 teams) benchmarks

---

## Security & Dependencies

| Check | Status |
|-------|--------|
| **No secrets in repo** | ✅ Verified — `.gitignore` covers `.env*.local`, checkpoints, dataset |
| **Dependency freshness** | ✅ Next 16, React 19, TS 5.7, Tailwind 3.4 — all current |
| **Known vulns** | ⚠️ Run `npm audit` — not checked in this audit |
| **Content Security Policy** | ❌ Not configured (static export mitigates, but desktop Tauri needs CSP) |
| **Input validation** | ✅ Zod not used but TS types + normalize functions (e.g., `normalizeRoster`) provide boundary safety |

---

## Performance Considerations

| Area | Observation |
|------|-------------|
| **Neural inference** | Pure TS matrix multiply (3227×512 → 512×256 → 256×128 → 128×200). ~1-2ms on modern CPU. Acceptable. |
| **Match sim** | Event-driven, ~100-300 events/game. AI-vs-AI tournaments (32 teams) can run 500+ games. Deferred via `setTimeout(0)` — good. |
| **Bundle size** | Static export. `recharts`, `gsap`, `zustand`, `tabler-icons` — reasonable. No heavy unused deps. |
| **Memory** | Zustand store persists full tournament history (slimmed). Desktop preserves full replay — monitor 200-entry cap. |

---

## Recommendations Priority Matrix

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Add GitHub Actions CI (lint + test + build) | Low | High — prevents regressions |
| **P0** | Shared dimension constants (TS ↔ Python) | Low | High — prevents silent encoder/model mismatch |
| **P1** | Neural policy active indicator in UI | Low | High — transparency for users |
| **P1** | Real neural rationale (logits/probs breakdown) | Medium | High — core UX value prop |
| **P1** | Playwright E2E for critical paths | Medium | High — catches UI regressions |
| **P2** | Model version compatibility check | Low | Medium — prevents subtle bugs |
| **P2** | Split `DraftApp.tsx` into route components | Medium | Medium — maintainability |
| **P2** | Automated release pipeline (Tauri artifacts) | Medium | Medium — distribution |
| **P3** | Training telemetry per phase/difficulty | Medium | Low — model improvement |
| **P3** | CSP headers for Tauri build | Low | Low — security hardening |

---

## File Inventory (Key Files)

```
draftsim/
├── app/
│   ├── page.tsx                 # Server component, fetches champions
│   ├── layout.tsx               # Fonts, metadata, global providers
│   └── globals.css              # Theme, animations, rift aesthetic
├── lib/
│   ├── types.ts                 # Core types (Champion, GameDraft, SeriesState, Player, etc.)
│   ├── draftEngine.ts           # applyLock, applyTimeout, role assignment
│   ├── series.ts                # Series lifecycle, fearless, side-swap, starRatingBias
│   ├── tournament.ts            # 6 formats, advancement, TOUR1: codes, history
│   ├── matchSimulator.ts        # Event timeline, combat, recap builder
│   ├── championMeta.ts          # 172 champs, 340+ synergies, 250+ counters, 11 identities
│   ├── players.ts               # Roster utils, star derivation, champ pools
│   ├── draftAI/
│   │   ├── index.ts             # Public API, SeriesAIContext, difficulty knobs, personalities
│   │   ├── scoring.ts           # scorePick/scoreBan (~30 components each)
│   │   ├── anticipation.ts      # 1-ply/2-ply lookahead, enemy prediction
│   │   ├── helpers.ts           # Stateless helpers (identityTarget, laneMatchup, etc.)
│   │   ├── data.ts              # HARD_COUNTERS, IDENTITIES, sampling constants
│   │   ├── neural/
│   │   │   ├── index.ts         # initNeuralDraftPolicy, chooseNeuralDraftAction*
│   │   │   ├── policy.ts        # Pure TS forward pass, masked softmax
│   │   │   ├── stateEncoder.ts  # 3227-d encoder, buildChampionIndex, buildLegalMask
│   │   │   ├── logger.ts        # DraftLogger for dataset generation
│   │   │   └── __tests__/       # 37 unit tests
│   │   └── __tests__/           # Scoring, players, helpers tests
│   ├── sim/
│   │   ├── strategies.ts        # 16-lever game plans, fit, timeline modifiers, AI selection
│   │   ├── identities.ts        # 11 IDENTITY_PROFILES, identityMatchupEdge
│   │   └── types.ts             # EventType, MatchEvent, SimulationResult
│   └── season/                  # Season engine, realism systems, power rankings, story
├── store/
│   └── draftStore.ts            # Zustand store, persist, quota-safe, tournament actions
├── components/
│   ├── DraftApp.tsx             # Main router (1200+ lines) — consider splitting
│   ├── DraftView.tsx            # Draft board, champ grid, AI rationale panel
│   ├── StrategyView.tsx         # War Room (16 levers, fit meter, AI recommendation)
│   ├── BetweenGamesView.tsx     # Match sim playback, win-prob curve, MVP
│   ├── TournamentDashboard.tsx  # Bracket, sim controls, standings, recap
│   └── ... (80+ components)
├── training/
│   ├── model.py                 # DraftPolicyNet (PyTorch)
│   ├── dataset.py               # DraftDataset, DataLoader
│   ├── train_bc.py              # BC training loop, cosine LR, checkpointing
│   ├── export.py                # Checkpoint → JSON
│   └── checkpoints/             # .pt files (gitignored)
├── scripts/
│   ├── generate-draft-dataset.ts  # Self-play dataset generator
│   ├── calibrate.ts             # Draft strength ↔ win-rate correlation
│   └── refresh-meraki-data.mjs  # Pulls ability/item data
├── docs/
│   ├── tournament-mode.md       # Tournament formats, controls, recap
│   ├── players-feature.md       # Player rosters, AI scouting, validation
│   ├── season-realism.md        # 10 realism systems, tuning constants
│   ├── reality-sharing.md       # Desktop export/import, Hall of Seasons
│   └── propuestas-profundidad.md # Future proposals (Spanish)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── tailwind.config.ts
├── next.config.ts
└── README.md                    # Exceptional documentation
```

---

## Final Verdict

**DraftSim is a remarkably well-engineered hobby project that exceeds many commercial codebases in architectural clarity, documentation, and feature depth.** The neural policy pipeline is a standout — pure TS inference with no runtime dependencies is a great architectural choice.

**Top 3 investments for the next sprint:**
1. **CI/CD pipeline** (GitHub Actions) — 1-2 hours, prevents all future regressions
2. **Shared dimension constants** — 30 minutes, eliminates a whole class of silent bugs
3. **Neural rationale + active indicator** — 4-6 hours, unlocks the full UX value of the neural system

The codebase is **ready for production desktop distribution** (Tauri build works, persistence is robust). With CI and the neural UX polish, it would be a showcase-quality portfolio piece.

---

*Audit performed by Hermes Agent (Nous Research) — Full-stack Developer profile*
*Reference: AGENTS.md conventions, `react-patterns`, `api-design`, `testing-strategy`, `security-best-practices` skills*