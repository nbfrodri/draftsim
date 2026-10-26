import { describe, it, expect } from "vitest";
import { ssHistory, ssHistorySummary, playerSSHistory, ssStreaks, playerSSStreak, ssSeasonViews, ssRecords, ssRegionView, ssTimeline, snapshotSSHolders, recordSSLosses, type SSArchive } from "./ssHistory";
import { makeAuditSeason } from "../auditFixtures";
import type { SSHolder } from "./types";
import { validSeason, validHistoryEntry } from "../importValidation";
import { buildSeasonHistoryEntry } from "./history";
import { archivedSSContext } from "./playerCard";
import { deriveStar, tierValue } from "../players";
import { playerLaneTierBias } from "../matchSimulator";
import { applyUserManualDemote, startNextSeasonWithArchive } from "./franchise";
import { createRng } from "../rng";
import { applyPlayerDevelopment } from "./engine";

const holder = (playerId: string, phaseIndex = 0): SSHolder => ({ playerId, lane: "top", evidence: { baseTier: "S+", lane: "top", seasonId: "s", phaseIndex, phaseLabel: "Winter", games: 16, score: 7.2 } });
const archive = (overrides: Partial<SSArchive> = {}): SSArchive => ({ id: "s", name: "Year 1", ssOpening: [], ...overrides });

describe("SS history summary", () => {
	it("distinguishes unrecorded reviews from a recorded empty list", () => {
		const entry = archive({ ssReviews: undefined });
		expect(ssHistorySummary(entry)).toBeUndefined();
		expect(ssHistory(entry)).toEqual([]);
	});
	it.each([
		{ name: "no reviews", holders: [], reviews: 0, distinct: 0 },
		{ name: "a vacant review", holders: [[]], reviews: 1, distinct: 0 },
		{ name: "repeated ownership and replacement", holders: [[holder("a")], [holder("a")], [holder("b")], [holder("a")]], reviews: 4, distinct: 2 },
	])("matches the full projection for $name", ({ holders, reviews, distinct }) => {
		const entry = archive({ ssReviews: holders.map((holders, phaseIndex) => ({ phaseIndex, label: `Phase ${phaseIndex}`, holders })) });
		const checkpoints = ssHistory(entry);
		const summary = ssHistorySummary(entry);
		expect(summary).toEqual({ reviews, holders: distinct });
		expect(summary).toEqual({ reviews: checkpoints.length, holders: new Set(checkpoints.flatMap(c => c.holders.map(h => h.playerId))).size });
	});
});

