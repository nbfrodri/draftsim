"use client";

import { useMemo } from "react";
import {
  getMetaTier,
  TIER_ORDER,
  TIER_VALUE,
  type MetaTier,
} from "@/lib/championMeta";
import { computeTournamentChampionWR } from "@/lib/tournament";
import type { TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";

// Meta shift panel: surfaces the champions whose tournament W/L most
// disagrees with their pre-tournament tier expectation. Mirrors the AI's
// shrunk-WR computation (3-game prior centered at 50%) so what you see
// is what the AI actually used to bias its drafting.
//
// "Rising" = champion overperforming their base tier (winning more than
// expected; AI gives them a bump). "Falling" = the opposite.
//
// The shift magnitude is the centered shrunk WR (range roughly -0.5 to
// +0.5 with full prior weight). We report it both numerically and via a
// "tier-step" approximation so users can think about the signal in tier
// terms. tier-step ≈ shift × 4 (4 because the AI's bonus caps at ±2
// score points and a tier is worth ~3 points).
interface MetaMover {
  championId: number;
  alias: string;
  baseTier: MetaTier | null;
  baseTierValue: number;
  games: number;
  wins: number;
  losses: number;
  shrunkWR: number;
  shift: number; // shrunkWR - 0.5
}

function computeMetaMovers(
  tournament: TournamentState,
  byId: Map<number, Champion>,
): { rising: MetaMover[]; falling: MetaMover[] } {
  const wr = computeTournamentChampionWR(tournament);
  const PRIOR_GAMES = 3;
  const PRIOR_WR = 0.5;
  const MIN_GAMES = 2;
  const movers: MetaMover[] = [];
  for (const [id, entry] of wr) {
    if (entry.games < MIN_GAMES) continue;
    const champion = byId.get(id);
    if (!champion) continue;
    // Best base tier across the lanes this champion can play.
    let baseTier: MetaTier | null = null;
    let baseTierValue = 0;
    for (const lane of champion.lanes) {
      const t = getMetaTier(champion.alias, lane);
      if (!t) continue;
      const v = TIER_VALUE[t];
      if (v > baseTierValue) {
        baseTier = t;
        baseTierValue = v;
      }
    }
    const shrunkWR =
      (entry.wins + PRIOR_WR * PRIOR_GAMES) / (entry.games + PRIOR_GAMES);
    const shift = shrunkWR - 0.5;
    movers.push({
      championId: id,
      alias: champion.alias,
      baseTier,
      baseTierValue,
      games: entry.games,
      wins: entry.wins,
      losses: entry.games - entry.wins,
      shrunkWR,
      shift,
    });
  }
  // Rising = highest positive shift; falling = lowest (most negative).
  const rising = movers
    .filter((m) => m.shift > 0.05)
    .sort((a, b) => b.shift - a.shift)
    .slice(0, 5);
  const falling = movers
    .filter((m) => m.shift < -0.05)
    .sort((a, b) => a.shift - b.shift)
    .slice(0, 5);
  return { rising, falling };
}

// Project a base tier up/down by N slots. Clamps to the tier ladder.
// step > 0 = better (S → S+); step < 0 = worse. Returns null when base
// is unknown. Unchanged when base equals "S+" and step is positive.
function projectTier(base: MetaTier | null, step: number): MetaTier | null {
  if (!base) return null;
  const idx = TIER_ORDER.indexOf(base);
  if (idx < 0) return null;
  // TIER_ORDER goes S+, S, A, B, C, D — index 0 is BEST. So a positive
  // step in the user's mental model ("got better") means moving DOWN in
  // index. Negate accordingly.
  const newIdx = Math.max(
    0,
    Math.min(TIER_ORDER.length - 1, idx - step),
  );
  return TIER_ORDER[newIdx];
}

function MoverColumn({
  label,
  rows,
  byId,
  accent,
}: {
  label: string;
  rows: MetaMover[];
  byId: Map<number, Champion>;
  accent: "emerald" | "red";
}) {
  const accentText =
    accent === "emerald" ? "text-emerald-300" : "text-rift-redbright";
  const arrow = accent === "emerald" ? "↑" : "↓";
  return (
    <div>
      <div
        className={`text-[10px] uppercase tracking-[0.35em] mb-1.5 ${accentText}`}
      >
        {arrow} {label}
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/40">
          —
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => {
            const c = byId.get(m.championId);
            if (!c) return null;
            const wrPct = Math.round(m.shrunkWR * 100);
            // Tier-step: roughly how many tier slots the observed WR
            // would suggest moving the champion. Capped to the visible
            // tier ladder. Sign matches the column.
            const tierStep = Math.round(m.shift * 4);
            const targetTier = projectTier(m.baseTier, tierStep);
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 border border-rift-line/40 bg-rift-bg/40 px-2 py-1.5"
              >
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-7 h-7 border border-rift-line/60 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate">
                    {c.name}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/65">
                    {m.wins}-{m.losses} ·&nbsp;
                    <span className={accentText}>{wrPct}% WR</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
                    Tier
                  </div>
                  <div className="text-[11px] font-display tabular-nums">
                    <span className="text-rift-mutedbright/70">
                      {m.baseTier ?? "—"}
                    </span>
                    {targetTier && targetTier !== m.baseTier && (
                      <>
                        <span className="text-rift-mutedbright/40 mx-0.5">
                          →
                        </span>
                        <span className={accentText}>{targetTier}</span>
                      </>
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
}

export function MetaShiftPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const { rising, falling } = useMemo(
    () => computeMetaMovers(tournament, byId),
    [tournament, byId],
  );
  if (rising.length === 0 && falling.length === 0) return null;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
          Meta Shift
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          Tier vs. observed performance
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <MoverColumn
          label="Rising"
          rows={rising}
          byId={byId}
          accent="emerald"
        />
        <MoverColumn
          label="Falling"
          rows={falling}
          byId={byId}
          accent="red"
        />
      </div>
    </div>
  );
}
