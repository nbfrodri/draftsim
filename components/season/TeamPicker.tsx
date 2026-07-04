"use client";

import { useEffect, useRef, useState } from "react";

import { LEAGUE_IDS, type LeagueId, type SeasonTeam } from "@/lib/season/types";
import TeamIcon from "../TeamIcon";

/** Custom team dropdown for Spectate vs Follow. Always opens below the trigger. */
export default function TeamPicker({
  byLeague,
  value,
  onChange,
}: {
  byLeague: Map<LeagueId, SeasonTeam[]>;
  value: string | null;
  onChange: (teamId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value
    ? [...byLeague.values()].flat().find((t) => t.id === value) ?? null
    : null;

  const pick = (teamId: string | null) => {
    onChange(teamId);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs px-2 py-1.5 outline-none focus:border-rift-gold/60 hover:border-rift-gold/40 transition-colors text-left"
      >
        {selected ? (
          <>
            <TeamIcon
              iconKey={selected.iconKey}
              logoUrl={selected.logoUrl}
              size={13}
              color={selected.color}
            />
            <span className="flex-1 truncate">{selected.name}</span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-rift-gold/60">
              {selected.leagueId}
            </span>
          </>
        ) : (
          <span className="flex-1">Spectate everything</span>
        )}
        <svg
          viewBox="0 0 16 16"
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto custom-scroll bg-rift-panel border border-rift-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.7)]"
        >
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            onClick={() => pick(null)}
            className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
              value == null
                ? "text-rift-goldbright bg-rift-gold/10"
                : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
            }`}
          >
            Spectate everything
          </button>
          {LEAGUE_IDS.map((l) => (
            <div key={l}>
              <div className="px-2 pt-1.5 pb-0.5 text-[8px] uppercase tracking-[0.3em] text-rift-gold/70 border-t border-rift-line/30">
                {l}
              </div>
              {(byLeague.get(l) ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={value === t.id}
                  onClick={() => pick(t.id)}
                  className={`w-full flex items-center gap-1.5 text-left px-2 py-1 text-xs transition-colors ${
                    value === t.id
                      ? "text-rift-goldbright bg-rift-gold/10"
                      : "text-rift-mutedbright hover:bg-rift-gold/5 hover:text-rift-goldbright"
                  }`}
                >
                  <TeamIcon
                    iconKey={t.iconKey}
                    logoUrl={t.logoUrl}
                    size={13}
                    color={t.color}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
