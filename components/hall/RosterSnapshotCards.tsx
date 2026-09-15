"use client";

import type { SeasonHistoryTeamRef } from "@/lib/season/history";
import type { TeamRosterSnapshot } from "@/lib/season/types";
import { LANE_ORDER } from "@/lib/players";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import TeamNameLink from "../team/TeamNameLink";
import PlayerNameLink from "../player/PlayerNameLink";
import LeagueIcon from "../LeagueIcon";
import LaneIcon from "../LaneIcon";

/** All displayed values come from this phase's captured roster. */
export default function RosterSnapshotCards({
  roster,
  label,
  team,
  highlightPlayerId,
  coach,
  seasonId,
  phaseScope,
}: {
  roster?: TeamRosterSnapshot["players"];
  label: string;
  team?: SeasonHistoryTeamRef | null;
  highlightPlayerId?: string;
  coach?: string;
  seasonId: string;
  phaseScope?:
    | import("@/lib/season/types").SplitId
    | import("@/lib/season/types").InternationalId;
}) {
  return (
    <section
      aria-label={`${label} roster snapshot`}
      className="w-full border border-rift-line/40 bg-rift-bg/40 p-2.5"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px] text-rift-mutedbright">
        <span className="uppercase tracking-[0.2em] text-rift-gold/70">
          {label} · Roster snapshot
        </span>
        {team && (
          <span className="inline-flex items-center gap-1.5">
            <TeamNameLink
              name={team.name}
              leagueId={team.leagueId}
              seasonId={seasonId}
              phaseScope={phaseScope}
              iconKey={team.iconKey}
              color={team.color}
              logoUrl={resolveTeamLogo(team.name, team.logoUrl)}
              logoSize={15}
            />
            <LeagueIcon league={team.leagueId} size={12} />
          </span>
        )}
        {coach && <span>Coach · {coach}</span>}
        <button
          type="button"
          className="ml-auto shrink-0 border border-rift-line/40 px-2 py-1 text-[8px] uppercase tracking-[0.15em] text-rift-mutedbright transition-colors hover:border-rift-gold/50 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold"
          onClick={(event) => {
            const details = event.currentTarget.closest("details");
            if (!details) return;
            details.open = false;
            details.querySelector("summary")?.focus();
          }}
        >
          Close roster
        </button>
      </div>
      {!roster?.length ? (
        <p className="text-[10px] text-rift-mutedbright">
          No roster snapshot was recorded for this event.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {LANE_ORDER.map((lane) => {
            const players = roster.filter((player) => player.lane === lane);
            return (
              <div
                key={lane}
                className="min-w-0 border border-rift-line/40 bg-rift-panel/20 p-2"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.15em] text-rift-mutedbright">
                  <LaneIcon lane={lane} size="sm" />
                  {lane === "middle" ? "Mid" : lane === "bottom" ? "Bot" : lane}
                </div>
                {players.length === 0 ? (
                  <span className="text-[9px] text-rift-muted">
                    Not recorded
                  </span>
                ) : (
                  players.map((player, index) => (
                    <div key={player.id ?? index} className="mt-1">
                      <span
                        className={`block truncate text-[11px] ${player.id === highlightPlayerId ? "text-rift-goldbright" : "text-rift-mutedbright"}`}
                        title={player.name}
                      >
                        <PlayerNameLink
                          playerId={player.id}
                          name={player.name}
                          fallback="Unknown player"
                          seasonId={seasonId}
                          phaseScope={phaseScope}
                        />
                      </span>
                      <span className="mt-1 flex gap-2 text-[9px] text-rift-mutedbright">
                        <span className="border border-rift-gold/30 px-1 font-display text-rift-goldbright">
                          {player.tier}
                        </span>
                        {player.age != null && <span>Age {player.age}</span>}
                        {player.id === highlightPlayerId && (
                          <span className="text-rift-gold/70">Selected</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
