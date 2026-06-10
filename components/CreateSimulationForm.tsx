"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import type {
  AIDifficulty,
  DraftMode,
  Roster,
  SeriesFormat,
  Side,
} from "@/lib/types";
import { deriveStar, randomizeRoster } from "@/lib/players";
import TierListView from "./TierListView";
import MetaEditor from "./MetaEditor";
import { MetaPresetQuickPick, PairingsPresetQuickPick } from "./PresetQuickPick";
import SynergyView from "./SynergyView";
import RosterEditor from "./RosterEditor";
import { PERSONALITY_LIST } from "@/lib/draftAI";
import type { SideRule } from "@/lib/series";
import {
  PersonalityPanelSelect,
  RANDOM_PERSONALITY_VALUE,
} from "./PersonalitySelect";

const SIDE_RULES: { value: SideRule; label: string; sub: string }[] = [
  { value: "loser-blue", label: "Loser Blue", sub: "Loser takes blue side (default)" },
  { value: "fixed", label: "Fixed Sides", sub: "Teams keep their sides all series" },
  { value: "alternate", label: "Alternate", sub: "Sides swap every game" },
  { value: "loser-picks", label: "Loser Picks", sub: "Loser chooses their side" },
];

const FORMATS: { value: SeriesFormat; label: string; sub: string }[] = [
  { value: "bo1", label: "Best of 1", sub: "Single game" },
  { value: "bo3", label: "Best of 3", sub: "First to 2 wins" },
  { value: "bo5", label: "Best of 5", sub: "First to 3 wins" },
];

const MODES: { value: DraftMode; label: string; sub: string }[] = [
  { value: "pvp", label: "PvP", sub: "Two human drafters" },
  { value: "pvai", label: "vs AI", sub: "One side automated" },
  { value: "aivai", label: "AI vs AI", sub: "Watch the bots draft" },
];

const DIFFICULTIES: { value: AIDifficulty; label: string; sub: string }[] = [
  { value: "easy", label: "Easy", sub: "Wider sampling, no lookahead" },
  { value: "normal", label: "Normal", sub: "Full feature set" },
  { value: "hard", label: "Hard", sub: "Tight sampling, optimal play" },
];

interface FormProps {
  // Optional back callback. When present, a "← Back" button shows in the
  // header so the user can return to the entry menu without losing data
  // outside the form. When absent (legacy callsite), no button renders.
  onBack?: () => void;
}

