"use client";

import { useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { computeTournamentChampionWR } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";
import type { MetaChange } from "@/lib/metaEvolution";

// Live in-tournament meta panel. Renders a compact table of the
// champions with the most picks/games-played so the user can watch the
// AI-relevant meta evolve as matches resolve. Sample size is small early
// on (the AI applies Bayesian shrinkage, so a 1-game outlier doesn't
// dominate scoring), so we surface games-played alongside WR to set
// expectations. Hidden when no champion has played a recorded game yet.
export function LiveChampionMetaPanel({ tournament }: { tournament: TournamentState }) {
  const champions = useDraftStore((s) => s.champions);
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  // Use the same WR computation the AI sees so what's displayed equals
  // what's influencing draft decisions.
  const rows = useMemo(() => {
    const wr = computeTournamentChampionWR(tournament);
    const out: { id: number; games: number; wins: number; winRate: number }[] = [];
    for (const [id, e] of wr) {
      out.push({ id, games: e.games, wins: e.wins, winRate: e.winRate });
    }
    // Sort by sample size (more games = more confident signal), then by
    // win rate descending. Cap at 8 rows to keep the panel compact.
    out.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.winRate - a.winRate;
    });
    return out.slice(0, 8);
  }, [tournament]);

  if (rows.length === 0) return null;
  return (
    <div className="mb-6 border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          In-Tournament Meta
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          AI shifts toward winning champions
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rows.map((r) => {
          const champ = byId.get(r.id);
          if (!champ) return null;
          const wrPct = Math.round(r.winRate * 100);
          const wrColor =
            r.winRate >= 0.6
              ? "text-emerald-300"
              : r.winRate <= 0.4
              ? "text-rift-redbright"
              : "text-rift-mutedbright";
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
            >
              <img
                src={champ.iconUrl}
                alt={champ.name}
                className="w-7 h-7 border border-rift-line/60 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                  {champ.name}
                </div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/60">
                  {r.games}G · <span className={wrColor}>{wrPct}% WR</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MetaEvolutionFeed ───────────────────────────────────────────────────────

// Patch-notes style feed of meta tier shifts during a live-meta tournament.
// Visible only when tournament.liveMeta is true and the log is non-empty.
// Collapses to the latest 8 entries with an expand toggle when longer.
const COLLAPSED_LIMIT = 8;

export function MetaEvolutionFeed({ tournament }: { tournament: TournamentState }) {
  const [expanded, setExpanded] = useState(false);

  const log: MetaChange[] = tournament.metaEvolutionLog ?? [];
  if (!tournament.liveMeta || log.length === 0) return null;

  // Show newest-first so the most recent changes are immediately visible.
  const reversed = [...log].reverse();
  const visible = expanded ? reversed : reversed.slice(0, COLLAPSED_LIMIT);
  const hasMore = reversed.length > COLLAPSED_LIMIT;

  return (
    <div className="mb-6 border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Meta Shifts
        </div>
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {log.length} change{log.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="space-y-1">
        {visible.map((change, i) => (
          <MetaChangeRow key={i} change={change} />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 hover:text-rift-goldbright transition-colors"
        >
          {expanded ? "▲ Show less" : `▼ Show all ${reversed.length}`}
        </button>
      )}
    </div>
  );
}

function MetaChangeRow({ change }: { change: MetaChange }) {
  // Determine direction: is this a rise or a fall?
  const tierValues: Record<string, number> = {
    "S+": 6, "S": 5, "A": 4, "B": 3, "C": 2, "D": 1,
  };
  const fromVal = tierValues[change.from] ?? 0;
  const toVal = tierValues[change.to] ?? 0;
  const isRise = toVal > fromVal;
  const arrowCls = isRise ? "text-emerald-400" : "text-rift-redbright";
  const arrowChar = isRise ? "▲" : "▼";

  const reasonLabel =
    change.reason === "dominant"
      ? "dominant"
      : change.reason === "underperforming"
      ? "underperforming"
      : "emerging";

  return (
    <div className="flex items-center gap-2 text-[10px] md:text-[11px] py-0.5 border-b border-rift-line/20 last:border-0">
      <span className="text-rift-mutedbright/55 shrink-0 w-20 truncate">{change.roundLabel}</span>
      <span className="text-rift-goldbright/85 font-display tracking-wide truncate flex-1 min-w-0">
        {change.alias}
      </span>
      <span className="text-rift-muted shrink-0 uppercase text-[9px] tracking-[0.15em] w-12 text-center">
        {change.lane}
      </span>
      <span className="shrink-0 flex items-center gap-1 tabular-nums">
        <span className="text-rift-mutedbright">{change.from}</span>
        <span className={`text-[9px] ${arrowCls}`}>{arrowChar}</span>
        <span className={isRise ? "text-emerald-300" : "text-rift-redbright"}>{change.to}</span>
      </span>
      <span className="text-rift-muted/60 shrink-0 hidden md:block text-[9px] italic">
        {reasonLabel}
      </span>
    </div>
  );
}
