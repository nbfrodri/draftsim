// Season mode — a full competitive year simulated on top of the
// tournament engine. Six regional leagues play three splits (Winter,
// Spring, Summer); after each split the best teams qualify for an
// international event (First Stand, MSI, Worlds). Every stage IS a
// TournamentState driven by the existing engine, so brackets, drafts,
// recaps, replays, and meta evolution all come for free.

import type {
  SeriesFormat,
  Roster,
  AIDifficulty,
  VariancePreset,
  PlayerTier,
  Lane,
} from "../types";
import type { MetaOverride, Synergy, CounterPair } from "../championMeta";
import type { InactivePlayer, RosterNewsEvent } from "./playerLifecycle";
import type { Coach } from "./coach";
import type { TournamentFormat, TournamentState } from "../tournament";

// ─── Leagues ───────────────────────────────────────────────────────────────

export type LeagueId = "LCK" | "LPL" | "LEC" | "LCS" | "CBLOL" | "LCP";

// Fixed league order, also used as the inter-league power ranking for
// international seeding (earlier = stronger region: equal in-league
// seeds are ordered LCK > LPL > LEC > LCS > CBLOL > LCP).
export const LEAGUE_IDS: readonly LeagueId[] = [
  "LCK",
  "LPL",
  "LEC",
  "LCS",
  "CBLOL",
  "LCP",
];

export const LEAGUE_NAMES: Record<LeagueId, string> = {
  LCK: "LCK · Korea",
  LPL: "LPL · China",
  LEC: "LEC · Europe",
  LCS: "LCS · North America",
  CBLOL: "CBLOL · Brazil",
  LCP: "LCP · Asia-Pacific",
};

export const TEAMS_PER_LEAGUE = 10;

// ─── Calendar ──────────────────────────────────────────────────────────────

export type SplitId = "winter" | "spring" | "summer";
export type InternationalId = "first-stand" | "msi" | "worlds" | "global-cup";

/** Internationals shown in calendar/setup (Global Cup is automatic on quadrennial franchise years). */
export const CONFIGURABLE_INTERNATIONAL_IDS = [
  "first-stand",
  "msi",
  "worlds",
] as const satisfies readonly InternationalId[];

/** Full display order for timeline / records (includes quadrennial cup). */
export const INTERNATIONAL_DISPLAY_ORDER: readonly InternationalId[] = [
  "first-stand",
  "msi",
  "worlds",
  "global-cup",
];

export const SPLIT_LABELS: Record<SplitId, string> = {
  winter: "Winter Split",
  spring: "Spring Split",
  summer: "Summer Split",
};

/** Default tournament name — user can rename later. */
export const GLOBAL_CUP_NAME = "Global Cup";

export const INTERNATIONAL_LABELS: Record<InternationalId, string> = {
  "first-stand": "First Stand",
  msi: "MSI",
  worlds: "Worlds",
  "global-cup": GLOBAL_CUP_NAME,
};

// How many teams each league sends to each international (taken from
// that international's preceding split placements).
export const QUALIFIER_COUNTS: Record<InternationalId, number> = {
  "first-stand": 2, // Winter top 2 per league → 12 teams, single-elim
  msi: 3, //          Spring top 3 per league → 18 teams, swiss → DE-8
  worlds: 4, //       Summer top 4 per league → 18 direct + play-in
  "global-cup": 32, // Top 32 by end-of-season global ranking (not split-fed)
};

// Which split feeds which international.
export const QUALIFYING_SPLIT: Record<InternationalId, SplitId> = {
  "first-stand": "winter",
  msi: "spring",
  worlds: "summer",
  "global-cup": "summer", // Runs after Worlds in the same calendar year
};

// Inverse of QUALIFYING_SPLIT — which international a split feeds.
export const SPLIT_FEEDS_EVENT: Record<SplitId, InternationalId> = {
  winter: "first-stand",
  spring: "msi",
  summer: "worlds",
};

// One phase of the season calendar, in play order.
export interface SeasonPhase {
  // "transfer" phases hold no tournaments — they're the between-splits roster
  // window that follows First Stand and MSI. Their `event` names the
  // international they follow (the window key).
  kind: "split" | "international" | "transfer";
  split?: SplitId;
  event?: InternationalId;
  label: string;
  // Tournament ids belonging to this phase. Splits hold 6 (one per
  // league); First Stand holds 1; Worlds holds the play-in first and
  // gains the main event id once the play-in completes. MSI usually
  // holds 1, but an odd swiss field (the First Stand champion's
  // additive 19th slot) opens with an MSI Play-In the same way.
  tournamentIds: string[];
  status: "pending" | "in-progress" | "complete";
}

