"use client";

import type { TournamentTeam } from "@/lib/tournament";
import TeamHoverCard from "@/components/team/TeamHoverCard";
import TeamIcon from "@/components/TeamIcon";
import LeagueIcon from "@/components/LeagueIcon";

/** Snapshot identity; safe inside clickable cards (no nested controls). */
export default function TournamentTeamIdentity({ team, fallback = "Unknown team", seed = true, className = "" }: {
  team?: Pick<TournamentTeam, "name" | "iconKey" | "logoUrl" | "color" | "leagueId"> & Partial<Pick<TournamentTeam, "id" | "players" | "starRating" | "seed">> | null; fallback?: string; seed?: boolean; className?: string;
}) {
  return <TeamHoverCard teamId={team?.id} hint={team ? {
    name: team.name, leagueId: team.leagueId, logoUrl: team.logoUrl, iconKey: team.iconKey, color: team.color,
    players: team.players,
    ...(team.id && team.seed != null ? { tournamentTeam: { ...team, id: team.id } } : {}),
  } : undefined} className={className}>
    <span className="inline-flex min-w-0 items-center gap-1.5">
    {team && <TeamIcon iconKey={team.iconKey ?? "shield"} logoUrl={team.logoUrl} color={team.color} size={16} className="shrink-0" />}
    {seed && team && Number.isInteger(team.seed) && team.seed != null && team.seed > 0 && <span className="shrink-0 text-[9px] tabular-nums text-rift-mutedbright/65" title="Tournament seed">#{team.seed}</span>}
    <span className="min-w-0 truncate">{team?.name ?? fallback}</span>
    {team?.leagueId && <span title={team.leagueId} className="shrink-0"><LeagueIcon league={team.leagueId} size={14} /></span>}
  </span></TeamHoverCard>;
}
