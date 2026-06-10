"use client";

// Shared formatting utilities, Y-axis tick components, and tooltip
// components used by both the live (BetweenGamesView) and replay
// (TournamentDashboard) chart variants.

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a decimal minute value as "MM:SS". */
export function formatClock(min: number): string {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Format absolute gold lead magnitude as compact string: "+3.2k" or "850". */
export function formatGoldLeadAbs(g: number): string {
  const abs = Math.abs(Math.round(g));
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}k`;
  return `${abs}`;
}

// ---------------------------------------------------------------------------
// Win-probability Y-axis tick
// ---------------------------------------------------------------------------

// Flips labels by side: top half reads as Blue's percentage (positive),
// bottom half reads as Red's percentage (also positive). The 50% baseline
// reads "EVEN" in gold. Typed loosely because Recharts passes tick coords
// as string | number.
export function SideAwareYTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number };
}) {
  const v = props.payload?.value ?? 0;
  const isMid = v === 50;
  const isBlueSide = v > 50;
  const display = isMid ? "EVEN" : `${isBlueSide ? v : 100 - v}%`;
  const color = isMid
    ? "rgb(214 173 99)"
    : isBlueSide
    ? "rgb(96 165 250)"
    : "rgb(248 113 113)";
  return (
    <text
      x={props.x}
      y={props.y}
      dy={3}
      textAnchor="end"
      fill={color}
      fontSize={9}
      opacity={0.85}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Gold-lead Y-axis tick (shared; previously GoldYTick / GoldYTickReplay —
// both were pixel-identical)
// ---------------------------------------------------------------------------

export function GoldYTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: number };
}) {
  const v = props.payload?.value ?? 0;
  const isMid = v === 0;
  const isBlue = v > 0;
  const display = isMid ? "EVEN" : `${formatGoldLeadAbs(v)}g`;
  const color = isMid
    ? "rgb(214 173 99)"
    : isBlue
    ? "rgb(96 165 250)"
    : "rgb(248 113 113)";
  return (
    <text
      x={props.x}
      y={props.y}
      dy={3}
      textAnchor="end"
      fill={color}
      fontSize={9}
      opacity={0.85}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {display}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Win-probability tooltip — live variant
// ---------------------------------------------------------------------------

interface LiveWpTooltipPoint {
  minute: number;
  blue: number;
  side: "blue" | "red";
  desc: string;
}

export function WinProbLiveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: LiveWpTooltipPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const bluePct = Math.round(p.blue);
  const labelCls =
    p.side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div className="border border-rift-gold/40 bg-rift-bg/95 backdrop-blur px-2 py-1.5 text-[10px] shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular-nums tracking-[0.15em] text-rift-goldbright">
          {formatClock(p.minute)}
        </span>
        <span className={`tabular-nums tracking-[0.1em] ${labelCls}`}>
          {bluePct >= 50 ? `Blue ${bluePct}%` : `Red ${100 - bluePct}%`}
        </span>
      </div>
      <div className="text-rift-mutedbright text-[9px] mt-0.5 max-w-[220px] truncate">
        {p.desc}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win-probability tooltip — replay variant
// ---------------------------------------------------------------------------

export function WinProbReplayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { minute: number; blue: number } }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const blue = point.blue;
  const minute = typeof label === "number" ? label : point.minute;
  return (
    <div className="bg-rift-panel border border-rift-gold/60 px-2 py-1 text-[10px] tabular-nums font-display">
      <div className="text-rift-mutedbright/70 uppercase tracking-[0.25em] text-[8px]">
        {Math.round(minute)} min
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-rift-bluebright">{Math.round(blue)}%</span>
        <span className="text-rift-mutedbright/40">/</span>
        <span className="text-rift-redbright">{100 - Math.round(blue)}%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gold-lead tooltip — live variant
// ---------------------------------------------------------------------------

interface GoldChartPoint {
  minute: number;
  goldLead: number;
  desc: string;
}

export function GoldLeadLiveTooltip({
  active,
  payload,
  blueTeam,
  redTeam,
}: {
  active?: boolean;
  payload?: { payload?: GoldChartPoint }[];
  blueTeam: string;
  redTeam: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const isBlueAhead = p.goldLead >= 0;
  const leaderName = isBlueAhead ? blueTeam : redTeam;
  const leaderCls = isBlueAhead ? "text-rift-bluebright" : "text-rift-redbright";
  return (
    <div className="border border-rift-gold/40 bg-rift-bg/95 backdrop-blur px-2 py-1.5 text-[10px] shadow-lg">
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular-nums tracking-[0.15em] text-rift-goldbright">
          {formatClock(p.minute)}
        </span>
        <span className={`tabular-nums tracking-[0.1em] ${leaderCls}`}>
          {leaderName} +{formatGoldLeadAbs(p.goldLead)}g
        </span>
      </div>
      <div className="text-rift-mutedbright text-[9px] mt-0.5 max-w-[220px] truncate">
        {p.desc}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gold-lead tooltip — replay variant
// ---------------------------------------------------------------------------

export function GoldLeadReplayTooltip({
  active,
  payload,
  blueTeam,
  redTeam,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { minute: number; goldLead: number };
  }>;
  blueTeam: string;
  redTeam: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const isBlueAhead = p.goldLead >= 0;
  const leaderName = isBlueAhead ? blueTeam : redTeam;
  const leaderCls = isBlueAhead
    ? "text-rift-bluebright"
    : "text-rift-redbright";
  return (
    <div className="bg-rift-panel border border-rift-gold/60 px-2 py-1 text-[10px] tabular-nums font-display">
      <div className="text-rift-mutedbright/70 uppercase tracking-[0.25em] text-[8px]">
        {Math.round(p.minute)} min
      </div>
      <div className={`mt-0.5 ${leaderCls}`}>
        {Math.abs(p.goldLead) < 250
          ? "Even gold"
          : `${leaderName} +${formatGoldLeadAbs(p.goldLead)}g`}
      </div>
    </div>
  );
}
