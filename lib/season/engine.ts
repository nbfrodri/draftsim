// Season engine — pure functions that orchestrate a full competitive
// year. Every stage (league split, First Stand, MSI, Worlds play-in,
// Worlds main event) is a regular TournamentState created through the
// existing tournament engine; this module decides WHICH tournaments
// exist, WHO plays in them (qualification + seeding), and how the meta
// rolls forward between phases (live evolution carry-over + patch
// shifts). No store access — the store drives simulation and feeds
// completed tournaments back through applyTournamentUpdate().

import type { SeriesFormat, PlayerTier } from "../types";
import type { Champion, Lane } from "../types";
import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "../championMeta";
import {
  deriveStar,
  PLAYER_TIER_VALUE,
  valueToTier,
  type RNG,
} from "../players";
import {
  createTournament,
  computeStandings,
  computeTripleElimStandings,
  computeBracketFinishOrder,
  playoffParticipantIds,
  playoffBracketKindFor,
  formatHasPlayoffs,
  inferGroupsConfig,
  teamStreak,
  tournamentChampion,
  type FormatOverrides,
  type TournamentDefaults,
  type TournamentFormat,
  type TournamentState,
  type TournamentTeam,
} from "../tournament";
import {
  INTERNATIONAL_LABELS,
  GLOBAL_CUP_NAME,
  LEAGUE_IDS,
  QUALIFIER_COUNTS,
  QUALIFYING_SPLIT,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SeasonConfig,
  type SeasonIntlConfig,
  type SeasonMetaSnapshot,
  type SeasonPhase,
  type SeasonState,
  type SeasonTeam,
  type SplitId,
} from "./types";
import type { SeasonHistoryEntry } from "./history";
import { applyTransfers, awardStabilityBonus } from "./transfers";
import {
  coachDifficulty,
  coachMotivationFactor,
  coachAdaptabilityTrait,
  coachDevTilt,
  nextCoachRating,
  coachPlaystyle,
} from "./coach";
import { applyPoolDrift } from "./poolDrift";
import {
  driftSynergiesFromResult,
  driftSynergiesOverTime,
  assignSynergies,
} from "../chemistry";

