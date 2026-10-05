"use client";

import { IconTrophy } from "@tabler/icons-react";
import { memo, useMemo, useState, type ReactNode } from "react";

import LeagueIcon from "@/components/LeagueIcon";
import CareerHistoryControls, { type CareerEvent } from "@/components/hall/CareerHistoryControls";
import RosterSnapshotCards from "@/components/hall/RosterSnapshotCards";
import GoToSeasonButton from "@/components/hall/GoToSeasonButton";
import SplitIcon from "@/components/season/SplitIcon";
import {
  intlOutcomeLabel,
  splitPlacementLabel,
  type IntlOutcome,
} from "@/lib/season/placements";
import type { TeamSeasonLine } from "@/lib/season/historySearch";
import {
  INTERNATIONAL_LABELS,
  SPLIT_LABELS,
  type InternationalId,
  type SplitId,
} from "@/lib/season/types";

const SPLIT_ORDER: readonly SplitId[] = ["winter", "spring", "summer"];

const SPLIT_SHORT: Record<SplitId, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

/** Calendar order: split → its international, through the competitive year. */
const PHASE_ORDER: ReadonlyArray<
  { kind: "split"; id: SplitId } | { kind: "intl"; id: InternationalId }
> = [
  { kind: "split", id: "winter" },
  { kind: "intl", id: "first-stand" },
  { kind: "split", id: "spring" },
  { kind: "intl", id: "msi" },
  { kind: "split", id: "summer" },
  { kind: "intl", id: "worlds" },
  { kind: "intl", id: "global-cup" },
];

type ChipTone = "champion" | "finalist" | "placed" | "exit" | "dnq";

const CHIP_TONE_CLS: Record<ChipTone, string> = {
  champion:
    "border-rift-gold/55 bg-rift-gold/10 text-rift-goldbright shadow-[inset_0_0_0_1px_rgba(200,170,110,0.12)]",
  finalist:
    "border-rift-gold/45 bg-rift-gold/[0.08] text-rift-goldbright/90 shadow-[inset_0_0_0_1px_rgba(200,170,110,0.08)]",
  placed: "border-rift-line/40 bg-rift-bg/20 text-rift-mutedbright",
  exit: "border-rift-line/30 bg-rift-bg/10 text-rift-muted/65",
  dnq: "border-rift-red/35 bg-rift-red/[0.06] text-rift-redbright/85",
};

function splitTone(placement: number, champion: boolean): ChipTone {
  if (champion || placement === 1) return "champion";
  if (placement === 2) return "finalist";
  if (placement <= 4) return "placed";
  return "exit";
}

function intlTone(outcome: IntlOutcome, champion: boolean): ChipTone {
  if (champion || outcome.kind === "champion") return "champion";
  if (outcome.kind === "finalist") return "finalist";
  if (outcome.kind === "did-not-qualify") return "dnq";
  if (outcome.placement != null && outcome.placement <= 4) return "placed";
  return "exit";
}

