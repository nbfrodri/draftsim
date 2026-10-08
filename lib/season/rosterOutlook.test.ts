import { describe, expect, it, vi } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { LANE_ORDER } from "../players";
import type { Champion, GameDraft } from "../types";
import type { SeasonState } from "./types";
import { buildRosterOutlook, classifyOutlook, nextRosterWindow, sampleRosterWindow, rosterSeats, rosterOutlookSteps } from "./rosterOutlook";
import { isOutlookRookie } from "./rosterOutlookView";
import { applyMidSplitDemotions, buildSplitCheckpointOutcomes, resolveOffseasonPlayerMarket } from "./franchise";
import { seasonPlayerGrades } from "./playerGrades";
import { computeRoleMeans, isUnderperformingSeason, nextBadStreak } from "./playerLifecycle";

const champions: Champion[] = LANE_ORDER.flatMap((lane, li) => Array.from({ length: 6 }, (_, i) => ({
  id: li * 10 + i, name: `${lane}${i}`, alias: `${lane}${i}`, roles: [], iconUrl: "", lanes: [lane],
})));

function fixture(): SeasonState {
  const season = makeAuditSeason("Outlook");
  season.teams = season.teams.slice(0, 2).map((t, ti) => ({ ...t, id: `team-${ti}`, name: `Team ${ti}`, players: LANE_ORDER.map((lane, i) => ({
    id: `${ti}-${lane}`, name: `${ti} ${lane}`, lane, tier: "B", age: 23, potential: "B", goodChamps: [i * 10], badChamps: [],
  })) }));
  season.phases = [
    { kind: "split", split: "winter", label: "Winter", status: "in-progress", tournamentIds: ["winter"] },
    { kind: "international", event: "first-stand", label: "First Stand", status: "pending", tournamentIds: [] },
    { kind: "transfer", event: "first-stand", label: "Transfers", status: "pending", tournamentIds: [] },
    { kind: "split", split: "spring", label: "Spring", status: "pending", tournamentIds: [] },
    { kind: "international", event: "msi", label: "MSI", status: "pending", tournamentIds: [] },
    { kind: "transfer", event: "msi", label: "Transfers", status: "pending", tournamentIds: [] },
    { kind: "split", split: "summer", label: "Summer", status: "pending", tournamentIds: [] },
    { kind: "international", event: "worlds", label: "Worlds", status: "pending", tournamentIds: [] },
    { kind: "international", event: "global-cup", label: "Global Cup", status: "pending", tournamentIds: [] },
  ];
  season.phaseIndex = 0;
  season.config.playerTransfers = true;
  const tournament = Object.values(season.tournaments)[0];
  const match = tournament.matches[0];
  const game = { id: "game", status: "complete", winner: "red", blueTeam: "Team 1", redTeam: "Team 0",
    recap: { ratings: { blue: [8, 8, 8, 8, 8], red: [3, 7, 7, 7, 7] },
      perPickIds: { blue: season.teams[1].players.map(p => p.id), red: season.teams[0].players.map(p => p.id) } },
  } as unknown as GameDraft;
  season.tournaments = { winter: { ...tournament, id: "winter", matches: [{ ...match, blueTeamId: "team-0", redTeamId: "team-1",
    isBye: false, series: { ...match.series!, games: [game] } }] } };
  return season;
}

function freeze(value: unknown) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
}

describe("next roster window", () => {
  it("uses split checkpoints unless a followed team's demotions are deferred", () => {
    const season = fixture();
    expect(nextRosterWindow(season)).toMatchObject({ kind: "split", split: "winter" });
    season.config.controlledTeamId = "team-0";
    expect(nextRosterWindow(season)).toMatchObject({ kind: "transfer", event: "first-stand", split: "winter", opening: true });
    season.phaseIndex = 2;
    season.phases[2].status = "in-progress";
    season.franchise!.pendingMidSplitDemotion = "winter";
    expect(nextRosterWindow(season)).toMatchObject({ kind: "transfer", opening: false, split: "winter" });
    season.phaseIndex = 6;
    expect(nextRosterWindow(season)).toMatchObject({ kind: "split", split: "summer" });
  });
  it("does not invent a Worlds or Global Cup transfer window, or rerun completed offseason agency", () => {
    const season = fixture();
    for (const index of [7, 8]) {
      season.phaseIndex = index;
      expect(nextRosterWindow(season)).toMatchObject({ kind: "offseason", opening: true });
    }
    season.status = "complete";
    expect(nextRosterWindow(season)).toMatchObject({ kind: "offseason", opening: false });
    season.config.playerTransfers = false;
    season.franchise!.aging = false;
    expect(nextRosterWindow(season).kind).toBe("none");
  });
});

