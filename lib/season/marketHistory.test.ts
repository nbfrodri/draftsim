import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { validHistoryEntry } from "../importValidation";
import { buildSeasonHistoryEntry, type SeasonHistoryEntry } from "./history";
import { marketOrigin } from "./marketOrigin";
import { collectMarketHistory, marketHistoryYears, DEFAULT_MARKET_FILTERS, filterMarketHistory, marketWindowLabel, marketTeamKey } from "./marketHistory";
import { startNextSeasonWithArchive } from "./franchise";
import { localChampions } from "../communityDragon";

function fixture() {
  const season = makeAuditSeason("Market history");
  const team = season.teams[0];
  const news = { teamId: team.id, lane: "top" as const, entrantName: "New prospect", entrantId: "prospect-1",
    entrantTier: "A" as const, entrantPotential: "S" as const, entrantSource: "rookie" as const,
    marketNote: "academy-rookie" as const, timeMark: "Winter", origin: marketOrigin(season, "Winter") };
  season.rosterNews = [news];
  return { season, news, team };
}

describe("Hall roster moves", () => {
  it("archives market news and player IDs, survives import validation, and freezes team identity", () => {
    const { season, team } = fixture();
    season.transfersByEvent = { msi: [{ event: "msi", origin: marketOrigin(season, "msi"), lane: "top", fromTeamId: team.id, toTeamId: season.teams[1].id,
      star: { id: "star", name: "Star", tier: "A", grade: null, goodChamps: [] }, swap: { id: "swap", name: "Swap", tier: "B", grade: null, goodChamps: [] } }] };
    const archived = buildSeasonHistoryEntry(season, 1);
    expect(archived.transfers![0]).toMatchObject({ inId: "star", outId: "swap" });
    expect(archived.marketNews![0].team!.name).toBe(team.name);
    team.name = "Renamed later";
    expect(archived.marketNews![0].team!.name).not.toBe(team.name);
    const restored = JSON.parse(JSON.stringify(archived));
    expect(validHistoryEntry(restored)).toBe(true);
    expect(collectMarketHistory([restored])).toHaveLength(3);
    restored.marketNews[0].origin.year = -1;
    expect(validHistoryEntry(restored)).toBe(false);
  });
  it("merges live carry once while retaining repeated occurrences within the same window", () => {
    const { season, news } = fixture();
    season.rosterNews = [news, { ...news }];
    const archived = buildSeasonHistoryEntry(season, 1);
    const next = { ...season, id: "following", franchise: { ...season.franchise!, year: 2 } };
    const rows = collectMarketHistory([archived], next);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.year === 1)).toBe(true);
    expect(new Set(rows.map(r => r.id)).size).toBe(2);
  });
  it("orders by simulation year and window, with unknown dates last in either direction", () => {
    const { season, news } = fixture();
    season.rosterNews = [news, { ...news, entrantName: "Offseason signing", origin: marketOrigin(season, "Offseason") }, { ...news, entrantName: "Unknown", origin: undefined }];
    const rows = collectMarketHistory([], season);
    expect(filterMarketHistory(rows, DEFAULT_MARKET_FILTERS).map(r => r.playerName)).toEqual(["Offseason signing", "New prospect", "Unknown"]);
    expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, order: "oldest" }).map(r => r.playerName)).toEqual(["New prospect", "Offseason signing", "Unknown"]);
  });
  it("filters both sides of a cross-region swap and preserves identically named teams in different regions", () => {
    const { season, team } = fixture();
    const other = season.teams.find(t => t.leagueId !== team.leagueId)!;
    other.name = team.name;
    season.rosterNews = [];
    season.transfersByEvent = { msi: [{ event: "msi", origin: marketOrigin(season, "msi"), lane: "top", fromTeamId: team.id, toTeamId: other.id,
      star: { name: "One", tier: "A", grade: null, goodChamps: [] }, swap: { name: "Two", tier: "B", grade: null, goodChamps: [] } }] };
    const rows = collectMarketHistory([], season);
    expect(rows).toHaveLength(2);
    expect(marketTeamKey(rows[0].from.team!)).not.toBe(marketTeamKey(rows[0].to.team!));
    expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, region: [other.leagueId], year: "1", window: "MSI window", lane: ["top"], status: "main", kind: "transfer", search: "One" })).toHaveLength(1);
    expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, team: marketTeamKey(rows[0].to.team!) })).toHaveLength(2);
    expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, lane: ["support"] })).toHaveLength(0);
  });
  it("distinguishes academy arrivals, demotions, free agency and retirement without inventing the prior retired status", () => {
    const { season, news } = fixture();
    season.rosterNews = [news, { ...news, entrantName: "", departedName: "Benched", marketNote: "manual-demote" },
      { ...news, entrantName: "Released", entrantSource: "free-agent", marketNote: "became-fa" },
      { ...news, entrantName: "Veteran", entrantSource: "free-agent", marketNote: "retired" }];
    expect(collectMarketHistory([], season).map(r => [r.kind, r.from.status, r.to.status])).toEqual([
      ["rookie", "rookie", "academy"], ["demotion", "main", "academy"], ["release", "academy", "free-agent"], ["retirement", "unknown", "retired"],
    ]);
  });
  it("keeps old archives readable without inventing market news or simulation years", () => {
    const legacy: SeasonHistoryEntry = { id: "old", name: "Old", archivedAt: 123, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
      transfers: [{ event: "worlds", lane: "top", from: null, to: null, inName: "Old player", inTier: "A", outTier: "B" }] };
    expect(validHistoryEntry(legacy)).toBe(true);
    expect(collectMarketHistory([legacy])[0].year).toBeNull();
    expect(legacy.marketNews).toBeUndefined();
  });
  it("retains closing-year lifecycle news in the archive through repeated rollovers", () => {
    const { season, news } = fixture();
    season.status = "complete";
    season.config.playerTransfers = false;
    season.franchise!.aging = false;
    const closing = { ...news, entrantName: "Closing rookie", timeMark: "Offseason", origin: marketOrigin(season, "Offseason") };
    season.rosterNews!.push(closing);
    const first = startNextSeasonWithArchive(JSON.parse(JSON.stringify(season)), localChampions(), () => 0.5);
    const next = first.season;
    const archived = first.archived!;
    expect(archived.marketNews!.map(n => n.entrantName)).toEqual(["New prospect", "Closing rookie"]);
    expect(collectMarketHistory([archived], next)).toHaveLength(2);
    next.status = "complete";
    const third = startNextSeasonWithArchive(next, localChampions(), () => 0.5);
    expect(third.archived!.marketNews).toEqual([]);
  });
});


