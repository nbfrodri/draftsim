import type {
  TeamCardTitleCounts,
  TeamCardWinRates,
  TeamSeriesWinLoss,
} from "@/lib/season/teamCard";
import {
  liveTeamWinRates,
  liveTitleCounts,
} from "@/lib/season/teamCard";
import type { SeasonState, SeasonTeam } from "@/lib/season/types";

export interface LiveTeamStats {
  winRates: TeamCardWinRates;
  titles: TeamCardTitleCounts;
}

/** Batch season-wide series W-L + title counts for every team. */
export function buildLiveTeamStatsMap(
  season: SeasonState,
  teams: readonly SeasonTeam[] = season.teams,
): Map<string, LiveTeamStats> {
  const m = new Map<string, LiveTeamStats>();
  for (const t of teams) {
    m.set(t.id, {
      winRates: liveTeamWinRates(season, t.id),
      titles: liveTitleCounts(season, t),
    });
  }
  return m;
}

export function seriesPctLabel(rate: number | null | undefined): string {
  return rate != null ? `${Math.round(rate * 100)}%` : "—";
}

export function seriesWlLabel(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

/** Compact "67% · 12-6" — always visible; early season is "— · 0-0". */
export function formatSeriesCompact(wl: TeamSeriesWinLoss): string {
  return `${seriesPctLabel(wl.winRate)} · ${seriesWlLabel(wl.wins, wl.losses)}`;
}

/** Inline season series record — scannable W-L + win%. */
export function TeamSeriesBadge({
  overall,
  className = "",
}: {
  overall: TeamSeriesWinLoss;
  className?: string;
}) {
  const label = formatSeriesCompact(overall);
  return (
    <span
      className={`tabular-nums text-[9px] text-rift-muted/70 flex-shrink-0 ${className}`}
      title={`Season series record: ${seriesWlLabel(overall.wins, overall.losses)} (${seriesPctLabel(overall.winRate)})`}
    >
      {label}
    </span>
  );
}

/** Compact title chips — split / intl (worlds counted in intl). Shows "—" when none. */
export function TeamTitlesBadge({
  titles,
  className = "",
}: {
  titles: TeamCardTitleCounts;
  className?: string;
}) {
  if (titles.total <= 0) {
    return (
      <span
        className={`text-[8px] text-rift-muted/45 flex-shrink-0 ${className}`}
        title="No titles this season yet"
      >
        —
      </span>
    );
  }
  const parts: string[] = [];
  if (titles.split > 0) parts.push(`S${titles.split}`);
  if (titles.intl > 0) {
    parts.push(
      titles.worlds > 0 && titles.worlds === titles.intl
        ? `W${titles.worlds}`
        : titles.worlds > 0
          ? `I${titles.intl}·W${titles.worlds}`
          : `I${titles.intl}`,
    );
  }
  const tip = [
    titles.split > 0 ? `${titles.split} split` : null,
    titles.intl > 0 ? `${titles.intl} intl` : null,
    titles.worlds > 0 ? `${titles.worlds} Worlds` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[8px] uppercase tracking-[0.12em] text-rift-gold/75 flex-shrink-0 ${className}`}
      title={`Titles this season: ${tip}`}
    >
      {parts.map((p) => (
        <span
          key={p}
          className="px-1 py-px border border-rift-gold/25 tabular-nums"
        >
          {p}
        </span>
      ))}
    </span>
  );
}

/** Series record + optional title chips in one inline cluster. Always visible when stats exist. */
export function TeamLiveStatsInline({
  stats,
  showTitles = true,
  className = "",
}: {
  stats: LiveTeamStats | undefined;
  showTitles?: boolean;
  className?: string;
}) {
  if (!stats) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 flex-shrink-0 ${className}`}
    >
      <TeamSeriesBadge overall={stats.winRates.overall} />
      {showTitles && <TeamTitlesBadge titles={stats.titles} />}
    </span>
  );
}
