"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { deriveStar, randomizeTiersForStar } from "@/lib/players";
import type { AIDifficulty, SeriesFormat } from "@/lib/types";
import type { TournamentFormat } from "@/lib/tournament";
import {
  intlFormatOptionsFor,
  LEAGUE_FORMAT_OPTIONS,
} from "@/lib/season/engine";
import {
  generateSeasonTeams,
  rerollTeamIdentity,
} from "@/lib/season/teamGen";
import {
  BUNDLED_TEAM_NAMES,
  fetchRealTeamNames,
} from "@/lib/season/realTeams";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  LEAGUE_NAMES,
  type InternationalId,
  type LeagueId,
  type SeasonConfig,
  type SeasonIntlConfig,
  type SeasonLeagueConfig,
  type SeasonTeam,
} from "@/lib/season/types";
import MetaPanel from "./MetaPanel";
import TeamIcon from "./TeamIcon";

// Season creation: name, per-league (or shared) split formats, meta
// behavior, and the 60 randomized-but-editable team identities.

interface Props {
  onCancel: () => void;
}

const DEFAULT_LEAGUE_CONFIG: SeasonLeagueConfig = {
  format: "round-robin-playoffs",
  playoffTeams: 4,
  regularSeries: "bo1",
  playoffSeries: "bo5",
  semifinalSeries: "bo5",
  finalsSeries: "bo5",
};

// Canonical international shapes (mirrors defaultIntlConfig in the
// engine) — the starting values for the per-event format cards.
const INTL_IDS: readonly InternationalId[] = ["first-stand", "msi", "worlds"];
const DEFAULT_INTL_CONFIGS: Record<InternationalId, SeasonIntlConfig> = {
  "first-stand": {
    format: "single-elim",
    earlySeries: "bo3",
    semifinalSeries: "bo5",
    finalsSeries: "bo5",
    playoffTeams: 8,
  },
  msi: {
    format: "swiss-playoffs-de",
    earlySeries: "bo3",
    semifinalSeries: "bo5",
    finalsSeries: "bo5",
    playoffTeams: 8,
  },
  worlds: {
    format: "groups-playoffs",
    earlySeries: "bo3",
    semifinalSeries: "bo5",
    finalsSeries: "bo5",
    playoffTeams: 8,
  },
};

const SERIES_OPTIONS: SeriesFormat[] = ["bo1", "bo3", "bo5"];

function formatHasPlayoffStage(format: TournamentFormat): boolean {
  return format !== "round-robin" && format !== "swiss";
}

// Bracket-size pickers apply to every stage+playoffs format. Swiss /
// round-robin take the count directly; groups round it to a per-group
// advancing count (e.g. "Top 8" with 4 groups → top 2 per group).
// Single-elim and plain double-elim have no separate playoff stage —
// the whole field enters one bracket.
function intlFormatHasPlayoffSize(format: TournamentFormat): boolean {
  return format !== "single-elim" && format !== "double-elim";
}

// Shared select styling: dark control with cut corners + gold chevron
// (.select-rift in globals.css replaces the native arrow, so reserve
// right padding) and a dark native dropdown. [color-scheme:dark] makes
// the popup chrome render dark in Chromium/WebView2; the descendant
// `_option` selector (not `>option`) also covers options nested inside
// <optgroup> (the team picker).
const SELECT_CLS =
  "select-rift cursor-pointer bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs pl-2.5 pr-7 py-1.5 outline-none transition-colors hover:border-rift-gold/50 hover:text-rift-goldbright focus:border-rift-gold/70 focus:text-rift-goldbright [color-scheme:dark] [&_option]:bg-rift-panel [&_option]:text-rift-mutedbright [&_optgroup]:bg-rift-panel [&_optgroup]:text-rift-gold/80";