it("persists retirement generated during rollover in the real store archive", async () => {
  const { rollFranchiseToNextYearState } = await import("../../store/draftStore");
  const { season, team } = fixture();
  season.status = "complete";
  season.franchise!.year = 10;
  season.franchise!.aging = true;
  season.config.playerTransfers = false;
  season.franchise!.inactivePool = [{
    player: { ...team.players[0], id: "retiring-fixture", name: "Retirement fixture", age: 38 },
    status: "free-agent", inactiveYears: 7, demotedYear: 1, clockYear: 1,
    lastTeamId: team.id, lastTeamName: team.name,
  }];
  const result = rollFranchiseToNextYearState(season, localChampions(), []);
  const archived = result.history.find(entry => entry.id === season.id)!;
  const retirement = archived.marketNews!.find(news => news.entrantId === "retiring-fixture");
  expect(retirement).toMatchObject({ marketNote: "retired", origin: { seasonId: season.id, year: 10, windowId: `${season.id}:Offseason` } });
  expect(collectMarketHistory(result.history, result.season).filter(row => row.playerId === "retiring-fixture")).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(archived)).marketNews).toContainEqual(JSON.parse(JSON.stringify(retirement)));
});


it("does not relabel legacy carried offseason transfers as current-year moves", () => {
  const { season, team } = fixture();
  const transfer = { event: "worlds" as const, lane: "top" as const, fromTeamId: team.id, toTeamId: season.teams[1].id,
    star: { name: "Legacy star", tier: "A" as const, grade: null, goodChamps: [] }, swap: { name: "Legacy swap", tier: "B" as const, grade: null, goodChamps: [] } };
  season.rosterNews = [];
  season.transfersByEvent = { worlds: [transfer] };
  season.status = "complete";
  season.worldsOffseasonBaseline = 0;
  const archived = buildSeasonHistoryEntry(season, 1);
  const next = { ...season, id: "next", status: "in-progress" as const, franchise: { ...season.franchise!, year: 2 } };
  expect(collectMarketHistory([archived], next)).toHaveLength(2);
  expect(collectMarketHistory([], next).every(row => row.year == null)).toBe(true);
  const completed = { ...next, status: "complete" as const };
  completed.worldsOffseasonBaseline = 0;
  expect(collectMarketHistory([archived], completed)).toHaveLength(4);
});


