"use client";
import { reportPersistenceError } from "@/lib/persistenceStatus";
import { backupBeforeDestructiveChange } from "@/lib/backups";
import { forcePersistReady } from "@/lib/desktopStorage";
import { createFranchiseActions } from "./actions/franchise";
import { createImportsActions } from "./actions/imports";
import { createSimulationActions } from "./actions/simulation";
import { archiveCompletedTournament,compactEncodeRealitiesForPersist } from "./persistenceEncoding";
import type { DraftStore,MetaSource,MetaTierListPreset,PairingsPreset,SavedSeasonEntry,SavedTournamentEntry,SeasonMatchdayMatch,SeasonMatchdayRegion,SeasonMatchdayTeam,StoreGet,StoreSet } from "./types";
export type { MetaSource,MetaTierListPreset,PairingsPreset,SavedReality,SavedSeasonEntry,SavedTournamentEntry,SeasonMatchdayMatch,SeasonMatchdayRegion,SeasonMatchdayResult,SeasonMatchdayTeam } from "./types";

import { browserSaveStorage } from "@/lib/quotaSafeStorage";

import { setActivePowerSpikeOverride } from "@/lib/championBuilds";
import {
setActiveCounterOverride,
setActiveMetaOverride,
setActiveSynergyOverride,
setMetaEnabled,
type CounterPair,
type MetaOverride,
type Synergy,
} from "@/lib/championMeta";
import { PERSIST_VERSION,deleteRealityFromDb,isRealityHistoryLoaded,loadRealityHistoryFromDb,markRealityHistoryLoaded,shouldSuggestCompactAfterDelete,upsertRealityInDb } from "@/lib/desktopSqlite";
import { createDesktopSqliteStorage } from "@/lib/desktopSqliteStorage";
import { clearDesktopOperation,createWebLazyStorage,enablePersistWrites,flushPendingPersistWrites,gatePersistWritesUntilReady,isDesktop,resolveWebStringStorage,signalDeletingReality,signalLeavingSeason,signalOpeningReality,waitForDesktopOverlayPaint } from "@/lib/desktopStorage";
import {
PERSONALITY_LIST,
chooseAIAction,
chooseAIActionWithRationale,
getPersonality,
isAITurn,
seriesAIContextFrom
} from "@/lib/draftAI";
import {
applyLock,
applyTimeout,
currentAction,
swapChampions as swapChampionsPure,
} from "@/lib/draftEngine";
import { computeGameRatings } from "@/lib/matchSimulator";
import { isReverseSweep } from "@/lib/matchTags";
import { evolveMetaForTournament } from "@/lib/metaEvolution";
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
saveSynergyOverride
} from "@/lib/metaRandomizer";
import {
applyRatingsToForms
} from "@/lib/playerForm";
import { randomizeRoster } from "@/lib/players";
import { encodeRealityShareCode } from "@/lib/realityShare";
import {
compactEncodeSeasonForPersist,
compactEncodeTournamentForPersist,
decodeCompactSeason,
decodeCompactTournament
} from "@/lib/recapCompression";
import { bulkSimRealityMatches } from "@/lib/season/bulkYears";
import { swapCoaches } from "@/lib/season/coach";
import {
advanceTransferWindow,
applyTournamentUpdate as applySeasonTournamentUpdate,
createSeason,
currentPhase as currentSeasonPhase,
leagueOfTournament,
makeSeasonId,
nextPendingTournament as nextPendingSeasonTournament,
phaseProgress as seasonPhaseProgress,
} from "@/lib/season/engine";
import { aiDecideFollowedDemotes,applyUserAcademyRecall,applyUserAcademyRelease,applyUserAcademyRookie,applyUserFaSign,applyUserFaToAcademy,applyUserManualDemote,applyUserRookieSign,seedFranchise,startNextSeason } from "@/lib/season/franchise";
import {
aiHonorFollowedAgency,
honorAgencyDemand as applyHonorAgencyDemand,
overrideAgencyDemand as applyOverrideAgencyDemand,
} from "@/lib/season/franchiseAgency";
import {
buildSeasonHistoryEntry,
type SeasonHistoryEntry,
} from "@/lib/season/history";
import { inactiveSnapshotsForArchivedYear } from "@/lib/season/playerLifecycle";
import {
collectSimResultUpdates,
compressSimResultsFeed,
type SimResultEntry,
type SimResultEntryCache,
} from "@/lib/season/simResultsSummary";
import { ensureTeamIdentities } from "@/lib/season/teamGen";
import {
aiResolveUserOffseason,
aiResolveUserTransferWindow,
bestCoachHire,
executeOffseasonUserTransfer,
executeUserTransfer,
resolveTransfer as resolveSeasonTransfer,
} from "@/lib/season/transfers";
import type {
SeasonMetaSnapshot,
SeasonState
} from "@/lib/season/types";
import {
applySideChoice,
chooseSideAI,
createSeries,
currentGame,
effectiveSideRule,
fearlessLockedSet,
nextGameSides,
recordWinner,
startNextGame,
winsByTeamName
} from "@/lib/series";
import { runAutoPlayMatch } from "@/lib/sim/bulkSimClient";
import { finalizeRoles } from "@/lib/sim/finalizeRoles";
import { SOUND,playActionSound,sounds } from "@/lib/sounds";
import {
appendMatchPicks,
computeTeamChampionWR,
computeTournamentChampionWR,
createTournament,
effectiveLockedSet,
isSwissStageComplete,
makeTournamentId,
recordMatchWinner,
startGroupsPlayoffs,
startRoundRobinPlayoffs,
startSwissPlayoffs,
teamStarRating,
tournamentSeriesContext,
type TournamentMatch,
type TournamentState
} from "@/lib/tournament";
import type {
Champion,
GameDraft,
SeriesState
} from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const ACTION_SECONDS = 30;

const quotaSafeStorage = browserSaveStorage();

// Saved-slot caps. Desktop files have no quota so the cap is generous;
// web shares the 5MB localStorage quota with everything else.
const SAVED_TOURNAMENTS_CAP_DESKTOP = 100;
const SAVED_TOURNAMENTS_CAP_WEB = 10;

function savedTournamentsCap(): number {
  return isDesktop() ? SAVED_TOURNAMENTS_CAP_DESKTOP : SAVED_TOURNAMENTS_CAP_WEB;
}

