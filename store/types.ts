import {
type CounterPair,
type MetaOverride,
type Synergy
} from "@/lib/championMeta";
import {
type AIRationale
} from "@/lib/draftAI";
import {
type PowerSpikeOverride
} from "@/lib/metaRandomizer";
import {
type PlayerFormMap
} from "@/lib/playerForm";
import {
type RealityExportTarget
} from "@/lib/realityExport";
import {
type SeasonHistoryEntry
} from "@/lib/season/history";
import {
type SimResultEntry
} from "@/lib/season/simResultsSummary";
import type {
LeagueId,
SeasonConfig,
SeasonState,
SeasonTeam
} from "@/lib/season/types";
import type { TeamStrategy } from "@/lib/sim/strategies";
import {
type CreateTournamentParams,
type TournamentState
} from "@/lib/tournament";
import type {
Champion,
Lane,
SeriesState,
Side,
SimulationSettings
} from "@/lib/types";

export interface RealitySeasonSummary {
  status: SeasonState["status"] | null;
}

export interface SavedReality {
  id: string;
  name: string;
  year: number;
  /** null means a dormant desktop season has not been loaded, never an empty save. */
  season: SeasonState | null;
  seasonSummary?: RealitySeasonSummary;
  history: SeasonHistoryEntry[];
}

export type LoadedReality = SavedReality & { season: SeasonState };

export type MetaSource = "default" | "randomized" | "custom";

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

export interface SavedSeasonEntry {
  /** Mirrors season.id — saving the same season upserts its slot. */
  id: string;
  savedAt: number;
  season: SeasonState;
  playerForms: PlayerFormMap;
  // In-progress state so a save mid-draft/mid-match resumes EXACTLY where the
  // user left off (a real "save game"), not just at the dashboard. The active
  // draft series, the live tournament being played (compact-encoded like the
  // season's), and the view/pending flags. All optional → older slots that
  // predate this still load (they just resume at the dashboard).
  series?: SeriesState | null;
  tournament?: TournamentState | null;
  seasonViewOpen?: boolean;
  sideChoicePending?: boolean;
}

export interface SeasonMatchdayTeam {
  /** Live season team id — used by team hover cards. */
  id?: string;
  name: string;
  iconKey: string;
  color: string;
  // Real pro team logo URL (https), when the team was named from the LoL
  // Esports API. Absent for generated teams → falls back to the icon.
  logoUrl?: string;
}

export interface SeasonMatchdayMatch {
  blue: SeasonMatchdayTeam;
  red: SeasonMatchdayTeam;
  blueScore: number;
  redScore: number;
  /** True when the blue team won the series. */
  blueWon: boolean;
  /** Stage tag: "winners" | "losers" | "elimination" | "grand-final" |
   *  "grand-final-reset" | "group" | "regular". */
  stage: string;
  /** Group letter when stage === "group". */
  group?: string;
  /** Match result tags (e.g. reverse sweep on a 3-2 comeback). */
  tags?: string[];
  /** Live tournament + match ids for opening the replay modal. */
  tournamentId?: string;
  matchId?: string;
  /** False when the match was resolved without series/recap data. */
  hasReplay?: boolean;
}

export interface SeasonMatchdayRegion {
  league: LeagueId | null;
  name: string;
  results: SeasonMatchdayMatch[];
  /** Teams that advanced when a play-in completed this matchday. */
  qualified?: SeasonMatchdayTeam[];
}

export interface SeasonMatchdayResult {
  label: string;
  regions: SeasonMatchdayRegion[];
}

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