// ─── Configuration ─────────────────────────────────────────────────────────

export interface SeasonLeagueConfig {
  // Tournament format for the league split (round-robin,
  // round-robin-playoffs, groups-playoffs(-de), swiss(-playoffs)(-de)).
  format: TournamentFormat;
  // Teams advancing to the split playoffs (double-elim brackets snap to
  // the nearest supported size — 4/6/8 all work; Top 6 gives the top 2
  // seeds a first-round bye). Ignored for non-playoff formats.
  playoffTeams: number;
  // Series length for regular-stage matches and playoff matches.
  regularSeries: SeriesFormat;
  playoffSeries: SeriesFormat;
  // Series length for the playoff semifinals (the matches feeding the
  // final — in double-elim: W-Final + L-Final) and the final itself
  // (the DE grand final). Optional for seasons saved before these
  // existed; both fall back to playoffSeries.
  semifinalSeries?: SeriesFormat;
  finalsSeries?: SeriesFormat;
  // Round-robin / round-robin-playoffs formats only: number of times
  // every team plays every other team. 1 = single round-robin
  // (default), 2 = double round-robin (home & away). Optional for older
  // saves; ignored for non round-robin formats.
  roundRobinLegs?: number;
  // Double-elim playoff brackets only: when true the grand final is a
  // single decisive series (no bracket reset). Omitted/false keeps the
  // standard reset convention. Ignored for non-DE formats.
  trueGrandFinal?: boolean;
  // Swiss formats only: threshold mode (modern Worlds Swiss). When true,
  // teams play until they reach X wins (qualify) or X losses (eliminated)
  // — X fixed by the field size — instead of a fixed round count. Only
  // engages for a power-of-2 field ≥ 8 (else it falls back to fixed
  // rounds). Omitted/false = fixed rounds. Ignored for non-Swiss formats.
  swissThreshold?: boolean;
}

// Per-international format configuration. Optional on SeasonConfig —
// events without an entry use their canonical defaults (First Stand:
// single-elim; MSI: swiss into DE-8; Worlds: 4 groups into SE knockout).
export interface SeasonIntlConfig {
  // Tournament format of the event. For Worlds this configures the
  // MAIN event — the play-in is always a small single-elim qualifier.
  // Plain "double-elim" is honored only for First Stand (its 12-team
  // field fits the bracket); other events coerce it back to their
  // canonical format (see intlConfigFor).
  format: TournamentFormat;
  // Series length for early rounds / regular stage, and for the
  // playoff bracket / late single-elim rounds.
  earlySeries: SeriesFormat;
  finalsSeries: SeriesFormat;
  // Series length for the semifinals (the matches feeding the final —
  // in double-elim: W-Final + L-Final). Optional for seasons saved
  // before this existed; falls back to finalsSeries.
  semifinalSeries?: SeriesFormat;
  // Teams advancing to the playoff bracket for stage+playoffs formats
  // (double-elim brackets snap to the nearest supported size).
  playoffTeams: number;
  // ─── Play-in customization ──────────────────────────────────────────
  // Bracket format for this event's play-in qualifier. Only meaningful
  // where the play-in has enough teams for the choice (the Worlds play-in
  // is a 6-team field — single- or double-elim both fit). Omitted keeps
  // the canonical single-elim play-in. The MSI play-in is a 2-team
  // decider, so it ignores this.
  playInFormat?: "single-elim" | "double-elim";
  // Series length for play-in matches. Omitted falls back to earlySeries.
  playInSeries?: SeriesFormat;
  // Turn the play-in stage on/off. Omitted/true keeps the canonical
  // behavior (Worlds always runs a play-in; MSI runs one only when the
  // field misfits its format). false at Worlds = every qualified team
  // (incl. the #4 seeds) enters the main event directly; false at MSI =
  // never run the field-trimming play-in.
  playInEnabled?: boolean;
  // Worlds only: how many play-in finalists advance to the main event
  // (default 2, auto-reduced to keep groups/swiss fields even). The
  // entrant pool — each league's #4 seed — is unchanged.
  playInAdvancing?: number;
  // Double-elim brackets only (First Stand DE, or the DE playoff bracket
  // of swiss-/groups-playoffs-de): when true the grand final is a single
  // decisive series with no bracket reset. Ignored for non-DE formats.
  trueGrandFinal?: boolean;
  // Swiss formats only: threshold mode (modern Worlds Swiss). When true,
  // teams play until X wins (qualify) or X losses (out), X fixed by the
  // field size. Only engages for a power-of-2 field ≥ 8 (e.g. the 16-team
  // Worlds main stage); otherwise falls back to fixed rounds. Omitted/false
  // = fixed rounds. Ignored for non-Swiss formats.
  swissThreshold?: boolean;
}

