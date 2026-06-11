"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { isDesktop, createDesktopLazyStorage, migrateWebStorageToDesktop } from "@/lib/desktopStorage";
import {
  applyLock,
  applyTimeout,
  currentAction,
  POSITIONAL_LANES,
  reorderPicksByPosition,
  swapChampions as swapChampionsPure,
} from "@/lib/draftEngine";
import {
  applySideChoice,
  chooseSideAI,
  createSeries,
  currentGame,
  difficultyForSide,
  effectiveSideRule,
  fearlessLockedSet,
  nextGameSides,
  recordWinner,
  requiredWins,
  startNextGame,
  starRatingBias,
  winsByTeamName,
} from "@/lib/series";
import { optimizeRoleAssignment } from "@/lib/draftAI/roleAssign";
import {
  chooseAIAction,
  chooseAIActionWithRationale,
  isAITurn,
  seriesAIContextFrom,
  type AIRationale,
} from "@/lib/draftAI";
import { playActionSound, sounds, SOUND } from "@/lib/sounds";
import {
  setActiveCounterOverride,
  setActiveMetaOverride,
  setActiveSynergyOverride,
  setMetaEnabled,
  type CounterPair,
  type MetaOverride,
  type Synergy,
} from "@/lib/championMeta";
import {
  loadCounterOverride,
  loadMetaEnabled,
  loadMetaOverride,
  loadMetaSource,
  loadPowerSpikeOverride,
  loadSynergyOverride,
  randomizeCounters,
  randomizeMeta,
  randomizePowerSpikes,
  randomizeSynergies,
  saveCounterOverride,
  saveMetaEnabled,
  saveMetaOverride,
  saveMetaSource,
  savePowerSpikeOverride,
  saveSynergyOverride,
  type PowerSpikeOverride,
} from "@/lib/metaRandomizer";
import { setActivePowerSpikeOverride } from "@/lib/championBuilds";
import type {
  Champion,
  GameDraft,
  SeriesState,
  SimulationSettings,
  Side,
} from "@/lib/types";
import {
  appendMatchPicks,
  computeTournamentChampionWR,
  createTournament,
  crossMatchFearlessLocked,
  decodeTournament,
  effectiveLockedSet,
  makeTournamentId,
  recordMatchWinner,
  startGroupsPlayoffs,
  startRoundRobinPlayoffs,
  startSwissPlayoffs,
  teamStarRating,
  tournamentSeriesContext,
  type CreateTournamentParams,
  type TournamentMatch,
  type TournamentState,
} from "@/lib/tournament";
import { buildGameRecap, computeGameRatings, simulateMatch } from "@/lib/matchSimulator";
import { randomizeRoster } from "@/lib/players";
import { chooseAIStrategyForGame, type PriorGameSummary, type TeamStrategy } from "@/lib/sim/strategies";
import {
  applyRatingsToForms,
  sideFormsFor,
  type PlayerFormMap,
} from "@/lib/playerForm";
import {
  PERSONALITY_LIST,
  getPersonality,
} from "@/lib/draftAI";
import { evolveMetaForTournament } from "@/lib/metaEvolution";
import {
  compactEncodeTournamentForPersist,
  decodeRecapHeavyFields,
  type RecapCompact,
} from "@/lib/recapCompression";
import {
  applyTournamentUpdate as applySeasonTournamentUpdate,
  createSeason,
  makeSeasonId,
  nextPendingTournament as nextPendingSeasonTournament,
  currentPhase as currentSeasonPhase,
  phaseProgress as seasonPhaseProgress,
} from "@/lib/season/engine";
import { ensureTeamIdentities } from "@/lib/season/teamGen";
import {
  buildSeasonHistoryEntry,
  type SeasonHistoryEntry,
} from "@/lib/season/history";
import type {
  SeasonConfig,
  SeasonMetaSnapshot,
  SeasonState,
  SeasonTeam,
} from "@/lib/season/types";

export const ACTION_SECONDS = 30;

// localStorage wrapper that gracefully handles QuotaExceededError.
//
// Fallback chain on QuotaExceededError:
//   1. Drop tournamentHistory (largest field) and retry.
//   2. If still over quota, fall back to the OLD slimming strategy for the
//      active tournament: strip compact-encoded recap data back to just the
//      lightweight summary fields (winProbTimeline etc. removed, recapC
//      removed too). This is a last resort — replay charts will be lost on
//      the next reload, but the save will succeed.
//   3. Drop tournamentHistory entirely from the already-slimmed payload and
//      retry one final time.
//   4. Remove the key entirely so the next render proceeds in-memory only.
const quotaSafeStorage =
  typeof window === "undefined"
    ? undefined
    : ({
        getItem: (key: string) => window.localStorage.getItem(key),
        setItem: (key: string, value: string) => {
          try {
            window.localStorage.setItem(key, value);
          } catch (err) {
            const isQuota =
              err instanceof DOMException &&
              (err.name === "QuotaExceededError" ||
                err.code === 22 ||
                err.code === 1014);
            if (!isQuota) throw err;

            // Step 1: drop tournamentHistory and retry.
            let parsed: { state?: Record<string, unknown> } | null = null;
            try {
              parsed = JSON.parse(value) as { state?: Record<string, unknown> };
            } catch {
              // Unparseable — fall through to key removal.
            }
            if (parsed?.state) {
              try {
                delete parsed.state.tournamentHistory;
                window.localStorage.setItem(key, JSON.stringify(parsed));
                console.warn("[draftsim] QuotaExceededError: dropped tournamentHistory to fit quota.");
                return;
              } catch {
                // Step 2: also slim the active tournament by removing recapC.
                try {
                  const t = parsed.state.tournament as {
                    matches?: Array<{
                      series?: {
                        games?: Array<{
                          recap?: { recapC?: unknown };
                        }>;
                      };
                    }>;
                  } | null | undefined;
                  if (t?.matches) {
                    for (const m of t.matches) {
                      if (!m.series) continue;
                      for (const g of m.series.games ?? []) {
                        if (!g.recap) continue;
                        // Remove compact payload and fall back to full slim
                        // (strip the heavy fields if they somehow reappeared).
                        const rc = g.recap as Record<string, unknown>;
                        delete rc.recapC;
                        delete rc.winProbTimeline;
                        delete rc.goldLeadTimeline;
                        delete rc.notableEvents;
                        delete rc.perPickKDA;
                      }
                    }
                  }
                  window.localStorage.setItem(key, JSON.stringify(parsed));
                  console.warn("[draftsim] QuotaExceededError: dropped recapC + heavy fields from active tournament.");
                  return;
                } catch {
                  // Step 3: also drop tournamentHistory and the manual
                  // save slots from this slimmed copy.
                  try {
                    delete parsed.state.tournamentHistory;
                    delete parsed.state.savedTournaments;
                    window.localStorage.setItem(key, JSON.stringify(parsed));
                    console.warn("[draftsim] QuotaExceededError: dropped history + saved tournaments + recapC from active tournament.");
                    return;
                  } catch {
                    // Step 4: last resort — remove the key entirely.
                  }
                }
              }
            }

            try {
              window.localStorage.removeItem(key);
            } catch {
              // Storage truly broken — let the next render proceed
              // with in-memory state only.
            }
          }
        },
        removeItem: (key: string) => window.localStorage.removeItem(key),
      } satisfies Storage extends infer S
        ? Pick<S & Storage, "getItem" | "setItem" | "removeItem">
        : never);

export type MetaSource = "default" | "randomized" | "custom";

// One manual save slot (see DraftStore.savedTournaments). The tournament
// is stored compact-encoded (recapC) so the persisted payload stays small
// on both platforms; loadSavedTournament decodes it back to full form.
// Alongside the tournament itself we capture the tournament-scoped store
// context needed for a faithful resume: player form (hot/cold streaks)
// and the pre-tournament meta snapshot that rolls back live-meta
// evolution when the tournament ends or is abandoned.
export interface SavedTournamentEntry {
  /** Mirrors tournament.id — saving the same tournament upserts its slot. */
  id: string;
  savedAt: number;
  tournament: TournamentState;
  playerForms: PlayerFormMap;
  preTournamentMetaSnapshot: {
    metaOverride: MetaOverride | null;
    metaSource: MetaSource;
    metaEnabled: boolean;
    synergyOverride: Synergy[] | null;
    counterOverride: CounterPair[] | null;
  } | null;
}

// Saved-slot caps. Desktop files have no quota so the cap is generous;
// web shares the 5MB localStorage quota with everything else.
const SAVED_TOURNAMENTS_CAP_DESKTOP = 100;
const SAVED_TOURNAMENTS_CAP_WEB = 10;

function savedTournamentsCap(): number {
  return isDesktop() ? SAVED_TOURNAMENTS_CAP_DESKTOP : SAVED_TOURNAMENTS_CAP_WEB;
}

// One manual season save slot — mirrors SavedTournamentEntry. The season
// is stored with every stage tournament compact-encoded; loadSavedSeason
// decodes them back. Player form (season-long hot/cold streaks) is
// captured alongside so a resumed season feels identical.
export interface SavedSeasonEntry {
  /** Mirrors season.id — saving the same season upserts its slot. */
  id: string;
  savedAt: number;
  season: SeasonState;
  playerForms: PlayerFormMap;
}

// Seasons are heavy (20+ tournaments each), so the caps are tighter
// than tournament save slots.
const SAVED_SEASONS_CAP_DESKTOP = 20;
const SAVED_SEASONS_CAP_WEB = 3;

function savedSeasonsCap(): number {
  return isDesktop() ? SAVED_SEASONS_CAP_DESKTOP : SAVED_SEASONS_CAP_WEB;
}

// Season history entries are résumé snapshots — small, but they carry
// the season's initial + final tier tables (~3-8 kB each), so the web
// cap respects the shared 5 MB localStorage quota.
const SEASON_HISTORY_CAP_DESKTOP = 200;
const SEASON_HISTORY_CAP_WEB = 40;

function seasonHistoryCap(): number {
  return isDesktop() ? SEASON_HISTORY_CAP_DESKTOP : SEASON_HISTORY_CAP_WEB;
}

// ─── User preset libraries (Meta Tier Lists / Synergies & Counters) ───────
// Named, persisted presets the user builds in the two main-menu library
// sections. Applying a preset copies it into the ACTIVE overrides (the same
// path randomize/custom-edit use), so series and tournaments created
// afterwards pick it up via the normal metaSnapshot capture.

export interface MetaTierListPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  override: MetaOverride;
}

export interface PairingsPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  synergies: Synergy[];
  counters: CounterPair[];
}

function makePresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

interface DraftStore {
  series: SeriesState | null;
  selectedChampionId: number | null;
  secondsLeft: number | null;
  champions: Champion[];
  soundEnabled: boolean;
  volume: number;
  metaOverride: MetaOverride | null;
  // Bumps every time the override changes so React components keyed on this
  // can invalidate memoized lookups that depend on module state.
  metaVersion: number;
  metaSource: MetaSource;
  // Master switch for the meta tier system. When false, getMetaTier
  // returns null for everyone; AI scoring loses its meta-tier signal,
  // simulator's metaStrengthScore flattens, and tier badges hide.
  metaEnabled: boolean;
  // Random synergy / counter overrides. When non-null, replace the
  // baseline CHAMPION_SYNERGIES / HARD_COUNTERS lists everywhere those
  // are consulted (AI scoring, simulator, UI panels). Versions bump on
  // every change so dependent useMemos invalidate.
  synergyOverride: Synergy[] | null;
  synergyVersion: number;
  counterOverride: CounterPair[] | null;
  counterVersion: number;
  // Per-champion power-spike minute override (alias → minute, ≤ 14).
  // Generated alongside synergyOverride / counterOverride by the
  // randomizeSynergiesAndCounters action; later minutes mean a more
  // impactful spike event in the simulator.
  powerSpikeOverride: PowerSpikeOverride | null;
  powerSpikeVersion: number;
  // Rationale of the AI's current decision — populated when an AI turn
  // starts, cleared on lock or when control returns to a human. Read by the
  // overlay UI to surface the AI's reasoning during the hover phase.
  aiRationale: AIRationale | null;
  // History of rationales for the current game. Each entry is the rationale
  // captured at the moment the AI locked in. Cleared on game start. Used
  // by the post-draft "AI decisions" recap. Skip-fast-forwarded actions
  // are NOT recorded (skip prioritises speed over instrumentation).
  aiRationaleHistory: Array<{ actionIndex: number; rationale: AIRationale }>;
  // ─── Player form (feature 5) ────────────────────────────────────────────
  // Flat map of player form values keyed by `${teamKey}:${lane}`. Updated
  // after every applied/simulated game. Tournament-scoped when a tournament
  // is active (survives reload via persistence; resets per-tournament via
  // startTournament). Series-scoped for single-series play (resets on
  // startSimulation).
  playerForms: PlayerFormMap;
  // ─── Pre-tournament meta snapshot (feature 6 — live-meta rollback) ──────
  // Captured in startTournament for live-meta tournaments so the user's own
  // meta override (built in MetaEditor / via randomizeMeta) can be fully
  // restored when the tournament ends or is abandoned.
  //
  // Relationship with tournament.metaSnapshot:
  //   tournament.metaSnapshot = meta the TOURNAMENT was CREATED with (and
  //     the current evolved state for live-meta tournaments — it mutates as
  //     rounds complete). This is what every match and the AI uses for the
  //     duration of the event.
  //   preTournamentMetaSnapshot = meta the USER had configured BEFORE
  //     startTournament was called. This is what we restore to on exit/end
  //     so the evolved tiers don't bleed into subsequent standalone drafts.
  //
  // For non-live-meta tournaments the two snapshots are identical, so
  // we only save/restore for live-meta. Persisted so a reload mid-tournament
  // still restores cleanly. Cleared (set to null) after restore.
  preTournamentMetaSnapshot: {
    metaOverride: MetaOverride | null;
    metaSource: MetaSource;
    metaEnabled: boolean;
    synergyOverride: Synergy[] | null;
    counterOverride: CounterPair[] | null;
  } | null;
  // ─── Side choice pending state (feature 4 / loser-picks) ───────────────
  // Set to true when the active series is under "loser-picks" and the human
  // team is the one that holds the side choice. UI renders a picker;
  // cleared when chooseSide() is called.
  sideChoicePending: boolean;