export function makeSeasonId(): string {
  return `season-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// League formats offered for splits — all valid for 10-team leagues
// (plain double-elim needs a power-of-2 field so it's excluded).
export const LEAGUE_FORMAT_OPTIONS: Array<{
  value: TournamentFormat;
  label: string;
}> = [
  { value: "round-robin-playoffs", label: "Round Robin + DE Playoffs" },
  { value: "round-robin-playoffs-te", label: "Round Robin + TE Playoffs" },
  { value: "round-robin-playoffs-step", label: "Round Robin + Stepladder" },
  { value: "round-robin", label: "Round Robin (no playoffs)" },
  { value: "triple-elim", label: "Triple Elimination (3 lives)" },
  { value: "groups-playoffs-te", label: "Groups + TE Playoffs" },
  { value: "swiss-playoffs-te", label: "Swiss + TE Playoffs" },
  { value: "groups-playoffs", label: "Groups + SE Playoffs" },
  { value: "groups-playoffs-de", label: "Groups + DE Playoffs" },
  { value: "swiss-playoffs", label: "Swiss + SE Playoffs" },
  { value: "swiss-playoffs-de", label: "Swiss + DE Playoffs" },
  { value: "swiss", label: "Swiss (no playoffs)" },
];

// ─── Series-format overrides ───────────────────────────────────────────────
// Brute-force key coverage: the generators look up per-round keys
// ("main:3", "po:wb:2", "lb:5", "gf", …) so we pre-write every plausible
// key for both the regular stage and any playoff bracket shape. Missing
// keys fall back to defaults.format (set to the regular series length).

function seriesOverrides(
  regular: SeriesFormat,
  playoffs: SeriesFormat,
  // Semifinals (the matches feeding the final — DE: W-Final + L-Final)
  // and the final / grand final. The generators look the semantic
  // "semis"/"final" keys up BEFORE the positional ones, so these win
  // for their rounds regardless of bracket size.
  semis: SeriesFormat = playoffs,
  finals: SeriesFormat = playoffs,
): FormatOverrides {
  const fo: FormatOverrides = { main: regular };
  for (let r = 1; r <= 40; r++) fo[`main:${r}`] = regular;
  for (let r = 1; r <= 6; r++) {
    fo[`wb:${r}`] = playoffs;
    fo[`po:wb:${r}`] = playoffs;
  }
  for (let r = 1; r <= 14; r++) {
    fo[`lb:${r}`] = playoffs;
    fo[`po:lb:${r}`] = playoffs;
  }
  fo["semis"] = semis;
  fo["po:semis"] = semis;
  fo["final"] = finals;
  fo["po:final"] = finals;
  fo["gf"] = finals;
  fo["po:gf"] = finals;
  return fo;
}

// Single-elim events with an escalating series length: every round at
// `early`, the semifinals at `semis`, the final at `final`. The
// semantic semis/final keys make the escalation robust to the actual
// bracket size; the positional writes (`teamCount` decides the round
// count, padding to the next power of 2) remain as a fallback.
function singleElimOverrides(
  teamCount: number,
  early: SeriesFormat,
  final: SeriesFormat,
  semis?: SeriesFormat,
): FormatOverrides {
  const rounds = Math.ceil(Math.log2(Math.max(2, teamCount)));
  const fo: FormatOverrides = {};
  for (let r = 1; r <= rounds; r++) {
    fo[`wb:${r}`] = r === rounds ? final : early;
  }
  fo["final"] = final;
  if (semis) fo["semis"] = semis;
  return fo;
}

// ─── Team plumbing ─────────────────────────────────────────────────────────

function toTournamentTeam(team: SeasonTeam, seed: number): TournamentTeam {
  const diff = coachDifficulty(team.coach);
  return {
    id: team.id,
    name: team.name,
    seed,
    starRating: deriveStar(team.players),
    iconKey: team.iconKey,
    color: team.color,
    logoUrl: team.logoUrl,
    players: team.players,
    // The coach drives the team's draft: their rating sets how strongly the AI
    // plays for this side, and their playstyle is the draft personality.
    personalityId: team.coach?.personalityId ?? team.personalityId,
    ...(diff ? { aiDifficulty: diff } : {}),
  };
}

function leagueTeams(season: SeasonState, league: LeagueId): SeasonTeam[] {
  return season.teams.filter((t) => t.leagueId === league);
}

// Signed streak each team carries INTO a new tournament: its current
// streak at the end of the most recent completed season tournament it
// played in (phases are iterated in calendar order; within a phase,
// tournamentIds are in creation order — e.g. Worlds play-in before main
// event). teamStreak already folds in that tournament's own carry-in
// seed, so streaks chain across the whole season: a team that closes
// the winter split on a 4-win run starts First Stand at +4, and if it
// keeps winning there it arrives at the spring split with the combined
// run intact. Teams with no completed history (or a streak of 0) are
// simply omitted.
function streakSeedsFor(
  season: SeasonState,
  teams: SeasonTeam[],
): Record<string, number> {
  const seeds: Record<string, number> = {};
  for (const team of teams) {
    let latest: TournamentState | null = null;
    for (const phase of season.phases) {
      for (const id of phase.tournamentIds) {
        const t = season.tournaments[id];
        if (!t || t.status !== "complete") continue;
        if (t.teams.some((tt) => tt.id === team.id)) latest = t;
      }
    }
    if (!latest) continue;
    const streak = teamStreak(latest, team.id);
    if (streak !== 0) seeds[team.id] = streak;
  }
  return seeds;
}

export function leagueOfTournament(
  season: SeasonState,
  t: TournamentState,
): LeagueId | null {
  const first = t.teams[0];
  if (!first) return null;
  return season.teams.find((st) => st.id === first.id)?.leagueId ?? null;
}

function defaultsFor(
  config: SeasonConfig,
  regular: SeriesFormat,
): TournamentDefaults {
  return {
    format: regular,
    fearless: config.fearless,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: config.aiDifficulty,
    timerEnabled: config.timerEnabled ?? false,
  };
}

// International series lengths — configurable since 2026 setups;
// older saved seasons fall back to the classic bo3 / bo5.
function intlSeries(config: SeasonConfig): {
  early: SeriesFormat;
  finals: SeriesFormat;
} {
  return {
    early: config.intlEarlySeries ?? "bo3",
    finals: config.intlFinalsSeries ?? "bo5",
  };
}

// Formats offered for international events. MSI/Worlds fields run
// 18-21 teams so plain double-elim is excluded there (the DE generator
// allows at most padded/4 byes); pure round-robin / swiss without
// playoffs are excluded too — an international needs a knockout to
// crown its champion.
export const INTL_FORMAT_OPTIONS: Array<{
  value: TournamentFormat;
  label: string;
}> = [
  { value: "single-elim", label: "Single Elimination" },
  { value: "triple-elim", label: "Triple Elimination (3 lives)" },
  { value: "groups-playoffs", label: "Groups + SE Playoffs" },
  { value: "groups-playoffs-de", label: "Groups + DE Playoffs" },
  { value: "groups-playoffs-te", label: "Groups + TE Playoffs" },
  { value: "swiss-playoffs", label: "Swiss + SE Playoffs" },
  { value: "swiss-playoffs-de", label: "Swiss + DE Playoffs" },
  { value: "swiss-playoffs-te", label: "Swiss + TE Playoffs" },
  { value: "round-robin-playoffs", label: "Round Robin + DE Playoffs" },
  { value: "round-robin-playoffs-te", label: "Round Robin + TE Playoffs" },
  { value: "round-robin-playoffs-step", label: "Round Robin + Stepladder" },
];

// Per-event option list: First Stand's 12-team field fits a plain
// double-elim bracket (a 16 bracket with exactly 4 byes — the
// generator's limit), so the event additionally offers it. The shared
// "All Events" card also offers it; events whose field can't host it
// fall back to their canonical format (see intlConfigFor).
export function intlFormatOptionsFor(
  event: InternationalId | "shared",
): Array<{ value: TournamentFormat; label: string }> {
  if (event !== "first-stand" && event !== "shared")
    return INTL_FORMAT_OPTIONS;
  return [
    INTL_FORMAT_OPTIONS[0],
    { value: "double-elim", label: "Double Elimination" },
    ...INTL_FORMAT_OPTIONS.slice(1),
  ];
}

/** Canonical shape of each international, used when the season config
 *  has no entry for the event (including seasons saved before
 *  per-event configs existed). Series lengths fall back to the legacy
 *  intlEarlySeries / intlFinalsSeries fields. */
export function defaultIntlConfig(
  config: SeasonConfig,
  event: InternationalId,
): SeasonIntlConfig {
  const { early, finals } = intlSeries(config);
  const format: TournamentFormat =
    event === "first-stand"
      ? "single-elim"
      : event === "global-cup"
        ? "single-elim"
      : event === "msi"
        ? "swiss-playoffs-de"
        : "groups-playoffs";
  // semifinalSeries is deliberately NOT defaulted here: a config that
  // sets finalsSeries but no semifinalSeries should have its semis
  // follow ITS finals (intlOverridesFor falls back at use time), not a
  // canonical value baked in by the spread in intlConfigFor.
  return { format, earlySeries: early, finalsSeries: finals, playoffTeams: 8 };
}

/** Effective config for an international: user overrides over the
 *  canonical defaults. */
export function intlConfigFor(
  config: SeasonConfig,
  event: InternationalId,
): SeasonIntlConfig {
  const cfg = {
    ...defaultIntlConfig(config, event),
    ...(config.intlConfigs?.[event] ?? {}),
  };
  // Plain double-elim only fits First Stand's 12-team field; MSI/Worlds
  // fields (18-21 teams) exceed the DE generator's bye limit. A stray
  // config (e.g. a shared "All Events" setup picking double-elim)
  // falls back to the event's canonical format.
  if (cfg.format === "double-elim" && event !== "first-stand") {
    cfg.format = defaultIntlConfig(config, event).format;
  }
  return cfg;
}

// Format overrides for an international: single-elim escalates from
// early-round series through the semifinals to the finals length;
// standalone double-elim does the same (the whole bracket IS the event
// — every W/L round at the early length, W-Final + L-Final at the
// semifinal length, the grand final at the finals length);
// stage+playoffs formats play the stage at the early length and the
// bracket at finals length, with the semifinals separately tunable.
function intlOverridesFor(
  cfg: SeasonIntlConfig,
  teamCount: number,
): FormatOverrides {
  const semis = cfg.semifinalSeries ?? cfg.finalsSeries;
  if (cfg.format === "single-elim") {
    return singleElimOverrides(
      teamCount,
      cfg.earlySeries,
      cfg.finalsSeries,
      semis,
    );
  }
  if (cfg.format === "double-elim") {
    return seriesOverrides(
      cfg.earlySeries,
      cfg.earlySeries,
      semis,
      cfg.finalsSeries,
    );
  }
  return seriesOverrides(cfg.earlySeries, cfg.finalsSeries, semis, cfg.finalsSeries);
}

// Format-specific createTournament params for an international event.
// Groups formats need an explicit group shape: Worlds keeps its
// canonical 4 groups regardless of the 20/21-team field; other events
// derive the group count from the team count. The configured
// playoffTeams decides how many advance: it's rounded to a per-group
// count (capped at the smallest group's size) so e.g. "Top 8" with 4
// groups means top 2 per group. Double-elim brackets may still trim
// the advancing pool to a power of 2 downstream.
function intlFormatParams(
  cfg: SeasonIntlConfig,
  event: InternationalId,
  teamCount: number,
): {
  swissPlayoffsAdvancingOverride?: number;
  swissThreshold?: boolean;
  rrPlayoffsAdvancingOverride?: number;
  groupsConfigOverride?: { groupCount: number; advancingPerGroup: number };
} {
  if (
    cfg.format === "swiss-playoffs" ||
    cfg.format === "swiss-playoffs-de" ||
    cfg.format === "swiss-playoffs-te"
  ) {
    return {
      swissPlayoffsAdvancingOverride: cfg.playoffTeams,
      swissThreshold: cfg.swissThreshold,
    };
  }
  if (
    cfg.format === "round-robin-playoffs" ||
    cfg.format === "round-robin-playoffs-te" ||
    cfg.format === "round-robin-playoffs-step"
  ) {
    return { rrPlayoffsAdvancingOverride: cfg.playoffTeams };
  }
  if (
    cfg.format === "groups-playoffs" ||
    cfg.format === "groups-playoffs-de" ||
    cfg.format === "groups-playoffs-te"
  ) {
    const groupCount =
      event === "worlds" ? 4 : inferGroupsConfig(teamCount).groupCount;
    const minGroupSize = Math.floor(teamCount / groupCount);
    const advancingPerGroup = Math.min(
      Math.max(1, Math.round(cfg.playoffTeams / groupCount)),
      Math.max(1, minGroupSize),
    );
    return { groupsConfigOverride: { groupCount, advancingPerGroup } };
  }
  if (cfg.format === "swiss") {
    return { swissThreshold: cfg.swissThreshold };
  }
  return {};
}

function cloneMeta(meta: SeasonMetaSnapshot): {
  metaOverride: MetaOverride | null;
  metaEnabled: boolean;
  synergyOverride?: import("../championMeta").Synergy[] | null;
  counterOverride?: import("../championMeta").CounterPair[] | null;
} {
  return {
    metaOverride: meta.metaOverride,
    metaEnabled: meta.metaEnabled,
    synergyOverride: meta.synergyOverride,
    counterOverride: meta.counterOverride,
  };
}

// ─── Placements ────────────────────────────────────────────────────────────
// Final ranking of a completed tournament, best first. Champion first;
// for bracket-deciding formats the loser of the champion's last match
// is runner-up; everyone else ranks by overall standings (match wins →
// game diff → head-to-head → seed).

export function tournamentPlacements(t: TournamentState): string[] {
  // Triple-elim has its own loss-based ranking (the generic standings
  // skip bracket-tagged matches, which is every triple-elim match).
  if (t.format === "triple-elim") {
    const ranked = computeTripleElimStandings(t).map((team) => team.id);
    const champion = tournamentChampion(t);
    if (champion) {
      return [champion.id, ...ranked.filter((id) => id !== champion.id)];
    }
    return ranked;
  }
  // Elimination-bracket formats: rank by WHERE each team was eliminated,
  // not by its regular-stage record. This covers pure single/double-elim
  // AND stage+playoffs formats whose playoff is an SE/DE bracket (e.g.
  // round-robin-playoffs, *-playoffs-de). The generic standings skip
  // every bracket match and fall back to seed/stage order, which
  // mis-ranks playoff finishers — e.g. a team knocked out in the playoff
  // quarterfinal would outrank a semifinalist purely on group form, and
  // the team that lost to the 3rd-place team could land below teams that
  // never even reached the bracket. Qualification reads this order
  // straight off, so it must reflect playoff placement.
  const isPureBracket =
    t.format === "single-elim" || t.format === "double-elim";
  const playoffKind = formatHasPlayoffs(t.format)
    ? playoffBracketKindFor(t.format)
    : null;
  const eliminationBracket =
    isPureBracket ||
    playoffKind === "single-elim" ||
    playoffKind === "double-elim";
  let order: string[];
  if (eliminationBracket) {
    // Teams that reached the playoff bracket, ranked by elimination depth.
    const participants = playoffParticipantIds(t);
    const bracketOrder = computeBracketFinishOrder(t)
      .map((team) => team.id)
      .filter((id) => participants.has(id));
    // Teams that never made the bracket fall in behind, by stage record.
    // (Empty for pure-bracket formats — there everyone is a participant.)
    const rest = computeStandings(t)
      .map((s) => s.team.id)
      .filter((id) => !participants.has(id));
    order = [...bracketOrder, ...rest];
  } else {
    order = computeStandings(t).map((s) => s.team.id);
  }
  const champion = tournamentChampion(t);
  if (!champion) return order;
  const head = [champion.id];
  const bracketDecided = eliminationBracket || formatHasPlayoffs(t.format);
  if (bracketDecided) {
    // The champion's LAST completed match is the deciding one (matches
    // are appended in play order; the grand final / final is last).
    const lastWin = [...t.matches]
      .reverse()
      .find(
        (m) =>
          m.winner != null &&
          (m.blueTeamId === champion.id || m.redTeamId === champion.id),
      );
    const runnerUp =
      lastWin == null
        ? null
        : lastWin.blueTeamId === champion.id
          ? lastWin.redTeamId
          : lastWin.blueTeamId;
    if (runnerUp && runnerUp !== champion.id) head.push(runnerUp);
  }
  return [...head, ...order.filter((id) => !head.includes(id))];
}

// ─── Championship points (Worlds qualification) ───────────────────────────
// Worlds rewards the whole YEAR, not just the summer split: each league
// sends its two summer finalists directly, and the remaining two slots
// go to the league's teams with the most championship points across the
// season — placements in all three splits plus international results
// (First Stand, MSI). Worlds itself is excluded (it's the event being
// qualified for).

// Points per final split placement, best first (9th/10th score 0).
const SPLIT_PLACEMENT_POINTS = [10, 8, 6, 5, 4, 3, 2, 1] as const;
// Points per international placement, best first; any deeper placement
// still earns 2 participation points (qualifying at all is a result).
const INTL_PLACEMENT_POINTS = [15, 12, 10, 8, 6, 5, 4, 3] as const;
const INTL_PARTICIPATION_POINTS = 2;

/** Season-long championship points per team id, from every recorded
 *  split placement and international result so far. */
export function championshipPoints(
  season: SeasonState,
): Record<string, number> {
  const pts: Record<string, number> = {};
  const add = (teamId: string, n: number) => {
    if (n > 0) pts[teamId] = (pts[teamId] ?? 0) + n;
  };
  for (const split of Object.keys(SPLIT_LABELS) as SplitId[]) {
    const byLeague = season.splitResults[split];
    if (!byLeague) continue;
    for (const league of LEAGUE_IDS) {
      (byLeague[league] ?? []).forEach((id, i) =>
        add(id, SPLIT_PLACEMENT_POINTS[i] ?? 0),
      );
    }
  }
  for (const event of ["first-stand", "msi"] as InternationalId[]) {
    (season.intlResults[event] ?? []).forEach((id, i) =>
      add(id, INTL_PLACEMENT_POINTS[i] ?? INTL_PARTICIPATION_POINTS),
    );
  }
  return pts;
}

const GLOBAL_CUP_FIELD_SIZE = 32;

/** Quadrennial Global Cup runs after Worlds on franchise years 4, 8, … */
export function isGlobalCupYear(franchiseYear: number | undefined): boolean {
  return franchiseYear != null && franchiseYear > 0 && franchiseYear % 4 === 0;
}

/** True when this season's calendar includes the post-Worlds Global Cup. */
export function seasonHasGlobalCup(season: SeasonState): boolean {
  return season.phases?.some((p) => p.event === "global-cup") ?? false;
}

/** Season-long ranking points for global-cup seeding — splits, First Stand,
 *  MSI, and the Worlds that just finished. */
export function seasonRankingPoints(
  season: SeasonState,
): Record<string, number> {
  const pts = { ...championshipPoints(season) };
  const add = (teamId: string, n: number) => {
    if (n > 0) pts[teamId] = (pts[teamId] ?? 0) + n;
  };
  (season.intlResults.worlds ?? []).forEach((id, i) =>
    add(id, INTL_PLACEMENT_POINTS[i] ?? INTL_PARTICIPATION_POINTS),
  );
  return pts;
}

/** Top 32 teams by season ranking (used for the quadrennial cup). */
export function globalCupQualifiers(season: SeasonState): SeasonTeam[] {
  const pts = seasonRankingPoints(season);
  const strength = season.leagueStrength ?? {};
  return [...season.teams]
    .sort((a, b) => {
      const pa = pts[a.id] ?? 0;
      const pb = pts[b.id] ?? 0;
      if (pb !== pa) return pb - pa;
      const la = leagueSeedScore(a.leagueId, strength);
      const lb = leagueSeedScore(b.leagueId, strength);
      if (lb !== la) return lb - la;
      return deriveStar(b.players) - deriveStar(a.players);
    })
    .slice(0, GLOBAL_CUP_FIELD_SIZE);
}

function createGlobalCup(season: SeasonState): TournamentState {
  const qualified = globalCupQualifiers(season);
  const cfg = intlConfigFor(season.config, "global-cup");
  const t = createTournament({
    name: GLOBAL_CUP_NAME,
    format: "single-elim",
    teams: qualified.map((team, i) => toTournamentTeam(team, i + 1)),
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: singleElimOverrides(
      qualified.length,
      cfg.earlySeries,
      cfg.finalsSeries,
      cfg.semifinalSeries ?? cfg.finalsSeries,
    ),
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(season, qualified),
  });
  return tagSeason(t, season);
}

function buildSeasonPhases(
  transferOn: boolean,
  franchiseYear?: number,
): SeasonPhase[] {
  const transferPhase = (event: InternationalId): SeasonPhase => ({
    kind: "transfer",
    event,
    label: "Transfer Window",
    tournamentIds: [],
    status: "pending",
  });
  const phases: SeasonPhase[] = [
    {
      kind: "split",
      split: "winter",
      label: SPLIT_LABELS.winter,
      tournamentIds: [],
      status: "pending",
    },
    {
      kind: "international",
      event: "first-stand",
      label: INTERNATIONAL_LABELS["first-stand"],
      tournamentIds: [],
      status: "pending",
    },
    ...(transferOn ? [transferPhase("first-stand")] : []),
    {
      kind: "split",
      split: "spring",
      label: SPLIT_LABELS.spring,
      tournamentIds: [],
      status: "pending",
    },
    {
      kind: "international",
      event: "msi",
      label: INTERNATIONAL_LABELS.msi,
      tournamentIds: [],
      status: "pending",
    },
    ...(transferOn ? [transferPhase("msi")] : []),
    {
      kind: "split",
      split: "summer",
      label: SPLIT_LABELS.summer,
      tournamentIds: [],
      status: "pending",
    },
    {
      kind: "international",
      event: "worlds",
      label: INTERNATIONAL_LABELS.worlds,
      tournamentIds: [],
      status: "pending",
    },
  ];
  if (isGlobalCupYear(franchiseYear)) {
    phases.push({
      kind: "international",
      event: "global-cup",
      label: INTERNATIONAL_LABELS["global-cup"],
      tournamentIds: [],
      status: "pending",
    });
  }
  return phases;
}

// ─── Qualification + seeding ───────────────────────────────────────────────

export interface Qualifier {
  team: SeasonTeam;
  league: LeagueId;
  /** 1..N qualification seed inside its own league. 0 for the defending
   *  international champion's additive slot (via === "champion"). */
  leagueSeed: number;
  /** How the slot was earned. "split" = qualifying-split placement
   *  (First Stand / MSI, and the two summer finalists for Worlds);
   *  "points" = season-long championship points (Worlds seeds 3-4);
   *  "champion" = won the previous international (First Stand winner →
   *  MSI, MSI winner → Worlds) without otherwise qualifying. */
  via: "split" | "points" | "champion";
  /** Championship points total at qualification time (Worlds only). */
  points?: number;
}

/** Teams qualified for an international, ordered by global seed:
 *  all league #1 seeds first (in league-power order), then #2s, etc.
 *  This is what makes seeding matter — the bracket pairs global seed 1
 *  against the weakest seed.
 *
 *  First Stand / MSI: straight top-N of the qualifying split.
 *  Worlds: seeds 1-2 are the summer split FINALISTS; seeds 3-4 are the
 *  league's best remaining teams by championship points (ties broken by
 *  summer placement). Seed 4 goes to the play-in as before.
 *
 *  Defending champions: the First Stand winner auto-qualifies for MSI
 *  and the MSI winner for Worlds. The slot is ADDITIVE — every region
 *  keeps its regular spots. When the champion already qualified through
 *  its league nothing changes; otherwise it's prepended as the top
 *  global seed (leagueSeed 0, via "champion"), entering Worlds directly
 *  (never through the play-in). */

// Prestige gap between adjacent leagues in the fixed LCK>LPL>LEC>… ranking.
// A region's tide must exceed this to climb one spot, so the canonical
// order is the default and only sustained over/under-performance reshuffles
// it. (Tides realistically sit in roughly [-1, 1].)
const REGION_PRESTIGE_STEP = 0.6;

// Inter-league seeding score: fixed prestige (LCK highest) plus the live
// region tide. Used only when region tides are on.
function leagueSeedScore(
  league: LeagueId,
  strength: Partial<Record<LeagueId, number>>,
): number {
  const prestige =
    (LEAGUE_IDS.length - 1 - LEAGUE_IDS.indexOf(league)) * REGION_PRESTIGE_STEP;
  return prestige + (strength[league] ?? 0);
}

export function qualifiedForInternational(
  season: SeasonState,
  event: InternationalId,
): Qualifier[] {
  // Global Cup seeds the top 32 teams by season-long ranking points — not
  // per-league split placements.
  if (event === "global-cup") {
    const pts = seasonRankingPoints(season);
    return globalCupQualifiers(season).map((team, i) => ({
      team,
      league: team.leagueId,
      leagueSeed: i + 1,
      via: "points" as const,
      points: pts[team.id] ?? 0,
    }));
  }
  const split = QUALIFYING_SPLIT[event];
  const count = QUALIFIER_COUNTS[event];
  // Per-league ordered qualifier lists (index 0 = league seed 1).
  const perLeague = new Map<LeagueId, Qualifier[]>();
  const pts = event === "worlds" ? championshipPoints(season) : null;
  for (const league of LEAGUE_IDS) {
    const placements = season.splitResults[split]?.[league] ?? [];
    if (placements.length === 0) continue;
    const list: Qualifier[] = [];
    const push = (teamId: string, via: Qualifier["via"]) => {
      const team = season.teams.find((t) => t.id === teamId);
      if (!team) return;
      list.push({
        team,
        league,
        leagueSeed: list.length + 1,
        via,
        ...(pts ? { points: pts[teamId] ?? 0 } : {}),
      });
    };
    if (event === "worlds") {
      // Summer finalists take the direct seeds…
      const finalists = placements.slice(0, 2);
      for (const id of finalists) push(id, "split");
      // …then the league's best of the rest by season-long points.
      const byPoints = placements
        .slice(2)
        .sort(
          (a, b) =>
            (pts![b] ?? 0) - (pts![a] ?? 0) ||
            placements.indexOf(a) - placements.indexOf(b),
        )
        .slice(0, count - finalists.length);
      for (const id of byPoints) push(id, "points");
    } else {
      for (const id of placements.slice(0, count)) push(id, "split");
    }
    perLeague.set(league, list);
  }
  // Defending champion (First Stand winner → MSI, MSI winner → Worlds).
  const feeder = feederEventOf(event);
  const champId = feeder ? season.intlResults[feeder]?.[0] ?? null : null;
  // The champion never enters Worlds through the play-in: if it landed
  // on its league's #4 (play-in) seed via points, promote it to #3 —
  // the displaced team drops to #4. Region spot counts are unchanged.
  if (event === "worlds" && champId) {
    for (const list of perLeague.values()) {
      const idx = list.findIndex((q) => q.team.id === champId);
      if (idx === count - 1) {
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        list[idx - 1].leagueSeed = idx;
        list[idx].leagueSeed = idx + 1;
      }
    }
  }
  // Global seed order: every league's #1, then the #2s, etc. The
  // inter-league order ALWAYS starts from the fixed LCK>LPL>LEC>…
  // prestige ranking. [F] With region tides on, the live league-strength
  // score is ADDED to that prestige baseline rather than replacing it —
  // so the canonical order holds by default, and a region only climbs past
  // another when its tide advantage outweighs the prestige gap between
  // them (REGION_PRESTIGE_STEP).
  const strength = season.leagueStrength;
  const leagueOrder =
    season.config?.regionTides && strength
      ? [...LEAGUE_IDS].sort(
          (a, b) => leagueSeedScore(b, strength) - leagueSeedScore(a, strength),
        )
      : LEAGUE_IDS;
  const out: Qualifier[] = [];
  for (let seed = 1; seed <= count; seed++) {
    for (const league of leagueOrder) {
      const q = perLeague.get(league)?.[seed - 1];
      if (q) out.push(q);
    }
  }
  // Champion's additive slot when it didn't qualify through its league:
  // prepended as the top global seed, regions keep their regular spots.
  if (champId && !out.some((q) => q.team.id === champId)) {
    const team = season.teams.find((t) => t.id === champId);
    if (team) {
      out.unshift({
        team,
        league: team.leagueId,
        leagueSeed: 0,
        via: "champion",
        ...(pts ? { points: pts[champId] ?? 0 } : {}),
      });
    }
  }
  return out;
}

/** Short human label for HOW a team qualified — used by the dashboards
 *  next to team names. First Stand / MSI: the split seed ("#2");
 *  Worlds: "Finalist" or "Points (28)", with a "Play-In" suffix on the
 *  league's #4 seed; champion slots name the title that earned them
 *  ("MSI Champion"). Space-constrained rows should render through the
 *  compact QualifierTagView / IntlChampionBadge components instead of
 *  inlining this full text. */
export function qualifierTag(event: InternationalId, q: Qualifier): string {
  if (event === "global-cup") {
    return `#${q.leagueSeed}${q.points != null ? ` · ${q.points} pts` : ""}`;
  }
  if (q.via === "champion") {
    const feeder = feederEventOf(event);
    return feeder ? `${INTERNATIONAL_LABELS[feeder]} Champion` : "Champion";
  }
  if (event === "worlds") {
    const base = q.via === "points" ? `Points (${q.points ?? 0})` : "Finalist";
    return q.leagueSeed === QUALIFIER_COUNTS.worlds
      ? `${base} · Play-In`
      : base;
  }
  return `#${q.leagueSeed}`;
}