describe("SS historical chronology", () => {
	it("records a development decline at its actual boundary without waiting for a later review", () => {
		const s = makeAuditSeason("Decline"); s.config.playerDevelopment = true;
		const p = s.teams[0].players[0]; p.tier = "SS"; p.ss = { ...holder(p.id!).evidence, baseTier: "S", lane: p.lane };
		let draws = 0;
		const next = applyPlayerDevelopment(s, () => draws++ === 0 ? 0 : 0.99);
		expect(next.teams[0].players[0].tier).toBe("A");
		expect(next.ssLosses).toMatchObject([{ holder: { playerId: p.id }, reason: "decline" }]);
	});
	it("keeps the played tier and final-phase acquisition visible as different facts", () => {
		const s = makeAuditSeason("Final phase");
		const p = s.teams[0].players[0];
		const h = { ...holder(p.id!), decision: "gained" as const };
		const entry = buildSeasonHistoryEntry(s, 1);
		entry.phaseRosters = [{ phaseIndex: 0, kind: "international", event: "worlds", label: "Worlds", teams: [{ teamId: s.teams[0].id, teamName: s.teams[0].name, leagueId: s.teams[0].leagueId, players: [{ id: p.id, name: p.name, lane: "top", tier: "S+" }] }] }];
		entry.ssReviews = [{ version: 1, phaseIndex: 0, label: "Worlds", holders: [h] }];
		expect(archivedSSContext(entry, p.id!, "worlds")).toContain("Tier during Worlds: S+. SS after Worlds · gained.");
		expect(archivedSSContext(entry, p.id!)).toContain("SS at last recorded ownership boundary");
		expect(entry.phaseRosters[0].teams[0].players[0].tier).toBe("S+");
	});
	it("removes a manually benched SS immediately and records the mutation once", () => {
		const s = makeAuditSeason("Benched");
		const p = s.teams[0].players[0];
		p.tier = "SS"; p.ss = { ...holder(p.id!).evidence, lane: p.lane };
		s.config.controlledTeamId = s.teams[0].id;
		s.status = "complete";
		const after = applyUserManualDemote(s, p.lane)!;
		expect(after.franchise!.inactivePool!.find(e => e.player.id === p.id)?.player.tier).not.toBe("SS");
		expect(after.ssLosses).toMatchObject([{ holder: { playerId: p.id }, reason: "inactive", label: "Offseason" }]);
	});
	it("starts a carried year with an ownership baseline and archives closing reviews without fabricating renewals", () => {
		const s = makeAuditSeason("Carry"); s.franchise.aging = false; s.status = "complete";
		const p = s.teams[0].players[0]; p.tier = "SS"; p.ss = { ...holder(p.id!).evidence, lane: p.lane, seasonId: s.id };
		s.ssReviews = [{ phaseIndex: 0, label: "Winter", holders: snapshotSSHolders(s.teams) }];
		const next = startNextSeasonWithArchive(s, [], createRng(42));
		expect(next.archived!.ssReviews).toEqual(s.ssReviews);
		expect(next.season.ssOpening).toMatchObject([{ playerId: p.id }]);
		expect(next.season.ssReviews).toBeUndefined();
	});
	it("keeps the unrounded SS contribution even when the stars cap hides it", () => {
		const roster = makeAuditSeason().teams[0].players.map(p => ({ ...p, tier: "S+" as const }));
		const ss = [{ ...roster[0], tier: "SS" as const }, ...roster.slice(1)];
		expect(ss.reduce((sum, p) => sum + tierValue(p.tier), 0) / 5 - roster.reduce((sum, p) => sum + tierValue(p.tier), 0) / 5).toBeCloseTo(0.1);
		expect(deriveStar(roster)).toBe(5); expect(deriveStar(ss)).toBe(5);
		expect(playerLaneTierBias(ss, roster, "top")).toBeGreaterThan(0);
	});
	it("counts acquisitions, renewals, replacement and reacquisition separately", () => {
		const a = holder("a"), b = holder("b");
		const entry = archive({ ssReviews: [[a], [a], [b], [a]].map((holders, phaseIndex) => ({ phaseIndex, label: `Phase ${phaseIndex}`, holders })) });
		expect(ssHistory(entry).map(c => c.holders[0].decision)).toEqual(["gained", "retained", "gained", "gained"]);
		expect(playerSSHistory([entry], "a")).toMatchObject({ acquisitions: 2, checkpoints: 3, years: 1, partial: false, losses: [{ phaseIndex: 2 }] });
	});
	it("distinguishes recorded vacancy from missing history and does not invent first acquisitions", () => {
		const legacy = archive({ ssOpening: undefined, ssReviews: [{ phaseIndex: 0, label: "Winter", holders: [holder("a")] }] });
		expect(ssHistory(legacy)[0].holders[0].decision).toBeUndefined();
		expect(playerSSHistory([legacy], "a")).toMatchObject({ acquisitions: 0, partial: true });
		expect(ssHistory(archive())).toEqual([]);
		expect(ssHistory(archive({ ssReviews: [{ phaseIndex: 0, label: "Winter", holders: [] }] }))[0].holders).toEqual([]);
	});
	it("preserves evidence origin through carry without an extra acquisition", () => {
		const a = holder("a");
		const first = archive({ franchiseYear: 1, ssReviews: [{ phaseIndex: 0, label: "Winter", holders: [a] }] });
		const second = archive({ id: "s2", name: "Year 2", franchiseYear: 2, ssOpening: [a], ssReviews: [{ phaseIndex: 0, label: "Winter", holders: [{ ...a, decision: "carried" }] }] });
		const career = playerSSHistory([second, first], "a");
		expect(career).toMatchObject({ acquisitions: 1, checkpoints: 2, years: 2 });
		expect(career.openings).toMatchObject([{ seasonId: "s2", holder: { playerId: "a" } }]);
		expect(career.rows[1].holder.evidence.seasonId).toBe("s");
	});
	it("records actual inactive losses and reacquisition at the next review without duplicating the loss", () => {
		const before = makeAuditSeason("SS loss");
		const p = before.teams[0].players[0];
		p.tier = "SS"; p.ss = { ...holder(p.id!).evidence, lane: p.lane };
		before.ssOpening = snapshotSSHolders(before.teams);
		before.ssReviews = [{ phaseIndex: 0, label: "Winter", holders: before.ssOpening }];
		const after = recordSSLosses(before, { ...before, teams: before.teams.map(t => ({ ...t, players: t.players.filter(x => x.id !== p.id) })) });
		expect(after.ssLosses).toMatchObject([{ holder: { playerId: p.id }, afterReview: true, reason: "inactive" }]);
		expect(recordSSLosses(before, after).ssLosses).toHaveLength(1);
		const entry = archive({ ssOpening: before.ssOpening, ssReviews: [...before.ssReviews, { phaseIndex: 1, label: "Spring", holders: before.ssOpening }], ssLosses: after.ssLosses });
		expect(ssHistory(entry)[1]).toMatchObject({ holders: [{ decision: "gained" }], lost: [] });
	});
	it("rejects malformed enriched records and preserves optional legacy data", () => {
		const season = makeAuditSeason("Validation");
		season.ssOpening = [];
		const entry = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
		expect(validSeason(season)).toBe(true);
		expect(validHistoryEntry(entry)).toBe(true);
		const invalid = { ...entry, ssReviews: [{ phaseIndex: 0, label: "Winter", holders: [{ ...holder("a"), team: { teamId: "t", teamName: "T1", leagueId: "INVALID" } }] }] };
		expect(validHistoryEntry(invalid)).toBe(false);
		expect(validSeason({ ...season, ssOpening: [holder("a"), holder("b")] })).toBe(false);
	});
});

