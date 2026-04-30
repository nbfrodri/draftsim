"use client";

import { useMemo, useRef, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, fearlessLockedSet } from "@/lib/series";
import { isChampionAvailable, currentAction } from "@/lib/draftEngine";
import { isAITurn } from "@/lib/draftAI";
import { LANES } from "@/lib/lanes";
import { playSelectSound } from "@/lib/sounds";
import { getMetaTier, type MetaTier } from "@/lib/championMeta";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";
import AIRationalePanel from "./AIRationalePanel";
import ChampionDetailModal from "./ChampionDetailModal";

type LaneFilter = "all" | Lane;

interface Props {
  champions: Champion[];
}

export default function ChampionGrid({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const selectedId = useDraftStore((s) => s.selectedChampionId);
  const selectChampion = useDraftStore((s) => s.selectChampion);
  const lockIn = useDraftStore((s) => s.lockIn);
  const triggerAIAction = useDraftStore((s) => s.triggerAIAction);

  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilter>("all");
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Champion-detail modal state. null = closed; number = the champion id
  // currently being inspected. The modal looks up the Champion object
  // from `champions` so we don't have to re-resolve aliases.
  const [detailChampId, setDetailChampId] = useState<number | null>(null);
  const detailChampion = useMemo(
    () =>
      detailChampId == null
        ? null
        : champions.find((c) => c.id === detailChampId) ?? null,
    [detailChampId, champions],
  );
  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );

  const game = currentGame(series);
  const action = currentAction(game);
  const locked = fearlessLockedSet(series);
  // While the AI is on the clock, the lock-in button is repurposed: it
  // commits the AI's chosen pick (passed via the rationale's championId).
  // No auto-advance — the user clicks to control draft pacing.
  const aiOnClock = isAITurn(game, series.mode, series.aiSide);
  const aiRationale = useDraftStore((s) => s.aiRationale);
  // Once the rationale is computed, the AI is "ready to lock". Before that
  // (very brief window, normally instantaneous), the button shows a
  // thinking state.
  const aiReady = aiOnClock && aiRationale != null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return champions.filter((c) => {
      if (q) {
        const inName = c.name.toLowerCase().includes(q);
        const inAlias = c.alias.toLowerCase().includes(q);
        if (!inName && !inAlias) return false;
      }
      if (lane !== "all") {
        if (!c.lanes.includes(lane)) return false;
      }
      return true;
    });
  }, [champions, query, lane]);

  const selectedChamp = selectedId != null
    ? champions.find((c) => c.id === selectedId)
    : undefined;

  const isBan = action?.kind === "ban";
  const buttonLabel = aiOnClock
    ? aiReady
      ? isBan
        ? "LOCK AI BAN"
        : "LOCK AI PICK"
      : "AI THINKING…"
    : isBan
    ? "LOCK BAN"
    : "LOCK IN";
  const buttonTheme = (() => {
    // AI ready to commit — themed by side so the user can quickly tell
    // who's about to lock; otherwise the disabled grey state.
    if (aiReady) {
      if (isBan)
        return "bg-gradient-to-b from-rift-red to-rift-reddeep text-white border-rift-red shadow-glow-red hover:brightness-110";
      return action?.side === "blue"
        ? "bg-gradient-to-b from-rift-blue to-rift-bluedeep text-rift-bg border-rift-blue shadow-glow-blue hover:brightness-110"
        : "bg-gradient-to-b from-rift-red to-rift-reddeep text-rift-bg border-rift-red shadow-glow-red hover:brightness-110";
    }
    if (aiOnClock || selectedId == null)
      return "bg-rift-line text-rift-muted cursor-not-allowed border-rift-line";
    if (isBan)
      return "bg-gradient-to-b from-rift-red to-rift-reddeep text-white border-rift-red shadow-glow-red hover:brightness-110";
    return action?.side === "blue"
      ? "bg-gradient-to-b from-rift-blue to-rift-bluedeep text-rift-bg border-rift-blue shadow-glow-blue hover:brightness-110"
      : "bg-gradient-to-b from-rift-red to-rift-reddeep text-rift-bg border-rift-red shadow-glow-red hover:brightness-110";
  })();

  const handleLockClick = () => {
    if (aiReady && aiRationale) {
      triggerAIAction(aiRationale.championId);
      return;
    }
    lockIn();
  };

  return (
    <section className="flex-1 flex flex-col min-w-0 min-h-0 border border-rift-gold/25 bg-rift-panel/30 backdrop-blur-sm overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 border-b border-rift-gold/20 bg-rift-bgdeep/60 shrink-0">
        <div className="relative flex-1 min-w-[120px] max-w-[240px]">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rift-muted pointer-events-none"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l3.817 3.817a1 1 0 01-1.414 1.414l-3.817-3.817A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            aria-label="Search champions by name"
            className="w-full bg-rift-bg border border-rift-line focus:border-rift-gold pl-8 pr-8 py-1.5 text-sm text-rift-goldbright outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-sm text-rift-muted hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          <LaneChip
            label="All"
            active={lane === "all"}
            onClick={() => setLane("all")}
          />
          {LANES.map((l) => (
            <LaneChip
              key={l.key}
              label={l.label}
              icon={<LaneIcon lane={l.key} />}
              active={lane === l.key}
              onClick={() => setLane(l.key)}
            />
          ))}
        </div>
        <div className="ml-auto text-[10px] md:text-xs text-rift-muted tnum">
          {filtered.length} / {champions.length}
        </div>
      </div>

      {/* Grid — the only scrolling area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 md:p-3">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-rift-muted text-sm px-4 text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="w-10 h-10 opacity-40"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" strokeLinecap="round" />
              <path d="M8 11h6" strokeLinecap="round" opacity="0.6" />
            </svg>
            <div>
              <div className="font-display tracking-wider uppercase text-[11px]">
                No matches
              </div>
              <div className="text-[11px] mt-1 max-w-xs">
                Try clearing the search box or selecting a different lane filter above.
              </div>
            </div>
            {(query || lane !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setLane("all");
                }}
                className="mt-1 text-[10px] uppercase tracking-[0.3em] px-3 py-1.5 border border-rift-gold/40 text-rift-goldbright hover:bg-rift-gold/10 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
            {filtered.map((c) => {
              const available = isChampionAvailable(c.id, game, locked);
              const isSelected = selectedId === c.id;
              const lockedByFearless = locked.has(c.id);
              const tier = bestTierFor(c, lane);
              return (
                <ChampionCell
                  key={c.id}
                  champ={c}
                  available={available}
                  lockedByFearless={lockedByFearless}
                  isSelected={isSelected}
                  tier={tier}
                  onClick={() => {
                    if (!available) return;
                    if (selectedId !== c.id) playSelectSound();
                    selectChampion(c.id);
                  }}
                  onInfo={() => setDetailChampId(c.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Lock-in bar */}
      <div className="border-t border-rift-gold/25 px-3 md:px-4 py-2 md:py-2.5 bg-rift-bgdeep/60 flex items-center gap-3 md:gap-4 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          {aiOnClock && aiRationale ? (
            <AIRationalePanel
              key={`${aiRationale.kind}-${aiRationale.championId}-${game.actionIndex}`}
              rationale={aiRationale}
              champions={champions}
              selectedChamp={selectedChamp ?? null}
            />
          ) : selectedChamp ? (
            <>
              <div className="slot-frame w-9 h-9 md:w-10 md:h-10 overflow-hidden shrink-0">
                <img
                  src={selectedChamp.iconUrl}
                  alt={selectedChamp.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
                  Selected
                </div>
                <div className="text-sm md:text-base text-rift-goldbright font-semibold truncate">
                  {selectedChamp.name}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs md:text-sm text-rift-muted">
              {aiOnClock
                ? "AI is choosing…"
                : "Select a champion from the grid"}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={
            !action ||
            (aiOnClock && !aiReady) ||
            (!aiOnClock && selectedId == null)
          }
          onClick={handleLockClick}
          className={`relative px-5 md:px-10 py-2.5 md:py-3 font-display tracking-[0.25em] md:tracking-[0.35em] text-xs md:text-sm border transition-all overflow-hidden ${buttonTheme}`}
        >
          {buttonLabel}
        </button>
      </div>
      {/* Champion detail modal — portal-rendered so it overlays the
          entire viewport, not just the section. State lives in this
          component (parent of the cell) so a single modal handles every
          champion in the grid. */}
      <ChampionDetailModal
        champion={detailChampion}
        champions={champions}
        byId={byId}
        onClose={() => setDetailChampId(null)}
      />
    </section>
  );
}

function LaneChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-[10px] md:text-xs uppercase tracking-[0.15em] border transition-all ${
        active
          ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright shadow-[inset_0_-2px_0_0_rgba(200,170,110,0.6)]"
          : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright hover:bg-rift-gold/[0.04]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Return the meta tier the user should "see" for this champion in the
// current grid view. When filtering by lane, show the tier in that lane.
// When viewing all, show the champion's BEST tier across their playable
// lanes — the at-a-glance signal of their meta strength.
const TIER_RANK: Record<MetaTier, number> = {
  "S+": 6,
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

function bestTierFor(champ: Champion, lane: LaneFilter): MetaTier | null {
  if (lane !== "all") {
    return getMetaTier(champ.alias, lane) ?? null;
  }
  let best: MetaTier | null = null;
  for (const l of champ.lanes) {
    const t = getMetaTier(champ.alias, l);
    if (!t) continue;
    if (!best || TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return best;
}

// Tier badge — esports-rank-stamp style. Each tier reads as a distinct
// visual class so the user identifies "S+" vs "C" vs "D" without parsing
// the letter:
//   S+: gold gradient + halo + shine sweep (top of meta, premium)
//   S:  solid gold + ring + shine (strong meta)
//   A:  cyan gradient + ring (viable meta)
//   B:  desaturated gold + outline (off-meta but playable)
//   C:  amber/orange + outline (questionable pick)
//   D:  red outline + slash overlay (hard off-meta — explicitly visible
//       so the user sees the warning)
//
// Inner top highlight + outer drop shadow simulate a forged metal stamp.
// All tiers render — D used to be hidden but that obscured legitimate
// "this pick is bad" signal.
function TierBadge({ tier }: { tier: MetaTier }) {
  const isPlus = tier === "S+";
  const isSorPlus = tier === "S" || tier === "S+";

  // Per-tier styling — every tier has bg, text, ring contrast tuned to
  // be legible against typical champion-icon backgrounds (which can be
  // dark, light, or mid-grey depending on splash art).
  const styles =
    tier === "S+"
      ? {
          bg: "bg-gradient-to-b from-rift-goldbright via-rift-gold to-rift-golddark",
          text: "text-rift-bg",
          ring: "ring-1 ring-rift-goldbright/60",
          glow:
            "shadow-[0_0_6px_rgba(240,230,210,0.55),inset_0_1px_0_rgba(255,255,255,0.45)]",
        }
      : tier === "S"
      ? {
          bg: "bg-gradient-to-b from-rift-gold to-rift-golddark",
          text: "text-rift-bg",
          ring: "ring-1 ring-rift-gold/60",
          glow:
            "shadow-[0_0_3px_rgba(200,170,110,0.55),inset_0_1px_0_rgba(255,255,255,0.3)]",
        }
      : tier === "A"
      ? {
          bg: "bg-gradient-to-b from-rift-bluebright to-rift-bluedeep",
          text: "text-rift-bg",
          ring: "ring-1 ring-rift-blue/60",
          glow:
            "shadow-[0_0_2px_rgba(10,200,185,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]",
        }
      : tier === "B"
      ? {
          // Desaturated gold — readable on dark and light splashes alike.
          bg: "bg-gradient-to-b from-[#7a6b48] to-[#3a3220]",
          text: "text-rift-goldbright",
          ring: "ring-1 ring-rift-gold/40",
          glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
        }
      : tier === "C"
      ? {
          // Amber/orange — distinct from B's gold and D's red. Reads as
          // "questionable, not great" without screaming "bad".
          bg: "bg-gradient-to-b from-[#8a5a2b] to-[#3a2510]",
          text: "text-[#ffd9a8]",
          ring: "ring-1 ring-[#a87738]/60",
          glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
        }
      : {
          // D — explicit "off-meta warning" badge. Red ring + dim red bg.
          bg: "bg-gradient-to-b from-[#5a1f28] to-[#2a0d12]",
          text: "text-rift-redbright",
          ring: "ring-1 ring-rift-red/60",
          glow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        };

  return (
    <div
      className={`absolute top-0.5 right-0.5 z-10 inline-flex items-center justify-center min-w-[16px] h-[15px] md:min-w-[18px] md:h-[17px] px-[3px] ${styles.bg} ${styles.ring} ${styles.glow} ${
        isSorPlus ? "animate-tier-shine" : ""
      }`}
      style={{
        // Subtle chamfer on the bottom-left corner — gives the badge a
        // pennant feel pointing toward the champion icon below it.
        clipPath: "polygon(0 0, 100% 0, 100% 100%, 18% 100%, 0 60%)",
      }}
      aria-hidden
    >
      <span
        className={`${styles.text} font-display italic font-bold leading-none text-[9px] md:text-[10px] tracking-tight tabular-nums relative z-[1]`}
      >
        {isPlus ? (
          <>
            S<sup className="text-[5.5px] md:text-[6.5px] -top-[1px] relative">+</sup>
          </>
        ) : (
          tier
        )}
      </span>
    </div>
  );
}

function ChampionCell({
  champ,
  available,
  lockedByFearless,
  isSelected,
  tier,
  onClick,
  onInfo,
}: {
  champ: Champion;
  available: boolean;
  lockedByFearless: boolean;
  isSelected: boolean;
  tier: MetaTier | null;
  onClick: () => void;
  onInfo: () => void;
}) {
  // Show every tier we have meta data for. Champions with no entry in
  // CHAMPION_META still render no badge (genuinely unknown).
  const showTier = tier !== null;
  return (
    // .group on the wrapper so the sibling info-button can trigger on the
    // same hover boundary as the main button. Aspect-square on the wrapper
    // since the inner button is now a flex child.
    <div className="group relative aspect-square">
      <button
        type="button"
        onClick={onClick}
        disabled={!available}
        title={tier ? `${champ.name} · ${tier}` : champ.name}
        className={`relative aspect-square w-full h-full overflow-hidden border transition-all ${
          !available
            ? "border-rift-line/40 cursor-not-allowed grayscale brightness-[0.35]"
            : isSelected
            ? "border-rift-gold shadow-glow-gold scale-[1.04] z-10"
            : "border-rift-line hover:border-rift-gold/70 hover:scale-[1.04] hover:z-10"
        }`}
      >
        <img
          src={champ.iconUrl}
          alt={champ.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {/* Tier badge — top-right corner. Renders for every tier (S+ → D)
            whenever we have meta data. Hidden on greyed-out unavailable
            champions to reduce visual noise. */}
        {showTier && available && tier && <TierBadge tier={tier} />}
        {lockedByFearless && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
            <div className="text-[8px] uppercase tracking-widest text-rift-gold font-display">
              FLS
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent reveal px-1 py-0.5">
          <div className="text-[10px] text-rift-goldbright truncate font-semibold">
            {champ.name}
          </div>
        </div>
        {isSelected && (
          <>
            <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-rift-gold" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-rift-gold" />
            <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-rift-gold" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-rift-gold" />
          </>
        )}
      </button>
      {/* Info icon overlay — top-left corner, sibling to the main button
          (nested buttons are invalid HTML). `e.stopPropagation()` keeps
          the cell's primary click (select for hover/preview) intact.
          Faded by default so it's unobtrusive on desktop, opaque on hover
          and on touch — touch devices land on the hover state on tap so
          the gating works for both input modes. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInfo();
        }}
        aria-label={`Show ${champ.name} details`}
        title={`${champ.name} details`}
        className="absolute top-0.5 left-0.5 w-[18px] h-[18px] z-20 flex items-center justify-center bg-rift-bg/85 backdrop-blur-sm border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold hover:text-rift-goldbright hover:bg-rift-bg/95 transition-all opacity-50 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-rift-gold"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="0.8" fill="none" />
          <circle cx="8" cy="4.5" r="0.85" />
          <rect x="7.2" y="6.5" width="1.6" height="5" rx="0.4" />
        </svg>
      </button>
    </div>
  );
}
