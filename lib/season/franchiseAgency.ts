// Season-level player-agency orchestration (transfer windows + offseason).
// Core scoring lives in playerAgency.ts; this wires demands into SeasonState.

import type { Champion } from "../types";
import type { RNG } from "../players";
import {
  executeUserAcademyRecall,
  addToTeamAcademy,
  makeBecameFaNews,
  isRosterVacancy,
  makeVacancyPlaceholder,
  releaseAcademyToFa,
  teamAcademyHasRoom,
  type MarketInactive,
} from "./faMarket";
import {
  generateAgencyDemands,
  honorDemand,
  overrideDemand,
  expirePendingDemands,
  formatAgencyWants,
  userFacingAgencyDemands,
  type AgencyDemand,
} from "./playerAgency";
import {
  ACADEMY_YEARS,
  withRosterTimeMark,
  type RosterNewsEvent,
} from "./playerLifecycle";
import { teamSeasonGrades } from "./stats";
import type { SeasonState } from "./types";
import {
  fillFollowedRosterVacancies,
  fillRosterVacancies,
  rosterTimeMarkForSeason,
} from "./franchise";

export {
  formatAgencyWants,
  userFacingAgencyDemands,
  type AgencyDemand,
};

function agencyTeamInputs(season: SeasonState) {
  return season.teams.map((t) => ({
    id: t.id,
    name: t.name,
    players: t.players,
    leagueId: t.leagueId,
  }));
}

function agencyGradeOf(season: SeasonState): (playerId: string) => number | null {
  const cache = new Map<string, number | null>();
  return (pid: string) => {
    if (cache.has(pid)) return cache.get(pid)!;
    for (const t of season.teams) {
      const idx = t.players.findIndex((p) => p.id === pid);
      if (idx >= 0) {
        const g = teamSeasonGrades(season, t.id).avg[idx] ?? null;
        cache.set(pid, g);
        return g;
      }
    }
    cache.set(pid, null);
    return null;
  };
}

type VacatedSlot = {
  teamId: string;
  lane: AgencyDemand["lane"];
  departedName?: string;
  departedTier: AgencyDemand["playerTier"];
  departedAge?: number;
  departedId: string;
};

/**
 * Walk a starter to FA and open a vacancy placeholder. Does not emit news —
 * callers decide whether to leave the slot open (followed-team shop) or fill
 * immediately (AI orgs must never keep `__vacancy__*` on the main roster).
 */
function agencyWalkToFa(
  season: SeasonState,
  demand: AgencyDemand,
): { season: SeasonState; vacated: VacatedSlot } | null {
  const team = season.teams.find((t) => t.id === demand.fromTeamId);
  if (!team || !season.franchise) return null;
  const slot = team.players.findIndex((p) => p.id === demand.playerId);
  if (slot < 0) return null;
  const player = team.players[slot]!;
  if (isRosterVacancy(player) || !player.id) return null;
  const year = season.franchise.year;
  const grade = teamSeasonGrades(season, team.id).avg[slot] ?? null;
  const faEntry: MarketInactive = {
    player: { ...player, badStreak: 0 },
    status: "free-agent",
    inactiveYears: ACADEMY_YEARS + 1,
    demotedYear: year,
    clockYear: year,
    lastTeamId: team.id,
    lastTeamName: team.name,
    ...(grade != null ? { lastActiveGrade: grade, shadowGrade: grade } : {}),
  };
  const players = [...team.players];
  players[slot] = makeVacancyPlaceholder(demand.lane);
  const vacated: VacatedSlot = {
    teamId: team.id,
    lane: demand.lane,
    ...(player.name ? { departedName: player.name } : {}),
    departedTier: player.tier,
    ...(player.age != null ? { departedAge: player.age } : {}),
    departedId: player.id,
  };
  return {
    season: {
      ...season,
      teams: season.teams.map((t) => (t.id === team.id ? { ...t, players } : t)),
      franchise: {
        ...season.franchise,
        inactivePool: [...(season.franchise.inactivePool ?? []), faEntry],
        sameWindowDemoteIds: [
          ...(season.franchise.sameWindowDemoteIds ?? []),
          demand.playerId,
        ],
      },
      updatedAt: Date.now(),
    },
    vacated,
  };
}

function agencyLeaveNews(
  vacated: VacatedSlot,
  demand: AgencyDemand,
): RosterNewsEvent & { teamId: string } {
  return {
    teamId: vacated.teamId,
    lane: vacated.lane,
    ...(vacated.departedName ? { departedName: vacated.departedName } : {}),
    departedTier: vacated.departedTier,
    ...(vacated.departedAge != null ? { departedAge: vacated.departedAge } : {}),
    departedId: vacated.departedId,
    entrantName: "",
    entrantTier: vacated.departedTier,
    entrantPotential: vacated.departedTier,
    entrantSource: "free-agent",
    marketNote: "agency-leave",
    ...(demand.wantTeamName ? { beatenNames: [demand.wantTeamName] } : {}),
  };
}

