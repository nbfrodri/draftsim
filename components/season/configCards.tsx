"use client";

// Shared format-config editor cards — used by both the New Season setup and the
// Realities offseason "change next-year formats" panel, so the two never drift.
// Each card is a controlled component: it renders one league or one
// international's full format options and emits a patch via `onChange`.

import type { SeriesFormat } from "@/lib/types";
import type { TournamentFormat } from "@/lib/tournament";
import {
  intlFormatOptionsFor,
  LEAGUE_FORMAT_OPTIONS,
} from "@/lib/season/engine";
import {
  INTERNATIONAL_LABELS,
  type InternationalId,
  type SeasonIntlConfig,
  type SeasonLeagueConfig,
} from "@/lib/season/types";

// ── Canonical defaults (the starting values for the format cards) ──────────
export const DEFAULT_LEAGUE_CONFIG: SeasonLeagueConfig = {
  format: "round-robin-playoffs",
  playoffTeams: 4,
  regularSeries: "bo1",
  playoffSeries: "bo5",
  semifinalSeries: "bo5",
  finalsSeries: "bo5",
};

export const INTL_IDS: readonly InternationalId[] = ["first-stand", "msi", "worlds"];
export const DEFAULT_INTL_CONFIGS: Record<InternationalId, SeasonIntlConfig> = {
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
  "global-cup": {
    format: "single-elim",
    earlySeries: "bo3",
    semifinalSeries: "bo5",
    finalsSeries: "bo5",
    playoffTeams: 8,
  },
};

// ── Format predicates (which controls apply to which format) ───────────────
export const SERIES_OPTIONS: SeriesFormat[] = ["bo1", "bo3", "bo5"];

export function formatHasPlayoffStage(format: TournamentFormat): boolean {
  // round-robin / swiss have no playoffs; triple-elim is one continuous
  // bracket (the whole field, no separate "playoff teams" cut).
  return format !== "round-robin" && format !== "swiss" && format !== "triple-elim";
}

// Formats whose decisive series is a double-elim grand final — the only ones
// for which the "true grand final" (no bracket reset) toggle means anything.
export function formatHasDEGrandFinal(format: TournamentFormat): boolean {
  return (
    format === "double-elim" ||
    format === "round-robin-playoffs" ||
    format.endsWith("-de")
  );
}

// Any Swiss-based format supports the threshold qualification mode.
export function formatIsSwiss(format: TournamentFormat): boolean {
  return format === "swiss" || format.startsWith("swiss-playoffs");
}

// Bracket-size pickers apply to every stage+playoffs format. Single-elim and
// plain double/triple-elim have no separate playoff stage.
export function intlFormatHasPlayoffSize(format: TournamentFormat): boolean {
  return (
    format !== "single-elim" &&
    format !== "double-elim" &&
    format !== "triple-elim"
  );
}

// Shared select styling: dark control with cut corners + gold chevron.
export const SELECT_CLS =
  "select-rift cursor-pointer bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs pl-2.5 pr-7 py-1.5 outline-none transition-colors hover:border-rift-gold/50 hover:text-rift-goldbright focus:border-rift-gold/70 focus:text-rift-goldbright [color-scheme:dark] [&_option]:bg-rift-panel [&_option]:text-rift-mutedbright [&_optgroup]:bg-rift-panel [&_optgroup]:text-rift-gold/80";

