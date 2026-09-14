"use client";

import { useMemo, useState } from "react";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import {
  buildTitleDataset,
  selectTitleRows,
  TROPHIES,
  TROPHY_COLORS,
  TROPHY_LABELS,
  type TitleRow,
  type Trophy,
} from "@/lib/season/titlePlayground";
import { LEAGUE_IDS, type LeagueId } from "@/lib/season/types";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import LaneIcon from "../LaneIcon";
import PlaygroundSelect from "./PlaygroundSelect";
import type { Lane } from "@/lib/types";
const POSITIONS: { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];
import SplitIcon from "../season/SplitIcon";

const button =
  "border px-2.5 py-1.5 text-[9px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold";
const on = "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright";
const off =
  "border-rift-line text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright";
const input =
  "border border-rift-line/60 bg-rift-bg/40 px-2.5 py-1.5 text-[11px] text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
const LINE_COLORS = [
  "#e0c477",
  "#79bbdf",
  "#7fc9a2",
  "#e88399",
  "#b7a0e5",
  "#e6ab65",
  "#65d5ce",
  "#d9dce6",
];
function TrophyIcon({ trophy, size = 14 }: { trophy: Trophy; size?: number }) {
  return trophy === "winter" || trophy === "spring" || trophy === "summer" ? (
    <SplitIcon split={trophy} size={size} />
  ) : (
    <LeagueIcon league={trophy} size={size} />
  );
}

function Identity({
  row,
  player = false,
}: {
  row: TitleRow;
  player?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <TeamIcon
        iconKey={row.team.iconKey}
        logoUrl={resolveTeamLogo(row.team.name, row.team.logoUrl)}
        color={row.team.color}
        size={20}
        className="shrink-0"
      />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-rift-goldbright">
          {row.name}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-rift-mutedbright">
          {player && row.lane && <LaneIcon lane={row.lane} size="xs" />}
          {row.regions.map((region) => (
            <LeagueIcon key={region} league={region} size={12} />
          ))}
          <span className="truncate">
            {player ? row.team.name : row.team.leagueId}
          </span>
        </span>
      </span>
    </span>
  );
}