  setChampions: (champions: Champion[]) => void;
  setSoundEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  randomizeMetaTiers: () => void;
  resetMetaTiers: () => void;
  applyCustomMeta: (override: MetaOverride) => void;
  setMetaEnabled: (enabled: boolean) => void;
  randomizeSynergiesAndCounters: () => void;
  resetSynergiesAndCounters: () => void;
  hydrateMetaFromStorage: () => void;
  startSimulation: (settings: SimulationSettings) => void;
  selectChampion: (id: number | null) => void;
  lockIn: () => void;
  timeout: () => void;
  // Resolves the current AI action and applies it to the game state. No-op
  // if it isn't actually the AI's turn (mode/aiSide guard) or the draft is
  // already complete. The optional `preDecidedId` lets the caller pre-compute
  // the AI's choice (for hover/preview) and pass it through, so the locked
  // champion is guaranteed to match the previewed one — important because
  // chooseAIAction has random jitter and recomputing would give a different
  // result.
  triggerAIAction: (preDecidedId?: number) => void;
  // Fast-forward the rest of the draft by resolving every remaining AI
  // action synchronously. Used by the "Skip Draft" button in AI vs AI mode.
  // Stops as soon as it reaches a non-AI action, or the draft completes.
  completeAIDraft: () => void;
  // Set/clear the AI's current decision rationale. DraftView writes this
  // when an AI turn begins so the lock-in panel can render the breakdown.
  setAIRationale: (r: AIRationale | null) => void;
  tickTimer: () => void;
  // Commit both teams' game plans (chosen on the StrategyView) onto the
  // current game and advance the series from "strategy" → "between-games".
  // No-op unless the series is currently in the "strategy" stage.
  confirmStrategies: (
    blueStrategy: TeamStrategy,
    redStrategy: TeamStrategy,
  ) => void;
  declareWinner: (side: Side, recap?: import("@/lib/types").GameRecap) => void;
  // Advance to the next game in the series. Side assignment is
  // automatic: the team that LOST the previous game gets blue side
  // ("loser picks side, always picks blue") — convention shipped pro
  // tournaments. Optional explicit override accepts a boolean to force
  // a swap regardless of the auto rule (kept for manual control).
  proceedToNextGame: (swapSides?: boolean) => void;
  swapPickSlots: (
    gameIndex: number,
    side: Side,
    slotA: number,
    slotB: number,
  ) => void;
  resetAll: () => void;

  // ─── Tournament mode (Phase 1) ─────────────────────────────────────
  // When non-null, the app runs in tournament mode. The active match is
  // tracked by `tournament.activeMatchId`; when set, the existing series
  // flow drives that match's series and `series` mirrors the match's
  // `series` field. When the match completes, finishMatch() captures the
  // winner, advances the bracket, and clears the active series.
  tournament: TournamentState | null;
  // Past tournaments (Phase 4). Snapshots saved when status transitions
  // to "complete". Capped to the most recent 20 to keep persisted
  // localStorage payload small.
  tournamentHistory: TournamentState[];
  // Transient flag set while a sim-one-match or sim-all-remaining run is
  // in progress. The bulk actions run an async loop that yields to the
  // event loop between matches (so the UI thread breathes) and commits
  // batched state updates; the flag drives the SimulatingOverlay and
  // guards against re-entry.
  simulating: null | "match" | "all";
  // Lightweight progress readout for the SimulatingOverlay while a bulk
  // sim runs ("23/56 matches"). Intentionally NOT persisted (partialize
  // whitelist) and only two numbers, so the per-update set() is cheap.
  simProgress: { done: number; total: number } | null;
  // Open a history entry for review — sets it as the active tournament.
  // The dashboard renders it in its already-complete state.
  loadFromHistory: (tournamentId: string) => void;
  // Permanently remove a history entry.
  deleteHistoryEntry: (tournamentId: string) => void;
  // Wipe history entirely. No confirm — caller's responsibility.
  clearHistory: () => void;
  // ─── Saved tournaments (manual save slots, separate from history) ──
  // History holds only FINISHED tournaments; this list holds explicit
  // user saves made from the dashboard's Save button, at ANY stage of
  // the tournament. Full state is captured — bracket, per-game recaps,
  // meta snapshot + evolution log (meta shifting), pick histories — so
  // win/loss streaks and live meta resume exactly where they were.
  savedTournaments: SavedTournamentEntry[];
  // Snapshot the active tournament into savedTournaments (upsert by
  // tournament id). Returns false when no tournament is active.
  saveCurrentTournament: () => boolean;
  // Restore a saved entry as the active tournament — resumes the active
  // match's series, the tournament meta, and player forms.
  loadSavedTournament: (entryId: string) => void;
  // Clone a saved entry under a fresh tournament id + "(Copy)" name.
  duplicateSavedTournament: (entryId: string) => void;
  // Permanently remove a saved entry.
  deleteSavedTournament: (entryId: string) => void;
  // Wipe all saved entries. No confirm — caller's responsibility.
  clearSavedTournaments: () => void;
  // ─── Season mode ─────────────────────────────────────────────────────
  // A full competitive year: 6 leagues × 3 splits + First Stand, MSI,
  // and Worlds, all built on the tournament engine. `season` is the
  // single active season (persisted); `seasonViewOpen` routes between
  // the main menu and the season dashboard while keeping the season
  // alive in the background.
  season: SeasonState | null;
  seasonViewOpen: boolean;
  // User's meta config captured at season start; re-applied when the
  // user leaves the season view (and on abandon) so a season's evolved
  // meta never bleeds into standalone play.
  preSeasonMetaSnapshot: {
    metaOverride: MetaOverride | null;
    metaSource: MetaSource;
    metaEnabled: boolean;
    synergyOverride: Synergy[] | null;
    counterOverride: CounterPair[] | null;
  } | null;
  startSeason: (config: SeasonConfig, teams: SeasonTeam[]) => void;
  // Re-open the season dashboard from the menu (applies season meta).
  openSeason: () => void;
  // Back to the main menu; season stays active (restores user meta).
  exitSeasonView: () => void;
  // Permanently delete the season (restores user meta).
  abandonSeason: () => void;
  // Load one of the season's tournaments as the active tournament so
  // the user can browse its bracket or play/sim matches through the
  // normal tournament flow. Updates sync back into the season.
  openSeasonTournament: (tournamentId: string) => void;
  // Simulate the current phase (all its tournaments), the entire
  // remaining season, or one specific tournament (a single league's
  // split, or one international). Auto-advances phases, applies patch
  // shifts, and crowns the Worlds champion.
  simSeason: (scope: "phase" | "all" | { tournamentId: string }) => void;
  // ─── Saved seasons (manual save slots, like saved tournaments) ─────
  savedSeasons: SavedSeasonEntry[];
  // Snapshot the active season (upsert by season id). Returns false
  // when no season is active.
  saveCurrentSeason: () => boolean;
  // Restore a saved season as the active one and open its dashboard.
  loadSavedSeason: (entryId: string) => void;
  // Clone a saved season under a fresh id + "(Copy)" name.
  duplicateSavedSeason: (entryId: string) => void;
  deleteSavedSeason: (entryId: string) => void;
  clearSavedSeasons: () => void;
  // ─── Season history (Hall of Seasons) ───────────────────────────────
  // Lightweight résumé archive of past seasons — Worlds champion &
  // finalist, international title holders, split champions. Entries
  // upsert by season id; archiving is the user's explicit choice.
  seasonHistory: SeasonHistoryEntry[];
  /** Archive the ACTIVE season's résumé. Returns false with no season. */
  archiveSeasonToHistory: () => boolean;
  /** Archive a saved season's résumé without loading it. */
  archiveSavedSeasonToHistory: (entryId: string) => boolean;
  removeSeasonFromHistory: (entryId: string) => void;
  clearSeasonHistory: () => void;
  /** Merge entries parsed from an imported .xlsx (upsert by id, newest
   *  archive first). Returns how many were new vs. overwritten. */
  importSeasonHistory: (
    entries: SeasonHistoryEntry[],
  ) => { added: number; updated: number };

  // ─── Preset libraries (main-menu sections) ─────────────────────────
  // Saved meta tier lists. createMetaPreset returns the new preset id.
  metaPresets: MetaTierListPreset[];
  createMetaPreset: (name: string, override: MetaOverride) => string;
  updateMetaPreset: (
    id: string,
    patch: Partial<Pick<MetaTierListPreset, "name" | "override">>,
  ) => void;
  deleteMetaPreset: (id: string) => void;
  duplicateMetaPreset: (id: string) => void;
  // Copy the preset into the active meta override (same path as
  // applyCustomMeta) so subsequent series/tournaments use it.
  applyMetaPreset: (id: string) => void;
  // Saved synergy + counter sets, same lifecycle as meta presets.
  pairingsPresets: PairingsPreset[];
  createPairingsPreset: (
    name: string,
    synergies: Synergy[],
    counters: CounterPair[],
  ) => string;
  updatePairingsPreset: (
    id: string,
    patch: Partial<Pick<PairingsPreset, "name" | "synergies" | "counters">>,
  ) => void;
  deletePairingsPreset: (id: string) => void;
  duplicatePairingsPreset: (id: string) => void;
  applyPairingsPreset: (id: string) => void;
  startTournament: (params: CreateTournamentParams) => void;
  // Import a previously-exported tournament from a TOUR1: code string.
  // Returns a result object so the caller can show error feedback. On
  // success, the tournament replaces any current tournament/series.
  importTournament: (code: string) => Promise<{ ok: boolean; error?: string }>;
  // Begin a match: copies the match's series (or creates a fresh one
  // from the match's settings + the team names from the tournament) into
  // the store's `series` field and sets `activeMatchId`. Optional
  // `overrides` lets the caller change the match's format/mode/fearless
  // for THIS match only (Phase 2.3 per-match overrides).
  startMatch: (
    matchId: string,
    overrides?: Partial<{
      format: import("@/lib/types").SeriesFormat;
      fearless: boolean;
      mode: import("@/lib/types").DraftMode;
      aiSide: import("@/lib/types").Side | null;
      aiDifficulty: import("@/lib/types").AIDifficulty;
    }>,
  ) => void;
  // Called when the active match's series ends (winner declared on the
  // last game). Records the winner against the tournament match,
  // advances the winner to the next match's slot, clears the active
  // series, and returns control to the dashboard.
  finishMatch: () => void;
  // Groups+playoffs: freeze the group standings and generate the
  // single-elim playoff bracket with the top-N teams. No-op when not
  // a groups-playoffs tournament or when already started.
  generatePlayoffBracket: () => void;
  // Auto-play a single tournament match. Shares the AI-vs-AI auto-draft
  // + sim pipeline with simulateAllRemaining but scopes to one match
  // and updates state once when that match resolves. No-op when the
  // match doesn't exist, is already complete, or has unfilled team slots.
  simulateOneMatch: (matchId: string) => void;
  // Auto-play a batch of matches. Iterates over the supplied ids in
  // order, auto-playing each one and advancing tournament state in
  // between (so cross-match fearless and dynamic Swiss-round generation
  // both behave correctly). Used by per-round / per-matchday / group-
  // stage Sim buttons.
  simulateMatches: (matchIds: string[]) => void;
  // Spectator mode: auto-play every remaining match end-to-end. Forces
  // every match into AI vs AI for the duration of the run so drafts and
  // game outcomes resolve without user input. Updates tournament state
  // once at the end (single set call) so the UI doesn't thrash through
  // intermediate animations.
  simulateAllRemaining: () => void;
  // Exit tournament mode entirely (back to main menu). Aborts any
  // active match — won't persist mid-match progress beyond what's
  // already in `series`.
  exitTournament: () => void;
  // ─── Feature 4: loser-picks side choice ────────────────────────────────
  /** Apply the human's side choice under "loser-picks". No-op when there
   *  is no pending choice or the series isn't between games. Clears
   *  `sideChoicePending` and starts the next game. */
  chooseSide: (side: "blue" | "red") => void;
}

function allChampionIds(champs: Champion[]): number[] {
  return champs.map((c) => c.id);
}

