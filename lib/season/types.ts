// Season mode — a full competitive year simulated on top of the
// tournament engine. Six regional leagues play three splits (Winter,
// Spring, Summer); after each split the best teams qualify for an
// international event (First Stand, MSI, Worlds). Every stage IS a
// TournamentState driven by the existing engine, so brackets, drafts,
// recaps, replays, and meta evolution all come for free.

import type { SeriesFormat, Roster, AIDifficulty } from "../types";
import type { MetaOverride, Synergy, CounterPair } from "../championMeta";
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
export type InternationalId = "first-stand" | "msi" | "worlds";

export const SPLIT_LABELS: Record<SplitId, string> = {
  winter: "Winter Split",
  spring: "Spring Split",
  summer: "Summer Split",
};

export const INTERNATIONAL_LABELS: Record<InternationalId, string> = {
  "first-stand": "First Stand",
  msi: "MSI",
  worlds: "Worlds",
};

// How many teams each league sends to each international (taken from
// that international's preceding split placements).
export const QUALIFIER_COUNTS: Record<InternationalId, number> = {
  "first-stand": 2, // Winter top 2 per league → 12 teams, single-elim
  msi: 3, //          Spring top 3 per league → 18 teams, swiss → DE-8
  worlds: 4, //       Summer top 4 per league → 18 direct + play-in
};

// Which split feeds which international.
export const QUALIFYING_SPLIT: Record<InternationalId, SplitId> = {
  "first-stand": "winter",
  msi: "spring",
  worlds: "summer",
};

// Inverse of QUALIFYING_SPLIT — which international a split feeds.
export const SPLIT_FEEDS_EVENT: Record<SplitId, InternationalId> = {
  winter: "first-stand",
  spring: "msi",
  summer: "worlds",
};

// One phase of the season calendar, in play order.
export interface SeasonPhase {
  kind: "split" | "international";
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
}

// ─── Teams ─────────────────────────────────────────────────────────────────

export interface SeasonTeam {
  id: string;
  leagueId: LeagueId;
  name: string;
  color: string;
  iconKey: string;
  players: Roster;
  personalityId: string;
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
}

export function seasonTeam(
  season: SeasonState,
  teamId: string | null | undefined,
): SeasonTeam | null {
  if (!teamId) return null;
  return season.teams.find((t) => t.id === teamId) ?? null;
}