describe("role-relative demotion grades", () => {
  it("does not give a replacement the former starter's legacy grades", () => {
    const season = fixture();
    const recap = season.tournaments.winter.matches[0].series!.games[0].recap!;
    delete recap.perPickIds;
    recap.perPickNames = { blue: season.teams[1].players.map(p => p.name!), red: season.teams[0].players.map(p => p.name!) };
    season.teams[0].players[0] = { ...season.teams[0].players[0], id: "replacement", name: "Replacement" };
    expect(seasonPlayerGrades(season).has("replacement")).toBe(false);
    expect(seasonPlayerGrades(season).get("0-jungle")).toBe(7);
    recap.perPickNames.red[1] = "";
    expect(seasonPlayerGrades(season).has("0-jungle")).toBe(false);
  });
  it("follows player IDs across teams and swapped sides, with genuinely empty scopes", () => {
    const season = fixture();
    const [a, b] = season.teams;
    [a.players[0], b.players[0]] = [b.players[0], a.players[0]];
    expect(seasonPlayerGrades(season).get("0-top")).toBe(3);
    expect(buildSplitCheckpointOutcomes(season, "winter").outcomes.get("0-top")?.grade).toBe(3);
    expect(buildSplitCheckpointOutcomes(season, "spring").outcomes.get("0-top")?.grade).toBeNull();
    expect(seasonPlayerGrades(season, [])).toEqual(new Map());
  });
  it("does not invent identities for holes in recorded IDs or ratings for legacy unknowns", () => {
    const season = fixture();
    const recap = season.tournaments.winter.matches[0].series!.games[0].recap!;
    recap.perPickIds!.red[0] = "";
    recap.ratings!.red[1] = Infinity;
    expect(seasonPlayerGrades(season).has("0-top")).toBe(false);
    expect(seasonPlayerGrades(season).has("0-jungle")).toBe(false);
    const outcome = { playerId: "p", lane: "top" as const, grade: Infinity, tier: "B" as const, splitTitles: 0, intlTitles: 0 };
    expect(computeRoleMeans([outcome])).toEqual({});
    expect(isUnderperformingSeason({ ...outcome, grade: 0 }, 6)).toBe(false);
    expect(isUnderperformingSeason({ ...outcome, grade: 5.1 }, 6)).toBe(true);
    expect(isUnderperformingSeason({ ...outcome, grade: 5.11 }, 6)).toBe(false);
    expect(nextBadStreak(4, { ...outcome, grade: 3, intlTitles: 1 }, 6)).toBe(0);
    expect(nextBadStreak(4, { ...outcome, grade: null }, 6)).toBe(4);
    expect(isUnderperformingSeason({ ...outcome, grade: 5.2 }, 6.1)).toBe(true);
  });
});

