"use client";

import {
IconChevronDown,
IconChevronRight,
IconTrophy,
} from "@tabler/icons-react";
import { memo,useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from "react";

import {
restoreFeedRosters,
PRE_INTL_LABEL,
SIM_RESULTS_FULL_DETAIL_YEARS,
countSummarizedYears,
groupSimResultFeedEntries,
simResultYears,
type SimFollowedTeamSummary,
type SimIntlResultEntry,
type SimResultEntry,
type SimResultTeamRef,
type SimResultYearGroup,
type SimCoachMoveSummary,
type SimRosterMoveSummary,
type SimRosterMovesEntry,
type SimRosterPlayer,
type SimRosterSnapshots,
type SimSplitResultEntry,
type SimYearResultEntry
} from "@/lib/season/simResultsSummary";
import {
INTERNATIONAL_LABELS,
LEAGUE_IDS,
SPLIT_LABELS,
type InternationalId,
type SplitId
} from "@/lib/season/types";
import type { Lane,PlayerTier,Roster } from "@/lib/types";
import CoachNameLink from "../coach/CoachNameLink";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TeamIcon from "../TeamIcon";
import SplitIcon from "./SplitIcon";
import TierChip from "./TierChip";
import LivePlayerSearch from "./LivePlayerSearch";
import { useDraftStore } from "@/store/draftStore";

function isRosterMovesEntry(entry: SimResultEntry): entry is SimRosterMovesEntry {
  return entry.kind === "roster-moves";
}

function useGroupedFeedEntries(entries: SimResultEntry[], showRosterMoves: boolean): SimResultYearGroup[] {
  const seasonId = useDraftStore(s => s.season?.id);
  const phaseRosters = useDraftStore(s => s.season?.phaseRosters);
  const history = useDraftStore(s => s.activeRealityId
    ? s.realities.find(reality => reality.id === s.activeRealityId)?.history
    : s.seasonHistory);
  const restored = useMemo(() => restoreFeedRosters(entries, [
    ...(history ?? []),
    ...(seasonId ? [{ id: seasonId, phaseRosters }] : []),
  ]), [entries, history, seasonId, phaseRosters]);
  return useMemo(() => groupSimResultFeedEntries(restored, showRosterMoves), [restored, showRosterMoves]);
}

function SimResultsFeedPanel({
  entries,
  compact: compactDefault = false,
  autoScroll: autoScrollDefault = false,
  title = "Simulation Results",
  loading = false,
  bulkProgress,
  onDismiss,
}: {
  entries: SimResultEntry[];
  compact?: boolean;
  autoScroll?: boolean;
  title?: string;
  loading?: boolean;
  bulkProgress?: { year: number; completed: number; total: number };
  onDismiss?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const compactDuringSim = compactDefault || loading;
  const [expandedMode, setExpandedMode] = useState(!compactDuringSim);
  const [autoScroll, setAutoScroll] = useState(autoScrollDefault);
  const [showRosterMoves, setShowRosterMoves] = useState(true);
  const years = useMemo(() => simResultYears(entries), [entries]);
  const latestYear = years[years.length - 1];
  const summarizedYearCount = useMemo(
    () => countSummarizedYears(entries),
    [entries],
  );
  const expandedYearCount = loading ? 2 : 1;
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(
    () => new Set(),
  );

  const prevLatestYearRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (latestYear == null) return;
    if (prevLatestYearRef.current === latestYear) return;
    prevLatestYearRef.current = latestYear;
    const expanded = new Set(years.slice(-expandedYearCount));
    setCollapsedYears(() => {
      const next = new Set<number>();
      for (const y of years) {
        if (!expanded.has(y)) next.add(y);
      }
      return next;
    });
  }, [expandedYearCount, latestYear, years]);

  const [previousCompact, setPreviousCompact] = useState(compactDuringSim);
  if (previousCompact !== compactDuringSim) {
    setPreviousCompact(compactDuringSim);
    if (compactDuringSim) setExpandedMode(false);
  }

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [autoScroll, entries.length]);

  const grouped = useGroupedFeedEntries(entries, showRosterMoves);

  const rosterMoveCount = useMemo(
    () => entries.filter(isRosterMovesEntry).length,
    [entries],
  );

  const visibleEntryCount = showRosterMoves
    ? entries.length
    : entries.length - rosterMoveCount;

  const toggleYear = useCallback((year: number) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  const dense = !expandedMode;

  return (
    <div
      className={`border-2 border-rift-gold/40 bg-rift-gold/[0.04] flex flex-col min-h-0 max-h-full ${
        loading && entries.length === 0 ? "border-rift-gold/55" : ""
      } ${dense ? "text-[9px]" : "text-[10px]"}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-rift-gold/30 flex-shrink-0 bg-rift-panel/80">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-goldbright font-display">
            {title}
          </div>
          {bulkProgress && (
            <div className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/60 tabular-nums mt-0.5">
              Year {bulkProgress.year} · {bulkProgress.completed}/
              {bulkProgress.total} complete
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <span className="text-[8px] text-rift-muted/60 tabular-nums">
            {visibleEntryCount} update{visibleEntryCount === 1 ? "" : "s"}
            {years.length > 0 && (
              <span className="text-rift-muted/45">
                {" "}
                · {years.length} yr{years.length === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowRosterMoves((v) => !v)}
            aria-pressed={showRosterMoves}
            className={`px-1.5 py-0.5 border text-[7px] uppercase tracking-[0.15em] transition-colors ${
              showRosterMoves
                ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
                : "border-rift-line/50 text-rift-mutedbright/70 hover:border-rift-gold/40"
            }`}
            title={
              rosterMoveCount > 0
                ? `${rosterMoveCount} roster move${rosterMoveCount === 1 ? "" : "s"} in feed`
                : "No roster moves yet"
            }
          >
            Roster moves
          </button>
          <button
            type="button"
            onClick={() => setExpandedMode((v) => !v)}
            aria-pressed={expandedMode}
            className="px-1.5 py-0.5 border border-rift-line/50 text-[7px] uppercase tracking-[0.15em] text-rift-mutedbright/70 hover:border-rift-gold/40 hover:text-rift-goldbright transition-colors"
          >
            {expandedMode ? "Compact" : "Expand"}
          </button>
          <button
            type="button"
            onClick={() => setAutoScroll((v) => !v)}
            aria-pressed={autoScroll}
            className={`px-1.5 py-0.5 border text-[7px] uppercase tracking-[0.15em] transition-colors ${
              autoScroll
                ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
                : "border-rift-line/50 text-rift-mutedbright/70 hover:border-rift-gold/40"
            }`}
          >
            Auto-scroll
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/60 hover:text-rift-goldbright transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      <LivePlayerSearch entries={entries} loading={loading} />
      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain px-2 py-2 min-h-[8rem] max-h-[min(60vh,28rem)]"
      >
        {entries.length === 0 ? (
          <EmptyFeed loading={loading} />
        ) : (
          <div className="space-y-3">
            {summarizedYearCount > 0 && (
              <p className="px-2 py-1 text-[8px] uppercase tracking-[0.18em] text-rift-muted/55 border border-rift-line/30 bg-rift-bg/30">
                Showing last {SIM_RESULTS_FULL_DETAIL_YEARS} years in detail ·{" "}
                {summarizedYearCount} earlier yr
                {summarizedYearCount === 1 ? "" : "s"} summarized
              </p>
            )}
            {grouped.map(([year, yearEntries], groupIdx) => (
              <YearSection
                key={year}
                year={year}
                yearEntries={yearEntries}
                groupIdx={groupIdx}
                collapsed={collapsedYears.has(year)}
                isLatest={year === latestYear}
                loading={loading}
                dense={dense}
                onToggleYear={toggleYear}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SimResultsFeedPanel);

const YearSection = memo(function YearSection({
  year,
  yearEntries,
  groupIdx,
  collapsed,
  isLatest,
  loading,
  dense,
  onToggleYear,
}: {
  year: number;
  yearEntries: SimResultEntry[];
  groupIdx: number;
  collapsed: boolean;
  isLatest: boolean;
  loading: boolean;
  dense: boolean;
  onToggleYear: (year: number) => void;
}) {
  const handleToggle = useCallback(() => {
    onToggleYear(year);
  }, [onToggleYear, year]);

  return (
    <section className="relative cv-auto">
      {groupIdx > 0 && (
        <div
          className="absolute -top-1.5 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rift-gold/25 to-transparent"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center gap-2 px-2 py-1.5 mb-1 border border-rift-gold/35 bg-rift-panel/95 text-left transition-colors hover:bg-rift-gold/[0.06] ${
          isLatest ? "border-rift-gold/50" : ""
        }`}
      >
        {collapsed ? (
          <IconChevronRight
            size={12}
            stroke={1.8}
            className="text-rift-gold/70 flex-shrink-0"
            aria-hidden
          />
        ) : (
          <IconChevronDown
            size={12}
            stroke={1.8}
            className="text-rift-gold/70 flex-shrink-0"
            aria-hidden
          />
        )}
        <span className="font-display text-[10px] tracking-[0.2em] uppercase text-rift-goldbright tabular-nums">
          Year {year}
        </span>
        <span className="text-[8px] text-rift-muted/55 tabular-nums">
          {yearEntries.length} event
          {yearEntries.length === 1 ? "" : "s"}
        </span>
        {isLatest && loading && (
          <span className="ml-auto flex items-center gap-1 text-[7px] uppercase tracking-[0.15em] text-rift-gold/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rift-gold/70 animate-pulse" />
            Live
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="space-y-1.5 pl-0.5">
          {yearEntries.map((entry) => (
            <SimResultCard
              key={simResultCardKey(entry)}
              entry={entry}
              dense={dense}
            />
          ))}
        </div>
      )}
    </section>
  );
});

