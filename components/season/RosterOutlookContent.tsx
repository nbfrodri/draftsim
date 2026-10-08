"use client";

import { Fragment, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useDraftStore } from "@/store/draftStore";
import { LANE_ORDER } from "@/lib/players";
import { LEAGUE_IDS, type SeasonState, type SeasonTeam } from "@/lib/season/types";
import { nextRosterWindow, OUTLOOK_LABELS, isOutlookRookie, outlookPercent as percent,
  type OutlookRow, type OutlookStatus, type RosterOutlook } from "@/lib/season/rosterOutlookView";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlaygroundSelect from "../hall/PlaygroundSelect";
import ClearableSearch from "../ClearableSearch";
import RosterStatusBadge from "../player/RosterStatusBadge";
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconRotateClockwise } from "@tabler/icons-react";
import { useRosterOutlook } from "./useRosterOutlook";
import RosterOutlookLoading from "./RosterOutlookLoading";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TierChip from "./TierChip";

const ROLE_LABELS: Record<string, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "Bot", support: "Support" };
const STATUS_LABELS: Record<OutlookStatus, string> = { main: "Main roster", academy: "Academy", "free-agent": "Free agent", retired: "Retired" };
const PAGE_SIZE = 20;
const CONTROL = "inline-flex min-h-8 items-center justify-center gap-1.5 border border-rift-line/70 bg-rift-bg/40 px-3 py-1.5 text-[11px] text-rift-mutedbright transition-colors hover:border-rift-gold/60 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-rift-gold disabled:opacity-40";
const METRICS = ["stay", "transfer", "academy", "main", "free-agent"] as const;
type OutlookSort = typeof METRICS[number] | "movement" | "name";

function TeamMark({ team }: { team?: SeasonTeam }) {
  return team ? <TeamNameLink teamId={team.id} name={team.name} leagueId={team.leagueId}
    iconKey={team.iconKey} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} color={team.color} logoSize={18} /> : null;
}

export default function RosterOutlookContent() {
  const season = useDraftStore(state => state.season)!;
  const champions = useDraftStore(state => state.champions);
  const simulating = useDraftStore(state => !!state.simulating);
  const window = nextRosterWindow(season);
  const hasWindow = window.kind !== "none";
  const { current, retry } = useRosterOutlook(season, champions, hasWindow && !simulating);
  const waiting = simulating ? "Waiting for the current simulation to finish" : !champions.length ? "Waiting for champion data" : undefined;

  return <div className="p-3 md:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[9px] uppercase tracking-[0.2em] text-rift-gold">Next roster window</p>
        <h3 className="mt-1 font-display text-base text-rift-goldbright">{window.label}</h3>
      </div>
      <span className="border border-rift-gold/30 bg-rift-gold/5 px-2 py-1 text-[10px] text-rift-goldbright">Live season · Year {season.franchise?.year ?? 1}</span>
    </div>
    <p className="mt-2 max-w-4xl text-[11px] leading-relaxed text-rift-mutedbright">
      Where today&apos;s players could finish the next window, using current results, rosters and patch. Updates as the season advances.
      {season.config.controlledTeamId ? " Your pending choices are kept open; no manual moves are assumed." : ""}
    </p>
    {!hasWindow ? <p className="mt-3 text-sm text-rift-goldbright">No automatic probabilities are available for this season.</p> :
    <OutlookTable key={season.id} forecast={simulating ? undefined : current?.result} season={season} notice={
    waiting || !current?.error && !current?.result ? <RosterOutlookLoading progress={current?.progress} message={waiting} />
      : current?.error ? <div role="alert" className="mt-4 border border-rift-red/30 bg-rift-red/5 p-5 text-sm text-rift-redbright">
        <p>{current.error}</p><button type="button" className={`${CONTROL} mt-3`} onClick={retry}>Retry forecast</button>
      </div> : null} />}
  </div>;
}