export interface DraftStore {
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
  /** Epoch ms when the current bulk sim run started (not persisted). */
  simStartedAt: number | null;
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
  exitSeasonView: () => Promise<void>;
  // Permanently delete the season (restores user meta).
  abandonSeason: () => void;
  // Load one of the season's tournaments as the active tournament so
  // the user can browse its bracket or play/sim matches through the
  // normal tournament flow. Updates sync back into the season.
  openSeasonTournament: (tournamentId: string) => void;
  // Accept or decline a pending followed-team transfer (index into
  // season.proposedTransfers). Accepting swaps the players; either way the
  // proposal is cleared.
  resolveSeasonTransfer: (index: number, accept: boolean) => void;
  // Hand the open window to the AI: it accepts the proposals that improve the
  // roster, declines the rest, and shops the best upgrade per lane (offseason
  // also hires a clearly better coach). For users who'd rather not micro-manage.
  aiDecideSeasonTransfers: () => void;
  aiDecideOffseason: () => void;
  // Close the open transfer window and move on to the next split. Any
  // proposals left undecided are treated as declined.
  advanceSeasonTransfers: () => void;
  // User-initiated swap: trade the followed team's player at `lane` for the
  // named team's player, if that team would agree. No-op otherwise.
  shopSeasonTransfer: (lane: Lane, otherTeamId: string) => void;
  // Same, but for the post-Worlds OFFSEASON on a completed reality season.
  shopOffseasonTransfer: (lane: Lane, otherTeamId: string) => void;
  /** Sign an FA into a followed-team lane (offseason or mid-season transfer; value-gap gated). */
  shopOffseasonFa: (lane: Lane, faPlayerId: string) => void;
  /** Honor a pending player-agency demand (leave / call-up / depart). */
  honorAgencyDemand: (demandId: string) => void;
  /** Override a pending player-agency demand (keep the player). */
  overrideAgencyDemand: (demandId: string) => void;
  /** Sign an FA into the followed team's academy (not roster; academy must have room). */
  shopFaToAcademy: (faPlayerId: string) => void;
  /** Call up own academy player into a followed-team lane (same windows / gap as FA). */
  shopAcademyRecall: (lane: Lane, academyPlayerId: string) => void;
  /** Release own academy player to free agency. */
  shopAcademyRelease: (academyPlayerId: string) => void;
  /** Generate a rookie into the followed team's academy (room required). */
  shopAcademyRookie: (lane?: Lane) => void;
  /** Fill a vacant followed-team lane with a generated rookie (transfer / offseason). */
  shopRookie: (lane: Lane) => void;
  /** Manually bench a followed-team player to academy (opens vacancy; max 2/window). */
  demoteFollowedPlayer: (lane: Lane) => void;
  // Offseason coach market: swap the user's coach with another team's coach.
  shopOffseasonCoach: (otherTeamId: string) => void;
  // Edit the completed reality season's config (split/intl formats) so the
  // change carries into next year via startNextSeason(prev.config).
  updateSeasonConfig: (patch: Partial<SeasonConfig>) => void;
  // Simulate the current phase (all its tournaments), the entire
  // remaining season, or one specific tournament (a single league's
  // split, or one international). Auto-advances phases, applies patch
  // shifts, and crowns the Worlds champion.
  simSeason: (scope: "phase" | "all" | { tournamentId: string }) => void;
  // Advance every region (split phases) — or the current event (intl
  // phases) — by exactly ONE matchday/round, in lockstep, and record the
  // results into `seasonMatchday` for the dashboard's Latest Matchday
  // panel. Works for the round-robin/Swiss/group regular stage AND for
  // playoff brackets (freezing standings into the bracket transparently).
  // Pass a tournamentId to advance just that one region's matchday.
  simSeasonMatchday: (tournamentId?: string) => void;
  // Results of the most recently simulated matchday (ephemeral — not
  // persisted; resets on reload). null until the first matchday is run.
  seasonMatchday: SeasonMatchdayResult | null;
  /** Live feed of regional / international outcomes during bulk sims. */
  simResultsFeed: SimResultEntry[];
  /** Clear the simulation results feed from the dashboard. */
  dismissSimResultsFeed: () => void;
  // ─── Saved seasons (manual save slots, like saved tournaments) ─────
  savedSeasons: SavedSeasonEntry[];
  // Snapshot the active season (upsert by season id). Returns false
  // when no season is active.
  saveCurrentSeason: () => boolean;
  // Build the active season's save entry (same payload saveCurrentSeason
  // stores) without persisting it — for export-to-file. Null with no season.
  exportCurrentSeason: () => SavedSeasonEntry | null;
  // Add a season entry parsed from an exported .json file to Saved Seasons
  // (upsert by id). Returns the entry id so the caller can load it.
  importSeason: (json: string) => { ok: boolean; error?: string; id?: string };
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
  // realityId scopes the mutation to that reality's Hall; omit for the
  // one-off Season-mode Hall.
  removeSeasonFromHistory: (entryId: string, realityId?: string) => void;
  clearSeasonHistory: (realityId?: string) => void;

  // ─── Franchise / Realities (continuous multi-season timelines) ───────
  realities: SavedReality[];
  activeRealityId: string | null;
  /** Pending intent: the next started season becomes Year 1 of this reality
   *  (set by the Realities hub before sending the user to season setup). */
  pendingReality: { name: string; aging: boolean } | null;
  /** Begin a new reality — records the intent so the next `startSeason`
   *  promotes its result into Year 1 of a continuous timeline. */
  beginNewReality: (name: string, aging: boolean) => void;
  /** Turn the current configured season into Year 1 of a new named reality.
   *  `aging` enables the offseason aging/retirement/rookie simulation. */
  startReality: (name: string, aging: boolean) => void;
  /** Roll the (complete) active reality season into the next year. */
  continueSeasonToNextYear: () => void;
  /** Auto-simulate N full franchise years (splits, internationals, year roll). */
  simulateRealityYears: (
    count: number,
    options?: {
      saveAfterEachYear?: boolean;
      exportTarget?: RealityExportTarget;
    },
  ) => void;
  /** Request cancellation of an in-progress bulk-year simulation. */
  cancelBulkYears: () => void;
  resumeBulkYears: () => void;
  bulkYearJobs: Record<string, { targetYear: number; startedAt: number; error: string | null }>;

  /** Progress while simulateRealityYears runs (not persisted). */
  bulkYearsProgress: {
    completed: number;
    total: number;
    year: number;
    startedAt: number;
  } | null;
  bulkYearsCancelRequested: boolean;
  /** Switch the live season to another saved reality (snapshots the current). */
  switchReality: (id: string) => Promise<void>;
  deleteReality: (id: string) => Promise<{ suggestCompact: boolean } | void>;
  /** Serialize a reality (its timeline + its own season history) to a JSON
   *  string for download. Tournaments are compact-encoded. Null if unknown. */
  exportReality: (id: string) => Promise<string | null>;
  /** Export a reality as a REAL1: share code (compact import string). */
  exportRealityShareCode: (id: string) => Promise<string | null>;
  /** Restore a reality from an exported JSON string (upsert by id). */
  importReality: (json: string) => Promise<{ ok: boolean; error?: string; id?: string }>;
  /** Import from a REAL1: code or raw JSON export. */
  importRealityShareCode: (code: string) => Promise<{ ok: boolean; error?: string; id?: string }>;
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
  // Auto-play every remaining Swiss-stage match (dynamic round generation
  // included). Stops when the Swiss stage is complete — does not start
  // playoffs for swiss-playoffs formats.
  simulateSwissStage: () => void;
  // Complete the Swiss stage and freeze standings into the playoff bracket
  // for swiss-playoffs / swiss-playoffs-de / swiss-playoffs-te formats.
  simulateSwissToPlayoffs: () => void;
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

export type StoreGet = () => DraftStore;

export type StoreSet = (
  partial: Partial<DraftStore> | ((state: DraftStore) => Partial<DraftStore>),
) => void;