export interface SeasonConfig {
  name: string;
  // When true, every league uses leagueConfigs.LCK (the "shared" slot).
  sharedLeagueConfig: boolean;
  leagueConfigs: Record<LeagueId, SeasonLeagueConfig>;
  // Per-event international formats. Missing entries (and seasons saved
  // before this existed) fall back to the canonical event shapes.
  intlConfigs?: Partial<Record<InternationalId, SeasonIntlConfig>>;
  // Meta shifts slightly after each completed round inside every event.
  liveMeta: boolean;
  // Bigger "patch" shift applied between phases (split → international
  // → split …).
  patchShift: boolean;
  fearless: boolean;
  aiDifficulty: AIDifficulty;
  // Optional team the user wants to follow/control. Matches involving
  // it are highlighted; the user can play them via the per-match
  // override modal when opening the league.
  controlledTeamId: string | null;
  // Series lengths at internationals (First Stand, MSI, Worlds):
  // early rounds / stages and the finals. Optional for seasons saved
  // before these existed — the engine falls back to bo3 / bo5.
  intlEarlySeries?: SeriesFormat;
  intlFinalsSeries?: SeriesFormat;
  // Draft timer for matches the user plays. Optional (older saves);
  // defaults to off.
  timerEnabled?: boolean;
  // ── Season-realism options (all optional; default off → classic
  //    behavior and byte-identical serialization for old saves) ──
  // Hot/cold form: each tournament's results nudge a hidden per-team
  // strength modifier that regresses to the roster baseline; surfaced as a
  // trending tier badge.
  formDrift?: boolean;
  // Player development: between splits, individual player tiers drift —
  // lower-rated rosters trend up, peaked ones regress down, modulated by
  // recent form — so team star ratings move across the year.
  playerDevelopment?: boolean;
  // Player transfers: between splits, a light free-agency window moves
  // standout players up and weak links down. A player's transfer value
  // blends skill tier, the split's match grades, and how well their
  // champion pool fits the CURRENT patch — so a cold pool can cost a star
  // a seat even at equal tier. Cross-region, ~1-2 moves per lane.
  playerTransfers?: boolean;
  // Meta adaptability: teams carry a hidden adaptability trait; each
  // between-phase patch shift nudges adaptable teams' form up and rigid
  // teams' down (only meaningful alongside patchShift).
  metaAdaptability?: boolean;
  // Clutch factor: teams carry a hidden clutch trait that tilts win
  // probability in elimination rounds, and within-series momentum gives the
  // series leader a small per-game-lead edge.
  clutchFactor?: boolean;
  // Regional tides: international results feed a per-league strength score
  // that reorders inter-league seeding (a hot region's #N seeds outrank a
  // cold region's #N seeds), instead of the fixed LCK>LPL>… order.
  regionTides?: boolean;
  // Match variance preset: a single dial over upset likelihood. Bundles
  // deciding-game coin-flippiness, favorites choking under elimination, and
  // a chalky↔chaotic scaling of the star-rating bias. Absent ⇒ classic
  // model (no variance effects, byte-identical serialization). "balanced"
  // is the gentle middle; "chalky" favors the better team; "chaotic" makes
  // ratings matter less and upsets more common.
  variancePreset?: VariancePreset;
}

// ─── Teams ─────────────────────────────────────────────────────────────────

export interface SeasonTeam {
  id: string;
  leagueId: LeagueId;
  name: string;
  color: string;
  iconKey: string;
  // Real pro team logo URL (https), set when the team is named from the
  // LoL Esports API or the bundled snapshot. Absent for generated teams,
  // which fall back to the colored Tabler icon.
  logoUrl?: string;
  players: Roster;
  personalityId: string;
  // The team's coach — rating drives AI draft strength, plus playstyle +
  // meta-adaptability. Optional (older saves lack it; backfilled on load).
  coach?: Coach;
}

// ─── Season state ──────────────────────────────────────────────────────────

