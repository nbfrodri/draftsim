"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  applyLock,
  applyTimeout,
  currentAction,
  POSITIONAL_LANES,
  reorderPicksByPosition,
  swapChampions as swapChampionsPure,
} from "@/lib/draftEngine";
import {
  createSeries,
  currentGame,
  fearlessLockedSet,
  recordWinner,
  startNextGame,
  starRatingBias,
  winsByTeamName,
} from "@/lib/series";
import {
  chooseAIAction,
  chooseAIActionWithRationale,
  isAITurn,
  seriesAIContextFrom,
  type AIRationale,
} from "@/lib/draftAI";
import { playActionSound, sounds, SOUND } from "@/lib/sounds";
import {
  setActiveMetaOverride,
  setMetaEnabled,
  type MetaOverride,
} from "@/lib/championMeta";
import {
  randomizeMeta,
  saveMetaOverride,
  loadMetaOverride,
  saveMetaSource,
  loadMetaSource,
  saveMetaEnabled,
  loadMetaEnabled,
} from "@/lib/metaRandomizer";
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
import { buildGameRecap, simulateMatch } from "@/lib/matchSimulator";

export const ACTION_SECONDS = 30;

// localStorage wrapper that gracefully handles QuotaExceededError. When
// the persisted state grows past the ~5MB browser quota (most common
// cause: large tournamentHistory), we drop the heaviest field and
// retry. If the retry also fails we drop tournamentHistory entirely
// and only keep the active tournament + ephemeral state. Last resort:
// swallow the error so the in-memory store stays usable.
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
            try {
              const parsed = JSON.parse(value) as {
                state?: Record<string, unknown>;
              };
              if (parsed?.state) {
                // Drop the largest field (tournamentHistory) and retry.
                delete parsed.state.tournamentHistory;
                window.localStorage.setItem(key, JSON.stringify(parsed));
                return;
              }
            } catch {
              // Fall through to silent drop.
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
  // Rationale of the AI's current decision — populated when an AI turn
  // starts, cleared on lock or when control returns to a human. Read by the
  // overlay UI to surface the AI's reasoning during the hover phase.
  aiRationale: AIRationale | null;
  // History of rationales for the current game. Each entry is the rationale
  // captured at the moment the AI locked in. Cleared on game start. Used
  // by the post-draft "AI decisions" recap. Skip-fast-forwarded actions
  // are NOT recorded (skip prioritises speed over instrumentation).
  aiRationaleHistory: Array<{ actionIndex: number; rationale: AIRationale }>;

  setChampions: (champions: Champion[]) => void;
  setSoundEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  randomizeMetaTiers: () => void;
  resetMetaTiers: () => void;
  applyCustomMeta: (override: MetaOverride) => void;
  setMetaEnabled: (enabled: boolean) => void;
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
  // in progress. The actions set it true → defer the sim work to the
  // next event-loop tick → run → set back to null. Lets the UI paint a
  // loading overlay before blocking on the synchronous sim.
  simulating: null | "match" | "all";
  // Open a history entry for review — sets it as the active tournament.
  // The dashboard renders it in its already-complete state.
  loadFromHistory: (tournamentId: string) => void;
  // Permanently remove a history entry.
  deleteHistoryEntry: (tournamentId: string) => void;
  // Wipe history entirely. No confirm — caller's responsibility.
  clearHistory: () => void;
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
}

function allChampionIds(champs: Champion[]): number[] {
  return champs.map((c) => c.id);
}