function agencyHonorCallUp(
  season: SeasonState,
  champions: readonly Champion[],
  demand: AgencyDemand,
): SeasonState | null {
  if (!season.franchise) return null;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const result = executeUserAcademyRecall(
    agencyTeamInputs(season),
    season.franchise.inactivePool ?? [],
    demand.fromTeamId,
    demand.lane,
    demand.playerId,
    byId,
    season.currentMeta,
    season.franchise.year,
    agencyGradeOf(season),
    { requireGap: false },
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
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(
        result.news.map((n) => ({ ...n, marketNote: "agency-callup" as const })),
        rosterTimeMarkForSeason(season),
      ),
    ],
    updatedAt: Date.now(),
  };
}

function agencyHonorDepart(
  season: SeasonState,
  demand: AgencyDemand,
): SeasonState | null {
  if (!season.franchise) return null;
  const year = season.franchise.year;
  let pool = [...(season.franchise.inactivePool ?? [])];
  const news: Array<RosterNewsEvent & { teamId: string }> = [];

  if (demand.wantTeamId && demand.wantRole === "academy") {
    const idx = pool.findIndex(
      (e) =>
        e.status === "academy" &&
        e.lastTeamId === demand.fromTeamId &&
        e.player.id === demand.playerId,
    );
    if (idx >= 0) {
      const entry = pool[idx]!;
      const dest = season.teams.find((t) => t.id === demand.wantTeamId);
      if (dest && teamAcademyHasRoom(pool, dest.id)) {
        pool.splice(idx, 1);
        pool = addToTeamAcademy(pool, {
          ...entry,
          status: "academy",
          inactiveYears: 1,
          clockYear: year,
          lastTeamId: dest.id,
          lastTeamName: dest.name,
        }).pool;
        news.push({
          teamId: dest.id,
          lane: demand.lane,
          entrantName: entry.player.name ?? "",
          entrantTier: entry.player.tier,
          entrantPotential: entry.player.potential ?? entry.player.tier,
          ...(entry.player.id ? { entrantId: entry.player.id } : {}),
          entrantSource: "academy",
          marketNote: "agency-depart",
          ...(demand.fromTeamName ? { beatenNames: [demand.fromTeamName] } : {}),
        });
        return {
          ...season,
          franchise: { ...season.franchise, inactivePool: pool },
          rosterNews: [
            ...(season.rosterNews ?? []),
            ...withRosterTimeMark(news, rosterTimeMarkForSeason(season)),
          ],
          updatedAt: Date.now(),
        };
      }
    }
  }

  const released = releaseAcademyToFa(
    pool,
    demand.fromTeamId,
    demand.playerId,
    year,
  );
  if (!released.released) return null;
  news.push({
    ...makeBecameFaNews(released.released, "academy-release"),
    marketNote: "agency-depart",
  });
  return {
    ...season,
    franchise: { ...season.franchise, inactivePool: released.pool },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark(news, rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

/** Apply one pending demand (AI auto-resolve or user Honor / Let go). */
export function honorAgencyDemand(
  season: SeasonState,
  champions: readonly Champion[],
  demandId: string,
  rng: RNG = Math.random,
): SeasonState | null {
  if (!season.franchise?.aging) return null;
  const demand = season.franchise.agencyDemands?.find(
    (d) => d.id === demandId && d.status === "pending",
  );
  if (!demand) return null;

  let next: SeasonState | null = null;
  if (demand.kind === "leave") {
    const walked = agencyWalkToFa(season, demand);
    if (!walked) return null;
    const controlled = season.config.controlledTeamId;
    const userShopping = !!controlled && demand.fromTeamId === controlled;
    if (userShopping) {
      // Followed-team shop: leave vacancy open for FA / academy / AI decide.
      next = {
        ...walked.season,
        rosterNews: [
          ...(walked.season.rosterNews ?? []),
          ...withRosterTimeMark(
            [agencyLeaveNews(walked.vacated, demand)],
            rosterTimeMarkForSeason(season),
          ),
        ],
      };
    } else {
      // AI org: fill immediately — never keep `__vacancy__*` on main roster.
      const departedBySlot = new Map([
        [
          `${walked.vacated.teamId}:${walked.vacated.lane}`,
          {
            ...(walked.vacated.departedName
              ? { departedName: walked.vacated.departedName }
              : {}),
            departedTier: walked.vacated.departedTier,
            ...(walked.vacated.departedAge != null
              ? { departedAge: walked.vacated.departedAge }
              : {}),
            departedId: walked.vacated.departedId,
          },
        ],
      ]);
      next = fillRosterVacancies(walked.season, champions, rng, {
        teamIds: new Set([walked.vacated.teamId]),
        departedBySlot,
      });
    }
  } else if (demand.kind === "call-up") {
    next = agencyHonorCallUp(season, champions, demand);
  } else if (demand.kind === "depart-academy") {
    next = agencyHonorDepart(season, demand);
  }
  if (!next?.franchise) return null;
  return {
    ...next,
    franchise: {
      ...next.franchise,
      agencyDemands: honorDemand(next.franchise.agencyDemands ?? [], demandId),
    },
  };
}

/** User override — player stays; emit agency-override news. */
export function overrideAgencyDemand(
  season: SeasonState,
  demandId: string,
): SeasonState | null {
  if (!season.franchise?.aging) return null;
  const demand = season.franchise.agencyDemands?.find(
    (d) => d.id === demandId && d.status === "pending",
  );
  if (!demand) return null;
  const news: RosterNewsEvent & { teamId: string } = {
    teamId: demand.fromTeamId,
    lane: demand.lane,
    ...(demand.playerName ? { departedName: demand.playerName } : {}),
    departedTier: demand.playerTier,
    ...(demand.playerId ? { departedId: demand.playerId } : {}),
    entrantName: demand.playerName ?? "",
    entrantTier: demand.playerTier,
    entrantPotential: demand.playerTier,
    ...(demand.playerId ? { entrantId: demand.playerId } : {}),
    entrantSource: demand.kind === "leave" ? "free-agent" : "academy",
    marketNote: "agency-override",
    ...(demand.wantTeamName ? { beatenNames: [demand.wantTeamName] } : {}),
  };
  return {
    ...season,
    franchise: {
      ...season.franchise,
      agencyDemands: overrideDemand(season.franchise.agencyDemands ?? [], demandId),
    },
    rosterNews: [
      ...(season.rosterNews ?? []),
      ...withRosterTimeMark([news], rosterTimeMarkForSeason(season)),
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Seed agency demands for a shopping window. Auto-honors non-followed-org
 * demands (AI competition). Followed-org demands stay pending for UI.
 * AI leaves are filled atomically — no `__vacancy__*` stubs left on rosters.
 */
export function seedAgencyWindow(
  season: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
  window: "transfer" | "offseason" = "transfer",
): SeasonState {
  if (!season.franchise?.aging || champions.length === 0) return season;
  const byId = new Map(champions.map((c) => [c.id, c]));
  const controlled = season.config.controlledTeamId ?? null;
  const demands = generateAgencyDemands(
    agencyTeamInputs(season),
    season.franchise.inactivePool ?? [],
    byId,
    season.currentMeta,
    rng,
    {
      window,
      controlledTeamId: controlled,
      gradeOf: agencyGradeOf(season),
    },
  );

  let next: SeasonState = {
    ...season,
    franchise: {
      ...season.franchise,
      agencyDemands: demands,
    },
    updatedAt: Date.now(),
  };

  for (const d of demands) {
    if (d.status !== "pending") continue;
    if (controlled && d.fromTeamId === controlled) continue;
    const honored = honorAgencyDemand(next, champions, d.id, rng);
    if (honored) next = honored;
  }

  // Safety net: scrub any vacancy stubs on AI (and uncontrolled) rosters.
  next = fillRosterVacancies(next, champions, rng, {
    ...(controlled ? { skipTeamIds: new Set([controlled]) } : {}),
  });

  return next;
}

/** Expire pending demands when a shopping window closes. */
export function clearAgencyWindow(season: SeasonState): SeasonState {
  if (!season.franchise?.agencyDemands?.length) return season;
  return {
    ...season,
    franchise: {
      ...season.franchise,
      agencyDemands: expirePendingDemands(season.franchise.agencyDemands),
    },
  };
}

/** AI-decide: honor clear followed-team demands, override soft ones, fill. */
export function aiHonorFollowedAgency(
  season: SeasonState,
  champions: readonly Champion[],
): SeasonState {
  const me = season.config.controlledTeamId;
  if (!me || !season.franchise?.aging) return season;
  let next = season;
  for (const d of season.franchise.agencyDemands ?? []) {
    if (d.status !== "pending" || d.fromTeamId !== me) continue;
    if (d.kind === "call-up" || d.preferenceGap >= 1.0) {
      const honored = honorAgencyDemand(next, champions, d.id);
      if (honored) next = honored;
    } else {
      const overruled = overrideAgencyDemand(next, d.id);
      if (overruled) next = overruled;
    }
  }
  return fillFollowedRosterVacancies(next, champions);
}
