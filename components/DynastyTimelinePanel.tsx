"use client";

import { useMemo, useState, useEffect } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import {
  computeFranchiseMatrix,
  type MatrixCell,
  type MatrixEvent,
  type MatrixEventKind,
  type MatrixRow,
  type MatrixYear,
} from "@/lib/season/franchiseTimeline";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import type { LeagueId, InternationalId } from "@/lib/season/types";
import { LEAGUE_IDS } from "@/lib/season/types";
import type { DynastyTier } from "@/lib/season/historyRecords";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import TeamIcon from "./TeamIcon";
import LeagueIcon from "./LeagueIcon";

// ─── Constants ────────────────────────────────────────────────────────────────

const COL_W = 60; // px per year column
const FRANCHISE_COL_W = 216; // px for sticky franchise column

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tierRank(t: DynastyTier): number {
  return t === "legendary" ? 3 : t === "dynasty" ? 2 : 1;
}

type LeagueFilter = LeagueId | "all";
type TierFilterValue = "all" | "dynasty+" | "legendary";

// ─── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: DynastyTier }) {
  if (tier === "legendary") {
    return (
      <span className="inline-block text-[6.5px] uppercase tracking-[0.2em] bg-rift-gold text-rift-bg border border-rift-goldbright px-1 py-px font-bold shadow-[0_0_5px_rgba(200,170,110,0.45)] flex-shrink-0 leading-tight">
        LEG
      </span>
    );
  }
  if (tier === "dynasty") {
    return (
      <span className="inline-block text-[6.5px] uppercase tracking-[0.2em] text-rift-goldbright border border-rift-gold/40 px-1 py-px flex-shrink-0 leading-tight">
        DYN
      </span>
    );
  }
  return null;
}

// ─── Event icon with tooltip ──────────────────────────────────────────────────

function EventIcon({
  event,
  size = 11,
}: {
  event: MatrixEvent;
  size?: number;
}) {
  const ringCls = (kind: MatrixEventKind) => {
    switch (kind) {
      case "global-cup-title":
        return "ring-1 ring-rift-gold/70 shadow-[0_0_4px_rgba(200,170,110,0.5)]";
      case "worlds-title":
        return "ring-1 ring-rift-bluebright/60 shadow-[0_0_4px_rgba(10,200,185,0.4)]";
      case "intl-title":
        return "ring-1 ring-rift-blue/40";
      default:
        return "";
    }
  };

  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-sm flex-shrink-0",
        event.kind !== "split-title" ? "p-[1px]" : "",
        ringCls(event.kind),
      ]
        .filter(Boolean)
        .join(" ")}
      title={event.label}
    >
      <LeagueIcon
        league={event.iconId as LeagueId | InternationalId}
        size={size}
      />
    </span>
  );
}

// ─── Matrix cell ──────────────────────────────────────────────────────────────