/** The international whose champion auto-qualifies for `event`
 *  (First Stand winner → MSI, MSI winner → Worlds). Null for First
 *  Stand — nothing feeds it. */
export function feederEventOf(
  event: InternationalId,
): InternationalId | null {
  return event === "msi" ? "first-stand" : event === "worlds" ? "msi" : null;
}

/** The team id that completed a Golden Road — winning all three of its
 *  domestic splits (Winter/Spring/Summer) AND every international on the
 *  calendar (First Stand/MSI/Worlds, plus Global Cup on quadrennial years)
 *  — this season, or null. Computed live from the season's results (no
 *  history entry required). */
export function seasonGoldenRoadTeamId(season: SeasonState): string | null {
  const worlds = season.intlResults.worlds?.[0] ?? season.champion ?? null;
  if (!worlds) return null;
  const team = season.teams.find((t) => t.id === worlds);
  if (!team) return null;
  const won = (id: string | undefined) => id === worlds;
  if (!won(season.intlResults["first-stand"]?.[0])) return null;
  if (!won(season.intlResults.msi?.[0])) return null;
  for (const split of ["winter", "spring", "summer"] as SplitId[]) {
    if (!won(season.splitResults[split]?.[team.leagueId]?.[0])) return null;
  }
  if (seasonHasGlobalCup(season) && !won(season.intlResults["global-cup"]?.[0])) {
    return null;
  }
  return worlds;
}