// One labeled BO1/BO3/BO5 dropdown — the format cards render several of
// these per row, so the label + select + disabled plumbing lives here.
function SeriesSelect({
  label,
  value,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: SeriesFormat;
  onChange: (v: SeriesFormat) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? "opacity-40" : ""}`}>
      <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SeriesFormat)}
        className={SELECT_CLS}
        title={title}
      >
        {SERIES_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SeasonSetup({ onCancel }: Props) {
  const champions = useDraftStore((s) => s.champions);
  const startSeason = useDraftStore((s) => s.startSeason);

  const [name, setName] = useState("My Season");
  const [shared, setShared] = useState(true);
  const [leagueConfigs, setLeagueConfigs] = useState<
    Record<LeagueId, SeasonLeagueConfig>
  >(() => {
    const out = {} as Record<LeagueId, SeasonLeagueConfig>;
    for (const l of LEAGUE_IDS) out[l] = { ...DEFAULT_LEAGUE_CONFIG };
    return out;
  });
  const [liveMeta, setLiveMeta] = useState(true);
  const [patchShift, setPatchShift] = useState(true);
  const [fearless, setFearless] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("normal");
  // International formats: per-event by default (each event has its own
  // canonical shape); "shared" applies the First Stand card to all.
  const [sharedIntl, setSharedIntl] = useState(false);
  const [intlConfigs, setIntlConfigs] = useState<
    Record<InternationalId, SeasonIntlConfig>
  >(() => ({
    "first-stand": { ...DEFAULT_INTL_CONFIGS["first-stand"] },
    msi: { ...DEFAULT_INTL_CONFIGS.msi },
    worlds: { ...DEFAULT_INTL_CONFIGS.worlds },
  }));
  const [teams, setTeams] = useState<SeasonTeam[]>([]);
  const [controlledTeamId, setControlledTeamId] = useState<string | null>(
    null,
  );
  const [openLeague, setOpenLeague] = useState<LeagueId | null>(null);
  const [realNames, setRealNames] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  // Generate the initial 60 teams once champions are loaded.
  useEffect(() => {
    if (champions.length === 0 || teams.length > 0) return;
    setTeams(generateSeasonTeams(champions));
  }, [champions, teams.length]);

  const byLeague = useMemo(() => {
    const map = new Map<LeagueId, SeasonTeam[]>();
    for (const l of LEAGUE_IDS) map.set(l, []);
    for (const t of teams) map.get(t.leagueId)?.push(t);
    return map;
  }, [teams]);

  const updateConfig = (
    league: LeagueId,
    patch: Partial<SeasonLeagueConfig>,
  ) => {
    setLeagueConfigs((prev) => ({
      ...prev,
      [league]: { ...prev[league], ...patch },
    }));
  };

  const updateIntlConfig = (
    event: InternationalId,
    patch: Partial<SeasonIntlConfig>,
  ) => {
    setIntlConfigs((prev) => ({
      ...prev,
      [event]: { ...prev[event], ...patch },
    }));
  };

  const rerollOne = (teamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === teamId);
      if (!team) return prev;
      const rerolled = rerollTeamIdentity(team, prev);
      return prev.map((t) => (t.id === teamId ? rerolled : t));
    });
  };

  const rerollLeague = (league: LeagueId) => {
    setTeams((prev) => {
      let next = [...prev];
      for (const t of prev) {
        if (t.leagueId !== league) continue;
        const rerolled = rerollTeamIdentity(
          next.find((x) => x.id === t.id)!,
          next,
        );
        next = next.map((x) => (x.id === t.id ? rerolled : x));
      }
      return next;
    });
  };

  const rerollAll = () => {
    setTeams(generateSeasonTeams(champions));
    setControlledTeamId(null);
    setRealNames("idle");
  };

  // Rename teams league-by-league from a names table. Teams keep their
  // ids, colors, icons, rosters, and personalities; leagues with fewer
  // than 10 names keep generated names for the remainder.
  const applyNamesByLeague = (
    namesByLeague: Partial<Record<LeagueId, string[]>>,
  ) => {
    setTeams((prev) => {
      const used: Partial<Record<LeagueId, number>> = {};
      return prev.map((t) => {
        const idx = used[t.leagueId] ?? 0;
        used[t.leagueId] = idx + 1;
        const name = namesByLeague[t.leagueId]?.[idx];
        return name ? { ...t, name } : t;
      });
    });
  };

  // Instant: the bundled offline snapshot of real pro team names.
  const applyBundledNames = () => {
    applyNamesByLeague(BUNDLED_TEAM_NAMES);
    setRealNames("done");
  };

  // Live: real team names per region from the public LoL Esports API,
  // falling back to the bundled snapshot when the API is unreachable.
  const applyRealNames = async () => {
    setRealNames("loading");
    try {
      applyNamesByLeague(await fetchRealTeamNames(AbortSignal.timeout(20_000)));
      setRealNames("done");
    } catch {
      applyNamesByLeague(BUNDLED_TEAM_NAMES);
      setRealNames("error");
    }
  };

  // Set a team's strength (1-5 stars): regenerate the roster's player
  // tiers to match the target star while keeping each player's champion
  // pools (comfort picks) intact.
  const setTeamStar = (teamId: string, star: number) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const tiers = randomizeTiersForStar(star);
        return {
          ...t,
          players: t.players.map((p, i) => ({ ...p, tier: tiers[i] })),
        };
      }),
    );
  };

  const handleStart = () => {
    if (teams.length === 0) return;
    const config: SeasonConfig = {
      name,
      sharedLeagueConfig: shared,
      leagueConfigs: shared
        ? (Object.fromEntries(
            LEAGUE_IDS.map((l) => [l, { ...leagueConfigs.LCK }]),
          ) as Record<LeagueId, SeasonLeagueConfig>)
        : leagueConfigs,
      // Shared mode: the First Stand card is the master copy for all
      // three events (mirrors the league shared slot).
      intlConfigs: sharedIntl
        ? (Object.fromEntries(
            INTL_IDS.map((e) => [e, { ...intlConfigs["first-stand"] }]),
          ) as Record<InternationalId, SeasonIntlConfig>)
        : intlConfigs,
      liveMeta,
      patchShift,
      fearless,
      timerEnabled,
      aiDifficulty,
      controlledTeamId,
    };
    startSeason(config, teams);
  };

  const renderIntlCard = (event: InternationalId | "shared") => {
    const key: InternationalId = event === "shared" ? "first-stand" : event;
    const cfg = intlConfigs[key];
    const hasPlayoffSize = intlFormatHasPlayoffSize(cfg.format);
    return (
      <div
        key={event}
        className="border border-rift-line/40 bg-rift-bg/30 p-3 flex items-end gap-3 flex-wrap"
      >
        <div className="font-display text-xs tracking-[0.25em] uppercase text-rift-goldbright w-28 flex-shrink-0 pb-1.5">
          {event === "shared" ? "All Events" : INTERNATIONAL_LABELS[event]}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
            Format
          </span>
          <select
            value={cfg.format}
            onChange={(e) =>
              updateIntlConfig(key, {
                format: e.target.value as TournamentFormat,
              })
            }
            className={SELECT_CLS}
            title={
              event === "worlds"
                ? "Applies to the Worlds main event — the play-in stays a small single-elim qualifier"
                : undefined
            }
          >
            {intlFormatOptionsFor(event).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className={`flex flex-col gap-1 ${hasPlayoffSize ? "" : "opacity-40"}`}
        >
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
            Playoff Teams
          </span>
          <select
            value={cfg.playoffTeams}
            disabled={!hasPlayoffSize}
            onChange={(e) =>
              updateIntlConfig(key, { playoffTeams: Number(e.target.value) })
            }
            className={SELECT_CLS}
            title="Bracket size after the regular stage. Groups round it to a per-group count."
          >
            <option value={4}>Top 4</option>
            <option value={6}>Top 6</option>
            <option value={8}>Top 8</option>
            <option value={12}>Top 12</option>
            <option value={16}>Top 16</option>
          </select>
        </label>
        <SeriesSelect
          label="Early Rounds"
          value={cfg.earlySeries}
          onChange={(v) => updateIntlConfig(key, { earlySeries: v })}
          title="Series length for early rounds / the regular stage"
        />
        <SeriesSelect
          label="Semifinals"
          value={cfg.semifinalSeries ?? cfg.finalsSeries}
          onChange={(v) => updateIntlConfig(key, { semifinalSeries: v })}
          title="Series length for the semifinals — the matches feeding the final (in double-elim: winners + losers finals)"
        />
        <SeriesSelect
          label="Finals / Bracket"
          value={cfg.finalsSeries}
          onChange={(v) => updateIntlConfig(key, { finalsSeries: v })}
          title="Series length for the playoff bracket and the final"
        />
        {event === "worlds" && (
          <span className="text-[9px] text-rift-muted/70 pb-1.5">
            Main event only — the play-in stays single-elim
          </span>
        )}
        {event === "shared" && cfg.format === "double-elim" && (
          <span className="text-[9px] text-rift-muted/70 pb-1.5">
            Only First Stand&apos;s 12-team field fits double-elim — MSI and
            Worlds keep their canonical formats
          </span>
        )}
      </div>
    );
  };

  const renderConfigCard = (league: LeagueId | "shared") => {
    const key: LeagueId = league === "shared" ? "LCK" : league;
    const cfg = leagueConfigs[key];
    const hasPlayoffs = formatHasPlayoffStage(cfg.format);
    return (
      <div
        key={league}
        className="border border-rift-line/40 bg-rift-bg/30 p-3 flex items-end gap-3 flex-wrap"
      >
        <div className="font-display text-xs tracking-[0.25em] uppercase text-rift-goldbright w-28 flex-shrink-0 pb-1.5">
          {league === "shared" ? "All Leagues" : league}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
            Split Format
          </span>
          <select
            value={cfg.format}
            onChange={(e) =>
              updateConfig(key, { format: e.target.value as TournamentFormat })
            }
            className={SELECT_CLS}
          >
            {LEAGUE_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex flex-col gap-1 ${hasPlayoffs ? "" : "opacity-40"}`}>
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
            Playoff Teams
          </span>
          <select
            value={cfg.playoffTeams}
            disabled={!hasPlayoffs}
            onChange={(e) =>
              updateConfig(key, { playoffTeams: Number(e.target.value) })
            }
            className={SELECT_CLS}
            title="Top 6: the top 2 seeds get a first-round bye (works for single- and double-elim playoffs)"
          >
            <option value={4}>Top 4</option>
            <option value={6}>Top 6</option>
            <option value={8}>Top 8</option>
          </select>
        </label>
        <SeriesSelect
          label="Regular Series"
          value={cfg.regularSeries}
          onChange={(v) => updateConfig(key, { regularSeries: v })}
        />
        <SeriesSelect
          label="Playoff Series"
          value={cfg.playoffSeries}
          disabled={!hasPlayoffs}
          onChange={(v) => updateConfig(key, { playoffSeries: v })}
          title="Series length for early playoff rounds"
        />
        <SeriesSelect
          label="Semifinals"
          value={cfg.semifinalSeries ?? cfg.playoffSeries}
          disabled={!hasPlayoffs}
          onChange={(v) => updateConfig(key, { semifinalSeries: v })}
          title="Series length for the semifinals — the matches feeding the final (in double-elim: winners + losers finals)"
        />
        <SeriesSelect
          label="Finals"
          value={cfg.finalsSeries ?? cfg.playoffSeries}
          disabled={!hasPlayoffs}
          onChange={(v) => updateConfig(key, { finalsSeries: v })}
          title="Series length for the final / grand final"
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen px-4 py-10 md:py-14">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 mb-6 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          Main Menu
        </button>

        <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
          New Season
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-[0.12em] text-rift-goldbright mb-2">
          Season Mode
        </h1>
        <p className="text-[11px] md:text-xs text-rift-mutedbright leading-snug mb-6 max-w-2xl">
          A full competitive year across LCK, LPL, LEC, LCS, CBLOL and
          LCP: Winter Split → First Stand (top 2 per league) → Spring
          Split → MSI (top 3, plus the First Stand champion) → Summer
          Split → Worlds. Worlds slots reward the whole season: the
          summer finalists qualify directly, the next two by
          championship points across all splits and internationals (the
          #4 seeds fight through a play-in), and the MSI champion enters
          automatically. The meta evolves all season, momentum carries
          across events, and seeding decides international bracket
          draws.
        </p>

        {/* Name */}
        <label className="block mb-5">
          <span className="text-[9px] uppercase tracking-[0.35em] text-rift-muted block mb-1">
            Season Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-sm bg-rift-bg/60 border border-rift-line text-rift-goldbright font-display tracking-wider px-3 py-2 outline-none focus:border-rift-gold/60"
          />
        </label>

        {/* League formats */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            League Formats
          </div>
          <button
            type="button"
            onClick={() => setShared(!shared)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              shared
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {shared ? "Shared: all leagues alike" : "Per-league configs"}
          </button>
        </div>
        <div className="space-y-2 mb-6">
          {shared
            ? renderConfigCard("shared")
            : LEAGUE_IDS.map((l) => renderConfigCard(l))}
        </div>

        {/* International formats */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            International Formats
          </div>
          <button
            type="button"
            onClick={() => setSharedIntl(!sharedIntl)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              sharedIntl
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {sharedIntl ? "Shared: all events alike" : "Per-event configs"}
          </button>
        </div>
        <div className="space-y-2 mb-6">
          {sharedIntl
            ? renderIntlCard("shared")
            : INTL_IDS.map((e) => renderIntlCard(e))}
        </div>

        {/* Season options */}
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Season Options
        </div>
        <div className="flex items-end gap-3 flex-wrap mb-6 border border-rift-line/40 bg-rift-bg/30 p-3">
          <button
            type="button"
            onClick={() => setLiveMeta(!liveMeta)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              liveMeta
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Champion tiers shift slightly as rounds complete inside every event"
          >
            Live Meta {liveMeta ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setPatchShift(!patchShift)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              patchShift
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="A balance patch between each split and international shifts ~12% of tiers"
          >
            Patch Shifts {patchShift ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setFearless(!fearless)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              fearless
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Fearless draft within every series"
          >
            Fearless {fearless ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setTimerEnabled(!timerEnabled)}
            className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              timerEnabled
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright"
            }`}
            title="Pick/ban timer in matches you play yourself"
          >
            Draft Timer {timerEnabled ? "ON" : "OFF"}
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
              AI Difficulty
            </span>
            <select
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
              className={SELECT_CLS}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">
              Follow / Control a Team (optional)
            </span>
            <TeamPicker
              byLeague={byLeague}
              value={controlledTeamId}
              onChange={setControlledTeamId}
            />
          </div>
        </div>

        {/* Starting meta — the season snapshots the active meta at
            creation and evolves it from there. */}
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Starting Meta
        </div>
        <div className="border border-rift-line/40 bg-rift-bg/30 p-3 mb-6">
          <MetaPanel variant="compact" />
        </div>

        {/* Teams */}
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Teams
          </div>
          <button
            type="button"
            onClick={rerollAll}
            className="px-2.5 py-1 border border-rift-line text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            Re-roll Everything
          </button>
          <button
            type="button"
            onClick={applyBundledNames}
            disabled={realNames === "loading" || teams.length === 0}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all disabled:opacity-50 ${
              realNames === "done"
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50"
            }`}
            title="Rename every team to the real pro teams of each region (built-in list, works offline)"
          >
            {realNames === "done" ? "Real Names ✓" : "Real Names"}
          </button>
          <button
            type="button"
            onClick={applyRealNames}
            disabled={realNames === "loading" || teams.length === 0}
            className="px-2.5 py-1 border border-rift-line text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all disabled:opacity-50 disabled:cursor-wait"
            title="Fetch the current real teams of each region live from the LoL Esports API"
          >
            {realNames === "loading" ? "Fetching…" : "Fetch Live"}
          </button>
          {realNames === "error" && (
            <span className="text-[9px] uppercase tracking-[0.2em] text-rift-red">
              Esports API unreachable — applied the built-in names
            </span>
          )}
        </div>
        <div className="space-y-2 mb-8">
          {LEAGUE_IDS.map((league) => {
            const open = openLeague === league;
            const ts = byLeague.get(league) ?? [];
            return (
              <div key={league} className="border border-rift-line/40 bg-rift-bg/30">
                <div className="flex items-center justify-between px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenLeague(open ? null : league)}
                    className="flex-1 text-left font-display text-sm tracking-[0.2em] uppercase text-rift-goldbright"
                  >
                    {open ? "▾" : "▸"} {LEAGUE_NAMES[league]}
                  </button>
                  <button
                    type="button"
                    onClick={() => rerollLeague(league)}
                    className="px-2 py-1 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright transition-colors"
                  >
                    Re-roll Names
                  </button>
                </div>
                {open && (
                  <div className="border-t border-rift-line/30 divide-y divide-rift-line/20">
                    {ts.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span
                          className="w-2.5 h-2.5 flex-shrink-0"
                          style={{ backgroundColor: t.color }}
                          aria-hidden
                        />
                        <TeamIcon iconKey={t.iconKey} size={16} color={t.color} />
                        <input
                          value={t.name}
                          onChange={(e) =>
                            setTeams((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          className="flex-1 min-w-0 bg-transparent text-[12px] text-rift-mutedbright outline-none border-b border-transparent focus:border-rift-gold/40"
                          aria-label="Team name"
                        />
                        <span
                          className="inline-flex items-center flex-shrink-0"
                          title="Team rating — click a star to set roster strength"
                        >
                          {[1, 2, 3, 4, 5].map((n) => {
                            const star = deriveStar(t.players);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setTeamStar(t.id, n)}
                                aria-label={`Set ${t.name} rating to ${n} star${n === 1 ? "" : "s"}`}
                                className={`px-0.5 text-[11px] leading-none transition-colors ${
                                  n <= star
                                    ? "text-rift-gold hover:text-rift-goldbright"
                                    : "text-rift-line hover:text-rift-gold/60"
                                }`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => rerollOne(t.id)}
                          className="px-1.5 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright/50 hover:text-rift-goldbright transition-colors flex-shrink-0"
                          title="Re-roll this team's name, color, and icon"
                        >
                          Re-roll
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="py-3 border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:bg-rift-gold/5 text-[10px] md:text-xs uppercase tracking-[0.3em] transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={teams.length === 0}
            className="btn-gold py-3 font-display text-sm md:text-base tracking-[0.3em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Season
          </button>
        </div>
      </div>
    </div>
  );
}

// Custom team dropdown for Follow/Control. A native <select> popup is
// positioned by the browser and flips upward when the control sits in
// the lower half of the viewport — this one always opens BELOW the
// trigger, and gets team icons/colors as a bonus.
function TeamPicker({
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

  // Close on outside click / Escape.
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
                  <TeamIcon iconKey={t.iconKey} size={13} color={t.color} />
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