function YearCell({ cell }: { cell: MatrixCell }) {
  if (cell.totalInCell === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-1 h-1 rounded-full bg-rift-line/40" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[3px] items-center py-1 px-0.5">
      {/* International wins — largest, most prominent */}
      {cell.intl.length > 0 && (
        <div className="flex flex-wrap gap-[3px] justify-center">
          {cell.intl.map((ev, i) => (
            <EventIcon
              key={`intl-${i}`}
              event={ev}
              size={ev.kind === "global-cup-title" || ev.kind === "worlds-title" ? 14 : 12}
            />
          ))}
        </div>
      )}
      {/* Split wins */}
      {cell.splits.length > 0 && (
        <div className="flex flex-wrap gap-[2px] justify-center">
          {cell.splits.map((ev, i) => (
            <EventIcon key={`split-${i}`} event={ev} size={10} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expanded franchise detail ────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-w-[3.25rem] px-2 py-1.5 border border-rift-line/35 bg-rift-bg/30">
      <span className="text-[8px] uppercase tracking-[0.14em] text-rift-muted/55 leading-none">
        {label}
      </span>
      <span className="text-base tabular-nums font-display text-rift-goldbright leading-tight mt-1">
        {value}
      </span>
    </div>
  );
}

function TitleListSection({
  heading,
  items,
}: {
  heading: string;
  items: MatrixRow["titleList"];
}) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[8px] uppercase tracking-[0.16em] text-rift-muted/55 mb-1.5">
        {heading}
        <span className="ml-1.5 text-rift-muted/35 tabular-nums">({items.length})</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-40 overflow-y-auto pr-1">
        {items.map((t, i) => (
          <li key={i} className="flex items-center gap-1.5 min-w-0">
            <EventIcon event={t.event} size={t.event.kind === "split-title" ? 10 : 12} />
            <span
              className="text-[10px] text-rift-mutedbright/85 truncate flex-1 min-w-0"
              title={t.event.label}
            >
              {t.event.label}
            </span>
            <span className="text-[8px] tabular-nums text-rift-muted/50 flex-shrink-0 px-1 py-px border border-rift-line/30 bg-rift-bg/40">
              {t.yearLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpandedDetail({
  row,
  onNavigate,
}: {
  row: MatrixRow;
  onNavigate?: (kind: "players" | "teams" | "coaches", id: string) => void;
}) {
  const splits = row.titleList.filter((t) => t.event.kind === "split-title");
  const intls = row.titleList.filter((t) => t.event.kind !== "split-title");
  const accent = row.team.color ?? "rgba(200,170,110,0.45)";

  return (
    <tr className="bg-rift-paneldark/40">
      <td colSpan={999} className="p-0 border-b border-rift-line/25">
        {/*
          Sticky panel pinned to the scroll container's left edge. max-width
          keeps content inside the visible viewport when many year columns
          make the table row extremely wide.
        */}
        <div
          className="sticky left-0 z-[5] py-2 pr-3"
          style={{
            paddingLeft: FRANCHISE_COL_W + 10,
            width: "max-content",
            maxWidth: "min(92vw, 52rem)",
          }}
        >
          <div
            className="border border-rift-line/40 bg-rift-panel/90 shadow-[0_4px_24px_rgba(0,0,0,0.35)] overflow-hidden"
            style={{ borderLeftWidth: 2, borderLeftColor: accent }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-rift-line/25 bg-rift-bg/25 min-w-0">
              <TeamIcon
                iconKey={row.team.iconKey}
                logoUrl={resolveTeamLogo(row.team.name, row.team.logoUrl)}
                size={16}
                color={row.team.color}
              />
              <div className="min-w-0 flex-1">
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate("teams", `${row.team.leagueId}:${row.team.name}`)}
                    className="text-[11px] font-medium text-rift-goldbright truncate hover:underline text-left w-full"
                  >
                    {row.team.name}
                  </button>
                ) : (
                  <div className="text-[11px] font-medium text-rift-goldbright truncate">
                    {row.team.name}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <LeagueIcon league={row.team.leagueId} size={9} />
                  <span className="text-[8px] text-rift-muted/55 uppercase tracking-wider">
                    {row.team.leagueId}
                  </span>
                </div>
              </div>
              <TierBadge tier={row.dynasty.tier} />
            </div>

            <div className="px-3 py-3 space-y-3">
              {/* Stats */}
              <div className="flex flex-wrap gap-1.5">
                <StatChip label="Splits" value={row.splitTitles} />
                <StatChip label="Intl" value={row.intlTitles} />
                <StatChip label="Worlds" value={row.worldsTitles} />
                {row.globalCupTitles > 0 && (
                  <StatChip label="Global Cup" value={row.globalCupTitles} />
                )}
                <StatChip label="Total" value={row.totalTitles} />
              </div>

              {/* Title lists */}
              {(intls.length > 0 || splits.length > 0) && (
                <div className="flex flex-col lg:flex-row gap-4 pt-1 border-t border-rift-line/20">
                  <TitleListSection heading="International" items={intls} />
                  <TitleListSection heading="Splits" items={splits} />
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Franchise row ────────────────────────────────────────────────────────────

function FranchiseRow({
  row,
  years,
  expanded,
  onToggle,
  rowIndex,
  onNavigate,
}: {
  row: MatrixRow;
  years: MatrixYear[];
  expanded: boolean;
  onToggle: () => void;
  rowIndex: number;
  onNavigate?: (kind: "players" | "teams" | "coaches", id: string) => void;
}) {
  const isLegendary = row.dynasty.tier === "legendary";
  const isDynasty = row.dynasty.tier === "dynasty";

  const rowBg = isLegendary
    ? "bg-rift-gold/[0.04] hover:bg-rift-gold/[0.07]"
    : isDynasty
      ? "bg-rift-bg/20 hover:bg-rift-gold/[0.04]"
      : rowIndex % 2 === 0
        ? "bg-rift-bg/10 hover:bg-rift-line/10"
        : "hover:bg-rift-line/10";

  const borderLeft = row.team.color
    ? `2px solid ${row.team.color}`
    : isLegendary
      ? "2px solid rgba(200,170,110,0.5)"
      : "2px solid transparent";

  return (
    <>
      <tr
        className={`group/row cursor-pointer transition-colors ${rowBg}`}
        onClick={onToggle}
        style={{ borderLeft }}
      >
        {/* Sticky franchise column */}
        <td
          className={[
            "sticky left-0 z-10 border-b border-r border-rift-line/20",
            "px-2 py-1.5 align-middle transition-colors",
            isLegendary
              ? "bg-rift-gold/[0.05] group-hover/row:bg-rift-gold/[0.08]"
              : isDynasty
                ? "bg-rift-bg/20 group-hover/row:bg-rift-gold/[0.04]"
                : rowIndex % 2 === 0
                  ? "bg-rift-bg/10 group-hover/row:bg-rift-line/10"
                  : "bg-rift-bg group-hover/row:bg-rift-line/10",
          ].join(" ")}
          style={{ minWidth: FRANCHISE_COL_W, maxWidth: FRANCHISE_COL_W, width: FRANCHISE_COL_W }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex-shrink-0 opacity-40 text-rift-muted/50">
              {expanded ? (
                <IconChevronDown size={10} strokeWidth={2} aria-hidden />
              ) : (
                <IconChevronRight size={10} strokeWidth={2} aria-hidden />
              )}
            </span>
            <TeamIcon
              iconKey={row.team.iconKey}
              logoUrl={resolveTeamLogo(row.team.name, row.team.logoUrl)}
              size={14}
              color={row.team.color}
            />
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate?.("teams", `${row.team.leagueId}:${row.team.name}`);
                }}
                className="text-[11px] font-medium text-rift-goldbright truncate leading-tight hover:underline text-left w-full"
              >
                {row.team.name}
              </button>
              <div className="flex items-center gap-1 mt-0.5">
                <LeagueIcon league={row.team.leagueId} size={9} />
                <span className="text-[8px] text-rift-muted/55 tabular-nums">
                  {row.team.leagueId}
                </span>
              </div>
            </div>
            <TierBadge tier={row.dynasty.tier} />
            <span
              className="text-[9px] tabular-nums text-rift-gold/50 flex-shrink-0 ml-0.5"
              title={`${row.totalTitles} total title${row.totalTitles !== 1 ? "s" : ""}`}
            >
              {row.totalTitles}
            </span>
          </div>
        </td>

        {/* Year cells */}
        {years.map((year) => {
          const cell = row.cells[year.seasonId] ?? { splits: [], intl: [], totalInCell: 0 };
          return (
            <td
              key={year.seasonId}
              className={[
                "border-b border-rift-line/15 align-top",
                cell.totalInCell > 0 ? "border-l border-rift-line/10" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ width: COL_W, minWidth: COL_W, maxWidth: COL_W }}
            >
              <YearCell cell={cell} />
            </td>
          );
        })}
      </tr>

      {expanded && <ExpandedDetail row={row} onNavigate={onNavigate} />}
    </>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-2 py-1 border text-[8px] uppercase tracking-[0.18em] transition-all leading-none",
        active
          ? "border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright"
          : "border-rift-line/60 text-rift-muted/70 hover:text-rift-mutedbright hover:border-rift-line",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

interface FilterState {
  yearFromIdx: number;
  yearToIdx: number;
  league: LeagueFilter;
  tier: TierFilterValue;
  intlOnly: boolean;
}

function FilterBar({
  filters,
  years,
  rowCount,
  totalRows,
  onFiltersChange,
}: {
  filters: FilterState;
  years: MatrixYear[];
  rowCount: number;
  totalRows: number;
  onFiltersChange: (next: FilterState) => void;
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onFiltersChange({ ...filters, [k]: v });

  const leagues: Array<{ id: LeagueFilter; label: string }> = [
    { id: "all", label: "All" },
    ...LEAGUE_IDS.map((l) => ({ id: l as LeagueFilter, label: l })),
  ];

  const tiers: Array<{ id: TierFilterValue; label: string }> = [
    { id: "all", label: "All" },
    { id: "dynasty+", label: "Dynasty+" },
    { id: "legendary", label: "Legendary" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2">
      {/* Year range */}
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/50">
          Years
        </span>
        <select
          value={filters.yearFromIdx}
          onChange={(e) => {
            const v = Number(e.target.value);
            set(
              "yearFromIdx",
              Math.min(v, filters.yearToIdx),
            );
          }}
          className="bg-rift-paneldark border border-rift-line/60 text-rift-mutedbright text-[9px] px-1.5 py-0.5 focus:outline-none focus:border-rift-gold/40 cursor-pointer"
        >
          {years.map((y, i) => (
            <option key={y.seasonId} value={i}>
              {y.yearLabel}
            </option>
          ))}
        </select>
        <span className="text-[8px] text-rift-muted/40">–</span>
        <select
          value={filters.yearToIdx}
          onChange={(e) => {
            const v = Number(e.target.value);
            set(
              "yearToIdx",
              Math.max(v, filters.yearFromIdx),
            );
          }}
          className="bg-rift-paneldark border border-rift-line/60 text-rift-mutedbright text-[9px] px-1.5 py-0.5 focus:outline-none focus:border-rift-gold/40 cursor-pointer"
        >
          {years.map((y, i) => (
            <option key={y.seasonId} value={i}>
              {y.yearLabel}
            </option>
          ))}
        </select>
      </div>

      {/* League filter */}
      <div className="flex items-center gap-1">
        <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/50 mr-1">
          League
        </span>
        {leagues.map(({ id, label }) => (
          <FilterPill
            key={id}
            active={filters.league === id}
            onClick={() => set("league", id)}
          >
            {id !== "all" ? (
              <span className="flex items-center gap-0.5">
                <LeagueIcon league={id as LeagueId} size={9} />
                {label}
              </span>
            ) : (
              label
            )}
          </FilterPill>
        ))}
      </div>

      {/* Tier filter */}
      <div className="flex items-center gap-1">
        <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/50 mr-1">
          Tier
        </span>
        {tiers.map(({ id, label }) => (
          <FilterPill
            key={id}
            active={filters.tier === id}
            onClick={() => set("tier", id)}
          >
            {label}
          </FilterPill>
        ))}
      </div>

      {/* International only toggle */}
      <FilterPill
        active={filters.intlOnly}
        onClick={() => set("intlOnly", !filters.intlOnly)}
      >
        Intl titles only
      </FilterPill>

      {/* Result count */}
      <span className="ml-auto text-[8px] tabular-nums text-rift-muted/40 flex-shrink-0">
        {rowCount === totalRows
          ? `${totalRows} franchise${totalRows !== 1 ? "s" : ""}`
          : `${rowCount} / ${totalRows}`}
      </span>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items: Array<{ iconId: string; label: string; size?: number }> = [
    { iconId: "global-cup", label: "Global Cup", size: 14 },
    { iconId: "worlds", label: "Worlds", size: 13 },
    { iconId: "first-stand", label: "First Stand", size: 12 },
    { iconId: "msi", label: "MSI", size: 12 },
    { iconId: "LCK", label: "Split title", size: 10 },
  ];

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[8px] uppercase tracking-[0.15em] text-rift-muted/50">
      {items.map(({ iconId, label, size }) => (
        <span key={iconId} className="inline-flex items-center gap-1.5">
          <LeagueIcon
            league={iconId as LeagueId | InternationalId}
            size={size ?? 11}
          />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block text-[6.5px] bg-rift-gold text-rift-bg border border-rift-goldbright px-1 py-px font-bold leading-tight">
          LEG
        </span>
        Legendary dynasty
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block text-[6.5px] text-rift-goldbright border border-rift-gold/40 px-1 py-px leading-tight">
          DYN
        </span>
        Dynasty
      </span>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ hasEntries }: { hasEntries: boolean }) {
  return (
    <div className="border border-rift-line/30 bg-rift-bg/15 px-6 py-12 flex flex-col items-center gap-3 text-center">
      <span className="text-4xl opacity-15 select-none" aria-hidden>
        ⚜
      </span>
      <p className="text-[11px] text-rift-mutedbright/70 leading-relaxed max-w-xs">
        {hasEntries
          ? "No title holders found in the archive."
          : "Archive completed seasons to populate franchise timelines."}
      </p>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function DynastyTimelinePanel({
  entries,
  onNavigate,
}: {
  entries: SeasonHistoryEntry[];
  onNavigate?: (kind: "players" | "teams" | "coaches", id: string) => void;
}) {
  const matrix = useMemo(() => computeFranchiseMatrix(entries), [entries]);

  const maxIdx = Math.max(0, matrix.years.length - 1);

  const [filters, setFilters] = useState<FilterState>({
    yearFromIdx: 0,
    yearToIdx: maxIdx,
    league: "all",
    tier: "all",
    intlOnly: false,
  });

  // Keep year indices in-bounds when matrix changes
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      yearFromIdx: 0,
      yearToIdx: Math.max(0, matrix.years.length - 1),
    }));
  }, [matrix.years.length]);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const safeFrom = Math.min(filters.yearFromIdx, maxIdx);
  const safeTo = Math.min(
    Math.max(filters.yearToIdx, safeFrom),
    maxIdx,
  );
  const filteredYears = matrix.years.slice(safeFrom, safeTo + 1);

  const filteredRows = useMemo(() => {
    return matrix.rows.filter((row) => {
      if (filters.league !== "all" && row.team.leagueId !== filters.league)
        return false;
      if (filters.tier === "dynasty+" && tierRank(row.dynasty.tier) < 2)
        return false;
      if (filters.tier === "legendary" && row.dynasty.tier !== "legendary")
        return false;
      const hasInRange = filteredYears.some(
        (y) => (row.cells[y.seasonId]?.totalInCell ?? 0) > 0,
      );
      if (!hasInRange) return false;
      if (filters.intlOnly) {
        const hasIntl = filteredYears.some(
          (y) => (row.cells[y.seasonId]?.intl.length ?? 0) > 0,
        );
        if (!hasIntl) return false;
      }
      return true;
    });
  }, [matrix.rows, filters, filteredYears]);

  if (entries.length === 0 || matrix.rows.length === 0) {
    return <EmptyState hasEntries={entries.length > 0} />;
  }

  return (
    <div className="space-y-3 px-1">
      {/* Description */}
      <p className="text-[10px] text-rift-muted/60 leading-relaxed max-w-2xl">
        Every franchise as a row, every season as a column. Icons show titles
        won. Click a row to expand title details. Hover icons for event names.
      </p>

      {/* Filters */}
      <FilterBar
        filters={filters}
        years={matrix.years}
        rowCount={filteredRows.length}
        totalRows={matrix.rows.length}
        onFiltersChange={setFilters}
      />

      {/* Legend */}
      <Legend />

      {/* Matrix */}
      {filteredRows.length === 0 ? (
        <p className="text-[10px] italic text-rift-muted/50 py-6 text-center">
          No franchises match the current filters.
        </p>
      ) : (
        <div
          className="overflow-x-auto border border-rift-line/30"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(200,170,110,0.2) transparent",
          }}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ minWidth: FRANCHISE_COL_W + filteredYears.length * COL_W }}
          >
            <thead>
              <tr>
                {/* Franchise column header */}
                <th
                  className="sticky left-0 z-20 bg-rift-paneldark border-b border-r border-rift-line/40 px-3 py-2 align-bottom"
                  style={{
                    minWidth: FRANCHISE_COL_W,
                    maxWidth: FRANCHISE_COL_W,
                    width: FRANCHISE_COL_W,
                  }}
                >
                  <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/50">
                    Franchise
                  </span>
                </th>

                {/* Year column headers */}
                {filteredYears.map((year) => (
                  <th
                    key={year.seasonId}
                    className="bg-rift-paneldark border-b border-rift-line/40 text-center px-1 py-2 align-bottom"
                    style={{
                      width: COL_W,
                      minWidth: COL_W,
                      maxWidth: COL_W,
                    }}
                    title={year.seasonName}
                  >
                    <span className="text-[9px] tabular-nums font-semibold text-rift-mutedbright/70 tracking-wide select-none block leading-tight">
                      {year.yearLabel}
                    </span>
                    <span className="text-[7px] text-rift-muted/35 leading-tight block truncate px-0.5">
                      {year.seasonName}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row, idx) => (
                <FranchiseRow
                  key={row.franchiseKey}
                  row={row}
                  years={filteredYears}
                  expanded={expandedKey === row.franchiseKey}
                  onToggle={() =>
                    setExpandedKey(
                      expandedKey === row.franchiseKey ? null : row.franchiseKey,
                    )
                  }
                  rowIndex={idx}
                  onNavigate={onNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
