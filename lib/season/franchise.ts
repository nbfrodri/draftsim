// Franchise / "reality" mode — a continuous timeline where the SAME teams
// (names, logos, rosters, careers) carry across many seasons. Each year is a
// normal SeasonState; between years an OFFSEASON ages every player (growth,
// decline, performance demotion → academy/FA, returnees/rookies) and drifts
// pools, then a fresh season begins with the evolved squads. Cross-year records
// accumulate in the Hall by stable player id.

import type { Champion, Lane, Player } from "../types";
import { LANE_ORDER, type RNG } from "../players";
import { driftSynergiesOverTime, assignSynergies, CHEM_PRESEASON_STEP } from "../chemistry";
import { createSeason } from "./engine";
import { buildSeasonHistoryEntry } from "./history";
import { teamSeasonGrades, computePlayerTitleCounts } from "./stats";
import {
  USER_MAX_FA_SIGNS,
  USER_MAX_MANUAL_DEMOTES,
  FA_OPEN_REPLACE_GAP,
  ACADEMY_OPEN_REPLACE_GAP,
  executeUserFaSign,
  executeUserAcademyRecall,
  executeUserFaToAcademy,
  executeUserAcademyRelease,
  executeAddAcademyRookie,
  shallowestAcademyLane,
  teamAcademyHasRoom,
  teamAcademyHasRookieSoftRoom,
  countTeamAcademy,
  addToTeamAcademy,
  makeBecameFaNews,
  isRosterVacancy,
  makeVacancyPlaceholder,
  pickScoredReturnee,
  applyComebackRust,
  inactiveTransferValue,
  INITIAL_ACADEMY_ROOKIES_PER_TEAM,
  ACADEMY_MAX_PER_TEAM,
  AI_OPEN_FA_CHANCE_MID_SPLIT,
  type MarketNote,
  type MarketInactive,
} from "./faMarket";
import {
  runOffseasonLifecycle,
  runDemotionPass,
  seedRosterCareers,
  computeRoleMeans,
  GRADE_GAP_THRESHOLD,
  makeRookie,
  withRosterTimeMark,
  type SeasonPlayerOutcome,
  type RosterNewsEvent,
} from "./playerLifecycle";
import { offseasonTransferPass, transferValue } from "./transfers";
import { reassignCoaches } from "./coach";
import { assignRoleElites } from "./teamGen";
import { applyPoolDrift } from "./poolDrift";
import {
  INTERNATIONAL_LABELS,
  type SeasonState,
  type SeasonTeam,
  type SplitId,
} from "./types";

const SHORT_SPLIT_MARK: Record<SplitId, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

/**
 * Human label for when a roster-news row occurred: Winter / Spring / Summer,
 * First Stand window / MSI window, or Offseason.
 */
export function rosterTimeMarkForSeason(
  season: Pick<SeasonState, "status" | "phases" | "phaseIndex">,
  opts?: { split?: SplitId },
): string {
  if (opts?.split) return SHORT_SPLIT_MARK[opts.split];
  if (season.status === "complete") return "Offseason";
  const phase = season.phases[season.phaseIndex];
  if (phase?.kind === "transfer" && phase.event) {
    if (phase.event === "first-stand") return "First Stand window";
    if (phase.event === "msi") return "MSI window";
    return `${INTERNATIONAL_LABELS[phase.event]} window`;
  }
  if (phase?.kind === "split" && phase.split) return SHORT_SPLIT_MARK[phase.split];
  return phase?.label ?? "—";
}

function makeRealityId(rng: RNG): string {
  return `reality-${Math.floor(rng() * 1e9).toString(36)}`;
}

// Roster continuity → a starting-season FORM bonus. A team that keeps its core
// from last year begins the new year settled and confident; a team that
// rebuilt is still gelling (and its fresh pairs already reset chemistry, so the
// continuity reward stacks naturally on top). Keeping the majority (3 of 5)
// earns a little, keeping all 5 earns the most, fewer than a majority earns
// nothing. Like any form it decays over the season.
export const CONTINUITY_FORM_BONUS = 0.4;
export function continuityFormBonus(retained: number): number {
  const frac = Math.max(0, Math.min(1, (retained - 2) / 3));
  return Math.round(frac * CONTINUITY_FORM_BONUS * 100) / 100;
}

/** Build per-player season outcomes (grade + titles) for demotion evaluation. */
function buildSeasonOutcomes(season: SeasonState): {
  outcomes: Map<string, SeasonPlayerOutcome>;
  roleMeans: Partial<Record<Lane, number>>;
} {
  const titles = computePlayerTitleCounts(season);
  const outcomes = new Map<string, SeasonPlayerOutcome>();
  for (const t of season.teams) {
    const grades = teamSeasonGrades(season, t.id).avg;
    t.players.forEach((p, i) => {
      if (!p.id) return;
      const a = titles.get(p.id) ?? { split: 0, intlTitles: 0, intlApps: 0 };
      outcomes.set(p.id, {
        playerId: p.id,
        grade: grades[i] ?? null,
        tier: p.tier,
        lane: p.lane,
        splitTitles: a.split,
        intlTitles: a.intlTitles,
      });
    });
  }
  return { outcomes, roleMeans: computeRoleMeans(outcomes.values()) };
}

