import { describe, expect, it } from "vitest";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import { computeIntlAppearances, computePlayerCareers, computePlayerIntlAppearances, compareTeams } from "./historyRecords";
import { matchesIntlAppearanceFilters, playerProfile, type IntlAppearanceFilters } from "./historySearch";
import { teamIntlOutcome } from "./placements";
import { INTERNATIONAL_DISPLAY_ORDER, type TeamRosterSnapshot } from "./types";

const entrant: SeasonHistoryTeamRef = { name: "Attendee", leagueId: "LCK" };
const dnq: SeasonHistoryTeamRef = { name: "Attendee", leagueId: "LEC" };
function roster(team: SeasonHistoryTeamRef, id: string): TeamRosterSnapshot {
  return { teamId: `${team.leagueId}:${team.name}`, teamName: team.name, leagueId: team.leagueId,
    players: [{ id, name: "Namesake", lane: "top", tier: "A" }] };
}
function fixture(): SeasonHistoryEntry {
  return { id: "year-1", name: "Year 1", archivedAt: 1, complete: true, champion: entrant, runnerUp: null,
    intlChampions: {}, splitChampions: {},
    intlPlacements: Object.fromEntries(INTERNATIONAL_DISPLAY_ORDER.map(event => [event, [entrant]])),
    phaseRosters: INTERNATIONAL_DISPLAY_ORDER.map((event, phaseIndex) => ({ kind: "international", event, label: event, phaseIndex,
      teams: [roster(entrant, "attendee"), roster(dnq, "dnq")], inactive: [{ playerId: "academy", status: "academy", teamId: "Attendee" }],
    })),
    playerCareers: ["attendee", "dnq", "academy"].map(playerId => ({ playerId, playerName: "Namesake", leagueId: "LCK", teamName: "Attendee",
      games: 10, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlTitles: 0, intlAppearances: 4 })),
  };
}

describe("international attendance", () => {
  it("excludes DNQ and inactive players from all four events despite all-team snapshots and stale totals", () => {
    const entry = fixture();
    const original = structuredClone(entry);
    const players = computePlayerIntlAppearances([entry]);
    expect(players.get("attendee")?.total).toBe(4);
    for (const id of ["dnq", "academy"]) {
      expect(players.get(id)).toEqual({ byEvent: {}, total: 0, incomplete: false });
      expect(computePlayerCareers([entry]).find(p => p.playerId === id)?.intlAppearances).toBe(0);
      expect(playerProfile([entry], id)?.intlAppearances).toEqual({});
    }
    expect(computeIntlAppearances([entry]).map(t => [t.key, t.total])).toEqual([["LCK:Attendee", 4]]);
    for (const event of INTERNATIONAL_DISPLAY_ORDER) expect(teamIntlOutcome(entry, dnq, event)?.kind).toBe("did-not-qualify");
    expect(compareTeams([entry], [], "LCK:Attendee", "LEC:Attendee")?.intlAppearancesB).toBe(0);
    expect(entry).toEqual(original);
  });

  it("counts play-in exits once, follows stable player IDs through transfers, and counts separate years", () => {
    const entry = fixture();
    const phase = entry.phaseRosters![1];
    phase.teams = [roster(entrant, "other"), roster(dnq, "attendee")];
    entry.intlPlacements!.msi!.push(dnq); // played the play-in and was eliminated
    entry.intlMainBracketSizes = { msi: 1 };
    entry.phaseRosters!.push({ ...phase, phaseIndex: 5, label: "MSI Play-In" });
    const next = structuredClone(entry); next.id = "year-2"; next.archivedAt = 2;
    expect(computePlayerIntlAppearances([entry, next]).get("attendee")).toEqual({
      byEvent: { "first-stand": 2, msi: 2, worlds: 2, "global-cup": 2 }, total: 8, incomplete: false,
    });
    expect(computeIntlAppearances([entry, next]).find(t => t.key === "LEC:Attendee")?.byEvent).toEqual({ msi: 2 });
  });

  it("preserves unknown legacy totals without assigning them to specific events", () => {
    const entry = fixture(); delete entry.phaseRosters;
    const result = computePlayerIntlAppearances([entry]).get("attendee")!;
    expect(result).toEqual({ byEvent: {}, total: 4, incomplete: true });
    expect(matchesIntlAppearanceFilters(result, { enabled: true, events: [], match: "any", minimum: 4 })).toBe(true);
    expect(matchesIntlAppearanceFilters(result, { enabled: true, events: ["msi"], match: "any", minimum: 1 })).toBe(false);
  });

  it.each([true, false])("keeps pre-academy appearances without crediting academy affiliation (full results: %s)", fullResults => {
    const entry = fixture();
    if (!fullResults) {
      delete entry.intlPlacements;
      entry.intlChampions = Object.fromEntries(INTERNATIONAL_DISPLAY_ORDER.map(event => [event, entrant]));
    }
    for (const phase of entry.phaseRosters!.slice(1)) {
      phase.teams[0] = roster(entrant, "replacement");
      phase.inactive!.push({ playerId: "attendee", status: "academy", teamId: "LCK:Attendee", teamName: "Attendee" });
    }
    expect(computePlayerIntlAppearances([entry]).get("attendee")).toEqual({
      byEvent: { "first-stand": 1 }, total: 1, incomplete: false,
    });
    const career = computePlayerCareers([entry]).find(player => player.playerId === "attendee")!;
    expect(career.intlAppearances).toBe(1);
    expect(matchesIntlAppearanceFilters({ byEvent: career.intlAppearancesByEvent!, total: career.intlAppearances }, {
      enabled: true, events: ["msi", "worlds", "global-cup"], match: "any", minimum: 1,
    })).toBe(false);
    expect(computeIntlAppearances([entry])[0].total).toBe(4);
  });
});

describe("international appearance filters", () => {
  const appearances = { byEvent: { msi: 2, worlds: 1 }, total: 3 };
  const filters: IntlAppearanceFilters = { enabled: true, events: ["msi", "worlds"], match: "any", minimum: 3 };
  it("uses the combined selected-event minimum and excludes DNQ", () => {
    expect(matchesIntlAppearanceFilters(appearances, filters)).toBe(true);
    expect(matchesIntlAppearanceFilters(appearances, { ...filters, minimum: 4 })).toBe(false);
    expect(matchesIntlAppearanceFilters(appearances, { ...filters, events: ["msi"] })).toBe(false);
    expect(matchesIntlAppearanceFilters(undefined, filters)).toBe(false);
    expect(matchesIntlAppearanceFilters(undefined, { ...filters, enabled: false })).toBe(true);
  });
  it("supports OR and AND independently of the minimum", () => {
    const selected: IntlAppearanceFilters = { ...filters, events: ["msi", "first-stand"], minimum: 1 };
    expect(matchesIntlAppearanceFilters(appearances, selected)).toBe(true);
    expect(matchesIntlAppearanceFilters(appearances, { ...selected, match: "all" })).toBe(false);
    expect(matchesIntlAppearanceFilters(appearances, { ...filters, match: "all" })).toBe(true);
  });
});
