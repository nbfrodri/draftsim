"use client";

import React, { memo, useMemo } from "react";
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
import type { Side } from "@/lib/types";
import {
  formatGoldLeadAbs,
  GoldLeadLiveTooltip,
  GoldLeadReplayTooltip,
  GoldYTick,
} from "./shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANE_ORDER: readonly ("top" | "jungle" | "middle" | "bottom" | "support")[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

const GOLD_MARKER_EVENTS: ReadonlySet<EventType> = new Set([
  "soul",
  "baron",
  "elder",
  "ace",
  "shutdown",
  "power-spike",
  "nexus",
]);

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
  currentMin: number;
  laneAdvantages: Record<"top" | "jungle" | "middle" | "bottom" | "support", number>;
  laningEndMinute: number;
  blueTeam: string;
  redTeam: string;
}

/** Props for the replay (TournamentDashboard) variant. */
interface ReplayProps {
  variant: "replay";
  timeline: Array<{ minute: number; goldLead: number }>;
  notableEvents: Array<{
    minute: number;
    side: Side;
    type: string;
    description: string;
    probDelta: number;
  }>;
  blueTeam: string;
  redTeam: string;
}

export type GoldLeadChartProps = LiveProps | ReplayProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Memoized: the live variant legitimately depends on currentMin (gold
// accrues with the clock), but that prop is throttled upstream, so memo
// caps SVG rebuilds at the throttled playback update rate.
function GoldLeadChart(props: GoldLeadChartProps) {
  if (props.variant === "live") {
    return <GoldLeadLive {...props} />;
  }
  return <GoldLeadReplay {...props} />;
}

export default memo(GoldLeadChart);

// ---------------------------------------------------------------------------
// Shared Y-domain and Y-ticks logic
// ---------------------------------------------------------------------------

function computeYDomain(data: { goldLead: number }[]): [number, number] {
  let extreme = 2000;
  for (const p of data) {
    const a = Math.abs(p.goldLead);
    if (a > extreme) extreme = a;
  }
  extreme = Math.ceil(extreme * 1.15);
  return [-extreme, extreme];
}

function computeYTicks([lo, hi]: [number, number]): number[] {
  const mag = Math.max(Math.abs(lo), Math.abs(hi));
  const step =
    mag > 12000 ? 5000 : mag > 6000 ? 2500 : mag > 2500 ? 1000 : 500;
  const ticks: number[] = [0];
  for (let v = step; v <= hi - step / 2; v += step) ticks.push(v);
  for (let v = -step; v >= lo + step / 2; v -= step) ticks.push(v);
  return ticks.sort((a, b) => a - b);
}

function computeXTicks(durationMinutes: number): number[] {
  const tickStep = durationMinutes >= 30 ? 5 : durationMinutes >= 18 ? 4 : 3;
  const ticks: number[] = [0];
  for (let m = tickStep; m <= durationMinutes; m += tickStep) ticks.push(m);
  return ticks;
}

// ---------------------------------------------------------------------------
// Shared chart shell (identical JSX between both variants)
// ---------------------------------------------------------------------------

interface GoldChartPt {
  minute: number;
  goldLead: number;
  blueAbove: number;
  redBelow: number;
}

interface ChartShellProps {
  data: GoldChartPt[];
  durationMinutes: number;
  headerLabel: string;
  labelCls: string;
  /** True = exact domain; false = pad to Math.max(durationMinutes, 5). */
  exactXDomain: boolean;
  gradientPrefix: string; // e.g. "gold" | "rep-gold"
  children: React.ReactNode; // ReferenceDots + Tooltip (variant-specific)
}

function GoldChartShell({
  data,
  durationMinutes,
  headerLabel,
  labelCls,
  exactXDomain,
  gradientPrefix,
  children,
}: ChartShellProps) {
  const yDomain = useMemo(() => computeYDomain(data), [data]);
  const yTicks = useMemo(() => computeYTicks(yDomain), [yDomain]);
  const xTicks = useMemo(() => computeXTicks(durationMinutes), [durationMinutes]);
  const xMax = exactXDomain
    ? durationMinutes
    : Math.max(durationMinutes, 5);

  const blueFillId = `${gradientPrefix}-blue-fill`;
  const redFillId = `${gradientPrefix}-red-fill`;
  const curveId = `${gradientPrefix}-curve`;

  return (
    <div className="border-t border-rift-line/40 mt-3 pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Gold Lead
        </span>
        <span
          className={`font-display text-[10px] md:text-[11px] tabular-nums tracking-[0.18em] ${labelCls}`}
        >
          {headerLabel}
        </span>
      </div>
      <div className="relative h-32 md:h-40 -mx-1">
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
              <linearGradient id={blueFillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(96 165 250)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id={redFillId} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(248 113 113)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="rgb(248 113 113)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id={curveId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(150 200 255)" />
                <stop offset="50%" stopColor="rgb(228 192 122)" />
                <stop offset="100%" stopColor="rgb(255 160 160)" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, xMax]}
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
              tick={GoldYTick}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine
              y={0}
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
            {/* The Area interpolation type differs: live uses "monotone"
                (smoother, ok for event-boundary data); replay uses "linear"
                with synthetic crossing points (prevents zone bleed). */}
            {children}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live variant (previously GoldLeadSparkline in BetweenGamesView)
// ---------------------------------------------------------------------------

interface GoldMarkerPoint {
  minute: number;
  goldLead: number;
  side: Side;
  desc: string;
  type: EventType;
}

function GoldLeadLive({
  events,
  revealedCount,
  durationMinutes,
  currentMin,
  laneAdvantages,
  laningEndMinute,
  blueTeam,
  redTeam,
}: LiveProps) {
  const laneAdvSum = useMemo(() => {
    let s = 0;
    for (const lane of LANE_ORDER) s += laneAdvantages[lane];
    return s;
  }, [laneAdvantages]);

  const data = useMemo<GoldChartPt[]>(() => {
    const cumulativeAt: number[] = [];
    let running = 0;
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      for (const lane of LANE_ORDER) running += e.laneGoldDelta[lane] ?? 0;
      cumulativeAt.push(running);
    }

    const goldAt = (t: number): number => {
      let idx = -1;
      for (let i = 0; i < revealedCount; i++) {
        if (events[i].minutes <= t) idx = i;
        else break;
      }
      const eventGold = idx >= 0 ? cumulativeAt[idx] : 0;
      const lanePhaseTime = Math.min(t, laningEndMinute);
      return Math.round(laneAdvSum * lanePhaseTime + eventGold);
    };

    const pts: GoldChartPt[] = [
      {
        minute: 0,
        goldLead: 0,
        blueAbove: 0,
        redBelow: 0,
      },
    ];

    const seen = new Set<string>();
    const pushPoint = (minute: number) => {
      const key = minute.toFixed(1);
      if (seen.has(key)) return;
      seen.add(key);
      const v = goldAt(minute);
      pts.push({
        minute,
        goldLead: v,
        blueAbove: v >= 0 ? v : 0,
        redBelow: v < 0 ? v : 0,
      });
    };

    const interpEnd = Math.min(currentMin, laningEndMinute);
    for (let m = 1; m <= Math.floor(interpEnd); m++) {
      pushPoint(m);
    }

    for (let i = 0; i < revealedCount; i++) {
      pushPoint(events[i].minutes);
    }

    if (currentMin > 0) {
      pushPoint(currentMin);
    }

    pts.sort((a, b) => a.minute - b.minute);
    return pts;
  }, [events, revealedCount, currentMin, laneAdvSum, laningEndMinute]);

  const markers = useMemo<GoldMarkerPoint[]>(() => {
    const out: GoldMarkerPoint[] = [];
    for (let i = 0; i < revealedCount; i++) {
      const e = events[i];
      if (GOLD_MARKER_EVENTS.has(e.type)) {
        out.push({
          minute: e.minutes,
          goldLead: e.goldLeadAfter ?? 0,
          side: e.side,
          desc: e.description,
          type: e.type,
        });
      }
    }
    return out;
  }, [events, revealedCount]);

  const last = data[data.length - 1];
  const lead = last.goldLead;
  const leadingSide: Side | "even" =
    Math.abs(lead) < 250 ? "even" : lead > 0 ? "blue" : "red";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue +${formatGoldLeadAbs(lead)}g`
      : leadingSide === "red"
      ? `Red +${formatGoldLeadAbs(lead)}g`
      : "Even gold";
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

  return (
    <GoldChartShell
      data={data}
      durationMinutes={durationMinutes}
      headerLabel={headerLabel}
      labelCls={labelCls}
      exactXDomain={true}
      gradientPrefix="gold"
    >
      <Area
        type="monotone"
        dataKey="blueAbove"
        stroke="none"
        fill="url(#gold-blue-fill)"
        fillOpacity={1}
        isAnimationActive={false}
        connectNulls
        baseValue={0}
      />
      <Area
        type="monotone"
        dataKey="redBelow"
        stroke="none"
        fill="url(#gold-red-fill)"
        fillOpacity={1}
        isAnimationActive={false}
        connectNulls
        baseValue={0}
      />
      <Area
        type="monotone"
        dataKey="goldLead"
        stroke="url(#gold-curve)"
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
          key={`gold-marker-${i}`}
          x={m.minute}
          y={m.goldLead}
          r={m.type === "power-spike" ? 3.5 : 4.5}
          fill={
            m.type === "power-spike"
              ? "rgb(228 192 122)"
              : m.side === "blue"
              ? "rgb(96 165 250)"
              : "rgb(248 113 113)"
          }
          stroke="rgb(20 22 30)"
          strokeWidth={1.5}
          ifOverflow="visible"
        />
      ))}
      {revealedCount > 0 && (
        <ReferenceDot
          x={last.minute}
          y={last.goldLead}
          r={4}
          fill={dotColor}
          stroke={dotColor}
          strokeOpacity={0.5}
          strokeWidth={4}
          ifOverflow="visible"
        />
      )}
      <Tooltip
        content={<GoldLeadLiveTooltip blueTeam={blueTeam} redTeam={redTeam} />}
        cursor={TOOLTIP_CURSOR}
      />
    </GoldChartShell>
  );
}

// ---------------------------------------------------------------------------
// Replay variant (previously GoldLeadChart in TournamentDashboard)
// ---------------------------------------------------------------------------

function GoldLeadReplay({
  timeline,
  notableEvents,
  blueTeam,
  redTeam,
}: ReplayProps) {
  // Build series with synthetic crossing points at the 0 baseline so colored
  // zones don't bleed past the midline. Mirror of WinProbChart replay logic.
  const data = useMemo(() => {
    const series: GoldChartPt[] = [];
    const push = (minute: number, gold: number) => {
      series.push({
        minute,
        goldLead: gold,
        blueAbove: gold >= 0 ? gold : 0,
        redBelow: gold < 0 ? gold : 0,
      });
    };
    push(0, 0);
    let prev = { minute: 0, goldLead: 0 };
    for (const p of timeline) {
      const v = p.goldLead;
      const crossesUp = prev.goldLead < 0 && v >= 0;
      const crossesDown = prev.goldLead >= 0 && v < 0;
      if ((crossesUp || crossesDown) && p.minute > prev.minute) {
        const denom = v - prev.goldLead;
        if (Math.abs(denom) > 1e-6) {
          const tStar =
            prev.minute +
            ((p.minute - prev.minute) * (0 - prev.goldLead)) / denom;
          push(tStar, 0);
        }
      }
      push(p.minute, v);
      prev = { minute: p.minute, goldLead: v };
    }
    return series;
  }, [timeline]);

  const durationMinutes = data.length > 0 ? data[data.length - 1].minute : 30;

  const last = data[data.length - 1];
  const lead = last?.goldLead ?? 0;
  const leadingSide: Side | "even" =
    Math.abs(lead) < 250 ? "even" : lead > 0 ? "blue" : "red";
  const headerLabel =
    leadingSide === "blue"
      ? `Blue +${formatGoldLeadAbs(lead)}g`
      : leadingSide === "red"
      ? `Red +${formatGoldLeadAbs(lead)}g`
      : "Even gold";
  const labelCls =
    leadingSide === "blue"
      ? "text-rift-bluebright"
      : leadingSide === "red"
      ? "text-rift-redbright"
      : "text-rift-mutedbright";

  return (
    <GoldChartShell
      data={data}
      durationMinutes={durationMinutes}
      headerLabel={headerLabel}
      labelCls={labelCls}
      exactXDomain={false}
      gradientPrefix="rep-gold"
    >
      <Area
        type="linear"
        dataKey="blueAbove"
        stroke="none"
        fill="url(#rep-gold-blue-fill)"
        fillOpacity={1}
        isAnimationActive={false}
        baseValue={0}
      />
      <Area
        type="linear"
        dataKey="redBelow"
        stroke="none"
        fill="url(#rep-gold-red-fill)"
        fillOpacity={1}
        isAnimationActive={false}
        baseValue={0}
      />
      <Area
        type="linear"
        dataKey="goldLead"
        stroke="url(#rep-gold-curve)"
        strokeWidth={2.4}
        fill="none"
        dot={false}
        isAnimationActive={false}
      />
      {notableEvents.map((e, i) => {
        const pt = timeline.find(
          (p) => Math.abs(p.minute - e.minute) < 0.15,
        );
        if (!pt) return null;
        return (
          <ReferenceDot
            key={`gold-evt-${i}`}
            x={pt.minute}
            y={pt.goldLead}
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
      <Tooltip
        cursor={TOOLTIP_CURSOR}
        content={
          <GoldLeadReplayTooltip blueTeam={blueTeam} redTeam={redTeam} />
        }
      />
    </GoldChartShell>
  );
}
