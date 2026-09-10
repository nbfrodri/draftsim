"use client";
import { useHydrated } from "@/lib/useHydrated";

import { getActiveSynergies } from "@/lib/championMeta";
import type { Champion } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import { useEffect,useMemo,useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  champions: Champion[];
  onClose: () => void;
}

export default function SynergyView({ open, champions, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [focusedAlias, setFocusedAlias] = useState<string | null>(null);
  const mounted = useHydrated();
  // Subscribe to the synergy version so a randomize/reset triggers a
  // re-render with the new active list.
  const synergyVersion = useDraftStore((s) => s.synergyVersion);
  const activeSynergies = useMemo(
    () => getActiveSynergies(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [synergyVersion],
  );



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

  const [previousOpen, setPreviousOpen] = useState(open);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (!open) { setSearch(""); setFocusedAlias(null); }
  }

  const byAlias = useMemo(
    () => new Map(champions.map((c) => [c.alias, c])),
    [champions],
  );

  const focusedChamp = focusedAlias ? byAlias.get(focusedAlias) ?? null : null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeSynergies.filter((s) => {
      if (focusedAlias && !s.champs.includes(focusedAlias)) return false;
      if (term) {
        const a = byAlias.get(s.champs[0])?.name?.toLowerCase() ?? s.champs[0].toLowerCase();
        const b = byAlias.get(s.champs[1])?.name?.toLowerCase() ?? s.champs[1].toLowerCase();
        const tag = s.tag.toLowerCase();
        if (!a.includes(term) && !b.includes(term) && !tag.includes(term))
          return false;
      }
      return true;
    }).sort((a, b) => {
      if (b.bonus !== a.bonus) return b.bonus - a.bonus;
      const aName = byAlias.get(a.champs[0])?.name ?? a.champs[0];
      const bName = byAlias.get(b.champs[0])?.name ?? b.champs[0];
      return aName.localeCompare(bName);
    });
  }, [search, focusedAlias, byAlias, activeSynergies]);

  const totalCount = activeSynergies.length;
  const championCount = useMemo(() => {
    const set = new Set<string>();
    for (const s of activeSynergies) {
      set.add(s.champs[0]);
      set.add(s.champs[1]);
    }
    return set.size;
  }, [activeSynergies]);

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
        aria-labelledby="synergy-title"
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
                Pair Synergy Atlas
              </div>
              <h2
                id="synergy-title"
                className="font-display text-2xl md:text-3xl tracking-[0.18em] text-rift-goldbright mt-0.5"
              >
                <span className="bg-gold-sheen bg-clip-text text-transparent">
                  SYNERGIES
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close synergies"
              className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors border border-rift-line hover:border-rift-gold/60"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="ornament">
            <span className="text-[9px] md:text-[10px] tracking-[0.4em] text-rift-gold/50 uppercase">
              {totalCount} pairs · {championCount} champions involved
            </span>
          </div>
        </div>

        {/* Search + focus controls */}
        <div className="px-4 md:px-6 pt-4 pb-3 space-y-2">
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
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by champion or synergy tag..."
              aria-label="Search synergies"
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

          {/* Focused champion banner */}
          {focusedChamp && (
            <div className="flex items-center gap-2 border border-rift-gold/40 bg-rift-gold/5 px-2 py-1.5">
              <span className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
                Focused
              </span>
              <img
                src={focusedChamp.iconUrl}
                alt={focusedChamp.name}
                className="w-6 h-6 border border-rift-gold/40"
              />
              <span className="font-display text-sm text-rift-goldbright tracking-wider flex-1 truncate">
                {focusedChamp.name}
              </span>
              <button
                type="button"
                onClick={() => setFocusedAlias(null)}
                aria-label="Clear focus"
                className="w-6 h-6 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4L4 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-baseline justify-between text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "synergy" : "synergies"}
              {focusedAlias || search ? " matching" : ""}
            </span>
            {!focusedAlias && (
              <span className="text-rift-muted/70 italic normal-case tracking-wider">
                Click any champion to filter
              </span>
            )}
          </div>
        </div>

        {/* Synergy list */}
        <div className="px-4 md:px-6 pb-4 max-h-[55vh] overflow-y-auto custom-scroll space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-[11px] uppercase tracking-[0.3em] text-rift-muted italic">
              No synergies match
            </div>
          ) : (
            filtered.map((s, i) => {
              // When focused, put the focused champion on the left for easier
              // scanning of who they pair with.
              const champs =
                focusedAlias === s.champs[1]
                  ? ([s.champs[1], s.champs[0]] as const)
                  : s.champs;
              return (
                <SynergyRow
                  key={`${s.champs[0]}-${s.champs[1]}-${i}`}
                  aliasA={champs[0]}
                  aliasB={champs[1]}
                  tag={s.tag}
                  bonus={s.bonus}
                  byAlias={byAlias}
                  focusedAlias={focusedAlias}
                  onFocus={(alias) =>
                    setFocusedAlias((cur) => (cur === alias ? null : alias))
                  }
                />
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-rift-gold/20 px-4 md:px-6 py-2.5 text-center">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted/70">
            ★★★ iconic · ★★ strong · ★ situational · ESC to close
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function SynergyRow({
  aliasA,
  aliasB,
  tag,
  bonus,
  byAlias,
  focusedAlias,
  onFocus,
}: {
  aliasA: string;
  aliasB: string;
  tag: string;
  bonus: number;
  byAlias: Map<string, Champion>;
  focusedAlias: string | null;
  onFocus: (alias: string) => void;
}) {
  const a = byAlias.get(aliasA);
  const b = byAlias.get(aliasB);
  const ringByBonus =
    bonus >= 3 ? "ring-2 ring-rift-gold/60" : bonus === 2 ? "ring-1 ring-rift-gold/40" : "ring-1 ring-rift-line";
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-3 border border-rift-line/50 bg-rift-bg/30 hover:bg-rift-bg/60 px-2 md:px-3 py-2 transition-colors ${ringByBonus}`}
    >
      <ChampionPill
        champ={a ?? null}
        alias={aliasA}
        align="right"
        focused={focusedAlias === aliasA}
        onClick={() => onFocus(aliasA)}
      />
      <div className="flex flex-col items-center gap-0.5 min-w-[6rem] md:min-w-[10rem] px-1">
        <span className="text-rift-gold/70 text-xs md:text-sm font-display">+</span>
        <span className="text-[10px] md:text-[11px] uppercase tracking-[0.18em] text-rift-mutedbright text-center leading-tight">
          {tag}
        </span>
        <span
          className="text-rift-goldbright tabular-nums tracking-wider text-[11px] md:text-xs"
          title={`Bonus +${bonus}`}
          aria-label={`Bonus ${bonus} of 3`}
        >
          {"★".repeat(bonus)}
          <span className="text-rift-muted/40">{"☆".repeat(3 - bonus)}</span>
        </span>
      </div>
      <ChampionPill
        champ={b ?? null}
        alias={aliasB}
        align="left"
        focused={focusedAlias === aliasB}
        onClick={() => onFocus(aliasB)}
      />
    </div>
  );
}

function ChampionPill({
  champ,
  alias,
  align,
  focused,
  onClick,
}: {
  champ: Champion | null;
  alias: string;
  align: "left" | "right";
  focused: boolean;
  onClick: () => void;
}) {
  const layout = align === "right" ? "flex-row-reverse text-right" : "flex-row text-left";
  const focusCls = focused
    ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
    : "border-rift-line/60 hover:border-rift-gold/50 hover:bg-rift-gold/5 text-rift-mutedbright hover:text-rift-goldbright";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex ${layout} items-center gap-2 border ${focusCls} px-1 py-0.5 transition-all min-w-0`}
      title={`Filter by ${champ?.name ?? alias}`}
    >
      {champ ? (
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-7 h-7 md:w-8 md:h-8 bg-rift-bg flex-shrink-0" />
      )}
      <span className="font-display text-[11px] md:text-xs tracking-wider truncate min-w-0">
        {champ?.name ?? alias}
      </span>
    </button>
  );
}
