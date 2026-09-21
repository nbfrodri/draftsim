import { describe, it, expect } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { validHistoryEntry, validSeason } from "../importValidation";
import { captureMarketTeamSnapshots } from "./marketSnapshots";
import { withRosterTimeMark } from "./playerLifecycle";
import { buildSeasonHistoryEntry } from "./history";
import { collectMarketHistory } from "./marketHistory";

describe("market roster snapshots", () => {
  it("freezes both sides, archives and imports them without substituting a later roster", () => {
    const season = makeAuditSeason();
    const original = season.teams[0];
    const next = structuredClone(season.teams);
    next[0].players[0] = { ...next[0].players[0], id: "new-top", name: "New top" };
    const snapshots = captureMarketTeamSnapshots(season.teams, next, [original.id], { before: season.franchise.inactivePool ?? [], after: season.franchise.inactivePool ?? [] });
    const news = withRosterTimeMark([{ teamId: original.id, lane: "top" as const, entrantName: "New top", entrantId: "new-top", entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "free-agent" as const }], "Winter", season, next);
    expect(news[0].teamSnapshots).toEqual(snapshots);
    const beforeName = snapshots[0].before[0].name;
    original.players[0].name = "Later changed old roster";
    next[0].players[0].name = "Later changed new roster";
    expect(snapshots[0].before[0].name).toBe(beforeName);
    expect(snapshots[0].after[0].name).toBe("New top");
    season.rosterNews = news;
    const archive = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
    expect(validHistoryEntry(archive)).toBe(true);
    // JSON normalizes negative zero in generated chemistry values.
    expect(collectMarketHistory([archive])[0].teamSnapshots).toEqual(JSON.parse(JSON.stringify(snapshots)));
    const later = { ...season, id: "next", teams: next };
    expect(withRosterTimeMark(news, "Offseason", later)[0].teamSnapshots).toEqual(snapshots);
    archive.marketNews[0].teamSnapshots[0].after[0].tier = "INVALID";
    expect(validHistoryEntry(archive)).toBe(false);
    expect(validSeason({ ...season, rosterNews: archive.marketNews })).toBe(false);
  });
  it("keeps old news without snapshots unknown instead of stamping current rosters", () => {
    const season = makeAuditSeason();
    const old = { teamId: season.teams[0].id, origin: { seasonId: "old", year: 1, windowId: "old:Winter" } };
    expect(withRosterTimeMark([old], "Offseason", season)[0]).not.toHaveProperty("teamSnapshots");
    expect(captureMarketTeamSnapshots(season.teams, [], [season.teams[0].id])).toEqual([]);
  });
});

it("freezes academy membership before and after a move and validates archived players", () => {
  const season = makeAuditSeason();
  const team = season.teams[0];
  const member = { player: { ...team.players[0], id: "prospect", name: "Prospect" }, status: "academy" as const, inactiveYears: 1, demotedYear: 1, lastTeamId: team.id };
  season.franchise.inactivePool = [member];
  const news = withRosterTimeMark([{ teamId: team.id, lane: "top" as const, entrantName: "Prospect", entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "academy" as const }], "Winter", season, season.teams, []);
  expect(news[0].teamSnapshots![0].academyBefore).toHaveLength(1);
  expect(news[0].teamSnapshots![0].academyAfter).toEqual([]);
  member.player.name = "Later name";
  expect(news[0].teamSnapshots![0].academyBefore![0].name).toBe("Prospect");
  season.rosterNews = news;
  const archived = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
  expect(validHistoryEntry(archived)).toBe(true);
  archived.marketNews[0].teamSnapshots[0].academyBefore[0].tier = "INVALID";
  expect(validHistoryEntry(archived)).toBe(false);
});