// ─── Tournament builders ───────────────────────────────────────────────────

// Stamp the season id onto a freshly-created tournament and, when the
// realism features are on, attach each team's current form / clutch trait
// so they flow into the match sim (tournamentSeriesContext → starRatingBias).
// With both features off this returns the classic `{ ...t, seasonId }`
// shape unchanged, so default seasons serialize identically.
function tagSeason(t: TournamentState, season: SeasonState): TournamentState {
  const { config } = season;
  const enrich = formEnabled(config) || config.clutchFactor === true;
  const teams = enrich
    ? t.teams.map((tt) => {
        const extra: { form?: number; clutch?: number } = {};
        if (formEnabled(config)) {
          const f = season.teamForm?.[tt.id];
          if (typeof f === "number" && f !== 0) {
            // The coach's motivation amplifies/dampens how much the team rides
            // its current momentum into the match.
            const coach = season.teams.find((s) => s.id === tt.id)?.coach;
            extra.form = f * coachMotivationFactor(coach);
          }
        }
        if (config.clutchFactor) {
          const c = season.teamClutch?.[tt.id];
          // Set even when 0 so its presence marks "clutch feature on"
          // (starRatingBias keys within-series momentum off that).
          if (typeof c === "number") extra.clutch = c;
        }
        return Object.keys(extra).length > 0 ? { ...tt, ...extra } : tt;
      })
    : t.teams;
  return { ...t, teams, seasonId: season.id };
}

function createSplitTournament(
  season: SeasonState,
  league: LeagueId,
  split: SplitId,
): TournamentState {
  const cfg = season.config.sharedLeagueConfig
    ? season.config.leagueConfigs.LCK
    : season.config.leagueConfigs[league];
  // Seeding: previous split's placements when available (spring seeds
  // from winter, summer from spring), otherwise roster strength.
  const prevSplit: SplitId | null =
    split === "spring" ? "winter" : split === "summer" ? "spring" : null;
  const prevPlacements = prevSplit
    ? season.splitResults[prevSplit]?.[league] ?? null
    : null;
  const teams = leagueTeams(season, league);
  const ordered = prevPlacements
    ? [...teams].sort(
        (a, b) => prevPlacements.indexOf(a.id) - prevPlacements.indexOf(b.id),
      )
    : [...teams].sort((a, b) => deriveStar(b.players) - deriveStar(a.players));
  const t = createTournament({
    name: `${league} ${SPLIT_LABELS[split]}`,
    format: cfg.format,
    teams: ordered.map((team, i) => toTournamentTeam(team, i + 1)),
    defaults: defaultsFor(season.config, cfg.regularSeries),
    formatOverrides: seriesOverrides(
      cfg.regularSeries,
      cfg.playoffSeries,
      cfg.semifinalSeries ?? cfg.playoffSeries,
      cfg.finalsSeries ?? cfg.playoffSeries,
    ),
    rrPlayoffsAdvancingOverride: cfg.playoffTeams,
    swissPlayoffsAdvancingOverride: cfg.playoffTeams,
    swissThreshold: cfg.swissThreshold,
    roundRobinLegs: cfg.roundRobinLegs,
    trueGrandFinal: cfg.trueGrandFinal,
    groupsConfigOverride:
      cfg.format === "groups-playoffs" ||
      cfg.format === "groups-playoffs-de" ||
      cfg.format === "groups-playoffs-te"
        ? {
            groupCount: 2,
            advancingPerGroup: Math.max(2, Math.round(cfg.playoffTeams / 2)),
          }
        : undefined,
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(season, ordered),
  });
  return tagSeason(t, season);
}

function createFirstStand(season: SeasonState): TournamentState {
  const qualified = qualifiedForInternational(season, "first-stand");
  const cfg = intlConfigFor(season.config, "first-stand");
  const t = createTournament({
    name: "First Stand",
    format: cfg.format,
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, qualified.length),
    ...intlFormatParams(cfg, "first-stand", qualified.length),
    trueGrandFinal: cfg.trueGrandFinal,
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season);
}

/** Whether First Stand runs the seeds-bye structure — each region's #1
 *  seed skips an opening qualifier and enters the main single-elim bracket
 *  directly, while the #2 seeds play a play-in for the remaining slots.
 *  Only the canonical single-elim format does this (other configured
 *  formats run every qualified team through their stage); also requires at
 *  least two #1 seeds and two #2 seeds so both halves are well-formed. */
function firstStandUsesSeedByes(season: SeasonState): boolean {
  const cfg = intlConfigFor(season.config, "first-stand");
  if (cfg.format !== "single-elim") return false;
  // The play-in IS the seeds-bye structure; turning it off reverts First
  // Stand to a plain 12-team single-elim (only the top seeds bye, by
  // bracket size).
  if (cfg.playInEnabled === false) return false;
  const qualified = qualifiedForInternational(season, "first-stand");
  const byes = qualified.filter((q) => q.leagueSeed <= 1).length;
  const field = qualified.length - byes;
  return byes >= 2 && field >= 2;
}

// Largest power of two ≤ n (n ≥ 1) — sizes the First Stand main bracket to
// a clean single-elim while fitting the bye teams plus the play-in
// qualifiers.
function largestPowerOfTwoAtMost(n: number): number {
  return Math.max(1, 2 ** Math.floor(Math.log2(Math.max(1, n))));
}

function createFirstStandPlayIn(season: SeasonState): TournamentState {
  // The region #2 seeds fight for the remaining main-bracket spots; the
  // top finalists advance (createFirstStandMain decides how many). The #1
  // seeds sit this round out and bye straight into the main event.
  const qualified = qualifiedForInternational(season, "first-stand").filter(
    (q) => q.leagueSeed >= 2,
  );
  const cfg = intlConfigFor(season.config, "first-stand");
  const series = cfg.playInSeries ?? cfg.earlySeries;
  // Double-elim needs ≥ 4 teams with limited byes; fall back to single-
  // elim for short fields so a sparse season can't break the play-in.
  const useDE = cfg.playInFormat === "double-elim" && qualified.length >= 4;
  const t = createTournament({
    name: "First Stand Play-In",
    format: useDE ? "double-elim" : "single-elim",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, series),
    formatOverrides: useDE
      ? // Uniform play-in series across every W/L/GF round.
        seriesOverrides(series, series, series, series)
      : singleElimOverrides(qualified.length, series, cfg.finalsSeries),
    // Play-ins qualify N teams — one decisive grand final, never a reset.
    ...(useDE ? { trueGrandFinal: true } : {}),
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season);
}

