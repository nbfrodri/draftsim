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
  fo["gf"] = playoffs;
  fo["po:gf"] = playoffs;
  return fo;
}

// Single-elim events with an escalating series length: every round at
// `early`, the final at `final`. `teamCount` decides the round count
// (the bracket pads to the next power of 2).
function singleElimOverrides(
  teamCount: number,
  early: SeriesFormat,
  final: SeriesFormat,
): FormatOverrides {
  const rounds = Math.ceil(Math.log2(Math.max(2, teamCount)));
  const fo: FormatOverrides = {};
  for (let r = 1; r <= rounds; r++) {
    fo[`wb:${r}`] = r === rounds ? final : early;
  }
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

// ─── Qualification + seeding ───────────────────────────────────────────────

export interface Qualifier {
  team: SeasonTeam;
  league: LeagueId;
  /** 1..N placement inside its own league's qualifying split. */
  leagueSeed: number;
}

/** Teams qualified for an international, ordered by global seed:
 *  all league #1 seeds first (in league-power order), then #2s, etc.
 *  This is what makes seeding matter — the bracket pairs global seed 1
 *  against the weakest seed. */
export function qualifiedForInternational(
  season: SeasonState,
  event: InternationalId,
): Qualifier[] {
  const split = QUALIFYING_SPLIT[event];
  const count = QUALIFIER_COUNTS[event];
  const out: Qualifier[] = [];
  for (let seed = 1; seed <= count; seed++) {
    for (const league of LEAGUE_IDS) {
      const placements = season.splitResults[split]?.[league] ?? [];
      const teamId = placements[seed - 1];
      if (!teamId) continue;
      const team = season.teams.find((t) => t.id === teamId);
      if (team) out.push({ team, league, leagueSeed: seed });
    }
  }
  return out;
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
    formatOverrides: seriesOverrides(cfg.regularSeries, cfg.playoffSeries),
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
  });
  return tagSeason(t, season.id);
}

function createFirstStand(season: SeasonState): TournamentState {
  const qualified = qualifiedForInternational(season, "first-stand");
  const { early, finals } = intlSeries(season.config);
  const t = createTournament({
    name: "First Stand",
    format: "single-elim",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, early),
    formatOverrides: singleElimOverrides(qualified.length, early, finals),
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
  });
  return tagSeason(t, season.id);
}

function createMSI(season: SeasonState): TournamentState {
  const qualified = qualifiedForInternational(season, "msi");
  // 18 teams: swiss stage into a top-8 double-elim bracket (a plain
  // double-elim needs a power-of-2 field, so this is the closest
  // realistic shape the engine supports).
  const { early, finals } = intlSeries(season.config);
  const t = createTournament({
    name: "Mid-Season Invitational",
    format: "swiss-playoffs-de",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, early),
    formatOverrides: seriesOverrides(early, finals),
    swissPlayoffsAdvancingOverride: 8,
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
  });
  return tagSeason(t, season.id);
}

function createWorldsPlayIn(season: SeasonState): TournamentState {
  // The six 4th seeds fight for the last two main-event spots; both
  // finalists advance.
  const qualified = qualifiedForInternational(season, "worlds").filter(
    (q) => q.leagueSeed === 4,
  );
  const { early, finals } = intlSeries(season.config);
  const t = createTournament({
    name: "Worlds Play-In",
    format: "single-elim",
    teams: qualified.map((q, i) => toTournamentTeam(q.team, i + 1)),
    defaults: defaultsFor(season.config, early),
    formatOverrides: singleElimOverrides(qualified.length, early, finals),
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
  });
  return tagSeason(t, season.id);
}

function createWorldsMain(
  season: SeasonState,
  playIn: TournamentState,
): TournamentState {
  // Seeds 1–3 of every league enter directly (18 teams); the two
  // play-in finalists take the last two seeds → 20 teams in 4 groups
  // of 5, top 2 per group into a single-elim bo5 knockout.
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
  const { early, finals } = intlSeries(season.config);
  const t = createTournament({
    name: "World Championship",
    format: "groups-playoffs",
    teams,
    defaults: defaultsFor(season.config, early),
    formatOverrides: seriesOverrides(early, finals),
    groupsConfigOverride: { groupCount: 4, advancingPerGroup: 2 },
    metaSnapshot: cloneMeta(season.currentMeta),
    liveMeta: season.config.liveMeta,
    fearlessConfig: { perSeries: season.config.fearless },
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