function EmptyFeed({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div
        className={`w-8 h-8 mb-3 rounded-full border-2 border-rift-gold/30 ${
          loading ? "border-t-rift-goldbright animate-spin" : "border-rift-gold/20"
        }`}
      />
      <p className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/70">
        {loading ? "Waiting for first result…" : "No results yet"}
      </p>
      {loading && (
        <p className="mt-1.5 text-[8px] text-rift-muted/50 max-w-[14rem] leading-relaxed">
          Split and international outcomes will appear here as each phase completes.
        </p>
      )}
    </div>
  );
}

function simResultCardKey(entry: SimResultEntry): string {
  switch (entry.kind) {
    case "split":
      return `split-${entry.seasonId}-${entry.split}`;
    case "intl":
      return `intl-${entry.seasonId}-${entry.event}`;
    case "year":
      return `year-${entry.seasonId}`;
    case "roster-moves":
      return entry.preIntl
        ? `roster-moves-${entry.seasonId}-pre-${entry.afterEvent}`
        : `roster-moves-${entry.seasonId}-${entry.afterEvent}`;
  }
}

const SimResultCard = memo(function SimResultCard({
  entry,
  dense,
}: {
  entry: SimResultEntry;
  dense: boolean;
}) {
  switch (entry.kind) {
    case "split":
      return <SplitCard entry={entry} dense={dense} />;
    case "intl":
      return <IntlCard entry={entry} dense={dense} />;
    case "year":
      return <YearCard entry={entry} dense={dense} />;
    case "roster-moves":
      return <RosterMovesCard entry={entry} dense={dense} />;
  }
});

