"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore, ACTION_SECONDS } from "@/store/draftStore";
import { currentGame, maxGames, requiredWins, seriesScore } from "@/lib/series";
import { currentAction } from "@/lib/draftEngine";
import { phaseLabel, TOTAL_ACTIONS } from "@/lib/draftOrder";
import Modal from "./Modal";
import TierListView from "./TierListView";
import SynergyView from "./SynergyView";

export default function DraftHeader() {
  const series = useDraftStore((s) => s.series)!;
  const secondsLeft = useDraftStore((s) => s.secondsLeft);
  const resetAll = useDraftStore((s) => s.resetAll);
  const soundEnabled = useDraftStore((s) => s.soundEnabled);
  const setSoundEnabled = useDraftStore((s) => s.setSoundEnabled);
  const volume = useDraftStore((s) => s.volume);
  const setVolume = useDraftStore((s) => s.setVolume);
  const champions = useDraftStore((s) => s.champions);
  const metaVersion = useDraftStore((s) => s.metaVersion);
  const game = currentGame(series);
  const action = currentAction(game);
  const score = seriesScore(series);
  const wins = requiredWins(series.format);

  const timerRef = useRef<HTMLDivElement | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [tierListOpen, setTierListOpen] = useState(false);
  const [synergyOpen, setSynergyOpen] = useState(false);

  useEffect(() => {
    if (!timerRef.current || secondsLeft == null) return;
    if (secondsLeft <= 5 && secondsLeft > 0) {
      gsap.fromTo(
        timerRef.current,
        { scale: 1.2 },
        { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" },
      );
    }
  }, [secondsLeft]);

  const sideColor =
    action?.side === "blue" ? "text-rift-blue" : "text-rift-red";
  const sideName =
    action?.side === "blue" ? series.blueTeam : series.redTeam;

  const progressPercent = (game.actionIndex / TOTAL_ACTIONS) * 100;
  const timerActive = series.timerEnabled && secondsLeft != null && secondsLeft > 0;

  return (
    <header className="relative border-b border-rift-gold/30 bg-gradient-to-b from-rift-bgdeep to-rift-bg/95 backdrop-blur z-20">
      <div className="px-3 md:px-6 py-2 md:py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-6">
        {/* LEFT — Brand + game info */}
        <div className="flex items-center gap-2 md:gap-5 min-w-0 justify-self-start">
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            aria-label="Exit draft and return to main menu"
            className="font-display text-base md:text-2xl tracking-[0.15em] shrink-0 cursor-pointer transition-all hover:brightness-125 hover:scale-[1.03] active:scale-100 focus:outline-none focus:ring-1 focus:ring-rift-gold/60 px-1"
          >
            <span className="bg-gold-sheen bg-clip-text text-transparent">DRAFT</span>
            <span className="text-rift-gold/90">SIM</span>
          </button>
          <div className="hidden lg:flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright">
            <span className="text-rift-gold">{series.format.toUpperCase()}</span>
            <span className="text-rift-muted">·</span>
            <span>Game {game.gameNumber} / {maxGames(series.format)}</span>
            {series.fearless && (
              <>
                <span className="text-rift-muted">·</span>
                <span className="text-rift-gold animate-breath">FEARLESS</span>
              </>
            )}
          </div>
        </div>

        {/* CENTER — Team names with VS and score pips (truly centered) */}
        <div className="flex items-center gap-3 md:gap-6 justify-self-center">
          <TeamBadge
            name={series.blueTeam}
            value={score.blue}
            target={wins}
            side="blue"
          />
          <div className="font-display text-xs md:text-base text-rift-gold/70 tracking-[0.3em] shrink-0">
            VS
          </div>
          <TeamBadge
            name={series.redTeam}
            value={score.red}
            target={wins}
            side="red"
          />
        </div>

        {/* RIGHT — Current action + Timer */}
        <div className="flex items-center gap-2 md:gap-4 justify-self-end shrink-0">
          <button
            type="button"
            onClick={() => setTierListOpen(true)}
            aria-label="View meta tier list"
            title="Meta tier list"
            className="hidden md:flex w-7 h-7 md:w-8 md:h-8 items-center justify-center rounded-sm text-rift-muted hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5" aria-hidden>
              <path d="M3 4h14v2H3zM3 9h10v2H3zM3 14h6v2H3z" />
              <path d="M15 11h2v2h-2zM12 14h5v2h-5z" opacity="0.6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setSynergyOpen(true)}
            aria-label="View synergies"
            title="Pair synergies"
            className="hidden md:flex w-7 h-7 md:w-8 md:h-8 items-center justify-center rounded-sm text-rift-muted hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 md:w-5 md:h-5" aria-hidden>
              <circle cx="6" cy="10" r="3" />
              <circle cx="14" cy="10" r="3" />
              <path d="M9 10h2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              aria-label={soundEnabled ? "Mute sound effects" : "Unmute sound effects"}
              title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
              className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-sm text-rift-muted hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors"
            >
              {soundEnabled && volume > 0 ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5" aria-hidden>
                  <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM13 7a1 1 0 011.707-.707 5 5 0 010 7.414A1 1 0 0113 13a3 3 0 000-6zM15.243 4.343a1 1 0 011.414 0 9 9 0 010 12.728 1 1 0 11-1.414-1.414 7 7 0 000-9.9 1 1 0 010-1.414z" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Master volume"
              title={`Volume: ${Math.round(volume * 100)}%`}
              disabled={!soundEnabled}
              className="hidden md:block w-20 accent-rift-gold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          {action && (
            <div className="hidden sm:block text-right">
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
                {phaseLabel(game.actionIndex)}
              </div>
              <div className={`text-xs md:text-sm font-display tracking-wider ${sideColor}`}>
                {sideName} · {action.kind.toUpperCase()}
              </div>
            </div>
          )}
          {secondsLeft != null && (
            <div
              ref={timerRef}
              className={`relative font-display text-2xl md:text-4xl tnum shrink-0 transition-colors ${
                secondsLeft <= 5
                  ? "text-rift-red drop-shadow-[0_0_10px_rgba(232,64,87,0.6)] animate-timer-pulse"
                  : secondsLeft <= 10
                  ? "text-rift-gold"
                  : "text-rift-goldbright"
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {String(Math.max(0, secondsLeft)).padStart(2, "0")}
            </div>
          )}
        </div>
      </div>

      {/* Draft progress bar */}
      <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-rift-line overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rift-golddark via-rift-gold to-rift-goldbright transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <Modal
        open={exitOpen}
        title="Exit Draft"
        message="Return to the main menu? Progress for this series will be lost."
        confirmLabel="Exit"
        cancelLabel="Keep Drafting"
        tone="danger"
        onConfirm={() => {
          setExitOpen(false);
          resetAll();
        }}
        onCancel={() => setExitOpen(false)}
      />

      <TierListView
        open={tierListOpen}
        champions={champions}
        overrideVersion={metaVersion}
        onClose={() => setTierListOpen(false)}
      />

      <SynergyView
        open={synergyOpen}
        champions={champions}
        onClose={() => setSynergyOpen(false)}
      />

      {/* Timer bar — CSS animation restarts on each new action via key */}
      {timerActive && (
        <div
          key={`timer-${game.id}-${game.actionIndex}`}
          className="absolute left-0 right-0 -bottom-[2px] h-[2px] bg-transparent pointer-events-none overflow-hidden"
        >
          <div
            className={`timer-bar-fill h-full w-full ${
              secondsLeft != null && secondsLeft <= 5
                ? "bg-rift-red shadow-[0_0_6px_rgba(232,64,87,0.8)]"
                : "bg-rift-blue/80"
            }`}
            style={{ animationDuration: `${ACTION_SECONDS}s` }}
          />
        </div>
      )}
    </header>
  );
}

function TeamBadge({
  name,
  value,
  target,
  side,
}: {
  name: string;
  value: number;
  target: number;
  side: "blue" | "red";
}) {
  const pips = Array.from({ length: target }, (_, i) => i < value);
  const textColor = side === "blue" ? "text-rift-blue" : "text-rift-red";
  const pipOn = side === "blue" ? "bg-rift-blue shadow-glow-blue" : "bg-rift-red shadow-glow-red";
  return (
    <div className={`flex items-center gap-1.5 md:gap-3 min-w-0 ${side === "red" ? "flex-row-reverse" : ""}`}>
      <div
        className={`hidden sm:block font-display text-xs md:text-base ${textColor} uppercase tracking-[0.2em] truncate max-w-[90px] md:max-w-[160px]`}
      >
        {name}
      </div>
      <div className="flex gap-1 shrink-0">
        {pips.map((on, i) => (
          <div
            key={i}
            className={`w-2 h-2 md:w-3 md:h-3 rotate-45 border transition-all ${
              on ? `${pipOn} border-transparent` : "border-rift-muted/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
