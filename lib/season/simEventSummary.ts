// Compact per-event statistics summary attached to bulk-sim feed years.
// Derived from archived EventRecords (final "all" scope aggregates); never rescans tournaments.

import { LANE_ORDER } from "../players";
import { rankEventPlayers, type EventChampion } from "../eventStats";
import type { Lane } from "../types";
import type { EventRecord } from "./eventHistory";
import type { InternationalId, LeagueId, SplitId } from "./types";

export interface SimEventLeader {
  id: string;
  name: string;
  /** Adjusted rating score, rounded to two decimals. */
  score: number;
  teamName?: string;
  leagueId?: LeagueId;
  /** Team identity and artwork for logos and team cards (absent on older summaries). */
  teamId?: string;
  logoUrl?: string;
}

/** A role with recorded players; no `leader` means nobody qualified yet (Provisional). */
export interface SimEventRoleLine {
  lane: Lane;
  leader?: SimEventLeader;
}

export interface SimEventChampionCount {
  championId: number;
  count: number;
}

export interface SimEventSummary {
  id: string;
  label: string;
  split?: SplitId;
  event?: InternationalId;
  leagueId?: LeagueId;
  games: number;
  roles: SimEventRoleLine[];
  mostPicked?: SimEventChampionCount;
  mostBanned?: SimEventChampionCount;
}

/** Empty `events` means the year has no recorded event statistics (legacy or missing). */
export interface SimYearEventSummary {
  events: SimEventSummary[];
}

function topChampion(
  champions: readonly EventChampion[],
  metric: "picks" | "bans",
): SimEventChampionCount | undefined {
  let best: SimEventChampionCount | undefined;
  for (const c of champions) {
    const count = c[metric] ?? 0;
    if (count <= 0) continue;
    if (!best || count > best.count || (count === best.count && c.championId < best.championId)) {
      best = { championId: c.championId, count };
    }
  }
  return best;
}

function summarizeRecord(record: EventRecord): SimEventSummary | null {
  const stats = record.scopes?.find((s) => s.id === "all")?.stats;
  if (!stats || !Array.isArray(stats.players)) return null;
  const roles: SimEventRoleLine[] = [];
  for (const lane of LANE_ORDER) {
    const ranked = rankEventPlayers(stats.players, lane);
    if (ranked.length === 0) continue;
    const top = ranked[0]!;
    if (!top.qualified || top.score === null) {
      roles.push({ lane });
      continue;
    }
    const team = top.teams[top.teams.length - 1];
    roles.push({
      lane,
      leader: {
        id: top.playerId,
        name: top.name,
        score: Math.round(top.score * 100) / 100,
        ...(team ? { teamName: team.name, teamId: team.id, ...(team.leagueId ? { leagueId: team.leagueId } : {}), ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}) } : {}),
      },
    });
  }
  const champions = Array.isArray(stats.champions) ? stats.champions : [];
  const mostPicked = topChampion(champions, "picks");
  const mostBanned = topChampion(champions, "bans");
  return {
    id: record.id,
    label: record.label,
    ...(record.split ? { split: record.split } : {}),
    ...(record.event ? { event: record.event } : {}),
    ...(record.leagueId ? { leagueId: record.leagueId } : {}),
    games: stats.games,
    roles,
    ...(mostPicked ? { mostPicked } : {}),
    ...(mostBanned ? { mostBanned } : {}),
  };
}

export function buildYearEventSummary(records: readonly EventRecord[] | undefined): SimYearEventSummary {
  const events: SimEventSummary[] = [];
  for (const record of records ?? []) {
    const summary = summarizeRecord(record);
    if (summary) events.push(summary);
  }
  return { events };
}