/**
 * Outcomes for a single completed split checkpoint: grades from that split's
 * tournaments only, plus whether the player won THIS split / the prior intl
 * event (First Stand credited on spring, MSI on summer).
 */
function buildSplitCheckpointOutcomes(
  season: SeasonState,
  split: SplitId,
): {
  outcomes: Map<string, SeasonPlayerOutcome>;
  roleMeans: Partial<Record<Lane, number>>;
} {
  const phase = season.phases.find((p) => p.kind === "split" && p.split === split);
  const tidSet = phase?.tournamentIds ?? [];
  const intlCredit: "first-stand" | "msi" | null =
    split === "spring" ? "first-stand" : split === "summer" ? "msi" : null;

  const outcomes = new Map<string, SeasonPlayerOutcome>();
  for (const t of season.teams) {
    const grades = teamSeasonGrades(season, t.id, tidSet).avg;
    const wonSplit = season.splitResults[split]?.[t.leagueId]?.[0] === t.id;
    t.players.forEach((p, i) => {
      if (!p.id) return;
      let intlTitles = 0;
      if (intlCredit) {
        const champId = season.intlResults[intlCredit]?.[0];
        if (champId) {
          const snap = season.phaseRosters?.find((s) => s.event === intlCredit);
          const onChamp = snap?.teams
            .find((x) => x.teamId === champId)
            ?.players.some((rp) => rp.id === p.id);
          const fallback =
            !snap &&
            !!season.teams
              .find((x) => x.id === champId)
              ?.players.some((rp) => rp.id === p.id);
          if (onChamp || fallback) intlTitles = 1;
        }
      }
      outcomes.set(p.id, {
        playerId: p.id,
        grade: grades[i] ?? null,
        tier: p.tier,
        lane: p.lane,
        splitTitles: wonSplit ? 1 : 0,
        intlTitles,
      });
    });
  }
  return { outcomes, roleMeans: computeRoleMeans(outcomes.values()) };
}

/**
 * Mid-split demotion checkpoint (franchise aging only): evaluate underperformance
 * for the just-finished split, demote / fill slots, AI academy release/stash/
 * rookies, light open-FA replaces, append roster news. Does NOT age players or
 * advance academy→FA→retire (year-end only). Open FA uses a low per-team chance
 * ({@link AI_OPEN_FA_CHANCE_MID_SPLIT}) so FA→academy stash stays the main
 * mid-season FA path; deferred followed teams still skip AI after shopping.
 *
 * When winter/spring demotions were deferred for a followed team
 * (`pendingMidSplitDemotion`), that org is skipped for AI academy maintenance
 * (they already shopped the transfer window).
 */
export function applyMidSplitDemotions(
  season: SeasonState,
  split: SplitId,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  if (!season.franchise?.aging) return season;

  const taken = new Set<string>(season.franchise.usedNames ?? []);
  for (const t of season.teams) {
    for (const p of t.players) if (p.name) taken.add(p.name);
    if (t.coach?.name) taken.add(t.coach.name);
  }
  const { outcomes, roleMeans } = buildSplitCheckpointOutcomes(season, split);
  // Deferred Proceed path: user already shopped — skip their org for AI
  // academy intake/release/stash. Immediate summer (no pending) includes them.
  const skipFollowed =
    season.franchise.pendingMidSplitDemotion && season.config.controlledTeamId
      ? new Set([season.config.controlledTeamId])
      : undefined;
  const result = runDemotionPass(
    season.teams.map((t) => ({
      id: t.id,
      name: t.name,
      players: t.players,
      leagueId: t.leagueId,
    })),
    outcomes,
    roleMeans,
    season.franchise.inactivePool ?? [],
    champions,
    rng,
    taken,
    season.franchise.year,
    {
      ageActives: false,
      advancePool: false,
      meta: season.currentMeta,
      competitiveMarket: false,
      // Sparse FA→main mid-season; academy stash (maintenance) is the bulk path.
      openFaMarket: true,
      openFaAttemptChance: AI_OPEN_FA_CHANCE_MID_SPLIT,
      academyMaintenance: true,
      ...(skipFollowed ? { skipOpenFaTeamIds: skipFollowed } : {}),
    },
  );
  const byId = new Map(result.teams.map((t) => [t.id, t.players]));
  const teams: SeasonTeam[] = season.teams.map((t) => ({
    ...t,
    players: byId.get(t.id) ?? t.players,
  }));
  const usedNames = new Set<string>(season.franchise.usedNames ?? []);
  for (const t of teams) {
    for (const p of t.players) if (p.name) usedNames.add(p.name);
  }
  for (const entry of result.inactivePool) {
    if (entry.player.name) usedNames.add(entry.player.name);
  }
  const mark = rosterTimeMarkForSeason(season, { split });
  const rosterNews = [
    ...(season.rosterNews ?? []),
    ...withRosterTimeMark(result.news, mark),
  ];
  return {
    ...season,
    teams,
    franchise: {
      ...season.franchise,
      usedNames: [...usedNames],
      inactivePool: result.inactivePool,
    },
    ...(rosterNews.length > 0 ? { rosterNews } : {}),
    updatedAt: Date.now(),
  };
}

