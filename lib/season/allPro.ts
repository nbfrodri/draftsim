// All-Pro team selections for a season — pure aggregations over the season's
// tournaments. Three flavours, all built on the existing per-tournament award
// machinery (computeStageStats(...).allPro = best player per lane in a stage):
//
//   • split-league  — each league's 5-player All-Pro team for one split (the
//                     domestic split tournament's all-pro, e.g. "LCK Summer").
//   • split-global  — one cross-region 5-player team per split (best in the
//                     world that split), taken as the best per lane across all
//                     leagues' split-league picks.
//   • season-global — the All-Pro Team of the Year: best per lane across EVERY
//                     game of the season, by season-long average rating.
//
// Team identity is left as a raw teamId here; history.ts freezes it into a
// SeasonHistoryTeamRef at archive time (it owns the team-ref machinery).

import { LANE_ORDER } from "../players";
import type { Lane } from "../types";
import { computeStageStats, computePlayerSeasonLines } from "./stats";
import type { SeasonState, SplitId, LeagueId } from "./types";

const LANES = LANE_ORDER as readonly Lane[];

/** Min rated games for the season-of-the-year team (a full-season sample). */
const SEASON_ALLPRO_MIN_GAMES = 8;

export type AllProScope = "season-global" | "split-global" | "split-league";

export interface RawAllProMember {
  lane: Lane;
  playerId?: string;
  playerName?: string;
  teamId: string;
  teamName: string;
  avgRating: number;
  games: number;
}

export interface RawAllProTeam {
  scope: AllProScope;
  split?: SplitId;
  leagueId?: LeagueId;
  members: RawAllProMember[]; // lane order, up to 5
}

/** Best-per-lane reducer: keep highest avg rating, ties broken by more games. */
function bestPerLane(members: RawAllProMember[]): RawAllProMember[] {
  const byLane = new Map<Lane, RawAllProMember>();
  for (const m of members) {
    const cur = byLane.get(m.lane);
    if (!cur || m.avgRating > cur.avgRating || (m.avgRating === cur.avgRating && m.games > cur.games)) {
      byLane.set(m.lane, m);
    }
  }
  return LANES.map((l) => byLane.get(l)).filter((m): m is RawAllProMember => !!m);
}

/** Compute every All-Pro team for a season (split per-league, split global,
 *  and the season-of-the-year team), in display order. */
export function computeAllProTeams(season: SeasonState): RawAllProTeam[] {
  const leagueOfTeam = new Map(season.teams.map((t) => [t.id, t.leagueId]));
  const out: RawAllProTeam[] = [];

  // ── Per-split: each league's split tournament → a split-league team ────────
  // Group split-league members by split so we can also derive a split-global
  // team from the same picks.
  const splitMembers = new Map<SplitId, RawAllProMember[]>();
  for (const phase of season.phases) {
    if (phase.kind !== "split" || !phase.split) continue;
    const split = phase.split;
    for (const tid of phase.tournamentIds) {
      const t = season.tournaments[tid];
      if (!t) continue;
      const allPro = computeStageStats(t).allPro;
      if (allPro.length === 0) continue;
      const leagueId = leagueOfTeam.get(allPro[0].teamId) ?? leagueOfTeam.get(t.teams[0]?.id ?? "");
      const members: RawAllProMember[] = allPro.map((ap) => ({
        lane: ap.lane,
        ...(ap.playerId ? { playerId: ap.playerId } : {}),
        ...(ap.playerName ? { playerName: ap.playerName } : {}),
        teamId: ap.teamId,
        teamName: ap.teamName,
        avgRating: ap.avgRating,
        games: ap.gamesPlayed,
      }));
      out.push({ scope: "split-league", split, ...(leagueId ? { leagueId } : {}), members });
      const acc = splitMembers.get(split) ?? [];
      acc.push(...members);
      splitMembers.set(split, acc);
    }
  }

  // ── Per-split global: best per lane across that split's league picks ───────
  for (const [split, members] of splitMembers) {
    const team = bestPerLane(members);
    if (team.length > 0) out.push({ scope: "split-global", split, members: team });
  }

  // ── Season-of-the-year: best per lane across every game of the season ──────
  const lines = computePlayerSeasonLines(season).filter(
    (l) => l.avgRating != null && l.ratingGames >= SEASON_ALLPRO_MIN_GAMES,
  );
  const seasonTeam = bestPerLane(
    lines.map((l) => ({
      lane: l.lane,
      playerId: l.playerId,
      playerName: l.playerName,
      teamId: l.teamId,
      teamName: l.teamName,
      avgRating: l.avgRating ?? 0,
      games: l.ratingGames,
    })),
  );
  if (seasonTeam.length > 0) out.push({ scope: "season-global", members: seasonTeam });

  return out;
}

/** Per-player All-Pro selection counts this season: `split` = number of
 *  domestic league teams; `global` = cross-region split teams; `season` = 1 if they made
 *  the season-of-the-year team. Used to enrich the archived career records. */
export function computeAllProCounts(
  season: SeasonState,
): Map<string, { split: number; global: number; season: number }> {
  const out = new Map<string, { split: number; global: number; season: number }>();
  const ensure = (id: string) => {
    let r = out.get(id);
    if (!r) {
      r = { split: 0, global: 0, season: 0 };
      out.set(id, r);
    }
    return r;
  };
  for (const team of computeAllProTeams(season)) {
    for (const m of team.members) {
      if (!m.playerId) continue;
      if (team.scope === "split-league") ensure(m.playerId).split += 1;
      else if (team.scope === "split-global") ensure(m.playerId).global += 1;
      else if (team.scope === "season-global") ensure(m.playerId).season = 1;
    }
  }
  return out;
}