const SimTeamName = memo(function SimTeamName({
  team,
  className = "",
  logoSize = 11,
  rosterSnap,
}: {
  team: SimResultTeamRef;
  className?: string;
  logoSize?: number;
  /** Historical roster snapshot — shown on hover instead of the live roster. */
  rosterSnap?: SimRosterPlayer[];
}) {
  const hint = useMemo(
    () => ({
      name: team.name,
      leagueId: team.leagueId,
      iconKey: team.iconKey,
      logoUrl: team.logoUrl,
      color: team.color,
      ...(rosterSnap !== undefined
        ? { players: rosterSnap as unknown as Roster }
        : {}),
    }),
    [
      team.name,
      team.leagueId,
      team.iconKey,
      team.logoUrl,
      team.color,
      rosterSnap,
    ],
  );

  if (rosterSnap !== undefined && rosterSnap.length === 0) {
    return <span title="Historical roster unavailable" className={`min-w-0 truncate inline-flex items-center gap-1 ${className}`}>
      <TeamIcon iconKey={team.iconKey} logoUrl={team.logoUrl} color={team.color} size={logoSize} />
      {team.name}
    </span>;
  }

  return (
    <TeamNameLink
      teamId={team.id}
      name={team.name}
      leagueId={team.leagueId}
      iconKey={team.iconKey}
      logoUrl={team.logoUrl}
      color={team.color}
      logoSize={logoSize}
      renderAs="span"
      hint={hint}
      className={`min-w-0 truncate inline-flex items-center gap-1 ${className}`}
    />
  );
});

