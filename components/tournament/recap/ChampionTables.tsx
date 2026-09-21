"use client";

import { formatKda } from "@/lib/formatKda";

import type { ChampionKDAStat, ChampionStat } from "@/lib/tournament";
import type { Champion } from "@/lib/types";

export function PresenceTable({
  rows,
  byId,
}: {
  rows: ChampionStat[];
  byId: Map<number, Champion>;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          Presence
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Picks + Bans + Games
        </span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Champion</span>
        <span className="text-center" title="Picks">P</span>
        <span className="text-center" title="Bans">B</span>
        <span className="text-center" title="Games">G</span>
        <span className="text-center" title="Total presence (P+B+G)">Σ</span>
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          No data
        </div>
      )}
      {rows.map((stat) => {
        const c = byId.get(stat.championId);
        if (!c) return null;
        const games = stat.wins + stat.losses;
        const total = stat.picks + stat.bans + games;
        return (
          <div
            key={c.id}
            className="grid grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_3rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center"
          >
            <img
              src={c.iconUrl}
              alt={c.name}
              className="w-6 h-6 border border-rift-line"
            />
            <span className="truncate font-display tracking-wider text-rift-mutedbright">
              {c.name}
            </span>
            <span className="text-center tabular-nums text-rift-bluebright">
              {stat.picks}
            </span>
            <span className="text-center tabular-nums text-rift-redbright">
              {stat.bans}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {games}
            </span>
            <span className="text-center tabular-nums text-rift-goldbright/85 font-display">
              {total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WinRateTable({
  rows,
  byId,
  title = "Win Rate",
  subtitle = "Min 3 games",
  emptyMessage = "No champion has played 3+ games yet",
}: {
  rows: ChampionStat[];
  byId: Map<number, Champion>;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          {title}
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          {subtitle}
        </span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Champion</span>
        <span className="text-center" title="Wins-Losses">W-L</span>
        <span className="text-center" title="Games played">G</span>
        <span className="text-center" title="Win Rate">WR</span>
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {emptyMessage}
        </div>
      )}
      {rows.map((stat) => {
        const c = byId.get(stat.championId);
        if (!c) return null;
        const games = stat.wins + stat.losses;
        const wrPct =
          stat.winRate != null ? Math.round(stat.winRate * 100) : null;
        const wrCls =
          wrPct == null
            ? "text-rift-mutedbright/40"
            : wrPct >= 60
            ? "text-emerald-300"
            : wrPct < 40
            ? "text-rift-redbright"
            : "text-rift-mutedbright";
        return (
          <div
            key={c.id}
            className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3.5rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center"
          >
            <img
              src={c.iconUrl}
              alt={c.name}
              className="w-6 h-6 border border-rift-line"
            />
            <span className="truncate font-display tracking-wider text-rift-mutedbright">
              {c.name}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {stat.wins}-{stat.losses}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/65">
              {games}
            </span>
            <span className={`text-center tabular-nums font-display ${wrCls}`}>
              {wrPct != null ? `${wrPct}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Best KDA leaderboard — sums per-game KDA from every game.recap.perPickKDA
// and ranks champions by (K+A)/max(1,D). Same visual style as the other
// post-tournament champion tables. Gated to ≥2 games so a single 8/0/4
// stomp doesn't crown a one-game wonder.
export function BestKDATable({
  rows,
  byId,
}: {
  rows: ChampionKDAStat[];
  byId: Map<number, Champion>;
}) {
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="px-3 py-2 border-b border-rift-line/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          Best KDA
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Min 2 games · (K+A)/D
        </span>
      </div>
      <div className="grid grid-cols-[2rem_1fr_2.5rem_4.5rem_6rem] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.3em] text-rift-gold/55">
        <span></span>
        <span>Champion</span>
        <span className="text-center" title="Games played">G</span>
        <span className="text-center" title="Kills / Deaths / Assists totals">
          K/D/A
        </span>
        <span className="text-center" title="(Kills + Assists) / Deaths">
          KDA
        </span>
      </div>
      {rows.length === 0 && (
        <div className="px-3 py-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          Not enough recapped games yet
        </div>
      )}
      {rows.map((stat) => {
        const c = byId.get(stat.championId);
        if (!c) return null;
        const kdaCls =
          stat.kda >= 5
            ? "text-emerald-300"
            : stat.kda >= 3
              ? "text-rift-bluebright"
              : stat.kda < 1.5
                ? "text-rift-redbright"
                : "text-rift-mutedbright";
        return (
          <div
            key={c.id}
            className="grid grid-cols-[2rem_1fr_2.5rem_4.5rem_6rem] gap-2 px-3 py-1.5 border-b border-rift-line/20 last:border-b-0 text-[10px] md:text-[11px] items-center"
          >
            <img
              src={c.iconUrl}
              alt={c.name}
              className="w-6 h-6 border border-rift-line"
            />
            <span className="truncate font-display tracking-wider text-rift-mutedbright">
              {c.name}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/65">
              {stat.games}
            </span>
            <span className="text-center tabular-nums text-rift-mutedbright/85">
              {stat.kills}/{stat.deaths}/{stat.assists}
            </span>
            <span className={`text-center tabular-nums font-display ${kdaCls}`}>
              {formatKda({ k: stat.kills, d: stat.deaths, a: stat.assists }, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