describe("roster outlook sampling", () => {
  it("reports real progress without changing sampled outcomes", () => {
    const season = fixture();
    season.teams[0].players[0].badStreak = 4;
    const steps = rosterOutlookSteps(season, champions, 19);
    const progress = [];
    let step = steps.next();
    while (!step.done) { progress.push(step.value); step = steps.next(); }
    expect(progress).toEqual([0, 8, 16, 19].map(completed => ({ completed, total: 19 })));
    expect(step.value).toEqual(buildRosterOutlook(season, champions, 19));
  });

  it("keeps existing rookies in all roster statuses and samples their actual movements", () => {
    const season = fixture();
    const rookie = season.teams[0].players[0];
    rookie.debutYear = season.franchise!.year;
    rookie.badStreak = 4;
    season.franchise!.inactivePool = [
      { player: { ...rookie, id: "rookie-academy", tier: "S" }, status: "academy", inactiveYears: 0, demotedYear: 1, lastTeamId: "team-1", shadowGrade: 8 },
      { player: { ...rookie, id: "rookie-fa", tier: "A" }, status: "free-agent", inactiveYears: 0, demotedYear: 1, lastTeamId: "", shadowGrade: 7 },
    ];
    const beforeIds = [...rosterSeats(season).keys()].sort();
    const result = buildRosterOutlook(season, champions, 8);
    expect(result.rows.map(row => row.id).sort()).toEqual(beforeIds);
    expect(result.rows.find(row => row.id === rookie.id)?.counts.academy).toBe(8);
    for (const id of [rookie.id, "rookie-academy", "rookie-fa"]) {
      expect(isOutlookRookie(result.rows.find(row => row.id === id)!.player, season.franchise!.year)).toBe(true);
    }
    expect(isOutlookRookie(rookie, season.franchise!.year + 1)).toBe(false);
    expect(isOutlookRookie({}, season.franchise!.year)).toBe(false);
    expect(isOutlookRookie(rookie, undefined)).toBe(false);
  });

  it("reuses checkpoint evaluation only for the same source and split", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(123456789);
    try {
      const season = fixture();
      const checkpoint = { source: season, split: "winter" as const, evaluation: buildSplitCheckpointOutcomes(season, "winter") };
      expect(applyMidSplitDemotions(season, "winter", champions, () => 0.99, checkpoint))
        .toEqual(applyMidSplitDemotions(season, "winter", champions, () => 0.99));
      const changed = structuredClone(season);
      changed.teams[0].players[0].badStreak = 4;
      changed.tournaments.winter.matches[0].series!.games[0].recap!.ratings!.red[0] = 8;
      expect(applyMidSplitDemotions(changed, "winter", champions, () => 0.99, checkpoint))
        .toEqual(applyMidSplitDemotions(changed, "winter", champions, () => 0.99));
      expect(applyMidSplitDemotions(season, "spring", champions, () => 0.99, checkpoint))
        .toEqual(applyMidSplitDemotions(season, "spring", champions, () => 0.99));
    } finally { clock.mockRestore(); }
  });

  it("does not require champions or sample retained seats when no automatic window exists", () => {
    const season = fixture();
    season.config.playerTransfers = false;
    season.franchise!.aging = false;
    expect(buildRosterOutlook(season, [])).toMatchObject({ window: { kind: "none" }, samples: 0, rows: [] });
  });

  it("ignores obsolete manual proposals and requests after the player has moved", () => {
    const season = fixture();
    season.config.controlledTeamId = "team-0";
    season.phaseIndex = 2;
    season.phases[2].status = "in-progress";
    const mine = season.teams[0].players[0];
    const theirs = season.teams[1].players[0];
    season.proposedTransfers = [{ event: "first-stand", lane: "top", laneIndex: 0, kind: "outgoing",
      controlledTeamId: "team-0", otherTeamId: "team-1", mine, theirs }];
    expect(buildRosterOutlook(season, champions, 1).rows.find(row => row.id === mine.id)?.manualChoiceCount).toBe(1);
    season.proposedTransfers[0].event = "msi";
    expect(buildRosterOutlook(season, champions, 1).rows.find(row => row.id === mine.id)?.manualChoiceCount).toBe(0);
    season.proposedTransfers[0].event = "first-stand";
    season.teams[1].players[0] = { ...theirs, id: "new-starter" };
    expect(buildRosterOutlook(season, champions, 1).rows.find(row => row.id === mine.id)?.manualChoiceCount).toBe(0);
    season.proposedTransfers = [];
    season.franchise!.agencyDemands = [{ id: "old", playerId: theirs.id!, playerTier: "B", lane: "top", kind: "leave",
      fromTeamId: "team-0", wantRole: "fa", preferenceGap: 1.5, status: "pending" }];
    season.teams[1].players[0] = theirs;
    expect(buildRosterOutlook(season, champions, 1).rows.find(row => row.id === theirs.id)?.manualChoiceCount).toBe(0);
  });
  it("is deterministic, leaves frozen inputs untouched and never consumes the live RNG", () => {
    const season = fixture();
    season.teams[0].players[0].badStreak = 4;
    const before = structuredClone(season);
    freeze(season);
    const liveRng = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Live RNG used"); });
    try {
      const result = buildRosterOutlook(season, champions, 12);
      expect(buildRosterOutlook(season, champions, 12)).toEqual(result);
      expect(season).toEqual(before);
      const weak = result.rows.find(row => row.id === "0-top")!;
      expect(weak.counts.academy).toBe(12);
      expect(weak.nextStreak).toBe(5);
      for (const row of result.rows) expect(Object.values(row.counts).reduce((a, b) => a + b, 0)).toBe(12);
    } finally { liveRng.mockRestore(); }
  });

  it("samples the same split and offseason market transitions as the live engine", () => {
    const season = fixture();
    const split = sampleRosterWindow(season, champions, nextRosterWindow(season), () => 0.99).season;
    const actual = applyMidSplitDemotions(season, "winter", champions, () => 0.99);
    expect(rosterSeats(split)).toEqual(rosterSeats(actual));
    season.status = "complete";
    const off = sampleRosterWindow(season, champions, nextRosterWindow(season), () => 0.99).season;
    const market = resolveOffseasonPlayerMarket(season, champions, () => 0.99);
    expect(off.teams).toEqual(market.evolvedTeams);
  });

  it("includes academy and FA outcomes and keeps pending manual choices separate", () => {
    const season = fixture();
    season.config.controlledTeamId = "team-0";
    season.phaseIndex = 2;
    season.phases[2].status = "in-progress";
    season.franchise!.inactivePool = [
      { player: { ...season.teams[0].players[0], id: "prospect", tier: "S" }, status: "academy", inactiveYears: 1, demotedYear: 1, lastTeamId: "team-1" },
      { player: { ...season.teams[0].players[0], id: "unsigned", tier: "A" }, status: "free-agent", inactiveYears: 4, demotedYear: 1, lastTeamId: "" },
    ];
    season.franchise!.agencyDemands = [{ id: "d", playerId: "0-top", playerTier: "B", lane: "top", kind: "leave",
      fromTeamId: "team-0", wantRole: "fa", preferenceGap: 1.5, status: "pending" }];
    const result = buildRosterOutlook(season, champions, 4);
    expect(result.rows.find(row => row.id === "prospect")?.seat.status).toBe("academy");
    expect(result.rows.find(row => row.id === "unsigned")?.seat.status).toBe("free-agent");
    expect(result.rows.find(row => row.id === "0-top")).toMatchObject({ manualChoiceCount: 4, counts: { stay: 4 } });
  });

  it("has exclusive outcomes, including another club's academy and FA signings", () => {
    expect(classifyOutlook({ status: "main", teamId: "a" }, { status: "academy", teamId: "b" })).toBe("transfer");
    expect(classifyOutlook({ status: "main", teamId: "a" }, { status: "academy", teamId: "a" })).toBe("academy");
    expect(classifyOutlook({ status: "free-agent" }, { status: "main", teamId: "a" })).toBe("main");
    expect(classifyOutlook({ status: "academy", teamId: "a" }, { status: "retired" })).toBe("retired");
  });

  it("samples actual academy promotions and competing FA bids, then refreshes after a roster change", () => {
    const season = fixture();
    season.franchise!.inactivePool = [
      { player: { ...season.teams[0].players[1], id: "upgrade", tier: "S" }, status: "academy", inactiveYears: 1, demotedYear: 1, lastTeamId: "team-0", shadowGrade: 8 },
      { player: { ...season.teams[0].players[2], id: "fa-upgrade", tier: "S" }, status: "free-agent", inactiveYears: 4, demotedYear: 1, lastTeamId: "", shadowGrade: 8 },
    ];
    const forecast = buildRosterOutlook(season, champions, 160);
    const academy = forecast.rows.find(row => row.id === "upgrade")!;
    expect(academy.counts.main / 160).toBeGreaterThan(0.45);
    expect(academy.counts.main / 160).toBeLessThan(0.8);
    const fa = forecast.rows.find(row => row.id === "fa-upgrade")!;
    expect(fa.counts.main / 160).toBeGreaterThan(0.1);
    expect(fa.counts.main / 160).toBeLessThan(0.5);
    season.teams[0].players[1] = { ...season.teams[0].players[1], tier: "S+" };
    expect(buildRosterOutlook(season, champions, 20).rows.find(row => row.id === "upgrade")!.counts.main).toBe(0);
  });

  it.each(["transfer", "offseason"] as const)("keeps %s forecasts pure and deterministic", kind => {
    const season = fixture();
    season.config.controlledTeamId = "team-0";
    if (kind === "offseason") season.status = "complete";
    else season.phaseIndex = 1;
    const before = structuredClone(season);
    freeze(season);
    const liveRng = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Live RNG used"); });
    try {
      const result = buildRosterOutlook(season, champions, 6);
      expect(result.window.kind).toBe(kind);
      expect(buildRosterOutlook(season, champions, 6)).toEqual(result);
      expect(season).toEqual(before);
    } finally { liveRng.mockRestore(); }
  });
});
