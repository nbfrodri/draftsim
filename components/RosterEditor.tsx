"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import type { Champion, Lane, PlayerTier, Roster } from "@/lib/types";
import {
  deriveStar,
  emptyRoster,
  LANE_ORDER,
  MAX_POOL,
  normalizeRoster,
  PLAYER_TIERS,
  playableInLane,
  randomizeChampPools,
  randomizeRoster,
} from "@/lib/players";
import LaneIcon from "./LaneIcon";

interface Props {
  open: boolean;
  champions: Champion[];
  // Current roster to edit (any side). Null/empty → starts from a neutral one.
  roster: Roster | null;
  teamLabel?: string;
  side?: "blue" | "red";
  onSave: (roster: Roster) => void;
  onClose: () => void;
}

const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  support: "Support",
};

const TIER_TEXT: Record<PlayerTier, string> = {
  "S+": "text-rift-goldbright",
  S: "text-rift-goldbright",
  A: "text-rift-bluebright",
  B: "text-rift-mutedbright",
  C: "text-rift-muted",
  D: "text-rift-muted",
};

type PoolState = "good" | "bad" | "neutral";

export default function RosterEditor({
  open,
  champions,
  roster,
  teamLabel,
  side,
  onSave,
  onClose,
}: Props) {
  const [editing, setEditing] = useState<Roster>(() => emptyRoster());
  const [activeLane, setActiveLane] = useState<Lane>("top");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-seed whenever opened with a fresh normalized copy of the roster.
  useEffect(() => {
    if (!open) return;
    setEditing(
      roster && roster.length > 0
        ? normalizeRoster(roster, champions)
        : emptyRoster(),
    );
    setSearch("");
  }, [open, roster, champions]);

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

  const star = deriveStar(editing);
  const activeIdx = LANE_ORDER.indexOf(activeLane);
  const player = editing[activeIdx];

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );

  // Champions playable in the active lane, filtered by the search box.
  const laneChampions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return champions
      .filter((c) => playableInLane(c, activeLane))
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          c.alias.toLowerCase().includes(term),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, activeLane, search]);

  const poolStateOf = (champId: number): PoolState => {
    if (player.goodChamps.includes(champId)) return "good";
    if (player.badChamps.includes(champId)) return "bad";
    return "neutral";
  };

  const setTier = (tier: PlayerTier) => {
    setEditing((prev) =>
      prev.map((p, i) => (i === activeIdx ? { ...p, tier } : p)),
    );
  };

  // Click cycles a champion through neutral → good → bad → neutral for the
  // active lane's player, respecting the per-pool cap. When a pool is full
  // the cycle skips it.
  const cycleChamp = (champId: number) => {
    setEditing((prev) =>
      prev.map((p, i) => {
        if (i !== activeIdx) return p;
        const inGood = p.goodChamps.includes(champId);
        const inBad = p.badChamps.includes(champId);
        let good = p.goodChamps.filter((id) => id !== champId);
        let bad = p.badChamps.filter((id) => id !== champId);
        if (inGood) {
          // good → bad (if room) else neutral
          if (bad.length < MAX_POOL) bad = [...bad, champId];
        } else if (inBad) {
          // bad → neutral (already removed above)
        } else {
          // neutral → good (if room) else bad (if room) else stay neutral
          if (good.length < MAX_POOL) good = [...good, champId];
          else if (bad.length < MAX_POOL) bad = [...bad, champId];
        }
        return { ...p, goodChamps: good, badChamps: bad };
      }),
    );
  };

  // Refs for the randomize flourish: the five lane tabs reel in, the derived
  // star pulses.
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const starRef = useRef<HTMLSpanElement | null>(null);

  // Slot-machine style reveal: each lane tab flips in on a stagger while the
  // star rating pulses, selling the "re-roll" of the whole team.
  const playRandomizeAnim = () => {
    if (tabsRef.current) {
      gsap.fromTo(
        tabsRef.current.children,
        { rotationX: -90, opacity: 0.15, transformPerspective: 500 },
        {
          rotationX: 0,
          opacity: 1,
          duration: 0.5,
          ease: "back.out(1.7)",
          stagger: 0.07,
          transformOrigin: "50% 50%",
        },
      );
    }
    if (starRef.current) {
      gsap.fromTo(
        starRef.current,
        { scale: 1.35, filter: "brightness(2.2)" },
        {
          scale: 1,
          filter: "brightness(1)",
          duration: 0.5,
          ease: "power2.out",
        },
      );
    }
  };

  const randomizeAll = () => {
    setEditing(randomizeRoster({ champions }));
    playRandomizeAnim();
  };

  // Randomize ONLY the champion pools (good/bad) for every lane, keeping the
  // tiers the user set. Each lane's pool is drawn from champions playable in
  // that lane, so a toplaner gets top champions, a jungler jungle ones, etc.
  const randomizePoolsAll = () => {
    setEditing((prev) =>
      prev.map((p) => {
        const pools = randomizeChampPools(p.lane, champions);
        return { ...p, goodChamps: pools.goodChamps, badChamps: pools.badChamps };
      }),
    );
  };

  // Randomize just the active lane's pools.
  const randomizeLanePools = () => {
    setEditing((prev) =>
      prev.map((p, i) => {
        if (i !== activeIdx) return p;
        const pools = randomizeChampPools(p.lane, champions);
        return { ...p, goodChamps: pools.goodChamps, badChamps: pools.badChamps };
      }),
    );
  };

  const handleSave = () => {
    onSave(normalizeRoster(editing, champions));
    onClose();
  };

  if (!open || !mounted) return null;

  const sideAccent =
    side === "blue"
      ? "text-rift-bluebright"
      : side === "red"
      ? "text-rift-redbright"
      : "text-rift-goldbright";

  const overlay = (
    <div
      className="fixed inset-0 z-[110] flex items-start md:items-center justify-center px-3 py-4 md:px-6 md:py-8 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit player roster"
        className="relative w-full max-w-3xl bg-rift-panel/95 border border-rift-gold/50 shadow-[0_0_60px_rgba(0,0,0,0.85)] my-auto"
      >
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

        {/* Header */}
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-3 border-b border-rift-gold/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
                Player Roster
              </div>
              <h2 className="font-display text-xl md:text-2xl tracking-[0.16em] mt-0.5 truncate">
                <span className={sideAccent}>{teamLabel ?? "Team"}</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close roster editor"
              className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 border border-rift-line hover:border-rift-gold/60 transition-colors shrink-0"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3">
            {/* Derived star */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted">
                Team rating (derived)
              </span>
              <span
                ref={starRef}
                className="text-rift-gold text-sm tracking-tight inline-block"
                aria-label={`${star} of 5 stars`}
              >
                {"★".repeat(star)}
                <span className="text-rift-line">{"★".repeat(5 - star)}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={randomizeAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.25em] transition-all"
                title="Randomize tiers AND champion pools"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 12c0-3 3-4 5-4s5 1 5 4" strokeLinecap="round" />
                </svg>
                Randomize all
              </button>
              <button
                type="button"
                onClick={randomizePoolsAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.25em] transition-all"
                title="Randomize only champion pools (keep tiers) — role-appropriate per lane"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <circle cx="5" cy="5" r="1.4" />
                  <circle cx="11" cy="11" r="1.4" />
                  <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pools only
              </button>
            </div>
          </div>
        </div>

        {/* Lane tabs */}
        <div className="px-4 md:px-6 pt-3">
          <div ref={tabsRef} className="grid grid-cols-5 gap-1 md:gap-2">
            {LANE_ORDER.map((lane) => {
              const active = activeLane === lane;
              const p = editing[LANE_ORDER.indexOf(lane)];
              return (
                <button
                  key={lane}
                  type="button"
                  onClick={() => {
                    setActiveLane(lane);
                    setSearch("");
                  }}
                  className={`relative flex flex-col items-center justify-center gap-1 py-2 border-b-2 transition-all ${
                    active
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-transparent text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/[0.04]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <LaneIcon lane={lane} size="sm" className={active ? "" : "opacity-70"} />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-display">
                      {LANE_LABEL[lane]}
                    </span>
                  </span>
                  <span className={`text-[10px] font-display ${TIER_TEXT[p.tier]}`}>
                    {p.tier}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active player editor */}
        <div className="px-4 md:px-6 pt-3 pb-3">
          {/* Tier picker */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted w-16 shrink-0">
              Tier
            </span>
            <div className="flex gap-1.5">
              {PLAYER_TIERS.map((t) => {
                const active = player.tier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={`w-9 h-8 flex items-center justify-center border font-display text-sm tracking-wide transition-all ${
                      active
                        ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                        : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pool summary */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <PoolSummary label="Good at" tone="good" ids={player.goodChamps} byId={byId} />
            <PoolSummary label="Bad at" tone="bad" ids={player.badChamps} byId={byId} />
          </div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted/70">
              Click to cycle: neutral → <span className="text-rift-support">good</span> →{" "}
              <span className="text-rift-redbright">bad</span> → neutral · max {MAX_POOL} each
            </div>
            <button
              type="button"
              onClick={randomizeLanePools}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 text-[9px] uppercase tracking-[0.2em] transition-all"
              title={`Randomize this lane's good/bad champions`}
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Shuffle
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${LANE_LABEL[activeLane]} champions…`}
            spellCheck={false}
            className="w-full bg-rift-bg/80 border border-rift-line text-[12px] text-rift-mutedbright px-2.5 py-1.5 mb-2 focus:outline-none focus:border-rift-gold/60 placeholder:text-rift-muted/60"
          />

          {/* Champion grid for the active lane. The selection ring uses
              `ring-inset` so it's drawn INSIDE each cell — never clipped by the
              scroll container's edges. A little padding keeps cells off the
              scrollbar/edges. */}
          <div className="max-h-[40vh] overflow-y-auto custom-scroll grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 p-1 pr-2">
            {laneChampions.map((c) => {
              const state = poolStateOf(c.id);
              const ring =
                state === "good"
                  ? "ring-2 ring-inset ring-rift-support bg-rift-support/10"
                  : state === "bad"
                  ? "ring-2 ring-inset ring-rift-red bg-rift-red/10"
                  : "ring-1 ring-inset ring-rift-line/60 hover:ring-rift-gold/50";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => cycleChamp(c.id)}
                  className={`flex items-center gap-1.5 p-1 bg-rift-bg/70 ${ring} transition-all`}
                  title={c.name}
                >
                  <img
                    src={c.iconUrl}
                    alt=""
                    className="w-7 h-7 flex-shrink-0"
                    loading="lazy"
                    draggable={false}
                  />
                  <span className="text-[10px] text-rift-mutedbright font-display tracking-wide truncate">
                    {c.name}
                  </span>
                </button>
              );
            })}
            {laneChampions.length === 0 && (
              <div className="col-span-full text-center text-[10px] uppercase tracking-[0.3em] text-rift-muted/70 py-4 italic">
                No champions match
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-rift-gold/20 px-4 md:px-6 py-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[11px] tracking-[0.3em] uppercase transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-gold py-2.5 font-display text-[11px] tracking-[0.3em] uppercase"
          >
            Save Roster
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function PoolSummary({
  label,
  tone,
  ids,
  byId,
}: {
  label: string;
  tone: "good" | "bad";
  ids: number[];
  byId: Map<number, Champion>;
}) {
  const accent = tone === "good" ? "text-rift-support" : "text-rift-redbright";
  const ring =
    tone === "good" ? "ring-1 ring-rift-support/60" : "ring-1 ring-rift-red/50";
  return (
    <div className="border border-rift-line/50 bg-rift-bg/40 px-2 py-1.5 min-h-[3rem]">
      <div className={`text-[9px] uppercase tracking-[0.3em] ${accent} mb-1`}>
        {label} ({ids.length}/{MAX_POOL})
      </div>
      <div className="flex flex-wrap gap-1">
        {ids.length === 0 ? (
          <span className="text-[9px] text-rift-muted/60 italic">none</span>
        ) : (
          ids.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 bg-rift-bg/80 ${ring}`}
                title={c.name}
              >
                <img src={c.iconUrl} alt="" className="w-5 h-5" draggable={false} />
                <span className="text-[9px] text-rift-mutedbright truncate max-w-[5rem]">
                  {c.name}
                </span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