function OutlookTable({ forecast, season, notice }: { forecast?: RosterOutlook; season: SeasonState; notice: ReactNode }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLocaleLowerCase());
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [team, setTeam] = useState("");
  const [lane, setLane] = useState("");
  const [sort, setSort] = useState<OutlookSort>("movement");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const teamById = useMemo(() => new Map(season.teams.map(t => [t.id, t])), [season.teams]);
  const filtered = useMemo(() => forecast ? forecast.rows.filter(row =>
    (!status || row.seat.status === status) && (!region || row.region === region) &&
    (!team || row.seat.teamId === team) && (!lane || row.player.lane === lane) &&
    (!query || (row.player.name ?? "").toLocaleLowerCase().includes(query)),
  ).sort((a, b) => {
    const movement = (row: OutlookRow) => forecast.samples - row.counts.stay - row.counts.unknown;
    const byName = (a.player.name ?? "").localeCompare(b.player.name ?? "");
    const difference = sort === "name" ? byName : sort === "movement" ? movement(a) - movement(b) : a.counts[sort] - b.counts[sort];
    return difference * (direction === "asc" ? 1 : -1) || byName;
  }) : [], [forecast, status, region, team, lane, query, sort, direction]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  const chooseSort = (value: OutlookSort) => { setSort(value); setDirection(value === "name" ? "asc" : "desc"); setPage(0); };
  const sortColumn = (value: OutlookSort) => {
    if (sort === value) { setDirection(value => value === "desc" ? "asc" : "desc"); setPage(0); }
    else chooseSort(value);
  };
  const reset = () => { setSearch(""); setStatus(""); setRegion(""); setTeam(""); setLane(""); chooseSort("movement"); };

  return <>
    <div className="mt-4 grid grid-cols-1 gap-3 border-y border-rift-line/50 bg-rift-bg/30 py-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1.5 text-[10px] text-rift-mutedbright">Player search
        <ClearableSearch aria-label="Search outlook players" clearLabel="Clear outlook player search" name="outlook-player" autoComplete="off" spellCheck={false} placeholder="Search player…" value={search} onValueChange={value => update(setSearch, value)}
          className="min-h-8 border border-rift-line/60 bg-rift-bg px-2.5 py-1.5 text-[11px] text-rift-goldbright focus:border-rift-gold focus:outline-none" />
      </label>
      <PlaygroundSelect label="Roster status" value={status} onChange={value => update(setStatus, value)} options={[
        { value: "", label: "All players" }, ...(["main", "academy", "free-agent"] as const).map(value => ({ value, label: STATUS_LABELS[value] })),
      ]} />
      <PlaygroundSelect label="Outlook teams" value={team} onChange={value => update(setTeam, value)} options={[
        { value: "", label: "All teams / unsigned" }, ...season.teams.filter(t => !region || t.leagueId === region)
          .sort((a, b) => LEAGUE_IDS.indexOf(a.leagueId) - LEAGUE_IDS.indexOf(b.leagueId)).map(t => ({ value: t.id,
            label: `${t.name} (${t.leagueId})`, icon: <TeamIcon iconKey={t.iconKey} logoUrl={resolveTeamLogo(t.name, t.logoUrl)} color={t.color} size={18} /> })),
      ]} />
      <PlaygroundSelect label="Outlook order" value={sort} onChange={value => chooseSort(value as OutlookSort)} options={[
        { value: "movement", label: "Most likely to move" }, { value: "name", label: "Player name" },
        ...METRICS.map(value => ({ value, label: OUTLOOK_LABELS[value] })),
      ]} />
      <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2 lg:col-span-4">
        {(["region", "lane"] as const).map(kind => <div key={kind} role="group" aria-label={kind === "region" ? "Outlook regions" : "Outlook roles"} className="flex flex-wrap items-center gap-1.5">
          {["", ...(kind === "region" ? LEAGUE_IDS : LANE_ORDER)].map(value => {
            const selected = value === (kind === "region" ? region : lane);
            const label = value ? (kind === "lane" ? ROLE_LABELS[value] : value) : kind === "region" ? "All regions" : "All roles";
            return <button type="button" key={value} aria-label={label} aria-pressed={selected}
              onClick={() => { update(kind === "region" ? setRegion : setLane, value); if (kind === "region") setTeam(""); }}
              className={`inline-flex items-center gap-1.5 border px-2 py-1.5 text-[11px] focus-visible:outline focus-visible:outline-rift-gold ${selected ? "border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line text-rift-mutedbright hover:border-rift-gold/40"}`}>
              {value && (kind === "region" ? <LeagueIcon league={value as typeof LEAGUE_IDS[number]} size={15} /> : <LaneIcon lane={value as typeof LANE_ORDER[number]} size="xs" />)}{label}
            </button>;
          })}
        </div>)}
        <button type="button" onClick={reset} aria-label="Reset outlook filters" className={`${CONTROL} ml-auto border-rift-gold/30 text-rift-goldbright`}><IconRotateClockwise size={13} aria-hidden="true" />Reset filters</button>
      </div>
    </div>
    {forecast ? <>
    <div className="my-3 flex flex-wrap justify-between gap-2 text-[11px] text-rift-mutedbright">
      <span role="status">{filtered.length} {filtered.length === 1 ? "player" : "players"} · {forecast.samples} scenarios</span>
      <span>FA region = home region · Percentages rounded</span>
    </div>
    <div role="region" aria-label="Roster probability table" tabIndex={0} className="overflow-x-auto focus-visible:outline focus-visible:outline-rift-gold">
      <table className="w-full min-w-[700px] text-left text-xs">
        <caption className="sr-only">Player probabilities for {forecast.window.label}</caption>
        <thead><tr className="border-b border-rift-line text-[10px] text-rift-mutedbright">
          <th scope="col" className="px-2 py-3 font-medium">Player / current seat</th>
          {METRICS.map(key => <th key={key} scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"} className="text-right font-medium">
            <button type="button" onClick={() => sortColumn(key)} aria-label={`Sort by ${OUTLOOK_LABELS[key]}, ${sort === key && direction === "desc" ? "ascending" : "descending"}`}
              className={`inline-flex w-full items-center justify-end gap-1 px-2 py-3 transition-colors hover:bg-rift-gold/5 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-rift-gold ${sort === key ? "text-rift-goldbright" : "text-rift-mutedbright"}`}>
              {OUTLOOK_LABELS[key]}{sort === key ? direction === "asc" ? <IconArrowUp size={12} aria-hidden="true" /> : <IconArrowDown size={12} aria-hidden="true" /> : <IconArrowsSort size={12} aria-hidden="true" />}
            </button>
          </th>)}
          <th scope="col" className="px-2 py-3 text-right font-medium">Details</th>
        </tr></thead>
        <tbody>{visible.map(row => {
          const currentTeam = teamById.get(row.seat.teamId ?? "");
          return <Fragment key={row.id}>
            <tr data-testid="outlook-player" className="border-b border-rift-line/40 hover:bg-rift-gold/[0.03]">
              <td className="max-w-[260px] px-2 py-3">
                <div className="flex items-center gap-2 text-rift-goldbright"><LaneIcon lane={row.player.lane} size="sm" />
                  <PlayerNameLink playerId={row.id} name={row.player.name} hint={{ player: row.player }} /><TierChip tier={row.player.tier} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-rift-mutedbright">
                  {row.region && LEAGUE_IDS.includes(row.region) && <span className="inline-flex items-center gap-1"><LeagueIcon league={row.region} size={14} />{row.region}</span>}
                  <TeamMark team={currentTeam} /><RosterStatusBadge status={row.seat.status} />
                  {isOutlookRookie(row.player, season.franchise?.year) && <RosterStatusBadge status="rookie" />}
                </div>
                {row.manualChoiceCount > 0 && <p className="mt-1 text-[10px] text-amber-300">User decision {percent(row.manualChoiceCount, forecast.samples)}</p>}
                {row.counts.retired > 0 && <p className="mt-1 text-[10px] text-rift-redbright">Retire {percent(row.counts.retired, forecast.samples)}</p>}
                {row.counts.unknown > 0 && <p className="mt-1 text-[10px] text-rift-mutedbright">Unknown {percent(row.counts.unknown, forecast.samples)}</p>}
              </td>
              {METRICS.map(key => <td key={key} data-outcome={key} className={`px-2 py-3 text-right tabular-nums ${row.counts[key] && key !== "stay" ? "font-semibold text-rift-goldbright" : "text-rift-mutedbright"}`}>
                {percent(row.counts[key], forecast.samples)}
              </td>)}
              <td className="px-2 py-3 text-right"><button type="button" className={CONTROL} aria-expanded={expanded === row.id} aria-controls={`outlook-explanation-${row.id}`}
                aria-label={`Explain ${row.player.name ?? "player"} outlook`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Hide" : "Why?"}</button></td>
            </tr>
            {expanded === row.id && <tr id={`outlook-explanation-${row.id}`}><td colSpan={7} className="border-b border-rift-gold/25 bg-rift-bg/60 p-4">
              <div className="mb-4 border-l-2 border-rift-gold/60 pl-3">
                <p className="mb-1 text-[9px] uppercase tracking-[0.2em] text-rift-gold">Outcome estimate</p>
                <p className="text-xs leading-relaxed text-rift-goldbright">{row.summary}</p>
              </div>
              <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div><p className="mb-3 text-[10px] uppercase tracking-wider text-rift-gold">How to read this outlook</p>
                  <dl className="space-y-3 text-[11px] leading-relaxed text-rift-mutedbright">{row.evidence.map(line => <div key={line.label}><dt className="mb-0.5 font-medium text-rift-goldbright">{line.label}</dt><dd>{line.text}</dd></div>)}</dl>
                  {row.manualChoiceCount > 0 && <p className="mt-2 text-amber-300">A pending transfer or player request needs your decision in {percent(row.manualChoiceCount, forecast.samples)} of scenarios. This is separate from the automatic destinations.</p>}
                </div>
                <div><p className="mb-3 text-[10px] uppercase tracking-wider text-rift-gold">Sampled destinations</p>
                  <ul aria-label="All sampled destinations" tabIndex={0} className="max-h-64 space-y-2 overflow-y-auto pr-4 [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-rift-gold">{row.destinations.map(destination => {
                    const destinationTeam = teamById.get(destination.teamId ?? "");
                    return <li key={`${destination.teamId}:${destination.status}`} className="flex items-center gap-3 border-b border-rift-line/40 pb-2 text-rift-mutedbright">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{destinationTeam && <span className="inline-flex items-center gap-1">
                      <LeagueIcon league={destinationTeam.leagueId} size={14} />{destinationTeam.leagueId}
                    </span>}
                    <TeamMark team={destinationTeam} /><RosterStatusBadge status={destination.status} /></div>
                    <span className="shrink-0 tabular-nums text-rift-goldbright">{percent(destination.count, forecast.samples)}</span>
                  </li>; })}</ul>
                  <p className="mt-2 text-[10px] leading-relaxed text-rift-mutedbright">Final seats after the window. A player may make more than one move within a scenario.</p>
                </div>
              </div>
            </td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    {!filtered.length && <p className="py-8 text-center text-sm text-rift-mutedbright">No players match these filters.</p>}
    <nav aria-label="Roster outlook pages" className="mt-4 flex items-center justify-end gap-3">
      <button type="button" className={CONTROL} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous players</button>
      <span className="text-xs tabular-nums text-rift-mutedbright">{currentPage + 1} / {pages}</span>
      <button type="button" className={CONTROL} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next players</button>
    </nav>
    <p className="mt-4 text-[11px] leading-relaxed text-rift-mutedbright">
      Outcomes are exclusive: “Other team” includes another club&apos;s main roster or academy; “To academy” / “To main roster” means the same club, or a signing for an FA.
      Retirement and unknown outcomes, when present, appear beside the player. 0% means no sampled outcome, and 100% means every scenario; neither guarantees a future result.
      {" Existing rookies are included; future rookies are not forecast as individual players. Future matches, patches and manual choices can change these estimates."}
    </p>
    </> : <div className="min-h-[240px]">{notice}</div>}
  </>;
}
