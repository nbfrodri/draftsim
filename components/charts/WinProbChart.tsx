"use client";

import { memo, useMemo } from "react";
import {
  Area,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EventType, MatchEvent } from "@/lib/matchSimulator";
import type { GameRecap, Side } from "@/lib/types";
import {
  SideAwareYTick,
  WinProbLiveTooltip,
  WinProbReplayTooltip,
} from "./shared";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SPARKLINE_MARKER_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "baron",
  "elder",
  "ace",
  "shutdown",
  "power-spike",
  "nexus",
]);

// Cursor style is identical across both variants.
const TOOLTIP_CURSOR = {
  stroke: "rgb(214 173 99)",
  strokeOpacity: 0.5,
  strokeDasharray: "2 3",
  strokeWidth: 1.2,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the live (BetweenGamesView) variant. */
interface LiveProps {
  variant: "live";
  events: MatchEvent[];
  revealedCount: number;
  durationMinutes: number;
}

/** Props for the replay (TournamentDashboard) variant. */
interface ReplayProps {
  variant: "replay";
  timeline: Array<{ minute: number; blueProb: number }>;
  events: Array<{
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number;
  }>;
  biggestSwing: GameRecap["biggestSwing"];
}

export type WinProbChartProps = LiveProps | ReplayProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Memoized: in the live variant, `events` is the stable timeline array and
// the chart only depends on revealedCount/durationMinutes, so the whole
// recharts SVG re-renders once per event reveal instead of on every
// playback clock update.
function WinProbChart(props: WinProbChartProps) {
  if (props.variant === "live") {
    return <WinProbLive {...props} />;
  }
  return <WinProbReplay {...props} />;
}

export default memo(WinProbChart);

// ---------------------------------------------------------------------------
// Live variant (previously WinProbSparkline in BetweenGamesView)
// ---------------------------------------------------------------------------

interface ChartPoint {
  minute: number;
  blueAbove: number | null;
  redBelow: number | null;
  blue: number;
  side: Side;
  desc: string;
  type: EventType;
}

interface MarkerPoint {
  minute: number;
  blue: number;
  side: Side;
  desc: string;
  type: EventType;
}

function WinProbLive({
  events,
  revealedCount,
  durationMinutes,
}: LiveProps) {
  const data = useMemo<ChartPoint[]>(() => {
    const pts: ChartPoint[] = [
      {
        minute: 0,
        blue: 50,
        blueAbove: 50,
        redBelow: 50,
        side: "blue",
        desc: "Match start — even",
        type: "first-blood",
      },
    ];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      const v = e.winProbAfter * 100;
      pts.push({
        minute: e.minutes,
        blue: v,
        blueAbove: v >= 50 ? v : 50,
        redBelow: v < 50 ? v : 50,
        side: e.side,
        desc: e.description,
        type: e.type,
      });
    }
    return pts;
  }, [events, revealedCount]);

  const markers = useMemo<MarkerPoint[]>(() => {
    const out: MarkerPoint[] = [];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      if (SPARKLINE_MARKER_EVENTS.has(e.type)) {
        out.push({
          minute: e.minutes,
          blue: e.winProbAfter * 100,
          side: e.side,
          desc: e.description,
          type: e.type,
        });
      }
    }
    return out;
  }, [events, revealedCount]);

  // Dynamic Y-domain so 5pp shifts look meaningful rather than tiny ripples.
  const yDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [25, 75];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data) {
      if (p.blue < lo) lo = p.blue;
      if (p.blue > hi) hi = p.blue;
    }
    lo = Math.min(lo, 50);
    hi = Math.max(hi, 50);
    lo = Math.max(0, Math.floor(lo) - 8);
    hi = Math.min(100, Math.ceil(hi) + 8);
    if (hi - lo < 40) {
      const center = (lo + hi) / 2;
      lo = Math.max(0, center - 20);
      hi = Math.min(100, center + 20);
    }
    return [lo, hi];
  }, [data]);

  const yTicks = useMemo<number[]>(() => {
    const [lo, hi] = yDomain;
    const candidates = [10, 25, 35, 50, 65, 75, 90];
    return candidates.filter((v) => v >= lo + 2 && v <= hi - 2);
  }, [yDomain]);

  const last = data[data.length - 1];
  const probPct = Math.round(last.blue);
  const leadingSide: Side | "even" =
    last.blue > 55 ? "blue" : last.blue < 45 ? "red" : "even";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue favored ${probPct}%`
      : leadingSide === "red"
      ? `Red favored ${100 - probPct}%`
      : "Coin flip";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const dotColor =
    leadingSide === "blue"
      ? "rgb(96 165 250)"
      : leadingSide === "red"
      ? "rgb(248 113 113)"
      : "rgb(180 180 180)";

  const tickStep = durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Win Probability
        </span>
        <span className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}>
          {headerLabel}
        </span>
      </div>
      <div className="relative h-40 md:h-48 -mx-1">
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
              <linearGradient id="wp-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="wp-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="wp-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, durationMinutes]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{ stroke: "rgb(120 120 130)", strokeOpacity: 0.3 }}
              interval={0}
              minTickGap={10}
            />
            <YAxis
              domain={yDomain}
              ticks={yTicks}
              tick={SideAwareYTick}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <ReferenceLine
              y={50}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={75}
              stroke="rgb(96 165 250)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <ReferenceLine
              y={25}
              stroke="rgb(248 113 113)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <Area
              type="monotone"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#wp-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={50}
            />
            <Area
              type="monotone"
              dataKey="redBelow"
              stroke="none"
              fill="url(#wp-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              connectNulls
              baseValue={50}
            />
            <Area
              type="monotone"
              dataKey="blue"
              stroke="url(#wp-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              activeDot={{
                r: 5,
                stroke: "rgb(228 192 122)",
                strokeWidth: 2,
                fill: "rgb(20 22 30)",
              }}
              isAnimationActive={false}
            />
            {markers.map((m, i) => (
              <ReferenceDot
                key={`marker-${i}`}
                x={m.minute}
                y={m.blue}
                r={4.5}
                fill={
                  m.side === "blue" ? "rgb(96 165 250)" : "rgb(248 113 113)"
                }
                stroke="rgb(20 22 30)"
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            {revealedCount > 0 && (
              <ReferenceDot
                x={last.minute}
                y={last.blue}
                r={4}
                fill={dotColor}
                stroke={dotColor}
                strokeOpacity={0.5}
                strokeWidth={4}
                ifOverflow="visible"
              />
            )}
            <Tooltip
              content={<WinProbLiveTooltip />}
              cursor={TOOLTIP_CURSOR}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Replay variant (previously WinProbChart in TournamentDashboard)
// ---------------------------------------------------------------------------

function WinProbReplay({ timeline, events, biggestSwing }: ReplayProps) {
  // Build series with synthetic crossing points so the area fills split
  // cleanly at the 50% baseline without visible gaps or overlap.
  const data = useMemo(() => {
    type ChartPt = {
      minute: number;
      blue: number;
      blueAbove: number;
      redBelow: number;
    };
    const series: ChartPt[] = [];
    const push = (minute: number, blue: number) => {
      series.push({
        minute,
        blue,
        blueAbove: blue >= 50 ? blue : 50,
        redBelow: blue < 50 ? blue : 50,
      });
    };
    push(0, 50);
    let prev: { minute: number; blue: number } = { minute: 0, blue: 50 };
    for (const p of timeline) {
      const v = p.blueProb * 100;
      const crossesUp = prev.blue < 50 && v >= 50;
      const crossesDown = prev.blue >= 50 && v < 50;
      if ((crossesUp || crossesDown) && p.minute > prev.minute) {
        const denom = v - prev.blue;
        if (Math.abs(denom) > 1e-6) {
          const tStar =
            prev.minute + ((p.minute - prev.minute) * (50 - prev.blue)) / denom;
          push(tStar, 50);
        }
      }
      push(p.minute, v);
      prev = { minute: p.minute, blue: v };
    }
    return series;
  }, [timeline]);

  const durationMinutes = data.length > 0 ? data[data.length - 1].minute : 30;
  const tickStep =
    durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const xTicks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) xTicks.push(m);

  const finalProb = data.length > 0 ? data[data.length - 1].blue : 50;
  const leadingSide = finalProb > 55 ? "blue" : finalProb < 45 ? "red" : null;
  const leadingLabel =
    leadingSide === "blue"
      ? `Blue ${Math.round(finalProb)}%`
      : leadingSide === "red"
      ? `Red ${Math.round(100 - finalProb)}%`
      : "Coin flip";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Win Probability
        </span>
        <span
          className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
        >
          {leadingLabel}
        </span>
      </div>
      <div className="relative h-40 md:h-48 -mx-1">
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
              <linearGradient id="rep-wp-blue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="rgb(96 165 250)"
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor="rgb(96 165 250)"
                  stopOpacity={0.04}
                />
              </linearGradient>
              <linearGradient id="rep-wp-red-fill" x1="0" y1="1" x2="0" y2="0">
                <stop
                  offset="0%"
                  stopColor="rgb(248 113 113)"
                  stopOpacity={0.55}
                />
                <stop
                  offset="100%"
                  stopColor="rgb(248 113 113)"
                  stopOpacity={0.04}
                />
              </linearGradient>
              <linearGradient id="rep-wp-curve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, Math.max(durationMinutes, 5)]}
              ticks={xTicks}
              tickFormatter={(m) => `${m}'`}
              tick={{ fill: "rgb(160 160 170)", fontSize: 10, opacity: 0.7 }}
              tickLine={false}
              axisLine={{
                stroke: "rgb(120 120 130)",
                strokeOpacity: 0.3,
              }}
              interval={0}
              minTickGap={10}
            />
            <YAxis domain={[0, 100]} hide />
            <ReferenceLine
              y={50}
              stroke="rgb(214 173 99)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              label={{
                value: "EVEN",
                position: "insideRight",
                fill: "rgb(214 173 99)",
                fontSize: 8,
                opacity: 0.6,
                offset: 4,
              }}
            />
            <ReferenceLine
              y={75}
              stroke="rgb(96 165 250)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <ReferenceLine
              y={25}
              stroke="rgb(248 113 113)"
              strokeOpacity={0.18}
              strokeDasharray="1.5 4"
            />
            <Area
              type="linear"
              dataKey="blueAbove"
              stroke="none"
              fill="url(#rep-wp-blue-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={50}
            />
            <Area
              type="linear"
              dataKey="redBelow"
              stroke="none"
              fill="url(#rep-wp-red-fill)"
              fillOpacity={1}
              isAnimationActive={false}
              baseValue={50}
            />
            <Area
              type="linear"
              dataKey="blue"
              stroke="url(#rep-wp-curve)"
              strokeWidth={2.4}
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
            {events.map((e, i) => {
              const point = timeline.find(
                (p) => Math.abs(p.minute - e.minute) < 0.05,
              );
              if (!point) return null;
              return (
                <ReferenceDot
                  key={`evt-${i}`}
                  x={point.minute}
                  y={point.blueProb * 100}
                  r={4}
                  fill={
                    e.side === "blue"
                      ? "rgb(96 165 250)"
                      : "rgb(248 113 113)"
                  }
                  stroke="rgb(20 22 30)"
                  strokeWidth={1.4}
                  ifOverflow="visible"
                />
              );
            })}
            {biggestSwing && (
              <ReferenceDot
                x={Math.round(biggestSwing.minute * 10) / 10}
                y={
                  ((timeline.find(
                    (p) => Math.abs(p.minute - biggestSwing.minute) < 0.1,
                  )?.blueProb ?? 0.5) *
                    100)
                }
                r={6}
                fill="rgba(240, 200, 100, 0.9)"
                stroke="rgb(20 22 30)"
                strokeWidth={1.6}
                ifOverflow="visible"
              />
            )}
            <Tooltip
              cursor={TOOLTIP_CURSOR}
              content={<WinProbReplayTooltip />}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {events.length > 0 && (
        <div className="mt-3 border-t border-rift-line/30 pt-2">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
            Key Events
          </div>
          <div className="max-h-36 overflow-y-auto text-[10px] space-y-0.5 pr-1">
            {events.map((e, i) => (
              <div
                key={i}
                className="grid grid-cols-[2.5rem_0.6rem_1fr_3rem] items-center gap-2 px-1 py-1 border-b border-rift-line/15 last:border-b-0"
              >
                <span className="tabular-nums text-rift-mutedbright/55 text-right">
                  {Math.round(e.minute)}&prime;
                </span>
                <span
                  className={`block w-2 h-2 rounded-full ${
                    e.side === "blue"
                      ? "bg-rift-bluebright"
                      : "bg-rift-redbright"
                  }`}
                  aria-hidden
                />
                <span className="truncate text-rift-mutedbright/90">
                  {e.description}
                </span>
                <span
                  className={`text-right tabular-nums font-display ${
                    e.probDelta > 0
                      ? "text-rift-bluebright"
                      : "text-rift-redbright"
                  }`}
                >
                  {e.probDelta > 0 ? "+" : ""}
                  {(e.probDelta * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
