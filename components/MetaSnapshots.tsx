"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { diffMetaOverrides } from "@/lib/season/history";
import {
  encodeMetaOverride,
  TIER_ORDER,
  type MetaOverride,
} from "@/lib/championMeta";
import type { Lane } from "@/lib/types";

// Shared building blocks for displaying archived meta snapshots — used
// by the Season History view and the completed-season dashboard.
//
// Conventions: `MetaOverride | null` means a known table (null = the
// default tiers); `undefined` means UNKNOWN (the season pre-dates
// initial-meta capture and its starting table can't be reconstructed).

export const LANE_SHORT: Record<Lane, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};

/** Copy a tier table to the clipboard as a META1: share code —
 *  importable from the Meta Library / meta panel like any other code. */
export function CopyMetaCodeButton({
  label,
  override,
}: {
  label: string;
  override: MetaOverride | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  if (override === undefined) {
    return (
      <span className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/60 italic">
        {label}: unknown (older archive)
      </span>
    );
  }
  if (override === null) {
    return (
      <span className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/70">
        {label}: default tiers
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            await encodeMetaOverride(override),
          );
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard unavailable — leave the button as-is.
        }
      }}
      className="px-2 py-0.5 border border-rift-line text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
      title={`Copy the ${label.toLowerCase()} tier table as a META1: share code (import it from the Meta Library)`}
    >
      {copied ? "Copied ✓" : `Copy ${label} Code`}
    </button>
  );
}

/** Wrapped chips of every champion-lane tier movement between the two
 *  snapshots ("Ahri Mid A → S"), biggest swings first. Risers render
 *  gold, fallers blue. Shows `limit` chips with a toggle for the rest;
 *  handles the unknown-starting-meta and no-drift cases. */
export function MetaDriftChips({
  initial,
  final,
  limit = 30,
}: {
  initial: MetaOverride | null | undefined;
  final: MetaOverride | null | undefined;
  limit?: number;
}) {
  const champions = useDraftStore((s) => s.champions);
  const [showAll, setShowAll] = useState(false);
  const nameByAlias = useMemo(
    () => new Map(champions.map((c) => [c.alias, c.name])),
    [champions],
  );
  const shifts = useMemo(
    () =>
      initial === undefined
        ? null
        : diffMetaOverrides(initial, final ?? null),
    [initial, final],
  );
  if (shifts == null) {
    return (
      <div className="text-[10px] italic text-rift-muted">
        Starting meta unknown — drift can’t be computed for this season.
      </div>
    );
  }
  if (shifts.length === 0) {
    return (
      <div className="text-[10px] italic text-rift-muted">
        The meta never moved — final tiers match the starting ones.
      </div>
    );
  }
  const visible = showAll ? shifts : shifts.slice(0, limit);
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
        Meta Drift · {shifts.length} tier change
        {shifts.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {visible.map((s) => (
          <span
            key={`${s.alias}-${s.lane}`}
            className="inline-flex items-baseline gap-1 text-[10px] whitespace-nowrap"
          >
            <span className="text-rift-mutedbright">
              {nameByAlias.get(s.alias) ?? s.alias}
            </span>
            <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/70">
              {LANE_SHORT[s.lane]}
            </span>
            <span className="text-rift-muted/70 tabular-nums">{s.from}</span>
            <span className="text-rift-muted/50" aria-hidden>
              →
            </span>
            <span
              className={
                // Higher tier = earlier in TIER_ORDER; rising is gold.
                TIER_ORDER.indexOf(s.to) < TIER_ORDER.indexOf(s.from)
                  ? "text-rift-goldbright tabular-nums"
                  : "text-rift-bluebright tabular-nums"
              }
            >
              {s.to}
            </span>
          </span>
        ))}
        {shifts.length > limit && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-rift-gold/70 hover:text-rift-goldbright transition-colors"
          >
            {showAll ? "show less ▴" : `+${shifts.length - limit} more ▾`}
          </button>
        )}
      </div>
    </div>
  );
}