function createFirstStandMain(
  season: SeasonState,
  playIn: TournamentState,
): TournamentState {
  const cfg = intlConfigFor(season.config, "first-stand");
  // Region #1 seeds bye straight into the main bracket; the play-in
  // finalists fill it up to the largest power-of-two it can hold (e.g. six
  // #1 seeds + two qualifiers → an 8-team single-elim).
  const byes = qualifiedForInternational(season, "first-stand").filter(
    (q) => q.leagueSeed <= 1,
  );
  const playInTeams = playIn.teams.length;
  const target = largestPowerOfTwoAtMost(byes.length + playInTeams);
  const advancing = Math.max(1, Math.min(playInTeams, target - byes.length));
  const finalists = tournamentPlacements(playIn)
    .slice(0, advancing)
    .map((id) => season.teams.find((t) => t.id === id))
    .filter((t): t is SeasonTeam => t != null);
  const teams = [
    ...byes.map((q, i) => toTournamentTeam(q.team, i + 1)),
    ...finalists.map((team, i) =>
      toTournamentTeam(team, byes.length + i + 1),
    ),
  ];
  const t = createTournament({
    name: "First Stand",
    format: cfg.format,
    teams,
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, teams.length),
    trueGrandFinal: cfg.trueGrandFinal,
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    // Play-in finalists carry their play-in run (already complete and
    // recorded by the time the main event is created).
    streakSeeds: streakSeedsFor(season, [
      ...byes.map((q) => q.team),
      ...finalists,
    ]),
  });
  return tagSeason(t, season);
}

// Formats where an ill-sized field is structurally unfair: a swiss
// stage hands odd fields a synthetic bye every round (a free win
// without playing), and a group stage wants every group the same size.
// Round-robin sit-outs and seeding-earned single-elim byes are fair,
// so those formats never trim the field.
function isSwissFormat(format: TournamentFormat): boolean {
  return format.startsWith("swiss");
}

function intlFieldMisfit(
  format: TournamentFormat,
  teamCount: number,
  groupCount?: number,
): boolean {
  if (isSwissFormat(format)) return teamCount % 2 === 1;
  if (
    format === "groups-playoffs" ||
    format === "groups-playoffs-de" ||
    format === "groups-playoffs-te"
  ) {
    const gc = groupCount ?? inferGroupsConfig(teamCount).groupCount;
    return teamCount % gc !== 0;
  }
  return false;
}

// The MSI playoff bracket is a fixed 12-team double-elimination bracket
// (a supported DE size): the region #1 seeds bye in, the swiss stage
// fills the rest. See createMSI.
const MSI_BRACKET_SIZE = 12;

/** Whether MSI runs the canonical seeds-bye structure — region #1 seeds
 *  (and the additive First Stand champion) skip the swiss stage and enter
 *  the playoff bracket directly. Only the default/canonical swiss-into-DE
 *  format does this; any other configured MSI format runs every team
 *  through its stage. */
function msiUsesSeedByes(cfg: SeasonIntlConfig): boolean {
  return cfg.format === "swiss-playoffs-de";
}

/** True when the MSI field doesn't fit its configured format — the
 *  First Stand champion's additive 19th slot meeting a swiss stage
 *  (odd field → bye rounds) or a group stage (unequal groups). A
 *  play-in must trim the field first. The canonical seeds-bye format
 *  never needs one: only the twelve #2/#3 seeds play the swiss stage, an
 *  always-even field, and the bracket is a fixed 12 regardless of the
 *  additive champion. */
export function msiNeedsPlayIn(season: SeasonState): boolean {
  const cfg = intlConfigFor(season.config, "msi");
  if (cfg.playInEnabled === false) return false; // user disabled it
  if (msiUsesSeedByes(cfg)) return false;
  return intlFieldMisfit(
    cfg.format,
    qualifiedForInternational(season, "msi").length,
  );
}

/** Whether Worlds runs a play-in (default true; the user can disable it,
 *  sending every qualified team — incl. the #4 seeds — straight to the
 *  main event). */
export function worldsPlayInEnabled(season: SeasonState): boolean {
  return intlConfigFor(season.config, "worlds").playInEnabled !== false;
}

function createMSIPlayIn(season: SeasonState): TournamentState {
  // The two lowest global seeds (the weakest regions' #3s — never the
  // defending champion, who holds the TOP seed) play one qualifying
  // series; the loser is eliminated and the field fits the format
  // again (18 → an even swiss, or six equal groups of 3).
  const qualified = qualifiedForInternational(season, "msi");
  const pair = qualified.slice(-2);
  const cfg = intlConfigFor(season.config, "msi");
  const series = cfg.playInSeries ?? cfg.earlySeries;
  const t = createTournament({
    name: "MSI Play-In",
    format: "single-elim",
    teams: pair.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, series),
    formatOverrides: singleElimOverrides(
      pair.length,
      series,
      cfg.finalsSeries,
    ),
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      pair.map((q) => q.team),
    ),
  });
  return tagSeason(t, season);
}

function createMSI(
  season: SeasonState,
  playIn?: TournamentState,
): TournamentState {
  let qualified = qualifiedForInternational(season, "msi");
  // 18 teams (19 when the First Stand champion qualifies additively).
  const cfg = intlConfigFor(season.config, "msi");

  // Canonical shape: the region #1 seeds (leagueSeed 1) — and the additive
  // First Stand champion, who holds the top seed (leagueSeed 0) — skip the
  // swiss stage and are pre-seeded into a 12-team double-elim bracket. The
  // #2 and #3 seeds (always exactly 12) play the swiss stage for the
  // remaining bracket spots: top 6 normally, top 5 when the champion's
  // additive slot makes 7 byes. The swiss field is always even and the
  // bracket always a clean 12, so this path never needs a play-in.
  if (msiUsesSeedByes(cfg)) {
    const byes = qualified.filter((q) => q.leagueSeed <= 1);
    const advancing = Math.max(2, MSI_BRACKET_SIZE - byes.length);
    const t = createTournament({
      name: "Mid-Season Invitational",
      format: cfg.format,
      teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
      defaults: defaultsFor(season.config, cfg.earlySeries),
      formatOverrides: intlOverridesFor(cfg, qualified.length),
      swissByeTeamIds: byes.map((q) => q.team.id),
      swissPlayoffsAdvancingOverride: advancing,
      swissThreshold: cfg.swissThreshold,
      trueGrandFinal: cfg.trueGrandFinal,
      metaSnapshot: cloneMeta(season.currentMeta),
      variancePreset: season.config.variancePreset,
      liveMeta: season.config.liveMeta,
      fearlessConfig: { perSeries: season.config.fearless },
      streakSeeds: streakSeedsFor(
        season,
        qualified.map((q) => q.team),
      ),
    });
    return tagSeason(t, season);
  }

  // Any other configured format runs every qualified team through its
  // stage. When the 19-team field misfits the format (swiss byes /
  // unequal groups) an MSI Play-In ran first (startPhase decides); its
  // loser is excluded here so the stage runs fair.
  if (playIn) {
    const eliminated = tournamentPlacements(playIn)[1] ?? null;
    qualified = qualified.filter((q) => q.team.id !== eliminated);
  }
  const t = createTournament({
    name: "Mid-Season Invitational",
    format: cfg.format,
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, qualified.length),
    ...intlFormatParams(cfg, "msi", qualified.length),
    trueGrandFinal: cfg.trueGrandFinal,
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season);
}

function createWorldsPlayIn(season: SeasonState): TournamentState {
  // The six 4th seeds fight for the last two main-event spots; both
  // finalists advance. Single-elim by default; the user can opt into a
  // double-elim play-in (the 6-team field fits the DE generator) and pick
  // the play-in series length — independent of the main-event format.
  const qualified = qualifiedForInternational(season, "worlds").filter(
    (q) => q.leagueSeed === 4,
  );
  const cfg = intlConfigFor(season.config, "worlds");
  const series = cfg.playInSeries ?? cfg.earlySeries;
  // Double-elim needs ≥ 4 teams with limited byes; fall back to single-
  // elim for short fields so a sparse season can't break the play-in.
  const useDE = cfg.playInFormat === "double-elim" && qualified.length >= 4;
  const t = createTournament({
    name: "Worlds Play-In",
    format: useDE ? "double-elim" : "single-elim",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, series),
    formatOverrides: useDE
      ? // Uniform play-in series across every W/L/GF round.
        seriesOverrides(series, series, series, series)
      : singleElimOverrides(qualified.length, series, cfg.finalsSeries),
    // Play-ins qualify N teams — one decisive grand final, never a reset.
    ...(useDE ? { trueGrandFinal: true } : {}),
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season);
}

function createWorldsMain(
  season: SeasonState,
  playIn: TournamentState | null,
): TournamentState {
  const cfg = intlConfigFor(season.config, "worlds");
  let teams: TournamentTeam[];
  let streakTeams: SeasonTeam[];
  if (!playIn) {
    // Play-in disabled: every qualified team — including the #4 seeds —
    // enters the main event directly and plays the group stage.
    const all = qualifiedForInternational(season, "worlds");
    teams = all.map((q, i) => toTournamentTeam(q.team, i + 1));
    streakTeams = all.map((q) => q.team);
  } else {
    // Seeds 1–3 of every league enter directly (18 teams — 19 when the
    // MSI champion qualifies additively at leagueSeed 0); the play-in
    // finalists take the last seeds. EVERY team plays the group stage —
    // no one byes into the bracket. Canonical shape: 4 equal groups
    // (18 direct + 2 play-in = 20 = 4×5), top 2 per group into the
    // knockout bracket.
    const direct = qualifiedForInternational(season, "worlds").filter(
      (q) => q.leagueSeed <= 3,
    );
    // How many play-in finalists advance. When the user EXPLICITLY sets a
    // count we honor it exactly (the group stage simply takes slightly
    // uneven groups — the user asked for that many teams). Only the
    // DEFAULT (2) auto-reduces to keep the four groups equal when the MSI
    // champion's additive slot would otherwise break divisibility.
    const playInTeams = playIn.teams.length;
    const explicit = cfg.playInAdvancing != null;
    let advancing = Math.max(
      1,
      Math.min(cfg.playInAdvancing ?? 2, playInTeams),
    );
    if (!explicit) {
      while (
        advancing > 1 &&
        intlFieldMisfit(cfg.format, direct.length + advancing, 4)
      ) {
        advancing -= 1;
      }
    }
    const playInPlacements = tournamentPlacements(playIn);
    const finalists = playInPlacements
      .slice(0, advancing)
      .map((id) => season.teams.find((t) => t.id === id))
      .filter((t): t is SeasonTeam => t != null);
    teams = [
      ...direct.map((q, i) => toTournamentTeam(q.team, i + 1)),
      ...finalists.map((team, i) =>
        toTournamentTeam(team, direct.length + i + 1),
      ),
    ];
    streakTeams = [...direct.map((q) => q.team), ...finalists];
  }
  const t = createTournament({
    name: "World Championship",
    format: cfg.format,
    teams,
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, teams.length),
    ...intlFormatParams(cfg, "worlds", teams.length),
    trueGrandFinal: cfg.trueGrandFinal,
    metaSnapshot: cloneMeta(season.currentMeta),
    variancePreset: season.config.variancePreset,
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    // Play-in finalists carry their play-in run (the play-in is already
    // complete and recorded by the time the main event is created).
    streakSeeds: streakSeedsFor(season, streakTeams),
  });
  return tagSeason(t, season);
}