it("filters each post-split window separately from post-international moves in chronological order", () => {
  const { season, news } = fixture();
  const windows = ["Winter", "First Stand window", "Spring", "MSI window", "Summer", "Offseason"];
  season.rosterNews = windows.map(window => ({ ...news, entrantName: window, timeMark: window, origin: marketOrigin(season, window) }));
  const rows = collectMarketHistory([], season);
  expect(filterMarketHistory(rows, DEFAULT_MARKET_FILTERS).map(row => row.window)).toEqual([...windows].reverse());
  for (const split of ["Winter", "Spring", "Summer"]) {
    const filtered = filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, window: split });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].playerName).toBe(split);
    expect(marketWindowLabel(filtered[0].window!)).toBe(`Post ${split} Split`);
  }
  expect(season.rosterNews.map(row => row.origin?.windowId)).toEqual(windows.map(window => `${season.id}:${window}`));
});


it("combines multiple regions and roles with OR inside each group and AND between groups", () => {
  const { season, news, team } = fixture();
  const other = season.teams.find(t => t.leagueId !== team.leagueId)!;
  season.rosterNews = [news, { ...news, teamId: other.id, lane: "support", entrantName: "Other support" }, { ...news, lane: "jungle", entrantName: "Jungle" }];
  const rows = collectMarketHistory([], season);
  expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, region: [team.leagueId, other.leagueId], lane: ["top", "support"] })).toHaveLength(2);
  expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, region: [team.leagueId], lane: ["top", "support"] })).toHaveLength(1);
  expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, lane: ["top", "support", "jungle"] })).toHaveLength(3);
  expect(filterMarketHistory(rows, DEFAULT_MARKET_FILTERS)).toHaveLength(3);
});

it("offers every recorded year even when an archive has no movement rows", () => {
  const { season } = fixture();
  const archive = buildSeasonHistoryEntry(season, 1);
  archive.marketNews = []; archive.transfers = [];
  season.franchise!.year = 5;
  expect(marketHistoryYears([archive], season, [])).toEqual([5, 1]);
});
it("retains retirement provenance and age across archive/import without inventing old tenure", () => {
  const { season, news } = fixture();
  season.rosterNews = [{ ...news, marketNote: "retired", retirement: { from: "academy", age: 27, academyYears: 3, freeAgentYears: 1 } }];
  const archive = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
  expect(validHistoryEntry(archive)).toBe(true);
  expect(collectMarketHistory([archive])[0]).toMatchObject({ from: { status: "academy" }, retirement: { age: 27, academyYears: 3, freeAgentYears: 1 } });
  archive.marketNews[0].retirement.freeAgentYears = -1;
  expect(validHistoryEntry(archive)).toBe(false);
  delete archive.marketNews[0].retirement;
  expect(collectMarketHistory([archive])[0].from.status).toBe("unknown");
  expect(collectMarketHistory([archive])[0].retirement?.academyYears).toBeUndefined();
});


it("shows paired promotions/demotions with their own tiers, and never invents a demotion for a vacancy", () => {
  const { season, news } = fixture();
  const promotion = { ...news, entrantSource: "academy" as const, marketNote: "academy-recall" as const, departedId: "old-starter", departedName: "Old starter", departedTier: "C" as const, departedDestination: "academy" as const };
  season.rosterNews = [promotion];
  const rows = collectMarketHistory([], season);
  expect(rows).toHaveLength(2);
  expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, kind: "demotion", tier: "C" })[0]).toMatchObject({ playerId: "old-starter", tier: "C", from: { status: "main" }, to: { status: "academy" } });
  expect(filterMarketHistory(rows, { ...DEFAULT_MARKET_FILTERS, kind: "promotion", tier: "A" })).toHaveLength(1);
  season.rosterNews = [promotion, { ...promotion, marketNote: "manual-demote" }];
  expect(collectMarketHistory([], season).filter(r => r.kind === "demotion")).toHaveLength(1);
  season.rosterNews = [{ ...promotion, departedDestination: undefined, departedId: undefined, departedName: undefined }];
  expect(collectMarketHistory([], season)).toHaveLength(1);
  season.rosterNews = [{ ...news, marketNote: "agency-override" }];
  expect(collectMarketHistory([], season)).toEqual([]);
});
it("archives and validates the explicitly recorded demotion destination", () => {
  const { season, news } = fixture();
  season.rosterNews = [{ ...news, entrantSource: "academy", marketNote: "academy-recall", departedId: "old", departedName: "Old", departedDestination: "academy" }];
  const archive = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
  expect(validHistoryEntry(archive)).toBe(true);
  expect(collectMarketHistory([archive]).filter(r => r.kind === "demotion")).toHaveLength(1);
  archive.marketNews[0].departedDestination = "invented";
  expect(validHistoryEntry(archive)).toBe(false);
});
