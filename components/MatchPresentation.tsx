"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { participantAliases, type MatchPresentation } from "@/lib/matchPresentation";
import type { Lane, Side } from "@/lib/types";
import TeamNameLink from "./team/TeamNameLink";
import LaneIcon from "./LaneIcon";
import PlayerNameLink from "./player/PlayerNameLink";

const Context = createContext<MatchPresentation | null>(null);
export const MatchPresentationProvider = Context.Provider;
export function MatchTeamMark({ side, name = false }: { side: Side; name?: boolean }) {
  const ctx = useContext(Context);
  const team = ctx?.teams[side];
  return <span className="inline-flex items-center gap-1 min-w-0 align-middle text-rift-mutedbright" title={team?.name ?? side}>
    {team ? <TeamNameLink teamId={team.id} name={team.name} leagueId={team.leagueId}
      logoUrl={team.logoUrl} iconKey={team.iconKey} color={team.color} logoSize={16} renderAs="span"
      hint={team.id ? { tournamentTeam: { ...team, id: team.id } } : { name: team.name, leagueId: team.leagueId }}>
      {name || (!team.logoUrl && !team.iconKey) ? <span className="truncate">{team.name}</span> : <span className="sr-only">{team.name}</span>}
    </TeamNameLink> : <span className="text-[9px] uppercase">{side}</span>}
  </span>;
}
export function MatchPlayerLabel({ side, lane, fallback, playerName, playerId }: { side: Side; lane: Lane; fallback?: string; playerName?: string; playerId?: string }) {
  const ctx = useContext(Context);
  const player = ctx?.players.find(p => p.side === side && p.lane === lane);
  const name = playerName ?? player?.name;
  return <span className="inline-flex items-center gap-1 min-w-0 align-middle">
    <LaneIcon lane={lane} size="xs" className="shrink-0" />
    {name ? <PlayerNameLink name={name} playerId={playerId ?? player?.id} className="text-rift-mutedbright" /> : <span>{fallback ?? player?.championName ?? "Unknown player"}</span>}
  </span>;
}
export function MatchEventDescription({ text }: { text: string }) {
  const ctx = useContext(Context);
  const aliases = useMemo(() => participantAliases(ctx?.players ?? []), [ctx]);
  const pattern = useMemo(() => {
    if (!aliases.size) return null;
    const names = [...aliases.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`(?<![\\p{L}\\p{N}_])(${names.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  }, [aliases]);
  if (!pattern) return <>{text}</>;
  const nodes: ReactNode[] = []; let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const player = aliases.get(match[0])!;
    nodes.push(text.slice(offset, match.index));
    nodes.push(<MatchPlayerLabel key={match.index} side={player.side} lane={player.lane} playerName={player.name} playerId={player.id} />);
    offset = match.index! + match[0].length;
  }
  nodes.push(text.slice(offset));
  return <>{nodes}</>;
}