// ─── Patch shift ───────────────────────────────────────────────────────────
// A "balance patch" between phases: materialize the full tier table
// (current override over baseline), then nudge a `fraction` of (champion,
// lane) entries one tier up or down. Returns a complete MetaOverride so the
// shifted meta is authoritative from then on. The engine calls it with a
// gentle fraction between phases (PATCH_SHIFT_FRACTION) — like real LoL
// patches, the competitive meta moves a little each split, not wholesale.
const PATCH_SHIFT_FRACTION = 0.08;

export function applyPatchShift(
  meta: SeasonMetaSnapshot,
  champions: readonly Champion[],
  rng: RNG = Math.random,
  fraction = 0.12,
): SeasonMetaSnapshot {
  const full: MetaOverride = {};
  for (const c of champions) {
    const overrideTiers = meta.metaOverride?.[c.alias];
    const baseTiers = CHAMPION_META[c.alias]?.metaTiers;
    const source = overrideTiers !== undefined ? overrideTiers : baseTiers;
    if (!source) continue;
    const lanes = Object.keys(source) as Lane[];
    if (lanes.length === 0) continue;
    const copy: Partial<Record<Lane, MetaTier>> = {};
    for (const lane of lanes) {
      const tier = source[lane];
      if (tier) copy[lane] = tier;
    }
    full[c.alias] = copy;
  }
  for (const alias of Object.keys(full)) {
    const tiers = full[alias];
    for (const lane of Object.keys(tiers) as Lane[]) {
      if (rng() >= fraction) continue;
      const cur = tiers[lane];
      if (!cur) continue;
      const idx = TIER_ORDER.indexOf(cur);
      const dir = rng() < 0.5 ? -1 : 1;
      const nextIdx = Math.min(TIER_ORDER.length - 1, Math.max(0, idx + dir));
      tiers[lane] = TIER_ORDER[nextIdx];
    }
  }
  return { ...meta, metaOverride: full };
}

// ─── Season realism (form / development / adaptability / region tides) ──────
// All opt-in via SeasonConfig flags; with every flag off these helpers are
// no-ops and the season state carries none of the extra maps, so default
// seasons behave and serialize exactly as before.

// How strongly each lever moves. Kept gentle on purpose — the realism is
// flavor on top of roster strength, never a replacement for it.
const FORM_DECAY = 0.6; //        form regresses toward 0 each tournament played
const FORM_LEARN = 0.5; //        weight of the latest finish-vs-seed result
const FORM_MAX = 1.0; //          clamp (±1 ≈ ±0.3 of a star in the sim)
const ADAPT_FORM_SWING = 0.25; // patch-shift form delta per adaptability unit
const DEV_RATE = 0.16; //         per-player chance to drift a tier each split
const DEV_REGRESS = 0.18; //      pull toward the mean (S/A fall, C/D rise)
const DEV_FORM = 0.22; //         recent team form biases the drift direction
const LEAGUE_STRENGTH_DECAY = 0.5; // region strength fades toward neutral

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clampForm = (n: number) =>
  round3(Math.max(-FORM_MAX, Math.min(FORM_MAX, n)));

// The form channel carries both hot/cold drift (A) AND meta-adaptability
// swings (D), so it's live when either feature is on.
function formEnabled(config: SeasonConfig): boolean {
  return config.formDrift === true || config.metaAdaptability === true;
}

// Deterministic per-team trait in [-1, 1] from a string seed (FNV-1a). No
// RNG so traits are stable across reloads without persisting a seed.
function traitHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffffffff;
  return Math.round((u * 2 - 1) * 100) / 100;
}

// Seed the realism maps at season creation, only for the enabled features.
function initRealismState(
  config: SeasonConfig,
  teams: SeasonTeam[],
  priorLeagueStrength?: Partial<Record<LeagueId, number>>,
): Partial<SeasonState> {
  const out: Partial<SeasonState> = {};
  if (formEnabled(config)) out.teamForm = {};
  if (config.clutchFactor) {
    const m: Record<string, number> = {};
    for (const t of teams) m[t.id] = traitHash(`${t.id}:clutch`);
    out.teamClutch = m;
  }
  if (config.metaAdaptability) {
    const m: Record<string, number> = {};
    // The coach drives how well a team rides balance patches; fall back to a
    // stable per-team hash when a team has no coach.
    for (const t of teams) {
      m[t.id] = t.coach
        ? coachAdaptabilityTrait(t.coach)
        : traitHash(`${t.id}:adapt`);
    }
    out.teamAdaptability = m;
  }
  if (config.regionTides) {
    const m: Partial<Record<LeagueId, number>> = {};
    for (const lg of LEAGUE_IDS) m[lg] = priorLeagueStrength?.[lg] ?? 0;
    out.leagueStrength = m;
  }
  return out;
}

// [A] After a tournament completes, decay every participant's form toward
// 0 and (when formDrift is on) nudge it by how the team finished relative
// to its seed: outperforming the seed warms the team up, underperforming
// cools it down. Decay alone (D-only seasons) keeps adaptability swings
// from accumulating forever.
function updateFormFromTournament(
  season: SeasonState,
  t: TournamentState,
): SeasonState {
  if (!formEnabled(season.config)) return season;
  const placements = tournamentPlacements(t);
  const n = placements.length;
  if (n < 1) return season;
  const form: Record<string, number> = { ...(season.teamForm ?? {}) };
  placements.forEach((id, idx) => {
    let next = FORM_DECAY * (form[id] ?? 0);
    if (season.config.formDrift) {
      const team = t.teams.find((x) => x.id === id);
      const seed = team?.seed ?? (n + 1) / 2;
      // >0 finished above seed, <0 below; normalized to roughly [-1, 1].
      const perf = (seed - (idx + 1)) / Math.max(1, n - 1);
      next += FORM_LEARN * perf;
    }
    form[id] = clampForm(next);
  });
  return { ...season, teamForm: form };
}

// [A2] Teammate chemistry drifts on results — but only in a realities/franchise
// timeline (season.franchise set), where rosters persist across years so the
// drift has time to matter. Winning the event gels a roster (every current pair
// nudges up), finishing last frays it. Pairs are stored on the players; this
// writes the updated rosters back into season.teams (the franchise source of
// truth that next year's tournaments are built from). Time-based familiarity is
// handled separately at the offseason (franchise.startNextSeason).
function updateChemistryFromTournament(
  season: SeasonState,
  t: TournamentState,
): SeasonState {
  if (!season.franchise) return season;
  // Skip the Play-In so a team that also plays the main event doesn't get its
  // familiarity gel + result drift applied twice in one phase (mirrors the
  // coach + league-strength Play-In gates). The main event's result is the one
  // that should move chemistry.
  if (t.name.includes("Play-In")) return season;
  const placements = tournamentPlacements(t);
  const n = placements.length;
  if (n < 2) return season;
  // Normalized finish in [-1, +1]: +1 won the event, -1 finished last.
  const finishById = new Map<string, number>();
  placements.forEach((id, idx) => {
    finishById.set(id, ((n - 1 - idx) / (n - 1)) * 2 - 1);
  });
  const teams = season.teams.map((team) => {
    const finish = finishById.get(team.id);
    if (finish == null) return team; // didn't play this tournament
    // Roll innate chemistry for any pair that doesn't have it yet (new
    // transfers/rookies) into the PERSISTENT roster BEFORE drifting — otherwise
    // drift would skip them and they'd never get an innate roll persisted here.
    const rolled = assignSynergies(team.players, team.name);
    // Familiarity: a tournament played together gels the roster toward the
    // time-together ceiling, REGARDLESS of placement — even a mid-table or
    // last-place team grows from sharing reps through a split.
    let players = driftSynergiesOverTime(rolled);
    // Results stack on top: a strong finish lifts further, a weak one frays
    // below the familiarity gain (mid-table finish === 0 leaves it untouched).
    if (finish !== 0) players = driftSynergiesFromResult(players, finish);
    return { ...team, players };
  });
  return { ...season, teams };
}

// [A3] Coach reputations evolve on results: over- or under-performing the
// team's seed moves the coach's rating, with regression toward the mean so
// ratings never all pile at the ceiling (there are always rising and falling
// coaches). Gated like the other results-driven realism (formEnabled). Writes
// the updated coaches back into season.teams (the source of truth).
function evolveCoachesFromTournament(
  season: SeasonState,
  t: TournamentState,
): SeasonState {
  if (!formEnabled(season.config)) return season;
  // Skip the Play-In so a team that also plays the international main event
  // doesn't get its coach evolved twice in one phase (mirrors the Play-In gate
  // on league-strength tides). Coach rating has no decay, so double-counting
  // would compound.
  if (t.name.includes("Play-In")) return season;
  const placements = tournamentPlacements(t);
  const n = placements.length;
  if (n < 2) return season;
  let changed = false;
  const teams = season.teams.map((team) => {
    if (!team.coach) return team;
    const idx = placements.indexOf(team.id);
    if (idx < 0) return team;
    const seed = t.teams.find((x) => x.id === team.id)?.seed ?? (n + 1) / 2;
    const perf = (seed - (idx + 1)) / Math.max(1, n - 1); // >0 = beat seed
    const rating = nextCoachRating(team.coach.rating, perf);
    if (rating === team.coach.rating) return team;
    changed = true;
    return { ...team, coach: { ...team.coach, rating } };
  });
  return changed ? { ...season, teams } : season;
}