export interface SeasonMetaSnapshot {
  metaOverride: MetaOverride | null;
  metaEnabled: boolean;
  synergyOverride: Synergy[] | null;
  counterOverride: CounterPair[] | null;
}

export interface SeasonState {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  config: SeasonConfig;
  teams: SeasonTeam[];
  phases: SeasonPhase[];
  phaseIndex: number;
  // Every tournament of the season keyed by id (splits + internationals).
  tournaments: Record<string, TournamentState>;
  // Final placements (ordered team ids, best first) per completed split
  // per league, and per international.
  splitResults: Partial<Record<SplitId, Partial<Record<LeagueId, string[]>>>>;
  intlResults: Partial<Record<InternationalId, string[]>>;
  // The season's CURRENT meta — seeded from the user's active meta at
  // creation, evolved by live meta inside events and patch shifts
  // between phases. Every new tournament snapshots this.
  currentMeta: SeasonMetaSnapshot;
  // Frozen copy of the meta the season STARTED on, before any live
  // evolution or patch shifts. Lets the end-of-year archive show how
  // far the meta drifted. Optional — seasons saved before this field
  // existed simply don't know their starting meta.
  initialMeta?: SeasonMetaSnapshot;
  // Worlds champion (set when the final phase completes).
  champion: string | null;
  status: "in-progress" | "complete";
  // ── Season-realism state (present only when the matching config flag is
  //    on; absent otherwise so default seasons serialize unchanged) ──
  // Signed per-team form modifier in [-1, 1]; regresses toward 0 each
  // tournament. Feeds the sim bias and the trending tier badge. [formDrift]
  teamForm?: Record<string, number>;
  // Stable per-team clutch trait in [-1, 1] (elimination-round tilt),
  // seeded at season creation. [clutchFactor]
  teamClutch?: Record<string, number>;
  // Stable per-team meta-adaptability trait in [-1, 1], seeded at season
  // creation; patch shifts convert it into a form swing. [metaAdaptability]
  teamAdaptability?: Record<string, number>;
  // Per-league strength score (higher = seeds above weaker regions),
  // updated after each international. [regionTides]
  leagueStrength?: Partial<Record<LeagueId, number>>;
  // Each team's player tiers (lane order) as they were BEFORE the most
  // recent player-development pass — so the UI can show ▲/▼ shift arrows.
  // [playerDevelopment]
  prevPlayerTiers?: Record<string, PlayerTier[]>;
  // Franchise/"reality" context: present when this season is one year of a
  // continuous timeline (teams + careers carry across years). Absent for a
  // classic one-off season. `aging` (chosen at reality creation) decides
  // whether the offseason ages players / demotes underperformers / introduces
  // rookies or returnees. usedNames: every player/coach handle that has EVER
  // existed in this reality, so generation never reuses a name. inactivePool:
  // academy / free-agent / retired players waiting for a slot (or archived).
  franchise?: {
    id: string;
    name: string;
    year: number;
    aging: boolean;
    usedNames?: string[];
    inactivePool?: InactivePlayer[];
    /** User FA / academy signs in the current window (mid-season transfer or offseason). */
    faSignsThisWindow?: number;
    /**
     * Manual bench/demotes the followed team made this shopping window
     * (cap: USER_MAX_MANUAL_DEMOTES in faMarket).
     */
    manualDemotesThisWindow?: number;
    /**
     * Player ids demoted this window (auto or manual) — blocked from FA /
     * academy fills until the window quota resets (no instant return).
     */
    sameWindowDemoteIds?: string[];
    /**
     * Player ids signed as rookies this window (shopRookie / applyUserRookieSign).
     * Cannot be benched in the same window — no instant sign-then-demote.
     */
    sameWindowRookieIds?: string[];
    /**
     * When a followed team has transfer windows, winter/spring demotions are
     * deferred until the user finishes that window — so they can shop FA /
     * academy before AI vacancy fills snatch free agents.
     */
    pendingMidSplitDemotion?: SplitId;
    /**
     * Player-agency demands for the current transfer / offseason shopping
     * window (leave / call-up / academy depart). Cleared or expired when the
     * window closes. See `lib/season/playerAgency.ts`.
     */
    agencyDemands?: import("./playerAgency").AgencyDemand[];
  };
  // Snapshot of every team's roster as each split / international COMPLETED, so
  // the Hall can show who played each stage (rosters shift between stages via
  // transfer windows). Captured at phase completion; archived into history.
  phaseRosters?: PhaseRosterSnapshot[];
  // Completed roster moves per transfer window, keyed by the international the
  // window followed ("first-stand" / "msi"). Powers the league-wide transfer
  // recap on each transfer-phase node. Absent until a window runs.
  // [playerTransfers]
  transfersByEvent?: Partial<Record<InternationalId, PlayerTransfer[]>>;
  // Pending moves that involve the FOLLOWED team — surfaced for the user to
  // accept or decline instead of auto-applying, so a controlled roster only
  // ever changes by the user's call. Cleared as each window is resolved or a
  // new one opens. [playerTransfers + controlledTeamId]
  proposedTransfers?: ProposedTransfer[];
  // Demotions + entrants from THIS year's offseason (aging on), tagged by team.
  // Distinguishes rookie debuts from academy/FA returnees. Regenerated each
  // offseason; absent when aging is off or nobody was demoted.
  rosterNews?: Array<RosterNewsEvent & { teamId: string }>;
}

