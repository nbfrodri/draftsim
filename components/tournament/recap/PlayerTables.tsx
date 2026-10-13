"use client";

import { useMemo, useState, type ReactNode } from "react";
import LaneIcon from "@/components/LaneIcon";
import PlayerNameLink from "@/components/player/PlayerNameLink";
import TournamentTeamIdentity from "@/components/tournament/TournamentTeamIdentity";
import { formatKda } from "@/lib/formatKda";
import { LANES } from "@/lib/lanes";
import type { TournamentState, TournamentTeam } from "@/lib/tournament";
import { computeTournamentPlayerStats, type TournamentPlayerStat } from "@/lib/tournamentPlayerStats";
import type { Lane } from "@/lib/types";

// Gated to ≥2 games so a single stomp doesn't crown a one-game wonder.
const MIN_GAMES = 2;
// Rows per board the user can pick; Infinity = everyone who qualifies.
const LIMITS = [5, 10, 20, Infinity];

interface Board {
  title: string;
  subtitle: string;
  /** Games backing this metric for a player. */
  games: (p: TournamentPlayerStat) => number;
  score: (p: TournamentPlayerStat) => number;
  /** Grid tracks, headers and cells for the columns after Player and G. */
  cols: string;
  headers: ReactNode;
  cells: (p: TournamentPlayerStat) => ReactNode;
}

const BOARDS: Board[] = [
  {
    title: "Best KDA",
    subtitle: `Min ${MIN_GAMES} games · (K+A)/D`,
    games: (p) => p.kdaGames,
    score: (p) => (p.kills + p.assists) / Math.max(1, p.deaths),
    cols: "4.5rem 6rem",
    headers: (
      <>
        <span className="text-center" title="Kills / Deaths / Assists totals">K/D/A</span>
        <span className="text-center" title="(Kills + Assists) / Deaths">KDA</span>
      </>
    ),
    cells: (p) => {
      const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
      const cls = kda >= 5 ? "text-emerald-300" : kda >= 3 ? "text-rift-bluebright" : kda < 1.5 ? "text-rift-redbright" : "text-rift-mutedbright";
      return (
        <>
          <span className="text-center tabular-nums text-rift-mutedbright/85">{p.kills}/{p.deaths}/{p.assists}</span>
          <span className={`text-center tabular-nums font-display ${cls}`}>{formatKda({ k: p.kills, d: p.deaths, a: p.assists }, 2)}</span>
        </>
      );
    },
  },
  {
    title: "Best Average Rating",
    subtitle: `Min ${MIN_GAMES} games · 1-10`,
    games: (p) => p.ratingGames,
    score: (p) => p.ratingSum / p.ratingGames,
    cols: "3.5rem",
    headers: <span className="text-center" title="Average performance rating per game">Rating</span>,
    cells: (p) => {
      const rating = p.ratingSum / p.ratingGames;
      // Same bands as the awards rating badge.
      const cls = rating >= 8 ? "text-rift-goldbright" : rating >= 6.5 ? "text-emerald-300" : rating >= 5 ? "text-rift-mutedbright" : "text-rift-redbright/80";
      return <span className={`text-center tabular-nums font-display ${cls}`}>{rating.toFixed(2)}</span>;
    },
  },
  {
    title: "Gold vs Lane Opponent",
    subtitle: `Min ${MIN_GAMES} games · avg per game`,
    games: (p) => p.goldGames,
    score: (p) => p.goldDiffSum / p.goldGames,
    cols: "4.5rem",
    headers: <span className="text-center" title="Average end-of-game gold lead over the direct lane opponent">Gold ±</span>,
    cells: (p) => {
      const gold = Math.round(p.goldDiffSum / p.goldGames);
      const cls = gold > 0 ? "text-emerald-300" : gold < 0 ? "text-rift-redbright" : "text-rift-mutedbright";
      return <span className={`text-center tabular-nums font-display ${cls}`}>{gold > 0 ? "+" : ""}{gold.toLocaleString("en-US")}</span>;
    },
  },
];

function PlayerBoard({ board, players, teams, limit, className = "" }: {
  board: Board;
  limit: number;
  players: TournamentPlayerStat[];
  teams: Map<string, TournamentTeam>;
  className?: string;
}) {
  const ranked = useMemo(
    () =>
      players
        .filter((p) => board.games(p) >= MIN_GAMES)
        .sort((a, b) => board.score(b) - board.score(a) || board.games(b) - board.games(a) || a.key.localeCompare(b.key)),
    [board, players],
  );
  const rows = ranked.slice(0, limit);
  const grid = { gridTemplateColumns: `1rem minmax(0,1fr) 2.5rem ${board.cols}` };
  return (
    <div className={`border border-rift-line/50 bg-rift-panel/40 ${className}`}>
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">{board.title}</span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          {board.subtitle}{ranked.length > rows.length && ` · ${rows.length} of ${ranked.length}`}
        </span>
      </div>
      <div style={grid} className="grid gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Player</span>
        <span className="text-center" title="Games played">G</span>
        {board.headers}
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          Not enough recapped games yet
        </div>
      )}
      {rows.map((p) => {
        const team = teams.get(p.teamId);
        return (
          <div key={p.key} style={grid} className="grid gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center">
            <LaneIcon lane={p.lane} size="xs" />
            <span className="flex min-w-0 items-center gap-2">
              <PlayerNameLink
                playerId={p.playerId}
                name={p.playerName}
                fallback={LANES.find((l) => l.key === p.lane)?.label}
                className="min-w-0 truncate font-display tracking-wider text-rift-mutedbright"
              />
              <TournamentTeamIdentity team={team} seed={false} className="min-w-0 text-[9px] text-rift-mutedbright/60" />
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/65">{board.games(p)}</span>
            {board.cells(p)}
          </div>
        );
      })}
    </div>
  );
}

// Player leaderboards for the post-tournament recap. One role filter drives
// all three boards so they always compare the same pool of players.
export function PlayerLeadersPanel({ tournament }: { tournament: TournamentState }) {
  const [lane, setLane] = useState<Lane | null>(null);
  const [limit, setLimit] = useState(10);
  const stats = useMemo(() => computeTournamentPlayerStats(tournament), [tournament]);
  const teams = useMemo(() => new Map(tournament.teams.map((t) => [t.id, t])), [tournament.teams]);
  const players = useMemo(() => (lane ? stats.filter((p) => p.lane === lane) : stats), [stats, lane]);
  if (stats.length === 0) return null;
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
      active
        ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
        : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
    }`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">Player Leaders</span>
        <button type="button" aria-pressed={lane == null} onClick={() => setLane(null)} className={chip(lane == null)}>
          All roles
        </button>
        {LANES.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={lane === key} onClick={() => setLane(key)} className={chip(lane === key)}>
            <LaneIcon lane={key} size="xs" />
            {label}
          </button>
        ))}
        <span className="ml-auto mr-1 text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">Show</span>
        {LIMITS.map((n) => (
          <button key={n} type="button" aria-pressed={limit === n} onClick={() => setLimit(n)} className={chip(limit === n)}>
            {Number.isFinite(n) ? `Top ${n}` : "All"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <PlayerBoard board={BOARDS[0]} players={players} teams={teams} limit={limit} className="lg:col-span-2" />
        <PlayerBoard board={BOARDS[1]} players={players} teams={teams} limit={limit} />
        <PlayerBoard board={BOARDS[2]} players={players} teams={teams} limit={limit} />
      </div>
    </div>
  );
}