// Auto-play a single tournament match in AI-vs-AI mode end-to-end.
// Returns the updated tournament state after recording the match
// winner, advancing the bracket, and appending picks to cross-match
// histories. Pure: never reads or writes the store. Used by both
// simulateOneMatch (single-match) and simulateAllRemaining (loop).
function autoPlayMatch(
  workingTournament: TournamentState,
  matchId: string,
  champions: Champion[],
): TournamentState {
  const match = workingTournament.matches.find((m) => m.id === matchId);
  if (!match) return workingTournament;
  if (match.winner) return workingTournament;
  if (match.blueTeamId == null || match.redTeamId == null) {
    return workingTournament;
  }
  const blueTeam = workingTournament.teams.find(
    (t) => t.id === match.blueTeamId,
  );
  const redTeam = workingTournament.teams.find(
    (t) => t.id === match.redTeamId,
  );
  if (!blueTeam || !redTeam) return workingTournament;
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
    blueAiDifficulty: undefined,
    redAiDifficulty: undefined,
    blueStarRating: tctx?.blueStarRating ?? teamStarRating(blueTeam),
    redStarRating: tctx?.redStarRating ?? teamStarRating(redTeam),
    blueWinStreak: tctx?.blueWinStreak,
    redWinStreak: tctx?.redWinStreak,
    tournamentRound: tctx?.roundDepth,
  });
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
      const championId = chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(series, action.side, champions, tournamentWR),
      );
      if (championId == null) {
        game = applyTimeout(game, allIds, locked);
      } else {
        game = applyLock(game, championId);
        locked.add(championId);
      }
    }
    game = finalizeRoles(game, champions);
    series = {
      ...series,
      games: [...series.games.slice(0, -1), game],
    };
    const result = simulateMatch(game, champions, {
      scoreBias: starRatingBias(series),
    });
    const recap = buildGameRecap(game, champions, result);
    series = recordWinner(series, result.winner, recap);
    if (series.status === "between-games") {
      const lastGame = series.games[series.games.length - 1];
      const swap = lastGame?.winner === "blue";
      const newBlue = swap ? series.redTeam : series.blueTeam;
      const newRed = swap ? series.blueTeam : series.redTeam;
      series = startNextGame(series, newBlue, newRed);
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
  return recordMatchWinner(withPicks, matchId, {
    teamId: winningTeamId,
    blueWins,
    redWins,
  });
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

// Snapshot a completed tournament into the history list. No-op if the
// tournament isn't complete or already exists in history. Caps the
// history at 5 entries (newest first) — combined with the slim-down
// above this keeps localStorage well under the 5 MB quota.
function archiveCompletedTournament(
  tournament: TournamentState,
  history: TournamentState[],
): TournamentState[] {
  if (tournament.status !== "complete") return history;
  if (history.some((t) => t.id === tournament.id)) return history;
  const next = [slimTournamentForArchive(tournament), ...history];
  return next.slice(0, 5);
}

// When a game completes, reorder picks into positional (top→support) order and
// fix the role slots. After this, swap operations exchange champions between
// positional slots while the role labels stay in place.
function finalizeRoles(game: GameDraft, champions: Champion[]): GameDraft {
  if (game.status !== "complete") return game;
  return {
    ...game,
    bluePicks: reorderPicksByPosition(game.bluePicks, champions),
    redPicks: reorderPicksByPosition(game.redPicks, champions),
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
  aiRationale: null,
  aiRationaleHistory: [],
  tournament: null,
  tournamentHistory: [],
  simulating: null,

  loadFromHistory: (tournamentId) => {
    const state = get();
    const entry = state.tournamentHistory.find((t) => t.id === tournamentId);
    if (!entry) return;
    // Restore the meta snapshot if the history entry has one — same
    // logic as importTournament so re-opening a past tournament shows
    // it under the meta it was originally played on.
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
          }
        : {};
    if (snap !== undefined) {
      setActiveMetaOverride(snap.metaOverride ?? null);
      setMetaEnabled(snap.metaEnabled);
      saveMetaOverride(snap.metaOverride ?? null);
      saveMetaSource(snap.metaOverride ? "custom" : "default");
      saveMetaEnabled(snap.metaEnabled);
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
    }));
  },

  hydrateMetaFromStorage: () => {
    const stored = loadMetaOverride();
    const source = loadMetaSource();
    const enabled = loadMetaEnabled();
    setMetaEnabled(enabled);
    if (stored) {
      setActiveMetaOverride(stored);
      set((s) => ({
        metaOverride: stored,
        metaVersion: s.metaVersion + 1,
        metaSource: source,
        metaEnabled: enabled,
      }));
    } else {
      set((s) => ({
        metaEnabled: enabled,
        metaVersion: s.metaVersion + 1,
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
    const finalized = finalizeRoles(locked, champions);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "between-games" : "drafting",
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
    const championId =
      preDecidedId ??
      chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(series, action.side, champions, tournamentWR),
      );
    let updatedGame: GameDraft;
    if (championId != null) {
      updatedGame = applyLock(game, championId);
    } else {
      // No legal champion (extremely unlikely with a normal roster) — fall
      // back to the timeout path so the draft still advances.
      updatedGame = applyTimeout(game, allChampionIds(champions), locked);
    }
    const finalized = finalizeRoles(updatedGame, champions);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "between-games" : "drafting",
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
      const decision = chooseAIActionWithRationale(
        game,
        champions,
        locked,
        seriesCtx,
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
    const finalized = finalizeRoles(game, champions);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "between-games" : "drafting",
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
    const finalized = finalizeRoles(updatedGame, champions);
    const games = [...series.games];
    games[games.length - 1] = finalized;
    const nextSeries: SeriesState = {
      ...series,
      status: finalized.status === "complete" ? "between-games" : "drafting",
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

  declareWinner: (side, recap) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;
    set({ series: recordWinner(series, side, recap) });
  },

  proceedToNextGame: (swapSides) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;
    // Auto-rule: loser of last game gets blue side. If the BLUE team
    // won the last game, RED lost → red team should move to blue → swap
    // sides. If RED won, BLUE lost → blue stays blue → no swap.
    // Caller can still pass an explicit boolean to override this.
    const lastGame = series.games[series.games.length - 1];
    const autoSwap = lastGame?.winner === "blue";
    const swap = swapSides ?? autoSwap;
    const blue = swap ? series.redTeam : series.blueTeam;
    const red = swap ? series.blueTeam : series.redTeam;
    const next = startNextGame(series, blue, red);
    set({
      series: next,
      selectedChampionId: null,
      secondsLeft: next.timerEnabled ? ACTION_SECONDS : null,
      // Fresh game — clear last game's AI rationale history.
      aiRationaleHistory: [],
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

  resetAll: () =>
    set({
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      tournament: null,
    }),

  // ─── Tournament actions ──────────────────────────────────────────────
  startTournament: (params) => {
    // Capture the current meta as the tournament's snapshot so a
    // save/load round-trip preserves the AI's view of the meta — the
    // tournament is "played on this meta" regardless of what the user
    // changes globally afterward.
    const { metaOverride, metaEnabled } = get();
    const tournament = createTournament({
      ...params,
      metaSnapshot: params.metaSnapshot ?? {
        metaOverride: metaOverride ?? null,
        metaEnabled,
      },
    });
    set({
      tournament,
      // Clear any leftover single-series state so DraftApp routes to
      // the tournament dashboard cleanly.
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
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
      // the original tournament was played on. Falls back gracefully
      // when the snapshot isn't present (legacy codes).
      const snap = tournament.metaSnapshot;
      // Apply meta side-effects (the imperative singleton) to mirror
      // the loaded snapshot. AI scoring reads from this, not the store.
      if (snap !== undefined) {
        setActiveMetaOverride(snap.metaOverride ?? null);
        setMetaEnabled(snap.metaEnabled);
        saveMetaOverride(snap.metaOverride ?? null);
        saveMetaSource(snap.metaOverride ? "custom" : "default");
        saveMetaEnabled(snap.metaEnabled);
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
    set({
      tournament: {
        ...tournament,
        matches: updatedMatches,
        activeMatchId: matchId,
        updatedAt: Date.now(),
      },
      series,
      selectedChampionId: null,
      secondsLeft: tournament.defaults.timerEnabled ? ACTION_SECONDS : null,
      aiRationale: null,
      aiRationaleHistory: [],
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
    set((state) => ({
      tournament: advanced,
      tournamentHistory: archiveCompletedTournament(
        advanced,
        state.tournamentHistory,
      ),
      // Clear the active series so DraftApp routes back to the dashboard.
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
    }));
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
    set({ tournament: updated });
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
        const { tournament: cur, champions } = get();
        if (!cur) return;
        const after = autoPlayMatch(cur, matchId, champions);
        set((state) => ({
          tournament: after === cur ? state.tournament : after,
          tournamentHistory:
            after === cur
              ? state.tournamentHistory
              : archiveCompletedTournament(after, state.tournamentHistory),
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
    set({ simulating: "all" });
    setTimeout(() => {
      try {
        const { tournament: cur, champions } = get();
        if (!cur) return;
        let working = cur;
        for (const id of matchIds) {
          // Skip already-finished matches (idempotent if the user clicks
          // sim multiple times) and skip ids that no longer exist (Swiss
          // generates rounds dynamically — a previous round's id might
          // already be settled).
          const m = working.matches.find((x) => x.id === id);
          if (!m || m.winner) continue;
          if (m.blueTeamId == null || m.redTeamId == null) continue;
          working = autoPlayMatch(working, id, champions);
        }
        set((state) => ({
          tournament: working,
          tournamentHistory: archiveCompletedTournament(
            working,
            state.tournamentHistory,
          ),
        }));
      } finally {
        set({ simulating: null });
      }
    }, 0);
  },

  simulateAllRemaining: () => {
    const { tournament, simulating } = get();
    if (!tournament || simulating) return;
    if (tournament.status === "complete") return;
    // Two-phase: paint loading overlay first, then run the heavy sync
    // work. setTimeout(0) yields to the browser for one paint cycle.
    set({ simulating: "all" });
    setTimeout(() => {
      // Always release the loading overlay even if the inner loop
      // throws — without try/finally, an unhandled error inside
      // autoPlayMatch / generateNextSwissRound would leave the
      // simulating flag stuck "all" and the UI permanently locked.
      try {
        const { tournament: cur, champions } = get();
        if (!cur) return;
        let working = cur;
        // Bound the loop defensively. We can't cap by initial match
        // count because Swiss generates rounds dynamically and
        // groups-playoffs appends a playoff bracket mid-loop — the
        // matches array grows as we work. 200 covers anything
        // reasonable.
        const safetyCap = 200;
        for (let safety = 0; safety < safetyCap; safety++) {
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
          working = autoPlayMatch(working, startable.id, champions);
        }
        set((state) => ({
          tournament: working,
          tournamentHistory: archiveCompletedTournament(
            working,
            state.tournamentHistory,
          ),
          series: null,
          selectedChampionId: null,
          secondsLeft: null,
          aiRationale: null,
          aiRationaleHistory: [],
        }));
      } finally {
        set({ simulating: null });
      }
    }, 0);
  },

  exitTournament: () =>
    set({
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
    }),
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
    version: 5,
    storage: createJSONStorage(() => quotaSafeStorage ?? localStorage),
    partialize: (state) => ({
      series: state.series,
      soundEnabled: state.soundEnabled,
      volume: state.volume,
      aiRationaleHistory: state.aiRationaleHistory,
      // Live tournament gets the same slim-down treatment as archived
      // history before persisting — strip the per-game replay payload
      // (winProbTimeline / notableEvents / perPickKDA) from completed
      // matches. The full payload stays in memory for the current
      // session; only the localStorage write is slimmed. Reload loses
      // the per-game chart data but keeps everything else.
      tournament: state.tournament
        ? slimTournamentForArchive(state.tournament)
        : null,
      tournamentHistory: state.tournamentHistory,
    }),
    // Defensive validator: if the persisted series is missing critical
    // fields (e.g. `mode` from an older build), drop it. Otherwise the
    // user could end up in a draft view where isAITurn always returns
    // false because mode is undefined — making PvAI behave as PvP.
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
    },
  },
  ),
);
