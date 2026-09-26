import type { MarketTeamSnapshot } from "./marketSnapshots";
import type { HistoryTransfer, SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import type { PlayerTransfer, SeasonState } from "./types";
import type { PlayerTier, Lane } from "../types";

export type MarketStatus = "main" | "academy" | "free-agent" | "rookie" | "retired" | "unknown";
export const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  main: "Main roster", academy: "Academy", "free-agent": "Free Agent", rookie: "Rookie", retired: "Retired", unknown: "Unknown",
};
export interface MarketEndpoint { status: MarketStatus; team: SeasonHistoryTeamRef | null }
export interface MarketHistoryRow {
  id: string;
  seasonId: string;
  year: number | null;
  window: string | null;
  /** Null for coach moves (coaches have no lane). */
  lane: Lane | null;
  /** Player name, or the coach's name when `kind === "coach"`. */
  playerName: string;
  tier?: PlayerTier;
  playerId?: string;
  kind: string;
  from: MarketEndpoint;
  to: MarketEndpoint;
  contextTeam: SeasonHistoryTeamRef | null;
  retirement?: { age?: number; academyYears?: number; freeAgentYears?: number };
  replacedName?: string;
  replacedId?: string;
  teamSnapshots?: MarketTeamSnapshot[];
  sequence: number;
}
export const MARKET_KIND_LABELS: Record<string, string> = {
  transfer: "Transfer", signing: "Signing", promotion: "Promotion", demotion: "Demotion",
  release: "Release", retirement: "Retirement", rookie: "Rookie arrival", academy: "Academy move", coach: "Coach move",
};
export const MARKET_WINDOWS = [ "Winter", "First Stand window", "Spring", "MSI window", "Summer", "Offseason"];
/** Display labels only: keep persisted origin IDs and legacy timing intact. */
export function marketWindowLabel(window: string): string {
  const labels: Record<string, string> = {
    Winter: "Post Winter Split", Spring: "Post Spring Split", Summer: "Post Summer Split",
    "First Stand window": "Post First Stand", "MSI window": "Post MSI",
  };
  return labels[window] ?? window;
}
export const marketTeamKey = (team: SeasonHistoryTeamRef) => `${team.leagueId}:${team.name}`;
export function marketWindowOrder(window: string | null): number {
  const index = ["Preseason", ...MARKET_WINDOWS].indexOf(window ?? "");
  return index === -1 ? 99 : index;
}
const eventWindow = (event: string) => event === "worlds" ? "Offseason" : event === "msi" ? "MSI window" : event === "first-stand" ? "First Stand window" : event;
function frozenTeam(season: SeasonState, id: string): SeasonHistoryTeamRef | null {
  const team = season.teams.find(t => t.id === id);
  return team ? { name: team.name, leagueId: team.leagueId, color: team.color, iconKey: team.iconKey, ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}) } : null;
}
function rowsForSource(entry: Pick<SeasonHistoryEntry, "id" | "franchiseYear" | "marketNews" | "transfers" | "coachMoves">): MarketHistoryRow[] {
  const rows: MarketHistoryRow[] = [];
  const occurrences = new Map<string, number>();
  const demotions: Omit<MarketHistoryRow, "id" | "sequence">[] = [];
  function add(row: Omit<MarketHistoryRow, "id" | "sequence">) {
    const key = JSON.stringify([row.seasonId, row.window, row.kind, row.playerId ?? row.playerName,
      row.from.status, row.from.team && marketTeamKey(row.from.team), row.to.status,
      row.to.team && marketTeamKey(row.to.team), row.contextTeam && marketTeamKey(row.contextTeam), row.replacedName]);
    const count = occurrences.get(key) ?? 0;
    occurrences.set(key, count + 1);
    rows.push({ ...row, id: `${key}:${count}`, sequence: rows.length });
  }
  for (const transfer of entry.transfers ?? []) {
    const origin = transfer.origin;
    const timing = { seasonId: origin?.seasonId ?? entry.id, year: origin?.year ?? entry.franchiseYear ?? null,
      window: origin ? origin.windowId.slice(origin.seasonId.length + 1) : eventWindow(transfer.event) };
    add({ ...timing, teamSnapshots: transfer.teamSnapshots, lane: transfer.lane, kind: "transfer", playerName: transfer.inName || "Unknown player", playerId: transfer.inId, tier: transfer.inTier,
      from: { status: "main", team: transfer.from }, to: { status: "main", team: transfer.to }, contextTeam: null });
    add({ ...timing, teamSnapshots: transfer.teamSnapshots, lane: transfer.lane, kind: "transfer", playerName: transfer.outName || "Unknown player", playerId: transfer.outId, tier: transfer.outTier,
      from: { status: "main", team: transfer.to }, to: { status: "main", team: transfer.from }, contextTeam: null });
  }
  // Coaches only change teams in the post-Worlds offseason.
  for (const move of entry.coachMoves ?? []) {
    add({ seasonId: entry.id, year: entry.franchiseYear ?? null, window: "Offseason", lane: null, kind: "coach",
      playerName: move.coachName, from: { status: "main", team: move.from }, to: { status: "main", team: move.to }, contextTeam: null });
  }
  for (const news of entry.marketNews ?? []) {
    const origin = news.origin;
    const note = news.marketNote;
    if (note === "agency-override") continue; // Retention is not a player movement.
    let from: MarketEndpoint = { status: news.entrantSource, team: news.entrantSource === "academy" ? news.team : null };
    let to: MarketEndpoint = { status: "main", team: news.team };
    let kind = news.entrantSource === "rookie" ? "rookie" : news.entrantSource === "academy" ? "promotion" : "signing";
    let playerName = news.entrantName || news.departedName || "Unknown player";
    let playerId = news.entrantId ?? news.departedId;
    if (note === "manual-demote" || note === "ai-demote") {
      from = { status: "main", team: news.team }; to = { status: "academy", team: news.team }; kind = "demotion";
      playerName = news.departedName || "Unknown player"; playerId = news.departedId;
    } else if (["academy-release", "academy-bump", "became-fa"].includes(note ?? "")) {
      from = { status: "academy", team: news.team }; to = { status: "free-agent", team: null }; kind = "release";
    } else if (note === "retired") {
      // Pressure valves can retire either academy players or free agents.
      from = { status: news.retirement?.from ?? "unknown", team: news.retirement?.from === "academy" ? news.team : null }; to = { status: "retired", team: null }; kind = "retirement";
    } else if (note === "academy-rookie" || note === "fa-academy" || note === "academy-stash") {
      to = { status: "academy", team: news.team }; kind = note === "academy-rookie" ? "rookie" : "academy";
    } else if (note === "agency-leave") {
      from = { status: "main", team: news.team }; to = { status: "free-agent", team: null }; kind = "release";
    } else if (note === "agency-depart") {
      from = { status: "academy", team: news.entrantSource === "academy" ? null : news.team };
      to = { status: news.entrantSource === "academy" ? "academy" : "free-agent", team: news.entrantSource === "academy" ? news.team : null }; kind = "academy";
    }
    add({ seasonId: origin?.seasonId ?? entry.id, year: origin?.year ?? null,
      window: origin ? origin.windowId.slice(origin.seasonId.length + 1) : news.timeMark ?? null,
      retirement: kind === "retirement" ? { age: news.retirement?.age ?? news.departedAge, academyYears: news.retirement?.academyYears, freeAgentYears: news.retirement?.freeAgentYears } : undefined,
      teamSnapshots: news.teamSnapshots, lane: news.lane, playerName, playerId, tier: kind === "demotion" ? news.departedTier : news.entrantTier, kind, from, to, contextTeam: news.team,
      ...(news.departedName && news.departedName !== playerName && news.entrantName ? { replacedName: news.departedName, replacedId: news.departedId } : {}) });
    if (kind === "promotion" && news.departedId && news.departedId !== playerId) {
      // A promotion can fill an empty slot. Only an explicitly frozen academy
      // destination proves the replaced main-roster player was demoted.
      const snapshot = news.teamSnapshots?.find(s => news.team && s.name === news.team.name && s.leagueId === news.team.leagueId);
      const departed = snapshot?.academyAfter?.find(p => p.id === news.departedId);
      if (news.departedDestination === "academy" || (departed && snapshot?.before.some(p => p.id === news.departedId))) demotions.push({
        seasonId: origin?.seasonId ?? entry.id, year: origin?.year ?? null,
        window: origin ? origin.windowId.slice(origin.seasonId.length + 1) : news.timeMark ?? null,
        lane: departed?.lane ?? news.lane, playerName: news.departedName || departed?.name || "Unknown player", playerId: news.departedId,
        tier: news.departedTier ?? departed?.tier, kind: "demotion", from: { status: "main", team: news.team },
        to: { status: "academy", team: news.team }, contextTeam: news.team, teamSnapshots: news.teamSnapshots,
      });
    }
  }
  const signature = (r: Omit<MarketHistoryRow, "id" | "sequence">) => JSON.stringify([r.seasonId, r.window, r.playerId ?? r.playerName, r.to.team && marketTeamKey(r.to.team)]);
  const explicit = new Map<string, number>();
  for (const row of rows) if (row.kind === "demotion") explicit.set(signature(row), (explicit.get(signature(row)) ?? 0) + 1);
  for (const row of demotions) {
    const key = signature(row), count = explicit.get(key) ?? 0;
    if (count) explicit.set(key, count - 1); else add(row);
  }
  return rows;
}