// [D] A balance patch rewards teams that adapt and punishes the rigid —
// expressed as a one-off form swing scaled by each team's adaptability.
function applyMetaAdaptability(season: SeasonState): SeasonState {
  if (!season.config.metaAdaptability) return season;
  const adapt = season.teamAdaptability ?? {};
  const form: Record<string, number> = { ...(season.teamForm ?? {}) };
  for (const team of season.teams) {
    const a = adapt[team.id] ?? 0;
    if (a === 0) continue;
    form[team.id] = clampForm((form[team.id] ?? 0) + a * ADAPT_FORM_SWING);
  }
  return { ...season, teamForm: form };
}

// [B] Between splits, individual player tiers drift one step. Lower tiers
// trend up and peaked ones regress down (regression to the mean), with
// recent team form tilting the odds — so rosters visibly improve or decay
// across the year. Star ratings follow automatically via deriveStar.
export function applyPlayerDevelopment(
  season: SeasonState,
  rng: RNG = Math.random,
): SeasonState {
  if (!season.config.playerDevelopment) return season;
  const form = season.teamForm ?? {};
  // Snapshot tiers before drifting so the UI can show this split's ▲/▼.
  const prevPlayerTiers: Record<string, PlayerTier[]> = {};
  for (const team of season.teams) {
    prevPlayerTiers[team.id] = team.players.map((p) => p.tier);
  }
  const teams = season.teams.map((team) => {
    const teamForm = form[team.id] ?? 0;
    // A strong coach helps players grow and shields decline; a poor one drags
    // them down. 0 for a neutral/absent coach (development unchanged).
    const coachTilt = coachDevTilt(team.coach);
    let changed = false;
    const players = team.players.map((p) => {
      // S+ is the elite marker owned by the offseason refresh (assignRoleElites),
      // NOT a developable skill — leave it alone so mid-split development can't
      // silently strip it (its value 3 would clamp to S below). It can still
      // drop to S at the next offseason re-rank if the player slips.
      if (p.tier === "S+") return p;
      if (rng() >= DEV_RATE) return p;
      const val = PLAYER_TIER_VALUE[p.tier]; // -2 (D) .. +2 (S)
      let pUp =
        0.5 -
        DEV_REGRESS * (val / 2) +
        DEV_FORM * Math.sign(teamForm) * Math.min(1, Math.abs(teamForm)) +
        coachTilt;
      pUp = Math.max(0.1, Math.min(0.9, pUp));
      const dir = rng() < pUp ? 1 : -1;
      const nextVal = Math.max(-2, Math.min(2, val + dir));
      if (nextVal === val) return p;
      changed = true;
      return { ...p, tier: valueToTier(nextVal) };
    });
    return changed ? { ...team, players } : team;
  });
  return { ...season, teams, prevPlayerTiers };
}

// [F] After an international, raise the regions whose teams placed well and
// lower those that flopped (decayed toward neutral). Feeds the inter-league
// seed ordering in qualifiedForInternational.
function updateLeagueStrength(
  season: SeasonState,
  t: TournamentState,
): SeasonState {
  if (!season.config.regionTides) return season;
  const placements = tournamentPlacements(t);
  const n = placements.length;
  if (n < 2) return season;
  const sum: Partial<Record<LeagueId, number>> = {};
  const count: Partial<Record<LeagueId, number>> = {};
  placements.forEach((id, idx) => {
    const team = season.teams.find((x) => x.id === id);
    if (!team) return;
    const lg = team.leagueId;
    const score = (n - 1 - idx) / (n - 1); // 1 = winner, 0 = last place
    sum[lg] = (sum[lg] ?? 0) + score;
    count[lg] = (count[lg] ?? 0) + 1;
  });
  const prev = season.leagueStrength ?? {};
  const out: Partial<Record<LeagueId, number>> = { ...prev };
  for (const lg of LEAGUE_IDS) {
    const c = count[lg];
    if (!c) continue; // region not represented this event → unchanged
    const avg = sum[lg]! / c; // average normalized finish, [0, 1]
    // (avg - 0.5): above-average lifts the region, below-average drops it.
    out[lg] = round3(LEAGUE_STRENGTH_DECAY * (prev[lg] ?? 0) + (avg - 0.5));
  }
  return { ...season, leagueStrength: out };
}

// [F · cross-season] How much of last year's region tide carries into the
// next season — half, so a region's reputation fades over a couple of
// years rather than locking in.
const CARRYOVER_DECAY = 0.5;
// Weights for the champion-region fallback (when the prior season didn't
// track tides): the region that won the bigger event enters stronger.
const CHAMPION_REGION_WEIGHT: Partial<Record<InternationalId, number>> = {
  "global-cup": 0.65,
  worlds: 0.5,
  msi: 0.3,
  "first-stand": 0.15,
};

// Seed a new season's region tides from the previous season's archive:
// prefer the evolved end-of-season strength (decayed toward neutral), and
// fall back to a reputation derived from who won each international when an
// older / imported entry didn't record the tide.
export function regionStrengthSeed(
  prior: SeasonHistoryEntry,
): Partial<Record<LeagueId, number>> {
  const out: Partial<Record<LeagueId, number>> = {};
  if (prior.leagueStrength) {
    for (const lg of LEAGUE_IDS) {
      const v = prior.leagueStrength[lg];
      if (typeof v === "number" && v !== 0) out[lg] = round3(v * CARRYOVER_DECAY);
    }
    return out;
  }
  for (const [event, w] of Object.entries(CHAMPION_REGION_WEIGHT) as Array<
    [InternationalId, number]
  >) {
    const lg = prior.intlChampions[event]?.leagueId;
    if (lg) out[lg] = round3((out[lg] ?? 0) + w);
  }
  return out;
}

// ─── Season lifecycle ──────────────────────────────────────────────────────

export function createSeason(opts: {
  config: SeasonConfig;
  teams: SeasonTeam[];
  activeMeta: SeasonMetaSnapshot;
  // Previous season's archive — seeds Region Tides so regions keep a
  // reputation across years (ignored unless regionTides is on).
  priorSeason?: SeasonHistoryEntry;
  /** Franchise year (realities mode) — year 4/8/… adds the quadrennial cup. */
  franchiseYear?: number;
}): SeasonState {
  const transferOn = !!opts.config.playerTransfers;
  const phases = buildSeasonPhases(transferOn, opts.franchiseYear);
  const now = Date.now();
  const season: SeasonState = {
    id: makeSeasonId(),
    name: opts.config.name.trim() || "My Season",
    createdAt: now,
    updatedAt: now,
    config: opts.config,
    teams: opts.teams,
    phases,
    phaseIndex: 0,
    tournaments: {},
    splitResults: {},
    intlResults: {},
    currentMeta: opts.activeMeta,
    // Frozen starting point — currentMeta evolves away from this as the
    // year progresses (live meta + patch shifts).
    initialMeta: opts.activeMeta,
    champion: null,
    status: "in-progress",
    // Seed the realism maps for whichever features are enabled (no-op /
    // absent when they're all off). Region tides may start from last
    // season's reputation rather than neutral.
    ...initRealismState(
      opts.config,
      opts.teams,
      opts.config.regionTides && opts.priorSeason
        ? regionStrengthSeed(opts.priorSeason)
        : undefined,
    ),
  };
  return startPhase(season, 0);
}

// Build the tournaments for a phase and mark it in-progress. Worlds
// starts with the play-in only; the main event is created when the
// play-in completes (applyTournamentUpdate handles that).
function startPhase(season: SeasonState, index: number): SeasonState {
  const phase = season.phases[index];
  if (!phase) return season;
  // Transfer windows hold no tournaments. The window's moves were computed as
  // the preceding international wrapped (applyTournamentUpdate). Pause here for
  // a followed team — so the user can review auto-proposals AND shop their
  // roster — otherwise (no controlled team) mark complete and flow straight on.
  if (phase.kind === "transfer") {
    const pending = !!season.config.controlledTeamId;
    const phases = season.phases.map((p, i) =>
      i === index
        ? { ...p, status: (pending ? "in-progress" : "complete") as SeasonPhase["status"] }
        : p,
    );
    let s = { ...season, phases, phaseIndex: index, updatedAt: Date.now() };
    // No followed team → the window closes immediately, so award the
    // roster-stability bonus now. With a followed team it's deferred to
    // advanceTransferWindow (after they accept/decline their proposals).
    if (!pending && phase.event) s = awardStabilityBonus(s, phase.event);
    return pending ? s : startPhase(s, index + 1);
  }
  const created: TournamentState[] = [];
  if (phase.kind === "split" && phase.split) {
    for (const league of LEAGUE_IDS) {
      created.push(createSplitTournament(season, league, phase.split));
    }
  } else if (phase.kind === "international" && phase.event === "first-stand") {
    // Seeds-bye First Stand opens with a play-in for the #2 seeds; the
    // main bracket (with the #1 seeds pre-placed) spawns when it completes
    // (applyTournamentUpdate), same as the Worlds/MSI play-in flow.
    created.push(
      firstStandUsesSeedByes(season)
        ? createFirstStandPlayIn(season)
        : createFirstStand(season),
    );
  } else if (phase.kind === "international" && phase.event === "msi") {
    // Ill-fitting field (odd swiss / unequal groups) → qualifier first;
    // the main event spawns when it completes (applyTournamentUpdate),
    // same as the Worlds play-in.
    created.push(msiNeedsPlayIn(season) ? createMSIPlayIn(season) : createMSI(season));
  } else if (phase.kind === "international" && phase.event === "worlds") {
    // Worlds opens with the play-in; when disabled, the main event is
    // built directly with every qualified team.
    created.push(
      worldsPlayInEnabled(season)
        ? createWorldsPlayIn(season)
        : createWorldsMain(season, null),
    );
  } else if (phase.kind === "international" && phase.event === "global-cup") {
    created.push(createGlobalCup(season));
  }
  const tournaments = { ...season.tournaments };
  for (const t of created) tournaments[t.id] = t;
  const phases = season.phases.map((p, i) =>
    i === index
      ? {
          ...p,
          tournamentIds: created.map((t) => t.id),
          status: "in-progress" as const,
        }
      : p,
  );
  return {
    ...season,
    phases,
    phaseIndex: index,
    tournaments,
    updatedAt: Date.now(),
  };
}

/** Current phase, or null when the season is complete. */
export function currentPhase(season: SeasonState): SeasonPhase | null {
  if (season.status === "complete") return null;
  return season.phases[season.phaseIndex] ?? null;
}

