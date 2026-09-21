"use client";
import { resolveTeamLogo } from "@/lib/season/realTeams";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { isDesktop, flushPendingPersistWrites } from "@/lib/desktopStorage";
import { isRealityHistoryLoaded, loadRealityHistoryFromDb, loadRealitySeasonFromDb } from "@/lib/desktopSqlite";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "@/lib/season/history";
import { collectMarketHistory, marketHistoryYears, DEFAULT_MARKET_FILTERS, filterMarketHistory, MARKET_KIND_LABELS, MARKET_STATUS_LABELS,
  MARKET_WINDOWS, marketWindowLabel, marketTeamKey, marketWindowOrder, type MarketEndpoint, type MarketFilters, type MarketStatus } from "@/lib/season/marketHistory";
import { LEAGUE_IDS, type SeasonState } from "@/lib/season/types";
import TierChip from "../season/TierChip";
import { PLAYER_TIERS, LANE_ORDER } from "@/lib/players";
import PlaygroundSelect from "./PlaygroundSelect";
import { HallPager } from "./RecordRows";
import TeamIcon from "../TeamIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import { TeamRef } from "./shared";
import HallPanelLoading from "./HallPanelLoading";

const PAGE_SIZE = 50;
const ROLE_LABELS: Record<string, string> = { top: "Top", jungle: "Jungle", middle: "Mid", bottom: "Bot", support: "Support" };
const fieldClass = "w-full min-w-0 border border-rift-line bg-rift-bg px-3 py-2 text-xs text-rift-goldbright focus:border-rift-gold focus:outline-none";
const badgeColors: Record<MarketStatus, string> = {
  main: "text-rift-goldbright border-rift-gold/40 bg-rift-gold/10", academy: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  "free-agent": "text-sky-300 border-sky-500/40 bg-sky-500/10", rookie: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  retired: "text-rift-redbright border-rift-red/40 bg-rift-red/10", unknown: "text-rift-mutedbright border-rift-line",
};
function StatusBadge({ status }: { status: MarketStatus }) {
  return <span className={`inline-flex border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${badgeColors[status]}`}>{MARKET_STATUS_LABELS[status]}</span>;
}
function Endpoint({ value, seasonId, snapshots }: { value: MarketEndpoint; seasonId: string; snapshots?: import("@/lib/season/marketSnapshots").MarketTeamSnapshot[] }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {value.team && <TeamRef marketSnapshot={snapshots?.find(s => s.name === value.team?.name && s.leagueId === value.team?.leagueId) ?? null} team={value.team} seasonId={seasonId} showRegion={false} size={18} />}
    <StatusBadge status={value.status} />
  </div>;
}
interface Props { onOpenSeason?: (id: string) => void; realityId?: string; entries: SeasonHistoryEntry[]; season: SeasonState | null }

/** Inactive Hall reads never activate a reality or mark its history writable. */
export default function MarketHistoryPanel({ realityId, entries, season, onOpenSeason }: Props) {
  const needsHistory = !!realityId && isDesktop() && !isRealityHistoryLoaded(realityId);
  const needsSeason = !!realityId && season == null && isDesktop();
  const [loaded, setLoaded] = useState<{ entries: SeasonHistoryEntry[]; season: SeasonState | null } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!realityId || (!needsHistory && !needsSeason)) return;
    let cancelled = false;
    async function read() {
      try {
        await flushPendingPersistWrites();
        const [history, body] = await Promise.all([
          needsHistory ? loadRealityHistoryFromDb(realityId!) : Promise.resolve(entries),
          needsSeason ? loadRealitySeasonFromDb(realityId!) : Promise.resolve(season),
        ]);
        if (!cancelled) setLoaded({ entries: history, season: body });
      } catch { if (!cancelled) setError(true); }
    }
    void read();
    return () => { cancelled = true; };
  }, [realityId, entries, season, needsHistory, needsSeason, attempt]);
  if (error) return <div role="alert" className="border border-rift-line p-5 text-sm text-rift-mutedbright">
    <p>Could not load this reality&apos;s roster moves. This reality has not been modified.</p>
    <button type="button" className="mt-3 border border-rift-gold/50 px-3 py-2 text-rift-goldbright" onClick={() => { setError(false); setAttempt(n => n + 1); }}>Retry roster history</button>
  </div>;
  if ((needsHistory || needsSeason) && !loaded) return <HallPanelLoading label="Loading roster moves..." />;
  return <MarketHistoryTable onOpenSeason={onOpenSeason} entries={needsHistory ? loaded!.entries : entries} season={needsSeason ? loaded!.season : season} />;
}