// A snapshot of a moving player at transfer time, so each record renders its
// own tier / split grade / champion pool without depending on live rosters
// (which change in later windows).
export interface TransferPlayer {
  /** Stable player id, so a recap name can open that player's card/profile.
   *  Optional — legacy saves snapshotted moves before ids were carried. */
  id?: string;
  name?: string; // in-game handle, when the roster carries one
  tier: PlayerTier;
  grade: number | null; // avg 1-10 match note this split (null = didn't play)
  goodChamps: number[]; // champion-pool ids (mains first)
}

// One completed swap from a transfer window: `star` (the higher-valued player)
// moved from `fromTeamId` up to the better seat `toTeamId`; `swap` moved the
// other way. `lane` is shared (same positional slot on both teams).
export interface PlayerTransfer {
  event: InternationalId;
  lane: Lane;
  fromTeamId: string;
  toTeamId: string;
  star: TransferPlayer;
  swap: TransferPlayer;
}

// A transfer awaiting the user's decision because it touches the followed
// team. `kind` is from the controlled team's view: "incoming" = a stronger
// player wants to join (accept to upgrade, dropping `mine`); "outgoing" = a
// rival is poaching your `mine` (accept to let them go for `theirs`, decline to
// keep them). Accepting swaps the `laneIndex` players between the two teams.
export interface ProposedTransfer {
  event: InternationalId;
  lane: Lane;
  laneIndex: number;
  controlledTeamId: string;
  otherTeamId: string;
  kind: "incoming" | "outgoing";
  mine: TransferPlayer; // the followed team's current player at this lane
  theirs: TransferPlayer; // the other team's player at this lane
}

// A compact roster snapshot for one team at one stage of the year.
export interface TeamRosterSnapshot {
  teamId: string;
  teamName: string;
  leagueId: LeagueId;
  logoUrl?: string;
  // The team's coach at this stage (name + rating + playstyle label), when it
  // had one. `playstyle` is optional — only on snapshots saved after it existed.
  coach?: { name: string; rating: number; playstyle?: string };
  players: Array<{
    id?: string;
    name?: string;
    tier: PlayerTier;
    lane: Lane;
    age?: number;
    debutYear?: number;
    potential?: PlayerTier;
    goodChamps?: number[];
    badChamps?: number[];
  }>;
}

// One player who was OFF every main roster as a split / international
// completed. Retired players are deliberately excluded: nobody retires
// mid-year (the clock only advances at the year-end offseason) and the pool
// carries them forever, so stamping them would grow every snapshot without
// telling the career timeline anything the year-end pool doesn't already say.
export interface PhaseInactiveSnapshot {
  playerId: string;
  status: "academy" | "free-agent";
  /** Org holding the academy deal, or the free agent's last club. */
  teamId?: string;
  teamName?: string;
}

// Every team's roster as a given split / international completed.
export interface PhaseRosterSnapshot {
  phaseIndex: number;
  label: string;
  kind: "split" | "international";
  split?: SplitId;
  event?: InternationalId;
  teams: TeamRosterSnapshot[];
  // Academy / free-agent pool at the same instant, so a career timeline can
  // say where a player was in EVERY window of the year — not just the ones he
  // played. Optional: seasons played before phase stamps existed have none,
  // and their careers degrade to the year-only view.
  inactive?: PhaseInactiveSnapshot[];
}

export function seasonTeam(
  season: SeasonState,
  teamId: string | null | undefined,
): SeasonTeam | null {
  if (!teamId) return null;
  return season.teams.find((t) => t.id === teamId) ?? null;
}
