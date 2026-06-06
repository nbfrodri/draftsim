"use client";

import { useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import {
  formatHasPlayoffs,
  inferGroupsConfig,
  makeTeamId,
  playoffBracketKindFor,
  TEAM_COLORS,
  TEAM_ICON_KEYS,
} from "@/lib/tournament";
import type {
  FormatOverrides,
  TournamentFormat,
  TournamentTeam,
  TournamentDefaults,
} from "@/lib/tournament";
import TeamIcon from "./TeamIcon";
import type { AIDifficulty, DraftMode, Roster, SeriesFormat, Side } from "@/lib/types";
import { deriveStar, randomizeRoster } from "@/lib/players";
import MetaPanel from "./MetaPanel";
import RosterEditor from "./RosterEditor";

// Team-count options. Single-elim now accepts any count from 2-8 with
// bye support — top seeds auto-advance when paired with virtual byes.
// Round-robin accepts 3-8 plus 10 (full pro-style group of ten).
// Double-elim restricted to powers of 2 ≥ 4. Swiss requires even N ≥ 4.
// The DE-playoff variants (swiss-playoffs-de / groups-playoffs-de /
// round-robin-playoffs) trim to the largest power-of-2 ≤ advancing
// count at promotion time, so any team count works — but the option
// list nudges users toward counts that produce clean 4 / 8 / 16 DE
// brackets without any wasted teams.
const ELIM_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const;
const RR_COUNTS = [3, 4, 5, 6, 7, 8, 10] as const;
const DOUBLE_ELIM_COUNTS = [4, 8, 16, 32] as const;
const SWISS_COUNTS = [4, 6, 8, 10, 12, 16] as const;
const GROUPS_PLAYOFFS_COUNTS = [4, 6, 8, 12, 16, 24, 32] as const;
// Round-robin-playoffs needs at least 5 teams so the round-robin stage
// has more matches than a 4-team DE bracket; values pick out clean
// "top 4 / top 8" splits.
const RR_PLAYOFFS_COUNTS = [5, 6, 8, 10, 12, 16] as const;
// Swiss + DE playoffs: same Swiss counts, but the DE bracket caps at
// 16 advancing so the larger sizes still make sense.
const SWISS_DE_COUNTS = [8, 10, 12, 16] as const;
// Groups + DE playoffs: skip 4 (which would degenerate to a single
// 4-team DE bracket with no group context). 8+ gives at least two
// groups feeding the bracket.
const GROUPS_DE_COUNTS = [8, 12, 16, 24, 32] as const;
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
  {
    value: "round-robin-playoffs",
    label: "Round Robin + DE Playoffs",
    sub: "Round-robin stage, then top N play double-elim",
  },
  {
    value: "swiss-playoffs-de",
    label: "Swiss + DE Playoffs",
    sub: "Swiss stage, then top N play double-elim",
  },
  {
    value: "groups-playoffs-de",
    label: "Groups + DE Playoffs",
    sub: "Round-robin groups, then top N play double-elim",
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
  const champions = useDraftStore((s) => s.champions);

  // ─── Form state ────────────────────────────────────────────────────
  const [name, setName] = useState("Untitled Tournament");
  const [tournamentFormat, setTournamentFormat] =
    useState<TournamentFormat>("single-elim");
  const [teamCount, setTeamCount] = useState<TeamCount>(4);
  const [teams, setTeams] = useState<TournamentTeam[]>(() =>
    defaultTeams(4),
  );
  // Index of the team whose roster is open in the editor, or null.
  const [playerEditorTeam, setPlayerEditorTeam] = useState<number | null>(null);

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

  // Advanced customization. Each entry overrides one match's series
  // format (Bo1/Bo3/Bo5) keyed per FormatOverrides schema in
  // lib/tournament.ts. Empty map means every match inherits the
  // tournament default. Reset whenever format/teamCount/groups config
  // changes since the round count shifts and stale keys would just
  // dangle.
  const [formatOverrides, setFormatOverrides] = useState<FormatOverrides>({});
  // Override of auto-derived advancing count for *-playoffs. Undefined
  // means "use the default heuristic." Snap to power-of-2 for DE
  // variants happens at submit time / inside createTournament.
  const [advancingOverride, setAdvancingOverride] = useState<
    number | undefined
  >(undefined);
  // Override of auto-derived groups config. Undefined → inferGroupsConfig
  // chooses based on team count. Only meaningful for groups-playoffs /
  // groups-playoffs-de.
  const [groupsConfigOverride, setGroupsConfigOverride] = useState<
    { groupCount: number; advancingPerGroup: number } | undefined
  >(undefined);
  // Override of Swiss total round count (default ceil(log2 N)).
  const [swissRoundsOverride, setSwissRoundsOverride] = useState<
    number | undefined
  >(undefined);
  // Show/hide the advanced settings panel. Closed by default to keep
  // the setup form approachable for casual users; power users can
  // expand to fine-tune every round.
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      : tournamentFormat === "swiss-playoffs-de"
      ? SWISS_DE_COUNTS
      : tournamentFormat === "round-robin-playoffs"
      ? RR_PLAYOFFS_COUNTS
      : tournamentFormat === "groups-playoffs-de"
      ? GROUPS_DE_COUNTS
      : GROUPS_PLAYOFFS_COUNTS;

  // Adjust team list when team count changes — preserve existing entries
  // by index, fill rest with defaults, drop overflow.
  const handleTeamCountChange = (n: TeamCount) => {
    setTeamCount(n);
    // Round counts depend on team count, so any per-round overrides
    // anchored to the previous count would point at rounds that no
    // longer exist. Cheaper to just reset and let the user re-pick.
    setFormatOverrides({});
    setAdvancingOverride(undefined);
    setGroupsConfigOverride(undefined);
    setSwissRoundsOverride(undefined);
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

  // Changing the star clears any hand-edited roster — the star is now the
  // target and a matching roster is generated at submit (or via the Players
  // editor). Keeps star and roster from drifting apart.
  const handleTeamRatingChange = (index: number, rating: number) => {
    setTeams((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, starRating: rating, players: undefined } : t,
      ),
    );
  };

  // Saving a hand-edited roster makes it authoritative; keep starRating in
  // sync with the derived value so the star display stays correct.
  const handleTeamPlayersChange = (index: number, roster: Roster) => {
    setTeams((prev) =>
      prev.map((t, i) =>
        i === index
          ? { ...t, players: roster, starRating: deriveStar(roster) }
          : t,
      ),
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
      // Strip empty / no-op overrides so the persisted tournament
      // doesn't carry dead state. Empty map → undefined.
      formatOverrides:
        Object.keys(formatOverrides).length > 0
          ? formatOverrides
          : undefined,
      // Advancing-count override only meaningful for the relevant
      // *-playoffs formats — gate per format.
      swissPlayoffsAdvancingOverride:
        (tournamentFormat === "swiss-playoffs" ||
          tournamentFormat === "swiss-playoffs-de") &&
        advancingOverride != null
          ? advancingOverride
          : undefined,
      rrPlayoffsAdvancingOverride:
        tournamentFormat === "round-robin-playoffs" &&
        advancingOverride != null
          ? advancingOverride
          : undefined,
      groupsConfigOverride:
        (tournamentFormat === "groups-playoffs" ||
          tournamentFormat === "groups-playoffs-de") &&
        groupsConfigOverride
          ? groupsConfigOverride
          : undefined,
      swissTotalRoundsOverride:
        (tournamentFormat === "swiss" ||
          tournamentFormat === "swiss-playoffs" ||
          tournamentFormat === "swiss-playoffs-de") &&
        swissRoundsOverride != null
          ? swissRoundsOverride
          : undefined,
    });
  };

  // When format changes, snap team count to the closest valid value for
  // the new format (each format has its own count constraints).
  const handleFormatChange = (f: TournamentFormat) => {
    setTournamentFormat(f);
    // Per-round / per-bracket overrides reference round-count + format-
    // shape — a single-elim "wb:3" is meaningless under round-robin.
    // Reset everything advanced so the user starts clean.
    setFormatOverrides({});
    setAdvancingOverride(undefined);
    setGroupsConfigOverride(undefined);
    setSwissRoundsOverride(undefined);
    const options =
      f === "single-elim"
        ? ELIM_COUNTS
        : f === "round-robin"
        ? RR_COUNTS
        : f === "double-elim"
        ? DOUBLE_ELIM_COUNTS
        : f === "swiss" || f === "swiss-playoffs"
        ? SWISS_COUNTS
        : f === "swiss-playoffs-de"
        ? SWISS_DE_COUNTS
        : f === "round-robin-playoffs"
        ? RR_PLAYOFFS_COUNTS
        : f === "groups-playoffs-de"
        ? GROUPS_DE_COUNTS
        : GROUPS_PLAYOFFS_COUNTS;
    if (!options.includes(teamCount as never)) {
      // Snap to the closest valid count (or 4 / 8 if no obvious match).
      const next = options.includes(8 as never)
        ? 8
        : options.includes(4 as never)
          ? 4
          : options[0];
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
              : tournamentFormat === "swiss-playoffs-de"
              ? `${Math.ceil(Math.log2(teamCount))} swiss rounds · top ${dePlayoffAdvancingFor(teamCount)} → double-elim`
              : tournamentFormat === "round-robin-playoffs"
              ? `${(teamCount * (teamCount - 1)) / 2} round-robin matches · top ${dePlayoffAdvancingFor(teamCount)} → double-elim`
              : tournamentFormat === "groups-playoffs-de"
              ? `${(teamCount * (teamCount - 1)) / 2} group matches · top ${dePlayoffAdvancingFor(teamCount)} → double-elim playoffs`
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Seed a roster matching the team's star on first open
                        // so the editor never starts blank for a rated team.
                        if (!team.players) {
                          handleTeamPlayersChange(
                            i,
                            randomizeRoster({
                              champions,
                              star: team.starRating ?? 3,
                            }),
                          );
                        }
                        setPlayerEditorTeam(i);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 border text-[9px] uppercase tracking-[0.2em] transition-all ${
                        team.players
                          ? "border-rift-gold/60 text-rift-goldbright bg-rift-gold/10"
                          : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50"
                      }`}
                      title="Edit player tiers and champion pools"
                    >
                      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                        <circle cx="8" cy="5" r="2.5" />
                        <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" strokeLinecap="round" />
                      </svg>
                      Players{team.players ? " ✓" : ""}
                    </button>
                    <AIDifficultyChip
                      value={team.aiDifficulty}
                      fallback={aiDifficulty}
                      onChange={(d) => handleTeamAIDifficultyChange(i, d)}
                    />
                  </div>
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

        {/* ─── Advanced settings ───────────────────────────────────── */}
        <AdvancedSettingsPanel
          format={tournamentFormat}
          teamCount={teamCount}
          defaultFormat={format}
          formatOverrides={formatOverrides}
          setFormatOverrides={setFormatOverrides}
          advancingOverride={advancingOverride}
          setAdvancingOverride={setAdvancingOverride}
          groupsConfigOverride={groupsConfigOverride}
          setGroupsConfigOverride={setGroupsConfigOverride}
          swissRoundsOverride={swissRoundsOverride}
          setSwissRoundsOverride={setSwissRoundsOverride}
          open={advancedOpen}
          setOpen={setAdvancedOpen}
        />

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
          <RosterEditor
            open={playerEditorTeam != null}
            champions={champions}
            roster={
              playerEditorTeam != null
                ? teams[playerEditorTeam]?.players ?? null
                : null
            }
            teamLabel={
              playerEditorTeam != null
                ? teams[playerEditorTeam]?.name
                : undefined
            }
            onSave={(r) => {
              if (playerEditorTeam != null)
                handleTeamPlayersChange(playerEditorTeam, r);
            }}
            onClose={() => setPlayerEditorTeam(null)}
          />

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

// How many top-N teams a *-playoffs-de or round-robin-playoffs tournament
// promotes into its DE playoff bracket given a team count. Mirrors the
// snap-to-power-of-2 logic in lib/tournament.ts so the setup summary
// matches what the user will actually get. Caps at 16 because a 32-team
// DE bracket is impractically large for a stage-based tournament.
function dePlayoffAdvancingFor(teamCount: number): number {
  const half = Math.floor(teamCount / 2);
  const target = Math.min(16, Math.max(4, half));
  if (target >= 16) return 16;
  if (target >= 8) return 8;
  return 4;
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

// ─── Advanced settings panel ──────────────────────────────────────────
//
// Per-format customization. Renders three sub-sections when relevant:
//   1. Series Format per Round — Bo1/Bo3/Bo5 picker per bracket round
//      and a single picker for main-stage matchdays. Power users can
//      mirror real-world conventions like "regular season Bo1, semis
//      Bo5, final Bo5" without touching every match individually after
//      the tournament starts.
//   2. Tournament Structure — playoff advancing count, groups config,
//      Swiss round count. Lets the user override the auto-derived
//      defaults (e.g. "8 teams advance from 16-team Swiss instead of 4").
// Collapsed by default to keep the entry-level setup form short.

interface RoundOverrideRow {
  key: string;
  label: string;
  // Section header. Adjacent rows with the same section are visually
  // grouped under one header.
  section: string;
}

// Compute the list of override-able rounds for the current format +
// team count + downstream config (advancing count / groups). Each
// returned row drives one Bo1/Bo3/Bo5 picker in the panel.
function computeRoundOverrideRows(
  format: TournamentFormat,
  teamCount: number,
  effectiveAdvancing: number,
  effectiveGroupsConfig: { groupCount: number; advancingPerGroup: number },
): RoundOverrideRow[] {
  const rows: RoundOverrideRow[] = [];

  // Standalone bracket formats — every round of the bracket is its own
  // override row. Single-elim and DE-W rounds use the same key shape
  // ("wb:N") since they're identically structured at the data layer.
  if (format === "single-elim") {
    const k = Math.ceil(Math.log2(Math.max(2, teamCount)));
    for (let r = 1; r <= k; r++) {
      rows.push({
        key: `wb:${r}`,
        label: bracketRoundLabel(r, k, "se"),
        section: "Bracket",
      });
    }
  }
  if (format === "double-elim") {
    const k = Math.log2(teamCount);
    for (let r = 1; r <= k; r++) {
      rows.push({
        key: `wb:${r}`,
        label: bracketRoundLabel(r, k, "de-w"),
        section: "Winners Bracket",
      });
    }
    const lRounds = 2 * (k - 1);
    for (let r = 1; r <= lRounds; r++) {
      rows.push({
        key: `lb:${r}`,
        label: bracketRoundLabel(r, lRounds, "de-l"),
        section: "Losers Bracket",
      });
    }
    rows.push({
      key: "gf",
      label: "Grand Final",
      section: "Grand Final",
    });
  }

  // Stage formats — single "main stage" picker covers every matchday.
  // Per-matchday flexibility is supported by the data model but not
  // exposed in the UI to avoid clutter (typical pro tournaments use
  // one Bo for the whole regular season anyway).
  if (format === "round-robin" || format === "round-robin-playoffs") {
    rows.push({
      key: "main",
      label: "All Matchdays",
      section: "Main Stage",
    });
  }
  if (
    format === "swiss" ||
    format === "swiss-playoffs" ||
    format === "swiss-playoffs-de"
  ) {
    rows.push({
      key: "main",
      label: "All Swiss Rounds",
      section: "Swiss Stage",
    });
  }
  if (format === "groups-playoffs" || format === "groups-playoffs-de") {
    rows.push({
      key: "main",
      label: "All Group Matchdays",
      section: "Group Stage",
    });
  }

  // Playoff bracket rounds — only for *-playoffs formats. The DE
  // variants have W/L/GF; SE variants just have W rounds (we still
  // use the "wb:" key shape internally, prefixed with "po:").
  if (formatHasPlayoffs(format)) {
    const kind = playoffBracketKindFor(format);
    if (kind === "single-elim") {
      const k = Math.ceil(Math.log2(Math.max(2, effectiveAdvancing)));
      for (let r = 1; r <= k; r++) {
        rows.push({
          key: `po:wb:${r}`,
          label: bracketRoundLabel(r, k, "po-se"),
          section: "Playoff Bracket",
        });
      }
    } else {
      const k = Math.log2(effectiveAdvancing);
      if (Number.isFinite(k) && k >= 2) {
        for (let r = 1; r <= k; r++) {
          rows.push({
            key: `po:wb:${r}`,
            label: bracketRoundLabel(r, k, "po-de-w"),
            section: "Playoff Winners",
          });
        }
        const lRounds = 2 * (k - 1);
        for (let r = 1; r <= lRounds; r++) {
          rows.push({
            key: `po:lb:${r}`,
            label: bracketRoundLabel(r, lRounds, "po-de-l"),
            section: "Playoff Losers",
          });
        }
        rows.push({
          key: "po:gf",
          label: "Playoff Grand Final",
          section: "Playoff Grand Final",
        });
      }
    }
  }

  // Suppress effective-config warnings for unused params in formats
  // that don't consume them (e.g. round-robin doesn't care about
  // groups). The lint rule is calmed by the call-site usage.
  void effectiveGroupsConfig;
  return rows;
}

// Pretty round name based on its position in a bracket.
function bracketRoundLabel(
  round: number,
  totalRounds: number,
  ctx: "se" | "de-w" | "de-l" | "po-se" | "po-de-w" | "po-de-l",
): string {
  const isFinal = round === totalRounds;
  const isSemi = round === totalRounds - 1;
  const isQuarter = round === totalRounds - 2;
  if (ctx === "se") {
    if (isFinal) return "Final";
    if (isSemi) return "Semifinal";
    if (isQuarter) return "Quarterfinal";
    return `Round ${round}`;
  }
  if (ctx === "de-w") {
    if (isFinal) return "W-Final";
    if (isSemi) return "W-Semi";
    return `W-R${round}`;
  }
  if (ctx === "de-l") {
    if (isFinal) return "L-Final";
    if (isSemi) return "L-Semi";
    return `L-R${round}`;
  }
  if (ctx === "po-se") {
    if (isFinal) return "Playoff Final";
    if (isSemi) return "Playoff Semifinal";
    if (isQuarter) return "Playoff Quarterfinal";
    return `Playoff R${round}`;
  }
  if (ctx === "po-de-w") {
    if (isFinal) return "Playoff W-Final";
    if (isSemi) return "Playoff W-Semi";
    return `Playoff W-R${round}`;
  }
  // po-de-l
  if (isFinal) return "Playoff L-Final";
  if (isSemi) return "Playoff L-Semi";
  return `Playoff L-R${round}`;
}

// Divisors of N that produce ≥ 2 teams per group AND ≥ 2 groups (or
// just 1 group, the trivial single-group case). Used to populate the
// group-count picker so every option produces a valid group stage.
function validGroupCounts(teamCount: number): number[] {
  const out: number[] = [];
  for (let g = 1; g <= teamCount; g++) {
    if (teamCount % g !== 0) continue;
    const groupSize = teamCount / g;
    if (groupSize < 2) continue;
    out.push(g);
  }
  return out;
}

function AdvancedSettingsPanel({
  format,
  teamCount,
  defaultFormat,
  formatOverrides,
  setFormatOverrides,
  advancingOverride,
  setAdvancingOverride,
  groupsConfigOverride,
  setGroupsConfigOverride,
  swissRoundsOverride,
  setSwissRoundsOverride,
  open,
  setOpen,
}: {
  format: TournamentFormat;
  teamCount: number;
  defaultFormat: SeriesFormat;
  formatOverrides: FormatOverrides;
  setFormatOverrides: React.Dispatch<React.SetStateAction<FormatOverrides>>;
  advancingOverride: number | undefined;
  setAdvancingOverride: (n: number | undefined) => void;
  groupsConfigOverride:
    | { groupCount: number; advancingPerGroup: number }
    | undefined;
  setGroupsConfigOverride: (
    cfg: { groupCount: number; advancingPerGroup: number } | undefined,
  ) => void;
  swissRoundsOverride: number | undefined;
  setSwissRoundsOverride: (n: number | undefined) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  // Effective config — what the tournament will actually use given
  // current overrides + defaults. Drives both the round-list shape
  // (DE-bracket round count depends on advancing count) and the row
  // labels.
  const effectiveAdvancing = useMemo(() => {
    if (advancingOverride != null) {
      const kind = playoffBracketKindFor(format);
      if (kind === "double-elim") {
        // Snap to nearest power-of-2 ≥ 4 ≤ 16 to stay within the
        // generator's preconditions. Same rule applies at submit time.
        const v = Math.min(16, Math.max(4, advancingOverride));
        if (v >= 16) return 16;
        if (v >= 8) return 8;
        return 4;
      }
      return Math.max(2, Math.min(teamCount, advancingOverride));
    }
    if (
      format === "swiss-playoffs" ||
      format === "swiss-playoffs-de" ||
      format === "round-robin-playoffs"
    ) {
      return dePlayoffAdvancingFor(teamCount);
    }
    if (format === "groups-playoffs" || format === "groups-playoffs-de") {
      const cfg = groupsConfigOverride ?? inferGroupsConfig(teamCount);
      return cfg.groupCount * cfg.advancingPerGroup;
    }
    return 0;
  }, [advancingOverride, format, teamCount, groupsConfigOverride]);

  const effectiveGroupsConfig = useMemo(
    () => groupsConfigOverride ?? inferGroupsConfig(teamCount),
    [groupsConfigOverride, teamCount],
  );

  const rows = useMemo(
    () =>
      computeRoundOverrideRows(
        format,
        teamCount,
        effectiveAdvancing,
        effectiveGroupsConfig,
      ),
    [format, teamCount, effectiveAdvancing, effectiveGroupsConfig],
  );

  const sections = useMemo(() => {
    // Group rows by section, preserving order.
    const order: string[] = [];
    const map = new Map<string, RoundOverrideRow[]>();
    for (const r of rows) {
      if (!map.has(r.section)) {
        map.set(r.section, []);
        order.push(r.section);
      }
      map.get(r.section)!.push(r);
    }
    return order.map((s) => ({ section: s, items: map.get(s)! }));
  }, [rows]);

  // Whether to show the "Tournament Structure" section. Hidden for
  // formats with no playoff bracket / groups / Swiss config knobs.
  const showStructureControls =
    formatHasPlayoffs(format) ||
    format === "swiss" ||
    format === "groups-playoffs" ||
    format === "groups-playoffs-de";

  const setRound = (key: string, fmt: SeriesFormat | "default") => {
    setFormatOverrides((prev) => {
      const next = { ...prev };
      // Special handling for the "main" key: writing it sets all
      // matchdays uniformly. We use a single `main` key (not per-
      // round) since the UI offers one picker for the whole stage.
      // The runtime falls back appropriately.
      if (fmt === "default") {
        delete next[key];
      } else {
        next[key] = fmt;
      }
      return next;
    });
  };

  const resetAll = () => {
    setFormatOverrides({});
    setAdvancingOverride(undefined);
    setGroupsConfigOverride(undefined);
    setSwissRoundsOverride(undefined);
  };

  const overrideCount =
    Object.keys(formatOverrides).length +
    (advancingOverride != null ? 1 : 0) +
    (groupsConfigOverride ? 1 : 0) +
    (swissRoundsOverride != null ? 1 : 0);

  return (
    <div className="mb-5 border border-rift-line/40 bg-rift-bg/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 md:px-4 py-3 text-left hover:bg-rift-gold/[0.03] transition-colors"
      >
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Advanced Settings
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55 mt-0.5">
            Per-round series format · playoff size · groups config
            {overrideCount > 0 && (
              <span className="ml-2 text-rift-goldbright">
                · {overrideCount} override{overrideCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <span className="text-rift-gold/70 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="px-3 md:px-4 pb-4 space-y-5 border-t border-rift-line/40">
          {/* ─── Tournament Structure ──────────────────────────── */}
          {showStructureControls && (
            <section className="pt-3">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
                  Tournament Structure
                </h3>
                {overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAll}
                    className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright"
                  >
                    Reset all
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {/* Swiss round count */}
                {(format === "swiss" ||
                  format === "swiss-playoffs" ||
                  format === "swiss-playoffs-de") && (
                  <SwissRoundsControl
                    teamCount={teamCount}
                    value={swissRoundsOverride}
                    onChange={setSwissRoundsOverride}
                  />
                )}
                {/* Advancing count for *-playoffs (non-groups) */}
                {(format === "swiss-playoffs" ||
                  format === "swiss-playoffs-de" ||
                  format === "round-robin-playoffs") && (
                  <AdvancingCountControl
                    teamCount={teamCount}
                    kind={playoffBracketKindFor(format)}
                    value={advancingOverride}
                    onChange={setAdvancingOverride}
                    fallback={dePlayoffAdvancingFor(teamCount)}
                  />
                )}
                {/* Groups config (groupCount × advancingPerGroup) */}
                {(format === "groups-playoffs" ||
                  format === "groups-playoffs-de") && (
                  <GroupsConfigControl
                    teamCount={teamCount}
                    value={groupsConfigOverride}
                    onChange={setGroupsConfigOverride}
                    isDE={format === "groups-playoffs-de"}
                  />
                )}
              </div>
            </section>
          )}

          {/* ─── Series Format per Round ──────────────────────── */}
          {rows.length > 0 && (
            <section className={showStructureControls ? "pt-1" : "pt-3"}>
              <h3 className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
                Series Format per Round
              </h3>
              <p className="text-[9px] tracking-[0.15em] text-rift-mutedbright/55 mb-3 leading-relaxed">
                Override Bo1 / Bo3 / Bo5 per round. Set semifinals to Bo5, the
                final to Bo7-style etc. Defaults to the tournament-wide format
                ({defaultFormat.toUpperCase()}) when not overridden.
              </p>
              <div className="space-y-3">
                {sections.map((s) => (
                  <div key={s.section}>
                    <div className="text-[8px] uppercase tracking-[0.35em] text-rift-mutedbright/55 mb-1.5">
                      {s.section}
                    </div>
                    <div className="space-y-1">
                      {s.items.map((row) => (
                        <RoundFormatRow
                          key={row.key}
                          label={row.label}
                          value={formatOverrides[row.key]}
                          defaultFormat={defaultFormat}
                          onChange={(fmt) => setRound(row.key, fmt)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// One row of the per-round format picker. Three buttons (Bo1 / Bo3 /
// Bo5) plus a "Default" button that drops the override and inherits
// the tournament-wide default.
function RoundFormatRow({
  label,
  value,
  defaultFormat,
  onChange,
}: {
  label: string;
  value: SeriesFormat | undefined;
  defaultFormat: SeriesFormat;
  onChange: (fmt: SeriesFormat | "default") => void;
}) {
  const isDefault = value == null;
  const effective = value ?? defaultFormat;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright">
        {label}
      </span>
      <div className="flex gap-1">
        {(["bo1", "bo3", "bo5"] as const).map((f) => {
          const active = !isDefault && effective === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              className={`px-2.5 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                active
                  ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                  : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright"
              }`}
            >
              {f.toUpperCase()}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange("default")}
          title={`Inherit tournament default (${defaultFormat.toUpperCase()})`}
          className={`px-2 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
            isDefault
              ? "border-rift-line/40 bg-rift-line/10 text-rift-mutedbright/70"
              : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60"
          }`}
        >
          Default
        </button>
      </div>
    </div>
  );
}

// Number-of-teams-advancing control. SE-playoffs accept any integer
// 2..teamCount-1; DE-playoffs snap to {4, 8, 16} ≤ teamCount.
function AdvancingCountControl({
  teamCount,
  kind,
  value,
  onChange,
  fallback,
}: {
  teamCount: number;
  kind: "single-elim" | "double-elim";
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  fallback: number;
}) {
  const effective = value ?? fallback;
  if (kind === "double-elim") {
    const options = [4, 8, 16].filter((n) => n <= teamCount);
    return (
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright mb-1">
          Teams in Playoffs
          <span className="ml-2 text-[9px] text-rift-mutedbright/55 normal-case">
            (DE bracket — must be a power of 2)
          </span>
        </div>
        <div className="flex gap-1.5">
          {options.map((n) => {
            const active = effective === n && value != null;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`px-3 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                  active
                    ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright"
                }`}
              >
                {n}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`px-2.5 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
              value == null
                ? "border-rift-line/40 bg-rift-line/10 text-rift-mutedbright/70"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60"
            }`}
          >
            Auto ({fallback})
          </button>
        </div>
      </div>
    );
  }
  // SE-playoffs — any integer in [2, teamCount-1]
  const min = 2;
  const max = Math.max(min + 1, teamCount - 1);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright mb-1">
        Teams in Playoffs
        <span className="ml-2 text-[9px] text-rift-mutedbright/55 normal-case">
          ({min}–{max})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          placeholder={String(fallback)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onChange(undefined);
              return;
            }
            const n = parseInt(v, 10);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-20 bg-rift-bg/60 border border-rift-line text-rift-goldbright px-2 py-1 text-sm font-display tracking-wider focus:outline-none focus:border-rift-gold/60"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`px-2.5 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
            value == null
              ? "border-rift-line/40 bg-rift-line/10 text-rift-mutedbright/70"
              : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60"
          }`}
        >
          Auto ({fallback})
        </button>
      </div>
    </div>
  );
}

// Groups config picker — group count (divisors of teamCount) and
// per-group advancement (1..groupSize-1). Combined output is shown
// inline so the user sees the implied playoff size at a glance.
function GroupsConfigControl({
  teamCount,
  value,
  onChange,
  isDE,
}: {
  teamCount: number;
  value: { groupCount: number; advancingPerGroup: number } | undefined;
  onChange: (
    cfg: { groupCount: number; advancingPerGroup: number } | undefined,
  ) => void;
  isDE: boolean;
}) {
  const inferred = inferGroupsConfig(teamCount);
  const effective = value ?? inferred;
  const validCounts = validGroupCounts(teamCount);
  const groupSize = teamCount / effective.groupCount;
  const maxAdvance = Math.max(1, Math.min(groupSize - 1, groupSize));
  const advancingOptions: number[] = [];
  for (let i = 1; i <= maxAdvance; i++) advancingOptions.push(i);
  const totalAdvance = effective.groupCount * effective.advancingPerGroup;
  const dePlayoffSize = isDE
    ? totalAdvance >= 16
      ? 16
      : totalAdvance >= 8
        ? 8
        : totalAdvance >= 4
          ? 4
          : 0
    : null;

  return (
    <div className="space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright mb-1">
          Number of Groups
        </div>
        <div className="flex flex-wrap gap-1.5">
          {validCounts.map((g) => {
            const active = effective.groupCount === g && value != null;
            return (
              <button
                key={g}
                type="button"
                onClick={() =>
                  onChange({
                    groupCount: g,
                    // Re-clamp advancingPerGroup if the new group size
                    // is smaller than the current setting.
                    advancingPerGroup: Math.min(
                      Math.max(1, teamCount / g - 1),
                      effective.advancingPerGroup,
                    ),
                  })
                }
                className={`px-3 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                  active
                    ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright"
                }`}
              >
                {g} × {teamCount / g}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`px-2.5 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
              value == null
                ? "border-rift-line/40 bg-rift-line/10 text-rift-mutedbright/70"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60"
            }`}
          >
            Auto ({inferred.groupCount}×{teamCount / inferred.groupCount})
          </button>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright mb-1">
          Advance per Group
        </div>
        <div className="flex flex-wrap gap-1.5">
          {advancingOptions.map((a) => {
            const active = effective.advancingPerGroup === a && value != null;
            return (
              <button
                key={a}
                type="button"
                onClick={() =>
                  onChange({
                    groupCount: effective.groupCount,
                    advancingPerGroup: a,
                  })
                }
                className={`px-3 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
                  active
                    ? "border-rift-gold bg-rift-gold/15 text-rift-goldbright"
                    : "border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[9px] tracking-[0.2em] text-rift-mutedbright/55">
        → {totalAdvance} team{totalAdvance === 1 ? "" : "s"} into playoffs
        {isDE && dePlayoffSize != null && dePlayoffSize !== totalAdvance && (
          <span className="text-rift-gold/70">
            {" "}(trims to {dePlayoffSize} for DE bracket)
          </span>
        )}
      </div>
    </div>
  );
}

// Swiss round count override. Default is ceil(log2(N)). Allow 1 to
// teamCount-1 (anything more produces forced rematches under the
// greedy pairing algorithm).
function SwissRoundsControl({
  teamCount,
  value,
  onChange,
}: {
  teamCount: number;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
}) {
  const fallback = Math.ceil(Math.log2(Math.max(2, teamCount)));
  const min = 1;
  const max = Math.max(min + 1, teamCount - 1);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright mb-1">
        Swiss Rounds
        <span className="ml-2 text-[9px] text-rift-mutedbright/55 normal-case">
          ({min}–{max})
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          placeholder={String(fallback)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              onChange(undefined);
              return;
            }
            const n = parseInt(v, 10);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-20 bg-rift-bg/60 border border-rift-line text-rift-goldbright px-2 py-1 text-sm font-display tracking-wider focus:outline-none focus:border-rift-gold/60"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`px-2.5 py-1 border text-[10px] uppercase tracking-[0.25em] transition-all ${
            value == null
              ? "border-rift-line/40 bg-rift-line/10 text-rift-mutedbright/70"
              : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/60"
          }`}
        >
          Auto ({fallback})
        </button>
      </div>
    </div>
  );
}
