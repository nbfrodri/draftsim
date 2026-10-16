import { describe, it, expect } from "vitest";
import { ssHistory, playerSSHistory, snapshotSSHolders, recordSSLosses, type SSArchive } from "./ssHistory";
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