// One labeled BO1/BO3/BO5 dropdown.
export function SeriesSelect({
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
      <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">{label}</span>
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

// ── League split card ──────────────────────────────────────────────────────
export function LeagueConfigCard({
  label,
  cfg,
  onChange,
}: {
  label: string;
  cfg: SeasonLeagueConfig;
  onChange: (patch: Partial<SeasonLeagueConfig>) => void;
}) {
  const hasPlayoffs = formatHasPlayoffStage(cfg.format);
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 p-3 flex items-end gap-3 flex-wrap">
      <div className="font-display text-xs tracking-[0.25em] uppercase text-rift-goldbright w-28 flex-shrink-0 pb-1.5">
        {label}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Split Format</span>
        <select
          value={cfg.format}
          onChange={(e) => onChange({ format: e.target.value as TournamentFormat })}
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
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Playoff Teams</span>
        <select
          value={cfg.playoffTeams}
          disabled={!hasPlayoffs}
          onChange={(e) => onChange({ playoffTeams: Number(e.target.value) })}
          className={SELECT_CLS}
          title="Top 6: the top 2 seeds get a first-round bye (works for single- and double-elim playoffs)"
        >
          <option value={4}>Top 4</option>
          <option value={6}>Top 6</option>
          <option value={8}>Top 8</option>
        </select>
      </label>
      <SeriesSelect label="Regular Series" value={cfg.regularSeries} onChange={(v) => onChange({ regularSeries: v })} />
      <SeriesSelect
        label="Playoff Series"
        value={cfg.playoffSeries}
        disabled={!hasPlayoffs}
        onChange={(v) => onChange({ playoffSeries: v })}
        title="Series length for early playoff rounds"
      />
      <SeriesSelect
        label="Semifinals"
        value={cfg.semifinalSeries ?? cfg.playoffSeries}
        disabled={!hasPlayoffs}
        onChange={(v) => onChange({ semifinalSeries: v })}
        title="Series length for the semifinals — the matches feeding the final (in double-elim: winners + losers finals)"
      />
      <SeriesSelect
        label="Finals"
        value={cfg.finalsSeries ?? cfg.playoffSeries}
        disabled={!hasPlayoffs}
        onChange={(v) => onChange({ finalsSeries: v })}
        title="Series length for the final / grand final"
      />
      {(cfg.format === "round-robin" || cfg.format === "round-robin-playoffs") && (
        <label
          className="flex items-center gap-1.5 cursor-pointer pb-1.5"
          title="Each team plays every other team twice (home & away), doubling the matchdays"
        >
          <input
            type="checkbox"
            checked={cfg.roundRobinLegs === 2}
            onChange={(e) => onChange({ roundRobinLegs: e.target.checked ? 2 : 1 })}
            className="accent-rift-gold"
          />
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Double RR</span>
        </label>
      )}
      {formatHasDEGrandFinal(cfg.format) && (
        <label
          className="flex items-center gap-1.5 cursor-pointer pb-1.5"
          title="Single decisive grand final in the double-elim playoff bracket — no bracket reset for the losers-bracket finalist"
        >
          <input
            type="checkbox"
            checked={cfg.trueGrandFinal === true}
            onChange={(e) => onChange({ trueGrandFinal: e.target.checked })}
            className="accent-rift-gold"
          />
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">True GF</span>
        </label>
      )}
      {formatIsSwiss(cfg.format) && (
        <label
          className="flex items-center gap-1.5 cursor-pointer pb-1.5"
          title="Modern Worlds Swiss: teams play until X wins (qualify) or X losses (eliminated) with strict same-record pairing and no byes, instead of a fixed number of rounds. X is fixed by the field size and it only engages for a power-of-2 field (e.g. the 16-team Worlds main stage); otherwise it falls back to fixed rounds. Off = fixed rounds."
        >
          <input
            type="checkbox"
            checked={cfg.swissThreshold === true}
            onChange={(e) => onChange({ swissThreshold: e.target.checked })}
            className="accent-rift-gold"
          />
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Threshold</span>
        </label>
      )}
    </div>
  );
}

// ── International card ──────────────────────────────────────────────────────
export function IntlConfigCard({
  event,
  cfg,
  onChange,
}: {
  event: InternationalId | "shared";
  cfg: SeasonIntlConfig;
  onChange: (patch: Partial<SeasonIntlConfig>) => void;
}) {
  const hasPlayoffSize = intlFormatHasPlayoffSize(cfg.format);
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 p-3 flex items-end gap-3 flex-wrap">
      <div className="font-display text-xs tracking-[0.25em] uppercase text-rift-goldbright w-28 flex-shrink-0 pb-1.5">
        {event === "shared" ? "All Events" : INTERNATIONAL_LABELS[event]}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Format</span>
        <select
          value={cfg.format}
          onChange={(e) => onChange({ format: e.target.value as TournamentFormat })}
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
      <label className={`flex flex-col gap-1 ${hasPlayoffSize ? "" : "opacity-40"}`}>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Playoff Teams</span>
        <select
          value={cfg.playoffTeams}
          disabled={!hasPlayoffSize}
          onChange={(e) => onChange({ playoffTeams: Number(e.target.value) })}
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
        onChange={(v) => onChange({ earlySeries: v })}
        title="Series length for early rounds / the regular stage"
      />
      <SeriesSelect
        label="Semifinals"
        value={cfg.semifinalSeries ?? cfg.finalsSeries}
        onChange={(v) => onChange({ semifinalSeries: v })}
        title="Series length for the semifinals — the matches feeding the final (in double-elim: winners + losers finals)"
      />
      <SeriesSelect
        label="Finals / Bracket"
        value={cfg.finalsSeries}
        onChange={(v) => onChange({ finalsSeries: v })}
        title="Series length for the playoff bracket and the final"
      />
      {(() => {
        // First Stand's play-in IS its seeds-bye structure, only on single-elim.
        const isFirstStandSeedBye =
          (event === "first-stand" || event === "shared") && cfg.format === "single-elim";
        const showPlayIn =
          event === "worlds" || event === "msi" || event === "shared" || isFirstStandSeedBye;
        if (!showPlayIn) return null;
        const enabled = cfg.playInEnabled !== false;
        const showWorlds = event === "worlds" || event === "shared";
        const showFormat = showWorlds || isFirstStandSeedBye;
        return (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Play-In</span>
              <select
                value={enabled ? "on" : "off"}
                onChange={(e) => onChange({ playInEnabled: e.target.value === "on" })}
                className={SELECT_CLS}
                title="Worlds OFF = all qualified teams (incl. #4 seeds) enter the main event directly. MSI OFF = never run the field-trimming play-in. First Stand OFF = plain 12-team single-elim (no #1-seed byes)."
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
            {enabled && showFormat && (
              <label className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Play-In Format</span>
                <select
                  value={cfg.playInFormat ?? "single-elim"}
                  onChange={(e) =>
                    onChange({ playInFormat: e.target.value as "single-elim" | "double-elim" })
                  }
                  className={SELECT_CLS}
                  title="Bracket format for the play-in (double-elim gives eliminated teams a second life). Play-ins always use a single decisive grand final — no bracket reset."
                >
                  <option value="single-elim">Single Elim</option>
                  <option value="double-elim">Double Elim</option>
                </select>
              </label>
            )}
            {enabled && showWorlds && (
              <label className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Advance</span>
                <select
                  value={cfg.playInAdvancing ?? 2}
                  onChange={(e) => onChange({ playInAdvancing: Number(e.target.value) })}
                  className={SELECT_CLS}
                  title="How many play-in finalists reach the main event (auto-reduced to keep groups/swiss fields even)"
                >
                  <option value={1}>1 team</option>
                  <option value={2}>2 teams</option>
                  <option value={4}>4 teams</option>
                </select>
              </label>
            )}
            {enabled && (
              <SeriesSelect
                label="Play-In Series"
                value={cfg.playInSeries ?? cfg.earlySeries}
                onChange={(v) => onChange({ playInSeries: v })}
                title="Series length for play-in matches"
              />
            )}
          </>
        );
      })()}
      {formatHasDEGrandFinal(cfg.format) && (
        <label
          className="flex items-center gap-1.5 cursor-pointer pb-1.5"
          title="Main event only: single decisive grand final in the double-elim bracket — no bracket reset. Play-ins never use a reset regardless of this toggle."
        >
          <input
            type="checkbox"
            checked={cfg.trueGrandFinal === true}
            onChange={(e) => onChange({ trueGrandFinal: e.target.checked })}
            className="accent-rift-gold"
          />
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">True GF</span>
        </label>
      )}
      {formatIsSwiss(cfg.format) && (
        <label
          className="flex items-center gap-1.5 cursor-pointer pb-1.5"
          title="Modern Worlds Swiss: teams play until X wins (qualify) or X losses (eliminated) with strict same-record pairing and no byes, instead of a fixed number of rounds. X is fixed by the field size and it only engages for a power-of-2 field (e.g. the 16-team Worlds main stage); otherwise it falls back to fixed rounds. Off = fixed rounds."
        >
          <input
            type="checkbox"
            checked={cfg.swissThreshold === true}
            onChange={(e) => onChange({ swissThreshold: e.target.checked })}
            className="accent-rift-gold"
          />
          <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted">Threshold</span>
        </label>
      )}
      {event === "worlds" && (
        <span className="text-[9px] text-rift-muted/70 pb-1.5">
          Main-event format is separate from the play-in
        </span>
      )}
      {event === "shared" && cfg.format === "double-elim" && (
        <span className="text-[9px] text-rift-muted/70 pb-1.5">
          Only First Stand&apos;s 12-team field fits double-elim — MSI and Worlds keep their canonical formats
        </span>
      )}
    </div>
  );
}