function EntryHeader({
  year,
  label,
  icon,
}: {
  year: number;
  label: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5 min-w-0">
      <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 tabular-nums flex-shrink-0">
        Y{year}
      </span>
      <span className="text-rift-gold/40 flex-shrink-0" aria-hidden>
        ·
      </span>
      {icon}
      <span className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/75 truncate">
        {label}
      </span>
    </div>
  );
}

function PlacementRow({
  rank,
  team,
  logoSize,
  highlight = false,
  snapshots,
}: {
  rank: number;
  team: SimResultTeamRef;
  logoSize: number;
  highlight?: boolean;
  snapshots?: SimRosterSnapshots;
}) {
  return (
    <div
      className={`flex items-center gap-1 min-w-0 ${
        highlight ? "text-rift-goldbright" : "text-rift-mutedbright/85"
      }`}
    >
      <span className="w-3.5 flex-shrink-0 tabular-nums text-[8px] text-rift-muted/55">
        {rank}.
      </span>
      <SimTeamName
        team={team}
        logoSize={logoSize}
        className={highlight ? "text-rift-goldbright font-display tracking-wide" : ""}
        rosterSnap={snapshots?.[team.id] ?? []}
      />
      {rank === 1 && (
        <IconTrophy size={10} stroke={1.6} className="text-rift-gold/70 flex-shrink-0" aria-hidden />
      )}
    </div>
  );
}

