"use client";

import PlayerNameLink from "@/components/player/PlayerNameLink";
import TournamentTeamIdentity from "@/components/tournament/TournamentTeamIdentity";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import type { TournamentTeam, TournamentState } from "@/lib/tournament";
import { hotPlayers } from "@/lib/streaks";
import type { Lane } from "@/lib/types";
import LaneIcon from "../../LaneIcon";

import { teamStreaksFor } from "./MatchCard";

// StreaksPanel — compact "On fire / Slumping" sidebar panel.
// Renders:
//   1. Teams on a ≥2 series win streak.
//   2. Hot players (form ≥ threshold) and cold players (form ≤ -threshold)
//      resolved from the store's playerForms slice.
//
// Hidden entirely when nothing qualifies. Matches the same panel language
// used by LiveChampionMetaPanel (mb-6 border bg-rift-panel/40 p-3 md:p-4).

function MomentumPlayer({ team, lane }: { team?: TournamentTeam; lane: Lane }) {
  const player = team?.players?.find(p => p.lane === lane);
  return <div className="min-w-0 flex-1">
    <div className="flex items-center gap-1.5">
      <LaneIcon lane={lane} size="xs" className="shrink-0" />
      <PlayerNameLink playerId={player?.id} name={player?.name ?? "Unknown player"}
        hint={{ player, teamName: team?.name }} className="min-w-0 truncate font-display text-rift-mutedbright" />
    </div>
    <TournamentTeamIdentity team={team} className="mt-1 text-[11px] text-rift-mutedbright/65 max-w-full" />
  </div>;
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

  const teamsById = useMemo(() => new Map(tournament.teams.map(team => [team.id, team])), [tournament.teams]);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <section className="min-w-0 border border-rift-line/40 bg-rift-bg/30 p-3" aria-label="Win streaks">
          <h3 className="text-xs font-display text-rift-mutedbright mb-2">Win streak <span className="text-rift-mutedbright/50">· {teamStreakRows.length}</span></h3>
          <p className="text-[10px] text-rift-mutedbright/60 mb-3">Consecutive series won</p>
          <div className="space-y-2">
            {teamStreakRows.map(({ team, streak }) => (
              <div key={team.id} className="flex items-center justify-between gap-2 border-t border-rift-line/30 pt-2 text-xs">
                <TournamentTeamIdentity team={team} className="min-w-0" />
                <span className="shrink-0 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300 tabular-nums" title={`Won last ${streak.count} series`}>{streak.count} wins</span>
              </div>
            ))}
            {!teamStreakRows.length && <p className="text-xs text-rift-mutedbright/55">No active win streaks.</p>}
          </div>
        </section>
        {([{ title: "On fire", rows: hotRows, color: "text-emerald-300" }, { title: "Slumping", rows: coldRows, color: "text-rift-redbright" }] as const).map(group => (
          <section key={group.title} aria-label={group.title} className="min-w-0 border border-rift-line/40 bg-rift-bg/30 p-3">
            <h3 className={`text-xs font-display mb-2 ${group.color}`}>{group.title} <span className="text-rift-mutedbright/50">· {group.rows.length}</span></h3>
            <p className="text-[10px] text-rift-mutedbright/60 mb-3">Player form · −1 to +1</p>
            <div className="space-y-2">
              {group.rows.map(p => (
                <div key={`${p.teamId}:${p.lane}`} className="flex items-center gap-3 border-t border-rift-line/30 pt-2 text-xs">
                  <MomentumPlayer team={teamsById.get(p.teamId)} lane={p.lane} />
                  <span className={`shrink-0 font-display tabular-nums ${group.color}`} title="Current player form; not a win probability">{p.form > 0 ? "+" : ""}{p.form.toFixed(2)}</span>
                </div>
              ))}
              {!group.rows.length && <p className="text-xs text-rift-mutedbright/55">No players in this group.</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
