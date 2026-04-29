"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getMetaTier,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "@/lib/championMeta";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  open: boolean;
  champions: Champion[];
  // Initial state from current active meta — editor seeds from this so the
  // user starts with whatever meta is currently active (default, randomized,
  // or previously-saved custom).
  initialOverride: MetaOverride | null;
  onSave: (override: MetaOverride) => void;
  onClose: () => void;
}

const ROLES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

interface TierStyle {
  ring: string;
  text: string;
  bg: string;
  accent: string;
  drop: string;
}

const TIER_STYLES: Record<MetaTier, TierStyle> = {
  "S+": {
    ring: "ring-1 ring-rift-gold/80",
    text: "text-rift-goldbright",
    bg: "bg-gradient-to-r from-rift-gold/12 via-rift-gold/8 to-transparent",
    accent: "bg-gradient-to-b from-rift-goldbright via-rift-gold to-rift-golddark",
    drop: "ring-2 ring-rift-gold bg-rift-gold/15",
  },
  S: {
    ring: "ring-1 ring-rift-gold/50",
    text: "text-rift-goldbright",
    bg: "bg-rift-gold/[0.06]",
    accent: "bg-rift-gold",
    drop: "ring-2 ring-rift-gold bg-rift-gold/10",
  },
  A: {
    ring: "ring-1 ring-rift-blue/50",
    text: "text-rift-bluebright",
    bg: "bg-rift-bluedeep/12",
    accent: "bg-rift-blue",
    drop: "ring-2 ring-rift-blue bg-rift-blue/15",
  },
  B: {
    ring: "ring-1 ring-rift-line",
    text: "text-rift-mutedbright",
    bg: "bg-rift-line/20",
    accent: "bg-rift-mutedbright/60",
    drop: "ring-2 ring-rift-mutedbright bg-rift-line/30",
  },
  C: {
    ring: "ring-1 ring-rift-line/60",
    text: "text-rift-muted",
    bg: "bg-rift-bg/40",
    accent: "bg-rift-muted/60",
    drop: "ring-2 ring-rift-muted bg-rift-bg/60",
  },
  D: {
    ring: "ring-1 ring-rift-red/30",
    text: "text-rift-muted",
    bg: "bg-rift-reddeep/10",
    accent: "bg-rift-red/60",
    drop: "ring-2 ring-rift-red bg-rift-red/15",
  },
};

const ROLE_ACCENT: Record<Lane, string> = {
  top: "bg-rift-gold",
  jungle: "bg-rift-fighter",
  middle: "bg-rift-mage",
  bottom: "bg-rift-marksman",
  support: "bg-rift-support",
};

// Build a fresh editor state seeded from the provided override, falling back
// to the active meta lookups for any missing entries. Only champion+lane
// combos that are valid (per Meraki lanes) get an entry.
function buildInitialEditing(
  champions: Champion[],
  initialOverride: MetaOverride | null,
  fallbackTier: (alias: string, lane: Lane) => MetaTier | null,
): MetaOverride {
  const result: MetaOverride = {};
  for (const c of champions) {
    result[c.alias] = {};
    for (const lane of c.lanes) {
      // Prefer the supplied initial override, then fall back to default tier.
      const overrideTier = initialOverride?.[c.alias]?.[lane];
      if (overrideTier) {
        result[c.alias][lane] = overrideTier;
      } else if (initialOverride && initialOverride[c.alias] !== undefined) {
        // Override is authoritative for this champion — if not listed, skip.
        continue;
      } else {
        const baseline = fallbackTier(c.alias, lane);
        if (baseline) result[c.alias][lane] = baseline;
      }
    }
  }
  return result;
}

