"use client";

import { memo, useMemo } from "react";
import { getKeyPowerSpike } from "@/lib/championBuilds";
import { metaFor } from "@/lib/sim/descriptions";
import { useDraftStore } from "@/store/draftStore";
import type { LaneKDA, MatchEvent } from "@/lib/matchSimulator";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";
import {
  type FlashKind,
  type SideLaneKDA,
  LANE_ORDER,
  flashClassFor,
  formatLaneGold,
  involvementFor,
} from "../shared";

// ─── ChampSpikeBadge ──────────────────────────────────────────────────────────

// Per-champion power-spike badge. Shows the minute the champion's first
// major item lands, sourced from the same getKeyPowerSpike() data the
// simulator uses for its power-spike events. Two states:
//   - pending: rendered dim, label reads "SPIKE 14'" — the carry isn't
//     online yet, viewer knows when to expect them
//   - live: when currentMin >= spike minute, badge brightens to gold and
//     reads "ONLINE 14'+" — the threat window is now open
// Carry spikes (hyper/burst/assassin/marksman) get prominent gold
// styling; non-carry spikes (tanks/enchanters/peel) get a muted treatment
// since their "spike" is utility, not a fight-flipper.
function ChampSpikeBadge({
  champ,
  currentMin,
  side,
}: {
  champ: Champion;
  currentMin: number;
  side: Side;
}) {
  // The power-spike override is module-level state that the useMemo dep
  // array can't observe directly, so subscribe to the store's version
  // counter to recompute when randomization swaps the override in/out.
  const powerSpikeVersion = useDraftStore((s) => s.powerSpikeVersion);
  const spike = useMemo(() => {
    const m = metaFor(champ);
    return getKeyPowerSpike(m, champ.alias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ, powerSpikeVersion]);
  const live = currentMin >= spike.minute;
  const isCarry = spike.isCarrySpike;
  const baseCls = live
    ? isCarry
      ? "bg-rift-gold/15 border-rift-gold/60 text-rift-goldbright"
      : "bg-rift-gold/5 border-rift-gold/30 text-rift-gold/80"
    : isCarry
    ? "bg-rift-bg/40 border-rift-line text-rift-mutedbright/80"
    : "bg-rift-bg/40 border-rift-line/60 text-rift-muted/70";
  const label = live ? `ONLINE ${spike.minute}'` : `SPIKE ${spike.minute}'`;
  const align = side === "blue" ? "justify-end" : "justify-start";
  return (
    <div className={`flex ${align} mt-0.5`}>
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-[1px] border text-[8px] md:text-[9px] uppercase tracking-[0.2em] tabular-nums ${baseCls}`}
        title={`Key item: ${spike.keyItem}`}
      >
        <svg
          viewBox="0 0 16 16"
          className="w-2 h-2 md:w-2.5 md:h-2.5"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 1L3 9h4l-1 6 5-8H7l1-6z" />
        </svg>
        {label}
      </span>
    </div>
  );
}

// ─── LaneGoldRow ──────────────────────────────────────────────────────────────

function LaneGoldRow({
  lane,
  blueChamp,
  redChamp,
  blueKDA,
  redKDA,
  diff,
  currentMin,
  blueFlash,
  redFlash,
  flashKey,
}: {
  lane: Lane;
  blueChamp: Champion | null;
  redChamp: Champion | null;
  blueKDA: LaneKDA;
  redKDA: LaneKDA;
  diff: number;
  currentMin: number;
  blueFlash: FlashKind;
  redFlash: FlashKind;
  flashKey: number;
}) {
  const absDiff = Math.abs(diff);
  const leadSide: Side | "even" =
    diff > 100 ? "blue" : diff < -100 ? "red" : "even";
  const blueAhead = leadSide === "blue";
  const redAhead = leadSide === "red";
  // Always show the lead as +X (the leader's advantage). The colour conveys
  // which side is extracting gold from the rival; no minus signs.
  const diffLabel =
    leadSide === "even" ? "EVEN" : `+${formatLaneGold(absDiff)}`;
  const diffCls =
    leadSide === "blue"
      ? "text-rift-bluebright"
      : leadSide === "red"
      ? "text-rift-redbright"
      : "text-rift-muted";
  // The flash animation only retriggers when the React key changes —
  // attaching `flashKey` to the icon wrapper means each new event reveal
  // remounts the wrapper and the keyframe restarts. The `blueFlash`/
  // `redFlash` classification is sticky for that single reveal cycle.
  const blueFlashCls = flashClassFor(blueFlash, "blue");
  const redFlashCls = flashClassFor(redFlash, "red");
  // Gold-diff bar: visualizes lead magnitude. Anchored at center, fills
  // toward the leading side. Saturates at ~3000g lead so a roughly even
  // game still shows movement (small leads are visible) without making
  // every snowball look like a stomp.
  const barFillPct = Math.min(50, (Math.abs(diff) / 3000) * 50);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3 text-xs md:text-sm py-1">
      {/* Blue (left) cell */}
      <div
        className={`flex items-center justify-end gap-2 md:gap-2.5 truncate ${
          blueAhead ? "text-rift-bluebright" : "text-rift-mutedbright/85"
        }`}
      >
        <div className="flex flex-col items-end min-w-0">
          <span className="truncate font-display tracking-wider text-[11px] md:text-[13px]">
            {blueChamp?.name ?? "—"}
          </span>
          {blueChamp && (
            <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright/85 leading-tight mt-0.5">
              <span className="text-rift-bluebright">{blueKDA.k}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright/80">{blueKDA.d}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-bluebright">{blueKDA.a}</span>
            </span>
          )}
          {blueChamp && (
            <ChampSpikeBadge
              champ={blueChamp}
              currentMin={currentMin}
              side="blue"
            />
          )}
        </div>
        {blueChamp && (
          <span
            key={`blue-${flashKey}-${blueFlash ?? "none"}`}
            className={`inline-block ${blueFlashCls}`}
          >
            <img
              src={blueChamp.iconUrl}
              alt={blueChamp.name}
              className={`w-10 h-10 md:w-11 md:h-11 flex-shrink-0 border-2 ${
                blueAhead ? "border-rift-blue shadow-glow-blue" : "border-rift-line"
              }`}
            />
          </span>
        )}
      </div>

      {/* Center gauge: lane label, gold delta, mini bar */}
      <div className="flex flex-col items-center min-w-[7rem] md:min-w-[8.5rem] px-1">
        <span className="flex items-center gap-1 text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70">
          <LaneIcon lane={lane} size="xs" />
        </span>
        <span
          className={`font-display text-sm md:text-base tabular-nums uppercase tracking-[0.15em] mt-0.5 ${diffCls}`}
        >
          {diffLabel}
        </span>
        <div className="relative w-full h-1 bg-rift-bg/80 rounded-sm mt-1">
          <div
            className="absolute top-0 bottom-0 bg-rift-line/40"
            style={{ left: "50%", transform: "translateX(-50%)", width: "1px" }}
          />
          {leadSide === "blue" && (
            <div
              className="absolute top-0 bottom-0 right-1/2 bg-rift-blue rounded-sm"
              style={{ width: `${barFillPct}%` }}
            />
          )}
          {leadSide === "red" && (
            <div
              className="absolute top-0 bottom-0 left-1/2 bg-rift-red rounded-sm"
              style={{ width: `${barFillPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Red (right) cell */}
      <div
        className={`flex items-center gap-2 md:gap-2.5 truncate ${
          redAhead ? "text-rift-redbright" : "text-rift-mutedbright/85"
        }`}
      >
        {redChamp && (
          <span
            key={`red-${flashKey}-${redFlash ?? "none"}`}
            className={`inline-block ${redFlashCls}`}
          >
            <img
              src={redChamp.iconUrl}
              alt={redChamp.name}
              className={`w-10 h-10 md:w-11 md:h-11 flex-shrink-0 border-2 ${
                redAhead ? "border-rift-red shadow-glow-red" : "border-rift-line"
              }`}
            />
          </span>
        )}
        <div className="flex flex-col items-start min-w-0">
          <span className="truncate font-display tracking-wider text-[11px] md:text-[13px]">
            {redChamp?.name ?? "—"}
          </span>
          {redChamp && (
            <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright/85 leading-tight mt-0.5">
              <span className="text-rift-redbright">{redKDA.k}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright/80">{redKDA.d}</span>
              <span className="text-rift-muted/60">/</span>
              <span className="text-rift-redbright">{redKDA.a}</span>
            </span>
          )}
          {redChamp && (
            <ChampSpikeBadge
              champ={redChamp}
              currentMin={currentMin}
              side="red"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LaneGoldStrip ────────────────────────────────────────────────────────────

// Live per-lane gold diff strip. Shows champion icons either side and the
// rolling gold differential between lane opponents — updates as events fire.
// Also shows live K/D/A under each champion's name, accumulated from event
// kdaDelta attributions. When a new event reveals, the rows whose
// champions were involved get a brief flash (blue/red glow if it was a
// kill/death; gold if it was a team-wide objective).
export const LaneGoldStrip = memo(function LaneGoldStrip({
  laneGold,
  laneKDA,
  bluePicks,
  redPicks,
  byId,
  currentMin,
  latestEvent,
  flashKey,
}: {
  laneGold: Record<Lane, number>;
  laneKDA: { blue: SideLaneKDA; red: SideLaneKDA };
  bluePicks: (number | null)[];
  redPicks: (number | null)[];
  byId: Map<number, Champion>;
  currentMin: number;
  latestEvent: MatchEvent | null;
  flashKey: number;
}) {
  return (
    <div className="border-t border-rift-line/40 mt-4 pt-3 space-y-2">
      <div className="flex items-baseline justify-center gap-2 mb-2">
        <span className="text-[10px] md:text-xs uppercase tracking-[0.45em] text-rift-gold/80 font-display">
          Lane Gold
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          live
        </span>
      </div>
      {LANE_ORDER.map((lane, i) => {
        const blueId = bluePicks[i];
        const redId = redPicks[i];
        const blueChamp = blueId != null ? byId.get(blueId) : null;
        const redChamp = redId != null ? byId.get(redId) : null;
        const diff = laneGold[lane];
        const inv = latestEvent
          ? involvementFor(latestEvent, lane)
          : { blue: null, red: null };
        return (
          <LaneGoldRow
            key={lane}
            lane={lane}
            blueChamp={blueChamp ?? null}
            redChamp={redChamp ?? null}
            blueKDA={laneKDA.blue[lane]}
            redKDA={laneKDA.red[lane]}
            diff={diff}
            currentMin={currentMin}
            blueFlash={inv.blue}
            redFlash={inv.red}
            flashKey={flashKey}
          />
        );
      })}
    </div>
  );
});