/**
 * Fill each org academy up to {@link INITIAL_ACADEMY_ROOKIES_PER_TEAM} with
 * fresh rookies (idempotent: teams already at/above that count are skipped).
 * Respects {@link ACADEMY_MAX_PER_TEAM}. Mutates `taken` with new handles.
 */
export function seedOpeningAcademies(
  teams: readonly { id: string; name: string; leagueId?: string }[],
  pool: readonly MarketInactive[],
  champions: readonly Champion[],
  rng: RNG,
  taken: Set<string>,
  year: number,
  perTeam: number = INITIAL_ACADEMY_ROOKIES_PER_TEAM,
): MarketInactive[] {
  const target = Math.min(perTeam, ACADEMY_MAX_PER_TEAM);
  if (target <= 0 || champions.length === 0) return [...pool];
  let working: MarketInactive[] = [...pool];
  for (const team of teams) {
    while (
      countTeamAcademy(working, team.id) < target &&
      teamAcademyHasRoom(working, team.id)
    ) {
      const lane = shallowestAcademyLane(working, team.id, LANE_ORDER, rng);
      const rook = makeRookie(lane, champions, rng, taken, team.leagueId);
      rook.debutYear = year;
      const res = executeAddAcademyRookie(working, team.id, team.name, rook, year);
      if (!res.ok) break;
      working = res.inactivePool;
      // Desync opening cohort: 2nd/4th/… rookies start at Academy · 2y so the
      // year-1 seed does not all hit soft-max FA in the same calendar year.
      if (countTeamAcademy(working, team.id) % 2 === 0) {
        const last = working.length - 1;
        const e = working[last];
        if (e?.status === "academy" && e.lastTeamId === team.id) {
          working = working.map((row, i) =>
            i === last ? { ...row, inactiveYears: 2 } : row,
          );
        }
      }
      if (rook.name) taken.add(rook.name);
    }
  }
  return working;
}

/** Turn a freshly-created season into Year 1 of a reality: stamp every player
 *  with an age + potential and attach the franchise context. When aging is on
 *  and champions are provided, each team also starts with
 *  {@link INITIAL_ACADEMY_ROOKIES_PER_TEAM} academy rookies. */
export function seedFranchise(
  season: SeasonState,
  name: string,
  aging: boolean,
  rng: RNG = Math.random,
  champions: readonly Champion[] = [],
): SeasonState {
  const teams: SeasonTeam[] = season.teams.map((t) => ({
    ...t,
    players: seedRosterCareers(t.players, rng),
  }));
  const fname = name.trim() || "My Reality";
  const usedNames = new Set<string>();
  for (const t of teams) {
    for (const p of t.players) if (p.name) usedNames.add(p.name);
    if (t.coach?.name) usedNames.add(t.coach.name);
  }
  const inactivePool =
    aging && champions.length > 0
      ? seedOpeningAcademies(teams, [], champions, rng, usedNames, 1)
      : [];
  return {
    ...season,
    name: `${fname} — Year 1`,
    teams,
    franchise: {
      id: makeRealityId(rng),
      name: fname,
      year: 1,
      aging,
      usedNames: [...usedNames],
      inactivePool,
    },
  };
}

/** Roll a COMPLETED season into the next year. Ages every roster (perf-driven
 *  growth/decline, demotions → academy, returnees/rookies), drifts pools,
 *  carries the same teams + meta + region tides forward, and starts a fresh
 *  Winter. The prior season should be archived to the reality's history by the
 *  caller. */
