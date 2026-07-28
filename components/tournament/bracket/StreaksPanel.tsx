"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import type { TournamentState } from "@/lib/tournament";
import { hotPlayers } from "@/lib/streaks";
import type { Lane } from "@/lib/types";
import LaneIcon from "../../LaneIcon";
import TeamNameLink from "@/components/team/TeamNameLink";
import { teamStreaksFor } from "./MatchCard";

// StreaksPanel — compact "On fire / Slumping" sidebar panel.
// Renders:
//   1. Teams on a ≥2 series win streak.
//   2. Hot players (form ≥ threshold) and cold players (form ≤ -threshold)
//      resolved from the store's playerForms slice.
//
// Hidden entirely when nothing qualifies. Matches the same panel language
// used by LiveChampionMetaPanel (mb-6 border bg-rift-panel/40 p-3 md:p-4).

function LaneDot({ lane }: { lane: Lane }) {
  return <LaneIcon lane={lane} size="xs" className="opacity-70" />;
}

export function StreaksPanel({ tournament }: { tournament: TournamentState }) {
  const playerForms = useDraftStore((s) => s.playerForms);

  const { teamStreakRows, hotRows, coldRows } = useMemo(() => {
    // Shared per-tournament streak cache (see MatchCard.teamStreaksFor).
    const streaks = teamStreaksFor(tournament);
    const teamStreakRows = tournament.teams
      .filter((t) => {
        const s = streaks[t.id];
        return s && s.kind === "W" && s.count >= 2;
      })
      .map((t) => ({ team: t, streak: streaks[t.id]! }))
      .sort((a, b) => b.streak.count - a.streak.count);

    const { hot, cold } = hotPlayers(playerForms, tournament);
    return { teamStreakRows, hotRows: hot, coldRows: cold };
  }, [tournament, playerForms]);

  const hasContent =
    teamStreakRows.length > 0 || hotRows.length > 0 || coldRows.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mb-6 border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Momentum
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          Streaks &amp; form
        </div>
      </div>

      {/* Win-streak teams */}
      {teamStreakRows.length > 0 && (
        <div className="mb-3">
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/50 mb-1.5">
            Win streak
          </div>
          <div className="space-y-1">
            {teamStreakRows.map(({ team, streak }) => (
              <div
                key={team.id}
                className="flex items-center gap-2 text-[11px] md:text-xs"
              >
                <span
                  className="inline-flex items-center text-[9px] font-display tracking-tight px-1.5 py-px border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shrink-0"
                  title={`Won last ${streak.count} series`}
                >
                  W{streak.count}
                </span>
                <TeamNameLink
                  teamId={team.id}
                  name={team.name}
                  iconKey={team.iconKey}
                  logoUrl={team.logoUrl}
                  color={team.color ?? undefined}
                  showLogo={false}
                  renderAs="span"
                  className="font-display tracking-wide truncate text-rift-mutedbright"
                  hint={{
                    name: team.name,
                    iconKey: team.iconKey,
                    logoUrl: team.logoUrl,
                    color: team.color ?? undefined,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot players */}
      {hotRows.length > 0 && (
        <div className="mb-2">
          <div className="text-[8px] uppercase tracking-[0.3em] text-emerald-400/70 mb-1.5">
            On fire
          </div>
          <div className="space-y-1">
            {hotRows.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] md:text-[11px]">
                <span className="text-emerald-400 shrink-0">▲</span>
                <span className="font-display tracking-wide text-rift-mutedbright truncate flex-1 min-w-0">
                  {p.teamName}
                </span>
                <LaneDot lane={p.lane} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cold players */}
      {coldRows.length > 0 && (
        <div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-redbright/70 mb-1.5">
            Slumping
          </div>
          <div className="space-y-1">
            {coldRows.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] md:text-[11px]">
                <span className="text-rift-redbright shrink-0">▼</span>
                <span className="font-display tracking-wide text-rift-mutedbright truncate flex-1 min-w-0">
                  {p.teamName}
                </span>
                <LaneDot lane={p.lane} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
