"use client";

import { useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { makeTeamId, TEAM_COLORS, TEAM_ICON_KEYS } from "@/lib/tournament";
import type {
  TournamentFormat,
  TournamentTeam,
  TournamentDefaults,
} from "@/lib/tournament";
import TeamIcon from "./TeamIcon";
import type { AIDifficulty, DraftMode, SeriesFormat, Side } from "@/lib/types";
import MetaPanel from "./MetaPanel";

// Team-count options. Single-elim now accepts any count from 2-8 with
// bye support — top seeds auto-advance when paired with virtual byes.
// Round-robin accepts 3-8 plus 10 (full pro-style group of ten).
// Double-elim restricted to powers of 2 ≥ 4. Swiss requires even N ≥ 4.
const ELIM_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const;
const RR_COUNTS = [3, 4, 5, 6, 7, 8, 10] as const;
const DOUBLE_ELIM_COUNTS = [4, 8, 16, 32] as const;
const SWISS_COUNTS = [4, 6, 8, 10, 12, 16] as const;
const GROUPS_PLAYOFFS_COUNTS = [4, 6, 8, 12, 16, 24, 32] as const;
type TeamCount = number;

// Pool of 64 evocative League-of-Legends-flavored team names used by
// the "Randomize Names" button. Picked without replacement so 32-team
// tournaments don't repeat unnecessarily.
const TEAM_NAME_POOL = [
  "Crimson Lions",
  "Frost Wolves",
  "Shadow Vipers",
  "Storm Hawks",
  "Iron Drakes",
  "Solar Phoenixes",
  "Void Ravens",
  "Tidal Krakens",
  "Phantom Kings",
  "Obsidian Dragons",
  "Azure Sentinels",
  "Crimson Reapers",
  "Sunfire Legion",
  "Eclipse Order",
  "Steel Outlaws",
  "Wraith Riders",
  "Vanguard Bears",
  "Astral Foxes",
  "Stormbringers",
  "Nightblade Elite",
  "Goldenmane",
  "Pyre Knights",
  "Tempest Heralds",
  "Bramblefang",
  "Verdant Stalkers",
  "Onyx Sentinels",
  "Cobalt Cavaliers",
  "Ember Pact",
  "Mistwalker Clan",
  "Glacier Rangers",
  "Spectral Guard",
  "Riftborn Aces",
  "Neon Wraiths",
  "Hellgate Wardens",
  "Dawnbreakers",
  "Duskhunters",
  "Blazing Comets",
  "Silver Talons",
  "Stoneheart Legion",
  "Twilight Wolves",
  "Saffron Tide",
  "Coral Reavers",
  "Vermillion Order",
  "Cinder Reign",
  "Northstar Brigade",
  "Hollow Pack",
  "Granite Guard",
  "Nebula Strikers",
  "Citrine Sirens",
  "Sapphire Talon",
  "Polar Marauders",
  "Bloodmoon Saints",
  "Ironhill",
  "Sky Reavers",
  "Lunar Vanguard",
  "Magma Monarchs",
  "Quicksilver",
  "Highland Wraiths",
  "Sandstorm Riders",
  "Auric Hounds",
  "Wildfire Spectres",
  "Velvet Daggers",
  "Thunderhoof",
  "Ironfist Crows",
];

const TOURNAMENT_FORMATS: { value: TournamentFormat; label: string; sub: string }[] = [
  { value: "single-elim", label: "Single Elimination", sub: "Bracket, lose-and-out" },
  { value: "round-robin", label: "Round Robin", sub: "Each team plays each other once" },
  {
    value: "double-elim",
    label: "Double Elimination",
    sub: "Winners + losers bracket; lose twice to be eliminated",
  },
  {
    value: "swiss",
    label: "Swiss",
    sub: "Pair by record each round; ceil(log2 N) rounds total",
  },
  {
    value: "swiss-playoffs",
    label: "Swiss + Playoffs",
    sub: "Swiss stage, then top N play single-elim",
  },
  {
    value: "groups-playoffs",
    label: "Groups + Playoffs",
    sub: "Round-robin group stage, then top N play single-elim",
  },
];

const FORMATS: { value: SeriesFormat; label: string }[] = [
  { value: "bo1", label: "Bo1" },
  { value: "bo3", label: "Bo3" },
  { value: "bo5", label: "Bo5" },
];
const MODES: { value: DraftMode; label: string }[] = [
  { value: "pvp", label: "PvP" },
  { value: "pvai", label: "vs AI" },
  { value: "aivai", label: "AI vs AI" },
];
const DIFFICULTIES: { value: AIDifficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

interface Props {
  onCancel: () => void;
}

export default function TournamentSetup({ onCancel }: Props) {
  const startTournament = useDraftStore((s) => s.startTournament);

  // ─── Form state ────────────────────────────────────────────────────
  const [name, setName] = useState("Untitled Tournament");
  const [tournamentFormat, setTournamentFormat] =
    useState<TournamentFormat>("single-elim");
  const [teamCount, setTeamCount] = useState<TeamCount>(4);
  const [teams, setTeams] = useState<TournamentTeam[]>(() =>
    defaultTeams(4),
  );

  // Per-match defaults — applied to every match.
  const [format, setFormat] = useState<SeriesFormat>("bo3");
  const [fearless, setFearless] = useState(false);
  const [mode, setMode] = useState<DraftMode>("pvai");
  const [aiSide, setAiSide] = useState<Side>("red");
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("normal");
  const [timerEnabled, setTimerEnabled] = useState(true);

  // Re-seed between rounds — Phase 4. Single-elim only; meaningful when
  // upsets reshape the survivor pool.
  const [reseedBetweenRounds, setReseedBetweenRounds] = useState(false);
  // True grand-final convention — Phase 5. Double-elim only; when on,
  // the grand final is a single decisive series with no bracket reset.
  const [trueGrandFinal, setTrueGrandFinal] = useState(false);

  const teamCountOptions =
    tournamentFormat === "single-elim"
      ? ELIM_COUNTS
      : tournamentFormat === "round-robin"
      ? RR_COUNTS
      : tournamentFormat === "double-elim"
      ? DOUBLE_ELIM_COUNTS
      : tournamentFormat === "swiss" ||
        tournamentFormat === "swiss-playoffs"
      ? SWISS_COUNTS
      : GROUPS_PLAYOFFS_COUNTS;

  // Adjust team list when team count changes — preserve existing entries
  // by index, fill rest with defaults, drop overflow.
  const handleTeamCountChange = (n: TeamCount) => {
    setTeamCount(n);
    setTeams((prev) => {
      const next: TournamentTeam[] = [];
      for (let i = 0; i < n; i++) {
        if (i < prev.length) {
          next.push({ ...prev[i], seed: i + 1 });
        } else {
          next.push({
            id: makeTeamId(),
            name: `Team ${i + 1}`,
            seed: i + 1,
            starRating: 3,
            iconKey: TEAM_ICON_KEYS[i % TEAM_ICON_KEYS.length],
          });
        }
      }
      return next;
    });
  };

  const handleTeamRatingChange = (index: number, rating: number) => {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, starRating: rating } : t)),
    );
  };

  const handleTeamAIDifficultyChange = (
    index: number,
    aiDifficulty: AIDifficulty | undefined,
  ) => {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, aiDifficulty } : t)),
    );
  };

  const handleRandomSeed = () => {
    setTeams((prev) => {
      const shuffled = [...prev]
        .map((t) => ({ ...t }))
        .sort(() => Math.random() - 0.5);
      return shuffled.map((t, i) => ({ ...t, seed: i + 1 }));
    });
  };

  // Randomize team names from a curated pool. Picks without replacement
  // so duplicates only happen when the team count exceeds the pool.
  const handleRandomNames = () => {
    const pool = [...TEAM_NAME_POOL];
    // Fisher-Yates inline shuffle.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setTeams((prev) =>
      prev.map((t, i) => ({
        ...t,
        name: pool[i] ?? `Team ${i + 1}`,
      })),
    );
  };

  // Randomize each team's icon by sampling without replacement from
  // the curated set (when team count exceeds the set, repeats are OK).
  const handleRandomIcons = () => {
    const pool = [...TEAM_ICON_KEYS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setTeams((prev) =>
      prev.map((t, i) => ({ ...t, iconKey: pool[i % pool.length] })),
    );
  };

  const handleTeamIconChange = (index: number, iconKey: string) => {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, iconKey } : t)),
    );
  };

  const handleTeamColorChange = (index: number, color: string) => {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, color } : t)),
    );
  };

  const handleRandomColors = () => {
    const pool = [...TEAM_COLORS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setTeams((prev) =>
      prev.map((t, i) => ({ ...t, color: pool[i % pool.length] })),
    );
  };

  // Randomize team ratings 1..5 with a triangular distribution biased
  // toward 3 (most teams are average; outliers at the extremes).
  const handleRandomRatings = () => {
    const triangular = (): number => {
      // Average two uniforms in [0, 4] → triangular peak at 2 → +1 to
      // shift into [1, 5]. Round to integer.
      const u = (Math.random() * 4 + Math.random() * 4) / 2;
      return Math.max(1, Math.min(5, Math.round(u + 1)));
    };
    setTeams((prev) =>
      prev.map((t) => ({ ...t, starRating: triangular() })),
    );
  };

  const handleTeamNameChange = (index: number, value: string) => {
    setTeams((prev) =>
      prev.map((t, i) => (i === index ? { ...t, name: value } : t)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const defaults: TournamentDefaults = {
      format,
      fearless,
      mode,
      aiSide: mode === "pvai" ? aiSide : null,
      aiDifficulty,
      timerEnabled: mode === "aivai" ? false : timerEnabled,
    };
    // Sort teams by seed before submitting so bracket math is happy.
    const sorted = [...teams].sort((a, b) => a.seed - b.seed);
    startTournament({
      name,
      format: tournamentFormat,
      teams: sorted,
      defaults,
      fearlessConfig: {
        perSeries: fearless,
        perTeam: false,
        global: false,
      },
      reseedBetweenRounds:
        tournamentFormat === "single-elim" ? reseedBetweenRounds : undefined,
      trueGrandFinal:
        tournamentFormat === "double-elim" ? trueGrandFinal : undefined,
    });
  };

  // When format changes, snap team count to the closest valid value for
  // the new format (each format has its own count constraints).
  const handleFormatChange = (f: TournamentFormat) => {
    setTournamentFormat(f);
    const options =
      f === "single-elim"
        ? ELIM_COUNTS
        : f === "round-robin"
        ? RR_COUNTS
        : f === "double-elim"
        ? DOUBLE_ELIM_COUNTS
        : f === "swiss" || f === "swiss-playoffs"
        ? SWISS_COUNTS
        : GROUPS_PLAYOFFS_COUNTS;
    if (!options.includes(teamCount as never)) {
      // Snap to the closest valid count (or 4 if no obvious match).
      const next = options.includes(4 as never) ? 4 : options[0];
      handleTeamCountChange(next);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* ─── Header ────────────────────────────────────────────────── */}
        <div className="text-center mb-6">
          <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
            Tournament Setup
          </div>
          <h1 className="font-display text-3xl md:text-5xl tracking-[0.15em] text-rift-goldbright mt-2">
            <span className="bg-gold-sheen bg-clip-text text-transparent">
              SINGLE
            </span>
            <span className="text-rift-gold/90 ml-2">ELIMINATION</span>
          </h1>
        </div>

        {/* ─── Tournament name ──────────────────────────────────────── */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
            Tournament Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-rift-bg/60 border border-rift-line text-rift-goldbright px-3 py-2 font-display tracking-wider focus:outline-none focus:border-rift-gold/60"
            placeholder="LCK Spring 2026"
            maxLength={40}
          />
        </div>

        {/* ─── Tournament format ────────────────────────────────────── */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
            Tournament Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {TOURNAMENT_FORMATS.map((tf) => {
              const active = tournamentFormat === tf.value;
              return (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => handleFormatChange(tf.value)}
                  className={`px-3 py-2.5 border text-left transition-all ${
                    active
                      ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                  }`}
                >
                  <div className="font-display text-sm tracking-wider">
                    {tf.label}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mt-0.5">
                    {tf.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Team count ───────────────────────────────────────────── */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
            Number of Teams
          </label>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${teamCountOptions.length}, minmax(0, 1fr))`,
            }}
          >
            {teamCountOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleTeamCountChange(n)}
                className={`py-3 border font-display text-xl tracking-widest transition-all ${
                  teamCount === n
                    ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright hover:bg-rift-gold/5"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/50 mt-1">
            {tournamentFormat === "single-elim"
              ? elimSummary(teamCount)
              : tournamentFormat === "double-elim"
              ? doubleElimSummary(teamCount)
              : tournamentFormat === "swiss"
              ? `${Math.ceil(Math.log2(teamCount))} rounds · ${(Math.ceil(Math.log2(teamCount)) * teamCount) / 2} matches · pairings update each round`
              : tournamentFormat === "swiss-playoffs"
              ? `${Math.ceil(Math.log2(teamCount))} swiss rounds · top ${Math.min(8, Math.max(4, Math.floor(teamCount / 2)))} → single-elim`
              : tournamentFormat === "groups-playoffs"
              ? `${(teamCount * (teamCount - 1)) / 2} group matches · top 4 → single-elim playoffs`
              : `${teamCount % 2 === 0 ? teamCount - 1 : teamCount} matchday${teamCount > 3 ? "s" : ""} · ${(teamCount * (teamCount - 1)) / 2} match${teamCount > 2 ? "es" : ""}`}
          </div>
        </div>

        {/* ─── Team list ────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-y-1">
            <label className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Teams (seeded 1-{teamCount})
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRandomNames}
                title="Generate names from a curated pool"
                className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all"
              >
                ⚲ Names
              </button>
              <button
                type="button"
                onClick={handleRandomIcons}
                title="Pick a random team icon for each team"
                className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all"
              >
                ⬢ Icons
              </button>
              <button
                type="button"
                onClick={handleRandomColors}
                title="Pick a random color per team from the 64-color palette"
                className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all"
              >
                ◉ Colors
              </button>
              <button
                type="button"
                onClick={handleRandomRatings}
                title="Random 1-5 star rating per team (biased toward 3)"
                className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all"
              >
                ★ Ratings
              </button>
              <button
                type="button"
                onClick={handleRandomSeed}
                title="Shuffle seed order"
                className="text-[10px] uppercase tracking-[0.25em] px-2 py-1 border border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-all"
              >
                # Seed
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {teams.map((team, i) => (
              <div
                key={team.id}
                className="border border-rift-line/60 bg-rift-bg/50 px-2 py-1.5"
              >
                {/* Row 1: seed + icon picker + color picker + name */}
                <div className="flex items-center gap-2">
                  <span className="text-rift-goldbright font-display text-sm tabular-nums w-5 text-center shrink-0">
                    {i + 1}
                  </span>
                  <TeamIconPicker
                    value={team.iconKey ?? "shield"}
                    onChange={(k) => handleTeamIconChange(i, k)}
                  />
                  <TeamColorPicker
                    value={team.color ?? null}
                    onChange={(c) => handleTeamColorChange(i, c)}
                  />
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) => handleTeamNameChange(i, e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-rift-mutedbright text-sm focus:outline-none focus:text-rift-goldbright"
                    maxLength={24}
                  />
                </div>
                {/* Row 2: rating stars + AI difficulty select. Separate
                    line so the select has room to breathe and never
                    overflows the team box. */}
                <div className="flex items-center justify-between gap-2 mt-1 pl-8">
                  <StarPicker
                    value={team.starRating ?? 3}
                    onChange={(r) => handleTeamRatingChange(i, r)}
                  />
                  <AIDifficultyChip
                    value={team.aiDifficulty}
                    fallback={aiDifficulty}
                    onChange={(d) => handleTeamAIDifficultyChange(i, d)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mt-1.5">
            Star rating sets each team&rsquo;s baseline strength — biases match
            sims toward the higher-rated roster (3★ = neutral). Difficulty
            chip lets you override the tournament default for that team.
          </div>
        </div>

        {/* ─── Match defaults ───────────────────────────────────────── */}
        <div className="mb-5 border border-rift-line/40 bg-rift-bg/30 p-3 md:p-4">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-3">
            Default Match Settings
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <PillRow
              label="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
            />
            <PillRow
              label="Mode"
              value={mode}
              options={MODES}
              onChange={setMode}
            />
          </div>
          {mode === "pvai" && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAiSide("red")}
                className={`py-2 border text-[10px] uppercase tracking-[0.3em] transition-all ${
                  aiSide === "red"
                    ? "border-rift-blue bg-rift-blue/10 text-rift-bluebright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-blue/60"
                }`}
                title="You play Blue, AI plays Red"
              >
                You: Blue
              </button>
              <button
                type="button"
                onClick={() => setAiSide("blue")}
                className={`py-2 border text-[10px] uppercase tracking-[0.3em] transition-all ${
                  aiSide === "blue"
                    ? "border-rift-red bg-rift-red/10 text-rift-redbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-red/60"
                }`}
                title="You play Red, AI plays Blue"
              >
                You: Red
              </button>
            </div>
          )}
          {(mode === "pvai" || mode === "aivai") && (
            <div className="mb-3">
              <PillRow
                label="AI Difficulty"
                value={aiDifficulty}
                options={DIFFICULTIES}
                onChange={setAiDifficulty}
              />
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fearless}
                onChange={(e) => setFearless(e.target.checked)}
                disabled={format === "bo1"}
                className="accent-rift-gold"
              />
              Fearless (within series)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={timerEnabled}
                disabled={mode === "aivai"}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="accent-rift-gold"
              />
              30s timer
            </label>
          </div>

          {/* Cross-match fearless toggles were removed — per-series
              fearless above is sufficient for the supported flows.
              Format-specific toggles still live in this section. */}
          <div className="mt-3 pt-3 border-t border-rift-line/30 space-y-1.5">
            {tournamentFormat === "single-elim" && (
              <label className="flex items-start gap-2 cursor-pointer text-[10px] uppercase tracking-[0.2em] text-rift-mutedbright pt-2 border-t border-rift-line/30 mt-2">
                <input
                  type="checkbox"
                  checked={reseedBetweenRounds}
                  onChange={(e) => setReseedBetweenRounds(e.target.checked)}
                  className="accent-rift-gold mt-0.5"
                />
                <span>
                  <span>Re-seed between rounds</span>
                  <span className="block text-[9px] tracking-[0.15em] text-rift-mutedbright/55 normal-case mt-0.5">
                    After each round, re-pair the next round so highest seed
                    plays lowest. Cosmetic when chalk holds; meaningful on upsets.
                  </span>
                </span>
              </label>
            )}
            {tournamentFormat === "double-elim" && (
              <label className="flex items-start gap-2 cursor-pointer text-[10px] uppercase tracking-[0.2em] text-rift-mutedbright pt-2 border-t border-rift-line/30 mt-2">
                <input
                  type="checkbox"
                  checked={trueGrandFinal}
                  onChange={(e) => setTrueGrandFinal(e.target.checked)}
                  className="accent-rift-gold mt-0.5"
                />
                <span>
                  <span>True grand final</span>
                  <span className="block text-[9px] tracking-[0.15em] text-rift-mutedbright/55 normal-case mt-0.5">
                    Single decisive grand final — no bracket reset. Both finalists
                    play one series; winner takes the title regardless of bracket.
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        {/* ─── Meta tier controls ──────────────────────────────────── */}
        {/* Same access as single-series setup — users can review tier
            list, synergies, randomize, edit, or toggle the meta system
            before starting the tournament. The meta state persists, so
            once configured here it carries through every match. */}
        <div className="mb-5 border border-rift-line/40 bg-rift-bg/30 p-3 md:p-4">
          <MetaPanel variant="full" />
        </div>

        {/* ─── Actions ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="py-3 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
          >
            Cancel
          </button>
          <button type="submit" className="btn-gold py-3 font-display text-base tracking-[0.25em]">
            Generate Bracket
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

// Summary string for a single-elim with N teams. Computes round count
// and total match count accounting for byes (when N isn't a power of 2,
// some R1 pairs are pre-resolved as bye auto-advances and don't count).
function elimSummary(n: number): string {
  if (n < 2) return "";
  const padded = nextPow2(n);
  const totalRounds = Math.log2(padded);
  // Number of byes = padded - n. Each bye removes one R1 match slot.
  const byes = padded - n;
  const r1Matches = padded / 2 - byes;
  const laterMatches = padded - 1 - (padded / 2);
  // Wait — in a power-of-2 bracket of size P, total matches = P-1.
  // With byes, each bye removes exactly one R1 match (the would-be one
  // featuring it). So: total played matches = (P-1) - byes.
  const totalMatches = padded - 1 - byes;
  const byeNote = byes > 0 ? ` · ${byes} bye${byes > 1 ? "s" : ""}` : "";
  return `${totalRounds} round${totalRounds > 1 ? "s" : ""} · ${totalMatches} match${totalMatches > 1 ? "es" : ""}${byeNote}`;
}
function nextPow2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Pre-reset match counts for double-elim: W = N-1 matches, L = N-2,
// plus 1 grand final. Total = 2N - 2. (Reset adds 1 if it triggers.)
//   4 teams = 6 matches · 5 rounds
//   8 teams = 14 matches · 8 rounds
//   16 teams = 30 matches · 11 rounds
function doubleElimSummary(n: number): string {
  if (n === 4) return "5 rounds · 6 matches · winners + losers + grand final";
  if (n === 8) return "8 rounds · 14 matches · winners + losers + grand final";
  if (n === 16) return "11 rounds · 30 matches · winners + losers + grand final";
  if (n === 32) return "14 rounds · 62 matches · winners + losers + grand final";
  return `${n} teams`;
}

function defaultTeams(n: number): TournamentTeam[] {
  return Array.from({ length: n }, (_, i) => ({
    id: makeTeamId(),
    name: `Team ${i + 1}`,
    seed: i + 1,
    starRating: 3,
    iconKey: TEAM_ICON_KEYS[i % TEAM_ICON_KEYS.length],
  }));
}

interface PillOption<T> {
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
  options: readonly PillOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
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
              className={`py-2 border text-[10px] uppercase tracking-[0.25em] transition-all ${
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

// Compact 5-star rating picker. Click a star to set 1-5; click the
// currently selected star to lower by one (so 1→0 isn't allowed —
// minimum is 1). Filled = ★, empty = ☆.
// Compact icon picker. Shows the current icon as a button; clicking
// opens a popover grid of all curated icons. Keeps the team row tidy
// while still letting the user customize at the click of one button.
function TeamIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Choose team icon"
        className="w-7 h-7 flex items-center justify-center border border-rift-line/60 hover:border-rift-gold/50 hover:bg-rift-gold/10 text-rift-goldbright/85 transition-colors"
      >
        <TeamIcon iconKey={value} size={16} />
      </button>
      {open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close icon picker"
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 mt-1 left-0 w-56 bg-rift-panel border border-rift-gold/50 p-1.5 grid grid-cols-5 gap-1 shadow-lg">
            {TEAM_ICON_KEYS.map((k) => {
              const active = k === value;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  title={k}
                  className={`w-9 h-9 flex items-center justify-center border transition-colors ${
                    active
                      ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                      : "border-rift-line/40 text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5"
                  }`}
                >
                  <TeamIcon iconKey={k} size={18} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Compact color picker. Shows the current color as a swatch button;
// clicking opens a popover grid of all 64 curated colors. The same
// closing-overlay pattern as TeamIconPicker keeps the popover modal-
// like without needing a portal.
function TeamColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = value ?? "#52525b"; // muted slate when unset
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={value ? `Color: ${value}` : "Choose team color"}
        className="w-7 h-7 flex items-center justify-center border border-rift-line/60 hover:border-rift-gold/50 transition-colors"
        aria-label="Choose team color"
      >
        <span
          className="block w-4 h-4 border border-rift-bg"
          style={{ backgroundColor: display }}
        />
      </button>
      {open && (
        <>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close color picker"
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 mt-1 left-0 w-64 bg-rift-panel border border-rift-gold/50 p-1.5 grid grid-cols-8 gap-1 shadow-lg">
            {TEAM_COLORS.map((c) => {
              const active = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  title={c}
                  className={`w-6 h-6 border transition-all ${
                    active
                      ? "border-rift-gold ring-1 ring-rift-gold/60"
                      : "border-rift-line/40 hover:border-rift-gold/50"
                  }`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Per-team AI difficulty selector. A native <select> with four options:
// inherit the tournament default, or override with easy / normal / hard.
// Lit gold when an override is active so it's clear at a glance which
// teams diverge from the default.
function AIDifficultyChip({
  value,
  fallback,
  onChange,
}: {
  value: AIDifficulty | undefined;
  fallback: AIDifficulty;
  onChange: (v: AIDifficulty | undefined) => void;
}) {
  const isOverride = value != null && value !== fallback;
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onChange(v === "" ? undefined : (v as AIDifficulty));
  };
  return (
    <select
      value={value ?? ""}
      onChange={handleChange}
      title="AI difficulty for this team"
      className={`shrink-0 text-[9px] uppercase tracking-[0.15em] font-display px-1.5 py-1 border bg-rift-bg/60 cursor-pointer transition-colors ${
        isOverride
          ? "border-rift-gold bg-rift-gold/10 text-rift-goldbright"
          : "border-rift-line text-rift-mutedbright/80 hover:text-rift-goldbright hover:border-rift-gold/50"
      }`}
    >
      <option value="">Default ({fallback.charAt(0).toUpperCase()})</option>
      <option value="easy">Easy</option>
      <option value="normal">Normal</option>
      <option value="hard">Hard</option>
    </select>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0" title={`Rating: ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-base leading-none transition-colors ${
              filled
                ? "text-rift-gold hover:text-rift-goldbright"
                : "text-rift-line hover:text-rift-gold/60"
            }`}
            aria-label={`Set rating to ${n}`}
          >
            {filled ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
