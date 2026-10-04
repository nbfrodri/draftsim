"use client";

import { useId, useMemo, useState } from "react";
import LeagueIcon from "@/components/LeagueIcon";
import TeamNameLink from "@/components/team/TeamNameLink";
import {
  CHAMPIONSHIP_POINT_STAGES, championshipPointsRows, rankChampionshipPoints,
  type ChampionshipPointStage, type ChampionshipPointsRow,
} from "@/lib/season/championshipPoints";
import { LEAGUE_IDS, type SeasonState } from "@/lib/season/types";

const LABELS: Record<ChampionshipPointStage, string> = {
  winter: "Winter", "first-stand": "First Stand", spring: "Spring", msi: "MSI", summer: "Summer",
};

export function LiveChampionshipPointsPanel({ season }: { season: SeasonState }) {
  const rows = useMemo(() => championshipPointsRows({
    teams: season.teams, splitResults: season.splitResults, intlResults: season.intlResults,
  }), [season.teams, season.splitResults, season.intlResults]);
  return <ChampionshipPointsPanel rows={rows} />;
}

export default function ChampionshipPointsPanel({ rows, seasonId, archived = false }: {
  rows?: readonly ChampionshipPointsRow[];
  seasonId?: string;
  archived?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const regions = useMemo(() => LEAGUE_IDS.map(league => ({
    league, teams: rankChampionshipPoints((rows ?? []).filter(row => row.team.leagueId === league)),
  })), [rows]);
  return (
    <section aria-label="Championship points" className="mb-7 border border-rift-gold/30 bg-rift-bg/30">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-rift-gold/[0.05] transition-colors">
        <LeagueIcon league="worlds" size={20} />
        <span className="font-display text-[12px] text-rift-goldbright">Championship Points</span>
        <span className="text-[10px] text-rift-mutedbright/70">Worlds qualification</span>
        <span className="ml-auto text-rift-gold/70" aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && <div id={bodyId} className="border-t border-rift-line/30 p-3">
        {rows == null ? <p className="text-[11px] text-rift-mutedbright">Championship points were not recorded for this season.</p> : <>
          <p className="mb-3 text-[10px] leading-relaxed text-rift-mutedbright/80">
            {archived ? "Points recorded when this season was archived." : "Points awarded from completed results so far."}
            {" "}Summer finalists qualify directly; two more teams per region qualify on points. Summer placement breaks points ties.
            {" "}Worlds and Global Cup do not add qualification points.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))" }}>
            {regions.map(({ league, teams }) => <section key={league} aria-label={`${league} championship points`} className="min-w-0 border border-rift-line/40 bg-rift-bg/30">
              <h3 className="flex items-center gap-2 border-b border-rift-line/30 px-2.5 py-2 text-[11px] font-semibold text-rift-goldbright">
                <LeagueIcon league={league} size={18} />{league}
              </h3>
              {teams.length === 0 ? <p className="p-2.5 text-[10px] text-rift-mutedbright">No teams recorded.</p> : <table className="w-full table-fixed text-[10px]">
                <caption className="sr-only">{league} championship points by team and event</caption>
                <colgroup><col className="w-[43%]" />{[...CHAMPIONSHIP_POINT_STAGES, "total"].map(stage => <col key={stage} />)}</colgroup>
                <thead className="text-[8px] text-rift-mutedbright/75">
                  <tr className="border-b border-rift-line/25">
                    <th scope="col" className="px-2 py-2 text-left font-medium">Team</th>
                    {CHAMPIONSHIP_POINT_STAGES.map(stage => <th key={stage} scope="col" title={LABELS[stage]} className="px-1 py-2 text-right font-medium">
                      {stage === "first-stand" ? "FS" : LABELS[stage]}
                    </th>)}
                    <th scope="col" className="px-2 py-2 text-right font-semibold text-rift-goldbright">Total</th>
                  </tr>
                </thead>
                <tbody>{teams.map((row, index) => <tr key={row.teamId} data-testid="championship-points-row" data-team-id={row.teamId}
                  className="border-b border-rift-line/15 last:border-0">
                  <th scope="row" className="px-2 py-1.5 text-left font-normal">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-3 shrink-0 text-[9px] tabular-nums text-rift-mutedbright/50">{index + 1}</span>
                      <TeamNameLink teamId={row.teamId} seasonId={seasonId} name={row.team.name} leagueId={row.team.leagueId}
                        iconKey={row.team.iconKey} color={row.team.color} logoUrl={row.team.logoUrl}
                        logoSize={16} hint={row.team} renderAs="span" className="min-w-0 inline-flex items-center gap-1 truncate text-rift-mutedbright" />
                    </span>
                  </th>
                  {CHAMPIONSHIP_POINT_STAGES.map(stage => <td key={stage} className="px-1 py-1.5 text-right tabular-nums text-rift-mutedbright/80"
                    title={row.stages[stage] == null ? `${LABELS[stage]}: no points recorded` : `${LABELS[stage]}: ${row.stages[stage]} points`}>
                    {row.stages[stage] ?? "—"}
                  </td>)}
                  <td data-testid="championship-points-total" className="px-2 py-1.5 text-right tabular-nums font-semibold text-rift-goldbright">{row.total}</td>
                </tr>)}</tbody>
              </table>}
            </section>)}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-rift-mutedbright/65">
            FS = First Stand. — = no points recorded for that event.
            {!archived && " Qualification badges can also include points already secured in the ongoing Summer playoffs; ≥ marks a minimum that can still increase."}
          </p>
        </>}
      </div>}
    </section>
  );
}
