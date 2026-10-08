"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { LANE_ORDER } from "@/lib/players";
import { LEAGUE_IDS, type SeasonState, type SeasonTeam } from "@/lib/season/types";
import type { Champion } from "@/lib/types";
import { nextRosterWindow, outlookEvidence, OUTLOOK_LABELS,
  type OutlookRow, type OutlookStatus, type RosterOutlook } from "@/lib/season/rosterOutlook";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import PlaygroundSelect from "../hall/PlaygroundSelect";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import TierChip from "./TierChip";

const ROLE_LABELS: Record<string, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "Bot", support: "Support" };
const STATUS_LABELS: Record<OutlookStatus, string> = { main: "Main roster", academy: "Academy", "free-agent": "Free agent", retired: "Retired" };
const PAGE_SIZE = 20;
const CONTROL = "border border-rift-line px-3 py-1.5 text-xs text-rift-mutedbright hover:border-rift-gold/60 focus-visible:outline focus-visible:outline-rift-gold disabled:opacity-40";

function percent(count: number, samples: number) {
  if (count === 0) return "0%";
  if (count === samples) return "100%";
  const rounded = Math.round(100 * count / samples);
  return rounded === 0 ? "<1%" : rounded === 100 ? ">99%" : `${rounded}%`;
}

function TeamMark({ team }: { team?: SeasonTeam }) {
  return team ? <TeamNameLink teamId={team.id} name={team.name} leagueId={team.leagueId}
    iconKey={team.iconKey} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} color={team.color} logoSize={18} /> : null;
}

/** Closed panels subscribe to nothing; no forecasting work runs until opened. */
export default function RosterOutlookPanel() {
  const [open, setOpen] = useState(false);
  return <section aria-label="Roster outlook" className="mb-7 border border-rift-line/70 bg-rift-panel/40">
    <button type="button" aria-expanded={open} aria-controls="roster-outlook-content" onClick={() => setOpen(value => !value)}
      className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-rift-gold/5 focus-visible:outline focus-visible:outline-rift-gold">
      <span aria-hidden="true" className="text-rift-gold">{open ? "−" : "+"}</span>
      <span className="font-display text-sm text-rift-goldbright">Roster outlook</span>
      <span className="ml-auto text-xs text-rift-mutedbright">Next window probabilities</span>
    </button>
    {open && <div id="roster-outlook-content"><OutlookContent /></div>}
  </section>;
}

type Calculation = { source: SeasonState; champions: Champion[]; attempt: number; result?: RosterOutlook; error?: string };