describe("SS cross-season records", () => {
	const team = (teamName: string, leagueId: "LCK" | "LEC" = "LCK") => ({ teamId: `${leagueId}-${teamName}`, teamName, leagueId });
	const h = (playerId: string, t?: ReturnType<typeof team>, lane: SSHolder["lane"] = "top"): SSHolder => ({ ...holder(playerId), lane, playerName: playerId.toUpperCase(), ...(t ? { team: t } : {}) });
	const year = (n: number, holders?: SSHolder[][]): SSArchive => ({ id: `y${n}`, name: `Year ${n}`, franchiseYear: n, archivedAt: n, ...(holders ? { ssOpening: [], ssReviews: holders.map((hs, phaseIndex) => ({ phaseIndex, label: `P${phaseIndex}`, holders: hs })) } : { ssOpening: undefined, ssReviews: undefined }) });

	it("finds the longest consecutive streak and breaks it on unknown years", () => {
		const e = [year(1, [[h("a")]]), year(2, [[h("a")]]), year(3), year(4, [[h("a")]]), year(5, [[h("a")]]), year(6, [[h("a")]])];
		const [s] = ssStreaks(ssSeasonViews(e));
		expect(s).toMatchObject({ playerId: "a", length: 3, startYear: 4, endYear: 6, open: true });
	});
	it("flags a run bordered by a missing archive year as open and ignores undated seasons", () => {
		const e = [year(1, [[h("a")]]), year(3, [[h("a")]]), { ...year(9, [[h("a")]]), franchiseYear: undefined }];
		const [s] = ssStreaks(ssSeasonViews(e));
		expect(s.length).toBe(1);
		expect(s.open).toBe(true);
	});
	it("counts seasons per player without treating unknown years as zero", () => {
		const r = ssRecords([year(1, [[h("a")], [h("a"), h("b")]]), year(2), year(3, [[h("a")]])]);
		expect(r.seasons.map(x => [x.playerId, x.seasons])).toEqual([["a", 2], ["b", 1]]);
		expect(r).toMatchObject({ knownSeasons: 2, unknownSeasons: 1 });
	});
	it("keeps same-named teams in different regions apart and tracks peak holders", () => {
		const r = ssRecords([year(1, [[h("a", team("Nova")), h("b", team("Nova"), "jungle"), h("c", team("Nova", "LEC"))]]), year(2, [[h("a", team("Nova"))]])]);
		const lck = r.teams.find(t => t.key === "LCK:Nova")!;
		expect(r.teams).toHaveLength(2);
		expect(lck).toMatchObject({ holderSeasons: 3, distinctHolders: 2, peak: 2 });
		expect(r.teams.find(t => t.key === "LEC:Nova")).toMatchObject({ holderSeasons: 1, peak: 1 });
		expect(r.regions).toEqual([{ leagueId: "LCK", distinctHolders: 2, holderSeasons: 3 }, { leagueId: "LEC", distinctHolders: 1, holderSeasons: 1 }]);
	});
	it("exposes the latest recorded holder role and team in chronological order", () => {
		const latestTeam = { ...team("Nova", "LEC"), logoUrl: "/archived-nova.png" };
		const r = ssRecords([year(2, [[h("a", team("Old"))], [h("a", latestTeam, "support")]]), year(1, [[h("a", team("First"), "jungle")]])]);
		expect(r.seasons).toEqual([{ playerId: "a", playerName: "A", seasons: 2, lane: "support", team: latestTeam }]);
	});
	it("does not infer an unrecorded team or retain stale attribution", () => {
		const r = ssRecords([year(1, [[h("a", team("Old"))]]), year(2, [[h("a", undefined, "jungle"), h("b")]])]);
		expect(r.seasons[0]).toMatchObject({ playerId: "a", lane: "jungle" });
		expect(r.seasons[0]).not.toHaveProperty("team");
		expect(r.seasons[1]).not.toHaveProperty("team");
		expect(ssRecords([year(3)]).seasons).toEqual([]);
	});
	it("excludes holders without a recorded team from team and region tables", () => {
		const r = ssRecords([year(1, [[h("a")]])]);
		expect(r.teams).toEqual([]);
		expect(r.regions).toEqual([]);
		expect(r.unattributed).toBe(1);
		expect(r.seasons).toHaveLength(1);
	});
	it("builds a per-region view and a comparable timeline with unknown cells", () => {
		const views = ssSeasonViews([year(1, [[h("a", team("Nova")), h("b", team("Zed", "LEC"), "mid")]]), year(2), year(3, [[h("a", team("Nova", "LEC"))]])]);
		expect(ssRegionView(views, "LEC").map(v => v.holders.map(x => x.playerId))).toEqual([["b"], [], ["a"]]);
		const t = ssTimeline(views, ["a", "b", "a"]);
		expect(t.rows).toHaveLength(2);
		expect(t.rows[0].cells.map(c => c.state)).toEqual(["held", "unknown", "held"]);
		expect(t.rows[1].cells.map(c => c.state)).toEqual(["held", "unknown", "none"]);
		expect(t.rows[0].playerName).toBe("A");
	});
});