/** First tournament of the current phase that still has work. */
export function nextPendingTournament(
  season: SeasonState,
): TournamentState | null {
  const phase = currentPhase(season);
  if (!phase) return null;
  for (const id of phase.tournamentIds) {
    const t = season.tournaments[id];
    if (t && t.status !== "complete") return t;
  }
  return null;
}

// Record a completed tournament's placements + carry its evolved meta
// forward as the season's current meta.
function recordTournamentResult(
  season: SeasonState,
  t: TournamentState,
): SeasonState {
  let next = season;
  const placements = tournamentPlacements(t);
  const phase = season.phases[season.phaseIndex];
  if (phase?.kind === "split" && phase.split) {
    const league = leagueOfTournament(season, t);
    if (league) {
      next = {
        ...next,
        splitResults: {
          ...next.splitResults,
          [phase.split]: {
            ...(next.splitResults[phase.split] ?? {}),
            [league]: placements,
          },
        },
      };
    }
  } else if (phase?.kind === "international" && phase.event) {
    // Play-in results aren't the event result — only the main event
    // sets intlResults (Worlds Play-In always; MSI Play-In when an odd
    // swiss field forced one).
    const isPlayIn = t.name.includes("Play-In");
    if (!isPlayIn) {
      // Teams eliminated in this event's Play-In still PLACED at the event —
      // append them below the main-event finishers (in their Play-In order) so
      // every participating team gets a placement, not just the main bracket.
      const playIn = phase.tournamentIds
        .map((id) => next.tournaments[id])
        .find((x) => x && x.name.includes("Play-In") && x.status === "complete");
      let full = placements;
      if (playIn) {
        const inMain = new Set(t.teams.map((tt) => tt.id));
        const playInExits = tournamentPlacements(playIn).filter(
          (id) => !inMain.has(id) && !placements.includes(id),
        );
        full = [...placements, ...playInExits];
      }
      next = {
        ...next,
        intlResults: { ...next.intlResults, [phase.event]: full },
      };
    }
  }
  // Meta carry-over: live-meta tournaments evolve their snapshot as
  // rounds complete — adopt the evolved tiers as the season's meta.
  if (t.liveMeta && t.metaSnapshot) {
    next = {
      ...next,
      currentMeta: {
        metaOverride: t.metaSnapshot.metaOverride ?? null,
        metaEnabled: t.metaSnapshot.metaEnabled,
        synergyOverride:
          t.metaSnapshot.synergyOverride !== undefined
            ? t.metaSnapshot.synergyOverride
            : next.currentMeta.synergyOverride,
        counterOverride:
          t.metaSnapshot.counterOverride !== undefined
            ? (t.metaSnapshot.counterOverride as
                | import("../championMeta").CounterPair[]
                | null)
            : next.currentMeta.counterOverride,
      },
    };
  }
  // [A] Hot/cold form drifts on every completed tournament's results.
  next = updateFormFromTournament(next, t);
  // [A2] Teammate chemistry drifts on results (realities/franchise only).
  next = updateChemistryFromTournament(next, t);
  // [A3] Coach reputations rise/fall with results (mean-reverting).
  next = evolveCoachesFromTournament(next, t);
  // [F] Region strength tides on the international RESULT (not the play-in
  // qualifier) — the event that actually measures a region's showing.
  if (
    phase?.kind === "international" &&
    phase.event &&
    !t.name.includes("Play-In")
  ) {
    next = updateLeagueStrength(next, t);
  }
  return next;
}

/**
 * Write an updated tournament back into the season and run all the
 * consequences: record placements when it completes, spawn the Worlds
 * main event after the play-in, advance to the next phase (applying a
 * patch shift) when every tournament of the phase is done, and crown
 * the season champion after Worlds.
 */
export function applyTournamentUpdate(
  season: SeasonState,
  t: TournamentState,
  champions: readonly Champion[],
): SeasonState {
  if (!(t.id in season.tournaments)) return season;
  const alreadyComplete = season.tournaments[t.id]?.status === "complete";
  let next: SeasonState = {
    ...season,
    tournaments: { ...season.tournaments, [t.id]: t },
    updatedAt: Date.now(),
  };
  const phase = next.phases[next.phaseIndex];
  if (!phase || !phase.tournamentIds.includes(t.id)) return next;
  if (t.status !== "complete" || alreadyComplete) return next;

  next = recordTournamentResult(next, t);

  // Play-in done → create the main event inside the same phase (Worlds
  // always opens with one; MSI only when an odd swiss field forced a
  // qualifier; First Stand when the seeds-bye structure is in effect).
  if (
    phase.tournamentIds.length === 1 &&
    phase.tournamentIds[0] === t.id &&
    (phase.event === "worlds" ||
      phase.event === "msi" ||
      phase.event === "first-stand") &&
    t.name.includes("Play-In")
  ) {
    const main =
      phase.event === "worlds"
        ? createWorldsMain(next, t)
        : phase.event === "msi"
          ? createMSI(next, t)
          : createFirstStandMain(next, t);
    return {
      ...next,
      tournaments: { ...next.tournaments, [main.id]: main },
      phases: next.phases.map((p, i) =>
        i === next.phaseIndex
          ? { ...p, tournamentIds: [...p.tournamentIds, main.id] }
          : p,
      ),
      updatedAt: Date.now(),
    };
  }

  const allDone = phase.tournamentIds.every(
    (id) => next.tournaments[id]?.status === "complete",
  );
  if (!allDone) return next;

  // Phase complete.
  const phases = next.phases.map((p, i) =>
    i === next.phaseIndex ? { ...p, status: "complete" as const } : p,
  );
  next = { ...next, phases };

  // Snapshot the rosters that PLAYED this split/international, before the
  // between-phase transfer windows reshuffle them — so the Hall can show who
  // was on each team at each stage of the year.
  if (phase.kind === "split" || phase.kind === "international") {
    next = {
      ...next,
      phaseRosters: [
        ...(next.phaseRosters ?? []),
        {
          phaseIndex: next.phaseIndex,
          label: phase.label,
          kind: phase.kind,
          ...(phase.split ? { split: phase.split } : {}),
          ...(phase.event ? { event: phase.event } : {}),
          teams: next.teams.map((t) => ({
            teamId: t.id,
            teamName: t.name,
            leagueId: t.leagueId,
            ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
            ...(t.coach
              ? {
                  coach: {
                    name: t.coach.name,
                    rating: t.coach.rating,
                    ...(coachPlaystyle(t.coach) ? { playstyle: coachPlaystyle(t.coach) } : {}),
                  },
                }
              : {}),
            players: t.players.map((p) => ({
              ...(p.id ? { id: p.id } : {}),
              ...(p.name ? { name: p.name } : {}),
              tier: p.tier,
              lane: p.lane,
              ...(p.age != null ? { age: p.age } : {}),
              ...(p.debutYear != null ? { debutYear: p.debutYear } : {}),
            })),
          })),
        },
      ],
    };
  }

  const isLastPhase = next.phaseIndex >= next.phases.length - 1;
  if (isLastPhase) {
    // The post-Worlds offseason is a FRESH window each year. startNextSeason
    // carried last year's offseason moves into "worlds" for the in-season recap;
    // drop them now so this year's offseason per-team cap counts from zero
    // (otherwise it accumulates across years and stays perma-capped).
    const events = { ...(next.transfersByEvent ?? {}) };
    delete events.worlds;
    return {
      ...next,
      status: "complete",
      champion: next.intlResults.worlds?.[0] ?? null,
      transfersByEvent: events,
      updatedAt: Date.now(),
    };
  }

  // Between-phase transitions, then build the next phase.
  // [M] A gentle balance patch nudges the competitive meta each split —
  // like real LoL patches, a little, not a teardown.
  if (next.config.patchShift) {
    next = {
      ...next,
      currentMeta: applyPatchShift(
        next.currentMeta,
        champions,
        Math.random,
        PATCH_SHIFT_FRACTION,
      ),
    };
    // [D] The patch rewards adaptable teams and punishes rigid ones.
    next = applyMetaAdaptability(next);
  }
  // [B] Players develop between splits — run it as each split wraps up so
  // the next event sees the updated rosters.
  if (phase.kind === "split") {
    next = applyPlayerDevelopment(next);
    // [B] Pools always drift with the meta each split — rosters track the patch
    // instead of carrying the same champs all year. Auto-driven (living sim),
    // independent of the playerDevelopment skill-growth toggle.
    next = applyPoolDrift(next, champions);
  }
  // [T] Free-agency window: opens as First Stand / MSI wrap (the transfer
  // phase that follows). Standouts move up, weak links down; pool fit under
  // the just-shifted patch factors in, so it runs after the patch. The
  // upcoming transfer phase (startPhase below) then pauses for the followed
  // team's decisions, or flows straight through if there are none.
  if (phase.kind === "international" && (phase.event === "first-stand" || phase.event === "msi")) {
    next = applyTransfers(next, champions, phase);
  }
  return startPhase(next, next.phaseIndex + 1);
}

// ─── UI helpers ────────────────────────────────────────────────────────────

export function phaseProgress(
  season: SeasonState,
  phase: SeasonPhase,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const id of phase.tournamentIds) {
    const t = season.tournaments[id];
    if (!t) continue;
    done += t.matches.filter((m) => m.winner != null).length;
    total += t.matches.length;
  }
  return { done, total };
}

// Close an in-progress transfer window and advance to the next split. Any
// proposals the user left unresolved are treated as declined (dropped). No-op
// unless the current phase is an in-progress transfer window.
export function advanceTransferWindow(season: SeasonState): SeasonState {
  const phase = season.phases[season.phaseIndex];
  if (phase?.kind !== "transfer" || phase.status !== "in-progress") return season;
  const phases = season.phases.map((p, i) =>
    i === season.phaseIndex ? { ...p, status: "complete" as const } : p,
  );
  // The followed team's decisions are final now (unresolved proposals were
  // declined by default) — award the roster-stability bonus from the final
  // transfer record, so a declined proposal correctly counts as sitting out.
  let s: SeasonState = { ...season, phases, proposedTransfers: [], updatedAt: Date.now() };
  if (phase.event) s = awardStabilityBonus(s, phase.event);
  return startPhase(s, season.phaseIndex + 1);
}
