"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import type { SeriesFormat } from "@/lib/types";

const FORMATS: { value: SeriesFormat; label: string; sub: string }[] = [
  { value: "bo1", label: "Best of 1", sub: "Single game" },
  { value: "bo3", label: "Best of 3", sub: "First to 2 wins" },
  { value: "bo5", label: "Best of 5", sub: "First to 3 wins" },
];

export default function CreateSimulationForm() {
  const startSimulation = useDraftStore((s) => s.startSimulation);
  const [format, setFormat] = useState<SeriesFormat>("bo3");
  const [fearless, setFearless] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [blueTeam, setBlueTeam] = useState("Blue Side");
  const [redTeam, setRedTeam] = useState("Red Side");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(titleRef.current, {
        opacity: 0,
        y: -30,
        scale: 0.96,
        duration: 1.0,
        ease: "power3.out",
      });
      gsap.from(".cs-stagger", {
        opacity: 0,
        y: 16,
        stagger: 0.07,
        duration: 0.6,
        ease: "power2.out",
        delay: 0.2,
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const fearlessDisabled = format === "bo1";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startSimulation({
      format,
      fearless: fearlessDisabled ? false : fearless,
      timerEnabled,
      blueTeam: blueTeam.trim() || "Blue Side",
      redTeam: redTeam.trim() || "Red Side",
    });
  };

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen flex items-center justify-center px-4 py-10 overflow-hidden"
    >
      {/* decorative side lines */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-rift-gold/30 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-rift-gold/30 to-transparent" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* Hero */}
        <div className="text-center mb-8 md:mb-10">
          <div
            ref={titleRef}
            className="font-display text-5xl md:text-7xl tracking-[0.08em] leading-none"
          >
            <span className="bg-gold-sheen bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(200,170,110,0.4)]">
              DRAFT
            </span>
            <span className="text-rift-gold/90">SIM</span>
          </div>
          <div className="cs-stagger ornament mt-4 text-[10px] md:text-xs tracking-[0.5em] text-rift-gold/80 uppercase">
            <span>League of Legends Draft Simulator</span>
          </div>
        </div>

        <div className="cs-stagger relative border border-rift-gold/30 bg-rift-panel/70 backdrop-blur-md p-6 md:p-8 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
          {/* ornamental corner accents */}
          <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
          <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
          <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

          <div className="cs-stagger mb-6">
            <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
              Series Format
            </label>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {FORMATS.map((f) => {
                const active = format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormat(f.value)}
                    className={`group relative px-2 md:px-4 py-3 md:py-4 border text-center transition-all ${
                      active
                        ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                        : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                    }`}
                  >
                    {active && (
                      <>
                        <span className="absolute -top-1 -left-1 w-2 h-2 rotate-45 bg-rift-gold" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rotate-45 bg-rift-gold" />
                        <span className="absolute -bottom-1 -left-1 w-2 h-2 rotate-45 bg-rift-gold" />
                        <span className="absolute -bottom-1 -right-1 w-2 h-2 rotate-45 bg-rift-gold" />
                      </>
                    )}
                    <div className="font-display text-base md:text-xl">
                      {f.label}
                    </div>
                    <div className="text-[9px] md:text-[10px] uppercase tracking-widest mt-1 text-rift-muted">
                      {f.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cs-stagger grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <TeamInput
              label="Blue Team"
              side="blue"
              value={blueTeam}
              onChange={setBlueTeam}
            />
            <TeamInput
              label="Red Team"
              side="red"
              value={redTeam}
              onChange={setRedTeam}
            />
          </div>

          <div className="cs-stagger space-y-3 mb-8">
            <ToggleRow
              label="Fearless Draft"
              description={
                fearlessDisabled
                  ? "Available for Bo3 and Bo5 only"
                  : "Picked champions are locked out of subsequent games"
              }
              checked={!fearlessDisabled && fearless}
              disabled={fearlessDisabled}
              onChange={setFearless}
            />
            <ToggleRow
              label="Timer"
              description="30 seconds per action. Bans skip, picks random-fill on timeout."
              checked={timerEnabled}
              onChange={setTimerEnabled}
            />
          </div>

          <button
            type="submit"
            className="cs-stagger btn-gold w-full py-4 font-display text-lg md:text-xl tracking-[0.4em]"
          >
            BEGIN DRAFT
          </button>
        </div>

        <div className="cs-stagger mt-6 text-center text-[10px] tracking-[0.3em] uppercase text-rift-muted">
          Data courtesy of CommunityDragon · Meraki Analytics
        </div>
      </form>
    </div>
  );
}

function TeamInput({
  label,
  side,
  value,
  onChange,
}: {
  label: string;
  side: "blue" | "red";
  value: string;
  onChange: (v: string) => void;
}) {
  const inputId = `team-input-${side}`;
  const colors =
    side === "blue"
      ? "border-rift-blue/40 focus-within:border-rift-blue focus-within:shadow-glow-blue text-rift-bluebright"
      : "border-rift-red/40 focus-within:border-rift-red focus-within:shadow-glow-red text-rift-redbright";
  return (
    <div>
      <label
        htmlFor={inputId}
        className={`block text-[10px] uppercase tracking-[0.4em] mb-2 ${
          side === "blue" ? "text-rift-blue" : "text-rift-red"
        }`}
      >
        {label}
      </label>
      <div
        className={`flex items-center bg-rift-bg border transition-all ${colors}`}
      >
        <div
          className={`w-1 self-stretch ${
            side === "blue" ? "bg-rift-blue" : "bg-rift-red"
          }`}
        />
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={24}
          className="flex-1 bg-transparent px-3 py-2.5 outline-none text-rift-goldbright placeholder:text-rift-muted"
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group w-full flex items-center justify-between px-4 py-3 border transition-all text-left ${
        disabled
          ? "border-rift-line/50 opacity-40 cursor-not-allowed"
          : checked
          ? "border-rift-gold/70 bg-rift-gold/5"
          : "border-rift-line hover:border-rift-gold/40 hover:bg-rift-gold/[0.03]"
      }`}
    >
      <div>
        <div className="text-sm text-rift-goldbright font-semibold tracking-wider">
          {label}
        </div>
        <div className="text-xs text-rift-muted mt-0.5">{description}</div>
      </div>
      <div
        className={`relative w-12 h-6 rounded-full border transition-colors shrink-0 ml-3 ${
          checked
            ? "bg-gradient-to-r from-rift-golddark to-rift-gold border-rift-gold"
            : "bg-rift-bg border-rift-line"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
            checked
              ? "left-[26px] bg-rift-goldbright shadow-[0_0_10px_rgba(240,230,210,0.8)]"
              : "left-0.5 bg-rift-muted"
          }`}
        />
      </div>
    </button>
  );
}
