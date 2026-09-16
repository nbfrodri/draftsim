"use client";
import { useState } from "react";
import type { CareerTeammate } from "@/lib/season/teammates";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import SplitIcon from "../season/SplitIcon";
import GoToSeasonButton from "./GoToSeasonButton";
import { TROPHY_LABELS } from "@/lib/season/titlePlayground";

export default function CareerTeammates({
  rows,
  onGoToSeason,
}: {
  rows: CareerTeammate[];
  onGoToSeason?: (seasonId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, 10);
  return (
    <section
      aria-label="Most frequent teammates"
      className="border border-rift-line/30 bg-rift-bg/20 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
          Most frequent teammates
        </h3>
        {rows.length > 10 && (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll(!all)}
            className="text-[10px] text-rift-goldbright hover:underline"
          >
            {all ? "Show top 10" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
      <p className="mt-1 mb-3 text-[10px] text-rift-mutedbright">
        One season counts once if both players shared a recorded roster, even
        for part of that season. Ties use shared events. Club icons show the
        latest shared team.
      </p>
      {!rows.length ? (
        <p className="text-[10px] text-rift-mutedbright">
          No teammates with recorded player identities in this history.
        </p>
      ) : (
        <ol className="max-h-80 space-y-1 overflow-y-auto pr-4 [scrollbar-gutter:stable]">
          {visible.map((peer, i) => (
            <li key={peer.id} className="border-b border-rift-line/25 py-2">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 focus-visible:outline focus-visible:outline-rift-gold">
                  <span className="w-5 text-[10px] tabular-nums text-rift-mutedbright">
                    {i + 1}
                  </span>
                  <LaneIcon lane={peer.lane} size="sm" />
                  <div className="min-w-0 flex-1">
                    <PlayerNameLink
                      renderAs="span"
                      noNavigate
                      playerId={peer.id}
                      name={peer.name}
                      seasonId={peer.seasonId}
                      phaseScope={peer.phaseScope}
                      className="text-[11px] text-rift-goldbright"
                    />
                    <div className="flex items-center gap-1.5 text-[9px] text-rift-mutedbright">
                      <TeamNameLink
                        renderAs="span"
                        noNavigate
                        name={peer.team.name}
                        leagueId={peer.team.leagueId}
                        logoUrl={resolveTeamLogo(
                          peer.team.name,
                          peer.team.logoUrl,
                        )}
                        seasonId={peer.seasonId}
                        phaseScope={peer.phaseScope}
                      />
                      <LeagueIcon league={peer.team.leagueId} size={12} />
                    </div>
                  </div>
                  <div
                    className="text-right text-[10px] text-rift-goldbright"
                    title={peer.seasons.map((s) => s.name).join(", ")}
                  >
                    <span className="tabular-nums">
                      {peer.seasons.length}{" "}
                      {peer.seasons.length === 1 ? "season" : "seasons"}
                    </span>
                    <span className="block text-[9px] text-rift-mutedbright">
                      {peer.events} {peer.events === 1 ? "event" : "events"}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="text-rift-gold/70 transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="mt-2 ml-7 border-l border-rift-gold/30 pl-3 text-[10px] text-rift-mutedbright">
                  <p className="mb-2 text-[8px] uppercase tracking-[0.15em] text-rift-gold/70">
                    Shared seasons & titles
                  </p>
                  <div className="space-y-2">
                    {peer.seasons.map((season) => (
                      <div
                        key={season.id}
                        className="border border-rift-line/40 px-2 py-2"
                      >
                        <div className="mb-1.5 flex items-center gap-3 text-rift-goldbright">
                          <span>{season.name}</span>
                          <GoToSeasonButton
                            seasonId={season.id}
                            seasonLabel={season.name}
                            onGoToSeason={onGoToSeason}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {season.titles.length ? (
                            season.titles.map((trophy) => (
                              <span
                                key={trophy}
                                className="inline-flex items-center gap-1.5 border border-rift-gold/30 px-1.5 py-1 text-[9px] text-rift-goldbright"
                              >
                                {trophy === "winter" ||
                                trophy === "spring" ||
                                trophy === "summer" ? (
                                  <SplitIcon split={trophy} size={12} />
                                ) : (
                                  <LeagueIcon league={trophy} size={12} />
                                )}
                                {TROPHY_LABELS[trophy]}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] text-rift-mutedbright">
                              No shared titles recorded
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <PlayerNameLink
                    playerId={peer.id}
                    name={peer.name}
                    className="mt-2 text-rift-goldbright"
                  >
                    Open player profile
                  </PlayerNameLink>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