export default function CreateSimulationForm({ onBack }: FormProps = {}) {
  const startSimulation = useDraftStore((s) => s.startSimulation);
  const champions = useDraftStore((s) => s.champions);
  const metaOverride = useDraftStore((s) => s.metaOverride);
  const metaVersion = useDraftStore((s) => s.metaVersion);
  const metaSource = useDraftStore((s) => s.metaSource);
  const randomizeMetaTiers = useDraftStore((s) => s.randomizeMetaTiers);
  const resetMetaTiers = useDraftStore((s) => s.resetMetaTiers);
  const metaEnabled = useDraftStore((s) => s.metaEnabled);
  const setMetaEnabledStore = useDraftStore((s) => s.setMetaEnabled);
  const applyCustomMeta = useDraftStore((s) => s.applyCustomMeta);
  const synergyOverride = useDraftStore((s) => s.synergyOverride);
  const counterOverride = useDraftStore((s) => s.counterOverride);
  const randomizeSynergiesAndCounters = useDraftStore(
    (s) => s.randomizeSynergiesAndCounters,
  );
  const resetSynergiesAndCounters = useDraftStore(
    (s) => s.resetSynergiesAndCounters,
  );
  const synergiesCountersRandomized =
    synergyOverride != null || counterOverride != null;
  const [format, setFormat] = useState<SeriesFormat>("bo3");
  const [fearless, setFearless] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [blueTeam, setBlueTeam] = useState("Blue Side");
  const [redTeam, setRedTeam] = useState("Red Side");
  const [mode, setMode] = useState<DraftMode>("pvp");
  // For pvai: which side is the AI. Defaults to red so the human plays blue.
  const [aiSide, setAiSide] = useState<Side>("red");
  // AI difficulty — only meaningful when an AI is participating.
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("normal");
  // Per-side difficulty overrides — only meaningful in aivai mode where
  // both sides are AI-controlled. Lets the user run handicap matches
  // (e.g. blue Hard vs red Easy). Defaults to the global aiDifficulty
  // unless the user explicitly enables the override toggle.
  const [perSideDifficulty, setPerSideDifficulty] = useState(false);
  const [blueAiDifficulty, setBlueAiDifficulty] =
    useState<AIDifficulty>("normal");
  const [redAiDifficulty, setRedAiDifficulty] =
    useState<AIDifficulty>("normal");
  const [tierListOpen, setTierListOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [synergyOpen, setSynergyOpen] = useState(false);
  // Optional player rosters. Null = no roster (no win bias, classic behavior).
  // When set, the team's star derives from it and the sim/AI use the players.
  const [bluePlayers, setBluePlayers] = useState<Roster | null>(null);
  const [redPlayers, setRedPlayers] = useState<Roster | null>(null);
  const [rosterEditor, setRosterEditor] = useState<null | "blue" | "red">(null);
  // Side rule for multi-game formats.
  const [sideRule, setSideRule] = useState<SideRule>("loser-blue");
  // AI personality selectors — "random" by default (picks on submit).
  const [bluePersonality, setBluePersonality] = useState(RANDOM_PERSONALITY_VALUE);
  const [redPersonality, setRedPersonality] = useState(RANDOM_PERSONALITY_VALUE);
  const isCustomized = metaOverride != null;

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
  // AI vs AI runs without a human on the clock, so the action timer can't
  // do anything useful. Surface that in the UI instead of silently flipping
  // the toggle off in handleSubmit.
  const timerDisabled = mode === "aivai";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // AI vs AI runs without a human on the clock, so the action timer is
    // meaningless — force it off so the watcher experience is uninterrupted.
    const effectiveTimer = mode === "aivai" ? false : timerEnabled;
    // Resolve "random" personality sentinel → pick a random one from the list.
    const resolvePersonality = (val: string): string | undefined => {
      if (val === RANDOM_PERSONALITY_VALUE) {
        return PERSONALITY_LIST[Math.floor(Math.random() * PERSONALITY_LIST.length)].id;
      }
      return val;
    };
    // Personality only meaningful when an AI is involved.
    const hasBlueAI = mode === "aivai" || (mode === "pvai" && aiSide === "blue");
    const hasRedAI = mode === "aivai" || (mode === "pvai" && aiSide === "red");
    startSimulation({
      format,
      fearless: fearlessDisabled ? false : fearless,
      timerEnabled: effectiveTimer,
      blueTeam: blueTeam.trim() || "Blue Side",
      redTeam: redTeam.trim() || "Red Side",
      mode,
      aiSide: mode === "pvai" ? aiSide : null,
      aiDifficulty,
      // Per-side overrides only apply in AI vs AI when the toggle is on.
      // For pvai, the lone AI uses `aiDifficulty`. For pvp neither field
      // is meaningful so we don't send them.
      blueAiDifficulty:
        mode === "aivai" && perSideDifficulty ? blueAiDifficulty : undefined,
      redAiDifficulty:
        mode === "aivai" && perSideDifficulty ? redAiDifficulty : undefined,
      bluePlayers: bluePlayers ?? undefined,
      redPlayers: redPlayers ?? undefined,
      // Side rule only meaningful for multi-game formats.
      sideRule: format !== "bo1" ? sideRule : undefined,
      // Personality IDs only sent when the respective side is AI-controlled.
      bluePersonalityId: hasBlueAI ? resolvePersonality(bluePersonality) : undefined,
      redPersonalityId: hasRedAI ? resolvePersonality(redPersonality) : undefined,
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

      {/* Back to mode selector — only when callsite provides it */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all text-[9px] md:text-[10px] uppercase tracking-[0.3em] z-20"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          Back
        </button>
      )}

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

          <div className="cs-stagger mb-6">
            <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
              Drafters
            </label>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {MODES.map((m) => {
                const active = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
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
                      {m.label}
                    </div>
                    <div className="text-[9px] md:text-[10px] uppercase tracking-widest mt-1 text-rift-muted">
                      {m.sub}
                    </div>
                  </button>
                );
              })}
            </div>
            {mode === "pvai" && (
              <div className="mt-3 grid grid-cols-2 gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => setAiSide("red")}
                  className={`px-3 py-2 border text-center font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all ${
                    aiSide === "red"
                      ? "border-rift-blue bg-rift-blue/10 text-rift-bluebright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-blue/60 hover:text-rift-bluebright hover:bg-rift-blue/5"
                  }`}
                  title="You draft for Blue side; AI drafts for Red"
                >
                  You: Blue
                </button>
                <button
                  type="button"
                  onClick={() => setAiSide("blue")}
                  className={`px-3 py-2 border text-center font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all ${
                    aiSide === "blue"
                      ? "border-rift-red bg-rift-red/10 text-rift-redbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-red/60 hover:text-rift-redbright hover:bg-rift-red/5"
                  }`}
                  title="You draft for Red side; AI drafts for Blue"
                >
                  You: Red
                </button>
              </div>
            )}
            {(mode === "pvai" || mode === "aivai") && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
                    {mode === "aivai" && perSideDifficulty
                      ? "Default Difficulty (overridden below)"
                      : "AI Difficulty"}
                  </label>
                  {/* Per-side toggle — only visible in AI vs AI mode. */}
                  {mode === "aivai" && (
                    <label className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perSideDifficulty}
                        onChange={(e) =>
                          setPerSideDifficulty(e.target.checked)
                        }
                        className="accent-rift-gold"
                      />
                      Per-side
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  {DIFFICULTIES.map((d) => {
                    const active = aiDifficulty === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setAiDifficulty(d.value)}
                        className={`px-2 py-1.5 md:py-2 border text-center transition-all ${
                          active
                            ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                            : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                        }`}
                        title={d.sub}
                      >
                        <div className="font-display text-xs md:text-sm tracking-wider">
                          {d.label}
                        </div>
                        <div className="text-[8px] md:text-[9px] uppercase tracking-widest mt-0.5 text-rift-muted/80">
                          {d.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Per-side difficulty overrides — appear when per-side
                    toggle is on in AI vs AI mode. Two stacked rows, one
                    per team, each with the same 3 options. */}
                {mode === "aivai" && perSideDifficulty && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SideDifficultyRow
                      side="blue"
                      label="Blue AI"
                      value={blueAiDifficulty}
                      onChange={setBlueAiDifficulty}
                    />
                    <SideDifficultyRow
                      side="red"
                      label="Red AI"
                      value={redAiDifficulty}
                      onChange={setRedAiDifficulty}
                    />
                  </div>
                )}
              </div>
            )}
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

          {/* Player rosters (optional). When set, the team's star rating
              derives from the roster and the sim/AI factor in each player's
              tier and champion pools. Left unset → classic behavior. */}
          <div className="cs-stagger mb-6">
            <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
              Player Rosters <span className="text-rift-muted normal-case tracking-normal">(optional — tiers + champ pools)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <RosterCard
                side="blue"
                name={blueTeam || "Blue Side"}
                roster={bluePlayers}
                onEdit={() => setRosterEditor("blue")}
                onRandomize={() => setBluePlayers(randomizeRoster({ champions }))}
                onClear={() => setBluePlayers(null)}
              />
              <RosterCard
                side="red"
                name={redTeam || "Red Side"}
                roster={redPlayers}
                onEdit={() => setRosterEditor("red")}
                onRandomize={() => setRedPlayers(randomizeRoster({ champions }))}
                onClear={() => setRedPlayers(null)}
              />
            </div>
          </div>

          <div className="cs-stagger space-y-3 mb-6">
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
              description={
                timerDisabled
                  ? "Disabled in AI vs AI — there's no human on the clock"
                  : "30 seconds per action. Bans skip, picks random-fill on timeout."
              }
              checked={!timerDisabled && timerEnabled}
              disabled={timerDisabled}
              onChange={setTimerEnabled}
            />
          </div>

          {/* Side rule — Bo3/Bo5 only */}
          {format !== "bo1" && (
            <div className="cs-stagger mb-6">
              <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
                Side Rule
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SIDE_RULES.map((sr) => {
                  const active = sideRule === sr.value;
                  return (
                    <button
                      key={sr.value}
                      type="button"
                      onClick={() => setSideRule(sr.value)}
                      className={`px-3 py-2.5 border text-left transition-all ${
                        active
                          ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                          : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                      }`}
                    >
                      <div className="font-display text-sm tracking-wider">{sr.label}</div>
                      <div className="text-[9px] uppercase tracking-[0.2em] text-rift-muted mt-0.5">
                        {sr.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Personality selectors — only when an AI side is present */}
          {mode !== "pvp" ? (
            <div className="cs-stagger mb-8">
              <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
                AI Personality
              </label>
              <div className={`grid gap-3 ${mode === "aivai" ? "grid-cols-2" : "grid-cols-1"}`}>
                {(mode === "aivai" || (mode === "pvai" && aiSide === "blue")) && (
                  <PersonalityPanelSelect
                    label={mode === "aivai" ? "Blue AI" : "AI"}
                    side="blue"
                    value={bluePersonality}
                    onChange={setBluePersonality}
                  />
                )}
                {(mode === "aivai" || (mode === "pvai" && aiSide === "red")) && (
                  <PersonalityPanelSelect
                    label={mode === "aivai" ? "Red AI" : "AI"}
                    side="red"
                    value={redPersonality}
                    onChange={setRedPersonality}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="mb-8" />
          )}

          <button
            type="submit"
            className="cs-stagger btn-gold w-full py-4 font-display text-lg md:text-xl tracking-[0.4em]"
          >
            BEGIN DRAFT
          </button>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => setTierListOpen(true)}
              className="py-3 border border-rift-gold/60 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden>
                <path d="M3 4h14v2H3zM3 9h10v2H3zM3 14h6v2H3z" />
                <path d="M15 11h2v2h-2zM12 14h5v2h-5z" opacity="0.6" />
              </svg>
              <span className="hidden md:inline">View Tier List</span>
              <span className="md:hidden">Tier List</span>
            </button>
            <button
              type="button"
              onClick={() => setSynergyOpen(true)}
              className="py-3 border border-rift-gold/60 bg-rift-gold/5 text-rift-goldbright hover:bg-rift-gold/15 hover:border-rift-gold font-display text-[11px] md:text-sm tracking-[0.3em] uppercase transition-all flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden>
                <circle cx="6" cy="10" r="3" />
                <circle cx="14" cy="10" r="3" />
                <path d="M9 10h2" strokeLinecap="round" />
              </svg>
              <span className="hidden md:inline">View Synergies</span>
              <span className="md:hidden">Synergies</span>
            </button>
          </div>

          {/* Meta master switch — turns off the entire tier system. When
              off, AI scoring loses its meta-tier signal, simulator's
              metaStrength flattens, and tier badges hide. State persists
              in localStorage. */}
          <button
            type="button"
            onClick={() => setMetaEnabledStore(!metaEnabled)}
            className={`mt-2 w-full flex items-center justify-between px-4 py-2.5 border transition-all text-left ${
              metaEnabled
                ? "border-rift-gold/60 bg-rift-gold/5"
                : "border-rift-line hover:border-rift-gold/40 hover:bg-rift-gold/[0.03]"
            }`}
            aria-pressed={metaEnabled}
          >
            <div>
              <div className="font-display text-[11px] md:text-xs uppercase tracking-[0.3em] text-rift-goldbright">
                Meta tiers
              </div>
              <div className="text-[9px] md:text-[10px] text-rift-muted mt-0.5">
                {metaEnabled
                  ? "ON — AI prefers S+ picks; sim weights tier strength"
                  : "OFF — flat meta, every champion treated as neutral"}
              </div>
            </div>
            <div
              className={`relative w-10 h-5 rounded-full border transition-colors shrink-0 ml-3 ${
                metaEnabled
                  ? "bg-gradient-to-r from-rift-golddark to-rift-gold border-rift-gold"
                  : "bg-rift-bg border-rift-line"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                  metaEnabled
                    ? "left-[22px] bg-rift-goldbright shadow-[0_0_8px_rgba(240,230,210,0.7)]"
                    : "left-0.5 bg-rift-muted"
                }`}
              />
            </div>
          </button>

          {/* Meta controls — three actions: randomize, edit (drag-and-drop),
              or reset to default. Active meta is persisted in localStorage. */}
          <div
            className={`grid grid-cols-3 gap-2 mt-2 transition-opacity ${
              metaEnabled ? "" : "opacity-40 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={randomizeMetaTiers}
              className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5"
              title={isCustomized && metaSource === "randomized" ? "Re-randomize" : "Randomize meta"}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5" aria-hidden>
                <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12c0-3 3-4 5-4s5 1 5 4" strokeLinecap="round" />
              </svg>
              <span className="hidden md:inline">Randomize</span>
              <span className="md:hidden">Random</span>
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5"
              title="Edit meta with drag and drop"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5" aria-hidden>
                <path d="M2 12l8-8 2 2-8 8H2v-2zM10 4l2 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden md:inline">Custom Edit</span>
              <span className="md:hidden">Edit</span>
            </button>
            <button
              type="button"
              onClick={resetMetaTiers}
              disabled={!isCustomized}
              className={`py-2.5 border font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5 ${
                isCustomized
                  ? "border-rift-line text-rift-mutedbright hover:text-rift-redbright hover:border-rift-red/50 hover:bg-rift-red/5"
                  : "border-rift-line/40 text-rift-muted/40 cursor-not-allowed"
              }`}
            >
              Reset
            </button>
          </div>
          <div
            className="mt-2 text-center text-[9px] md:text-[10px] uppercase tracking-[0.35em]"
          >
            <span className="text-rift-muted">Active meta · </span>
            <span
              className={
                metaSource === "custom"
                  ? "text-rift-bluebright"
                  : metaSource === "randomized"
                  ? "text-rift-goldbright"
                  : "text-rift-mutedbright"
              }
            >
              {metaSource === "custom"
                ? `Custom (v${metaVersion})`
                : metaSource === "randomized"
                ? `Randomized (v${metaVersion})`
                : "Default · Patch 26.08"}
            </span>
          </div>

          {/* Saved tier lists from the main-menu library — one click
              applies a preset as the active meta for this series. */}
          <div className={metaEnabled ? "" : "opacity-40 pointer-events-none"}>
            <MetaPresetQuickPick />
          </div>

          {/* Random synergies + counters. Generates ~120 random pair
              synergies and ~90 random same-lane counters. Independent of
              the tier randomizer so they can be toggled in any
              combination. */}
          <div
            className={`grid grid-cols-2 gap-2 mt-3 transition-opacity ${
              metaEnabled ? "" : "opacity-40 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={randomizeSynergiesAndCounters}
              className="py-2.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5"
              title={
                synergiesCountersRandomized
                  ? "Re-randomize synergies & counters"
                  : "Randomize synergies & counters"
              }
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="w-3.5 h-3.5" aria-hidden>
                <path d="M2 4h7l-2-2M14 12H7l2 2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="10" r="1.6" />
                <circle cx="11" cy="10" r="1.6" />
              </svg>
              <span className="hidden md:inline">Random Pairings</span>
              <span className="md:hidden">Pairings</span>
            </button>
            <button
              type="button"
              onClick={resetSynergiesAndCounters}
              disabled={!synergiesCountersRandomized}
              className={`py-2.5 border font-display text-[10px] md:text-xs tracking-[0.25em] uppercase transition-all flex items-center justify-center gap-1.5 ${
                synergiesCountersRandomized
                  ? "border-rift-line text-rift-mutedbright hover:text-rift-redbright hover:border-rift-red/50 hover:bg-rift-red/5"
                  : "border-rift-line/40 text-rift-muted/40 cursor-not-allowed"
              }`}
            >
              Reset Pairings
            </button>
          </div>
          <div className="mt-2 text-center text-[9px] md:text-[10px] uppercase tracking-[0.35em]">
            <span className="text-rift-muted">Pairings · </span>
            <span
              className={
                synergiesCountersRandomized
                  ? "text-rift-goldbright"
                  : "text-rift-mutedbright"
              }
            >
              {synergiesCountersRandomized ? "Randomized" : "Default"}
            </span>
          </div>

          {/* Saved synergy & counter sets from the library. */}
          <div className={metaEnabled ? "" : "opacity-40 pointer-events-none"}>
            <PairingsPresetQuickPick />
          </div>
        </div>

        <div className="cs-stagger mt-6 text-center text-[10px] tracking-[0.3em] uppercase text-rift-muted">
          Data courtesy of CommunityDragon · Meraki Analytics
        </div>
      </form>

      <TierListView
        open={tierListOpen}
        champions={champions}
        overrideVersion={metaVersion}
        onClose={() => setTierListOpen(false)}
      />

      <MetaEditor
        open={editorOpen}
        champions={champions}
        initialOverride={metaOverride}
        onSave={(override) => applyCustomMeta(override)}
        onClose={() => setEditorOpen(false)}
      />

      <SynergyView
        open={synergyOpen}
        champions={champions}
        onClose={() => setSynergyOpen(false)}
      />

      <RosterEditor
        open={rosterEditor === "blue"}
        champions={champions}
        roster={bluePlayers}
        teamLabel={blueTeam || "Blue Side"}
        side="blue"
        onSave={(r) => setBluePlayers(r)}
        onClose={() => setRosterEditor(null)}
      />
      <RosterEditor
        open={rosterEditor === "red"}
        champions={champions}
        roster={redPlayers}
        teamLabel={redTeam || "Red Side"}
        side="red"
        onSave={(r) => setRedPlayers(r)}
        onClose={() => setRosterEditor(null)}
      />
    </div>
  );
}

// Compact card in the setup form for one team's optional roster: shows the
// derived star when set, with Edit / Randomize / Clear actions.
function RosterCard({
  side,
  name,
  roster,
  onEdit,
  onRandomize,
  onClear,
}: {
  side: "blue" | "red";
  name: string;
  roster: Roster | null;
  onEdit: () => void;
  onRandomize: () => void;
  onClear: () => void;
}) {
  const accent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const border =
    side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const star = roster ? deriveStar(roster) : null;
  return (
    <div className={`border ${border} bg-rift-bg/40 p-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-display text-xs uppercase tracking-[0.2em] truncate ${accent}`}>
          {name}
        </span>
        {roster && (
          <button
            type="button"
            onClick={onClear}
            className="text-rift-mutedbright/60 hover:text-rift-redbright text-[9px] uppercase tracking-[0.25em]"
            title="Clear roster"
          >
            clear
          </button>
        )}
      </div>
      <div className="mt-1 text-sm tracking-tight" aria-hidden>
        {star != null ? (
          <span className="text-rift-gold">
            {"★".repeat(star)}
            <span className="text-rift-line">{"★".repeat(5 - star)}</span>
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.25em] text-rift-muted/70">
            No roster set
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        <button
          type="button"
          onClick={onEdit}
          className="py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.2em] transition-all"
        >
          {roster ? "Edit" : "Add"}
        </button>
        <button
          type="button"
          onClick={onRandomize}
          className="py-1.5 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 text-[10px] uppercase tracking-[0.2em] transition-all"
        >
          Random
        </button>
      </div>
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

function SideDifficultyRow({
  side,
  label,
  value,
  onChange,
}: {
  side: Side;
  label: string;
  value: AIDifficulty;
  onChange: (v: AIDifficulty) => void;
}) {
  const containerCls =
    side === "blue"
      ? "border border-rift-blue/30 bg-rift-blue/[0.04] p-2"
      : "border border-rift-red/30 bg-rift-red/[0.04] p-2";
  const labelCls =
    side === "blue"
      ? "text-[9px] uppercase tracking-[0.3em] mb-1.5 text-rift-bluebright"
      : "text-[9px] uppercase tracking-[0.3em] mb-1.5 text-rift-redbright";
  return (
    <div className={containerCls}>
      <div className={labelCls}>{label}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {DIFFICULTIES.map((d) => {
          const active = value === d.value;
          const activeCls =
            side === "blue"
              ? "border-rift-blue bg-rift-blue/10 text-rift-bluebright"
              : "border-rift-red bg-rift-red/10 text-rift-redbright";
          const idleCls =
            side === "blue"
              ? "border-rift-line text-rift-mutedbright hover:border-rift-blue/60 hover:text-rift-bluebright hover:bg-rift-blue/5"
              : "border-rift-line text-rift-mutedbright hover:border-rift-red/60 hover:text-rift-redbright hover:bg-rift-red/5";
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => onChange(d.value)}
              className={`px-2 py-1 border text-center transition-all ${
                active ? activeCls : idleCls
              }`}
              title={d.sub}
            >
              <div className="font-display text-[10px] md:text-xs tracking-wider">
                {d.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