export function startNextSeason(
  prev: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  const gradeCache = new Map<string, (number | null)[]>();
  const gradesOf = (teamId: string): (number | null)[] => {
    let g = gradeCache.get(teamId);
    if (!g) {
      g = teamSeasonGrades(prev, teamId).avg;
      gradeCache.set(teamId, g);
    }
    return g;
  };

  const aging = prev.franchise?.aging ?? false;
  const closingYear = prev.franchise?.year ?? 1;
  const nextYear = closingYear + 1;
  let working = prev;
  let evolvedTeams: SeasonTeam[] = working.teams;
  const rosterNews: Array<RosterNewsEvent & { teamId: string }> = [];
  let nextInactivePool = working.franchise?.inactivePool ?? [];

  if (aging) {
    // Resolve any leftover manual-demote vacancies before year-end lifecycle
    // so stubs never enter demotion / open-FA evaluation.
    const priorNewsLen = working.rosterNews?.length ?? 0;
    working = fillFollowedRosterVacancies(working, champions, rng);
    rosterNews.push(...(working.rosterNews ?? []).slice(priorNewsLen));

    const taken = new Set<string>(working.franchise?.usedNames ?? []);
    for (const t of working.teams) {
      for (const p of t.players) if (p.name) taken.add(p.name);
      if (t.coach?.name) taken.add(t.coach.name);
    }
    const { outcomes, roleMeans } = buildSeasonOutcomes(working);
    const result = runOffseasonLifecycle(
      working.teams.map((t) => ({
        id: t.id,
        name: t.name,
        players: t.players,
        leagueId: t.leagueId,
      })),
      outcomes,
      roleMeans,
      working.franchise?.inactivePool ?? [],
      champions,
      rng,
      taken,
      closingYear,
      GRADE_GAP_THRESHOLD,
      working.currentMeta,
      {
        intakeYear: nextYear,
        ...(working.config.controlledTeamId
          ? { skipOpenFaTeamIds: new Set([working.config.controlledTeamId]) }
          : {}),
      },
    );
    const byId = new Map(result.teams.map((t) => [t.id, t.players]));
    evolvedTeams = working.teams.map((t) => ({
      ...t,
      players: byId.get(t.id) ?? t.players,
    }));
    nextInactivePool = result.inactivePool;
    rosterNews.push(...withRosterTimeMark(result.news, "Offseason"));
  }

  evolvedTeams = evolvedTeams.map((t) => {
    const players = t.players.map((p) => {
      if (!p.homeRegion) return { ...p, homeRegion: t.leagueId, acclimation: 1 };
      const acc = p.acclimation ?? 1;
      return acc < 1 ? { ...p, acclimation: Math.min(1, acc + 0.34) } : p;
    });
    return { ...t, players: driftSynergiesOverTime(assignSynergies(players, t.name)) };
  });

  const byId = new Map(champions.map((c) => [c.id, c]));
  const userMoves = prev.transfersByEvent?.worlds ?? [];
  const movedKey = new Set<string>();
  for (const m of userMoves) {
    movedKey.add(`${m.fromTeamId}:${m.lane}`);
    movedKey.add(`${m.toTeamId}:${m.lane}`);
  }
  const LANES = ["top", "jungle", "middle", "bottom", "support"] as const;
  let offseasonMoves = [...userMoves];
  if (prev.config.playerTransfers) {
    const { teams: shuffledTeams, moves: autoMoves } = offseasonTransferPass(
      evolvedTeams,
      (teamId, li) => gradesOf(teamId)[li] ?? null,
      byId,
      prev.currentMeta,
      prev.config.controlledTeamId,
      (teamId, li) => movedKey.has(`${teamId}:${LANES[li]}`),
      userMoves,
    );
    evolvedTeams = shuffledTeams;
    offseasonMoves = [...userMoves, ...autoMoves];
  }

  evolvedTeams = reassignCoaches(evolvedTeams, rng, 5, prev.config.controlledTeamId ?? undefined);

  evolvedTeams = evolvedTeams.map((t) => ({
    ...t,
    players: driftSynergiesOverTime(assignSynergies(t.players, t.name), CHEM_PRESEASON_STEP),
  }));

  evolvedTeams = assignRoleElites(evolvedTeams);

  const prevForHistory =
    offseasonMoves.length > 0
      ? { ...prev, transfersByEvent: { ...prev.transfersByEvent, worlds: offseasonMoves } }
      : prev;
  const prior =
    prev.status === "complete" ? buildSeasonHistoryEntry(prevForHistory, Date.now()) : undefined;
  const year = nextYear;
  const usedNames = new Set<string>(prev.franchise?.usedNames ?? []);
  for (const t of evolvedTeams) {
    for (const p of t.players) if (p.name) usedNames.add(p.name);
    if (t.coach?.name) usedNames.add(t.coach.name);
  }
  for (const entry of nextInactivePool) {
    if (entry.player.name) usedNames.add(entry.player.name);
  }
  const franchise = {
    id: prev.franchise?.id ?? makeRealityId(rng),
    name: prev.franchise?.name ?? "My Reality",
    year,
    aging,
    usedNames: [...usedNames],
    inactivePool: nextInactivePool,
  };

  let next = createSeason({
    config: prev.config,
    teams: evolvedTeams,
    activeMeta: prev.currentMeta,
    priorSeason: prior,
    franchiseYear: year,
  });
  next = applyPoolDrift(next, champions, rng);

  let continuityForm: Record<string, number> | null = null;
  if (next.teamForm) {
    continuityForm = {};
    const prevById = new Map(prev.teams.map((t) => [t.id, t]));
    for (const team of next.teams) {
      const before = prevById.get(team.id);
      if (!before) continue;
      const prevIds = new Set(
        before.players.map((p) => p.id).filter((id): id is string => !!id),
      );
      const retained = team.players.filter((p) => p.id && prevIds.has(p.id)).length;
      const bonus = continuityFormBonus(retained);
      if (bonus > 0) continuityForm[team.id] = bonus;
    }
  }

  return {
    ...next,
    ...(continuityForm
      ? { teamForm: { ...next.teamForm, ...continuityForm } }
      : {}),
    name: `${franchise.name} — Year ${year}`,
    franchise,
    ...(offseasonMoves.length > 0
      ? { transfersByEvent: { ...next.transfersByEvent, worlds: offseasonMoves } }
      : {}),
    ...(rosterNews.length > 0 ? { rosterNews } : {}),
  };
}