/** Read-only normalization; never fills missing provenance on legacy saves. */
export function collectMarketHistory(entries: readonly SeasonHistoryEntry[], live?: SeasonState | null): MarketHistoryRow[] {
  const archivedRows = entries.flatMap(entry => rowsForSource(entry).map(row => ({ ...row, year: row.year ?? entry.franchiseYear ?? null })));
  const sources: Array<Pick<SeasonHistoryEntry, "id" | "franchiseYear" | "marketNews" | "transfers">> = [];
  let carriedLegacyRows: MarketHistoryRow[] = [];
  if (live) {
    const carryNews = (live.rosterNews ?? []).filter((n, index) => !n.origin && n.timeMark === "Offseason"
      && (live.status !== "complete" || index < (live.offseasonRosterNewsBaseline ?? 0)));
    const carryTransfers = (live.transfersByEvent?.worlds ?? []).filter((m, index) => !m.origin && m.event === "worlds"
      && (live.status !== "complete" || index < (live.worldsOffseasonBaseline ?? 0)));
    const carrySet = new Set(carryTransfers);
    const carryNewsSet = new Set(carryNews);
    const freezeTransfer = (m: PlayerTransfer): HistoryTransfer => ({
      teamSnapshots: m.teamSnapshots, origin: m.origin, event: m.event, lane: m.lane, from: frozenTeam(live, m.fromTeamId), to: frozenTeam(live, m.toTeamId),
      inName: m.star.name, inId: m.star.id, inTier: m.star.tier, outName: m.swap.name, outId: m.swap.id, outTier: m.swap.tier,
    });
    const freezeNews = ({ teamId, ...news }: NonNullable<SeasonState["rosterNews"]>[number]) => ({ ...news, team: frozenTeam(live, teamId) });
    sources.push({ id: live.id, franchiseYear: live.franchise?.year,
      transfers: Object.values(live.transfersByEvent ?? {}).flatMap(moves => (moves ?? []).filter(m => !carrySet.has(m)).map(freezeTransfer)),
      marketNews: (live.rosterNews ?? []).filter(n => !carryNewsSet.has(n)).map(freezeNews) });
    // A carried legacy row does not belong to the new year. Keep unknown
    // ownership when no matching archive survived, rather than relabelling it.
    carriedLegacyRows = rowsForSource({ id: live.id, transfers: carryTransfers.map(freezeTransfer), marketNews: carryNews.map(freezeNews) });
  }
  const rows = new Map<string, MarketHistoryRow>();
  for (const row of [...archivedRows, ...sources.flatMap(rowsForSource)]) {
    const previous = rows.get(row.id);
    // Preserve richer archived timing when live legacy carry has less context.
    rows.set(row.id, previous ? { ...row, year: previous.year ?? row.year } : row);
  }
  const signature = (row: MarketHistoryRow) => JSON.stringify([row.window, row.kind, row.lane, row.playerName,
    row.from.status, row.from.team && marketTeamKey(row.from.team), row.to.status, row.to.team && marketTeamKey(row.to.team), row.replacedName]);
  const archivedSignatures = new Set(archivedRows.map(signature));
  for (const row of carriedLegacyRows) if (!archivedSignatures.has(signature(row))) rows.set(row.id, row);
  return [...rows.values()];
}
export interface MarketFilters { year: string; window: string; team: string; region: string[]; lane: string[]; kind: string; tier: string; status: string; search: string; order: "newest" | "oldest" }
export const DEFAULT_MARKET_FILTERS: MarketFilters = { year: "", window: "", team: "", region: [], lane: [], kind: "", tier: "", status: "", search: "", order: "newest" };
export function filterMarketHistory(rows: readonly MarketHistoryRow[], filters: MarketFilters): MarketHistoryRow[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const direction = filters.order === "oldest" ? 1 : -1;
  return rows.filter(row => {
    const teams = [row.from.team, row.to.team, row.contextTeam].filter((t): t is SeasonHistoryTeamRef => t != null);
    return (!filters.year || (row.year == null ? "unknown" : String(row.year)) === filters.year)
      && (!filters.window || (row.window ?? "unknown") === filters.window)
      && (!filters.team || teams.some(t => marketTeamKey(t) === filters.team))
      && (!filters.region.length || teams.some(t => filters.region.includes(t.leagueId)))
      && (!filters.lane.length || (row.lane != null && filters.lane.includes(row.lane))) && (!filters.kind || row.kind === filters.kind)
      && (!filters.tier || (row.tier ?? "unknown") === filters.tier)
      && (!filters.status || [row.from.status, row.to.status].includes(filters.status as MarketStatus))
      && (!search || `${row.playerName} ${row.replacedName ?? ""}`.toLocaleLowerCase().includes(search));
  }).sort((a, b) => {
    if (a.year == null || b.year == null) { if (a.year !== b.year) return a.year == null ? 1 : -1; }
    const year = (a.year ?? 0) - (b.year ?? 0);
    if (year) return year * direction;
    const window = marketWindowOrder(a.window) - marketWindowOrder(b.window);
    if (a.window == null || b.window == null) { if (a.window !== b.window) return a.window == null ? 1 : -1; }
    return window * direction || (a.sequence - b.sequence) * direction || a.id.localeCompare(b.id);
  });
}

/** Include recorded seasons even when their market log is empty or predates news archiving. */
export function marketHistoryYears(entries: readonly SeasonHistoryEntry[], live: SeasonState | null, rows: readonly MarketHistoryRow[]): number[] {
  return [...new Set([...entries.flatMap(e => e.franchiseYear == null ? [] : [e.franchiseYear]), ...(live?.franchise?.year == null ? [] : [live.franchise.year]), ...rows.flatMap(r => r.year == null ? [] : [r.year])])].sort((a, b) => b - a);
}