// Auto-play a single tournament match in AI-vs-AI mode end-to-end.
// Returns [updatedTournament, updatedPlayerForms] after recording the match
// winner, advancing the bracket, and appending picks to cross-match
// histories. Pure: never reads or writes the store. Used by both
// simulateOneMatch (single-match) and simulateAllRemaining (loop).
function autoPlayMatch(
  workingTournament: TournamentState,
  matchId: string,
  champions: Champion[],
  playerForms: PlayerFormMap = {},
): [TournamentState, PlayerFormMap] {
  const match = workingTournament.matches.find((m) => m.id === matchId);
  if (!match) return [workingTournament, playerForms];
  if (match.winner) return [workingTournament, playerForms];
  if (match.blueTeamId == null || match.redTeamId == null) {
    return [workingTournament, playerForms];
  }
  const blueTeam = workingTournament.teams.find(
    (t) => t.id === match.blueTeamId,
  );
  const redTeam = workingTournament.teams.find(
    (t) => t.id === match.redTeamId,
  );
  if (!blueTeam || !redTeam) return [workingTournament, playerForms];
  const allIds = allChampionIds(champions);
  // Tournament momentum context — star ratings + win streaks +
  // round-depth in one lookup. Falls back to plain star ratings if the
  // context can't be assembled (defensive against partially-decoded
  // tournament state).
  const tctx = tournamentSeriesContext(workingTournament, matchId);
  let series = createSeries({
    format: match.format,
    fearless: match.fearless,
    timerEnabled: false,
    blueTeam: blueTeam.name,
    redTeam: redTeam.name,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: match.aiDifficulty,
    blueAiDifficulty: blueTeam.aiDifficulty,
    redAiDifficulty: redTeam.aiDifficulty,
    blueStarRating: tctx?.blueStarRating ?? teamStarRating(blueTeam),
    redStarRating: tctx?.redStarRating ?? teamStarRating(redTeam),
    blueWinStreak: tctx?.blueWinStreak,
    redWinStreak: tctx?.redWinStreak,
    tournamentRound: tctx?.roundDepth,
    bluePlayers: blueTeam.players,
    redPlayers: redTeam.players,
    // Personality ids follow teams.
    bluePersonalityId: blueTeam.personalityId,
    redPersonalityId: redTeam.personalityId,
    // Side-assignment rule from the tournament.
    sideRule: workingTournament.sideRule,
  });
  let currentForms = playerForms;
  while (series.status !== "complete") {
    const crossLocked = crossMatchFearlessLocked(
      workingTournament,
      matchId,
    );
    const perSeriesLocked = fearlessLockedSet(series);
    const locked = new Set<number>([...perSeriesLocked, ...crossLocked]);
    const tournamentWR = computeTournamentChampionWR(workingTournament);
    let game = currentGame(series);
    while (currentAction(game)) {
      const action = currentAction(game)!;
      // Use the personality for whichever side is currently acting.
      const personality = getPersonality(
        action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
      );
      const championId = chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(series, action.side, champions, tournamentWR),
        Math.random,
        personality,
      );
      if (championId == null) {
        game = applyTimeout(game, allIds, locked);
      } else {
        game = applyLock(game, championId);
        locked.add(championId);
      }
    }
    game = finalizeRoles(game, champions, series);
    // AI auto-play picks each side's game plan using series-adaptive
    // chooseAIStrategyForGame so plans evolve within the match based on
    // how prior games went (deny their best carry, flip tempo after a
    // loss, etc.).
    {
      const byId = new Map(champions.map((c) => [c.id, c]));
      const toChamps = (ids: (number | null)[]) =>
        ids.map((id) => (id != null ? byId.get(id) ?? null : null));
      const blueChamps = toChamps(game.bluePicks);
      const redChamps = toChamps(game.redPicks);
      const wins = winsByTeamName(series);
      const blueWins = wins.get(game.blueTeam) ?? 0;
      const redWins = wins.get(game.redTeam) ?? 0;
      const gamesToWin = requiredWins(series.format);
      // Build prior-game summaries (team-following — pass team names).
      const bluePrior = buildPriorGamesForTeam(series, game.blueTeam, game.redTeam);
      const redPrior = buildPriorGamesForTeam(series, game.redTeam, game.blueTeam);
      game = {
        ...game,
        blueStrategy: chooseAIStrategyForGame({
          picks: blueChamps,
          context: {
            enemyPicks: redChamps,
            roster: series.bluePlayers,
            enemyRoster: series.redPlayers,
            selfWins: blueWins,
            oppWins: redWins,
            gamesToWin,
            rng: Math.random,
          },
          priorGames: bluePrior,
          opponentName: game.redTeam,
          rng: Math.random,
        }),
        redStrategy: chooseAIStrategyForGame({
          picks: redChamps,
          context: {
            enemyPicks: blueChamps,
            roster: series.redPlayers,
            enemyRoster: series.bluePlayers,
            selfWins: redWins,
            oppWins: blueWins,
            gamesToWin,
            rng: Math.random,
          },
          priorGames: redPrior,
          opponentName: game.blueTeam,
          rng: Math.random,
        }),
      };
    }
    series = {
      ...series,
      games: [...series.games.slice(0, -1), game],
    };
    // Feature 5: pass player forms to the simulator.
    const blueKey = blueTeam.id;
    const redKey = redTeam.id;
    const result = simulateMatch(game, champions, {
      scoreBias: starRatingBias(series),
      bluePlayers: series.bluePlayers,
      redPlayers: series.redPlayers,
      playerForms: {
        blue: sideFormsFor(currentForms, blueKey),
        red: sideFormsFor(currentForms, redKey),
      },
      adaptiveMidgame: true,
    });
    const recap = buildGameRecap(game, champions, result);
    // Update forms after the game.
    if (recap.ratings) {
      currentForms = applyRatingsToForms(currentForms, blueKey, recap.ratings.blue);
      currentForms = applyRatingsToForms(currentForms, redKey, recap.ratings.red);
    } else {
      const derived = computeGameRatings(recap, result.winner);
      if (derived) {
        currentForms = applyRatingsToForms(currentForms, blueKey, derived.blue);
        currentForms = applyRatingsToForms(currentForms, redKey, derived.red);
      }
    }
    series = recordWinner(series, result.winner, recap);
    if (series.status === "between-games") {
      // Feature 4: respect the tournament's sideRule.
      const rule = effectiveSideRule(series);
      if (rule === "loser-picks") {
        // In bulk auto-sim both teams are AI — resolve the choice immediately.
        const chooser = series.sideChooser;
        if (chooser) {
          const chooserTeam = chooser === blueTeam.name ? blueTeam : redTeam;
          const teamPicks: number[] = [];
          for (const g of series.games) {
            const picksArr = g.blueTeam === chooser ? g.bluePicks : g.redPicks;
            for (const id of picksArr) if (id != null) teamPicks.push(id);
          }
          const chosenSide = chooseSideAI(
            { players: chooserTeam.players, pickHistory: teamPicks },
            Math.random,
          );
          series = applySideChoice(series, chosenSide);
        }
      } else {
        const sides = nextGameSides(series);
        if (sides) {
          series = startNextGame(series, sides.blueTeam, sides.redTeam);
        } else {
          const lastGame = series.games[series.games.length - 1];
          const swap = lastGame?.winner === "blue";
          const newBlue = swap ? series.redTeam : series.blueTeam;
          const newRed = swap ? series.blueTeam : series.redTeam;
          series = startNextGame(series, newBlue, newRed);
        }
      }
    }
  }
  const wins = winsByTeamName(series);
  const blueWins = wins.get(blueTeam.name) ?? 0;
  const redWins = wins.get(redTeam.name) ?? 0;
  // Resolve winner from the series's authoritative winner-side, then
  // map back to the match's TEAM id by name (handles side-swaps mid-
  // series). Falls back to game-count comparison only if the series
  // somehow lacks a definitive `winner` — defensive against legacy or
  // malformed states.
  const winningTeamId = (() => {
    if (series.winner) {
      const winningName =
        series.winner === "blue" ? series.blueTeam : series.redTeam;
      if (winningName === blueTeam.name) return blueTeam.id;
      if (winningName === redTeam.name) return redTeam.id;
    }
    return blueWins > redWins ? blueTeam.id : redTeam.id;
  })();
  const matchesWithSeries = workingTournament.matches.map((m) =>
    m.id === matchId ? { ...m, series } : m,
  );
  const tournamentWithSeries: TournamentState = {
    ...workingTournament,
    matches: matchesWithSeries,
  };
  const withPicks = appendMatchPicks(tournamentWithSeries, matchId, series);
  const finalTournament = recordMatchWinner(withPicks, matchId, {
    teamId: winningTeamId,
    blueWins,
    redWins,
  });
  return [finalTournament, currentForms];
}

// Strip heavy per-game fields from a tournament snapshot before
// archiving so localStorage stays under the 5MB quota. The bulky
// data (event timelines, notable-event arrays, per-pick KDA) lives on
// game.recap; we keep the lightweight summary fields (mvp, biggest
// swing, duration, lane gold diff) so the post-tournament recap and
// per-game replay still work — just without the win-prob chart and
// damage bars on history-loaded tournaments. The user can re-run
// tournaments fresh to get the full replay; history is for browsing.
function slimTournamentForArchive(
  tournament: TournamentState,
): TournamentState {
  return {
    ...tournament,
    matches: tournament.matches.map((m) => {
      if (!m.series) return m;
      return {
        ...m,
        series: {
          ...m.series,
          games: m.series.games.map((g) => {
            if (!g.recap) return g;
            const slim = { ...g.recap };
            delete slim.winProbTimeline;
            delete slim.goldLeadTimeline;
            delete slim.notableEvents;
            delete slim.perPickKDA;
            return { ...g, recap: slim };
          }),
        },
      };
    }),
  };
}

// Compact encoding for the active tournament's recaps (v6 persistence
// format) now lives in lib/recapCompression.ts — memoized by object
// identity so partialize (which runs on EVERY set) only pays encoding
// cost for recaps/matches that actually changed. Archived history still
// uses slimTournamentForArchive on web (no chart data at all).

// Decode compact-encoded recaps in a tournament back to their full form.
// Inverse of compactEncodeTournamentForPersist. Called in onRehydrateStorage
// so all consumers (replay modal, charts, recap panels) see normal data.
function decodeCompactTournament(tournament: TournamentState): TournamentState {
  return {
    ...tournament,
    matches: tournament.matches.map((m) => {
      if (!m.series) return m;
      return {
        ...m,
        series: {
          ...m.series,
          games: m.series.games.map((g) => {
            if (!g.recap) return g;
            // Check for compact payload — may be absent (archived history
            // recaps, or legacy v5 slim recaps which have no recapC).
            const recap = g.recap as typeof g.recap & { recapC?: RecapCompact };
            const compact = recap.recapC;
            if (!compact) return g;
            // Decode and strip the storage-only recapC sentinel field.
            const full = decodeRecapHeavyFields(recap, compact);
            const withoutC = { ...full } as typeof full & { recapC?: unknown };
            delete withoutC.recapC;
            return { ...g, recap: withoutC };
          }),
        },
      };
    }),
  };
}

// Snapshot a completed tournament into the history list. No-op if the
// tournament isn't complete or already exists in history.
//
// Desktop mode: cap raised to 200; full recaps are kept with compact
// encoding (recapC) so replay charts survive in history. The file-based
// storage has no 5 MB quota so we don't need to slim down.
//
// Web mode: cap is 5 and recaps are slimmed to stay under localStorage
// quota (same behaviour as before).
function archiveCompletedTournament(
  tournament: TournamentState,
  history: TournamentState[],
): TournamentState[] {
  if (tournament.status !== "complete") return history;
  // Season stages don't archive individually — the season engine owns
  // their lifecycle and they'd flood history (a season has 20+ stages).
  if (tournament.seasonId) return history;
  if (history.some((t) => t.id === tournament.id)) return history;
  if (isDesktop()) {
    // Keep full recaps with compact encoding on desktop — files have no
    // meaningful quota, and compact encoding keeps sizes reasonable.
    const compact = compactEncodeTournamentForPersist(tournament);
    const next = [compact, ...history];
    return next.slice(0, 200);
  }
  const next = [slimTournamentForArchive(tournament), ...history];
  return next.slice(0, 5);
}

// Apply the pre-tournament meta snapshot back to the active module
// singletons and return a Zustand-compatible partial state patch. Called
// by exitTournament and tournament-completion paths when a live-meta
// tournament ends so the evolved tiers don't bleed into subsequent
// standalone drafts. When `snap` is null (non-live-meta tournament, or
// no snapshot was saved), returns an empty patch — nothing to restore.
function buildMetaRestorePatch(
  snap: {
    metaOverride: MetaOverride | null;
    metaSource: MetaSource;
    metaEnabled: boolean;
    synergyOverride: Synergy[] | null;
    counterOverride: CounterPair[] | null;
  } | null,
  currentMetaVersion: number,
  currentSynergyVersion: number,
  currentCounterVersion: number,
): Partial<{
  metaOverride: MetaOverride | null;
  metaSource: MetaSource;
  metaEnabled: boolean;
  metaVersion: number;
  synergyOverride: Synergy[] | null;
  synergyVersion: number;
  counterOverride: CounterPair[] | null;
  counterVersion: number;
  preTournamentMetaSnapshot: null;
}> {
  if (!snap) return {};
  // Apply to imperative singletons so AI scoring and the draft engine
  // immediately see the restored tiers.
  setActiveMetaOverride(snap.metaOverride);
  setMetaEnabled(snap.metaEnabled);
  saveMetaOverride(snap.metaOverride);
  saveMetaSource(snap.metaSource);
  saveMetaEnabled(snap.metaEnabled);
  setActiveSynergyOverride(snap.synergyOverride);
  saveSynergyOverride(snap.synergyOverride);
  setActiveCounterOverride(snap.counterOverride);
  saveCounterOverride(snap.counterOverride);
  return {
    metaOverride: snap.metaOverride,
    metaSource: snap.metaSource,
    metaEnabled: snap.metaEnabled,
    metaVersion: currentMetaVersion + 1,
    synergyOverride: snap.synergyOverride,
    synergyVersion: currentSynergyVersion + 1,
    counterOverride: snap.counterOverride,
    counterVersion: currentCounterVersion + 1,
    // Consume the snapshot — clear it so a second exit call is a no-op.
    preTournamentMetaSnapshot: null,
  };
}

// Apply an arbitrary meta snapshot to the imperative singletons +
// produce the store patch. Shared by the season-mode meta swaps
// (enter season → season meta; leave season → user meta). Unlike
// buildMetaRestorePatch this does NOT consume any snapshot field.
function applyMetaSnapshotPatch(
  snap: {
    metaOverride: MetaOverride | null;
    metaSource: MetaSource;
    metaEnabled: boolean;
    synergyOverride: Synergy[] | null;
    counterOverride: CounterPair[] | null;
  },
  state: Pick<DraftStore, "metaVersion" | "synergyVersion" | "counterVersion">,
): Partial<DraftStore> {
  setActiveMetaOverride(snap.metaOverride);
  setMetaEnabled(snap.metaEnabled);
  saveMetaOverride(snap.metaOverride);
  saveMetaSource(snap.metaSource);
  saveMetaEnabled(snap.metaEnabled);
  setActiveSynergyOverride(snap.synergyOverride);
  saveSynergyOverride(snap.synergyOverride);
  setActiveCounterOverride(snap.counterOverride);
  saveCounterOverride(snap.counterOverride ? [...snap.counterOverride] : null);
  return {
    metaOverride: snap.metaOverride,
    metaSource: snap.metaSource,
    metaEnabled: snap.metaEnabled,
    metaVersion: state.metaVersion + 1,
    synergyOverride: snap.synergyOverride,
    synergyVersion: state.synergyVersion + 1,
    counterOverride: snap.counterOverride ? [...snap.counterOverride] : null,
    counterVersion: state.counterVersion + 1,
  };
}

// Backfill cosmetic identity (icon/color/personality) on seasons
// persisted by builds that predate those fields on SeasonTeam — they
// rendered as an invisible color swatch + the generic shield icon.
// Identity is also propagated into every tournament's team copies
// (tournaments snapshot it at creation). No-op (same reference) for
// healthy seasons.
function ensureSeasonIdentities(season: SeasonState): SeasonState {
  const teams = ensureTeamIdentities(season.teams);
  const byId = new Map(teams.map((t) => [t.id, t]));
  // Tournament copies are checked even when the season teams are already
  // healthy: a prior load may have repaired (and persisted) the season
  // teams while leaving stale tournament snapshots behind.
  let tournamentsChanged = false;
  const tournaments = Object.fromEntries(
    Object.entries(season.tournaments).map(([id, t]) => {
      let teamsChanged = false;
      const fixed = t.teams.map((tt) => {
        const st = byId.get(tt.id);
        if (!st || (tt.iconKey && tt.color && tt.personalityId)) return tt;
        teamsChanged = true;
        return {
          ...tt,
          iconKey: tt.iconKey || st.iconKey,
          color: tt.color || st.color,
          personalityId: tt.personalityId || st.personalityId,
        };
      });
      if (!teamsChanged) return [id, t] as const;
      tournamentsChanged = true;
      return [id, { ...t, teams: fixed }] as const;
    }),
  );
  if (teams === season.teams && !tournamentsChanged) return season;
  return {
    ...season,
    teams,
    tournaments: tournamentsChanged ? tournaments : season.tournaments,
  };
}

// While the season view is open the ACTIVE meta IS the season's
// currentMeta (openSeason / loadSavedSeason apply it, exitSeasonView
// restores the user's own). Any meta mutation made from inside the
// season therefore has to write through into season.currentMeta, or
// the next season tournament would snapshot the pre-edit meta.
function seasonMetaWriteThrough(
  s: Pick<DraftStore, "season" | "seasonViewOpen">,
  patch: Partial<SeasonMetaSnapshot>,
): Partial<DraftStore> {
  if (!s.season || !s.seasonViewOpen) return {};
  return {
    season: {
      ...s.season,
      updatedAt: Date.now(),
      currentMeta: { ...s.season.currentMeta, ...patch },
    },
  };
}

// Mirror an updated season tournament back into the season state and
// run the engine's consequences (placements, phase advancement, Worlds
// main-event creation, champion). Returns an empty patch for
// non-season tournaments so call sites can spread it unconditionally.
function seasonPatchFor(
  state: Pick<DraftStore, "season" | "champions">,
  t: TournamentState | null | undefined,
): { season?: SeasonState } {
  if (!t || !t.seasonId || !state.season || state.season.id !== t.seasonId) {
    return {};
  }
  return {
    season: applySeasonTournamentUpdate(state.season, t, state.champions),
  };
}

// Is `side` driven by the AI in this series?
function isAISide(series: SeriesState, side: Side): boolean {
  if (series.mode === "aivai") return true;
  if (series.mode === "pvai") return series.aiSide === side;
  return false;
}

