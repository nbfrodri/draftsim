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

export const ACTION_SECONDS = 30;

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
  proceedToNextGame: (swapSides: boolean) => void;
  swapPickSlots: (
    gameIndex: number,
    side: Side,
    slotA: number,
    slotB: number,
  ) => void;
  resetAll: () => void;
}

function allChampionIds(champs: Champion[]): number[] {
  return champs.map((c) => c.id);
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

    const locked = fearlessLockedSet(series);
    const championId =
      preDecidedId ??
      chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(series, action.side, champions),
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
    const locked = fearlessLockedSet(series);
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
      const seriesCtx = seriesAIContextFrom(series, action.side, champions);
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
      const locked = fearlessLockedSet(series);
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
    const blue = swapSides ? series.redTeam : series.blueTeam;
    const red = swapSides ? series.blueTeam : series.redTeam;
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
    // fields. v2: ensures `series.mode` and `series.aiSide` are present
    // (they were added after v1 was first persisted).
    version: 2,
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      series: state.series,
      soundEnabled: state.soundEnabled,
      volume: state.volume,
      aiRationaleHistory: state.aiRationaleHistory,
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
