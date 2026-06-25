"use client";

import { useState } from "react";
import { getTeam } from "@/lib/tournament";
import type { TournamentMatch, TournamentState } from "@/lib/tournament";
import type { AIDifficulty, DraftMode, SeriesFormat, Side } from "@/lib/types";
import type { MatchOverride } from "@/components/tournament/shared";

interface PillOpt<T> {
  value: T;
  label: string;
}
function PillRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly PillOpt<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55 mb-1">
        {label}
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`py-1.5 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                active
                  ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                  : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Match override modal (Phase 2.3) ────────────────────────────────
// Inline modal that appears when the user clicks "Start Match". Lets
// them override the match's format / mode / fearless / aiSide /
// difficulty for THIS match only. Defaults are seeded from the match
// record (which inherits from tournament defaults at creation).
//
// Built with createPortal-free overlay so it doesn't conflict with the
// confirm-modal portal usage. Click backdrop or "Start Default" to
// proceed without any overrides.
export function MatchOverrideModal({
  match,
  tournament,
  onStart,
  onCancel,
}: {
  match: TournamentMatch;
  tournament: TournamentState;
  onStart: (overrides: Partial<MatchOverride>) => void;
  onCancel: () => void;
}) {
  const blueTeam = getTeam(tournament, match.blueTeamId);
  const redTeam = getTeam(tournament, match.redTeamId);
  const [format, setFormat] = useState<SeriesFormat>(match.format);
  const [fearless, setFearless] = useState(match.fearless);
  const [mode, setMode] = useState<DraftMode>(match.mode);
  const [aiSide, setAiSide] = useState<Side>(match.aiSide ?? "red");
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(
    match.aiDifficulty,
  );
  const dirty =
    format !== match.format ||
    fearless !== match.fearless ||
    mode !== match.mode ||
    (mode === "pvai" && aiSide !== match.aiSide) ||
    aiDifficulty !== match.aiDifficulty;

  const handleStart = () => {
    if (!dirty) {
      onStart({}); // proceed with match's existing settings
      return;
    }
    onStart({
      format,
      fearless,
      mode,
      aiSide: mode === "pvai" ? aiSide : null,
      aiDifficulty,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-rift-bg/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="relative bg-rift-panel border-2 border-rift-gold/50 max-w-md w-full max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-rift-gold/20">
          <div className="text-[9px] uppercase tracking-[0.4em] text-rift-gold/70">
            Start Match
          </div>
          <div className="font-display text-base md:text-lg tracking-wider text-rift-goldbright mt-0.5">
            {blueTeam?.name ?? "TBD"} <span className="text-rift-mutedbright/60 mx-1">vs</span>{" "}
            {redTeam?.name ?? "TBD"}
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55 mt-1">
            Override settings for this match, or accept defaults
          </div>
        </div>
        <div className="p-4 md:p-5 space-y-3">
          <PillRow
            label="Format"
            value={format}
            options={[
              { value: "bo1" as const, label: "Bo1" },
              { value: "bo3" as const, label: "Bo3" },
              { value: "bo5" as const, label: "Bo5" },
            ]}
            onChange={setFormat}
          />
          <PillRow
            label="Mode"
            value={mode}
            options={[
              { value: "pvp" as const, label: "PvP" },
              { value: "pvai" as const, label: "vs AI" },
              { value: "aivai" as const, label: "AI vs AI" },
            ]}
            onChange={setMode}
          />
          {mode === "pvai" && (
            <div>
              <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/55 mb-1">
                Play as
              </div>
              {/* Pick the TEAM to control, not a side — sides swap each game
                  in a series, and aiSide follows the team (see startNextGame). */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAiSide("red")}
                  className={`py-1.5 border text-[10px] uppercase tracking-[0.2em] truncate transition-all ${
                    aiSide === "red"
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60"
                  }`}
                >
                  {blueTeam?.name ?? "Blue"}
                </button>
                <button
                  type="button"
                  onClick={() => setAiSide("blue")}
                  className={`py-1.5 border text-[10px] uppercase tracking-[0.2em] truncate transition-all ${
                    aiSide === "blue"
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60"
                  }`}
                >
                  {redTeam?.name ?? "Red"}
                </button>
              </div>
            </div>
          )}
          {(mode === "pvai" || mode === "aivai") && (
            <PillRow
              label="AI Difficulty"
              value={aiDifficulty}
              options={[
                { value: "easy" as const, label: "Easy" },
                { value: "normal" as const, label: "Normal" },
                { value: "hard" as const, label: "Hard" },
              ]}
              onChange={setAiDifficulty}
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright">
            <input
              type="checkbox"
              checked={fearless}
              onChange={(e) => setFearless(e.target.checked)}
              disabled={format === "bo1"}
              className="accent-rift-gold"
            />
            Fearless (within series)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.3em] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="btn-gold py-2.5 font-display text-[11px] tracking-[0.3em]"
          >
            {dirty ? "Start Match" : "Start (Defaults)"}
          </button>
        </div>
      </div>
    </div>
  );
}
