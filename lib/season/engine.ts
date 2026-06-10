// Season engine — pure functions that orchestrate a full competitive
// year. Every stage (league split, First Stand, MSI, Worlds play-in,
// Worlds main event) is a regular TournamentState created through the
// existing tournament engine; this module decides WHICH tournaments
// exist, WHO plays in them (qualification + seeding), and how the meta
// rolls forward between phases (live evolution carry-over + patch
// shifts). No store access — the store drives simulation and feeds
// completed tournaments back through applyTournamentUpdate().

import type { SeriesFormat } from "../types";
import type { Champion, Lane } from "../types";
import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "../championMeta";
import { deriveStar, type RNG } from "../players";
import {
  createTournament,
  computeStandings,
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
  { value: "round-robin", label: "Round Robin (no playoffs)" },
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
  return {
    id: team.id,
    name: team.name,
    seed,
    starRating: deriveStar(team.players),
    iconKey: team.iconKey,
    color: team.color,
    players: team.players,
    personalityId: team.personalityId,
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

// Formats offered for international events. Team counts run 12-21 so
// plain double-elim (power-of-2 field) is excluded; pure round-robin /
// swiss without playoffs are excluded too — an international needs a
// knockout to crown its champion.
export const INTL_FORMAT_OPTIONS: Array<{
  value: TournamentFormat;
  label: string;
}> = [
  { value: "single-elim", label: "Single Elimination" },
  { value: "groups-playoffs", label: "Groups + SE Playoffs" },
  { value: "groups-playoffs-de", label: "Groups + DE Playoffs" },
  { value: "swiss-playoffs", label: "Swiss + SE Playoffs" },
  { value: "swiss-playoffs-de", label: "Swiss + DE Playoffs" },
  { value: "round-robin-playoffs", label: "Round Robin + DE Playoffs" },
];

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
  return {
    ...defaultIntlConfig(config, event),
    ...(config.intlConfigs?.[event] ?? {}),
  };
}

// Format overrides for an international: single-elim escalates from
// early-round series through the semifinals to the finals length;
// stage+playoffs formats play the stage at the early length and the
// bracket at finals length, with the semifinals separately tunable.
function intlOverridesFor(
  cfg: SeasonIntlConfig,
  teamCount: number,
): FormatOverrides {
  const semis = cfg.semifinalSeries ?? cfg.finalsSeries;
  return cfg.format === "single-elim"
    ? singleElimOverrides(teamCount, cfg.earlySeries, cfg.finalsSeries, semis)
    : seriesOverrides(cfg.earlySeries, cfg.finalsSeries, semis, cfg.finalsSeries);
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
  rrPlayoffsAdvancingOverride?: number;
  groupsConfigOverride?: { groupCount: number; advancingPerGroup: number };
} {
  if (cfg.format === "swiss-playoffs" || cfg.format === "swiss-playoffs-de") {
    return { swissPlayoffsAdvancingOverride: cfg.playoffTeams };
  }
  if (cfg.format === "round-robin-playoffs") {
    return { rrPlayoffsAdvancingOverride: cfg.playoffTeams };
  }
  if (cfg.format === "groups-playoffs" || cfg.format === "groups-playoffs-de") {
    const groupCount =
      event === "worlds" ? 4 : inferGroupsConfig(teamCount).groupCount;
    const minGroupSize = Math.floor(teamCount / groupCount);
    const advancingPerGroup = Math.min(
      Math.max(1, Math.round(cfg.playoffTeams / groupCount)),
      Math.max(1, minGroupSize),
    );
    return { groupsConfigOverride: { groupCount, advancingPerGroup } };
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
  const standings = computeStandings(t);
  const order = standings.map((s) => s.team.id);
  const champion = tournamentChampion(t);
  if (!champion) return order;
  const head = [champion.id];
  const bracketDecided =
    t.format === "single-elim" ||
    t.format === "double-elim" ||
    formatHasPlayoffs(t.format);
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
export function qualifiedForInternational(
  season: SeasonState,
  event: InternationalId,
): Qualifier[] {
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
  // Global seed order: every league's #1, then the #2s, etc.
  const out: Qualifier[] = [];
  for (let seed = 1; seed <= count; seed++) {
    for (const league of LEAGUE_IDS) {
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

// ─── Tournament builders ───────────────────────────────────────────────────

function tagSeason(t: TournamentState, seasonId: string): TournamentState {
  return { ...t, seasonId };
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
    groupsConfigOverride:
      cfg.format === "groups-playoffs" || cfg.format === "groups-playoffs-de"
        ? {
            groupCount: 2,
            advancingPerGroup: Math.max(2, Math.round(cfg.playoffTeams / 2)),
          }
        : undefined,
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(season, ordered),
  });
  return tagSeason(t, season.id);
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
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season.id);
}

function createMSI(season: SeasonState): TournamentState {
  const qualified = qualifiedForInternational(season, "msi");
  // 18 teams (19 when the First Stand champion qualifies additively).
  // Canonical shape: swiss stage into a top-8 double-elim bracket (a
  // plain double-elim needs a power-of-2 field, so this is the closest
  // realistic shape the engine supports; swiss handles odd counts via
  // byes). Customizable per-event through config.intlConfigs.
  const cfg = intlConfigFor(season.config, "msi");
  const t = createTournament({
    name: "Mid-Season Invitational",
    format: cfg.format,
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, qualified.length),
    ...intlFormatParams(cfg, "msi", qualified.length),
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season.id);
}

function createWorldsPlayIn(season: SeasonState): TournamentState {
  // The six 4th seeds fight for the last two main-event spots; both
  // finalists advance. Always a small single-elim qualifier — the
  // configurable Worlds format applies to the main event.
  const qualified = qualifiedForInternational(season, "worlds").filter(
    (q) => q.leagueSeed === 4,
  );
  const cfg = intlConfigFor(season.config, "worlds");
  const t = createTournament({
    name: "Worlds Play-In",
    format: "single-elim",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: singleElimOverrides(
      qualified.length,
      cfg.earlySeries,
      cfg.finalsSeries,
    ),
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    streakSeeds: streakSeedsFor(
      season,
      qualified.map((q) => q.team),
    ),
  });
  return tagSeason(t, season.id);
}

function createWorldsMain(
  season: SeasonState,
  playIn: TournamentState,
): TournamentState {
  // Seeds 1–3 of every league enter directly (18 teams — 19 when the
  // MSI champion qualifies additively at leagueSeed 0); the two play-in
  // finalists take the last two seeds → 20-21 teams. Canonical shape:
  // 4 snake-seeded groups, top 2 per group into a single-elim bo5
  // knockout. Customizable through config.intlConfigs.worlds.
  const direct = qualifiedForInternational(season, "worlds").filter(
    (q) => q.leagueSeed <= 3,
  );
  const playInPlacements = tournamentPlacements(playIn);
  const finalists = playInPlacements
    .slice(0, 2)
    .map((id) => season.teams.find((t) => t.id === id))
    .filter((t): t is SeasonTeam => t != null);
  const teams: TournamentTeam[] = [
    ...direct.map((q, i) => toTournamentTeam(q.team, i + 1)),
    ...finalists.map((team, i) =>
      toTournamentTeam(team, direct.length + i + 1),
    ),
  ];
  const cfg = intlConfigFor(season.config, "worlds");
  const t = createTournament({
    name: "World Championship",
    format: cfg.format,
    teams,
    defaults: defaultsFor(season.config, cfg.earlySeries),
    formatOverrides: intlOverridesFor(cfg, teams.length),
    ...intlFormatParams(cfg, "worlds", teams.length),
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
    // Play-in finalists carry their play-in run (the play-in is already
    // complete and recorded by the time the main event is created).
    streakSeeds: streakSeedsFor(season, [
      ...direct.map((q) => q.team),
      ...finalists,
    ]),
  });
  return tagSeason(t, season.id);
}

// ─── Patch shift ───────────────────────────────────────────────────────────
// A "balance patch" between phases: materialize the full tier table
// (current override over baseline), then nudge ~12% of (champion, lane)
// entries one tier up or down. Returns a complete MetaOverride so the
// shifted meta is authoritative from then on.

export function applyPatchShift(
  meta: SeasonMetaSnapshot,
  champions: readonly Champion[],
  rng: RNG = Math.random,
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
      if (rng() >= 0.12) continue;
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

// ─── Season lifecycle ──────────────────────────────────────────────────────

export function createSeason(opts: {
  config: SeasonConfig;
  teams: SeasonTeam[];
  activeMeta: SeasonMetaSnapshot;
}): SeasonState {
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
  };
  return startPhase(season, 0);
}

// Build the tournaments for a phase and mark it in-progress. Worlds
// starts with the play-in only; the main event is created when the
// play-in completes (applyTournamentUpdate handles that).
function startPhase(season: SeasonState, index: number): SeasonState {
  const phase = season.phases[index];
  if (!phase) return season;
  const created: TournamentState[] = [];
  if (phase.kind === "split" && phase.split) {
    for (const league of LEAGUE_IDS) {
      created.push(createSplitTournament(season, league, phase.split));
    }
  } else if (phase.event === "first-stand") {
    created.push(createFirstStand(season));
  } else if (phase.event === "msi") {
    created.push(createMSI(season));
  } else if (phase.event === "worlds") {
    created.push(createWorldsPlayIn(season));
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
    // Worlds play-in results aren't the event result — only the main
    // event (second tournament of the phase) sets intlResults.worlds.
    const isWorldsPlayIn =
      phase.event === "worlds" && phase.tournamentIds[0] === t.id;
    if (!isWorldsPlayIn) {
      next = {
        ...next,
        intlResults: { ...next.intlResults, [phase.event]: placements },
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

  // Worlds: play-in done → create the main event inside the same phase.
  if (
    phase.event === "worlds" &&
    phase.tournamentIds.length === 1 &&
    phase.tournamentIds[0] === t.id
  ) {
    const main = createWorldsMain(next, t);
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

  const isLastPhase = next.phaseIndex >= next.phases.length - 1;
  if (isLastPhase) {
    return {
      ...next,
      status: "complete",
      champion: next.intlResults.worlds?.[0] ?? null,
      updatedAt: Date.now(),
    };
  }

  // Balance patch between phases, then build the next phase.
  if (next.config.patchShift) {
    next = {
      ...next,
      currentMeta: applyPatchShift(next.currentMeta, champions),
    };
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
