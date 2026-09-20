"use client";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
import { useHydrated } from "@/lib/useHydrated";

import {
getActiveMetaOverride,
getMetaTier,
TIER_ORDER,
type MetaTier,
} from "@/lib/championMeta";
import type { Champion,Lane } from "@/lib/types";
import { useEffect,useMemo,useRef,useState } from "react";
import { createPortal } from "react-dom";
import LaneIcon from "./LaneIcon";

interface Props {
  open: boolean;
  champions: Champion[];
  // Bumps to force re-render when the active meta override changes. The
  // tier lookup happens via getMetaTier() which reads module state, so
  // React needs an explicit reason to recompute the grouped buckets.
  overrideVersion?: number;
  onClose: () => void;
}

const ROLES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

// Whether a champion should appear in a role's tier list. Normally we gate on
// Meraki's lane data so untagged baseline pocket picks (e.g. Pantheon mid)
// don't leak into a role. But when an active override EXPLICITLY places a
// champion in a role — including an off-role flex pick the user added in the
// editor (e.g. a support dropped into the jungle list) — that placement is
// intentional and authoritative, so it shows regardless of Meraki's lanes.
function shownInRole(
  c: Champion,
  role: Lane,
  override: ReturnType<typeof getActiveMetaOverride>,
): boolean {
  if (override?.[c.alias]?.[role] != null) return true;
  return c.lanes.includes(role);
}

interface TierStyle {
  label: string;
  text: string;
  ring: string;
  bg: string;
  accent: string; // left bar color
  glow: string; // pill hover shadow
  labelText: string;
}

const TIER_STYLES: Record<MetaTier, TierStyle> = {
  "S+": {
    label: "S+",
    text: "text-rift-goldbright",
    ring: "ring-1 ring-rift-gold/80",
    bg: "bg-gradient-to-r from-rift-gold/12 via-rift-gold/8 to-transparent",
    accent: "bg-gradient-to-b from-rift-goldbright via-rift-gold to-rift-golddark",
    glow: "hover:shadow-glow-gold",
    labelText: "drop-shadow-[0_0_8px_rgba(240,230,210,0.6)]",
  },
  S: {
    label: "S",
    text: "text-rift-goldbright",
    ring: "ring-1 ring-rift-gold/50",
    bg: "bg-rift-gold/[0.06]",
    accent: "bg-rift-gold",
    glow: "hover:shadow-glow-gold",
    labelText: "",
  },
  A: {
    label: "A",
    text: "text-rift-bluebright",
    ring: "ring-1 ring-rift-blue/50",
    bg: "bg-rift-bluedeep/12",
    accent: "bg-rift-blue",
    glow: "hover:shadow-glow-blue",
    labelText: "",
  },
  B: {
    label: "B",
    text: "text-rift-mutedbright",
    ring: "ring-1 ring-rift-line",
    bg: "bg-rift-line/20",
    accent: "bg-rift-mutedbright/60",
    glow: "",
    labelText: "",
  },
  C: {
    label: "C",
    text: "text-rift-muted",
    ring: "ring-1 ring-rift-line/60",
    bg: "bg-rift-bg/40",
    accent: "bg-rift-muted/60",
    glow: "",
    labelText: "",
  },
  D: {
    label: "D",
    text: "text-rift-muted",
    ring: "ring-1 ring-rift-red/30",
    bg: "bg-rift-reddeep/10",
    accent: "bg-rift-red/60",
    glow: "",
    labelText: "",
  },
};

const ROLE_ACCENT: Record<Lane, string> = {
  top: "bg-rift-gold",
  jungle: "bg-rift-fighter",
  middle: "bg-rift-mage",
  bottom: "bg-rift-marksman",
  support: "bg-rift-support",
};