// Build the PriorGameSummary history for a given team (by NAME) from a series.
// Follows the team across side swaps so the history covers all completed games
// regardless of which side the team occupied. Used by chooseAIStrategyForGame.
function buildPriorGamesForTeam(
  series: SeriesState,
  teamName: string,
  opponentName: string,
): PriorGameSummary[] {
  const result: PriorGameSummary[] = [];
  // Walk all completed games except the current (last) one.
  const completedGames = series.games.slice(0, -1);
  for (const game of completedGames) {
    if (game.winner == null) continue;
    const teamIsBlue = game.blueTeam === teamName;
    const teamSide: Side = teamIsBlue ? "blue" : "red";
    const won = game.winner === teamSide;
    const strategy = teamIsBlue ? game.blueStrategy : game.redStrategy;
    const oppStrategy = teamIsBlue ? game.redStrategy : game.blueStrategy;
    if (!strategy) continue; // skip games without strategy data
    // Gold diff from this team's perspective. goldLeadTimeline is
    // blue-positive; flip for red.
    const goldTimeline = game.recap?.goldLeadTimeline;
    const finalGoldBlue = goldTimeline?.at(-1)?.goldLead ?? null;
    const goldDiff =
      finalGoldBlue != null
        ? teamIsBlue
          ? finalGoldBlue
          : -finalGoldBlue
        : undefined;
    const stomp =
      goldDiff != null ? Math.abs(goldDiff) >= 7000 : undefined;
    result.push({
      strategy,
      won,
      goldDiff: goldDiff ?? undefined,
      stomp,
      durationMinutes: game.recap?.durationMinutes,
      opponentStrategy: oppStrategy,
      opponentName,
    });
  }
  return result;
}

// Pick a random personality id from PERSONALITY_LIST. Used when assigning
// personalities to AI tournament teams at creation time.
function randomPersonalityId(): string {
  const idx = Math.floor(Math.random() * PERSONALITY_LIST.length);
  return PERSONALITY_LIST[idx].id;
}

// Positional picks for one side. AI sides (above Easy) get the flex optimizer
// — champions placed in the lanes that maximize meta tier + their player's
// comfort. Human sides (and Easy AI) keep the greedy primary-lane assignment
// and rely on the manual swap UI.
function positionalPicksForSide(
  picks: (number | null)[],
  champions: Champion[],
  series: SeriesState | undefined,
  side: Side,
): (number | null)[] {
  if (
    series &&
    isAISide(series, side) &&
    difficultyForSide(series, side) !== "easy"
  ) {
    const roster = side === "blue" ? series.bluePlayers : series.redPlayers;
    return optimizeRoleAssignment(picks, champions, roster);
  }
  return reorderPicksByPosition(picks, champions);
}

