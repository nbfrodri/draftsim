"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { deriveStar, MAIN_POOL } from "@/lib/players";
import { computePlayerSeasonLines, type PlayerSeasonLine } from "@/lib/season/stats";
import { coachPlaystyle } from "@/lib/season/coach";
import {
  LEAGUE_IDS,
  LEAGUE_NAMES,
  type LeagueId,
} from "@/lib/season/types";
import type { Champion, Lane, Player, PlayerTier } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import LeagueIcon from "./LeagueIcon";
import LaneIcon from "./LaneIcon";

// Region/team browser — every team in every region with each player's full
// identity: handle, skill tier, age, potential, and champion pool. A scouting
// view over the whole world.

const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};
const LANE_ORDER: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const TIER_CLS: Record<PlayerTier, string> = {
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

export default function TeamBrowserPanel() {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const [open, setOpen] = useState(false);
  const [league, setLeague] = useState<LeagueId>("LCK");
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null); // teamId:lane

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c] as const)),
    [champions],
  );
  // Season stats per player id, so a player's row can show their numbers.
  const statsById = useMemo(() => {
    const m = new Map<string, PlayerSeasonLine>();
    if (season) for (const l of computePlayerSeasonLines(season)) m.set(l.playerId, l);
    return m;
  }, [season]);
  const teams = useMemo(
    () =>
      season
        ? season.teams
            .filter((t) => t.leagueId === league)
            .sort((a, b) => deriveStar(b.players) - deriveStar(a.players))
        : [],
    [season, league],
  );

  if (!season) return null;

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 border border-rift-line/50 bg-rift-bg/40 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
      >
        <span>Browse Leagues &amp; Rosters</span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border border-t-0 border-rift-line/40 bg-rift-bg/20 p-3">
          {/* Region selector */}
          <div className="flex flex-wrap gap-1 mb-3">
            {LEAGUE_IDS.map((lg) => (
              <button
                key={lg}
                type="button"
                onClick={() => {
                  setLeague(lg);
                  setOpenTeam(null);
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 border text-[9px] uppercase tracking-[0.2em] transition-all ${
                  lg === league
                    ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                    : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
                }`}
                title={LEAGUE_NAMES[lg]}
              >
                <LeagueIcon league={lg} size={12} />
                {lg}
              </button>
            ))}
          </div>

          {/* Teams in the selected region */}
          <div className="space-y-1">
            {teams.map((team) => {
              const isOpen = openTeam === team.id;
              const star = deriveStar(team.players);
              return (
                <div key={team.id}>
                  <button
                    type="button"
                    onClick={() => setOpenTeam(isOpen ? null : team.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 border border-rift-line/40 bg-rift-bg/30 hover:border-rift-gold/40 transition-all"
                  >
                    <TeamIcon iconKey={team.iconKey} logoUrl={team.logoUrl} size={16} color={team.color} />
                    <span className="text-[11px] text-rift-mutedbright truncate">{team.name}</span>
                    <span className="ml-auto text-[10px] text-rift-gold/80 tabular-nums">{star}★</span>
                    <span className="text-rift-muted/50 text-[9px]">{isOpen ? "▴" : "▾"}</span>
                  </button>
                  {isOpen && (
                    <div className="border border-t-0 border-rift-line/30 divide-y divide-rift-line/15">
                      {team.coach && (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] bg-rift-blue/[0.04]">
                          <span className="shrink-0 px-1 py-px border border-rift-blue/40 text-rift-blue/80 text-[7px] uppercase tracking-[0.15em]">
                            Coach
                          </span>
                          <span className="text-rift-bluebright font-medium truncate" title={team.coach.name}>
                            {team.coach.name}
                          </span>
                          <span className="shrink-0 text-[9px] text-rift-gold/80 tabular-nums" title="Coach rating — drives AI draft strength">
                            ★{team.coach.rating.toFixed(1)}
                          </span>
                          <span
                            className="ml-auto shrink-0 text-[7px] uppercase tracking-[0.15em] text-rift-muted/55 hidden sm:inline truncate max-w-[120px]"
                            title={`Playstyle · adaptability ${Math.round(team.coach.adaptability * 100)}% · motivation ${Math.round(team.coach.motivation * 100)}%`}
                          >
                            {coachPlaystyle(team.coach)} · ad {Math.round(team.coach.adaptability * 100)} · mo {Math.round(team.coach.motivation * 100)}
                          </span>
                        </div>
                      )}
                      {LANE_ORDER.map((lane, li) => {
                        const p = team.players[li];
                        if (!p) return null;
                        const pkey = `${team.id}:${lane}`;
                        const playerOpen = openPlayer === pkey;
                        return (
                          <div key={lane}>
                            <button
                              type="button"
                              onClick={() => setOpenPlayer(playerOpen ? null : pkey)}
                              className="w-full flex items-center gap-2 px-2 py-1 text-[10px] hover:bg-rift-gold/[0.04] transition-all"
                            >
                              <LaneIcon lane={lane} size="sm" className="shrink-0" />
                              <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>
                                {p.tier}
                              </span>
                              {p.name && (
                                <span className="text-rift-mutedbright font-medium max-w-[90px] truncate" title={p.name}>
                                  {p.name}
                                </span>
                              )}
                              {(p.age != null || p.potential) && (
                                <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/60">
                                  {p.age != null ? `age ${p.age}` : ""}
                                  {p.potential && p.potential !== p.tier ? ` · ↗${p.potential}` : ""}
                                </span>
                              )}
                              <span className="ml-auto inline-flex gap-0.5 items-center" title="Champion pool (mains first)">
                                {p.goodChamps.slice(0, 5).map((id, i) => {
                                  const c = byId.get(id);
                                  if (!c) return null;
                                  return (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      key={id}
                                      src={c.iconUrl}
                                      alt={c.name}
                                      title={`${c.name}${i < MAIN_POOL ? " (main)" : ""}`}
                                      className={`w-4 h-4 object-cover border border-rift-line/40 ${i >= MAIN_POOL ? "opacity-50" : ""}`}
                                    />
                                  );
                                })}
                                <span className="text-rift-muted/40 text-[9px] w-2">{playerOpen ? "▴" : "▾"}</span>
                              </span>
                            </button>
                            {playerOpen && (
                              <PlayerDetail
                                p={p}
                                line={p.id ? statsById.get(p.id) : undefined}
                                byId={byId}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// A pool chip list (champion icons + names), dimming secondary picks.
function PoolRow({
  ids,
  byId,
  tone,
  tiered,
}: {
  ids: number[];
  byId: Map<number, Champion>;
  tone: "good" | "bad";
  tiered?: boolean;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id, i) => {
        const c = byId.get(id);
        if (!c) return null;
        const secondary = tiered && i >= MAIN_POOL;
        return (
          <span key={id} className="inline-flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.iconUrl}
              alt={c.name}
              className={`w-4 h-4 object-cover border ${tone === "bad" ? "border-rift-red/40" : "border-rift-support/40"} ${secondary ? "opacity-50" : ""}`}
            />
            <span className={`text-[9px] ${tone === "bad" ? "text-rift-redbright/70" : "text-rift-mutedbright"} ${secondary ? "opacity-70" : ""}`}>
              {c.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Expanded inspector for one player: identity, full champion pool, season stats.
function PlayerDetail({
  p,
  line,
  byId,
}: {
  p: Player;
  line: PlayerSeasonLine | undefined;
  byId: Map<number, Champion>;
}) {
  return (
    <div className="px-3 py-2 bg-rift-bg/40 border-t border-rift-line/20 space-y-2 text-[10px]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-rift-mutedbright">
        <span>
          Tier <span className={`px-1 border font-display ${TIER_CLS[p.tier]}`}>{p.tier}</span>
        </span>
        {p.age != null && <span className="text-rift-muted/70">Age {p.age}</span>}
        {p.potential && (
          <span className="text-rift-muted/70">
            Potential <span className="text-rift-gold/80">{p.potential}</span>
          </span>
        )}
        {p.homeRegion && (
          <span className="text-rift-muted/70">
            From <span className="text-rift-mutedbright">{p.homeRegion}</span>
          </span>
        )}
        {(p.acclimation ?? 1) < 1 && (
          <span
            className="text-amber-300/80"
            title="Cross-region import — language barrier still costs lane performance until fully settled"
          >
            Import · {Math.round((p.acclimation ?? 1) * 100)}% settled
          </span>
        )}
      </div>

      <div>
        <div className="text-[8px] uppercase tracking-[0.25em] text-rift-support/60 mb-0.5">
          Champion pool (mains first)
        </div>
        {p.goodChamps.length > 0 ? (
          <PoolRow ids={p.goodChamps} byId={byId} tone="good" tiered />
        ) : (
          <span className="text-rift-muted/50 italic">none</span>
        )}
      </div>
      {p.badChamps.length > 0 && (
        <div>
          <div className="text-[8px] uppercase tracking-[0.25em] text-rift-red/50 mb-0.5">
            Weak on
          </div>
          <PoolRow ids={p.badChamps} byId={byId} tone="bad" />
        </div>
      )}

      <div>
        <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/55 mb-0.5">
          This season
        </div>
        {line && line.games > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-rift-mutedbright">
            <span className="text-rift-muted/70">{line.games} games</span>
            <span>
              {line.kills}/{line.deaths}/{line.assists} <span className="text-rift-muted/50">K/D/A</span>
            </span>
            {line.avgRating != null && (
              <span>
                {line.avgRating.toFixed(1)} <span className="text-rift-muted/50">avg rating</span>
              </span>
            )}
            {line.mvps > 0 && <span className="text-rift-goldbright">{line.mvps} MVP{line.mvps === 1 ? "" : "s"}</span>}
            {line.pentakills > 0 && <span className="text-rift-goldbright">{line.pentakills} penta</span>}
          </div>
        ) : (
          <span className="text-rift-muted/50 italic">no games played yet</span>
        )}
      </div>
    </div>
  );
}