// Seasons are heavy (20+ tournaments each), so the caps are tighter
// than tournament save slots.
const SAVED_SEASONS_CAP_DESKTOP = 20;
const SAVED_SEASONS_CAP_WEB = 3;

export function savedSeasonsCap(): number {
  return isDesktop() ? SAVED_SEASONS_CAP_DESKTOP : SAVED_SEASONS_CAP_WEB;
}

// Season history entries are résumé snapshots — small, but they carry
// the season's initial + final tier tables (~3-8 kB each), so the web
// cap respects the shared 5 MB localStorage quota.
const SEASON_HISTORY_CAP_DESKTOP = 200;
const SEASON_HISTORY_CAP_WEB = 40;

export function seasonHistoryCap(): number {
  return isDesktop() ? SEASON_HISTORY_CAP_DESKTOP : SEASON_HISTORY_CAP_WEB;
}

function makePresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function allChampionIds(champs: Champion[]): number[] {
  return champs.map((c) => c.id);
}

// Compact encoding for the active tournament's recaps (v6 persistence
// format) lives in lib/recapCompression.ts — memoized by object
// identity so partialize (which runs on EVERY set) only pays encoding
// cost for recaps/matches that actually changed. Archived history on
// web still uses slimTournamentForArchive (no chart data at all).

// Memoized compact encoding for franchise realities — each slot carries a full
// SeasonState; without this, partialize re-encoded nothing and disk/json size
// ballooned for long franchises (69+ archived years).
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
export function applyMetaSnapshotPatch(
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

export function autoResolveOffseasonShop(
  season: SeasonState,
  champions: readonly Champion[],
): SeasonState {
  let next = aiResolveUserOffseason(season, champions);
  next = aiHonorFollowedAgency(next, champions);
  next = aiDecideFollowedDemotes(next, champions);
  const me = next.config.controlledTeamId;
  const hire = bestCoachHire(next);
  if (me && hire) next = { ...next, teams: swapCoaches(next.teams, me, hire) };
  return next;
}

function autoResolveTransferWindow(
  season: SeasonState,
  champions: readonly Champion[],
): SeasonState {
  let next = aiResolveUserTransferWindow(season, champions);
  next = aiHonorFollowedAgency(next, champions);
  next = aiDecideFollowedDemotes(next, champions);
  return advanceTransferWindow(next, champions);
}

export function rollFranchiseToNextYearState(
  season: SeasonState,
  champions: readonly Champion[],
  prevHistory: SeasonHistoryEntry[],
): { season: SeasonState; history: SeasonHistoryEntry[] } {
  const entry = buildSeasonHistoryEntry(season, Date.now());
  const historyBase = [entry, ...prevHistory.filter((e) => e.id !== entry.id)].slice(
    0,
    seasonHistoryCap(),
  );
  const prePool = season.franchise!.inactivePool ?? [];
  const next = startNextSeason(season, champions);
  const inactivePlayers = next.franchise?.aging
    ? inactiveSnapshotsForArchivedYear(
        prePool,
        next.franchise.inactivePool ?? [],
        season.franchise!.year,
      )
    : undefined;
  const archived =
    inactivePlayers != null ? { ...entry, inactivePlayers } : entry;
  const history = historyBase.map((e) => (e.id === archived.id ? archived : e));
  return { season: next, history };
}

function freezeSeasonTournamentStage(t: TournamentState): TournamentState {
  const stageDone = t.matches
    .filter((m) => m.bracket === undefined)
    .every((m) => m.winner != null);
  if (
    (t.format === "groups-playoffs" ||
      t.format === "groups-playoffs-de" ||
      t.format === "groups-playoffs-te") &&
    !t.groupsPlayoffs?.playoffStarted &&
    stageDone
  ) {
    return startGroupsPlayoffs(t);
  }
  if (
    (t.format === "swiss-playoffs" ||
      t.format === "swiss-playoffs-de" ||
      t.format === "swiss-playoffs-te") &&
    !t.swissPlayoffsStarted &&
    isSwissStageComplete(t)
  ) {
    return startSwissPlayoffs(t);
  }
  if (
    (t.format === "round-robin-playoffs" ||
      t.format === "round-robin-playoffs-te" ||
      t.format === "round-robin-playoffs-step") &&
    !t.rrPlayoffsStarted &&
    stageDone
  ) {
    return startRoundRobinPlayoffs(t);
  }
  return t;
}

function isSwissFormat(t: TournamentState): boolean {
  return (
    t.format === "swiss" ||
    t.format === "swiss-playoffs" ||
    t.format === "swiss-playoffs-de" ||
    t.format === "swiss-playoffs-te"
  );
}

function isSwissPlayoffsFormat(t: TournamentState): boolean {
  return (
    t.format === "swiss-playoffs" ||
    t.format === "swiss-playoffs-de" ||
    t.format === "swiss-playoffs-te"
  );
}

async function runSwissStageSimulation(
  get: StoreGet,
  set: StoreSet,
  toPlayoffs: boolean,
): Promise<void> {
  const { tournament: cur, champions, playerForms, simulating } = get();
  if (!cur || simulating || !isSwissFormat(cur)) return;
  if (toPlayoffs && (!isSwissPlayoffsFormat(cur) || cur.swissPlayoffsStarted)) {
    return;
  }
  if (isSwissStageComplete(cur)) {
    if (toPlayoffs) {
      const updated = startSwissPlayoffs(cur);
      if (updated !== cur) {
        set((state) => ({
          tournament: updated,
          ...seasonPatchFor(state, updated),
        }));
      }
    }
    return;
  }

  set({
    simulating: "all", bulkYearsCancelRequested: false,
    simProgress: {
      done: cur.matches.filter(
        (m) => m.bracket === undefined && m.winner != null,
      ).length,
      total: cur.matches.filter((m) => m.bracket === undefined).length,
    },
    simStartedAt: Date.now(),
  });

  try {
    await new Promise((r) => setTimeout(r, 0));
    const runId = cur.id;
    let working = cur;
    let currentForms = playerForms;
    let metaChangedOverall = false;
    const BATCH = 4;
    let sinceCommit = 0;
    const safetyCap = 200;

    for (let safety = 0; safety < safetyCap; safety++) {
          if (get().bulkYearsCancelRequested) break;
      if (get().tournament?.id !== runId) return;

      const swissStartable = working.matches.find(
        (m) =>
          m.bracket === undefined &&
          !m.winner &&
          m.blueTeamId != null &&
          m.redTeamId != null,
      );

      if (!swissStartable) {
        if (isSwissStageComplete(working)) {
          if (toPlayoffs && isSwissPlayoffsFormat(working)) {
            working = startSwissPlayoffs(working);
          }
          break;
        }
        break;
      }

      const [next, nextForms] = await runAutoPlayMatch(
        working,
        swissStartable.id,
        champions,
        currentForms,
      );
      working = next;
      currentForms = nextForms;
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
        const swissMatches = working.matches.filter(
          (m) => m.bracket === undefined,
        );
        set((state) => ({
          tournament: working,
          ...seasonPatchFor(state, working),
          playerForms: currentForms,
          simProgress: {
            done: swissMatches.filter((m) => m.winner).length,
            total: swissMatches.length,
          },
        }));
      }
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
      ...(metaChangedOverall &&
      working.metaSnapshot?.metaOverride !== cur.metaSnapshot?.metaOverride
        ? {
            metaOverride: working.metaSnapshot?.metaOverride ?? null,
            metaVersion: state.metaVersion + 1,
          }
        : {}),
    }));
  } finally {
    set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsCancelRequested: false });
    try { await flushPendingPersistWrites(); } catch (error) { reportPersistenceError(`Simulation stopped; save failed: ${String(error)}`, "simulation"); }
  }
}