// ── Global Cup (quadrennial) ───────────────────────────────────────────────
// Fixed 32-team single-elim after Worlds on franchise years 4, 8, … — only
// series lengths are customizable (same early / semis / finals split as other
// internationals).
export function GlobalCupConfigCard({
  cfg,
  onChange,
}: {
  cfg: SeasonIntlConfig;
  onChange: (patch: Partial<SeasonIntlConfig>) => void;
}) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 p-3 flex items-end gap-3 flex-wrap">
      <div className="font-display text-xs tracking-[0.25em] uppercase text-rift-goldbright w-28 flex-shrink-0 pb-1.5">
        Global Cup
      </div>
      <SeriesSelect
        label="Early Rounds"
        value={cfg.earlySeries}
        onChange={(v) => onChange({ earlySeries: v })}
        title="Series length for R32 through quarterfinals"
      />
      <SeriesSelect
        label="Semifinals"
        value={cfg.semifinalSeries ?? cfg.finalsSeries}
        onChange={(v) => onChange({ semifinalSeries: v })}
        title="Series length for the semifinals"
      />
      <SeriesSelect
        label="Finals"
        value={cfg.finalsSeries}
        onChange={(v) => onChange({ finalsSeries: v })}
        title="Series length for the Global Cup final"
      />
      <span className="text-[9px] text-rift-muted/70 pb-1.5 max-w-[220px] leading-snug">
        Quadrennial event (years 4, 8, …) · 32-team single elimination after Worlds
      </span>
    </div>
  );
}
