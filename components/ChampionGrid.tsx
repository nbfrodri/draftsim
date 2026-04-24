"use client";

import { useMemo, useRef, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, fearlessLockedSet } from "@/lib/series";
import { isChampionAvailable, currentAction } from "@/lib/draftEngine";
import { LANES } from "@/lib/lanes";
import { playSelectSound } from "@/lib/sounds";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";

type LaneFilter = "all" | Lane;

interface Props {
  champions: Champion[];
}

export default function ChampionGrid({ champions }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const selectedId = useDraftStore((s) => s.selectedChampionId);
  const selectChampion = useDraftStore((s) => s.selectChampion);
  const lockIn = useDraftStore((s) => s.lockIn);

  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<LaneFilter>("all");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const game = currentGame(series);
  const action = currentAction(game);
  const locked = fearlessLockedSet(series);

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
  const buttonLabel = isBan ? "LOCK BAN" : "LOCK IN";
  const buttonTheme = (() => {
    if (selectedId == null) return "bg-rift-line text-rift-muted cursor-not-allowed border-rift-line";
    if (isBan) return "bg-gradient-to-b from-rift-red to-rift-reddeep text-white border-rift-red shadow-glow-red hover:brightness-110";
    return action?.side === "blue"
      ? "bg-gradient-to-b from-rift-blue to-rift-bluedeep text-rift-bg border-rift-blue shadow-glow-blue hover:brightness-110"
      : "bg-gradient-to-b from-rift-red to-rift-reddeep text-rift-bg border-rift-red shadow-glow-red hover:brightness-110";
  })();

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
          <div className="h-full flex items-center justify-center text-rift-muted text-sm">
            No champions match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
            {filtered.map((c) => {
              const available = isChampionAvailable(c.id, game, locked);
              const isSelected = selectedId === c.id;
              const lockedByFearless = locked.has(c.id);
              return (
                <ChampionCell
                  key={c.id}
                  champ={c}
                  available={available}
                  lockedByFearless={lockedByFearless}
                  isSelected={isSelected}
                  onClick={() => {
                    if (!available) return;
                    if (selectedId !== c.id) playSelectSound();
                    selectChampion(c.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Lock-in bar */}
      <div className="border-t border-rift-gold/25 px-3 md:px-4 py-2 md:py-2.5 bg-rift-bgdeep/60 flex items-center gap-3 md:gap-4 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          {selectedChamp ? (
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
              Select a champion from the grid
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={selectedId == null || !action}
          onClick={lockIn}
          className={`relative px-5 md:px-10 py-2.5 md:py-3 font-display tracking-[0.25em] md:tracking-[0.35em] text-xs md:text-sm border transition-all overflow-hidden ${buttonTheme}`}
        >
          {buttonLabel}
        </button>
      </div>
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
      className={`inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-[10px] md:text-xs uppercase tracking-[0.15em] border transition-colors ${
        active
          ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
          : "border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChampionCell({
  champ,
  available,
  lockedByFearless,
  isSelected,
  onClick,
}: {
  champ: Champion;
  available: boolean;
  lockedByFearless: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      title={champ.name}
      className={`group relative aspect-square overflow-hidden border transition-all ${
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
  );
}