function MarketHistoryTable({ entries, season, onOpenSeason }: Omit<Props, "realityId">) {
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_MARKET_FILTERS);
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(filters.search);
  const archivedIds = useMemo(() => new Set(entries.map(entry => entry.id)), [entries]);
  const rows = useMemo(() => collectMarketHistory(entries, season), [entries, season]);
  const filtered = useMemo(() => filterMarketHistory(rows, { ...filters, search: deferredSearch }), [rows, filters, deferredSearch]);
  const options = useMemo(() => {
    const teams = new Map<string, SeasonHistoryTeamRef>();
    for (const row of rows) for (const team of [row.from.team, row.to.team, row.contextTeam]) if (team) teams.set(marketTeamKey(team), team);
    return {
      years: marketHistoryYears(entries, season, rows),
      windows: [...new Set([...MARKET_WINDOWS, ...rows.flatMap(r => r.window ? [r.window] : [])])].filter(window => window !== "Preseason").sort((a, b) => marketWindowOrder(a) - marketWindowOrder(b) || a.localeCompare(b)),
      teams: [...teams.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)),
    };
  }, [rows, entries, season]);
  const update = (key: Exclude<keyof MarketFilters, "region" | "lane">, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(0); };
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const incomplete = entries.some(entry => entry.marketNews === undefined) || rows.some(row => row.year == null || row.window == null);
  const select = (label: string, key: Exclude<keyof MarketFilters, "region" | "lane">, values: Array<[string, string]>) => <PlaygroundSelect label={label} value={filters[key]} onChange={value => update(key, value)} options={[
    { value: "", label: `All ${label.toLowerCase()}` }, ...values.map(([value, label]) => ({ value, label })),
  ]} />;
  const pager = (navLabel: string) => (
    <HallPager
      page={currentPage}
      pageCount={pages}
      total={filtered.length}
      pageSize={PAGE_SIZE}
      label={navLabel}
      previousLabel="Previous movements"
      nextLabel="Next movements"
      onChange={setPage}
    />
  );
  return <section aria-label="Roster moves history" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-xl tracking-wider text-rift-goldbright">Roster Moves</h2>
        <p className="mt-1 text-xs text-rift-mutedbright">Simulation year and window, including the current year. Exact order within a window may be unavailable.</p></div>
      <PlaygroundSelect label="Movement order" value={filters.order} onChange={value => update("order", value)} options={[
        { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" },
      ]} />
    </div>
    <div className="grid grid-cols-2 gap-3 border border-rift-line/60 bg-rift-panel/30 p-3 md:grid-cols-3">
      {select("Years", "year", [...options.years.map(year => [String(year), `Year ${year}`] as [string, string]), ...(rows.some(r => r.year == null) ? [["unknown", "Unknown year"] as [string, string]] : [])])}
      {select("Windows", "window", [...options.windows.map(window => [window, marketWindowLabel(window)] as [string, string]), ...(rows.some(r => !r.window) ? [["unknown", "Unknown window"] as [string, string]] : [])])}
      <PlaygroundSelect label="Teams" value={filters.team} onChange={value => update("team", value)} options={[
        { value: "", label: "All teams" },
        ...options.teams.filter(([, team]) => !filters.region.length || filters.region.includes(team.leagueId)).map(([value, team]) => ({
          value, label: `${team.name} (${team.leagueId})`, icon: <TeamIcon iconKey={team.iconKey} logoUrl={resolveTeamLogo(team.name, team.logoUrl)} color={team.color} size={18} className="shrink-0" />,
        })),
      ]} />
      {select("Movement types", "kind", Object.entries(MARKET_KIND_LABELS))}
      {select("Player tiers", "tier", [...PLAYER_TIERS.map(tier => [tier, tier] as [string, string]), ["unknown", "Unknown tier"]])}
      {select("Statuses", "status", Object.entries(MARKET_STATUS_LABELS))}
      <label className="col-span-2 min-w-0 text-[10px] uppercase tracking-wider text-rift-mutedbright md:col-span-1">Player search
        <input aria-label="Search roster players" value={filters.search} onChange={event => update("search", event.target.value)} placeholder="Player or replaced player..." className={`${fieldClass} mt-1 normal-case tracking-normal`} />
      </label>

      <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-3 border-t border-rift-line/50 pt-3 md:col-span-3">
        {(["region", "lane"] as const).map(key => <div key={key} role="group" aria-label={key === "region" ? "Regions" : "Roles"} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] text-rift-mutedbright">{key === "region" ? "Regions" : "Roles"}</span>
          {["", ...(key === "region" ? LEAGUE_IDS : LANE_ORDER)].map(value => {
            const selected = value ? filters[key].includes(value) : filters[key].length === 0;
            return <button key={value} type="button" aria-pressed={selected} aria-label={value ? (key === "lane" ? ROLE_LABELS[value] : value) : (key === "region" ? "All regions" : "All roles")}
              onClick={() => { setFilters(f => ({ ...f, [key]: !value ? [] : f[key].includes(value) ? f[key].filter(item => item !== value) : [...f[key], value], ...(key === "region" ? { team: "" } : {}) })); setPage(0); }}
              className={`inline-flex min-h-8 items-center gap-1.5 border px-2 py-1 text-[11px] focus-visible:outline focus-visible:outline-rift-gold ${selected ? "border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright" : "border-rift-line text-rift-mutedbright hover:border-rift-gold/40"}`}>
              {value && (key === "region" ? <LeagueIcon league={value as typeof LEAGUE_IDS[number]} size={18} /> : <LaneIcon lane={value as typeof LANE_ORDER[number]} />)}
              {value ? (key === "lane" ? ROLE_LABELS[value] : value) : "All"}
            </button>;
          })}
        </div>)}
      </div>

    </div>
    {incomplete && <p className="text-xs leading-relaxed text-rift-mutedbright">Older archives may contain transfers only. Missing news, years and windows cannot be reconstructed; unknown dates appear last.</p>}
    <div className="flex items-center justify-between gap-3 text-xs text-rift-mutedbright">
      <p role="status">{filtered.length} of {rows.length} player movements</p>
      <button type="button" className="text-rift-goldbright hover:underline" onClick={() => { setFilters(DEFAULT_MARKET_FILTERS); setPage(0); }}>Reset filters</button>
    </div>
    {visible.length === 0 ? <div className="border border-rift-line/50 p-8 text-center text-sm text-rift-mutedbright">
      {rows.length ? "No movements match these filters." : "No roster moves recorded yet. New signings, academy changes and retirements will appear here."}
    </div> : <div className="space-y-0">
      {/* Controls sit above the list so paging stays reachable without sticky overlays. */}
      {pager("Roster moves pages")}
      <ol className="divide-y divide-rift-line/50 border border-rift-line/50 border-y-0">
      {visible.map(row => <li key={row.id} data-testid="market-move" className="grid items-center gap-x-4 gap-y-2 bg-rift-panel/20 px-3 py-2 md:grid-cols-[140px_minmax(130px,0.8fr)_minmax(0,2fr)]">
        <div className="text-xs"><div className="font-display text-sm text-rift-goldbright">{row.year != null && onOpenSeason && archivedIds.has(row.seasonId) ? <button type="button" className="underline decoration-rift-gold/40 underline-offset-2 hover:text-rift-gold focus-visible:outline focus-visible:outline-rift-gold" aria-label={`Open Year ${row.year} in Timeline`} onClick={() => onOpenSeason(row.seasonId)}>Year {row.year} &rarr;</button> : row.year == null ? "Unknown year" : `Year ${row.year}`}</div>
          <div className="mt-0.5 text-[11px] text-rift-mutedbright">{row.window ? marketWindowLabel(row.window) : "Unknown window"}</div>
          </div>
        <div className="min-w-0"><div className="flex items-center gap-2 text-sm text-rift-goldbright"><LaneIcon lane={row.lane} /><PlayerNameLink playerId={row.playerId} name={row.playerName} seasonId={row.seasonId} hint={{ lane: row.lane, player: row.teamSnapshots?.flatMap(s => [...s.after, ...s.before, ...(s.academyAfter ?? []), ...(s.academyBefore ?? [])]).find(p => p.id === row.playerId) }} className="min-w-0" />{row.tier && <TierChip tier={row.tier} />}</div>
          <div className="mt-0.5 text-[10px] text-rift-mutedbright">{MARKET_KIND_LABELS[row.kind] ?? row.kind}</div>
          {row.retirement && <div className="mt-0.5 text-[11px] text-rift-mutedbright">{row.retirement.age != null ? `Age ${row.retirement.age} | ` : ""}Academy: {row.retirement.academyYears == null ? "unknown" : `${row.retirement.academyYears}y`} | Free Agent: {row.retirement.freeAgentYears == null ? "unknown" : `${row.retirement.freeAgentYears}y`}</div>}
          {row.replacedName && <div className="mt-0.5 text-[11px] text-rift-mutedbright">Replaced <PlayerNameLink playerId={row.replacedId} name={row.replacedName} seasonId={row.seasonId} hint={{ lane: row.lane, player: row.teamSnapshots?.flatMap(s => [...s.before, ...s.after]).find(p => p.id === row.replacedId) }} /></div>}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="text-[9px] uppercase tracking-widest text-rift-mutedbright">From</span><Endpoint snapshots={row.teamSnapshots} value={row.from} seasonId={row.seasonId} /></div>
          <span aria-hidden="true" className="text-rift-gold/70">&rarr;</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="text-[9px] uppercase tracking-widest text-rift-mutedbright">To</span><Endpoint snapshots={row.teamSnapshots} value={row.to} seasonId={row.seasonId} /></div>
          <div className="flex w-full flex-wrap gap-2 text-[10px] text-rift-mutedbright">
            {[...new Set([row.from.team?.leagueId, row.to.team?.leagueId, row.contextTeam?.leagueId].filter(Boolean))].map(region => <span key={region} className="inline-flex items-center gap-1"><LeagueIcon league={region!} size={14} />{region}</span>)}
            {!row.from.team && !row.to.team && row.contextTeam && <span className="flex items-center gap-1">Last team: <TeamRef marketSnapshot={row.teamSnapshots?.find(s => s.name === row.contextTeam?.name && s.leagueId === row.contextTeam?.leagueId) ?? null} team={row.contextTeam} seasonId={row.seasonId} showRegion={false} /></span>}
          </div>
        </div>
      </li>)}
      </ol>
      {pager("Roster moves end pages")}
    </div>}
  </section>;
}