// When a game completes, reorder picks into positional (top→support) order and
// fix the role slots. After this, swap operations exchange champions between
// positional slots while the role labels stay in place. When `series` is
// supplied, AI-controlled sides flex-optimize their assignment first (see
// positionalPicksForSide) so the bots play their comfort/meta-best lanes.
function finalizeRoles(
  game: GameDraft,
  champions: Champion[],
  series?: SeriesState,
): GameDraft {
  if (game.status !== "complete") return game;
  return {
    ...game,
    bluePicks: positionalPicksForSide(game.bluePicks, champions, series, "blue"),
    redPicks: positionalPicksForSide(game.redPicks, champions, series, "red"),
    blueRoles: [...POSITIONAL_LANES],
    redRoles: [...POSITIONAL_LANES],
  };
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
  series: null,
  selectedChampionId: null,
  secondsLeft: null,
  champions: [],
  soundEnabled: true,
  volume: 1.0,
  metaOverride: null,
  metaVersion: 0,
  metaSource: "default" as MetaSource,
  metaEnabled: true,
  synergyOverride: null,
  synergyVersion: 0,
  counterOverride: null,
  counterVersion: 0,
  powerSpikeOverride: null,
  powerSpikeVersion: 0,
  aiRationale: null,
  aiRationaleHistory: [],
  tournament: null,
  tournamentHistory: [],
  savedTournaments: [],
  metaPresets: [],
  pairingsPresets: [],
  season: null,
  seasonViewOpen: false,
  preSeasonMetaSnapshot: null,
  savedSeasons: [],
  seasonHistory: [],
  simulating: null,
  simProgress: null,
  playerForms: {},
  sideChoicePending: false,
  preTournamentMetaSnapshot: null,

  loadFromHistory: (tournamentId) => {
    const state = get();
    const entry = state.tournamentHistory.find((t) => t.id === tournamentId);
    if (!entry) return;
    // Restore the meta snapshot if the history entry has one — same
    // logic as importTournament so re-opening a past tournament shows
    // it under the meta + pairings it was originally played on.
    const snap = entry.metaSnapshot;
    const metaPatch =
      snap !== undefined
        ? {
            metaOverride: snap.metaOverride ?? null,
            metaSource: (snap.metaOverride
              ? "custom"
              : "default") as MetaSource,
            metaEnabled: snap.metaEnabled,
            metaVersion: state.metaVersion + 1,
            ...(snap.synergyOverride !== undefined
              ? {
                  synergyOverride: snap.synergyOverride ?? null,
                  synergyVersion: state.synergyVersion + 1,
                }
              : {}),
            ...(snap.counterOverride !== undefined
              ? {
                  counterOverride: snap.counterOverride ?? null,
                  counterVersion: state.counterVersion + 1,
                }
              : {}),
          }
        : {};
    if (snap !== undefined) {
      setActiveMetaOverride(snap.metaOverride ?? null);
      setMetaEnabled(snap.metaEnabled);
      saveMetaOverride(snap.metaOverride ?? null);
      saveMetaSource(snap.metaOverride ? "custom" : "default");
      saveMetaEnabled(snap.metaEnabled);
      if (snap.synergyOverride !== undefined) {
        setActiveSynergyOverride(snap.synergyOverride ?? null);
        saveSynergyOverride(snap.synergyOverride ?? null);
      }
      if (snap.counterOverride !== undefined) {
        setActiveCounterOverride(snap.counterOverride ?? null);
        saveCounterOverride(snap.counterOverride ?? null);
      }
    }
    set({
      tournament: { ...entry, activeMatchId: null },
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      ...metaPatch,
    });
  },
  deleteHistoryEntry: (tournamentId) => {
    set((state) => ({
      tournamentHistory: state.tournamentHistory.filter(
        (t) => t.id !== tournamentId,
      ),
    }));
  },
  clearHistory: () => set({ tournamentHistory: [] }),

  // ─── Saved tournaments (manual save slots) ───────────────────────────

  saveCurrentTournament: () => {
    const state = get();
    const active = state.tournament;
    if (!active) return false;
    // Fold an in-flight match's live series back into its match record so
    // the snapshot captures mid-match progress. The dashboard's Save
    // button only renders between matches (series === null), but guard
    // anyway in case a future surface saves mid-draft.
    const tournament =
      state.series && active.activeMatchId
        ? {
            ...active,
            matches: active.matches.map((m) =>
              m.id === active.activeMatchId
                ? { ...m, series: state.series }
                : m,
            ),
          }
        : active;
    const entry: SavedTournamentEntry = {
      id: tournament.id,
      savedAt: Date.now(),
      tournament: compactEncodeTournamentForPersist(tournament),
      playerForms: state.playerForms,
      preTournamentMetaSnapshot: state.preTournamentMetaSnapshot,
    };
    set((s) => ({
      savedTournaments: [
        entry,
        ...s.savedTournaments.filter((e) => e.id !== entry.id),
      ].slice(0, savedTournamentsCap()),
    }));
    return true;
  },

  loadSavedTournament: (entryId) => {
    const entry = get().savedTournaments.find((e) => e.id === entryId);
    if (!entry) return;
    const tournament = decodeCompactTournament(entry.tournament);
    // Mid-tournament resume: if the save captured an active match with a
    // series, restore it so the user lands right back in that match.
    let resumedSeries: SeriesState | null = null;
    if (tournament.activeMatchId) {
      const activeMatch = tournament.matches.find(
        (m) => m.id === tournament.activeMatchId,
      );
      if (activeMatch?.series) resumedSeries = activeMatch.series;
    }
    // Restore the meta the tournament runs under — same logic as
    // importTournament. For live-meta events, metaSnapshot holds the
    // CURRENT evolved tiers, so meta shifting resumes where it left off.
    const snap = tournament.metaSnapshot;
    if (snap !== undefined) {
      setActiveMetaOverride(snap.metaOverride ?? null);
      setMetaEnabled(snap.metaEnabled);
      saveMetaOverride(snap.metaOverride ?? null);
      saveMetaSource(snap.metaOverride ? "custom" : "default");
      saveMetaEnabled(snap.metaEnabled);
      if (snap.synergyOverride !== undefined) {
        setActiveSynergyOverride(snap.synergyOverride ?? null);
        saveSynergyOverride(snap.synergyOverride ?? null);
      }
      if (snap.counterOverride !== undefined) {
        setActiveCounterOverride(snap.counterOverride ?? null);
        saveCounterOverride(snap.counterOverride ?? null);
      }
    }
    set((state) => ({
      tournament,
      series: resumedSeries,
      selectedChampionId: null,
      secondsLeft:
        resumedSeries && resumedSeries.timerEnabled ? ACTION_SECONDS : null,
      aiRationale: null,
      aiRationaleHistory: [],
      sideChoicePending: false,
      // Tournament-scoped context captured at save time: player form
      // (hot/cold streak carrier) and the live-meta rollback snapshot.
      playerForms: entry.playerForms ?? {},
      preTournamentMetaSnapshot: entry.preTournamentMetaSnapshot ?? null,
      ...(snap !== undefined
        ? {
            metaOverride: snap.metaOverride ?? null,
            metaSource: (snap.metaOverride
              ? "custom"
              : "default") as MetaSource,
            metaEnabled: snap.metaEnabled,
            metaVersion: state.metaVersion + 1,
            ...(snap.synergyOverride !== undefined
              ? {
                  synergyOverride: snap.synergyOverride ?? null,
                  synergyVersion: state.synergyVersion + 1,
                }
              : {}),
            ...(snap.counterOverride !== undefined
              ? {
                  counterOverride: snap.counterOverride ?? null,
                  counterVersion: state.counterVersion + 1,
                }
              : {}),
          }
        : {}),
    }));
  },

  duplicateSavedTournament: (entryId) => {
    const entry = get().savedTournaments.find((e) => e.id === entryId);
    if (!entry) return;
    // Fresh tournament id so the copy archives/upserts independently of
    // the original. Match ids are scoped under the tournament and can
    // stay as-is.
    const newId = makeTournamentId();
    const copy: SavedTournamentEntry = {
      ...entry,
      id: newId,
      savedAt: Date.now(),
      tournament: {
        ...entry.tournament,
        id: newId,
        name: `${entry.tournament.name} (Copy)`,
      },
    };
    set((s) => ({
      savedTournaments: [copy, ...s.savedTournaments].slice(
        0,
        savedTournamentsCap(),
      ),
    }));
  },

  deleteSavedTournament: (entryId) => {
    set((s) => ({
      savedTournaments: s.savedTournaments.filter((e) => e.id !== entryId),
    }));
  },

  clearSavedTournaments: () => set({ savedTournaments: [] }),

  // ─── Season mode ─────────────────────────────────────────────────────

  startSeason: (config, teams) => {
    const state = get();
    // Capture the user's meta so leaving/abandoning the season can
    // restore it; the season itself starts from the same meta.
    const userMeta = {
      metaOverride: state.metaOverride,
      metaSource: state.metaSource,
      metaEnabled: state.metaEnabled,
      synergyOverride: state.synergyOverride,
      counterOverride: state.counterOverride,
    };
    const season = createSeason({
      config,
      teams: ensureTeamIdentities(teams),
      activeMeta: {
        metaOverride: state.metaOverride,
        metaEnabled: state.metaEnabled,
        synergyOverride: state.synergyOverride,
        counterOverride: state.counterOverride,
      },
    });
    set({
      season,
      seasonViewOpen: true,
      preSeasonMetaSnapshot: userMeta,
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      playerForms: {},
      sideChoicePending: false,
    });
  },

  openSeason: () => {
    const state = get();
    if (!state.season) return;
    // Re-apply the season's current meta while inside the season view.
    set((s) =>
      s.season
        ? {
            seasonViewOpen: true,
            ...applyMetaSnapshotPatch(
              {
                metaOverride: s.season.currentMeta.metaOverride,
                metaSource: s.season.currentMeta.metaOverride
                  ? "custom"
                  : "default",
                metaEnabled: s.season.currentMeta.metaEnabled,
                synergyOverride: s.season.currentMeta.synergyOverride,
                counterOverride: s.season.currentMeta.counterOverride,
              },
              s,
            ),
          }
        : {},
    );
  },

  exitSeasonView: () => {
    // Back to the menu. The season survives; the user's own meta comes
    // back so standalone drafts aren't played on the season's tiers.
    set((s) => ({
      seasonViewOpen: false,
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      ...(s.preSeasonMetaSnapshot
        ? applyMetaSnapshotPatch(s.preSeasonMetaSnapshot, s)
        : {}),
    }));
  },

  abandonSeason: () => {
    set((s) => ({
      season: null,
      seasonViewOpen: false,
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      playerForms: {},
      sideChoicePending: false,
      ...(s.preSeasonMetaSnapshot
        ? applyMetaSnapshotPatch(s.preSeasonMetaSnapshot, s)
        : {}),
      preSeasonMetaSnapshot: null,
    }));
  },

  openSeasonTournament: (tournamentId) => {
    const state = get();
    const season = state.season;
    if (!season) return;
    const t = season.tournaments[tournamentId];
    if (!t) return;
    // Resume an in-flight match if the tournament has one.
    let resumedSeries: SeriesState | null = null;
    if (t.activeMatchId) {
      const activeMatch = t.matches.find((m) => m.id === t.activeMatchId);
      if (activeMatch?.series) resumedSeries = activeMatch.series;
    }
    // The tournament's own snapshot carries its CURRENT evolved meta.
    const snap = t.metaSnapshot;
    set((s) => ({
      tournament: t,
      series: resumedSeries,
      selectedChampionId: null,
      secondsLeft:
        resumedSeries && resumedSeries.timerEnabled ? ACTION_SECONDS : null,
      aiRationale: null,
      aiRationaleHistory: [],
      sideChoicePending: false,
      playerForms: s.playerForms,
      ...(snap !== undefined
        ? applyMetaSnapshotPatch(
            {
              metaOverride: snap.metaOverride ?? null,
              metaSource: snap.metaOverride ? "custom" : "default",
              metaEnabled: snap.metaEnabled,
              synergyOverride:
                snap.synergyOverride !== undefined
                  ? snap.synergyOverride ?? null
                  : s.synergyOverride,
              counterOverride:
                snap.counterOverride !== undefined
                  ? (snap.counterOverride as CounterPair[] | null)
                  : s.counterOverride,
            },
            s,
          )
        : {}),
    }));
  },

  simSeason: (scope) => {
    const { season, simulating } = get();
    if (!season || simulating) return;
    if (season.status === "complete") return;
    set({ simulating: "all", simProgress: null });
    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 0));
        const runId = season.id;
        const startPhaseIndex = get().season?.phaseIndex ?? 0;
        // Player form carries across the WHOLE season (hot players stay
        // hot between splits) — thread it through every match.
        let currentForms = get().playerForms;
        // A full season is ~900 matches; the cap is a runaway guard.
        const safetyCap = 5000;
        let sinceCommit = 0;
        const BATCH = 4;
        for (let step = 0; step < safetyCap; step++) {
          const cur = get().season;
          if (!cur || cur.id !== runId) return;
          if (cur.status === "complete") break;
          if (scope === "phase" && cur.phaseIndex !== startPhaseIndex) break;
          const champions = get().champions;
          // Tournament scope plays exactly one event to completion;
          // the other scopes follow the engine's play order.
          const t =
            typeof scope === "object"
              ? cur.tournaments[scope.tournamentId]
              : nextPendingSeasonTournament(cur);
          if (!t) break; // defensive — engine advances phases itself
          if (typeof scope === "object" && t.status === "complete") break;
          const startable = t.matches.find(
            (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
          );
          if (!startable) {
            // Stage finished → freeze standings into the playoff bracket.
            let frozen = t;
            const stageDone = t.matches
              .filter((m) => m.bracket === undefined)
              .every((m) => m.winner != null);
            if (
              (t.format === "groups-playoffs" ||
                t.format === "groups-playoffs-de") &&
              !t.groupsPlayoffs?.playoffStarted &&
              stageDone
            ) {
              frozen = startGroupsPlayoffs(t);
            } else if (
              (t.format === "swiss-playoffs" ||
                t.format === "swiss-playoffs-de") &&
              !t.swissPlayoffsStarted &&
              stageDone
            ) {
              frozen = startSwissPlayoffs(t);
            } else if (
              t.format === "round-robin-playoffs" &&
              !t.rrPlayoffsStarted &&
              stageDone
            ) {
              frozen = startRoundRobinPlayoffs(t);
            }
            if (frozen === t) break; // stuck — bail rather than spin
            set((s) => ({ ...seasonPatchFor(s, frozen) }));
            continue;
          }
          let [after, nextForms] = autoPlayMatch(
            t,
            startable.id,
            champions,
            currentForms,
          );
          currentForms = nextForms;
          // Live meta evolution inside the event (also pushes the
          // evolved override to the active singletons).
          const evo = evolveMetaForTournament(after, champions);
          if (evo.tournament !== after) {
            setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
            saveMetaOverride(evo.snapshot?.metaOverride ?? null);
            after = evo.tournament;
          }
          sinceCommit++;
          const phase = currentSeasonPhase(cur);
          const progress = phase ? seasonPhaseProgress(cur, phase) : null;
          if (sinceCommit >= BATCH) {
            sinceCommit = 0;
            set((s) => ({
              ...seasonPatchFor(s, after),
              playerForms: currentForms,
              ...(progress ? { simProgress: progress } : {}),
            }));
          } else {
            set((s) => ({ ...seasonPatchFor(s, after) }));
          }
          await new Promise((r) => setTimeout(r, 0));
        }
        // Surface the season's final meta in the store fields so the
        // meta panels reflect what the dashboard shows.
        set((s) =>
          s.season && s.season.id === runId
            ? {
                playerForms: currentForms,
                ...applyMetaSnapshotPatch(
                  {
                    metaOverride: s.season.currentMeta.metaOverride,
                    metaSource: s.season.currentMeta.metaOverride
                      ? "custom"
                      : "default",
                    metaEnabled: s.season.currentMeta.metaEnabled,
                    synergyOverride: s.season.currentMeta.synergyOverride,
                    counterOverride: s.season.currentMeta.counterOverride,
                  },
                  s,
                ),
              }
            : {},
        );
      } finally {
        set({ simulating: null, simProgress: null });
      }
    })();
  },

  // ─── Saved seasons ───────────────────────────────────────────────────

  saveCurrentSeason: () => {
    const state = get();
    const season = state.season;
    if (!season) return false;
    const entry: SavedSeasonEntry = {
      id: season.id,
      savedAt: Date.now(),
      season: {
        ...season,
        tournaments: Object.fromEntries(
          Object.entries(season.tournaments).map(([id, t]) => [
            id,
            compactEncodeTournamentForPersist(t),
          ]),
        ),
      },
      playerForms: state.playerForms,
    };
    set((s) => ({
      savedSeasons: [
        entry,
        ...s.savedSeasons.filter((e) => e.id !== entry.id),
      ].slice(0, savedSeasonsCap()),
    }));
    return true;
  },

  loadSavedSeason: (entryId) => {
    const state = get();
    const entry = state.savedSeasons.find((e) => e.id === entryId);
    if (!entry) return;
    const season: SeasonState = ensureSeasonIdentities({
      ...entry.season,
      tournaments: Object.fromEntries(
        Object.entries(entry.season.tournaments).map(([id, t]) => [
          id,
          decodeCompactTournament(t),
        ]),
      ),
    });
    // Keep the original restore snapshot when a season is already
    // active (the user's meta from before THAT season); otherwise the
    // current state IS the user's meta — capture it fresh.
    const preSeason = state.season
      ? state.preSeasonMetaSnapshot
      : {
          metaOverride: state.metaOverride,
          metaSource: state.metaSource,
          metaEnabled: state.metaEnabled,
          synergyOverride: state.synergyOverride,
          counterOverride: state.counterOverride,
        };
    set((s) => ({
      season,
      seasonViewOpen: true,
      preSeasonMetaSnapshot: preSeason,
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      sideChoicePending: false,
      playerForms: entry.playerForms ?? {},
      ...applyMetaSnapshotPatch(
        {
          metaOverride: season.currentMeta.metaOverride,
          metaSource: season.currentMeta.metaOverride ? "custom" : "default",
          metaEnabled: season.currentMeta.metaEnabled,
          synergyOverride: season.currentMeta.synergyOverride,
          counterOverride: season.currentMeta.counterOverride,
        },
        s,
      ),
    }));
  },

  duplicateSavedSeason: (entryId) => {
    const entry = get().savedSeasons.find((e) => e.id === entryId);
    if (!entry) return;
    // Fresh season id, and every stage tournament re-tagged so the
    // copy's sync/ownership checks point at the new season.
    const newId = makeSeasonId();
    const copy: SavedSeasonEntry = {
      ...entry,
      id: newId,
      savedAt: Date.now(),
      season: {
        ...entry.season,
        id: newId,
        name: `${entry.season.name} (Copy)`,
        tournaments: Object.fromEntries(
          Object.entries(entry.season.tournaments).map(([id, t]) => [
            id,
            { ...t, seasonId: newId },
          ]),
        ),
      },
    };
    set((s) => ({
      savedSeasons: [copy, ...s.savedSeasons].slice(0, savedSeasonsCap()),
    }));
  },

  deleteSavedSeason: (entryId) => {
    set((s) => ({
      savedSeasons: s.savedSeasons.filter((e) => e.id !== entryId),
    }));
  },

  clearSavedSeasons: () => set({ savedSeasons: [] }),

  // ─── Season history (Hall of Seasons) ────────────────────────────────

  archiveSeasonToHistory: () => {
    const season = get().season;
    if (!season) return false;
    const entry = buildSeasonHistoryEntry(season, Date.now());
    set((s) => ({
      seasonHistory: [
        entry,
        ...s.seasonHistory.filter((e) => e.id !== entry.id),
      ].slice(0, seasonHistoryCap()),
    }));
    return true;
  },

  archiveSavedSeasonToHistory: (entryId) => {
    const saved = get().savedSeasons.find((e) => e.id === entryId);
    if (!saved) return false;
    const entry = buildSeasonHistoryEntry(saved.season, Date.now());
    set((s) => ({
      seasonHistory: [
        entry,
        ...s.seasonHistory.filter((e) => e.id !== entry.id),
      ].slice(0, seasonHistoryCap()),
    }));
    return true;
  },

  removeSeasonFromHistory: (entryId) => {
    set((s) => ({
      seasonHistory: s.seasonHistory.filter((e) => e.id !== entryId),
    }));
  },

  clearSeasonHistory: () => set({ seasonHistory: [] }),

  importSeasonHistory: (entries) => {
    // Dedupe the incoming batch by id (last occurrence wins), then
    // upsert into the existing archive and re-sort the timeline.
    const incoming = [...new Map(entries.map((e) => [e.id, e])).values()];
    const existingIds = new Set(get().seasonHistory.map((e) => e.id));
    const added = incoming.filter((e) => !existingIds.has(e.id)).length;
    const updated = incoming.length - added;
    set((s) => {
      const byId = new Map(incoming.map((e) => [e.id, e]));
      const merged = [
        ...s.seasonHistory.map((e) => byId.get(e.id) ?? e),
        ...incoming.filter((e) => !existingIds.has(e.id)),
      ]
        .sort((a, b) => b.archivedAt - a.archivedAt)
        .slice(0, seasonHistoryCap());
      return { seasonHistory: merged };
    });
    return { added, updated };
  },

  // ─── Preset libraries ────────────────────────────────────────────────

  createMetaPreset: (name, override) => {
    const id = makePresetId();
    const now = Date.now();
    const preset: MetaTierListPreset = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      override,
    };
    set((s) => ({ metaPresets: [preset, ...s.metaPresets] }));
    return id;
  },

  updateMetaPreset: (id, patch) => {
    set((s) => ({
      metaPresets: s.metaPresets.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
      ),
    }));
  },

  deleteMetaPreset: (id) => {
    set((s) => ({
      metaPresets: s.metaPresets.filter((p) => p.id !== id),
    }));
  },

  duplicateMetaPreset: (id) => {
    const source = get().metaPresets.find((p) => p.id === id);
    if (!source) return;
    const now = Date.now();
    const copy: MetaTierListPreset = {
      ...source,
      id: makePresetId(),
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ metaPresets: [copy, ...s.metaPresets] }));
  },

  applyMetaPreset: (id) => {
    const preset = get().metaPresets.find((p) => p.id === id);
    if (!preset) return;
    get().applyCustomMeta(preset.override);
  },

  createPairingsPreset: (name, synergies, counters) => {
    const id = makePresetId();
    const now = Date.now();
    const preset: PairingsPreset = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      synergies,
      counters,
    };
    set((s) => ({ pairingsPresets: [preset, ...s.pairingsPresets] }));
    return id;
  },

  updatePairingsPreset: (id, patch) => {
    set((s) => ({
      pairingsPresets: s.pairingsPresets.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
      ),
    }));
  },

  deletePairingsPreset: (id) => {
    set((s) => ({
      pairingsPresets: s.pairingsPresets.filter((p) => p.id !== id),
    }));
  },

  duplicatePairingsPreset: (id) => {
    const source = get().pairingsPresets.find((p) => p.id === id);
    if (!source) return;
    const now = Date.now();
    const copy: PairingsPreset = {
      ...source,
      id: makePresetId(),
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ pairingsPresets: [copy, ...s.pairingsPresets] }));
  },

  applyPairingsPreset: (id) => {
    const preset = get().pairingsPresets.find((p) => p.id === id);
    if (!preset) return;
    // Same path as randomizeSynergiesAndCounters, minus power spikes
    // (presets don't carry them — the active spike override is kept).
    setActiveSynergyOverride(preset.synergies);
    setActiveCounterOverride(preset.counters);
    saveSynergyOverride(preset.synergies);
    saveCounterOverride([...preset.counters]);
    set((s) => ({
      synergyOverride: preset.synergies,
      counterOverride: [...preset.counters],
      synergyVersion: s.synergyVersion + 1,
      counterVersion: s.counterVersion + 1,
      ...seasonMetaWriteThrough(s, {
        synergyOverride: preset.synergies,
        counterOverride: [...preset.counters],
      }),
    }));
  },

  setChampions: (champions) => {
    set({ champions });
    // Preload sound assets opportunistically.
    sounds.preload(Object.values(SOUND));
  },

  setSoundEnabled: (v) => {
    sounds.enabled = v;
    set({ soundEnabled: v });
  },

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    sounds.volume = clamped;
    set({ volume: clamped });
  },

  randomizeMetaTiers: () => {
    const champions = get().champions;
    const override = randomizeMeta(champions);
    setActiveMetaOverride(override);
    saveMetaOverride(override);
    saveMetaSource("randomized");
    set((s) => ({
      metaOverride: override,
      metaVersion: s.metaVersion + 1,
      metaSource: "randomized",
      ...seasonMetaWriteThrough(s, { metaOverride: override }),
    }));
  },

  resetMetaTiers: () => {
    setActiveMetaOverride(null);
    saveMetaOverride(null);
    saveMetaSource("default");
    set((s) => ({
      metaOverride: null,
      metaVersion: s.metaVersion + 1,
      metaSource: "default",
      ...seasonMetaWriteThrough(s, { metaOverride: null }),
    }));
  },

  applyCustomMeta: (override) => {
    setActiveMetaOverride(override);
    saveMetaOverride(override);
    saveMetaSource("custom");
    set((s) => ({
      metaOverride: override,
      metaVersion: s.metaVersion + 1,
      metaSource: "custom",
      ...seasonMetaWriteThrough(s, { metaOverride: override }),
    }));
  },

  setMetaEnabled: (enabled) => {
    setMetaEnabled(enabled);
    saveMetaEnabled(enabled);
    set((s) => ({
      metaEnabled: enabled,
      // Bump version so any memoized component (TierListView, ChampionGrid
      // tier badges) recomputes against the new effective tier set.
      metaVersion: s.metaVersion + 1,
      ...seasonMetaWriteThrough(s, { metaEnabled: enabled }),
    }));
  },

  randomizeSynergiesAndCounters: () => {
    const champions = get().champions;
    const synergies = randomizeSynergies(champions);
    const counters = randomizeCounters(champions);
    const powerSpikes = randomizePowerSpikes(champions);
    setActiveSynergyOverride(synergies);
    setActiveCounterOverride(counters);
    setActivePowerSpikeOverride(powerSpikes);
    saveSynergyOverride(synergies);
    saveCounterOverride(counters);
    savePowerSpikeOverride(powerSpikes);
    set((s) => ({
      synergyOverride: synergies,
      synergyVersion: s.synergyVersion + 1,
      counterOverride: counters,
      counterVersion: s.counterVersion + 1,
      powerSpikeOverride: powerSpikes,
      powerSpikeVersion: s.powerSpikeVersion + 1,
      ...seasonMetaWriteThrough(s, {
        synergyOverride: synergies,
        counterOverride: counters,
      }),
    }));
  },

  resetSynergiesAndCounters: () => {
    setActiveSynergyOverride(null);
    setActiveCounterOverride(null);
    setActivePowerSpikeOverride(null);
    saveSynergyOverride(null);
    saveCounterOverride(null);
    savePowerSpikeOverride(null);
    set((s) => ({
      synergyOverride: null,
      synergyVersion: s.synergyVersion + 1,
      counterOverride: null,
      counterVersion: s.counterVersion + 1,
      powerSpikeOverride: null,
      powerSpikeVersion: s.powerSpikeVersion + 1,
      ...seasonMetaWriteThrough(s, {
        synergyOverride: null,
        counterOverride: null,
      }),
    }));
  },

  hydrateMetaFromStorage: () => {
    const stored = loadMetaOverride();
    const source = loadMetaSource();
    const enabled = loadMetaEnabled();
    const synergies = loadSynergyOverride();
    const counters = loadCounterOverride();
    const powerSpikes = loadPowerSpikeOverride();
    setMetaEnabled(enabled);
    if (synergies) setActiveSynergyOverride(synergies);
    if (counters) setActiveCounterOverride(counters);
    if (powerSpikes) setActivePowerSpikeOverride(powerSpikes);
    if (stored) {
      setActiveMetaOverride(stored);
      set((s) => ({
        metaOverride: stored,
        metaVersion: s.metaVersion + 1,
        metaSource: source,
        metaEnabled: enabled,
        synergyOverride: synergies,
        synergyVersion: synergies ? s.synergyVersion + 1 : s.synergyVersion,
        counterOverride: counters,
        counterVersion: counters ? s.counterVersion + 1 : s.counterVersion,
        powerSpikeOverride: powerSpikes,
        powerSpikeVersion: powerSpikes
          ? s.powerSpikeVersion + 1
          : s.powerSpikeVersion,
      }));
    } else {
      set((s) => ({
        metaEnabled: enabled,
        metaVersion: s.metaVersion + 1,
        synergyOverride: synergies,
        synergyVersion: synergies ? s.synergyVersion + 1 : s.synergyVersion,
        counterOverride: counters,
        counterVersion: counters ? s.counterVersion + 1 : s.counterVersion,
        powerSpikeOverride: powerSpikes,
        powerSpikeVersion: powerSpikes
          ? s.powerSpikeVersion + 1
          : s.powerSpikeVersion,
      }));
    }
  },

  startSimulation: (settings) => {
    const series = createSeries(settings);
    set({
      series,
      selectedChampionId: null,
      secondsLeft: settings.timerEnabled ? ACTION_SECONDS : null,
      aiRationale: null,
      aiRationaleHistory: [],
      // Fresh single-series play resets form — no carry-over from a
      // previous session (unlike tournament which persists across matches).
      playerForms: {},
      sideChoicePending: false,
    });
  },

  selectChampion: (id) => set({ selectedChampionId: id }),

  lockIn: () => {
    const { series, selectedChampionId, champions } = get();
    if (!series || selectedChampionId == null) return;
    const game = currentGame(series);
    const action = currentAction(game);
    if (!action) return;

    // Play sound based on the action that's about to resolve.
    playActionSound(action.kind, action.side);

    const locked = applyLock(game, selectedChampionId);
    const finalized = finalizeRoles(locked, champions, series);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "strategy" : "drafting",
      games,
    };
    set({
      series: nextSeries,
      selectedChampionId: null,
      secondsLeft:
        series.timerEnabled && finalized.status !== "complete"
          ? ACTION_SECONDS
          : null,
    });
  },

  triggerAIAction: (preDecidedId) => {
    const { series, champions, aiRationale, aiRationaleHistory } = get();
    if (!series) return;
    const game = currentGame(series);
    const action = currentAction(game);
    if (!action) return;
    // Guard: only act when the action genuinely belongs to the AI under the
    // current mode. Prevents a stale timer from firing into a human turn.
    if (!isAITurn(game, series.mode, series.aiSide)) return;

    playActionSound(action.kind, action.side);

    const tournament = get().tournament;
    const locked = effectiveLockedSet(tournament, fearlessLockedSet(series));
    const tournamentWR = tournament
      ? computeTournamentChampionWR(tournament)
      : undefined;
    const personality = getPersonality(
      action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
    );
    const championId =
      preDecidedId ??
      chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(series, action.side, champions, tournamentWR),
        Math.random,
        personality,
      );
    let updatedGame: GameDraft;
    if (championId != null) {
      updatedGame = applyLock(game, championId);
    } else {
      // No legal champion (extremely unlikely with a normal roster) — fall
      // back to the timeout path so the draft still advances.
      updatedGame = applyTimeout(game, allChampionIds(champions), locked);
    }
    const finalized = finalizeRoles(updatedGame, champions, series);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "strategy" : "drafting",
      games,
    };
    // Append the rationale we surfaced during the hover phase to the
    // per-game history so the post-draft recap can replay it. We use the
    // pre-action index (game.actionIndex) since after applyLock that field
    // has already advanced.
    const nextHistory =
      aiRationale && aiRationale.championId === championId
        ? [
            ...aiRationaleHistory,
            { actionIndex: game.actionIndex, rationale: aiRationale },
          ]
        : aiRationaleHistory;
    set({
      series: nextSeries,
      selectedChampionId: null,
      secondsLeft:
        series.timerEnabled && finalized.status !== "complete"
          ? ACTION_SECONDS
          : null,
      // AI's decision is committed — the rationale is no longer current.
      aiRationale: null,
      aiRationaleHistory: nextHistory,
    });
  },

  completeAIDraft: () => {
    const { series, champions, aiRationaleHistory } = get();
    if (!series) return;
    // Fearless locks come from prior completed games only — the current
    // game's picks never affect them — so we compute once and reuse.
    const tournament = get().tournament;
    const locked = effectiveLockedSet(tournament, fearlessLockedSet(series));
    const tournamentWR = tournament
      ? computeTournamentChampionWR(tournament)
      : undefined;
    const allIds = allChampionIds(champions);
    let game = currentGame(series);
    let action = currentAction(game);
    // We accumulate rationales for every skipped action so the post-draft
    // "AI Decisions" recap shows ALL decisions, not just the ones the user
    // clicked through manually. Adds ~50ms per action × ~20 actions ≈ 1s
    // worst case for a full skip — acceptable for a one-shot fast-forward.
    const newHistory = [...aiRationaleHistory];
    while (action && isAITurn(game, series.mode, series.aiSide)) {
      // Recompute seriesCtx per iteration — `mySide` changes between blue
      // and red turns, and the prior-picks set is keyed by side identity.
      const seriesCtx = seriesAIContextFrom(
        series,
        action.side,
        champions,
        tournamentWR,
      );
      const personality = getPersonality(
        action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
      );
      const decision = chooseAIActionWithRationale(
        game,
        champions,
        locked,
        seriesCtx,
        Math.random,
        personality,
      );
      if (decision == null) {
        // Falls through to timeout if the roster is exhausted (extremely
        // unlikely with a normal champion pool).
        game = applyTimeout(game, allIds, locked);
      } else {
        newHistory.push({
          actionIndex: game.actionIndex,
          rationale: decision,
        });
        game = applyLock(game, decision.championId);
      }
      action = currentAction(game);
    }
    const finalized = finalizeRoles(game, champions, series);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "strategy" : "drafting",
      games,
    };
    set({
      series: nextSeries,
      selectedChampionId: null,
      secondsLeft:
        series.timerEnabled && finalized.status !== "complete"
          ? ACTION_SECONDS
          : null,
      aiRationale: null,
      aiRationaleHistory: newHistory,
    });
  },

  timeout: () => {
    const { series, selectedChampionId, champions } = get();
    if (!series) return;
    const game = currentGame(series);
    const action = currentAction(game);
    if (!action) return;

    // Play the side-appropriate sound for the action that resolved.
    playActionSound(action.kind, action.side);

    let updatedGame: GameDraft;
    if (selectedChampionId != null) {
      updatedGame = applyLock(game, selectedChampionId);
    } else {
      const locked = effectiveLockedSet(get().tournament, fearlessLockedSet(series));
      updatedGame = applyTimeout(game, allChampionIds(champions), locked);
    }
    const finalized = finalizeRoles(updatedGame, champions, series);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "strategy" : "drafting",
      games,
    };
    set({
      series: nextSeries,
      selectedChampionId: null,
      secondsLeft:
        series.timerEnabled && finalized.status !== "complete"
          ? ACTION_SECONDS
          : null,
    });
  },

  tickTimer: () => {
    const { secondsLeft } = get();
    if (secondsLeft == null) return;
    if (secondsLeft <= 0) return;
    set({ secondsLeft: secondsLeft - 1 });
  },

  confirmStrategies: (blueStrategy, redStrategy) => {
    const { series } = get();
    if (!series || series.status !== "strategy") return;
    const games = [...series.games];
    const idx = games.length - 1;
    games[idx] = { ...games[idx], blueStrategy, redStrategy };
    set({ series: { ...series, games, status: "between-games" } });
  },

  declareWinner: (side, recap) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;
    const updatedSeries = recordWinner(series, side, recap);
    // Update player forms if recap has ratings.
    if (recap) {
      const { playerForms, tournament } = get();
      const game = series.games[series.games.length - 1];
      const ratings = recap.ratings ?? null;
      if (ratings) {
        const blueKey = tournament
          ? (tournament.teams.find((t) => t.name === game.blueTeam)?.id ?? game.blueTeam)
          : game.blueTeam;
        const redKey = tournament
          ? (tournament.teams.find((t) => t.name === game.redTeam)?.id ?? game.redTeam)
          : game.redTeam;
        const newForms = applyRatingsToForms(
          applyRatingsToForms(playerForms, blueKey, ratings.blue),
          redKey,
          ratings.red,
        );
        set({ series: updatedSeries, playerForms: newForms });
        return;
      }
    }
    set({ series: updatedSeries });
  },

  proceedToNextGame: (swapSides) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;

    const rule = effectiveSideRule(series);

    if (rule === "loser-picks" && swapSides == null) {
      // Under "loser-picks" the chooser must explicitly call chooseSide().
      // If the sideChooser is an AI team, auto-resolve immediately.
      const chooser = series.sideChooser;
      if (!chooser) return;
      const isAI =
        series.mode === "aivai" ||
        (series.mode === "pvai" &&
          ((series.aiSide === "blue" && series.blueTeam === chooser) ||
            (series.aiSide === "red" && series.redTeam === chooser)));
      if (isAI) {
        // Gather the team's pick history for the AI heuristic.
        const teamPicks: number[] = [];
        for (const g of series.games) {
          const picksArr =
            g.blueTeam === chooser ? g.bluePicks : g.redPicks;
          for (const id of picksArr) if (id != null) teamPicks.push(id);
        }
        const players =
          series.blueTeam === chooser
            ? series.bluePlayers
            : series.redPlayers;
        const chosenSide = chooseSideAI(
          { players, pickHistory: teamPicks },
          Math.random,
        );
        const next = applySideChoice(series, chosenSide);
        set({
          series: next,
          selectedChampionId: null,
          secondsLeft: next.timerEnabled ? ACTION_SECONDS : null,
          aiRationaleHistory: [],
          sideChoicePending: false,
        });
      } else {
        // Human chooser — expose pending state for the UI.
        set({ sideChoicePending: true });
      }
      return;
    }

    // All other rules: compute sides deterministically.
    const sides = nextGameSides(series);
    let blue: string;
    let red: string;
    if (sides) {
      blue = sides.blueTeam;
      red = sides.redTeam;
    } else {
      // Fallback: use the historical auto-swap (loser-blue).
      const lastGame = series.games[series.games.length - 1];
      const autoSwap = lastGame?.winner === "blue";
      const swap = swapSides ?? autoSwap;
      blue = swap ? series.redTeam : series.blueTeam;
      red = swap ? series.blueTeam : series.redTeam;
    }
    const next = startNextGame(series, blue, red);
    set({
      series: next,
      selectedChampionId: null,
      secondsLeft: next.timerEnabled ? ACTION_SECONDS : null,
      aiRationaleHistory: [],
      sideChoicePending: false,
    });
  },

  swapPickSlots: (gameIndex, side, slotA, slotB) => {
    const { series } = get();
    if (!series) return;
    if (gameIndex < 0 || gameIndex >= series.games.length) return;
    const games = [...series.games];
    games[gameIndex] = swapChampionsPure(games[gameIndex], side, slotA, slotB);
    set({ series: { ...series, games } });
  },

  setAIRationale: (r) => set({ aiRationale: r }),

  /** Apply the human's side choice under "loser-picks" rule. */
  chooseSide: (side) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;
    if (effectiveSideRule(series) !== "loser-picks") return;
    const next = applySideChoice(series, side);
    if (next === series) return; // no-op: no chooser set
    set({
      series: next,
      selectedChampionId: null,
      secondsLeft: next.timerEnabled ? ACTION_SECONDS : null,
      aiRationaleHistory: [],
      sideChoicePending: false,
    });
  },

  resetAll: () =>
    set({
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      tournament: null,
      playerForms: {},
      sideChoicePending: false,
    }),

  // ─── Tournament actions ──────────────────────────────────────────────
  startTournament: (params) => {
    // Capture the current meta as the tournament's snapshot so a
    // save/load round-trip preserves the AI's view of the meta — the
    // tournament is "played on this meta" regardless of what the user
    // changes globally afterward. Includes the synergy and counter
    // overrides so randomized pairings travel with the tournament.
    const {
      metaOverride,
      metaEnabled,
      synergyOverride,
      counterOverride,
      champions,
    } = get();
    // Give every team a player roster generated to match its chosen star
    // rating (the roster is the source of truth for team strength from here
    // on; the user can re-randomize / edit it in setup). Teams that already
    // carry a roster (e.g. an imported/edited one) keep it.
    // Also assign a random draft personality to every AI team that doesn't
    // already have one — so every tournament has varied drafters.
    const teamsWithRosters = params.teams.map((t) => {
      const withRoster =
        Array.isArray(t.players) && t.players.length === 5
          ? t
          : {
              ...t,
              players: randomizeRoster({ champions, star: t.starRating ?? 3 }),
            };
      // Assign a random personality if not already set. All teams in a
      // tournament are AI-controlled in auto-sim; in interactive matches
      // only the AI side drafts automatically but having a personality
      // persisted is harmless for the human side.
      if (!withRoster.personalityId) {
        return { ...withRoster, personalityId: randomPersonalityId() };
      }
      return withRoster;
    });
    const tournament = createTournament({
      ...params,
      teams: teamsWithRosters,
      metaSnapshot: params.metaSnapshot ?? {
        metaOverride: metaOverride ?? null,
        metaEnabled,
        synergyOverride: synergyOverride ?? null,
        counterOverride: counterOverride ?? null,
      },
    });
    // Snapshot the user's current meta override BEFORE the tournament
    // takes ownership of the active meta. Only needed for live-meta
    // tournaments (static ones never mutate the active override), but we
    // always save it — the cost is negligible and it avoids an extra
    // branch. Restored by restorePreTournamentMeta() on exit/end.
    const preTournamentMetaSnapshot = params.liveMeta
      ? {
          metaOverride: metaOverride ?? null,
          metaSource: get().metaSource,
          metaEnabled,
          synergyOverride: synergyOverride ?? null,
          counterOverride: counterOverride ?? null,
        }
      : null;
    set({
      tournament,
      preTournamentMetaSnapshot,
      // Clear any leftover single-series state so DraftApp routes to
      // the tournament dashboard cleanly.
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      // Fresh tournament — reset per-player form tracking.
      playerForms: {},
      sideChoicePending: false,
    });
  },

  importTournament: async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Empty code" };
    try {
      const { tournament, error } = await decodeTournament(trimmed);
      if (!tournament) {
        return { ok: false, error: error ?? "Invalid tournament code" };
      }
      // Mid-tournament resume: if the snapshot has an active match
      // with a saved series, restore that series to state.series so
      // DraftApp routes the user straight back into where they left
      // off. Status === "complete" snapshots leave activeMatchId null.
      let resumedSeries: SeriesState | null = null;
      if (tournament.activeMatchId) {
        const activeMatch = tournament.matches.find(
          (m) => m.id === tournament.activeMatchId,
        );
        if (activeMatch?.series) {
          resumedSeries = activeMatch.series;
        }
      }
      // Restore the meta snapshot so the AI sees the same tier list
      // and pairings the original tournament was played on. Falls back
      // gracefully when the snapshot isn't present (legacy codes).
      const snap = tournament.metaSnapshot;
      // Apply meta side-effects (the imperative singletons) to mirror
      // the loaded snapshot. AI scoring reads from these, not the store.
      if (snap !== undefined) {
        setActiveMetaOverride(snap.metaOverride ?? null);
        setMetaEnabled(snap.metaEnabled);
        saveMetaOverride(snap.metaOverride ?? null);
        saveMetaSource(snap.metaOverride ? "custom" : "default");
        saveMetaEnabled(snap.metaEnabled);
        // Pairings are optional in the snapshot — only restore if the
        // loaded tournament actually carried them. Calling setActive*
        // with null when the user hadn't randomized would otherwise
        // wipe their currently-active pairings.
        if (snap.synergyOverride !== undefined) {
          setActiveSynergyOverride(snap.synergyOverride ?? null);
          saveSynergyOverride(snap.synergyOverride ?? null);
        }
        if (snap.counterOverride !== undefined) {
          setActiveCounterOverride(snap.counterOverride ?? null);
          saveCounterOverride(snap.counterOverride ?? null);
        }
      }
      set((state) => ({
        tournament,
        series: resumedSeries,
        selectedChampionId: null,
        secondsLeft:
          resumedSeries && resumedSeries.timerEnabled ? ACTION_SECONDS : null,
        aiRationale: null,
        aiRationaleHistory: [],
        ...(snap !== undefined
          ? {
              metaOverride: snap.metaOverride ?? null,
              metaSource: (snap.metaOverride
                ? "custom"
                : "default") as MetaSource,
              metaEnabled: snap.metaEnabled,
              // Use the updater form's `state` so the bump is on the
              // most-current store value, not a pre-await read.
              metaVersion: state.metaVersion + 1,
              ...(snap.synergyOverride !== undefined
                ? {
                    synergyOverride: snap.synergyOverride ?? null,
                    synergyVersion: state.synergyVersion + 1,
                  }
                : {}),
              ...(snap.counterOverride !== undefined
                ? {
                    counterOverride: snap.counterOverride ?? null,
                    counterVersion: state.counterVersion + 1,
                  }
                : {}),
            }
          : {}),
      }));
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid tournament code";
      return { ok: false, error: message };
    }
  },

  startMatch: (matchId, overrides) => {
    const { tournament } = get();
    if (!tournament) return;
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match) return;
    if (match.blueTeamId == null || match.redTeamId == null) return;
    const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
    if (!blueTeam || !redTeam) return;
    // Apply per-match overrides if provided (Phase 2.3). Overrides
    // mutate the match record so the choice is remembered if the user
    // resumes mid-match later.
    const effective: TournamentMatch = overrides
      ? {
          ...match,
          format: overrides.format ?? match.format,
          fearless: overrides.fearless ?? match.fearless,
          mode: overrides.mode ?? match.mode,
          aiSide:
            overrides.mode === "pvai"
              ? overrides.aiSide ?? match.aiSide
              : overrides.mode != null
              ? null
              : match.aiSide,
          aiDifficulty: overrides.aiDifficulty ?? match.aiDifficulty,
        }
      : match;
    // Build a fresh series for this match using the match's settings +
    // the team names. Reuses createSeries from the existing single-flow
    // — the match doesn't care that it's part of a tournament until
    // finishMatch records the winner.
    // Tournament momentum context — star ratings + win streaks +
    // round-depth feed starRatingBias for win-streak rewards and
    // semis/finals underdog protection. Falls back to plain star
    // ratings when the context can't be assembled.
    const tctx = tournamentSeriesContext(tournament, matchId);
    const series = createSeries({
      format: effective.format,
      fearless: effective.fearless,
      timerEnabled: tournament.defaults.timerEnabled,
      blueTeam: blueTeam.name,
      redTeam: redTeam.name,
      mode: effective.mode,
      aiSide: effective.aiSide,
      aiDifficulty: effective.aiDifficulty,
      // Per-team AI difficulty: if a team has its own override, route
      // it through the existing per-side fields on SeriesState. Falls
      // back to undefined → series uses the match's aiDifficulty.
      blueAiDifficulty: blueTeam.aiDifficulty,
      redAiDifficulty: redTeam.aiDifficulty,
      // Tournament-only — used by the simulator to bias outcome toward
      // the higher-rated roster (see starRatingBias in lib/series.ts).
      blueStarRating: tctx?.blueStarRating ?? teamStarRating(blueTeam),
      redStarRating: tctx?.redStarRating ?? teamStarRating(redTeam),
      blueWinStreak: tctx?.blueWinStreak,
      redWinStreak: tctx?.redWinStreak,
      tournamentRound: tctx?.roundDepth,
      // Persistent player identities for this match (same roster every match
      // in the tournament). Star already derives from these via teamStarRating.
      bluePlayers: blueTeam.players,
      redPlayers: redTeam.players,
      // Draft personality ids follow each team across matches.
      bluePersonalityId: blueTeam.personalityId,
      redPersonalityId: redTeam.personalityId,
      // Side-assignment rule from the tournament.
      sideRule: tournament.sideRule,
    });
    // Mark the match as active and stash the live series on it so reload
    // can resume mid-match (the series is also held in `state.series`).
    const updatedMatches = tournament.matches.map((m) =>
      m.id === matchId
        ? {
            ...effective,
            series,
          }
        : m,
    );
    set((state) => {
      const started: TournamentState = {
        ...tournament,
        matches: updatedMatches,
        activeMatchId: matchId,
        updatedAt: Date.now(),
      };
      return {
        tournament: started,
        ...seasonPatchFor(state, started),
        series,
        selectedChampionId: null,
        secondsLeft: tournament.defaults.timerEnabled ? ACTION_SECONDS : null,
        aiRationale: null,
        aiRationaleHistory: [],
        sideChoicePending: false,
      };
    });
  },

  finishMatch: () => {
    const { tournament, series } = get();
    if (!tournament || !tournament.activeMatchId || !series) return;
    if (series.status !== "complete") return;
    const match = tournament.matches.find(
      (m) => m.id === tournament.activeMatchId,
    );
    if (!match) return;
    // Determine winner from the series's `winner` (Side) — translate to
    // the team id via the match's slot mapping. Sides may have flipped
    // between games, so we use the SeriesState's wins-by-name to get
    // the correct attribution.
    const wins = winsByTeamName(series);
    const blueTeam = tournament.teams.find((t) => t.id === match.blueTeamId);
    const redTeam = tournament.teams.find((t) => t.id === match.redTeamId);
    if (!blueTeam || !redTeam) return;
    const blueWins = wins.get(blueTeam.name) ?? 0;
    const redWins = wins.get(redTeam.name) ?? 0;
    // Use series.winner as the authoritative source — sides may have
    // swapped mid-series so we map the winning side's team-name back
    // to the match's stable team id. Only falls back to game-count
    // comparison if `winner` is somehow missing.
    const winningTeamId = (() => {
      if (series.winner) {
        const winningName =
          series.winner === "blue" ? series.blueTeam : series.redTeam;
        if (winningName === blueTeam.name) return blueTeam.id;
        if (winningName === redTeam.name) return redTeam.id;
      }
      return blueWins > redWins ? blueTeam.id : redTeam.id;
    })();
    // Advance the bracket and append picks to cross-match histories.
    // recordMatchWinner persists the winner + propagates to the
    // downstream bracket slot (or flips status to "complete" if it was
    // the final). appendMatchPicks adds every pick from this series to
    // the per-team and global histories so future matches see the
    // updated cross-match fearless lockout.
    const withPicks = appendMatchPicks(tournament, match.id, series);
    const advanced = recordMatchWinner(withPicks, match.id, {
      teamId: winningTeamId,
      blueWins,
      redWins,
    });

    // ── Feature 5: update player forms from all games in the just-finished series ──
    let updatedForms = get().playerForms;
    for (const game of series.games) {
      if (game.winner == null || !game.recap) continue;
      const recap = game.recap;
      const ratings = recap.ratings ?? null;
      if (!ratings) {
        // Attempt to derive ratings via computeGameRatings.
        const derived = computeGameRatings(recap, game.winner);
        if (!derived) continue;
        const bKey = tournament.teams.find((t) => t.name === game.blueTeam)?.id ?? game.blueTeam;
        const rKey = tournament.teams.find((t) => t.name === game.redTeam)?.id ?? game.redTeam;
        updatedForms = applyRatingsToForms(updatedForms, bKey, derived.blue);
        updatedForms = applyRatingsToForms(updatedForms, rKey, derived.red);
      } else {
        const bKey = tournament.teams.find((t) => t.name === game.blueTeam)?.id ?? game.blueTeam;
        const rKey = tournament.teams.find((t) => t.name === game.redTeam)?.id ?? game.redTeam;
        updatedForms = applyRatingsToForms(updatedForms, bKey, ratings.blue);
        updatedForms = applyRatingsToForms(updatedForms, rKey, ratings.red);
      }
    }

    // ── Feature 6: live meta evolution ──
    const evo = evolveMetaForTournament(advanced, get().champions);
    let tournamentAfterEvo = evo.tournament;
    if (evo.tournament !== advanced) {
      // The meta snapshot changed — apply the evolved override globally.
      setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
      saveMetaOverride(evo.snapshot?.metaOverride ?? null);
    }

    set((state) => {
      // When the tournament reaches "complete" (champion decided), restore
      // the user's pre-tournament meta so evolved tiers don't persist into
      // subsequent standalone drafts. buildMetaRestorePatch is a no-op for
      // non-live-meta tournaments (preTournamentMetaSnapshot is null).
      // Season tournaments skip the restore — the season carries its meta
      // forward into the next stage.
      const isComplete = tournamentAfterEvo.status === "complete";
      const restorePatch =
        isComplete && !tournamentAfterEvo.seasonId
          ? buildMetaRestorePatch(
              state.preTournamentMetaSnapshot,
              state.metaVersion,
              state.synergyVersion,
              state.counterVersion,
            )
          : {};
      return {
        tournament: tournamentAfterEvo,
        ...seasonPatchFor(state, tournamentAfterEvo),
        ...(evo.tournament !== advanced && !isComplete
          ? { metaOverride: evo.snapshot?.metaOverride ?? null, metaVersion: state.metaVersion + 1 }
          : {}),
        tournamentHistory: archiveCompletedTournament(
          tournamentAfterEvo,
          state.tournamentHistory,
        ),
        // Clear the active series so DraftApp routes back to the dashboard.
        series: null,
        selectedChampionId: null,
        secondsLeft: null,
        aiRationale: null,
        aiRationaleHistory: [],
        playerForms: updatedForms,
        sideChoicePending: false,
        ...restorePatch,
      };
    });
  },

  generatePlayoffBracket: () => {
    const { tournament } = get();
    if (!tournament) return;
    let updated: TournamentState;
    if (
      tournament.format === "swiss-playoffs" ||
      tournament.format === "swiss-playoffs-de"
    ) {
      updated = startSwissPlayoffs(tournament);
    } else if (tournament.format === "round-robin-playoffs") {
      updated = startRoundRobinPlayoffs(tournament);
    } else {
      updated = startGroupsPlayoffs(tournament);
    }
    if (updated === tournament) return;
    set((state) => ({
      tournament: updated,
      ...seasonPatchFor(state, updated),
    }));
  },

  simulateOneMatch: (matchId) => {
    const { tournament, simulating } = get();
    if (!tournament || simulating) return;
    // Two-phase: paint the overlay first, then run the sim on the next
    // tick so it doesn't block the render. Without this, the synchronous
    // chooseAIAction loop freezes the UI for hundreds of ms.
    set({ simulating: "match" });
    setTimeout(() => {
      try {
        const { tournament: cur, champions, playerForms } = get();
        if (!cur) return;
        const [after, newForms] = autoPlayMatch(cur, matchId, champions, playerForms);
        // Feature 6: evolve meta after recording the match result.
        const evo = evolveMetaForTournament(after, champions);
        const finalTournament = evo.tournament;
        const metaChanged = evo.tournament !== after;
        if (metaChanged) {
          setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
          saveMetaOverride(evo.snapshot?.metaOverride ?? null);
        }
        set((state) => ({
          tournament: after === cur ? state.tournament : finalTournament,
          ...(after === cur ? {} : seasonPatchFor(state, finalTournament)),
          ...(metaChanged && after !== cur
            ? { metaOverride: evo.snapshot?.metaOverride ?? null, metaVersion: state.metaVersion + 1 }
            : {}),
          tournamentHistory:
            after === cur
              ? state.tournamentHistory
              : archiveCompletedTournament(finalTournament, state.tournamentHistory),
          playerForms: after === cur ? state.playerForms : newForms,
        }));
      } finally {
        // Always release the overlay even if autoPlayMatch threw.
        set({ simulating: null });
      }
    }, 0);
  },

  simulateMatches: (matchIds) => {
    const { tournament, simulating } = get();
    if (!tournament || simulating) return;
    if (matchIds.length === 0) return;
    set({ simulating: "all", simProgress: { done: 0, total: matchIds.length } });
    // Async chunked loop: one MATCH at a time, yielding to the event loop
    // between matches so the UI thread breathes (overlay spinner animates,
    // progress text updates, OS doesn't flag the window as frozen). State
    // commits are batched — at most one set() per match, every BATCH
    // matches for large runs — so the dashboard doesn't re-render per game.
    void (async () => {
      try {
        // Yield once so the overlay paints before sim work starts.
        await new Promise((r) => setTimeout(r, 0));
        const { tournament: cur, champions, playerForms } = get();
        if (!cur) return;
        const runId = cur.id;
        let working = cur;
        let currentForms = playerForms;
        const BATCH = matchIds.length > 16 ? 4 : 1;
        let sinceCommit = 0;
        let done = 0;
        for (const id of matchIds) {
          // Abort if the tournament was exited/replaced mid-run (e.g. the
          // user navigated away). Never resurrect stale state.
          if (get().tournament?.id !== runId) return;
          done++;
          // Skip already-finished matches (idempotent if the user clicks
          // sim multiple times) and skip ids that no longer exist (Swiss
          // generates rounds dynamically — a previous round's id might
          // already be settled).
          const m = working.matches.find((x) => x.id === id);
          if (!m || m.winner) continue;
          if (m.blueTeamId == null || m.redTeamId == null) continue;
          const [next, nextForms] = autoPlayMatch(working, id, champions, currentForms);
          working = next;
          currentForms = nextForms;
          // Feature 6: evolve meta after each match (order preserved —
          // exactly one evolve call after each autoPlayMatch, same as the
          // previous synchronous loop).
          const evo = evolveMetaForTournament(working, champions);
          if (evo.tournament !== working) {
            setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
            saveMetaOverride(evo.snapshot?.metaOverride ?? null);
            working = evo.tournament;
          }
          sinceCommit++;
          if (sinceCommit >= BATCH) {
            sinceCommit = 0;
            if (get().tournament?.id !== runId) return;
            set((state) => ({
              tournament: working,
              ...seasonPatchFor(state, working),
              playerForms: currentForms,
              simProgress: { done, total: matchIds.length },
            }));
          }
          // Let the UI thread breathe between matches.
          await new Promise((r) => setTimeout(r, 0));
        }
        if (get().tournament?.id !== runId) return;
        set((state) => ({
          tournament: working,
          ...seasonPatchFor(state, working),
          tournamentHistory: archiveCompletedTournament(
            working,
            state.tournamentHistory,
          ),
          playerForms: currentForms,
          ...(working !== cur && working.metaSnapshot?.metaOverride !== cur.metaSnapshot?.metaOverride
            ? { metaOverride: working.metaSnapshot?.metaOverride ?? null, metaVersion: state.metaVersion + 1 }
            : {}),
        }));
      } finally {
        set({ simulating: null, simProgress: null });
      }
    })();
  },

  simulateAllRemaining: () => {
    const { tournament, simulating } = get();
    if (!tournament || simulating) return;
    if (tournament.status === "complete") return;
    set({
      simulating: "all",
      simProgress: {
        done: tournament.matches.filter((m) => m.winner).length,
        total: tournament.matches.length,
      },
    });
    // Async chunked loop: one MATCH at a time, yielding to the event loop
    // between matches so the UI never freezes. Commits are batched (at
    // most one set() per match; every BATCH matches for big tournaments)
    // so the dashboard bracket re-renders a bounded number of times.
    void (async () => {
      // Always release the loading overlay even if the inner loop
      // throws — without try/finally, an unhandled error inside
      // autoPlayMatch / generateNextSwissRound would leave the
      // simulating flag stuck "all" and the UI permanently locked.
      try {
        // Yield once so the overlay paints before sim work starts.
        await new Promise((r) => setTimeout(r, 0));
        const { tournament: cur, champions, playerForms } = get();
        if (!cur) return;
        const runId = cur.id;
        let working = cur;
        let currentForms = playerForms;
        let metaChangedOverall = false;
        const remainingAtStart = cur.matches.filter((m) => !m.winner).length;
        const BATCH = remainingAtStart > 16 ? 4 : 1;
        let sinceCommit = 0;
        // Bound the loop defensively. We can't cap by initial match
        // count because Swiss generates rounds dynamically and
        // groups-playoffs appends a playoff bracket mid-loop — the
        // matches array grows as we work. 200 covers anything
        // reasonable.
        const safetyCap = 200;
        for (let safety = 0; safety < safetyCap; safety++) {
          // Abort if the tournament was exited/replaced mid-run — never
          // resurrect stale state with a late commit.
          if (get().tournament?.id !== runId) return;
          const startable = working.matches.find(
            (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
          );
          if (!startable) {
            if (
              (working.format === "groups-playoffs" ||
                working.format === "groups-playoffs-de") &&
              !working.groupsPlayoffs?.playoffStarted &&
              working.matches
                .filter((m) => m.bracket === undefined)
                .every((m) => m.winner != null)
            ) {
              working = startGroupsPlayoffs(working);
              continue;
            }
            if (
              (working.format === "swiss-playoffs" ||
                working.format === "swiss-playoffs-de") &&
              !working.swissPlayoffsStarted &&
              working.matches
                .filter((m) => m.bracket === undefined)
                .every((m) => m.winner != null)
            ) {
              working = startSwissPlayoffs(working);
              continue;
            }
            if (
              working.format === "round-robin-playoffs" &&
              !working.rrPlayoffsStarted &&
              working.matches
                .filter((m) => m.bracket === undefined)
                .every((m) => m.winner != null)
            ) {
              working = startRoundRobinPlayoffs(working);
              continue;
            }
            break;
          }
          const [next, nextForms] = autoPlayMatch(working, startable.id, champions, currentForms);
          working = next;
          currentForms = nextForms;
          // Feature 6: evolve meta after each match (sim-call order is
          // identical to the previous synchronous loop).
          const evo = evolveMetaForTournament(working, champions);
          if (evo.tournament !== working) {
            setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
            saveMetaOverride(evo.snapshot?.metaOverride ?? null);
            working = evo.tournament;
            metaChangedOverall = true;
          }
          sinceCommit++;
          if (sinceCommit >= BATCH) {
            sinceCommit = 0;
            if (get().tournament?.id !== runId) return;
            set((state) => ({
              tournament: working,
              ...seasonPatchFor(state, working),
              playerForms: currentForms,
              simProgress: {
                done: working.matches.filter((m) => m.winner).length,
                total: working.matches.length,
              },
            }));
          }
          // Let the UI thread breathe between matches.
          await new Promise((r) => setTimeout(r, 0));
        }
        if (get().tournament?.id !== runId) return;
        set((state) => {
          // When bulk-sim completes the tournament, restore the user's
          // pre-tournament meta so evolved tiers don't persist into
          // subsequent standalone drafts. Season tournaments skip the
          // restore — the season carries its meta into the next stage.
          const isComplete = working.status === "complete";
          const restorePatch =
            isComplete && !working.seasonId
              ? buildMetaRestorePatch(
                  state.preTournamentMetaSnapshot,
                  state.metaVersion,
                  state.synergyVersion,
                  state.counterVersion,
                )
              : {};
          return {
            tournament: working,
            ...seasonPatchFor(state, working),
            tournamentHistory: archiveCompletedTournament(
              working,
              state.tournamentHistory,
            ),
            series: null,
            selectedChampionId: null,
            secondsLeft: null,
            aiRationale: null,
            aiRationaleHistory: [],
            playerForms: currentForms,
            ...(metaChangedOverall && !isComplete
              ? { metaOverride: working.metaSnapshot?.metaOverride ?? null, metaVersion: state.metaVersion + 1 }
              : {}),
            ...restorePatch,
          };
        });
      } finally {
        set({ simulating: null, simProgress: null });
      }
    })();
  },

  exitTournament: () => {
    const state = get();
    // Season tournament: just return to the season dashboard — the
    // season's meta stays active and the tournament stays synced in the
    // season map (every update already mirrored it).
    if (
      state.tournament?.seasonId &&
      state.season &&
      state.tournament.seasonId === state.season.id
    ) {
      set({
        tournament: null,
        series: null,
        selectedChampionId: null,
        secondsLeft: null,
        aiRationale: null,
        aiRationaleHistory: [],
        sideChoicePending: false,
      });
      return;
    }
    // Feature 6: restore the user's pre-tournament meta override so the
    // evolved tiers don't bleed into subsequent standalone drafts.
    // buildMetaRestorePatch is a no-op when preTournamentMetaSnapshot is
    // null (non-live-meta tournament or snapshot already cleared).
    const restorePatch = buildMetaRestorePatch(
      state.preTournamentMetaSnapshot,
      state.metaVersion,
      state.synergyVersion,
      state.counterVersion,
    );
    set({
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      playerForms: {},
      sideChoicePending: false,
      ...restorePatch,
    });
  },
  }),
  {
    // ─── Persistence config ────────────────────────────────────────────
    // Survives reloads: the active series, sound preferences, and the
    // AI rationale history for the current game. Champions roster is
    // re-fetched fresh from CommunityDragon on each load (the icon URLs
    // and meta tiers may shift between patches), so it's NOT persisted.
    // Ephemeral UI state (selected champion, timer) intentionally
    // resets — a reload mid-draft pauses the timer cleanly.
    name: "draftsim-store",
    // Bump on incompatible state shape changes — older persisted states
    // get dropped automatically rather than rehydrated with missing
    // fields. v2: ensures `series.mode`/`aiSide` are present. v3: adds
    // `tournament` field for tournament mode. v4: adds Swiss + groups-
    // playoffs format support, swissTotalRounds, groupsPlayoffs config,
    // tournamentHistory list, double-elim bracket fields, etc. v5:
    // slimmer history snapshots (per-game timelines stripped) + cap
    // reduced from 20 → 5 so we don't blow the 5MB localStorage quota.
    // v6: compact-encode active tournament recaps (recapC field) instead
    // of deleting heavy fields — replay charts survive reloads. Archived
    // tournamentHistory keeps the v5 slim treatment (no chart data).
    version: 6,
    // Desktop: file-backed LAZY storage — setItem receives the persisted
    // state OBJECT and defers JSON.stringify into the 500ms debounced
    // flush, so per-set() serialization cost is eliminated (critical for
    // bulk simulation which commits state many times per second).
    //
    // Web: keep createJSONStorage + quotaSafeStorage. localStorage writes
    // are synchronous anyway and the quota-exceeded fallback chain
    // operates on serialized strings; web payloads are also much smaller
    // (slim history, cap 5). Bulk-sim batching (≤1 set per match) keeps
    // the per-set stringify acceptable there.
    storage: isDesktop()
      ? createDesktopLazyStorage()
      : createJSONStorage(() => quotaSafeStorage ?? localStorage),
    partialize: (state) => ({
      series: state.series,
      soundEnabled: state.soundEnabled,
      volume: state.volume,
      aiRationaleHistory: state.aiRationaleHistory,
      // Live tournament: compact-encode each game recap's heavy fields
      // into a single `recapC` field rather than deleting them. On
      // rehydration (onRehydrateStorage) we decode back to full recaps
      // so ALL consumers (replay modal, charts, recap panels) see normal
      // data without requiring any changes to those components.
      // Archived tournamentHistory keeps the slim treatment (no chart
      // data — history is for score-browsing, not full replay).
      tournament: state.tournament
        ? compactEncodeTournamentForPersist(state.tournament)
        : null,
      tournamentHistory: state.tournamentHistory,
      // Manual save slots — entries are already compact-encoded at save
      // time (saveCurrentTournament), so they pass through unchanged.
      savedTournaments: state.savedTournaments,
      // Preset libraries (small: a few kB per preset).
      metaPresets: state.metaPresets,
      pairingsPresets: state.pairingsPresets,
      // Season mode — compact-encode every stage tournament's recaps
      // (memoized by object identity, so unchanged stages cost nothing
      // per set()).
      season: state.season
        ? {
            ...state.season,
            tournaments: Object.fromEntries(
              Object.entries(state.season.tournaments).map(([id, t]) => [
                id,
                compactEncodeTournamentForPersist(t),
              ]),
            ),
          }
        : null,
      seasonViewOpen: state.seasonViewOpen,
      preSeasonMetaSnapshot: state.preSeasonMetaSnapshot,
      // Saved seasons — entries are compact-encoded at save time.
      savedSeasons: state.savedSeasons,
      // Season history — tiny résumé snapshots, persisted as-is.
      seasonHistory: state.seasonHistory,
      // Persist player form so it survives reload (tournament-scoped;
      // resets when a new tournament is started).
      playerForms: state.playerForms,
      // Persist pending side choice so UI state survives reload.
      sideChoicePending: state.sideChoicePending,
      // Persist so live-meta restore works after a reload mid-tournament.
      preTournamentMetaSnapshot: state.preTournamentMetaSnapshot,
    }),
    // Defensive validator: if the persisted series is missing critical
    // fields (e.g. `mode` from an older build), drop it. Otherwise the
    // user could end up in a draft view where isAITurn always returns
    // false because mode is undefined — making PvAI behave as PvP.
    // v5 → v6 migration: the v5 format had slim recaps with no recapC.
    // Those recaps simply pass through — decodeCompactTournament in
    // onRehydrateStorage is a no-op when recapC is absent (legacy-safe).
    migrate: (persisted: unknown, _version: number) => {
      const ps = persisted as { series?: unknown } | undefined;
      if (ps && typeof ps === "object" && "series" in ps && ps.series) {
        const s = ps.series as Partial<SeriesState>;
        const validMode = s.mode === "pvp" || s.mode === "pvai" || s.mode === "aivai";
        const validAiSide =
          s.aiSide === null ||
          s.aiSide === "blue" ||
          s.aiSide === "red" ||
          s.aiSide === undefined;
        if (!validMode || !validAiSide) {
          // Stale/incompatible series — drop it so the user lands on the
          // create form and configures fresh.
          return { ...ps, series: null };
        }
      }
      return ps;
    },
    onRehydrateStorage: () => (state) => {
      // Mirror persisted sound prefs onto the imperative SoundPlayer
      // singleton — the store is the source of truth, but `sounds`
      // reads its own state at play() time.
      if (state) {
        sounds.enabled = state.soundEnabled;
        sounds.volume = state.volume;
      }
      // Final defensive check on the rehydrated series. If somehow the
      // migration didn't catch a shape issue (e.g. partial state that
      // bypasses migrate), null it here too.
      if (state?.series) {
        const s = state.series;
        if (
          (s.mode !== "pvp" && s.mode !== "pvai" && s.mode !== "aivai") ||
          (s.mode === "pvai" && s.aiSide !== "blue" && s.aiSide !== "red")
        ) {
          state.series = null;
        }
      }
      // Decode compact-encoded recaps in the active tournament back to
      // their full form. This is the inverse of compactEncodeTournamentForPersist
      // called in partialize. v5 slim recaps (no recapC) pass through
      // unchanged — decodeCompactTournament is a no-op for them.
      if (state?.tournament) {
        state.tournament = decodeCompactTournament(state.tournament);
      }
      // Season tournaments are stored compact — decode them all so the
      // dashboards and replays read normal data.
      if (state?.season) {
        state.season = ensureSeasonIdentities({
          ...state.season,
          tournaments: Object.fromEntries(
            Object.entries(state.season.tournaments).map(([id, t]) => [
              id,
              decodeCompactTournament(t),
            ]),
          ),
        });
      }
      // Desktop: history entries were archived with compact encoding — decode
      // them so replay charts work from the history panel as well.
      if (state?.tournamentHistory && isDesktop()) {
        state.tournamentHistory = state.tournamentHistory.map((t) =>
          decodeCompactTournament(t),
        );
      }
      // One-time migration: on first desktop run, import localStorage data
      // so a user moving from web to desktop build keeps their state.
      // This is async and runs after hydration so it only affects the
      // *next* Zustand persist cycle (i.e. the next write will capture
      // the migrated data). Called here rather than at module scope so
      // it never runs during SSG.
      if (isDesktop()) {
        void migrateWebStorageToDesktop("draftsim-store");
      }
    },
  },
  ),
);
