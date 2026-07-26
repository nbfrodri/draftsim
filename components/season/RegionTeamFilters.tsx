"use client";

import { LEAGUE_IDS, type LeagueId } from "@/lib/season/types";
import LeagueIcon from "@/components/LeagueIcon";
import TeamIcon from "@/components/TeamIcon";

export type FilterTeam = {
  id: string;
  name: string;
  leagueId: LeagueId;
  iconKey: string;
  logoUrl?: string;
  color: string;
};

/**
 * Compact region + team chip filters matching Season History search UX.
 * Region scopes the team chips; empty selection = show all.
 */
export default function RegionTeamFilters({
  teams,
  leagueFilter,
  teamFilter,
  onLeagueFilter,
  onTeamFilter,
}: {
  teams: readonly FilterTeam[];
  leagueFilter: LeagueId | null;
  teamFilter: string | null;
  onLeagueFilter: (league: LeagueId | null) => void;
  onTeamFilter: (teamId: string | null) => void;
}) {
  const teamOptions = leagueFilter
    ? teams.filter((t) => t.leagueId === leagueFilter)
    : teams;

  return (
    <div className="space-y-1.5 mb-2">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => {
            onLeagueFilter(null);
            onTeamFilter(null);
          }}
          className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
            leagueFilter == null
              ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
              : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
          }`}
        >
          All regions
        </button>
        {LEAGUE_IDS.map((lg) => (
          <button
            key={lg}
            type="button"
            onClick={() => {
              onLeagueFilter(lg);
              onTeamFilter(null);
            }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              leagueFilter === lg
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            <LeagueIcon league={lg} size={11} />
            {lg}
          </button>
        ))}
      </div>
      {teamOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          <button
            type="button"
            onClick={() => onTeamFilter(null)}
            className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              teamFilter == null
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            All teams
          </button>
          {teamOptions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTeamFilter(t.id)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 border transition-all ${
                teamFilter === t.id
                  ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                  : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
              }`}
              title={t.name}
              aria-label={t.name}
            >
              <TeamIcon
                iconKey={t.iconKey}
                logoUrl={t.logoUrl}
                size={12}
                color={t.color}
              />
              <span className="text-[8px] uppercase tracking-[0.12em] truncate max-w-[5rem]">
                {t.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** True when an item tagged with `teamId` passes region/team filters. */
export function matchesTeamFilters(
  teamId: string | undefined,
  teamsById: Map<string, FilterTeam>,
  leagueFilter: LeagueId | null,
  teamFilter: string | null,
): boolean {
  if (teamFilter) return teamId === teamFilter;
  if (!leagueFilter) return true;
  if (!teamId) return false;
  const t = teamsById.get(teamId);
  return t?.leagueId === leagueFilter;
}
