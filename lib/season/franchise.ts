// Franchise / "reality" mode — a continuous timeline where the SAME teams
// (names, logos, rosters, careers) carry across many seasons. Each year is a
// normal SeasonState; between years an OFFSEASON ages every player (growth,
// decline, retirement, rookies — driven by last year's performance) and drifts
// pools, then a fresh season begins with the evolved squads. Cross-year records
// accumulate in the Hall by stable player id.

import type { Champion } from "../types";
import { type RNG } from "../players";
import { createSeason } from "./engine";
import { buildSeasonHistoryEntry } from "./history";
import { teamSeasonGrades } from "./stats";
import { offseasonEvolveRoster, seedRosterCareers } from "./playerLifecycle";
import { offseasonTransferPass } from "./transfers";
import { reassignCoaches } from "./coach";
import { applyPoolDrift } from "./poolDrift";
import type { SeasonState, SeasonTeam } from "./types";

function makeRealityId(rng: RNG): string {
  return `reality-${Math.floor(rng() * 1e9).toString(36)}`;
}

/** Turn a freshly-created season into Year 1 of a reality: stamp every player
 *  with an age + potential and attach the franchise context. */
export function seedFranchise(
  season: SeasonState,
  name: string,
  aging: boolean,
  rng: RNG = Math.random,
): SeasonState {
  // Ages/potentials are only meaningful when aging is on; still stamp them so
  // the roster browser can show them and aging could be toggled later.
  const teams: SeasonTeam[] = season.teams.map((t) => ({
    ...t,
    players: seedRosterCareers(t.players, rng),
  }));
  const fname = name.trim() || "My Reality";
  return {
    ...season,
    name: `${fname} — Year 1`,
    teams,
    franchise: { id: makeRealityId(rng), name: fname, year: 1, aging },
  };
}

/** Roll a COMPLETED season into the next year. Ages every roster (perf-driven
 *  growth/decline, retirements → rookies), drifts pools, carries the same
 *  teams + meta + region tides forward, and starts a fresh Winter. The prior
 *  season should be archived to the reality's history by the caller. */
export function startNextSeason(
  prev: SeasonState,
  champions: readonly Champion[],
  rng: RNG = Math.random,
): SeasonState {
  // Last season's per-lane grades (incl. Worlds) drive both aging and the
  // offseason market; cache per team.
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
  // Aging on → age every roster (perf-driven growth/decline, retirees → rookies).
  // Aging off → carry the same players forward untouched.
  let evolvedTeams: SeasonTeam[] = prev.teams;
  if (aging) {
    const taken = new Set<string>(); // keep rookie handles unique vs. active players & coaches
    for (const t of prev.teams) {
      for (const p of t.players) if (p.name) taken.add(p.name);
      if (t.coach?.name) taken.add(t.coach.name);
    }
    evolvedTeams = prev.teams.map((t) => ({
      ...t,
      players: offseasonEvolveRoster(t.players, gradesOf(t.id), champions, rng, taken),
    }));
  }

  // A year passes: imports settle further toward their new region (the language
  // barrier fades), and any rookie without a home region is native here.
  evolvedTeams = evolvedTeams.map((t) => ({
    ...t,
    players: t.players.map((p) => {
      if (!p.homeRegion) return { ...p, homeRegion: t.leagueId, acclimation: 1 };
      const acc = p.acclimation ?? 1;
      return acc < 1 ? { ...p, acclimation: Math.min(1, acc + 0.34) } : p;
    }),
  }));

  // The post-Worlds OFFSEASON transfer window — the biggest of the year. Auto
  // roster movement across every region, weighted by last season's performance.
  // The followed team's OWN offseason moves were already applied interactively
  // (recorded under "worlds"); the auto market skips it and any lane already
  // transacted, then we merge the user's moves into the recap.
  const byId = new Map(champions.map((c) => [c.id, c]));
  const userMoves = prev.transfersByEvent?.worlds ?? [];
  const movedKey = new Set<string>();
  for (const m of userMoves) {
    movedKey.add(`${m.fromTeamId}:${m.lane}`);
    movedKey.add(`${m.toTeamId}:${m.lane}`);
  }
  const LANES = ["top", "jungle", "middle", "bottom", "support"] as const;
  const { teams: shuffledTeams, moves: autoMoves } = offseasonTransferPass(
    evolvedTeams,
    (teamId, li) => gradesOf(teamId)[li] ?? null,
    byId,
    prev.currentMeta,
    prev.config.controlledTeamId,
    (teamId, li) => movedKey.has(`${teamId}:${LANES[li]}`),
  );
  evolvedTeams = shuffledTeams;
  const offseasonMoves = [...userMoves, ...autoMoves];

  // Coaches change teams in the offseason too (better coaches → stronger
  // teams) — but never the user's: they hire their own coach in the market.
  evolvedTeams = reassignCoaches(evolvedTeams, rng, 5, prev.config.controlledTeamId ?? undefined);

  const prior =
    prev.status === "complete" ? buildSeasonHistoryEntry(prev, Date.now()) : undefined;
  const year = (prev.franchise?.year ?? 1) + 1;
  const franchise = {
    id: prev.franchise?.id ?? makeRealityId(rng),
    name: prev.franchise?.name ?? "My Reality",
    year,
    aging,
  };

  let next = createSeason({
    config: prev.config,
    teams: evolvedTeams,
    activeMeta: prev.currentMeta, // carry the meta the year ended on
    priorSeason: prior,
  });
  // Pools keep creeping with the meta when development is on.
  if (next.config.playerDevelopment) next = applyPoolDrift(next, champions, rng);
  return {
    ...next,
    // Keep createSeason's id — its tournaments carry it as seasonId, and the
    // store gates updates on season.id === tournament.seasonId. Overriding it
    // here silently broke the new year's simulation.
    name: `${franchise.name} — Year ${year}`,
    leagueStrength: prev.leagueStrength ?? next.leagueStrength,
    franchise,
    // Surface the offseason window's moves in the new year's transfer recap.
    ...(offseasonMoves.length > 0
      ? { transfersByEvent: { ...next.transfersByEvent, worlds: offseasonMoves } }
      : {}),
  };
}