function CumulativeChart({
  rows,
  years,
  onSelect,
}: {
  rows: TitleRow[];
  years: number[];
  onSelect: (id: string) => void;
}) {
  const lines = rows.slice(0, 8);
  const max = Math.max(1, ...lines.map((row) => row.total));
  const ticks = [
    ...new Set([
      0,
      Math.round(max / 4),
      Math.round(max / 2),
      Math.round((max * 3) / 4),
      max,
    ]),
  ];
  const first = years[0] ?? 1,
    last = years.at(-1) ?? first;
  const x = (year: number) =>
    first === last ? 465 : 55 + ((year - first) / (last - first)) * 820;
  const y = (total: number) => 275 - (total / max) * 240;
  return (
    <div>
      <p className="mb-3 text-[10px] text-rift-mutedbright">
        Titles accumulated within the selected years. Up to eight competitors,
        ordered by total.
      </p>
      <svg
        viewBox="0 0 920 325"
        role="img"
        aria-label="Cumulative titles by year"
        className="w-full"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1="55"
              x2="875"
              y1={y(tick)}
              y2={y(tick)}
              stroke="#39434a"
              strokeDasharray="3 6"
            />
            <text
              x="40"
              y={y(tick) + 4}
              textAnchor="end"
              fill="#a3adb6"
              fontSize="12"
            >
              {tick}
            </text>
          </g>
        ))}
        {years
          .filter(
            (_, i) =>
              i === 0 ||
              i === years.length - 1 ||
              i % Math.max(1, Math.ceil(years.length / 8)) === 0,
          )
          .map((year) => (
            <text
              key={year}
              x={x(year)}
              y="305"
              textAnchor="middle"
              fill="#a3adb6"
              fontSize="12"
            >
              Y{year}
            </text>
          ))}
        {lines.map((row, i) => (
          <g key={row.id}>
            <polyline
              points={row.yearly
                .map((point) => `${x(point.year)},${y(point.total)}`)
                .join(" ")}
              fill="none"
              stroke={LINE_COLORS[i]}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeDasharray={i % 2 ? "8 3" : undefined}
            />
            {row.yearly.map((point) => (
              <circle
                key={point.year}
                cx={x(point.year)}
                cy={y(point.total)}
                r="3.5"
                fill={LINE_COLORS[i]}
              >
                <title>
                  {row.name} · Year {point.year}: {point.total} titles
                </title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {lines.map((row, i) => (
          <button
            key={row.id}
            type="button"
            className={`${button} ${off} text-left`}
            onClick={() => onSelect(row.id)}
          >
            <span
              className="mb-2 block h-1 w-8 rounded"
              style={{ backgroundColor: LINE_COLORS[i] }}
            />
            <Identity row={row} player={!!row.lane} />
            <span className="mt-1 block text-[10px]">
              {row.total} titles · View breakdown
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TitlePlayground({
  entries,
}: {
  entries: SeasonHistoryEntry[];
}) {
  const data = useMemo(() => buildTitleDataset(entries), [entries]);
  const [mode, setMode] = useState<"teams" | "players">("teams");
  const [position, setPosition] = useState<Lane | undefined>();
  const [chart, setChart] = useState<"bars" | "timeline">("bars");
  const [regions, setRegions] = useState<LeagueId[]>([...LEAGUE_IDS]);
  const [trophies, setTrophies] = useState<Trophy[]>([...TROPHIES]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("10");
  const [includeZero, setIncludeZero] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const first = data.years[0] ?? 1,
    last = data.years.at(-1) ?? first;
  const fromYear = from ? Number(from) : first,
    toYear = to ? Number(to) : last;
  const result = useMemo(
    () =>
      selectTitleRows(data, {
        mode,
        regions,
        position,
        trophies,
        from: fromYear,
        to: toYear,
      }),
    [data, mode, regions, position, trophies, fromYear, toYear],
  );
  const candidates = result.rows.filter(
    (row) =>
      (includeZero || row.total > 0) &&
      `${row.name} ${row.team.name}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const filtered = selected.length
    ? candidates.filter((row) => selected.includes(row.id))
    : candidates;
  const visible = limit === "all" ? filtered : filtered.slice(0, Number(limit));
  const inspected = result.rows.find((row) => row.id === detail);
  const leader = result.rows.find((row) => row.total > 0);
  const credited = result.rows.reduce((sum, row) => sum + row.total, 0);
  const toggleTrophy = (trophy: Trophy) =>
    setTrophies((current) =>
      current.includes(trophy)
        ? current.filter((t) => t !== trophy)
        : [...current, trophy],
    );
  const reset = () => {
    setRegions([...LEAGUE_IDS]);
    setTrophies([...TROPHIES]);
    setFrom("");
    setTo("");
    setSearch("");
    setSelected([]);
    setIncludeZero(false);
    setLimit("10");
    setDetail(null);
    setPosition(undefined);
  };
  return (
    <section aria-label="Title Playground" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rift-line/40 pb-3">
        <div>
          <h2 className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
            Title Playground
          </h2>
          <p className="mt-1.5 text-[10px] text-rift-mutedbright">
            Compare team and player titles across regions, competitions and
            years.
          </p>
        </div>
        <div className="flex gap-1">
          {(["teams", "players"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setPosition(undefined);
                setSelected([]);
                setDetail(null);
                setSearch("");
              }}
              className={`${button} ${mode === value ? on : off}`}
            >
              {value === "teams" ? "Teams" : "Players"}
            </button>
          ))}
        </div>
      </div>
      <div className="border border-rift-line/40 bg-rift-panel/20 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60">
            Filters
          </h3>
          <button type="button" onClick={reset} className={`${button} ${off}`}>
            Reset filters
          </button>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Regions"
        >
          <button
            type="button"
            aria-pressed={regions.length === LEAGUE_IDS.length}
            onClick={() => setRegions([...LEAGUE_IDS])}
            className={`${button} ${regions.length === LEAGUE_IDS.length ? on : off}`}
          >
            All regions
          </button>
          {LEAGUE_IDS.map((region) => (
            <button
              key={region}
              type="button"
              aria-pressed={regions.includes(region)}
              onClick={() =>
                setRegions((current) =>
                  current.length === LEAGUE_IDS.length
                    ? [region]
                    : current.includes(region)
                      ? current.filter((r) => r !== region)
                      : [...current, region],
                )
              }
              className={`${button} ${regions.includes(region) ? on : off} inline-flex items-center gap-2`}
            >
              <LeagueIcon league={region} size={14} />
              {region}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Competitions"
        >
          <button
            type="button"
            onClick={() => setTrophies([...TROPHIES])}
            className={`${button} ${trophies.length === TROPHIES.length ? on : off}`}
          >
            All titles
          </button>
          <button
            type="button"
            onClick={() => setTrophies(["winter", "spring", "summer"])}
            className={`${button} ${off}`}
          >
            Domestic splits
          </button>
          <button
            type="button"
            onClick={() =>
              setTrophies(
                TROPHIES.filter(
                  (t) => !["winter", "spring", "summer"].includes(t),
                ),
              )
            }
            className={`${button} ${off}`}
          >
            Internationals
          </button>
          <span className="mx-1 border-l border-rift-line" />
          {TROPHIES.map((trophy) => (
            <button
              type="button"
              key={trophy}
              aria-pressed={trophies.includes(trophy)}
              onClick={() => toggleTrophy(trophy)}
              className={`${button} ${trophies.includes(trophy) ? on : off} inline-flex items-center gap-2`}
            >
              <TrophyIcon trophy={trophy} />
              {TROPHY_LABELS[trophy]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-rift-line pt-4">
          <PlaygroundSelect
            label="From year"
            value={from}
            options={[
              { value: "", label: "Beginning" },
              ...data.years.map((year) => ({
                value: String(year),
                label: `Year ${year}`,
              })),
            ]}
            onChange={(value) => {
              setFrom(value);
              if (value && Number(value) > toYear) setTo(value);
            }}
          />
          <PlaygroundSelect
            label="To year"
            value={to}
            options={[
              { value: "", label: "Latest" },
              ...data.years.map((year) => ({
                value: String(year),
                label: `Year ${year}`,
              })),
            ]}
            onChange={(value) => {
              setTo(value);
              if (value && Number(value) < fromYear) setFrom(value);
            }}
          />
          <label className="grid min-w-48 flex-1 gap-1.5 text-[10px] text-rift-mutedbright">
            Find a competitor
            <input
              className={input}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                mode === "teams" ? "Search teams…" : "Search players or teams…"
              }
            />
          </label>
          <PlaygroundSelect
            label="Show"
            value={limit}
            options={[
              { value: "10", label: "Top 10" },
              { value: "25", label: "Top 25" },
              { value: "all", label: "All competitors" },
            ]}
            onChange={setLimit}
          />
        </div>
        {mode === "players" && (
          <div
            role="group"
            aria-label="Player positions"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="mr-2 text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright">
              Position at title win
            </span>
            <button
              type="button"
              aria-pressed={!position}
              className={`${button} ${!position ? on : off}`}
              onClick={() => {
                setPosition(undefined);
                setDetail(null);
              }}
            >
              All positions
            </button>
            {POSITIONS.map(({ lane, label }) => (
              <button
                type="button"
                key={lane}
                aria-pressed={position === lane}
                className={`${button} ${position === lane ? on : off} inline-flex items-center gap-2`}
                onClick={() => {
                  setPosition(lane);
                  setDetail(null);
                }}
              >
                <LaneIcon lane={lane} size="sm" />
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-4 text-[10px] text-rift-mutedbright">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(event) => setIncludeZero(event.target.checked)}
            />
            Include competitors with no titles
          </label>
          {mode === "players" && (
            <p>
              Regions follow the team at each title win. Club icons show the
              latest selected title.
            </p>
          )}
        </div>
        {data.inferredYears && (
          <p className="text-[10px] text-rift-mutedbright">
            Archives without a “Year” label use their chronological season
            number.
          </p>
        )}
        {mode === "players" && result.missingRosters > 0 && (
          <p
            role="status"
            className="border border-rift-gold/30 bg-rift-gold/5 p-3 text-[10px] text-rift-goldbright"
          >
            {result.missingRosters} selected tournament(s) have incomplete
            archived player identities. Only documented winners are counted;
            player totals may be incomplete.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px border border-rift-line/40 bg-rift-line/40 md:grid-cols-4">
        {[
          [
            mode === "teams" ? "Tournament titles" : "Player title credits",
            credited.toLocaleString(),
          ],
          [
            "Title holders",
            result.rows.filter((row) => row.total > 0).length.toLocaleString(),
          ],
          [
            "Leading collection",
            leader ? `${leader.name} · ${leader.total}` : "No champion yet",
          ],
          ["Selected years", `${fromYear} — ${toYear}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-rift-bg/90 px-3 py-3">
            <p className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright">
              {label}
            </p>
            <p
              className="mt-1.5 truncate font-display text-lg text-rift-goldbright"
              title={value}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="border border-rift-line/40 bg-rift-panel/20 p-3 md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
              {chart === "bars" ? "Title ranking" : "Cumulative titles"}
            </h3>
            <p
              className="mt-1 text-[10px] text-rift-mutedbright"
              aria-live="polite"
            >
              {filtered.length} matching {mode} · {result.awards} tournament
              titles in scope
            </p>
          </div>
          <div className="flex gap-2">
            {(["bars", "timeline"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={chart === value}
                onClick={() => setChart(value)}
                className={`${button} ${chart === value ? on : off}`}
              >
                {value === "bars" ? "Bars" : "Cumulative timeline"}
              </button>
            ))}
          </div>
        </div>
        <details className="mb-3 border border-rift-line/40 bg-rift-bg/30 px-2.5 py-2">
          <summary className="cursor-pointer text-[10px] text-rift-goldbright">
            Choose competitors to compare ·{" "}
            {selected.length ? `${selected.length} selected` : "All by default"}
          </summary>
          <button
            type="button"
            className={`${button} ${off} my-3`}
            onClick={() => setSelected([])}
          >
            Clear selection
          </button>
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((row) => (
              <label
                key={row.id}
                className="flex min-w-0 items-center gap-2 border border-rift-line/40 px-2 py-1.5 text-[10px] text-rift-mutedbright"
              >
                <input
                  type="checkbox"
                  aria-label={`${row.name} · ${row.total}`}
                  checked={selected.includes(row.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(row.id)
                        ? current.filter((id) => id !== row.id)
                        : [...current, row.id],
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <Identity row={row} player={mode === "players"} />
                </span>
                <span className="text-rift-goldbright tabular-nums">
                  {row.total}
                </span>
              </label>
            ))}
          </div>
        </details>
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <h4 className="text-lg text-rift-goldbright">
              No competitors match this view
            </h4>
            <p className="mt-2 text-sm text-rift-mutedbright">
              Try other regions, competitions or years, or clear your competitor
              selection.
            </p>
          </div>
        ) : chart === "timeline" ? (
          <CumulativeChart
            rows={visible}
            years={result.years}
            onSelect={setDetail}
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-rift-mutedbright">
              {trophies.map((trophy) => (
                <span
                  key={trophy}
                  className="flex items-center gap-1.5 border-b-2 pb-1"
                  style={{ borderColor: TROPHY_COLORS[trophy] }}
                >
                  <TrophyIcon trophy={trophy} />
                  {TROPHY_LABELS[trophy]}
                </span>
              ))}
            </div>
            <div
              className="max-h-[620px] space-y-1 overflow-y-auto pr-1"
              aria-label="Title ranking"
            >
              {visible.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  aria-label={`${row.name}: ${row.total} titles. View breakdown`}
                  aria-expanded={detail === row.id}
                  aria-controls="title-playground-breakdown"
                  onClick={() => setDetail(row.id)}
                  className="grid w-full grid-cols-[24px_minmax(110px,180px)_minmax(50px,1fr)_36px] items-center gap-3 border-b border-rift-line/30 px-2 py-2.5 text-left hover:bg-rift-gold/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold"
                >
                  <span className="text-[10px] tabular-nums text-rift-mutedbright">
                    {index + 1}
                  </span>
                  <Identity row={row} player={mode === "players"} />
                  <span className="relative flex h-5 overflow-hidden bg-rift-line/20">
                    {TROPHIES.filter((t) => row.counts[t] > 0).map((trophy) => (
                      <span
                        key={trophy}
                        className="h-full"
                        style={{
                          width: `${(row.counts[trophy] / Math.max(1, visible[0].total)) * 100}%`,
                          backgroundColor: TROPHY_COLORS[trophy],
                        }}
                        title={`${TROPHY_LABELS[trophy]}: ${row.counts[trophy]}`}
                      />
                    ))}
                  </span>
                  <span className="text-right text-sm tabular-nums text-rift-goldbright">
                    {row.total}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-rift-mutedbright">
              Showing {visible.length} of {filtered.length}. Each segment is one
              competition; select a row for exact counts and years.
            </p>
          </>
        )}
      </div>
      {inspected && (
        <section
          id="title-playground-breakdown"
          aria-label="Title breakdown"
          className="border border-rift-gold/40 bg-rift-panel/30 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <Identity row={inspected} player={mode === "players"} />
            <button
              type="button"
              onClick={() => setDetail(null)}
              className={`${button} ${off}`}
            >
              Close breakdown
            </button>
          </div>
          <div className="my-4 flex flex-wrap gap-2">
            {TROPHIES.filter((t) => inspected.counts[t] > 0).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 border border-rift-line/50 px-2 py-1.5 text-[10px] text-rift-goldbright"
              >
                <TrophyIcon trophy={t} />
                {TROPHY_LABELS[t]} <strong>{inspected.counts[t]}</strong>
              </span>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-[10px] text-rift-mutedbright">
              <caption className="sr-only">
                Documented titles for {inspected.name}
              </caption>
              <thead>
                <tr className="border-b border-rift-line">
                  <th className="py-2">Year</th>
                  <th>Competition</th>
                  <th>Winning team</th>
                  <th>Region</th>
                </tr>
              </thead>
              <tbody>
                {inspected.awards.map((award) => (
                  <tr key={award.id} className="border-b border-rift-line/40">
                    <td className="py-3">{award.year}</td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <TrophyIcon trophy={award.trophy} />
                        {TROPHY_LABELS[award.trophy]}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <TeamIcon
                          iconKey={award.team.iconKey}
                          logoUrl={resolveTeamLogo(
                            award.team.name,
                            award.team.logoUrl,
                          )}
                          color={award.team.color}
                          size={18}
                        />
                        {award.team.name}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <LeagueIcon league={award.team.leagueId} size={14} />
                        {award.team.leagueId}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