const SIM_RESULTS_FLUSH_MS = 200;
let pendingSimResultUpdates: SimResultEntry[] = [];
let simResultsFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function resetSimResultsBatch(): void {
  pendingSimResultUpdates = [];
  if (simResultsFlushTimer != null) {
    clearTimeout(simResultsFlushTimer);
    simResultsFlushTimer = null;
  }
}

export function flushSimResultsFeed(set: StoreSet): void {
  if (simResultsFlushTimer != null) {
    clearTimeout(simResultsFlushTimer);
    simResultsFlushTimer = null;
  }
  if (pendingSimResultUpdates.length === 0) return;
  const batch = pendingSimResultUpdates;
  pendingSimResultUpdates = [];
  set((s) => {
    const next = compressSimResultsFeed([...s.simResultsFeed, ...batch]);
    if (next === s.simResultsFeed) return s;
    return { simResultsFeed: next };
  });
}

function scheduleSimResultsFlush(set: StoreSet): void {
  if (simResultsFlushTimer != null) return;
  simResultsFlushTimer = setTimeout(() => {
    simResultsFlushTimer = null;
    flushSimResultsFeed(set);
  }, SIM_RESULTS_FLUSH_MS);
}

export function appendSimResults(
  set: StoreSet,
  season: SeasonState,
  seen: Set<string>,
  entryCache?: SimResultEntryCache,
): void {
  const updates = collectSimResultUpdates(season, seen, entryCache);
  if (updates.length === 0) return;
  pendingSimResultUpdates.push(...updates);
  scheduleSimResultsFlush(set);
}