function ResultChip({
  icon,
  label,
  result,
  tone,
  title,
}: {
  icon: ReactNode;
  label: string;
  result: string;
  tone: ChipTone;
  title: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] ${CHIP_TONE_CLS[tone]}`}
      title={title}
      aria-label={`${label}: ${result}`}
    >
      {icon}
      <span className="hidden sm:inline max-w-[4.5rem] truncate">{label}</span>
      <span className="tabular-nums font-display tracking-normal">
        {result}
      </span>
      {tone === "champion" && (
        <IconTrophy
          size={9}
          stroke={1.6}
          className="text-rift-gold/75 flex-shrink-0"
          aria-hidden
        />
      )}
    </span>
  );
}

function teamSeasonChips(season: TeamSeasonLine) {
  const chips: { scope: SplitId | InternationalId; chip: ReactNode }[] = [];
  const addChip = (scope: SplitId | InternationalId, chip: ReactNode) =>
    chips.push({ scope, chip });

  for (const phase of PHASE_ORDER) {
    if (phase.kind === "split") {
      const placement = season.splitPlacements[phase.id];
      if (placement == null) continue;
      const champion = season.splitTitles.includes(phase.id);
      const label = SPLIT_SHORT[phase.id];
      addChip(
        phase.id,
        <ResultChip
          key={`sp-${phase.id}`}
          icon={<SplitIcon split={phase.id} size={12} />}
          label={label}
          result={splitPlacementLabel(placement)}
          tone={splitTone(placement, champion)}
          title={`${SPLIT_LABELS[phase.id]} · ${splitPlacementLabel(placement)}${champion ? " · Champion" : ""}`}
        />,
      );
      continue;
    }

    const outcome = season.intlOutcomes[phase.id];
    if (!outcome) continue;
    const champion =
      season.intlTitles.includes(phase.id) || outcome.kind === "champion";
    const label = INTERNATIONAL_LABELS[phase.id];
    addChip(
      phase.id,
      <ResultChip
        key={`in-${phase.id}`}
        icon={<LeagueIcon league={phase.id} size={12} />}
        label={label}
        result={intlOutcomeLabel(outcome)}
        tone={intlTone(outcome, champion)}
        title={`${label} · ${intlOutcomeLabel(outcome)}${champion ? " · Champion" : ""}`}
      />,
    );
  }

  if (
    season.worlds === "champion" &&
    !season.intlTitles.includes("worlds") &&
    !season.intlOutcomes.worlds
  ) {
    addChip(
      "worlds",
      <ResultChip
        key="worlds-legacy"
        icon={<LeagueIcon league="worlds" size={12} />}
        label={INTERNATIONAL_LABELS.worlds}
        result="#1"
        tone="champion"
        title={`${INTERNATIONAL_LABELS.worlds} · World Champion`}
      />,
    );
  } else if (season.worlds === "finalist" && !season.intlOutcomes.worlds) {
    addChip(
      "worlds",
      <ResultChip
        key="worlds-finalist-legacy"
        icon={<LeagueIcon league="worlds" size={12} />}
        label={INTERNATIONAL_LABELS.worlds}
        result="#2"
        tone="finalist"
        title={`${INTERNATIONAL_LABELS.worlds} · Finalist`}
      />,
    );
  }

  return chips;
}

const TeamSeasonRow = memo(function TeamSeasonRow({ season, chips, highlighted, onGoToSeason }: {
  season: TeamSeasonLine;
  chips: ReturnType<typeof teamSeasonChips>;
  highlighted: ReadonlySet<CareerEvent>;
  onGoToSeason?: (seasonId: string) => void;
}) {
  const empty = chips.length === 0;

  return (
    <div role="group" aria-label={`${season.season} results history`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border border-rift-line/25 bg-rift-bg/15 px-2.5 py-1.5">
      <div className="flex items-center gap-1 flex-shrink-0">
        <span
          className="text-[10px] font-display text-rift-mutedbright tabular-nums whitespace-nowrap"
          title={season.season}
        >
          {season.season.replace(/^Year\s+/i, "Y")}
        </span>
        <GoToSeasonButton
          seasonId={season.seasonId}
          seasonLabel={season.season}
          onGoToSeason={onGoToSeason}
          title={`View ${season.season} in stage rosters`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
        {empty ? (
          <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/40">
            No recorded results
          </span>
        ) : (
          chips.map(({ chip, scope }) => {
            const stages = season.stages.filter(
              (stage) => stage.split === scope || stage.event === scope,
            );
            return (
              <details key={scope} className="group open:w-full">
                <summary data-career-event={scope} data-highlighted={highlighted.has(scope) ? "true" : undefined}
                  className="inline-flex cursor-pointer list-none items-center gap-1 border border-transparent px-0.5 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold data-[highlighted=true]:border-rift-gold/80 data-[highlighted=true]:bg-rift-gold/10 data-[highlighted=true]:shadow-[0_0_12px_rgba(200,170,110,0.3)]">
                  {chip}
                  <span aria-hidden className="text-[9px] text-rift-gold/60">
                    ▾
                  </span>
                </summary>
                <div className="my-2 space-y-2">
                  {stages.length ? (
                    stages.map((stage, i) => (
                      <RosterSnapshotCards
                        key={i}
                        seasonId={season.seasonId}
                        phaseScope={stage.split ?? stage.event}
                        label={stage.label}
                        roster={stage.roster}
                        team={stage.team}
                        coach={stage.coach}
                      />
                    ))
                  ) : (
                    <RosterSnapshotCards seasonId={season.seasonId} label={scope} />
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
});

export default function TeamSeasonResultsHistory({
  seasons,
  onGoToSeason,
}: {
  seasons: TeamSeasonLine[];
  onGoToSeason?: (seasonId: string) => void;
}) {
  const rows = useMemo(() => seasons.map(season => ({ season, chips: teamSeasonChips(season) })), [seasons]);
  const [highlighted, setHighlighted] = useState<Set<CareerEvent>>(() => new Set());
  const [range, setRange] = useState({ from: "", to: "" });
  const choices = useMemo(() => [...seasons].reverse().map(s => ({ id: s.seasonId, label: s.season })), [seasons]);
  const fromIndex = Math.max(0, choices.findIndex(s => s.id === range.from));
  const toIndex = range.to ? choices.findIndex(s => s.id === range.to) : choices.length - 1;
  const visibleIds = new Set(choices.slice(fromIndex, (toIndex < 0 ? choices.length - 1 : toIndex) + 1).map(s => s.id));
  const visibleRows = rows.filter(row => visibleIds.has(row.season.seasonId));
  const matches = visibleRows.reduce((count, row) => count + row.chips.filter(chip => highlighted.has(chip.scope)).length, 0);
  if (seasons.length === 0) return null;

  return (
    <section aria-label="Results History">
      <h3 className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-2">
        Results History
      </h3>
      <CareerHistoryControls seasons={choices} from={range.from} to={range.to}
        onFrom={from => setRange(current => ({ from, to: from && choices.findIndex(s => s.id === from) > toIndex ? from : current.to }))}
        onTo={to => setRange(current => ({ to, from: to && choices.findIndex(s => s.id === to) < fromIndex ? to : current.from }))}
        onAllSeasons={() => setRange({ from: "", to: "" })}
        selected={highlighted} onToggle={event => setHighlighted(current => {
          const next = new Set(current); if (next.has(event)) next.delete(event); else next.add(event); return next;
        })} onClear={() => setHighlighted(new Set())} matches={matches} visibleSeasons={visibleRows.length} />
      <div className="space-y-1">
        {visibleRows.map(({ season: s, chips }) => (
          <TeamSeasonRow
            key={`${s.seasonId}-${s.archivedAt}`}
            season={s}
            chips={chips}
            highlighted={highlighted}
            onGoToSeason={onGoToSeason}
          />
        ))}
      </div>
    </section>
  );
}

export { SPLIT_ORDER, SPLIT_SHORT, PHASE_ORDER };