export default function TierListView({ open, champions, overrideVersion = 0, onClose }: Props) {
  const [activeRole, setActiveRole] = useState<Lane>("top");
  const [search, setSearch] = useState("");
  const mounted = useHydrated();
  const searchInputRef = useRef<HTMLInputElement | null>(null);



  useEscapeLayer(open, onClose);

  const [previousRole, setPreviousRole] = useState(activeRole);
  if (previousRole !== activeRole) {
    setPreviousRole(activeRole);
    setSearch("");
  }

  // Group champions by tier for the active role, applying optional search.
  const grouped = useMemo(() => {
    const buckets: Record<MetaTier, Champion[]> = {
      "S+": [],
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
    };
    const term = search.trim().toLowerCase();
    const override = getActiveMetaOverride();
    for (const c of champions) {
      if (!shownInRole(c, activeRole, override)) continue;
      const tier = getMetaTier(c.alias, activeRole);
      if (!tier) continue;
      if (
        term &&
        !c.name.toLowerCase().includes(term) &&
        !c.alias.toLowerCase().includes(term)
      )
        continue;
      buckets[tier].push(c);
    }
    for (const t of TIER_ORDER) {
      buckets[t].sort((a, b) => a.name.localeCompare(b.name));
    }
    return buckets;
    // overrideVersion intentionally in deps so re-randomize triggers re-bucket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champions, activeRole, search, overrideVersion]);

  const totalForRole = useMemo(() => {
    let n = 0;
    const override = getActiveMetaOverride();
    for (const c of champions) {
      if (!shownInRole(c, activeRole, override)) continue;
      if (getMetaTier(c.alias, activeRole)) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champions, activeRole, overrideVersion]);

  const totalShown = useMemo(
    () => Object.values(grouped).reduce((s, arr) => s + arr.length, 0),
    [grouped],
  );

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
        aria-labelledby="tier-list-title"
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
                Meta Snapshot
              </div>
              <h2
                id="tier-list-title"
                className="font-display text-2xl md:text-3xl tracking-[0.18em] text-rift-goldbright mt-0.5"
              >
                <span className="bg-gold-sheen bg-clip-text text-transparent">
                  TIER
                </span>
                <span className="text-rift-gold/90 ml-2">LIST</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tier list"
              className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors border border-rift-line hover:border-rift-gold/60"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="ornament">
            <span className="text-[9px] md:text-[10px] tracking-[0.4em] text-rift-gold/50 uppercase">
              Curated · Patch 26.08
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
                  <LaneIcon
                    lane={lane}
                    size="sm"
                    className={active ? "" : "opacity-70"}
                  />
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

        {/* Search bar */}
        <div className="px-4 md:px-6 pt-3 pb-3">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rift-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
              aria-hidden
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L13.5 13.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search champions..."
              aria-label="Search champions"
              className="w-full pl-8 pr-8 py-2 bg-rift-bg/80 border border-rift-line focus:border-rift-gold/50 focus:bg-rift-bg outline-none text-rift-goldbright text-sm tracking-wider transition-colors placeholder:text-rift-muted/70"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-rift-muted hover:text-rift-goldbright"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4L4 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
            <span>
              {ROLES.find((r) => r.lane === activeRole)?.label} · {totalForRole}{" "}
              champions
            </span>
            {search && (
              <span className="text-rift-goldbright/80">
                {totalShown} matching
              </span>
            )}
          </div>
        </div>

        {/* Tier rows */}
        <div className="px-4 md:px-6 pb-4 md:pb-5 max-h-[55vh] overflow-y-auto custom-scroll space-y-2">
          {TIER_ORDER.map((tier) => {
            const champs = grouped[tier];
            const styles = TIER_STYLES[tier];
            const isEmpty = champs.length === 0;
            return (
              <div
                key={tier}
                className={`relative flex items-stretch gap-0 border border-rift-line/50 ${styles.bg} ${
                  isEmpty ? "opacity-50" : ""
                }`}
              >
                {/* Left accent bar */}
                <span
                  className={`w-1 self-stretch ${styles.accent} flex-shrink-0`}
                  aria-hidden
                />
                {/* Tier label cell */}
                <div
                  className={`flex flex-col items-center justify-center w-12 md:w-16 flex-shrink-0 bg-rift-bg/70 border-r border-rift-line/40 py-2`}
                >
                  <span
                    className={`font-display text-2xl md:text-3xl tracking-wider leading-none ${styles.text} ${styles.labelText}`}
                  >
                    {styles.label}
                  </span>
                  <span className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-rift-muted mt-1 tabular-nums">
                    {champs.length}
                  </span>
                </div>
                {/* Champion pills */}
                <div className="flex flex-wrap gap-1.5 md:gap-2 py-2 px-2 md:px-3 flex-1 min-w-0">
                  {isEmpty ? (
                    <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 self-center italic">
                      {search ? "No matches" : "—"}
                    </span>
                  ) : (
                    champs.map((c) => (
                      <ChampionTierBadge
                        key={c.id}
                        champ={c}
                        ring={styles.ring}
                        glow={styles.glow}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-rift-gold/20 px-4 md:px-6 py-2.5 text-center">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted/70">
            Hand-tagged from community consensus · ESC to close
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function ChampionTierBadge({
  champ,
  ring,
  glow,
}: {
  champ: Champion;
  ring: string;
  glow: string;
}) {
  return (
    <div
      className={`group flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 bg-rift-bg/80 border border-rift-line/60 ${ring} transition-all duration-150 hover:bg-rift-bg hover:scale-[1.04] ${glow} cursor-default`}
      title={champ.name}
    >
      <img
        src={champ.iconUrl}
        alt={champ.name}
        className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 transition-transform duration-150 group-hover:brightness-110"
        loading="lazy"
      />
      <span className="text-[10px] md:text-[11px] text-rift-mutedbright group-hover:text-rift-goldbright font-display tracking-wider truncate max-w-[6.5rem] md:max-w-[8rem] transition-colors">
        {champ.name}
      </span>
    </div>
  );
}