/**
 * User FA sign for the followed team: post-Worlds offseason, or an in-progress
 * mid-season transfer window (First Stand / MSI). Aging realities only — the
 * inactive pool does not exist otherwise. Releases the lane incumbent to this
 * org's academy.
 */
export function applyUserFaSign(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  faPlayerId: string,
): SeasonState | null {
  return applyUserInactiveSign(season, champions, lane, faPlayerId, "fa");
}

/**
 * User academy call-up for the followed team (same windows as FA). Same-org
 * exclusivity enforced inside executeUserAcademyRecall.
 */
export function applyUserAcademyRecall(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  academyPlayerId: string,
): SeasonState | null {
  return applyUserInactiveSign(season, champions, lane, academyPlayerId, "academy");
}

/**
 * Sign an FA into the followed team's academy (not main roster). Same shopping
 * windows / FA-sign budget as roster FA signs. Fails when academy is full
 * (no bump — user must Release to FA first).
 */
export function applyUserFaToAcademy(
  season: SeasonState,
  faPlayerId: string,
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;
  const used = season.franchise.faSignsThisWindow ?? 0;
  if (used >= USER_MAX_FA_SIGNS) return null;

  const team = season.teams.find((t) => t.id === me);
  if (!team) return null;
  const excludePlayerIds = new Set(season.franchise.sameWindowDemoteIds ?? []);
  const result = executeUserFaToAcademy(
    season.franchise.inactivePool ?? [],
    me,
    team.name,
    faPlayerId,
    season.franchise.year,
    { excludePlayerIds },
  );
  if (!result.ok) return null;

  return {
    ...season,
    franchise: {
      ...season.franchise,
      inactivePool: result.inactivePool,
      faSignsThisWindow: used + 1,
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(result.news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Release a followed-team academy player to free agency (FA · 1y). Same
 * shopping windows as FA / academy boards. Does not consume FA-sign budget.
 */
export function applyUserAcademyRelease(
  season: SeasonState,
  academyPlayerId: string,
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;

  const result = executeUserAcademyRelease(
    season.franchise.inactivePool ?? [],
    me,
    academyPlayerId,
  );
  if (!result.ok) return null;

  return {
    ...season,
    franchise: {
      ...season.franchise,
      inactivePool: result.inactivePool,
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(result.news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Generate a rookie into the followed team's academy (not main roster).
 * Requires soft academy room ({@link teamAcademyHasRookieSoftRoom}) so demotions
 * keep a free slot. Does not consume FA-sign budget. Optional `lane` — defaults
 * to the shallowest academy lane for depth.
 */
export function applyUserAcademyRookie(
  season: SeasonState,
  champions: readonly Champion[],
  lane?: Lane,
  rng: RNG = Math.random,
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  if (champions.length === 0) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;

  const team = season.teams.find((t) => t.id === me);
  if (!team) return null;
  const pool = season.franchise.inactivePool ?? [];
  if (!teamAcademyHasRookieSoftRoom(pool, me)) return null;

  const taken = new Set<string>(season.franchise.usedNames ?? []);
  for (const t of season.teams) {
    for (const p of t.players) if (p.name) taken.add(p.name);
    if (t.coach?.name) taken.add(t.coach.name);
  }
  for (const e of pool) {
    if (e.player.name) taken.add(e.player.name);
  }

  const pickLane =
    lane ?? shallowestAcademyLane(pool, me, LANE_ORDER, rng);
  const year = season.franchise.year;
  const rook = makeRookie(pickLane, champions, rng, taken, team.leagueId);
  rook.debutYear = year;
  if (rook.name) taken.add(rook.name);

  const result = executeAddAcademyRookie(pool, me, team.name, rook, year);
  if (!result.ok) return null;

  return {
    ...season,
    franchise: {
      ...season.franchise,
      inactivePool: result.inactivePool,
      usedNames: [...taken],
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(result.news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

function applyUserInactiveSign(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  playerId: string,
  kind: "fa" | "academy",
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;
  const used = season.franchise.faSignsThisWindow ?? 0;
  if (used >= USER_MAX_FA_SIGNS) return null;

  const excludePlayerIds = new Set(season.franchise.sameWindowDemoteIds ?? []);
  const byId = new Map(champions.map((c) => [c.id, c]));
  const teams = season.teams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.players,
    leagueId: t.leagueId,
  }));
  const gradeCache = new Map<string, number | null>();
  const gradeOf = (pid: string): number | null => {
    if (gradeCache.has(pid)) return gradeCache.get(pid)!;
    for (const t of season.teams) {
      const idx = t.players.findIndex((p) => p.id === pid);
      if (idx >= 0) {
        const g = teamSeasonGrades(season, t.id).avg[idx] ?? null;
        gradeCache.set(pid, g);
        return g;
      }
    }
    gradeCache.set(pid, null);
    return null;
  };

  const signOpts = { requireGap: true, excludePlayerIds };
  const result =
    kind === "fa"
      ? executeUserFaSign(
          teams,
          season.franchise.inactivePool ?? [],
          me,
          lane,
          playerId,
          byId,
          season.currentMeta,
          season.franchise.year,
          gradeOf,
          signOpts,
        )
      : executeUserAcademyRecall(
          teams,
          season.franchise.inactivePool ?? [],
          me,
          lane,
          playerId,
          byId,
          season.currentMeta,
          season.franchise.year,
          gradeOf,
          signOpts,
        );
  if (!result.ok) return null;

  const byTeam = new Map(result.teams.map((t) => [t.id, t.players]));
  return {
    ...season,
    teams: season.teams.map((t) => ({
      ...t,
      players: byTeam.get(t.id) ?? t.players,
    })),
    franchise: {
      ...season.franchise,
      inactivePool: result.inactivePool,
      faSignsThisWindow: used + 1,
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(result.news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Manually bench a followed-team player to academy during a transfer window or
 * post-Worlds offseason shop. Opens a vacancy (placeholder) the user can fill
 * via FA / academy recall, or leave for AI fill when the window ends.
 * Cap: USER_MAX_MANUAL_DEMOTES per window. Demotee cannot return same window.
 */
export function applyUserManualDemote(
  season: SeasonState,
  lane: Lane,
  opts?: { marketNote?: Extract<MarketNote, "manual-demote" | "ai-demote"> },
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;

  const used = season.franchise.manualDemotesThisWindow ?? 0;
  if (used >= USER_MAX_MANUAL_DEMOTES) return null;

  const team = season.teams.find((t) => t.id === me);
  if (!team) return null;
  const slot = team.players.findIndex((p) => p.lane === lane);
  if (slot < 0) return null;
  const incumbent = team.players[slot]!;
  if (isRosterVacancy(incumbent) || !incumbent.id) return null;
  // Rookies signed this window cannot be benched until the next window.
  if ((season.franchise.sameWindowRookieIds ?? []).includes(incumbent.id)) {
    return null;
  }

  const grade =
    teamSeasonGrades(season, me).avg[slot] ?? null;

  const parked = {
    player: { ...incumbent, badStreak: 0 },
    status: "academy" as const,
    inactiveYears: 1,
    demotedYear: season.franchise.year,
    lastTeamId: team.id,
    lastTeamName: team.name,
    ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
  };

  const players = [...team.players];
  players[slot] = makeVacancyPlaceholder(lane);

  const news: RosterNewsEvent & { teamId: string } = {
    teamId: me,
    lane,
    ...(incumbent.name ? { departedName: incumbent.name } : {}),
    departedTier: incumbent.tier,
    ...(incumbent.age != null ? { departedAge: incumbent.age } : {}),
    departedId: incumbent.id,
    entrantName: "",
    entrantTier: incumbent.tier,
    entrantPotential: incumbent.tier,
    entrantSource: "rookie",
    marketNote: opts?.marketNote ?? "manual-demote",
  };

  const sameWindowDemoteIds = [
    ...(season.franchise.sameWindowDemoteIds ?? []),
    incumbent.id,
  ];

  // Cap: bump oldest academy → FA if full so demote still works.
  const parkedRes = addToTeamAcademy(season.franchise.inactivePool ?? [], parked);
  const bumpNews = parkedRes.bumped
    ? [makeBecameFaNews(parkedRes.bumped, "academy-bump")]
    : [];
  const mark = rosterTimeMarkForSeason(season);

  return {
    ...season,
    teams: season.teams.map((t) => (t.id === me ? { ...t, players } : t)),
    franchise: {
      ...season.franchise,
      inactivePool: parkedRes.pool,
      manualDemotesThisWindow: used + 1,
      sameWindowDemoteIds,
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark([...bumpNews, news], mark),
    ],
    updatedAt: Date.now(),
  };
}

/**
 * User fills a vacant followed-team lane academy-first: mint a prospect into
 * the org academy, then immediately call them up into the vacancy. Falls back
 * to a main-roster safety rookie only when the academy is full. Does not
 * consume FA-sign budget. No-op if the lane is not vacant.
 */
export function applyUserRookieSign(
  season: SeasonState,
  champions: readonly Champion[],
  lane: Lane,
  rng: RNG = Math.random,
): SeasonState | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  if (champions.length === 0) return null;
  const phase = season.phases[season.phaseIndex];
  const atOffseason = season.status === "complete";
  const atTransfer =
    season.status === "in-progress" &&
    phase?.kind === "transfer" &&
    phase.status === "in-progress";
  if (!atOffseason && !atTransfer) return null;

  const team = season.teams.find((t) => t.id === me);
  if (!team) return null;
  const slot = team.players.findIndex((p) => p.lane === lane);
  if (slot < 0) return null;
  const incumbent = team.players[slot]!;
  if (!isRosterVacancy(incumbent)) return null;

  const taken = new Set<string>(season.franchise.usedNames ?? []);
  for (const t of season.teams) {
    for (const p of t.players) if (p.name) taken.add(p.name);
    if (t.coach?.name) taken.add(t.coach.name);
  }
  for (const e of season.franchise.inactivePool ?? []) {
    if (e.player.name) taken.add(e.player.name);
  }

  const year = season.franchise.year;
  const entrant = makeRookie(lane, champions, rng, taken, team.leagueId);
  entrant.debutYear = year;
  if (entrant.name) taken.add(entrant.name);

  let pool = [...(season.franchise.inactivePool ?? [])];
  let source: "academy" | "rookie" = "academy";
  let marketNote: RosterNewsEvent["marketNote"] = "academy-rookie";
  if (teamAcademyHasRoom(pool, me)) {
    const parked = executeAddAcademyRookie(pool, me, team.name, entrant, year);
    if (parked.ok) {
      // Academy-first: mint then immediately call up into the vacancy.
      pool = parked.inactivePool.filter((e) => e.player.id !== entrant.id);
    } else {
      source = "rookie";
      marketNote = "rookie-gate";
    }
  } else {
    source = "rookie";
    marketNote = "rookie-gate";
  }

  const players = [...team.players];
  players[slot] = entrant;

  const news: RosterNewsEvent & { teamId: string } = {
    teamId: me,
    lane,
    entrantName: entrant.name ?? "",
    entrantTier: entrant.tier,
    entrantPotential: entrant.potential ?? entrant.tier,
    ...(entrant.id ? { entrantId: entrant.id } : {}),
    entrantSource: source,
    marketNote,
    timeMark: rosterTimeMarkForSeason(season),
  };

  const sameWindowRookieIds = entrant.id
    ? [...(season.franchise.sameWindowRookieIds ?? []), entrant.id]
    : (season.franchise.sameWindowRookieIds ?? []);

  return {
    ...season,
    teams: season.teams.map((t) => (t.id === me ? { ...t, players } : t)),
    franchise: {
      ...season.franchise,
      inactivePool: pool,
      usedNames: [...taken],
      sameWindowRookieIds,
    },
    rosterNews: [...(season.rosterNews ?? []), news],
    updatedAt: Date.now(),
  };
}

/**
 * Best followed-team lane where a scored FA / same-org academy beats the
 * incumbent by the open-market gap (FA uses {@link FA_OPEN_REPLACE_GAP};
 * academy uses the looser {@link ACADEMY_OPEN_REPLACE_GAP}).
 * Same-window demotees are excluded from the upgrade pool.
 * Same-window rookies cannot be benched (mirrors applyUserManualDemote).
 */
function pickBestAiDemoteLane(
  season: SeasonState,
  champions: readonly Champion[],
  rng: RNG,
): Lane | null {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return null;
  const team = season.teams.find((t) => t.id === me);
  if (!team) return null;

  const byId = new Map(champions.map((c) => [c.id, c]));
  const meta = season.currentMeta;
  const exclude = new Set(season.franchise.sameWindowDemoteIds ?? []);
  const sameWindowRookies = new Set(season.franchise.sameWindowRookieIds ?? []);
  const pool = [...(season.franchise.inactivePool ?? [])];
  const grades = teamSeasonGrades(season, me).avg;

  let best: { lane: Lane; upgrade: number } | null = null;
  for (const lane of LANE_ORDER) {
    const slot = team.players.findIndex((p) => p.lane === lane);
    if (slot < 0) continue;
    const incumbent = team.players[slot]!;
    if (isRosterVacancy(incumbent) || !incumbent.id) continue;
    if (sameWindowRookies.has(incumbent.id)) continue;

    const pick = pickScoredReturnee(pool, lane, me, byId, meta, rng, exclude);
    if (!pick) continue;
    const upgrade =
      inactiveTransferValue(pick.entry, byId, meta) -
      transferValue(incumbent, grades[slot] ?? null, byId, meta);
    const needGap =
      pick.entry.status === "academy" ? ACADEMY_OPEN_REPLACE_GAP : FA_OPEN_REPLACE_GAP;
    if (upgrade < needGap) continue;
    if (!best || upgrade > best.upgrade) best = { lane, upgrade };
  }
  return best?.lane ?? null;
}

/**
 * "Let AI decide" roster reshape for the followed team: voluntarily bench up to
 * USER_MAX_MANUAL_DEMOTES weak lanes when a clear FA/academy upgrade exists
 * (FA/academy open-replace gaps), then AI-fill vacancies (excluding same-window demotees).
 * Does not run deferred mid-split underperformance demotions — those stay on Proceed.
 * Manual FA shopping is unchanged; this is opt-in via AI decide only.
 */
export function aiDecideFollowedDemotes(
  season: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  if (!season.franchise?.aging || !season.config.controlledTeamId) return season;
  if (champions.length === 0) return season;

  let s = fillFollowedRosterVacancies(season, champions, rng);
  // Greedy: demote one justified lane, claim the upgrade via fill, repeat.
  for (;;) {
    const used = s.franchise?.manualDemotesThisWindow ?? 0;
    if (used >= USER_MAX_MANUAL_DEMOTES) break;
    const lane = pickBestAiDemoteLane(s, champions, rng);
    if (!lane) break;
    const demoted = applyUserManualDemote(s, lane, { marketNote: "ai-demote" });
    if (!demoted) break;
    s = fillFollowedRosterVacancies(demoted, champions, rng);
  }
  return s;
}

/**
 * AI-fill any manual-demote vacancy placeholders on the followed team
 * (academy/FA scored pick, else academy-first mint+call-up). Same-window
 * demotees stay excluded. Clears vacancy stubs before mid-split demotions /
 * year-end lifecycle. Main-roster `rookie-gate` only when academy is full.
 */
export function fillFollowedRosterVacancies(
  season: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return season;
  const team = season.teams.find((t) => t.id === me);
  if (!team) return season;

  const vacantIdx = team.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isRosterVacancy(p));
  if (vacantIdx.length === 0) return season;

  const exclude = new Set(season.franchise.sameWindowDemoteIds ?? []);
  const byId = new Map(champions.map((c) => [c.id, c]));
  const meta = season.currentMeta;
  const year = season.franchise.year;
  let pool = [...(season.franchise.inactivePool ?? [])];
  const taken = new Set<string>(season.franchise.usedNames ?? []);
  for (const t of season.teams) {
    for (const p of t.players) if (p.name) taken.add(p.name);
    if (t.coach?.name) taken.add(t.coach.name);
  }
  for (const e of pool) {
    if (e.player.name) taken.add(e.player.name);
  }

  const players = [...team.players];
  const news: Array<RosterNewsEvent & { teamId: string }> = [];
  const sameWindowRookieIds = [...(season.franchise.sameWindowRookieIds ?? [])];

  for (const { p, i } of vacantIdx) {
    const lane = p.lane;
    const pick = pickScoredReturnee(pool, lane, me, byId, meta, rng, exclude);
    let entrant: Player;
    let source: "rookie" | "academy" | "free-agent";
    let passedAcademyName: string | undefined;
    let marketNote: RosterNewsEvent["marketNote"];
    if (pick) {
      const [takenEntry] = pool.splice(pick.idx, 1);
      entrant = applyComebackRust(
        takenEntry!.player,
        takenEntry!.inactiveYears,
        team.leagueId,
      );
      source = takenEntry!.status === "academy" ? "academy" : "free-agent";
      passedAcademyName = pick.passedAcademyName;
      marketNote = pick.marketNote;
      if (entrant.name) taken.add(entrant.name);
    } else {
      entrant = makeRookie(lane, champions, rng, taken, team.leagueId);
      entrant.debutYear = year;
      if (teamAcademyHasRoom(pool, me)) {
        const parked = executeAddAcademyRookie(pool, me, team.name, entrant, year);
        if (parked.ok) {
          pool = parked.inactivePool.filter((e) => e.player.id !== entrant.id);
          source = "academy";
          marketNote = "academy-rookie";
        } else {
          source = "rookie";
          marketNote = "rookie-gate";
        }
      } else {
        source = "rookie";
        marketNote = "rookie-gate";
      }
      if (entrant.id) sameWindowRookieIds.push(entrant.id);
    }
    players[i] = entrant;
    news.push({
      teamId: me,
      lane,
      entrantName: entrant.name ?? "",
      entrantTier: entrant.tier,
      entrantPotential: entrant.potential ?? entrant.tier,
      ...(entrant.id ? { entrantId: entrant.id } : {}),
      entrantSource: source,
      ...(passedAcademyName ? { passedAcademyName } : {}),
      ...(marketNote ? { marketNote } : {}),
    });
  }

  const usedNames = new Set(taken);
  for (const p of players) if (p.name) usedNames.add(p.name);

  return {
    ...season,
    teams: season.teams.map((t) => (t.id === me ? { ...t, players } : t)),
    franchise: {
      ...season.franchise,
      inactivePool: pool,
      usedNames: [...usedNames],
      sameWindowRookieIds,
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}
