// Franchise / "reality" mode — a continuous timeline where the SAME teams
// (names, logos, rosters, careers) carry across many seasons. Each year is a
// normal SeasonState; between years an OFFSEASON ages every player (growth,
// decline, retirement, rookies — driven by last year's performance) and drifts
// pools, then a fresh season begins with the evolved squads. Cross-year records
// accumulate in the Hall by stable player id.

import type { Champion } from "../types";
import { type RNG } from "../players";
import { driftSynergiesOverTime, assignSynergies, CHEM_PRESEASON_STEP } from "../chemistry";
import { createSeason } from "./engine";
import { buildSeasonHistoryEntry } from "./history";
import { teamSeasonGrades } from "./stats";
import { offseasonEvolveRoster, seedRosterCareers, type RookieDebut } from "./playerLifecycle";
import { offseasonTransferPass } from "./transfers";
import { reassignCoaches } from "./coach";
import { assignRoleElites } from "./teamGen";
import { applyPoolDrift } from "./poolDrift";
import type { SeasonState, SeasonTeam } from "./types";

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
  const rosterNews: NonNullable<SeasonState["rosterNews"]> = [];
  if (aging) {
    const taken = new Set<string>(); // keep rookie handles unique vs. active players & coaches
    for (const t of prev.teams) {
      for (const p of t.players) if (p.name) taken.add(p.name);
      if (t.coach?.name) taken.add(t.coach.name);
    }
    evolvedTeams = prev.teams.map((t) => {
      const debuts: RookieDebut[] = [];
      const players = offseasonEvolveRoster(t.players, gradesOf(t.id), champions, rng, taken, debuts);
      for (const d of debuts) rosterNews.push({ teamId: t.id, ...d });
      return { ...t, players };
    });
  }

  // A year passes: imports settle further toward their new region (the language
  // barrier fades), any rookie without a home region is native here, and the
  // duos that stayed together all year build familiarity (chemistry eases up
  // toward the time-together ceiling — see driftSynergiesOverTime). This runs
  // BEFORE the offseason transfer window, so it rewards last year's pairings;
  // duos broken up by transfers, and brand-new ones, are handled when the next
  // season's rosters enter play.
  evolvedTeams = evolvedTeams.map((t) => {
    const players = t.players.map((p) => {
      if (!p.homeRegion) return { ...p, homeRegion: t.leagueId, acclimation: 1 };
      const acc = p.acclimation ?? 1;
      return acc < 1 ? { ...p, acclimation: Math.min(1, acc + 0.34) } : p;
    });
    // Roll innate chemistry for any new pairs into the persistent roster before
    // time-drifting (otherwise drift skips them and they never get an innate
    // roll persisted here).
    return { ...t, players: driftSynergiesOverTime(assignSynergies(players, t.name)) };
  });

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
  // The auto offseason market only runs when transfers are enabled — otherwise
  // rosters stay put (matching the in-season applyTransfers guard).
  let offseasonMoves = [...userMoves];
  if (prev.config.playerTransfers) {
    const { teams: shuffledTeams, moves: autoMoves } = offseasonTransferPass(
      evolvedTeams,
      (teamId, li) => gradesOf(teamId)[li] ?? null,
      byId,
      prev.currentMeta,
      prev.config.controlledTeamId,
      (teamId, li) => movedKey.has(`${teamId}:${LANES[li]}`),
      userMoves, // seed per-team caps with the user's own offseason signings
    );
    evolvedTeams = shuffledTeams;
    offseasonMoves = [...userMoves, ...autoMoves];
  }

  // Coaches change teams in the offseason too (better coaches → stronger
  // teams) — but never the user's: they hire their own coach in the market.
  evolvedTeams = reassignCoaches(evolvedTeams, rng, 5, prev.config.controlledTeamId ?? undefined);

  // Preseason bootcamp on the FINAL assembled rosters: roll any new pairs the
  // offseason window created, then a big one-shot familiarity step so a rebuilt
  // lineup doesn't start the year cold. Runs AFTER all roster movement (so it
  // catches the new duos) and only in the offseason — in-season swaps stay
  // disruptive. Pairs already at the ceiling are untouched.
  evolvedTeams = evolvedTeams.map((t) => ({
    ...t,
    players: driftSynergiesOverTime(assignSynergies(t.players, t.name), CHEM_PRESEASON_STEP),
  }));

  // Refresh the S+ elite for the new year: re-rank every role's S-caliber field
  // and reassign the "top 5 per role" (incumbents keep a half-star edge), so
  // risers earn it and faded vets drop back to S.
  evolvedTeams = assignRoleElites(evolvedTeams);

  // Freeze THIS year's FULL post-Worlds offseason (user + auto moves) into the
  // permanent history entry — even though the live "worlds" display only carries
  // the latest offseason forward and resets every year (see resolveMatch's
  // completion clear). Without this the auto moves, which only ever live in next
  // year's transient display, would never reach history.
  const prevForHistory =
    offseasonMoves.length > 0
      ? { ...prev, transfersByEvent: { ...prev.transfersByEvent, worlds: offseasonMoves } }
      : prev;
  const prior =
    prev.status === "complete" ? buildSeasonHistoryEntry(prevForHistory, Date.now()) : undefined;
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

  // Reward roster continuity across the offseason: count how many players each
  // team kept from last year (by id) and seed a starting-season form bonus.
  // Only when form is tracked (createSeason left teamForm = {} then).
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
    // Keep createSeason's id — its tournaments carry it as seasonId, and the
    // store gates updates on season.id === tournament.seasonId. Overriding it
    // here silently broke the new year's simulation.
    name: `${franchise.name} — Year ${year}`,
    // leagueStrength is intentionally NOT overridden here: createSeason already
    // seeds next.leagueStrength from the prior season's tides DECAYED toward
    // neutral (regionStrengthSeed), so a region's reputation fades over a couple
    // of years instead of carrying the raw value forward forever.
    franchise,
    // Surface the offseason window's moves in the new year's transfer recap.
    ...(offseasonMoves.length > 0
      ? { transfersByEvent: { ...next.transfersByEvent, worlds: offseasonMoves } }
      : {}),
    // This year's retirements + rookie debuts, for the start-of-year roster news.
    ...(rosterNews.length > 0 ? { rosterNews } : {}),
  };
}
