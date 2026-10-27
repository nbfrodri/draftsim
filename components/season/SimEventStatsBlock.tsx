"use client";

import { memo, useMemo } from "react";
import { IconChartBar } from "@tabler/icons-react";
import type { SimEventSummary, SimEventChampionCount, SimYearEventSummary } from "@/lib/season/simEventSummary";
import { LANE_ORDER } from "@/lib/players";
import type { Champion } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import CollapsibleSection from "../CollapsibleSection";
import RegionMark from "../RegionMark";
import RoleLabel from "../RoleLabel";
import EventIdentityIcon from "../tournament/EventIdentityIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import { resolveTeamLogo } from "@/lib/season/realTeams";

const NOT_RECORDED = "Not recorded";

function ChampionLine({ title, entry, byId }: { title: string; entry?: SimEventChampionCount; byId: Map<number, Champion> }) {
  const info = entry ? byId.get(entry.championId) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-rift-mutedbright">
      <span className="shrink-0 text-[10px] uppercase tracking-wider">{title}</span>
      {entry ? (
        <span className="flex min-w-0 items-center gap-1.5 text-rift-goldbright">
          {info && <img src={info.iconUrl} alt="" width={20} height={20} className="h-5 w-5 shrink-0" />}
          <span className="truncate">{info?.name ?? `Champion ${entry.championId}`}</span>
          <span className="shrink-0 tabular-nums text-rift-mutedbright">× {entry.count}</span>
        </span>
      ) : (
        <span>{NOT_RECORDED}</span>
      )}
    </div>
  );
}

function EventSummaryCard({ event, byId, seasonId }: { event: SimEventSummary; byId: Map<number, Champion>; seasonId: string }) {
  const byLane = new Map(event.roles.map((r) => [r.lane, r]));
  const phaseScope = event.split ?? event.event;
  return (
    <li className="min-w-0 space-y-1.5 border border-rift-line/40 bg-rift-bg/30 p-2">
      <div className="flex min-w-0 items-center gap-1.5 font-display text-[11px] text-rift-goldbright">
        <EventIdentityIcon identity={event} size={14} />
        <span className="truncate">{event.label}</span>
      </div>
      <ul className="grid gap-x-3 gap-y-1 grid-cols-1 sm:grid-cols-2" aria-label={`${event.label} top performers`}>
        {LANE_ORDER.map((lane) => {
          const line = byLane.get(lane);
          const leader = line?.leader;
          return (
            <li key={lane} className="flex min-w-0 items-center gap-1.5 text-[11px] text-rift-mutedbright">
              <RoleLabel lane={lane} size="sm" className="w-20 shrink-0" />
              {leader ? (
                <span className="flex min-w-0 items-center gap-1.5 text-rift-goldbright">
                  <PlayerNameLink playerId={leader.id} name={leader.name} seasonId={seasonId} phaseScope={phaseScope} className="min-w-0 truncate text-rift-goldbright" />
                  {leader.leagueId && <RegionMark league={leader.leagueId} size={12} />}
                  {leader.teamName && leader.leagueId ? (
                    // Logo always; the name joins it from small screens up (it stays the card's accessible name).
                    <TeamNameLink teamId={leader.teamId} name={leader.teamName} leagueId={leader.leagueId} logoUrl={resolveTeamLogo(leader.teamName, leader.logoUrl)} logoSize={14} seasonId={seasonId} phaseScope={phaseScope} className="inline-flex min-w-0 items-center gap-1 text-rift-mutedbright">
                      <span className="sr-only truncate sm:not-sr-only">{leader.teamName}</span>
                    </TeamNameLink>
                  ) : leader.teamName && <span className="hidden truncate text-rift-mutedbright sm:inline">{leader.teamName}</span>}
                  <span className="shrink-0 tabular-nums text-rift-mutedbright">{leader.score.toFixed(2)}</span>
                </span>
              ) : line ? (
                <span>Provisional</span>
              ) : (
                <span>{NOT_RECORDED}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-x-3 gap-y-1 grid-cols-1 sm:grid-cols-2">
        <ChampionLine title="Most picked" entry={event.mostPicked} byId={byId} />
        <ChampionLine title="Most banned" entry={event.mostBanned} byId={byId} />
      </div>
    </li>
  );
}

// Mounted only while the section has been opened, so closed years pay no subscription or render cost.
function EventStatsBody({ events, seasonId }: { events: SimEventSummary[]; seasonId: string }) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  return (
    <ul className="space-y-1.5 p-2" aria-label="Event statistics by event">
      {events.map((event) => (
        <EventSummaryCard key={event.id} event={event} byId={byId} seasonId={seasonId} />
      ))}
    </ul>
  );
}

function SimEventStatsBlock({ summary, seasonId }: { summary?: SimYearEventSummary; seasonId: string }) {
  const events = summary?.events ?? [];
  return (
    <CollapsibleSection
      ariaLabel="Event statistics"
      label="Event Statistics"
      icon={<IconChartBar size={14} className="shrink-0 text-rift-gold" aria-hidden="true" />}
      summary={events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : NOT_RECORDED}
      className="mt-2"
      headingClassName="font-display text-[10px] uppercase tracking-[0.2em]"
      keepMounted
      headingLevel={4}
    >
      {events.length ? (
        <EventStatsBody events={events} seasonId={seasonId} />
      ) : (
        <p className="p-3 text-xs text-rift-mutedbright">{NOT_RECORDED}. Event statistics were not saved for this year.</p>
      )}
    </CollapsibleSection>
  );
}

export default memo(SimEventStatsBlock);
