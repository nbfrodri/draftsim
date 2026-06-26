"use client";

import { memo } from "react";
import type { EventType } from "@/lib/matchSimulator";
import type { Side } from "@/lib/types";
import EventIcon from "@/components/EventIcon";
import { type RunningStats, formatGold } from "../shared";

// ─── GoldHUD ──────────────────────────────────────────────────────────────────

// Esports-broadcast style gold display — big numbers each side, with a
// tug-of-war bar in between. The bar's center is the "even" mark; fill
// extends from center toward the leading team, magnitude scaled to a 10k
// reference lead (anything beyond fills the bar fully).
function GoldHUD({
  blueGold,
  redGold,
}: {
  blueGold: number;
  redGold: number;
}) {
  const lead = blueGold - redGold;
  const leadAbs = Math.abs(lead);
  const leadSide: Side | "even" =
    lead > 200 ? "blue" : lead < -200 ? "red" : "even";
  const fillPct = Math.min(50, (leadAbs / 10000) * 50);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
        <div className="text-right">
          <div className="text-rift-bluebright font-display text-2xl md:text-3xl tabular-nums leading-none">
            {formatGold(blueGold)}
          </div>
        </div>
        <div className="text-rift-goldbright/70 text-base md:text-lg" aria-hidden>
          ◆
        </div>
        <div className="text-left">
          <div className="text-rift-redbright font-display text-2xl md:text-3xl tabular-nums leading-none">
            {formatGold(redGold)}
          </div>
        </div>
      </div>

      {/* Tug-of-war: center marker + fill extending toward the leading side. */}
      <div className="relative h-2 bg-rift-bg/80 border border-rift-line/60 overflow-hidden">
        {leadSide === "blue" && (
          <div
            className="absolute top-0 bottom-0 right-1/2 bg-gradient-to-l from-rift-blue to-rift-bluedeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        {leadSide === "red" && (
          <div
            className="absolute top-0 bottom-0 left-1/2 bg-gradient-to-r from-rift-red to-rift-reddeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        <div
          className="absolute left-1/2 top-0 bottom-0 w-px bg-rift-goldbright/70 -translate-x-1/2"
          aria-hidden
        />
      </div>

      <div className="text-center text-[9px] md:text-[10px] uppercase tracking-[0.3em]">
        {leadSide === "even" ? (
          <span className="text-rift-muted">Gold even</span>
        ) : (
          <>
            <span className="text-rift-goldbright tabular-nums">
              +{formatGold(leadAbs)}
            </span>
            <span className="text-rift-muted mx-1.5">for</span>
            <span
              className={
                leadSide === "blue" ? "text-rift-bluebright" : "text-rift-redbright"
              }
            >
              {leadSide === "blue" ? "Blue" : "Red"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── FaceOffRow ───────────────────────────────────────────────────────────────

function FaceOffRow({
  icon,
  label,
  blue,
  red,
  soulSide,
}: {
  icon: EventType;
  label: string;
  blue: number;
  red: number;
  soulSide?: Side | null;
}) {
  const lead =
    blue > red ? "blue" : red > blue ? "red" : "even";
  // Stat counts use a fixed palette that doesn't depend on side colors:
  //   • leading side → bright gold (highlights the bigger number)
  //   • trailing side → muted
  // Soul still gets emphasized gold + display font.
  const blueCls =
    soulSide === "blue"
      ? "text-rift-goldbright font-display"
      : lead === "blue"
      ? "text-rift-goldbright font-display"
      : "text-rift-mutedbright";
  const redCls =
    soulSide === "red"
      ? "text-rift-goldbright font-display"
      : lead === "red"
      ? "text-rift-goldbright font-display"
      : "text-rift-mutedbright";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div
        className={`text-right text-base md:text-lg tabular-nums leading-tight ${blueCls}`}
      >
        {blue}
      </div>
      <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-muted px-2 min-w-[5rem] justify-center">
        <EventIcon type={icon} size={11} />
        <span>{label}</span>
      </div>
      <div
        className={`text-left text-base md:text-lg tabular-nums leading-tight ${redCls}`}
      >
        {red}
      </div>
    </div>
  );
}

// ─── Tempo bar ────────────────────────────────────────────────────────────────

// Surfaces the "who has the initiative" state — momentum (−1..1, blue-positive)
// as a center-out tug-of-war, with the net tower (map-control) edge labelled.
// This is the running tempo, not a per-event count, so it ebbs and flows.
function TempoBar({
  momentum,
  mapControl,
}: {
  momentum: number;
  mapControl: number;
}) {
  const m = Math.max(-1, Math.min(1, momentum));
  const side: Side | "even" = m > 0.05 ? "blue" : m < -0.05 ? "red" : "even";
  const fillPct = Math.min(50, Math.abs(m) * 50);
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 bg-rift-bg/80 border border-rift-line/60 overflow-hidden">
        {side === "blue" && (
          <div
            className="absolute top-0 bottom-0 right-1/2 bg-gradient-to-l from-rift-blue to-rift-bluedeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        {side === "red" && (
          <div
            className="absolute top-0 bottom-0 left-1/2 bg-gradient-to-r from-rift-red to-rift-reddeep transition-[width] duration-300"
            style={{ width: `${fillPct}%` }}
          />
        )}
        <div
          className="absolute left-1/2 top-0 bottom-0 w-px bg-rift-goldbright/70 -translate-x-1/2"
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-center gap-2 text-[8px] md:text-[9px] uppercase tracking-[0.25em] text-rift-muted">
        <span>Tempo</span>
        {mapControl !== 0 && (
          <span
            className={
              mapControl > 0 ? "text-rift-bluebright" : "text-rift-redbright"
            }
          >
            Map {mapControl > 0 ? "+" : ""}
            {mapControl}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Objective badge ──────────────────────────────────────────────────────────

// A side-coloured pill for a secured game-state objective (Soul element,
// Elder, Atakhan variant) — surfaces ownership the count rows can't show.
function ObjBadge({
  side,
  icon,
  label,
}: {
  side: Side;
  icon: EventType;
  label: string;
}) {
  const sideCls =
    side === "blue"
      ? "border-rift-blue/50 text-rift-bluebright bg-rift-blue/10"
      : "border-rift-red/50 text-rift-redbright bg-rift-red/10";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[8px] md:text-[9px] uppercase tracking-[0.15em] ${sideCls}`}
    >
      <EventIcon type={icon} size={10} />
      {label}
    </span>
  );
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

// Memoized: `stats` only changes identity when an event reveals; `gold`
// changes with the (throttled) clock. Skips re-rendering in between.
export const Scoreboard = memo(function Scoreboard({
  stats,
  gold,
}: {
  stats: RunningStats;
  gold: { blue: number; red: number; lead: number };
}) {
  return (
    <div className="space-y-3">
      <GoldHUD blueGold={gold.blue} redGold={gold.red} />
      <TempoBar momentum={stats.momentum} mapControl={stats.mapControl} />
      <div className="border-t border-rift-line/40 pt-2 space-y-1">
        <FaceOffRow
          icon="first-blood"
          label="Kills"
          blue={stats.kills.blue}
          red={stats.kills.red}
        />
        <FaceOffRow
          icon={stats.hasSoul ? "soul" : "dragon"}
          label="Drakes"
          blue={stats.drakes.blue}
          red={stats.drakes.red}
          soulSide={stats.hasSoul}
        />
        <FaceOffRow
          icon="baron"
          label="Barons"
          blue={stats.barons.blue}
          red={stats.barons.red}
        />
        <FaceOffRow
          icon="tower"
          label="Towers"
          blue={stats.towers.blue}
          red={stats.towers.red}
        />
        {(stats.inhibs.blue > 0 || stats.inhibs.red > 0) && (
          <FaceOffRow
            icon="inhibitor"
            label="Inhibs"
            blue={stats.inhibs.blue}
            red={stats.inhibs.red}
          />
        )}
      </div>
      {/* Game-state ownership the count rows can't convey: which side holds
          Soul (and its element), Elder, and Atakhan (and its variant). */}
      {(stats.hasSoul || stats.hasElder || stats.atakhan) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-rift-line/40 pt-2">
          {stats.hasSoul && (
            <ObjBadge
              side={stats.hasSoul}
              icon="soul"
              label={`${stats.soulElement ?? ""} Soul`.trim()}
            />
          )}
          {stats.hasElder && (
            <ObjBadge side={stats.hasElder} icon="elder" label="Elder" />
          )}
          {stats.atakhan && (
            <ObjBadge
              side={stats.atakhan.side}
              icon="atakhan"
              label={`Atakhan · ${stats.atakhan.variant}`}
            />
          )}
        </div>
      )}
    </div>
  );
});