export default function MetaEditor({
  open,
  champions,
  initialOverride,
  onSave,
  onClose,
}: Props) {
  const [activeRole, setActiveRole] = useState<Lane>("top");
  const [editing, setEditing] = useState<MetaOverride>({});
  const [draggedAlias, setDraggedAlias] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<MetaTier | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-seed the editor whenever it opens with a fresh snapshot of the active
  // meta. getMetaTier reads the override+baseline so random/custom states flow.
  useEffect(() => {
    if (!open) return;
    const seed = buildInitialEditing(champions, initialOverride, getMetaTier);
    setEditing(seed);
  }, [open, champions, initialOverride]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Champions to show in the active role, grouped by their current edited
  // tier in that role. Champions without a tier in this role are excluded.
  const grouped = useMemo(() => {
    const buckets: Record<MetaTier, Champion[]> = {
      "S+": [],
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
    };
    for (const c of champions) {
      if (!c.lanes.includes(activeRole)) continue;
      const tier = editing[c.alias]?.[activeRole];
      if (!tier) continue;
      buckets[tier].push(c);
    }
    for (const t of TIER_ORDER) {
      buckets[t].sort((a, b) => a.name.localeCompare(b.name));
    }
    return buckets;
  }, [champions, activeRole, editing]);

  const moveTier = (alias: string, newTier: MetaTier) => {
    setEditing((prev) => {
      const next: MetaOverride = { ...prev };
      const champTiers = { ...(next[alias] ?? {}) };
      champTiers[activeRole] = newTier;
      next[alias] = champTiers;
      return next;
    });
  };

  const handleSave = () => {
    onSave(editing);
    onClose();
  };

  const handleDragStart = (alias: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", alias);
    e.dataTransfer.effectAllowed = "move";
    setDraggedAlias(alias);
  };

  const handleDragEnd = () => {
    setDraggedAlias(null);
    setDropTarget(null);
  };

  const handleDragOver = (tier: MetaTier) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== tier) setDropTarget(tier);
  };

  const handleDragLeave = (tier: MetaTier) => () => {
    if (dropTarget === tier) setDropTarget(null);
  };

  const handleDrop = (tier: MetaTier) => (e: React.DragEvent) => {
    e.preventDefault();
    const alias = e.dataTransfer.getData("text/plain");
    if (!alias) return;
    moveTier(alias, tier);
    setDraggedAlias(null);
    setDropTarget(null);
  };

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center px-3 py-4 md:px-6 md:py-8 bg-black/75 backdrop-blur-sm overflow-y-auto animate-[fadeSlide_220ms_ease-out]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-editor-title"
        className="relative w-full max-w-4xl bg-rift-panel/95 border border-rift-gold/50 shadow-[0_0_60px_rgba(0,0,0,0.85)] my-auto"
      >
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

        {/* Header */}
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 border-b border-rift-gold/20">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.45em] text-rift-gold/70">
                Custom Meta Editor
              </div>
              <h2
                id="meta-editor-title"
                className="font-display text-2xl md:text-3xl tracking-[0.18em] text-rift-goldbright mt-0.5"
              >
                <span className="bg-gold-sheen bg-clip-text text-transparent">
                  EDIT
                </span>
                <span className="text-rift-gold/90 ml-2">META</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
              className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors border border-rift-line hover:border-rift-gold/60"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="ornament">
            <span className="text-[9px] md:text-[10px] tracking-[0.4em] text-rift-gold/50 uppercase">
              Drag champions between tiers · Save when done
            </span>
          </div>
        </div>

        {/* Role tabs */}
        <div className="px-4 md:px-6 pt-4">
          <div className="grid grid-cols-5 gap-1 md:gap-2">
            {ROLES.map(({ lane, label }) => {
              const active = activeRole === lane;
              return (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setActiveRole(lane)}
                  className={`relative flex items-center justify-center gap-1.5 md:gap-2 py-2.5 md:py-3 border-b-2 transition-all ${
                    active
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-transparent text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/[0.04]"
                  }`}
                >
                  <LaneIcon lane={lane} size="sm" className={active ? "" : "opacity-70"} />
                  <span className="text-[10px] md:text-xs uppercase tracking-[0.25em] font-display">
                    {label}
                  </span>
                  {active && (
                    <span
                      className={`absolute left-0 right-0 -bottom-[2px] h-[2px] ${ROLE_ACCENT[lane]}`}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tier rows */}
        <div className="px-4 md:px-6 pt-4 pb-3 max-h-[58vh] overflow-y-auto custom-scroll space-y-2">
          {TIER_ORDER.map((tier) => {
            const champs = grouped[tier];
            const styles = TIER_STYLES[tier];
            const isDropTarget = dropTarget === tier;
            return (
              <div
                key={tier}
                onDragOver={handleDragOver(tier)}
                onDragLeave={handleDragLeave(tier)}
                onDrop={handleDrop(tier)}
                className={`relative flex items-stretch gap-0 border border-rift-line/50 ${styles.bg} ${
                  isDropTarget ? styles.drop : ""
                } transition-all`}
              >
                <span
                  className={`w-1 self-stretch ${styles.accent} flex-shrink-0`}
                  aria-hidden
                />
                <div
                  className={`flex flex-col items-center justify-center w-12 md:w-16 flex-shrink-0 bg-rift-bg/70 border-r border-rift-line/40 py-2`}
                >
                  <span
                    className={`font-display text-2xl md:text-3xl tracking-wider leading-none ${styles.text}`}
                  >
                    {tier}
                  </span>
                  <span className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-rift-muted mt-1 tabular-nums">
                    {champs.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 md:gap-2 py-2 px-2 md:px-3 flex-1 min-w-0 min-h-[3rem]">
                  {champs.length === 0 ? (
                    <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 self-center italic">
                      Drop champions here
                    </span>
                  ) : (
                    champs.map((c) => (
                      <DraggableChampion
                        key={c.id}
                        champ={c}
                        ring={styles.ring}
                        isDragging={draggedAlias === c.alias}
                        onDragStart={handleDragStart(c.alias)}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Save / Cancel */}
        <div className="border-t border-rift-gold/20 px-4 md:px-6 py-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[11px] md:text-xs tracking-[0.3em] uppercase transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-gold py-2.5 font-display text-[11px] md:text-xs tracking-[0.3em] uppercase"
          >
            Save Custom Meta
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function DraggableChampion({
  champ,
  ring,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  champ: Champion;
  ring: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 bg-rift-bg/80 border border-rift-line/60 ${ring} cursor-grab active:cursor-grabbing transition-all hover:bg-rift-bg hover:scale-[1.04] ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
      title={`Drag ${champ.name} to change tier`}
    >
      <img
        src={champ.iconUrl}
        alt={champ.name}
        className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 pointer-events-none"
        loading="lazy"
        draggable={false}
      />
      <span className="text-[10px] md:text-[11px] text-rift-mutedbright group-hover:text-rift-goldbright font-display tracking-wider truncate max-w-[6.5rem] md:max-w-[8rem] transition-colors pointer-events-none">
        {champ.name}
      </span>
    </div>
  );
}
