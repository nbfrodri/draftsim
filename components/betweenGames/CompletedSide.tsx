"use client";

import { strategySummary, type TeamStrategy } from "@/lib/sim/strategies";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";

// ─── StrategyRecap ────────────────────────────────────────────────────────────

export function StrategyRecap({
  side,
  name,
  strategy,
}: {
  side: Side;
  name: string;
  strategy: TeamStrategy;
}) {
  const text = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  return (
    <div className={`border ${border} bg-rift-bg/40 p-3`}>
      <div className="flex items-baseline justify-between mb-2">
        <div
          className={`font-display ${text} uppercase tracking-[0.2em] text-xs truncate`}
        >
          {name}
        </div>
        <div className="text-[8px] uppercase tracking-[0.35em] text-rift-gold/60">
          Game Plan
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {strategySummary(strategy).map((s) => (
          <span
            key={s.label}
            title={s.label}
            className="px-1.5 py-0.5 border border-rift-line bg-rift-panel/40 text-[9px] uppercase tracking-[0.15em] text-rift-mutedbright"
          >
            {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── CompletedSide ────────────────────────────────────────────────────────────

export function CompletedSide({
  name,
  side,
  picks,
  bans,
  roles,
  wins,
  selection,
  onPickClick,
}: {
  name: string;
  side: Side;
  picks: (Champion | undefined)[];
  bans: (Champion | undefined)[];
  roles: (Lane | null)[];
  wins: boolean;
  selection: { side: Side; slot: number } | null;
  onPickClick: (side: Side, slot: number) => void;
}) {
  const text = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const bgGrad =
    side === "blue"
      ? "from-rift-bluedeep/20 to-transparent"
      : "from-rift-reddeep/20 to-transparent";
  return (
    <div
      className={`relative border ${border} bg-gradient-to-br ${bgGrad} bg-rift-panel/40 p-4 ${
        wins ? "shadow-glow-gold" : ""
      }`}
    >
      {wins && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-rift-gold text-rift-bg text-[9px] font-display tracking-[0.4em]">
          WINNER
        </div>
      )}
      <div
        className={`font-display ${text} uppercase tracking-[0.25em] mb-3 truncate text-sm md:text-base`}
      >
        {name}
      </div>

      {/* Picks with role icons — clickable to swap */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {picks.map((c, i) => {
          const selected = selection?.side === side && selection.slot === i;
          const lane = roles[i];
          const isSwapCandidate =
            selection != null && selection.side === side && !selected;
          return (
            <button
              type="button"
              key={`p-${i}`}
              onClick={() => onPickClick(side, i)}
              aria-label={lane ? `${c?.name ?? "Empty"} (${lane})` : c?.name ?? "Empty"}
              className={`slot-frame aspect-square overflow-hidden relative transition-all ${
                selected
                  ? "ring-2 ring-rift-gold shadow-glow-gold scale-[1.05] z-10"
                  : isSwapCandidate
                  ? "ring-1 ring-rift-gold/60 hover:ring-rift-gold hover:scale-[1.03]"
                  : "hover:border-rift-gold/60"
              }`}
            >
              {c ? (
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              ) : null}
              {lane && (
                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded-sm p-0.5 flex items-center justify-center">
                  <LaneIcon lane={lane} size="xs" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted mb-1.5">
        Bans
      </div>
      <div className="flex gap-1">
        {bans.map((c, i) => (
          <div
            key={`b-${i}`}
            className="slot-frame banned w-7 h-7 md:w-8 md:h-8 overflow-hidden relative"
            title={c?.name}
          >
            {c && (
              <>
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[140%] h-[1.5px] bg-rift-red/80 rotate-45" />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WinnerButton ─────────────────────────────────────────────────────────────

export function WinnerButton({
  name,
  side,
  onClick,
}: {
  name: string;
  side: Side;
  onClick: () => void;
}) {
  const cls =
    side === "blue"
      ? "border-rift-blue/50 hover:border-rift-blue hover:shadow-glow-blue text-rift-bluebright bg-gradient-to-br from-rift-bluedeep/20 to-transparent"
      : "border-rift-red/50 hover:border-rift-red hover:shadow-glow-red text-rift-redbright bg-gradient-to-br from-rift-reddeep/20 to-transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-5 md:py-6 border-2 bg-rift-panel/50 font-display text-base md:text-lg tracking-[0.25em] uppercase transition-all hover:scale-[1.01] ${cls}`}
    >
      <div className="text-[10px] tracking-[0.4em] text-rift-muted mb-1">
        Declare Winner
      </div>
      {name}
    </button>
  );
}