/** Drive one franchise year to completion; auto-resolves transfer windows. */
export async function runFranchiseSeasonSim(
  get: StoreGet,
  set: StoreSet,
  realityId: string,
  shouldCancel: () => boolean,
  seen: Set<string>,
  entryCache?: SimResultEntryCache,
): Promise<boolean> {
  let currentForms = get().playerForms;
  const safetyCap = 5000;
  let sinceCommit = 0;
  const BATCH = 4;
  for (let step = 0; step < safetyCap; step++) {
          if (get().bulkYearsCancelRequested) break;
    if (shouldCancel()) return false;
    const cur = get().season;
    if (!bulkSimRealityMatches(cur, realityId)) return false;
    if (cur.status === "complete") return true;

    const phase = cur.phases[cur.phaseIndex];
    if (phase?.kind === "transfer" && phase.status === "in-progress") {
      set({
        season: autoResolveTransferWindow(cur, get().champions),
      });
      await new Promise((r) => setTimeout(r, 0));
      continue;
    }

    const champions = get().champions;
    const t = nextPendingSeasonTournament(cur);
    if (!t) return false;

    const startable = t.matches.find(
      (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
    );
    if (!startable) {
      const frozen = freezeSeasonTournamentStage(t);
      if (frozen === t) return false;
      set((s) => ({ ...seasonPatchFor(s, frozen) }));
      continue;
    }

    let [after, nextForms] = await runAutoPlayMatch(
      t,
      startable.id,
      champions,
      currentForms,
    );
    if (!bulkSimRealityMatches(get().season, realityId)) return false;
    currentForms = nextForms;
    const evo = evolveMetaForTournament(after, champions);
    if (evo.tournament !== after) {
      setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
      saveMetaOverride(evo.snapshot?.metaOverride ?? null);
      after = evo.tournament;
    }
    sinceCommit++;
    const livePhase = currentSeasonPhase(cur);
    const progress = livePhase ? seasonPhaseProgress(cur, livePhase) : null;
    if (sinceCommit >= BATCH) {
      sinceCommit = 0;
      set((s) => ({
        ...seasonPatchFor(s, after),
        playerForms: currentForms,
        ...(progress ? { simProgress: progress } : {}),
      }));
      const live = get().season;
      if (live) appendSimResults(set, live, seen, entryCache);
    } else {
      set((s) => ({ ...seasonPatchFor(s, after), playerForms: currentForms }));
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  const final = get().season;
  if (final) appendSimResults(set, final, seen, entryCache);
  return final?.status === "complete";
}

// Backfill cosmetic identity (icon/color/personality) on seasons
// persisted by builds that predate those fields on SeasonTeam — they
// rendered as an invisible color swatch + the generic shield icon.
// Identity is also propagated into every tournament's team copies
// (tournaments snapshot it at creation). No-op (same reference) for
// healthy seasons.
export function ensureSeasonIdentities(season: SeasonState): SeasonState {
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

// Pick a random personality id from PERSONALITY_LIST. Used when assigning
// personalities to AI tournament teams at creation time.
function randomPersonalityId(): string {
  const idx = Math.floor(Math.random() * PERSONALITY_LIST.length);
  return PERSONALITY_LIST[idx].id;
}

let realitySwitchVersion = 0;

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
  realities: [],
  activeRealityId: null,
  pendingReality: null,
  seasonMatchday: null,
  simResultsFeed: [],
  dismissSimResultsFeed: () => {
    resetSimResultsBatch();
    set({ simResultsFeed: [] });
  },
  simulating: null,
  simProgress: null,
  simStartedAt: null,
  bulkYearsProgress: null,
  bulkYearJobs: {},
  bulkYearsCancelRequested: false,
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
    // Region Tides carry across years: seed the new season from the most
    // recent completed season — the just-finished one still in memory if it
    // wasn't archived yet, otherwise the latest Hall-of-Seasons entry (which
    // survives reloads). Ignored unless the new season has Region Tides on.
    const priorSeason: SeasonHistoryEntry | undefined =
      state.season?.status === "complete"
        ? buildSeasonHistoryEntry(state.season, Date.now())
        : state.seasonHistory.find((e) => e.complete);
    const built = createSeason({
      config,
      teams: ensureTeamIdentities(teams),
      activeMeta: {
        metaOverride: state.metaOverride,
        metaEnabled: state.metaEnabled,
        synergyOverride: state.synergyOverride,
        counterOverride: state.counterOverride,
      },
      priorSeason,
    });
    // If this season was started from the Realities hub, promote it to Year 1
    // of a new continuous timeline and register the reality save.
    const pending = state.pendingReality;
    const season = pending
      ? seedFranchise(built, pending.name, pending.aging, Math.random, state.champions)
      : built;
    const realityPatch =
      pending && season.franchise
        ? {
            activeRealityId: season.franchise.id,
            realities: [
              ...state.realities.filter((r) => r.id !== season.franchise!.id),
              {
                id: season.franchise.id,
                name: season.franchise.name,
                year: 1,
                season,
                history: [] as SeasonHistoryEntry[],
              },
            ],
          }
        : {};
    set({
      season,
      seasonViewOpen: true,
      preSeasonMetaSnapshot: userMeta,
      pendingReality: null,
      tournament: null,
      series: null,
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      playerForms: {},
      sideChoicePending: false,
      ...realityPatch,
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

  exitSeasonView: async () => {
    // Snapshot the live season into the reality slot. On desktop, upsert ONLY
    // that reality row (compact encode happens inside seasonJsonForDb) so leave
    // isn't blocked on rewriting every franchise + history in the DB.
    signalLeavingSeason();
    await waitForDesktopOverlayPaint();
    try {
      const before = get();
      const activeId =
        before.activeRealityId &&
        before.season?.franchise?.id === before.activeRealityId
          ? before.activeRealityId
          : null;

      set((s) => ({
        seasonViewOpen: false,
        tournament: null,
        series: null,
        selectedChampionId: null,
        secondsLeft: null,
        ...(activeId && s.season
          ? {
              realities: s.realities.map((r) =>
                r.id === activeId
                  ? { ...r, year: s.season!.franchise!.year, season: s.season! }
                  : r,
              ),
            }
          : {}),
        ...(s.preSeasonMetaSnapshot
          ? applyMetaSnapshotPatch(s.preSeasonMetaSnapshot, s)
          : {}),
      }));

      if (isDesktop() && activeId) {
        const slot = get().realities.find((r) => r.id === activeId);
        if (slot) {
          await upsertRealityInDb({
            id: slot.id,
            name: slot.name,
            year: slot.year,
            season: slot.season,
          });
        }
        // Global persist can finish in the background — reality season is already on disk.
        void flushPendingPersistWrites().catch((err) =>
          console.warn("[draftsim] exitSeasonView background flush failed:", err),
        );
      }
    } finally {
      clearDesktopOperation();
    }
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

  resolveSeasonTransfer: (index, accept) => {
    const season = get().season;
    if (!season) return;
    set({ season: resolveSeasonTransfer(season, index, accept) });
  },

  aiDecideSeasonTransfers: () => {
    const { season, champions } = get();
    if (!season) return;
    let next = aiResolveUserTransferWindow(season, champions);
    next = aiHonorFollowedAgency(next, champions);
    next = aiDecideFollowedDemotes(next, champions);
    set({ season: next });
  },

  aiDecideOffseason: () => {
    const { season, champions } = get();
    if (!season?.franchise || season.status !== "complete") return;
    set({ season: autoResolveOffseasonShop(season, champions) });
  },

  honorAgencyDemand: (demandId) => {
    const { season, champions } = get();
    if (!season) return;
    const next = applyHonorAgencyDemand(season, champions, demandId);
    if (next) set({ season: next });
  },

  overrideAgencyDemand: (demandId) => {
    const season = get().season;
    if (!season) return;
    const next = applyOverrideAgencyDemand(season, demandId);
    if (next) set({ season: next });
  },

  advanceSeasonTransfers: () => {
    const { season, champions } = get();
    if (!season) return;
    set({ season: advanceTransferWindow(season, champions) });
  },

  shopSeasonTransfer: (lane, otherTeamId) => {
    const { season, champions } = get();
    if (!season) return;
    set({ season: executeUserTransfer(season, champions, lane, otherTeamId) });
  },

  shopOffseasonTransfer: (lane, otherTeamId) => {
    const { season, champions } = get();
    if (!season) return;
    set({ season: executeOffseasonUserTransfer(season, champions, lane, otherTeamId) });
  },

  shopOffseasonFa: (lane, faPlayerId) => {
    const { season, champions } = get();
    if (!season) return;
    const next = applyUserFaSign(season, champions, lane, faPlayerId);
    if (next) set({ season: next });
  },

  shopFaToAcademy: (faPlayerId) => {
    const { season } = get();
    if (!season) return;
    const next = applyUserFaToAcademy(season, faPlayerId);
    if (next) set({ season: next });
  },

  shopAcademyRecall: (lane, academyPlayerId) => {
    const { season, champions } = get();
    if (!season) return;
    const next = applyUserAcademyRecall(season, champions, lane, academyPlayerId);
    if (next) set({ season: next });
  },

  shopAcademyRelease: (academyPlayerId) => {
    const { season } = get();
    if (!season) return;
    const next = applyUserAcademyRelease(season, academyPlayerId);
    if (next) set({ season: next });
  },

  shopAcademyRookie: (lane) => {
    const { season, champions } = get();
    if (!season) return;
    const next = applyUserAcademyRookie(season, champions, lane);
    if (next) set({ season: next });
  },

  shopRookie: (lane) => {
    const { season, champions } = get();
    if (!season) return;
    const next = applyUserRookieSign(season, champions, lane);
    if (next) set({ season: next });
  },

  demoteFollowedPlayer: (lane) => {
    const { season } = get();
    if (!season) return;
    const next = applyUserManualDemote(season, lane);
    if (next) set({ season: next });
  },

  shopOffseasonCoach: (otherTeamId) => {
    const { season } = get();
    // Coaches only change in the post-Worlds offseason of a reality.
    if (!season?.franchise || season.status !== "complete") return;
    const me = season.config.controlledTeamId;
    if (!me || me === otherTeamId) return;
    set({ season: { ...season, teams: swapCoaches(season.teams, me, otherTeamId) } });
  },

  updateSeasonConfig: (patch) => {
    const { season } = get();
    // Format changes only apply between years — edit the completed season's
    // config so startNextSeason picks them up for the new year.
    if (!season?.franchise || season.status !== "complete") return;
    set({ season: { ...season, config: { ...season.config, ...patch } } });
  },

  ...createFranchiseActions(get, set, { rollFranchiseToNextYearState }),

  // NOTE: a reality keeps its OWN Hall in its slot's `history`. The global
  // `seasonHistory` is the one-off Season mode's Hall and is never touched by
  // realities, so the two never mix.




  ...createSimulationActions(get, set, { resetSimResultsBatch, runFranchiseSeasonSim, appendSimResults, autoResolveOffseasonShop, rollFranchiseToNextYearState, applyMetaSnapshotPatch, flushSimResultsFeed }),




  switchReality: async (id) => {
    if (get().simulating) { get().cancelBulkYears(); return; }
    const request = ++realitySwitchVersion;
    signalOpeningReality();
    await waitForDesktopOverlayPaint();
    try {
      const initial = get().realities.find(r => r.id === id);
      if (!initial) return;
      const history = isDesktop() && !isRealityHistoryLoaded(id)
        ? await loadRealityHistoryFromDb(id) : initial.history;
      // Drain snapshots captured before the history was available.
      await flushPendingPersistWrites();
      if (request !== realitySwitchVersion) return;
      const s = get();
      const target = s.realities.find(r => r.id === id);
      if (!target || target !== initial) return;
      const decodedSeason = decodeCompactSeason(target.season);
      if (isDesktop()) markRealityHistoryLoaded(id);
      set({
        realities: s.realities.map(r => {
          if (r.id === id) return { ...r, season: decodedSeason, history };
          return r.id === s.activeRealityId && s.season?.franchise
            ? { ...r, year: s.season.franchise.year, season: s.season } : r;
        }),
        activeRealityId: id,
        season: decodedSeason,
        seasonViewOpen: true,
      });
    } finally {
      if (request === realitySwitchVersion) clearDesktopOperation();
    }
  },

  deleteReality: async (id) => {
    if (get().simulating) throw new Error("Pause simulation before deleting a reality.");
    await backupBeforeDestructiveChange();
    const snapshot = get().realities.find((r) => r.id === id);
    const suggestCompact =
      isDesktop() && snapshot != null && shouldSuggestCompactAfterDelete(snapshot);

    set((s) => {
      const wasActive = s.activeRealityId === id;
      return {
        realities: s.realities.filter((r) => r.id !== id),
        ...(wasActive
          ? { activeRealityId: null, season: null, seasonViewOpen: false }
          : {}),
      };
    });

    if (!isDesktop()) return;

    signalDeletingReality();
    try {
      await deleteRealityFromDb(id);
      await flushPendingPersistWrites();
    } catch (err) {
      console.warn("[draftsim] deleteReality DB sync failed:", err);
    } finally {
      clearDesktopOperation();
    }

    return { suggestCompact };
  },

  exportReality: async (id) => {
    // If the reality being exported is the live one, snapshot its progress
    // first so the export matches what's on screen.
    const s = get();
    const live =
      s.activeRealityId === id && s.season?.franchise?.id === id ? s.season : null;
    const r = s.realities.find((x) => x.id === id);
    if (!r) return null;
    let history = r.history;
    if (isDesktop() && !isRealityHistoryLoaded(id)) {
      try {
        await flushPendingPersistWrites();
        history = await loadRealityHistoryFromDb(id);
      } catch (error) {
        console.warn("[draftsim] export history could not be loaded:", error);
        return null;
      }
    }
    const season = decodeCompactSeason(live ?? r.season);
    const payload = {
      kind: "reality" as const,
      version: 1,
      reality: {
        id: r.id,
        name: r.name,
        year: live?.franchise?.year ?? r.year,
        // Compact-encode tournaments (the heavy part); history résumés ride
        // along as-is.
        season: {
          ...season,
          tournaments: Object.fromEntries(
            Object.entries(season.tournaments).map(([tid, t]) => [
              tid,
              compactEncodeTournamentForPersist(t),
            ]),
          ),
        },
        history,
      },
    };
    return JSON.stringify(payload);
  },

  exportRealityShareCode: async (id) => {
    const json = await get().exportReality(id);
    if (!json) return null;
    try {
      return await encodeRealityShareCode(json);
    } catch {
      return null;
    }
  },

  ...createImportsActions(get, set, { ensureSeasonIdentities, applyMetaSnapshotPatch, savedSeasonsCap, seasonHistoryCap, ACTION_SECONDS }),



  simSeason: (scope) => {
    const { season, simulating } = get();
    if (!season || simulating) return;
    if (season.status === "complete") return;
    const trackResults = scope === "all";
    if (trackResults) resetSimResultsBatch();
    set({
      simulating: "all", bulkYearsCancelRequested: false,
      simProgress: null,
      simStartedAt: Date.now(),
      ...(trackResults ? { simResultsFeed: [] } : {}),
    });
    void (async () => {
      const seen = trackResults ? new Set<string>() : null;
      const entryCache = trackResults ? new Map() as SimResultEntryCache : null;
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
          if (get().bulkYearsCancelRequested) break;
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
                t.format === "groups-playoffs-de" ||
                t.format === "groups-playoffs-te") &&
              !t.groupsPlayoffs?.playoffStarted &&
              stageDone
            ) {
              frozen = startGroupsPlayoffs(t);
            } else if (
              (t.format === "swiss-playoffs" ||
                t.format === "swiss-playoffs-de" ||
                t.format === "swiss-playoffs-te") &&
              !t.swissPlayoffsStarted &&
              isSwissStageComplete(t)
            ) {
              frozen = startSwissPlayoffs(t);
            } else if (
              (t.format === "round-robin-playoffs" ||
                t.format === "round-robin-playoffs-te" ||
                t.format === "round-robin-playoffs-step") &&
              !t.rrPlayoffsStarted &&
              stageDone
            ) {
              frozen = startRoundRobinPlayoffs(t);
            }
            if (frozen === t) break; // stuck — bail rather than spin
            set((s) => ({ ...seasonPatchFor(s, frozen) }));
            continue;
          }
          let [after, nextForms] = await runAutoPlayMatch(
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
            if (seen) {
              const live = get().season;
              if (live) appendSimResults(set, live, seen, entryCache ?? undefined);
            }
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
        if (seen) {
          const final = get().season;
          if (final) appendSimResults(set, final, seen, entryCache ?? undefined);
        }
      } finally {
        flushSimResultsFeed(set);
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsCancelRequested: false });
    try { await flushPendingPersistWrites(); } catch (error) { reportPersistenceError(`Simulation stopped; save failed: ${String(error)}`, "simulation"); }
      }
    })().catch(error => reportPersistenceError(`Operation stopped: ${String(error)}`, "simulation"));
  },

  simSeasonMatchday: (tournamentId) => {
    const { season, simulating } = get();
    if (!season || simulating || season.status === "complete") return;
    set({ simulating: "all", bulkYearsCancelRequested: false, simProgress: null, simStartedAt: Date.now() });
    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 0));
        const runId = season.id;
        const champions = get().champions;
        let forms = get().playerForms;

        // Freeze a completed regular stage into its playoff bracket, so a
        // single matchday click transparently crosses the regular→playoff
        // boundary.
        const freezeStage = freezeSeasonTournamentStage;
        // The current matchday = every ready match at the lowest unplayed
        // round (one RR/Swiss round, one group matchday, or one bracket
        // round).
        const matchdayIds = (t: TournamentState): string[] => {
          const ready = t.matches.filter(
            (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
          );
          if (ready.length === 0) return [];
          const round = Math.min(...ready.map((m) => m.round));
          return ready.filter((m) => m.round === round).map((m) => m.id);
        };

        const cur0 = get().season;
        if (!cur0) return;
        const phase = cur0.phases[cur0.phaseIndex];
        if (!phase) return;
        const isSplit = phase.kind === "split";
        const targetIds: string[] = (isSplit
          ? phase.tournamentIds.slice()
          : (() => {
              const t = nextPendingSeasonTournament(cur0);
              return t ? [t.id] : [];
            })()
        ).filter((id) => !tournamentId || id === tournamentId);

        const regions: SeasonMatchdayRegion[] = [];
        let mdRound = 0;
        let sawBracket = false;

        for (const tid of targetIds) {
          if (get().bulkYearsCancelRequested) break;
          const live0 = get().season?.tournaments[tid];
          if (!live0 || live0.status === "complete") continue;
          let t = live0;
          const frozen = freezeStage(t);
          if (frozen !== t) {
            set((s) => ({ ...seasonPatchFor(s, frozen) }));
            t = get().season?.tournaments[tid] ?? frozen;
          }
          const wasPlayIn = t.name.includes("Play-In");
          const ids = matchdayIds(t);
          if (ids.length === 0) continue;
          const results: SeasonMatchdayMatch[] = [];
          for (const id of ids) {
          if (get().bulkYearsCancelRequested) break;
            const liveT = get().season?.tournaments[tid];
            if (!liveT) break;
            const m = liveT.matches.find((x) => x.id === id);
            if (!m || m.winner || m.blueTeamId == null || m.redTeamId == null) {
              continue;
            }
            const blue = liveT.teams.find((x) => x.id === m.blueTeamId);
            const red = liveT.teams.find((x) => x.id === m.redTeamId);
            let [after, nf] = await runAutoPlayMatch(liveT, id, champions, forms);
            forms = nf;
            const evo = evolveMetaForTournament(after, champions);
            if (evo.tournament !== after) {
              setActiveMetaOverride(evo.snapshot?.metaOverride ?? null);
              saveMetaOverride(evo.snapshot?.metaOverride ?? null);
              after = evo.tournament;
            }
            const fm = after.matches.find((x) => x.id === id);
            if (fm?.winner && blue && red) {
              mdRound = Math.max(mdRound, fm.round);
              if (fm.bracket != null) sawBracket = true;
              const teamRef = (tt: typeof blue): SeasonMatchdayTeam => ({
                id: tt.id,
                name: tt.name,
                iconKey: tt.iconKey ?? "shield",
                color: tt.color ?? "#c8aa6e",
                logoUrl: tt.logoUrl,
              });
              results.push({
                blue: teamRef(blue),
                red: teamRef(red),
                blueScore: fm.winner.blueWins,
                redScore: fm.winner.redWins,
                blueWon: fm.winner.teamId === blue.id,
                stage:
                  fm.bracket != null
                    ? liveT.format === "round-robin-playoffs-step"
                      ? "stepladder"
                      : fm.bracket
                    : fm.groupId
                      ? "group"
                      : "regular",
                ...(fm.groupId ? { group: fm.groupId } : {}),
                ...(isReverseSweep(fm) ? { tags: ["reverse-sweep"] } : {}),
                tournamentId: tid,
                matchId: fm.id,
                hasReplay: Boolean(fm.series),
              });
            }
            set((s) => ({ ...seasonPatchFor(s, after), playerForms: forms }));
            await new Promise((r) => setTimeout(r, 0));
          }
          // A play-in that just finished → list who reached the main event.
          let qualified: SeasonMatchdayTeam[] | undefined;
          const afterT = get().season?.tournaments[tid];
          if (wasPlayIn && afterT?.status === "complete") {
            const ph2 = get().season?.phases[get().season!.phaseIndex];
            const mainId = ph2?.tournamentIds.find((x) => x !== tid);
            const main = mainId ? get().season?.tournaments[mainId] : null;
            if (main) {
              const inPlayIn = new Set(afterT.teams.map((x) => x.id));
              qualified = main.teams
                .filter((x) => inPlayIn.has(x.id))
                .map((x) => ({
                  name: x.name,
                  iconKey: x.iconKey ?? "shield",
                  color: x.color ?? "#c8aa6e",
                  logoUrl: x.logoUrl,
                }));
            }
          }
          regions.push({
            league: leagueOfTournament(cur0, t),
            name: t.name,
            results,
            ...(qualified && qualified.length > 0 ? { qualified } : {}),
          });
        }

        const stageWord = sawBracket
          ? isSplit
            ? "Playoffs"
            : "Round"
          : isSplit
            ? "Matchday"
            : "Round";
        const label =
          regions.length > 0
            ? `${phase.label} · ${stageWord}${mdRound > 0 ? ` ${mdRound}` : ""}`
            : phase.label;
        set((s) =>
          s.season && s.season.id === runId
            ? { seasonMatchday: { label, regions }, playerForms: forms }
            : {},
        );
      } finally {
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsCancelRequested: false });
    try { await flushPendingPersistWrites(); } catch (error) { reportPersistenceError(`Simulation stopped; save failed: ${String(error)}`, "simulation"); }
      }
    })().catch(error => reportPersistenceError(`Operation stopped: ${String(error)}`, "simulation"));
  },

  // ─── Saved seasons ───────────────────────────────────────────────────

  saveCurrentSeason: () => {
    const season = get().season;
    // A reality season belongs to its own slot — "Save" snapshots the live
    // season back into the reality, it never leaks into the one-off
    // savedSeasons list. switchReality/continueSeasonToNextYear also sync the
    // slot; this lets the user save mid-year without switching away.
    const rid = season?.franchise?.id;
    if (rid) {
      set((s) => ({
        realities: s.realities.map((r) =>
          r.id === rid
            ? { ...r, year: season!.franchise!.year, season: season! }
            : r,
        ),
      }));
      return true;
    }
    const entry = get().exportCurrentSeason();
    if (!entry) return false;
    set((s) => ({
      savedSeasons: [
        entry,
        ...s.savedSeasons.filter((e) => e.id !== entry.id),
      ].slice(0, savedSeasonsCap()),
    }));
    return true;
  },

  exportCurrentSeason: () => {
    const state = get();
    const season = state.season;
    if (!season) return null;
    return {
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
      // Snapshot the in-progress draft/match so loading resumes exactly here —
      // not back at the dashboard. Compact-encode the live tournament the same
      // way the season's stage tournaments are encoded.
      series: state.series,
      tournament: state.tournament
        ? compactEncodeTournamentForPersist(state.tournament)
        : null,
      seasonViewOpen: state.seasonViewOpen,
      sideChoicePending: state.sideChoicePending,
    };
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
      // Resume EXACTLY where the save was taken: restore the in-progress draft
      // series + live tournament + view/pending flags instead of dropping to
      // the dashboard. Older slots without these fields fall back to the
      // dashboard (series/tournament null, view open) — same as before.
      seasonViewOpen: entry.seasonViewOpen ?? true,
      preSeasonMetaSnapshot: preSeason,
      tournament: entry.tournament
        ? decodeCompactTournament(entry.tournament)
        : null,
      series: entry.series ?? null,
      // Transient draft UI (highlighted-not-locked champ, timer, AI rationale)
      // resets cleanly; the locked picks/bans live in `series`.
      selectedChampionId: null,
      secondsLeft: null,
      aiRationale: null,
      aiRationaleHistory: [],
      sideChoicePending: entry.sideChoicePending ?? false,
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
    // A reality's seasons archive into THAT reality's Hall; one-off seasons
    // archive into the global Hall. They never mix.
    const rid = season.franchise?.id;
    if (rid) {
      set((s) => ({
        realities: s.realities.map((r) =>
          r.id === rid
            ? {
                ...r,
                history: [entry, ...r.history.filter((e) => e.id !== entry.id)].slice(
                  0,
                  seasonHistoryCap(),
                ),
              }
            : r,
        ),
      }));
      return true;
    }
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

  removeSeasonFromHistory: (entryId, realityId) => {
    // A reality keeps its own Hall in its slot; the one-off Season-mode Hall is
    // the global list. Route the removal to whichever the user is viewing.
    if (realityId) {
      set((s) => ({
        realities: s.realities.map((r) =>
          r.id === realityId
            ? { ...r, history: r.history.filter((e) => e.id !== entryId) }
            : r,
        ),
      }));
      return;
    }
    set((s) => ({
      seasonHistory: s.seasonHistory.filter((e) => e.id !== entryId),
    }));
  },

  clearSeasonHistory: (realityId) => {
    if (realityId) {
      set((s) => ({
        realities: s.realities.map((r) =>
          r.id === realityId ? { ...r, history: [] } : r,
        ),
      }));
      return;
    }
    set({ seasonHistory: [] });
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
    const playerForms = get().playerForms;
    const locked = effectiveLockedSet(tournament, fearlessLockedSet(series));
    const tournamentWR = tournament
      ? computeTournamentChampionWR(tournament)
      : undefined;
    const teamWR = tournament ? computeTeamChampionWR(tournament) : undefined;
    const personality = getPersonality(
      action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
    );
    const championId =
      preDecidedId ??
      chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(
          series,
          action.side,
          champions,
          tournamentWR,
          {
            map: playerForms,
            keyFor: tournament
              ? (n) => tournament.teams.find((t) => t.name === n)?.id ?? n
              : undefined,
          },
          teamWR,
        ),
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
    const playerForms = get().playerForms;
    const locked = effectiveLockedSet(tournament, fearlessLockedSet(series));
    const tournamentWR = tournament
      ? computeTournamentChampionWR(tournament)
      : undefined;
    const teamWR = tournament ? computeTeamChampionWR(tournament) : undefined;
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
        {
          map: playerForms,
          keyFor: tournament
            ? (n) => tournament.teams.find((t) => t.name === n)?.id ?? n
            : undefined,
        },
        teamWR,
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
      variancePreset: tctx?.variancePreset,
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
    // Fold the just-played live series back onto its match record — during
    // play the series lives only in state.series, so without this the match
    // keeps the empty series startMatch stashed and the played games (with
    // their recaps/ratings) are lost. Mirrors the bulk auto-sim path.
    const tournamentWithSeries: TournamentState = {
      ...tournament,
      matches: tournament.matches.map((m) =>
        m.id === match.id ? { ...m, series } : m,
      ),
    };
    const withPicks = appendMatchPicks(tournamentWithSeries, match.id, series);
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
      tournament.format === "swiss-playoffs-de" ||
      tournament.format === "swiss-playoffs-te"
    ) {
      updated = startSwissPlayoffs(tournament);
    } else if (
      tournament.format === "round-robin-playoffs" ||
      tournament.format === "round-robin-playoffs-te" ||
      tournament.format === "round-robin-playoffs-step"
    ) {
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
    set({ simulating: "match", bulkYearsCancelRequested: false });
    setTimeout(async () => {
      try {
        const { tournament: cur, champions, playerForms } = get();
        if (!cur) return;
        const [after, newForms] = await runAutoPlayMatch(cur, matchId, champions, playerForms);
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
    set({
      simulating: "all", bulkYearsCancelRequested: false,
      simProgress: { done: 0, total: matchIds.length },
      simStartedAt: Date.now(),
    });
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
          if (get().bulkYearsCancelRequested) break;
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
          const [next, nextForms] = await runAutoPlayMatch(working, id, champions, currentForms);
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
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsCancelRequested: false });
    try { await flushPendingPersistWrites(); } catch (error) { reportPersistenceError(`Simulation stopped; save failed: ${String(error)}`, "simulation"); }
      }
    })().catch(error => reportPersistenceError(`Operation stopped: ${String(error)}`, "simulation"));
  },

  simulateSwissStage: () => {
    void runSwissStageSimulation(get, set, false);
  },

  simulateSwissToPlayoffs: () => {
    void runSwissStageSimulation(get, set, true);
  },

  simulateAllRemaining: () => {
    const { tournament, simulating } = get();
    if (!tournament || simulating) return;
    if (tournament.status === "complete") return;
    set({
      simulating: "all", bulkYearsCancelRequested: false,
      simProgress: {
        done: tournament.matches.filter((m) => m.winner).length,
        total: tournament.matches.length,
      },
      simStartedAt: Date.now(),
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
          if (get().bulkYearsCancelRequested) break;
          // Abort if the tournament was exited/replaced mid-run — never
          // resurrect stale state with a late commit.
          if (get().tournament?.id !== runId) return;
          const startable = working.matches.find(
            (m) => !m.winner && m.blueTeamId != null && m.redTeamId != null,
          );
          if (!startable) {
            if (
              (working.format === "groups-playoffs" ||
                working.format === "groups-playoffs-de" ||
                working.format === "groups-playoffs-te") &&
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
                working.format === "swiss-playoffs-de" ||
                working.format === "swiss-playoffs-te") &&
              !working.swissPlayoffsStarted &&
              isSwissStageComplete(working)
            ) {
              working = startSwissPlayoffs(working);
              continue;
            }
            if (
              (working.format === "round-robin-playoffs" ||
                working.format === "round-robin-playoffs-te" ||
                working.format === "round-robin-playoffs-step") &&
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
          const [next, nextForms] = await runAutoPlayMatch(working, startable.id, champions, currentForms);
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
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsCancelRequested: false });
    try { await flushPendingPersistWrites(); } catch (error) { reportPersistenceError(`Simulation stopped; save failed: ${String(error)}`, "simulation"); }
      }
    })().catch(error => reportPersistenceError(`Operation stopped: ${String(error)}`, "simulation"));
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
    // v7: desktop uses SQLite (per-reality rows + lazy history); web unchanged.
    version: PERSIST_VERSION,
    // Desktop: file-backed LAZY storage — setItem receives the persisted
    // state OBJECT and defers JSON.stringify into the 500ms debounced
    // flush, so per-set() serialization cost is eliminated (critical for
    // bulk simulation which commits state many times per second).
    //
    // Web: lazy + debounced JSON.stringify into quotaSafeStorage (same 500ms
    // debounce as desktop). Bulk sim no longer blocks the main thread on every
    // set() with a full-state stringify.
    //
    // Both paths gate writes until enablePersistWrites() so a mount-time
    // set() cannot overwrite disk/localStorage with empty initial state
    // while async rehydration is still in flight.
    storage: gatePersistWritesUntilReady(
      isDesktop()
        ? createDesktopSqliteStorage()
        : createWebLazyStorage(() => resolveWebStringStorage(quotaSafeStorage)),
    ),
    partialize: (state) => ({
      bulkYearJobs: state.bulkYearJobs,
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
        ? compactEncodeSeasonForPersist(state.season)
        : null,
      seasonViewOpen: state.seasonViewOpen,
      preSeasonMetaSnapshot: state.preSeasonMetaSnapshot,
      // Saved seasons — entries are compact-encoded at save time.
      savedSeasons: state.savedSeasons,
      // Season history — tiny résumé snapshots, persisted as-is.
      seasonHistory: state.seasonHistory,
      // Franchise realities — compact-encode each slot's season tournaments
      // (the heavy part of a 69-year save). Memoized by realities reference.
      realities: compactEncodeRealitiesForPersist(state.realities),
      activeRealityId: state.activeRealityId,
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
    onRehydrateStorage: () => (state, error) => {
      if (error) {
        console.warn("[draftsim] persist rehydration failed:", error);
        forcePersistReady();
        return;
      }
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
      // Active season only — inactive franchise slots stay compact-encoded
      // in memory until switchReality decodes the target (saves load time on
      // 69-year saves where only one year is live).
      if (state?.season) {
        const decoded = decodeCompactSeason(
          ensureSeasonIdentities(state.season),
        );
        state.season = decoded;
        if (state.activeRealityId && state.realities?.length) {
          state.realities = state.realities.map((r) =>
            r.id === state.activeRealityId ? { ...r, season: decoded } : r,
          );
        }
      }
      // Desktop: history entries were archived with compact encoding — decode
      // them so replay charts work from the history panel as well.
      if (state?.tournamentHistory && isDesktop()) {
        state.tournamentHistory = state.tournamentHistory.map((t) =>
          decodeCompactTournament(t),
        );
      }
      enablePersistWrites();
      // JSON → SQLite migration runs inside createDesktopSqliteStorage
      // getItem (before the first read), not here — doing it after rehydrate
      // would leave memory empty while a later set() could overwrite the
      // just-migrated file.
    },
  },
  ),
);