function OutlookContent() {
  const season = useDraftStore(state => state.season)!;
  const champions = useDraftStore(state => state.champions);
  const simulating = useDraftStore(state => !!state.simulating);
  const [attempt, setAttempt] = useState(0);
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const current = calculation?.source === season && calculation.champions === champions && calculation.attempt === attempt ? calculation : null;
  const window = nextRosterWindow(season);
  useEffect(() => {
    if (simulating || !champions.length) return;
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const finish = (value: Pick<Calculation, "result" | "error">) => {
      if (!cancelled) setCalculation({ source: season, champions, attempt, ...value });
      worker?.terminate();
      clearTimeout(timeout);
    };
    const debounce = setTimeout(() => {
      try {
        worker = new Worker("/workers/rosterOutlook.worker.js");
        worker.onmessage = (event: MessageEvent<{ result?: RosterOutlook; error?: string }>) => {
          finish(event.data.result ? { result: event.data.result } : { error: event.data.error ?? "Forecast returned no result" });
        };
        worker.onerror = () => finish({ error: "The forecast worker could not run." });
        worker.onmessageerror = () => finish({ error: "The forecast response could not be read." });
        timeout = setTimeout(() => finish({ error: "The forecast took too long. Try again." }), 120_000);
        worker.postMessage({ season, champions });
      } catch {
        finish({ error: "Could not start the forecast worker." });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(debounce); clearTimeout(timeout); worker?.terminate(); };
  }, [season, champions, simulating, attempt]);

  return <div className="border-t border-rift-line/60 p-4 md:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-rift-mutedbright">Forecast horizon</p>
        <h3 className="mt-1 font-display text-lg text-rift-goldbright">{window.label}</h3>
      </div>
      <span className="border border-rift-gold/30 bg-rift-gold/5 px-2 py-1 text-[10px] text-rift-goldbright">Live season · Year {season.franchise?.year ?? 1}</span>
    </div>
    <p className="mt-3 max-w-4xl text-xs leading-relaxed text-rift-mutedbright">
      Estimated final destinations if the next roster decisions used today&apos;s results, rosters and patch.
      Updates as the season advances. Future matches, patches and your manual choices can change the outcome.
      {season.config.controlledTeamId ? " Your pending choices are kept open; no manual moves are assumed." : ""}
    </p>
    {window.kind === "none" && <p className="mt-3 text-sm text-rift-goldbright">{window.label}. Current seats are retained.</p>}
    {simulating || !champions.length || !current ? <p role="status" className="py-8 text-center text-sm text-rift-mutedbright">
      {simulating ? "Waiting for the current simulation to finish…" : !champions.length ? "Waiting for champion data…" : "Calculating roster probabilities…"}
    </p> : current.error ? <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-rift-redbright">
      <span>{current.error}</span><button type="button" className={CONTROL} onClick={() => setAttempt(value => value + 1)}>Retry forecast</button>
    </div> : null}
    {calculation?.result && <div hidden={simulating || !current?.result}>
      <OutlookTable key={season.id} forecast={calculation.result} season={season} />
    </div>}
  </div>;
}

function OutlookTable({ forecast, season }: { forecast: RosterOutlook; season: SeasonState }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLocaleLowerCase());
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [team, setTeam] = useState("");
  const [lane, setLane] = useState("");
  const [sort, setSort] = useState("movement");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const teamById = useMemo(() => new Map(season.teams.map(t => [t.id, t])), [season.teams]);
  const filtered = useMemo(() => forecast.rows.filter(row =>
    (!status || row.seat.status === status) && (!region || row.region === region) &&
    (!team || row.seat.teamId === team) && (!lane || row.player.lane === lane) &&
    (!query || (row.player.name ?? "").toLocaleLowerCase().includes(query)),
  ).sort((a, b) => {
    const movement = (row: OutlookRow) => forecast.samples - row.counts.stay - row.counts.unknown;
    if (sort === "movement") return movement(b) - movement(a) || (a.player.name ?? "").localeCompare(b.player.name ?? "");
    if (sort === "name") return (a.player.name ?? "").localeCompare(b.player.name ?? "");
    const key = sort as "transfer" | "academy" | "main" | "free-agent";
    return b.counts[key] - a.counts[key] || (a.player.name ?? "").localeCompare(b.player.name ?? "");
  }), [forecast, status, region, team, lane, query, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  const reset = () => { setSearch(""); setStatus(""); setRegion(""); setTeam(""); setLane(""); setSort("movement"); setPage(0); };
  const metrics = ["stay", "transfer", "academy", "main", "free-agent"] as const;

  return <>
    <div className="mt-5 grid grid-cols-1 gap-3 border-y border-rift-line/50 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-[10px] uppercase tracking-wider text-rift-mutedbright">Player search
        <input aria-label="Search outlook players" placeholder="Search player…" value={search} onChange={event => update(setSearch, event.target.value)}
          className="mt-1 w-full min-w-0 border border-rift-line bg-rift-bg px-3 py-2 text-xs normal-case tracking-normal text-rift-goldbright focus:border-rift-gold focus:outline-none" />
      </label>
      <PlaygroundSelect label="Roster status" value={status} onChange={value => update(setStatus, value)} options={[
        { value: "", label: "All players" }, ...(["main", "academy", "free-agent"] as const).map(value => ({ value, label: STATUS_LABELS[value] })),
      ]} />
      <PlaygroundSelect label="Outlook teams" value={team} onChange={value => update(setTeam, value)} options={[
        { value: "", label: "All teams / unsigned" }, ...season.teams.filter(t => !region || t.leagueId === region)
          .sort((a, b) => LEAGUE_IDS.indexOf(a.leagueId) - LEAGUE_IDS.indexOf(b.leagueId)).map(t => ({ value: t.id,
            label: `${t.name} (${t.leagueId})`, icon: <TeamIcon iconKey={t.iconKey} logoUrl={resolveTeamLogo(t.name, t.logoUrl)} color={t.color} size={18} /> })),
      ]} />
      <PlaygroundSelect label="Outlook order" value={sort} onChange={value => update(setSort, value)} options={[
        { value: "movement", label: "Most likely to move" }, { value: "name", label: "Player name" },
        ...metrics.filter(key => key !== "stay").map(value => ({ value, label: OUTLOOK_LABELS[value] })),
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
        <button type="button" onClick={reset} className="text-xs text-rift-gold underline underline-offset-4">Reset outlook filters</button>
      </div>
    </div>
    <div className="my-3 flex flex-wrap justify-between gap-2 text-[11px] text-rift-mutedbright">
      <span role="status">{filtered.length} {filtered.length === 1 ? "player" : "players"} · {forecast.samples} scenarios</span>
      <span>FA region = home region · Percentages rounded</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-xs">
        <caption className="sr-only">Player probabilities for {forecast.window.label}</caption>
        <thead><tr className="border-b border-rift-line text-[10px] text-rift-mutedbright">
          <th scope="col" className="px-2 py-3 font-medium">Player / current seat</th>
          {metrics.map(key => <th key={key} scope="col" className="px-2 py-3 text-right font-medium">{OUTLOOK_LABELS[key]}</th>)}
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
                  <TeamMark team={currentTeam} /><span>{STATUS_LABELS[row.seat.status]}</span>
                </div>
                {row.manualChoiceCount > 0 && <p className="mt-1 text-[10px] text-amber-300">User decision {percent(row.manualChoiceCount, forecast.samples)}</p>}
                {row.counts.retired > 0 && <p className="mt-1 text-[10px] text-rift-redbright">Retire {percent(row.counts.retired, forecast.samples)}</p>}
                {row.counts.unknown > 0 && <p className="mt-1 text-[10px] text-rift-mutedbright">Unknown {percent(row.counts.unknown, forecast.samples)}</p>}
              </td>
              {metrics.map(key => <td key={key} data-outcome={key} className={`px-2 py-3 text-right tabular-nums ${row.counts[key] ? key === "stay" ? "text-rift-mutedbright" : "font-semibold text-rift-goldbright" : "text-rift-mutedbright/50"}`}>
                {percent(row.counts[key], forecast.samples)}
              </td>)}
              <td className="px-2 py-3 text-right"><button type="button" className={CONTROL} aria-expanded={expanded === row.id}
                aria-label={`Explain ${row.player.name ?? "player"} outlook`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "Hide" : "Why?"}</button></td>
            </tr>
            {expanded === row.id && <tr><td colSpan={7} className="border-b border-rift-gold/25 bg-rift-bg/60 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="mb-2 font-semibold text-rift-goldbright">Current evidence</p>
                  <ul className="space-y-1.5 text-rift-mutedbright">{outlookEvidence(row).map(line => <li key={line}>{line}</li>)}</ul>
                  {row.manualChoiceCount > 0 && <p className="mt-2 text-amber-300">A pending transfer or player request needs your decision in {percent(row.manualChoiceCount, forecast.samples)} of scenarios. This is separate from the automatic destinations.</p>}
                </div>
                <div><p className="mb-2 font-semibold text-rift-goldbright">Sampled destinations</p>
                  <ul className="space-y-2">{row.destinations.slice(0, 5).map(destination => <li key={`${destination.teamId}:${destination.status}`} className="flex flex-wrap items-center gap-2 text-rift-mutedbright">
                    <TeamMark team={teamById.get(destination.teamId ?? "")} /><span>{STATUS_LABELS[destination.status]}</span>
                    <span className="ml-auto tabular-nums text-rift-goldbright">{percent(destination.count, forecast.samples)}</span>
                  </li>)}</ul>
                  {row.destinations.length > 5 && <p className="mt-2 text-rift-mutedbright">Showing the five most frequent destinations.</p>}
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
      {" Each estimate uses only the current season snapshot."}
    </p>
  </>;
}
