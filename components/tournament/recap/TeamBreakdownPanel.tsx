"use client";

import TournamentTeamIdentity from "@/components/tournament/TournamentTeamIdentity";

import { useMemo, useState } from "react";
import { computeTeamBreakdown, getTeam } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";

// Per-team champion-pool panel. Lists every team and the champions they
// played, ordered by pick frequency. Collapsible per row so the panel
// stays compact when there are 8+ teams.
export function TeamBreakdownPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const breakdown = useMemo(
    () => computeTeamBreakdown(tournament),
    [tournament],
  );
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(
    () => breakdown[0]?.teamId ?? null,
  );
  if (breakdown.length === 0) return null;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Team Champion Pools
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Click a team to expand
        </span>
      </div>
      {breakdown.map((entry) => {
        const team = getTeam(tournament, entry.teamId);
        if (!team) return null;
        const expanded = expandedTeamId === entry.teamId;
        const totalPicks = entry.champions.reduce((a, c) => a + c.picks, 0);
        const totalWins = entry.champions.reduce((a, c) => a + c.wins, 0);
        const totalLosses = entry.champions.reduce((a, c) => a + c.losses, 0);
        return (
          <div key={entry.teamId} className="border-b border-rift-line/20 last:border-b-0">
            <button
              type="button"
              onClick={() =>
                setExpandedTeamId(expanded ? null : entry.teamId)
              }
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-rift-gold/[0.03] transition-colors"
            >
              <span className="flex flex-wrap items-center gap-2">
                <TournamentTeamIdentity team={team} className="font-display text-sm text-rift-goldbright" />
                <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
                  {entry.champions.length} champions · {totalPicks} picks · {totalWins}-{totalLosses}
                </span>
              </span>
              <span className="text-rift-gold/60 text-xs">
                {expanded ? "▾" : "▸"}
              </span>
            </button>
            {expanded && (
              <div className="px-3 pb-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {entry.champions.map((c) => {
                  const champ = byId.get(c.championId);
                  if (!champ) return null;
                  const games = c.wins + c.losses;
                  return (
                    <div
                      key={c.championId}
                      className="flex items-center gap-2 border border-rift-line/30 bg-rift-bg/30 px-2 py-1.5"
                    >
                      <img
                        src={champ.iconUrl}
                        alt={champ.name}
                        className="w-8 h-8 border border-rift-line/60 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                          {champ.name}
                        </div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
                          {c.picks}× ·&nbsp;
                          <span className="text-rift-bluebright">{c.wins}W</span>
                          {games > 0 && (
                            <span className="text-rift-redbright">
                              &nbsp;{c.losses}L
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
