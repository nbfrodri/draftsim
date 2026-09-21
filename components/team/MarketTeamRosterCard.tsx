"use client";
import TeamStars from "../TeamStars";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import { useState } from "react";
import type { MarketTeamSnapshot } from "@/lib/season/marketSnapshots";
import { deriveStar } from "@/lib/players";
import { averageTierFromRoster } from "@/lib/season/teamCard";
import type { TeamCardData } from "@/lib/season/teamCard";
import TeamIcon from "../TeamIcon";
import LeagueIcon from "../LeagueIcon";
import LaneIcon from "../LaneIcon";
import TierChip from "../season/TierChip";

export default function MarketTeamRosterCard({ snapshot, data }: { snapshot: MarketTeamSnapshot | null; data: TeamCardData }) {
  const [side, setSide] = useState<"before" | "after">("after");
  const team = snapshot ?? data;
  const stars = snapshot ? deriveStar(snapshot[side]) : 0;
  const academy = snapshot?.[side === "before" ? "academyBefore" : "academyAfter"];
  return <div className="player-card w-[276px] text-left"><div className="player-card-body p-3">
    <div className="flex items-center gap-2">
      <TeamIcon iconKey={team.iconKey ?? "shield"} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} color={team.color} size={28} />
      <div className="min-w-0"><p className="truncate font-display text-sm text-rift-goldbright">{team.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-rift-mutedbright">{team.leagueId && <LeagueIcon league={team.leagueId} size={13} />}{team.leagueId}</p></div>
    </div>
    {snapshot ? <>
      <div role="group" aria-label="Roster snapshot" className="my-3 flex border border-rift-line">
        {(["before", "after"] as const).map(value => <button key={value} type="button" aria-pressed={side === value}
          onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setSide(value); }}
          className={`flex-1 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-rift-gold ${side === value ? "bg-rift-gold/15 text-rift-goldbright" : "text-rift-mutedbright"}`}>
          {value === "before" ? "Before" : "After"}</button>)}
      </div>
      {snapshot[side].length > 0 && <div className="mb-3 flex items-center justify-between text-[10px] text-rift-mutedbright" aria-label="Snapshot team strength">
        <span className="inline-flex items-center gap-1.5">Average tier <TierChip tier={averageTierFromRoster(snapshot[side])} /></span>
        <TeamStars rating={stars} className="text-xs tracking-wider" />
      </div>}
      <div className="space-y-1.5" aria-live="polite">{snapshot[side].map((player, index) => <div key={player.id ?? `${player.lane}-${index}`} className="flex min-w-0 items-center gap-2 text-xs text-rift-goldbright">
        <LaneIcon lane={player.lane} /><span className="min-w-0 flex-1 truncate">{player.name || "Vacant slot"}</span><TierChip tier={player.tier} />
      </div>)}</div>
      <div className="mt-3 border-t border-rift-line/60 pt-2">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-rift-gold">Academy</p>
        {academy == null ? <p className="text-xs text-rift-mutedbright">Academy snapshot not recorded.</p> : academy.length === 0 ? <p className="text-xs text-rift-mutedbright">No academy players.</p> :
          <div className="max-h-36 space-y-1.5 overflow-y-auto">{academy.map((player, index) => <div key={player.id ?? index} className="flex items-center gap-2 text-xs text-rift-goldbright">
            <LaneIcon lane={player.lane} /><span className="min-w-0 flex-1 truncate">{player.name || "Unknown player"}</span><TierChip tier={player.tier} />
          </div>)}</div>}
      </div>
      <p className="mt-3 text-[10px] text-rift-mutedbright">Roster {side} this market update.</p>
    </> : <p className="mt-3 text-xs text-rift-mutedbright">No roster snapshot was recorded for this movement.</p>}
  </div></div>;
}
