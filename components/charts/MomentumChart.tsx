"use client";

import { memo, useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { MatchEvent } from "@/lib/matchSimulator";

// Momentum / tempo over time. Momentum is bounded [-1, 1] (blue-positive), so
// the chart has a fixed y-domain and just plots each revealed event's
// momentumAfter — the trace rises into blue territory and dips into red, making
// the back-and-forth swings (including comeback stands) clearly visible. Uses
// the same recharts primitives as GoldLeadChart so the rendering is consistent.
// A second, fainter gold trace overlays MAP CONTROL (net enemy towers taken,
// blue-positive) — the slower "who owns the map" signal beneath the tempo
// swings. Normalized to the same [-1,1] band (÷ MAP_NORM) so they share an axis.
const BLUE = "rgb(96 165 250)";
const RED = "rgb(248 113 113)";
const GOLD = "rgb(214 173 99)";
const MAP_NORM = 8; // net towers that maps to a full-height map-control trace

function xTicksFor(duration: number): number[] {
  const out: number[] = [];
  for (let m = 0; m <= duration; m += 10) out.push(m);
  return out;
}

interface Props {
  events: MatchEvent[];
  revealedCount: number;
  durationMinutes: number;
}

export default memo(function MomentumChart({
  events,
  revealedCount,
  durationMinutes,
}: Props) {
  const data = useMemo(() => {
    const pts = [{ minute: 0, blueAbove: 0, redBelow: 0, map: 0 }];
    for (let i = 0; i < revealedCount; i++) {
      const v = events[i].momentumAfter;
      const m = events[i].mapControlAfter ?? 0;
      pts.push({
        minute: events[i].minutes,
        blueAbove: v >= 0 ? v : 0,
        redBelow: v < 0 ? v : 0,
        map: Math.max(-1, Math.min(1, m / MAP_NORM)),
      });
    }
    return pts;
  }, [events, revealedCount]);
  const mapNet =
    revealedCount > 0 ? events[revealedCount - 1].mapControlAfter ?? 0 : 0;

  const last = revealedCount > 0 ? events[revealedCount - 1].momentumAfter : 0;
  const side = last > 0.05 ? "blue" : last < -0.05 ? "red" : "even";
  const headerLabel =
    side === "blue" ? "Blue tempo" : side === "red" ? "Red tempo" : "Even tempo";
  const labelCls =
    side === "blue"
      ? "text-rift-bluebright"
      : side === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const xMax = Math.max(durationMinutes, 5);

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Momentum
          <span className="text-rift-gold/40"> · Map</span>
        </span>
        <span className="flex items-baseline gap-2">
          {mapNet !== 0 && (
            <span className="font-display text-[9px] md:text-[10px] tabular-nums tracking-[0.18em] text-rift-gold/60">
              {mapNet > 0 ? "+" : ""}
              {mapNet} map
            </span>
          )}
          <span
            className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
          >
            {headerLabel}
          </span>
        </span>
      </div>
      <div className="relative h-24 md:h-28 -mx-1">
        <span
          className="pointer-events-none absolute top-1.5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-bluebright/70 z-10"
          aria-hidden
        >
          BLUE
        </span>
        <span
          className="pointer-events-none absolute bottom-5 right-2 text-[8px] font-display tracking-[0.3em] text-rift-redbright/70 z-10"
          aria-hidden
        >
          RED
        </span>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <defs>
              <linearGradient id="mom-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.55} />
                <stop offset="100%" stopColor={BLUE} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="mom-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={RED} stopOpacity={0.55} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, xMax]}
              ticks={xTicksFor(durationMinutes)}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "rgb(120 120 130)", strokeOpacity: 0.3 }}
              interval={0}
              minTickGap={10}
            />
            <YAxis domain={[-1, 1]} hide />
            <ReferenceLine
              y={0}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
            />
            <Area
              type="monotone"
              dataKey="blueAbove"
              baseValue={0}
              stroke={BLUE}
              strokeWidth={1.5}
              fill="url(#mom-blue-fill)"
              isAnimationActive={false}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="redBelow"
              baseValue={0}
              stroke={RED}
              strokeWidth={1.5}
              fill="url(#mom-red-fill)"
              isAnimationActive={false}
              dot={false}
            />
            {/* Map control — fainter gold step line over the tempo fills. */}
            <Line
              type="stepAfter"
              dataKey="map"
              stroke={GOLD}
              strokeWidth={1}
              strokeOpacity={0.6}
              strokeDasharray="2 2"
              isAnimationActive={false}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
