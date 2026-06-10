"use client";

import { memo } from "react";
import { useDraftStore } from "@/store/draftStore";
import type { PlayMode, PlaySpeed } from "../shared";

export const PlayControls = memo(function PlayControls({
  mode,
  speed,
  progress,
  onTogglePause,
  onSpeedToggle,
  onSkip,
}: {
  mode: PlayMode;
  speed: PlaySpeed;
  progress: number;
  onTogglePause: () => void;
  onSpeedToggle: () => void;
  onSkip: () => void;
}) {
  // Mute toggle reads from / writes to the same global `soundEnabled` flag
  // the DraftHeader uses, so the user has one conceptual setting across
  // both views. The button is visible only here (during playback) since
  // that's when event-reveal blips actually fire.
  const soundEnabled = useDraftStore((s) => s.soundEnabled);
  const setSoundEnabled = useDraftStore((s) => s.setSoundEnabled);
  const playLabel = mode === "playing" ? "Pause" : "Resume";
  return (
    <div className="space-y-2">
      <div className="h-1 bg-rift-bg/80 border border-rift-line/50 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rift-golddark via-rift-gold to-rift-goldbright"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      {/* 3 text buttons + 1 icon-only mute button. The auto column keeps
          the mute compact while the others fill evenly. */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          {playLabel}
        </button>
        <button
          type="button"
          onClick={onSpeedToggle}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          {speed}× speed
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="py-2 border border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright text-[10px] uppercase tracking-[0.3em] transition-all"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          aria-label={
            soundEnabled
              ? "Mute event sound effects"
              : "Unmute event sound effects"
          }
          aria-pressed={!soundEnabled}
          title={soundEnabled ? "Mute events" : "Unmute events"}
          className={`px-3 py-2 border transition-all ${
            soundEnabled
              ? "border-rift-line/70 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"
              : "border-rift-red/40 text-rift-redbright/80 hover:border-rift-red/70 hover:text-rift-redbright bg-rift-red/5"
          }`}
        >
          {soundEnabled ? (
            // Speaker with sound waves
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor" fillOpacity="0.3" />
              <path d="M11 5.5c1 1 1 4 0 5" />
              <path d="M13 4c1.5 1.5 1.5 6.5 0 8" opacity="0.7" />
            </svg>
          ) : (
            // Speaker with X (muted)
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor" fillOpacity="0.3" />
              <path d="M11 5l4 4M15 5l-4 4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});