describe("playerSSStreak", () => {
	const yr = (n: number, ids: string[] | undefined): SSArchive => ({ id: `y${n}`, name: `Year ${n}`, franchiseYear: n, archivedAt: n, ...(ids ? { ssOpening: ids.map(i => holder(i)) } : {}) });
	it("returns a single run", () => {
		const s = playerSSStreak([yr(1, ["a"]), yr(2, ["a"]), yr(3, ["a"])], "a")!;
		expect([s.length, s.startYear, s.endYear, s.open]).toEqual([3, 1, 3, false]);
	});
	it("picks the longest of two runs, earliest on ties", () => {
		const longest = playerSSStreak([yr(1, ["a"]), yr(2, []), yr(3, ["a"]), yr(4, ["a"])], "a")!;
		expect([longest.length, longest.startYear]).toEqual([2, 3]);
		const tie = playerSSStreak([yr(1, ["a"]), yr(2, ["a"]), yr(3, []), yr(4, ["a"]), yr(5, ["a"])], "a")!;
		expect([tie.length, tie.startYear]).toEqual([2, 1]);
	});
	it("treats an unknown year as a break and flags the run open", () => {
		const s = playerSSStreak([yr(1, ["a"]), yr(2, ["a"]), yr(3, undefined)], "a")!;
		expect([s.length, s.open]).toEqual([2, true]);
	});
	it("is undefined for an absent player", () => {
		expect(playerSSStreak([yr(1, ["a"])], "b")).toBeUndefined();
		expect(playerSSHistory([yr(1, ["a"])], "b").streak).toBeUndefined();
	});
});