const SplitCard = memo(function SplitCard({
  entry,
  dense,
}: {
  entry: SimSplitResultEntry;
  dense: boolean;
}) {
  const logoSize = dense ? 10 : 11;
  const topN = dense ? 2 : 4;
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(
    () => new Set(),
  );

  return (
    <div className="border border-rift-line/35 bg-rift-bg/40 px-2.5 py-2">
      <EntryHeader
        year={entry.year}
        label={entry.label}
        icon={<SplitIcon split={entry.split} />}
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2">
        {entry.leagues.map(({ leagueId, placements }) => (
          <div key={leagueId} className="min-w-0">
            <div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.2em] text-rift-muted/60 mb-0.5">
              <LeagueIcon league={leagueId} size={11} />
              {leagueId}
            </div>
            <div className="space-y-0.5">
              {placements.slice(0, expandedLeagues.has(leagueId) ? placements.length : topN).map((team, i) => (
                <PlacementRow
                  key={team.id}
                  rank={i + 1}
                  team={team}
                  logoSize={logoSize}
                  highlight={i === 0}
                  snapshots={entry.rosterSnapshots}
                />
              ))}
              {placements.length > topN && (
                <button
                  type="button"
                  aria-expanded={expandedLeagues.has(leagueId)}
                  aria-label={`${expandedLeagues.has(leagueId) ? "Show fewer" : "Show all"} ${leagueId} teams in ${entry.label}, year ${entry.year}`}
                  onClick={() => setExpandedLeagues((previous) => {
                    const next = new Set(previous);
                    if (next.has(leagueId)) next.delete(leagueId);
                    else next.add(leagueId);
                    return next;
                  })}
                  className="text-[7px] text-rift-muted/55 pl-3.5 hover:text-rift-goldbright/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-rift-gold transition-colors"
                >
                  {expandedLeagues.has(leagueId)
                    ? "Show less"
                    : `+${placements.length - topN} more`}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const IntlCard = memo(function IntlCard({
  entry,
  dense,
}: {
  entry: SimIntlResultEntry;
  dense: boolean;
}) {
  const logoSize = dense ? 10 : 11;
  const visible = dense ? entry.placements.slice(0, 4) : entry.placements;
  const showAll = !dense || entry.placements.length <= 4;

  return (
    <div className="border border-rift-line/35 bg-rift-bg/40 px-2.5 py-2">
      <EntryHeader
        year={entry.year}
        label={entry.label}
        icon={<LeagueIcon league={entry.event} size={14} />}
      />
      {entry.mvp && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[8px] text-rift-goldbright">
          <span className="uppercase tracking-[0.15em] text-rift-gold/70">MVP</span>
          <LaneIcon lane={entry.mvp.lane} size="xs" />
          <PlayerNameLink
            playerId={entry.mvp.playerId}
            name={entry.mvp.playerName ?? entry.mvp.displayName}
            seasonId={entry.seasonId}
            className="font-display min-w-0 truncate"
          />
          <span className="text-rift-mutedbright/70">{entry.mvp.teamName}</span>
          <span
            className="text-rift-muted/60 tabular-nums"
            title={`Average rating across ${entry.mvp.gamesPlayed} rated games`}
          >
            {entry.mvp.avgRating.toFixed(1)} rating
          </span>
        </div>
      )}
      <ol className="space-y-0.5">
        {visible.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-1.5 min-w-0 ${
              p.rank === 1
                ? "text-rift-goldbright"
                : p.rank <= 3
                  ? "text-rift-mutedbright"
                  : "text-rift-mutedbright/75"
            }`}
          >
            <span className="w-4 flex-shrink-0 tabular-nums text-rift-muted/60">
              {p.rank}.
            </span>
            <LeagueIcon league={p.leagueId} size={11} />
            <SimTeamName
              team={p}
              logoSize={logoSize}
              className={p.rank === 1 ? "text-rift-goldbright" : ""}
              rosterSnap={entry.rosterSnapshots?.[p.id] ?? []}
            />
            {p.rank === 1 && (
              <IconTrophy size={10} stroke={1.6} className="text-rift-gold/70 flex-shrink-0" aria-hidden />
            )}
          </li>
        ))}
        {!showAll && entry.placements.length > visible.length && (
          <li className="text-[8px] text-rift-muted/50 pl-5">
            +{entry.placements.length - visible.length} more (
            {entry.placements.length} total)
          </li>
        )}
      </ol>
    </div>
  );
});

function SplitWinnersGrid({
  splits,
  dense,
  logoSize,
  champIndex,
}: {
  splits: SimSplitResultEntry[];
  dense: boolean;
  logoSize: number;
  champIndex: Map<string, SimResultTeamRef>;
}) {
  if (splits.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/50 mb-1">
        Split winners
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[16rem] border-collapse text-[8px]">
          <thead>
            <tr className="text-rift-muted/55 uppercase tracking-[0.15em]">
              <th className="text-left py-0.5 pr-2 font-normal">League</th>
              {splits.map((s) => (
                <th key={s.split} className="text-left py-0.5 px-1 font-normal">
                  <span className="inline-flex items-center gap-0.5">
                    <SplitIcon split={s.split} size={10} />
                    {!dense && (
                      <span className="hidden sm:inline">{SPLIT_LABELS[s.split].replace(" Split", "")}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEAGUE_IDS.map((leagueId) => (
              <tr key={leagueId} className="border-t border-rift-line/20">
                <td className="py-0.5 pr-2 text-rift-muted/60">
                  <span className="inline-flex items-center gap-1">
                    <LeagueIcon league={leagueId} size={10} />
                    {leagueId}
                  </span>
                </td>
                {splits.map((splitEntry) => {
                  const champ = champIndex.get(`${splitEntry.split}:${leagueId}`);
                  return (
                    <td key={splitEntry.split} className="py-0.5 px-1 min-w-0 max-w-[5.5rem]">
                      {champ ? (
                        <SimTeamName
                          team={champ}
                          logoSize={logoSize}
                          className="text-rift-goldbright/90"
                          rosterSnap={splitEntry.rosterSnapshots?.[champ.id] ?? []}
                        />
                      ) : (
                        <span className="text-rift-muted/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FollowedTeamSummary({
  summary,
  logoSize,
}: {
  summary: SimFollowedTeamSummary;
  logoSize: number;
}) {
  const splitKeys = (Object.keys(summary.splits) as SplitId[]).sort();
  const intlKeys = (Object.keys(summary.intls) as InternationalId[]).sort();

  return (
    <div className="mt-2 pt-2 border-t border-rift-gold/20">
      <div className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/50 mb-1">
        Your team
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <SimTeamName
          team={summary.team}
          logoSize={logoSize}
          className="text-rift-goldbright font-display tracking-wide"
        />
        <LeagueIcon league={summary.team.leagueId} size={11} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[8px] text-rift-mutedbright/80">
        {splitKeys.map((split) => (
          <span key={split} className="inline-flex items-center gap-1">
            <SplitIcon split={split} size={10} />
            {SPLIT_LABELS[split].replace(" Split", "")}:{" "}
            <span className="tabular-nums text-rift-gold/80">
              #{summary.splits[split]}
            </span>
          </span>
        ))}
        {intlKeys.map((event) => (
          <span key={event} className="inline-flex items-center gap-1">
            <LeagueIcon league={event} size={10} />
            {INTERNATIONAL_LABELS[event]}:{" "}
            <span className="tabular-nums text-rift-gold/80">
              #{summary.intls[event]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const YearCard = memo(function YearCard({
  entry,
  dense,
}: {
  entry: SimYearResultEntry;
  dense: boolean;
}) {
  const logoSize = dense ? 10 : 11;
  const worldsRosterSnap = useMemo(() => {
    if (!entry.worldsChampion) return undefined;
    return entry.intls.find((i) => i.event === "worlds")?.rosterSnapshots?.[
      entry.worldsChampion.id
    ];
  }, [entry.intls, entry.worldsChampion]);
  const splitChampIndex = useMemo(() => {
    const index = new Map<string, SimResultTeamRef>();
    for (const splitEntry of entry.splits) {
      for (const league of splitEntry.leagues) {
        const champ = league.placements[0];
        if (champ) index.set(`${splitEntry.split}:${league.leagueId}`, champ);
      }
    }
    return index;
  }, [entry.splits]);

  return (
    <div className="border-2 border-rift-gold/45 bg-rift-gold/[0.08] px-2.5 py-2">
      <EntryHeader
        year={entry.year}
        label="Season Complete"
        icon={
          <IconTrophy size={14} stroke={1.6} className="text-rift-goldbright flex-shrink-0" aria-hidden />
        }
      />

      {entry.worldsChampion && (
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-rift-goldbright mb-2 min-w-0">
          <LeagueIcon league="worlds" size={13} />
          <span className="flex-shrink-0 uppercase tracking-[0.15em] text-[8px]">
            Worlds
          </span>
          <SimTeamName
            team={entry.worldsChampion}
            logoSize={logoSize}
            className="text-rift-goldbright"
            rosterSnap={worldsRosterSnap ?? []}
          />
          <span className="text-rift-muted/60 flex-shrink-0 inline-flex items-center gap-0.5">
            (<LeagueIcon league={entry.worldsChampion.leagueId} size={10} />
            {entry.worldsChampion.leagueId})
          </span>
        </div>
      )}

      <SplitWinnersGrid
        splits={entry.splits}
        dense={dense}
        logoSize={logoSize}
        champIndex={splitChampIndex}
      />

      {entry.intls.length > 0 && (
        <div className="mb-1">
          <div className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/50 mb-1">
            International champions
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {entry.intls.map((intl) => (
              <span
                key={intl.event}
                className="inline-flex items-center gap-1 min-w-0 text-[8px]"
              >
                <LeagueIcon league={intl.event} size={11} />
                <span className="text-rift-muted/60 flex-shrink-0">
                  {intl.label}:
                </span>
                {intl.placements[0] ? (
                  <SimTeamName
                    team={intl.placements[0]}
                    logoSize={logoSize}
                    rosterSnap={intl.rosterSnapshots?.[intl.placements[0].id] ?? []}
                  />
                ) : (
                  "—"
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {entry.followedTeam && (
        <FollowedTeamSummary summary={entry.followedTeam} logoSize={logoSize} />
      )}
    </div>
  );
});

function rosterMoveKey(move: SimRosterMoveSummary, index: number): string {
  const playerKey =
    move.swapId ??
    move.starId ??
    move.swapName ??
    move.starName ??
    move.swapTier ??
    move.starTier;
  return `${move.lane}:${move.fromTeam.id}:${move.toTeam.id}:${move.kind ?? "swap"}:${playerKey}:${index}`;
}

const SimMovePlayer = memo(function SimMovePlayer({
  playerId,
  name,
  tier,
  lane,
  tone = "neutral",
}: {
  playerId?: string;
  name?: string;
  tier: PlayerTier;
  lane: Lane;
  tone?: "out" | "in" | "neutral";
}) {
  const displayName = name?.trim();
  const hint = useMemo(
    () =>
      playerId || displayName
        ? {
            player: {
              ...(playerId ? { id: playerId } : {}),
              name: displayName ?? "Unknown",
              lane,
              tier,
              goodChamps: [],
              badChamps: [],
            },
            lane,
          }
        : undefined,
    [displayName, lane, playerId, tier],
  );
  const nameCls =
    tone === "out"
      ? "text-rift-muted/60"
      : tone === "in"
        ? "text-rift-goldbright/75"
        : "text-rift-mutedbright/80";

  if (!displayName && !playerId) {
    return <TierChip tier={tier} size="xs" />;
  }

  return (
    <span className="inline-flex items-center gap-0.5 min-w-0 max-w-[4.5rem]">
      <PlayerNameLink
        playerId={playerId}
        name={displayName ?? "Unknown"}
        hint={hint}
        renderAs="span"
        className={`truncate text-[7px] cursor-pointer ${nameCls}`}
      />
      <TierChip tier={tier} size="xs" />
    </span>
  );
});

const RosterMoveRow = memo(function RosterMoveRow({
  move,
  logoSize,
}: {
  move: SimRosterMoveSummary;
  logoSize: number;
}) {
  const isInbound = move.kind === "callup" || move.kind === "fa-sign";
  const isExit = move.kind === "retire" || move.kind === "demotion" || move.kind === "release";

  return (
    <div className="flex items-center gap-1 min-w-0 text-[8px] text-rift-mutedbright/75">
      <LaneIcon lane={move.lane} size="xs" className="flex-shrink-0 opacity-60" />

      {isExit ? (
        <>
          <SimTeamName team={move.fromTeam} logoSize={logoSize} />
          <SimMovePlayer
            playerId={move.swapId}
            name={move.swapName}
            tier={move.swapTier}
            lane={move.lane}
            tone="out"
          />
          <span className="text-rift-gold/30 flex-shrink-0 text-[9px]" aria-hidden>→</span>
          <span
            className={`px-1 py-px border text-[7px] uppercase tracking-[0.1em] flex-shrink-0 ${
              move.kind === "retire"
                ? "border-red-400/40 text-red-300/70 bg-red-400/[0.05]"
                : move.kind === "release"
                  ? "border-rift-blue/40 text-rift-bluebright/85 bg-rift-blue/[0.06]"
                  : "border-amber-500/40 text-amber-300/75 bg-amber-500/[0.05]"
            }`}
          >
            {move.kind === "retire" ? "RET" : move.kind === "release" ? "FA" : "ACY"}
          </span>
        </>
      ) : isInbound ? (
        <>
          <SimTeamName team={move.toTeam} logoSize={logoSize} />
          {move.swapName || move.swapId ? (
            <>
              <SimMovePlayer
                playerId={move.swapId}
                name={move.swapName}
                tier={move.swapTier}
                lane={move.lane}
                tone="out"
              />
              <span className="text-rift-gold/30 flex-shrink-0 text-[9px]" aria-hidden>→</span>
            </>
          ) : null}
          <span
            className={`px-1 py-px border text-[7px] uppercase tracking-[0.1em] flex-shrink-0 ${
              move.kind === "callup"
                ? "border-sky-500/40 text-sky-300/85 bg-sky-500/[0.06]"
                : "border-rift-blue/40 text-rift-bluebright/85 bg-rift-blue/[0.06]"
            }`}
          >
            {move.kind === "callup" ? "ACY" : "FA"}
          </span>
          <SimMovePlayer
            playerId={move.starId}
            name={move.starName}
            tier={move.starTier}
            lane={move.lane}
            tone="in"
          />
        </>
      ) : (
        <>
          <SimTeamName team={move.fromTeam} logoSize={logoSize} />
          <SimMovePlayer
            playerId={move.swapId}
            name={move.swapName}
            tier={move.swapTier}
            lane={move.lane}
            tone="out"
          />
          <span className="text-rift-gold/30 flex-shrink-0 text-[9px]" aria-hidden>
            ⇄
          </span>
          <SimTeamName team={move.toTeam} logoSize={logoSize} />
          <SimMovePlayer
            playerId={move.starId}
            name={move.starName}
            tier={move.starTier}
            lane={move.lane}
            tone="in"
          />
        </>
      )}
    </div>
  );
});

const CoachMoveRow = memo(function CoachMoveRow({
  move,
  logoSize,
}: {
  move: SimCoachMoveSummary;
  logoSize: number;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0 text-[8px] text-rift-mutedbright/75">
      <span className="px-1 py-px border border-rift-gold/35 text-rift-gold/75 text-[7px] uppercase tracking-[0.1em] flex-shrink-0">
        Coach
      </span>
      <SimTeamName team={move.fromTeam} logoSize={logoSize} />
      <span className="text-rift-gold/30 flex-shrink-0 text-[9px]" aria-hidden>→</span>
      <SimTeamName team={move.toTeam} logoSize={logoSize} />
      <CoachNameLink
        name={move.coachName}
        renderAs="span"
        className="truncate text-[7px] text-rift-goldbright/85"
      />
      <span className="text-[7px] tabular-nums text-rift-muted/70 flex-shrink-0">{move.rating.toFixed(1)}★</span>
    </div>
  );
});

const ROSTER_MOVES_DEFAULT_VISIBLE = 5;

const RosterMovesCard = memo(function RosterMovesCard({
  entry,
  dense,
}: {
  entry: SimRosterMovesEntry;
  dense: boolean;
}) {
  const logoSize = dense ? 10 : 11;
  const [expanded, setExpanded] = useState(false);
  const hasMore = entry.moves.length > ROSTER_MOVES_DEFAULT_VISIBLE;
  const visibleMoves = useMemo(
    () =>
      expanded || !hasMore
        ? entry.moves
        : entry.moves.slice(0, ROSTER_MOVES_DEFAULT_VISIBLE),
    [entry.moves, expanded, hasMore],
  );

  // Pre-intl entries use a subtler amber border to distinguish them from the
  // post-intl transfer window entries (which use the default rift-line border).
  const borderClass = entry.preIntl
    ? "border border-amber-500/20 bg-amber-500/[0.03]"
    : "border border-rift-line/22 bg-rift-bg/25";
  const cardLabel = entry.preIntl
    ? `${PRE_INTL_LABEL[entry.afterEvent] ?? entry.label} · Roster Moves`
    : `${entry.label} · Roster Moves`;

  return (
    <div className={`px-2.5 py-1.5 ${borderClass}`}>
      <EntryHeader
        year={entry.year}
        label={cardLabel}
        icon={
          <span
            className={`text-[10px] flex-shrink-0 ${entry.preIntl ? "text-amber-400/55" : "text-rift-muted/50"}`}
            aria-hidden
          >
            {entry.preIntl ? "↓" : "⇄"}
          </span>
        }
      />
      <div className="space-y-0.5">
        {entry.coaches?.map((move) => (
          <CoachMoveRow
            key={`coach-${move.coachId ?? move.coachName}`}
            move={move}
            logoSize={logoSize}
          />
        ))}
        {visibleMoves.map((move, i) => (
          <RosterMoveRow
            key={rosterMoveKey(move, i)}
            move={move}
            logoSize={logoSize}
          />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-[7px] text-rift-muted/55 pl-5 hover:text-rift-goldbright/80 transition-colors uppercase tracking-[0.15em]"
          >
            {expanded
              ? "Show less"
              : `Show all ${entry.moves.length} moves`}
          </button>
        )}
      </div>
    </div>
  );
});
