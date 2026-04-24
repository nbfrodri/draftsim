"use client";

import { create } from "zustand";
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
import { playActionSound, sounds, SOUND } from "@/lib/sounds";
import type {
  Champion,
  GameDraft,
  SeriesState,
  SimulationSettings,
  Side,
} from "@/lib/types";

export const ACTION_SECONDS = 30;

interface DraftStore {
  series: SeriesState | null;
  selectedChampionId: number | null;
  secondsLeft: number | null;
  champions: Champion[];
  soundEnabled: boolean;

  setChampions: (champions: Champion[]) => void;
  setSoundEnabled: (v: boolean) => void;
  startSimulation: (settings: SimulationSettings) => void;
  selectChampion: (id: number | null) => void;
  lockIn: () => void;
  timeout: () => void;
  tickTimer: () => void;
  declareWinner: (side: Side) => void;
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

export const useDraftStore = create<DraftStore>((set, get) => ({
  series: null,
  selectedChampionId: null,
  secondsLeft: null,
  champions: [],
  soundEnabled: true,

  setChampions: (champions) => {
    set({ champions });
    // Preload sound assets opportunistically.
    sounds.preload(Object.values(SOUND));
  },

  setSoundEnabled: (v) => {
    sounds.enabled = v;
    set({ soundEnabled: v });
  },

  startSimulation: (settings) => {
    const series = createSeries(settings);
    set({
      series,
      selectedChampionId: null,
      secondsLeft: settings.timerEnabled ? ACTION_SECONDS : null,
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

  declareWinner: (side) => {
    const { series } = get();
    if (!series || series.status !== "between-games") return;
    set({ series: recordWinner(series, side) });
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

  resetAll: () =>
    set({
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
    }),
}));
