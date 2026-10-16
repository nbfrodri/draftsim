import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { LANE_ORDER } from "../players";
import type { PlayerTier } from "../types";
import type { SeasonState } from "./types";
import { reviewSSPlayers, reconcileSSPlayers } from "./ssPlayers";
import { withoutSS, withDevelopmentTier } from "../playerSS";
import { deriveStar, normalizeRoster, randomizeRoster, rosterComfortWeight } from "../players";
import { playerLaneTierBias } from "../matchSimulator";
import { assignRoleElites } from "./teamGen";
import { startNextSeason } from "./franchise";
import { createRng } from "../rng";
import { validSeason, validHistoryEntry } from "../importValidation";
import { buildSeasonHistoryEntry } from "./history";
import { compactEncodeSeasonForPersist, decodeCompactSeason } from "../recapCompression";
import { createSeries } from "../series";
import { applyTournamentUpdate } from "./engine";
import { averageTierFromRoster } from "./teamCard";
import { transferValue } from "./transfers";
import { computeSSRace } from "./ssRace";

function fixture(tier: PlayerTier = "S", games = 16): SeasonState {
	const s = makeAuditSeason("SS");
	s.teams = s.teams.slice(0, 4).map((t, i) => ({ ...t, players: t.players.map((p, li) => ({ ...p, id: `${i}-${li}`, tier, potential: "S+" })) }));
	const t = Object.values(s.tournaments)[0];
	t.teams = structuredClone(s.teams.map((team, i) => ({ ...team, seed: i + 1 })));
	const series = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: s.teams[0].name, redTeam: s.teams[1].name });
	t.matches = Array.from({ length: games }, (_, i) => ({ ...t.matches[0], id: `m${i}`, round: i + 1, isBye: false,
		blueTeamId: s.teams[0].id, redTeamId: s.teams[1].id,
		winner: { teamId: s.teams[0].id, blueWins: 1, redWins: 0 },
		series: { ...series, status: "complete", winner: "blue", id: `s${i}`, games: [{ ...series.games[0], id: `g${i}`, blueTeam: s.teams[0].name, redTeam: s.teams[1].name, winner: "blue", status: "complete", actionIndex: 20,
			recap: { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: LANE_ORDER.map((_, li) => `0-${li}`), red: LANE_ORDER.map((_, li) => `1-${li}`) }, ratings: { blue: [8, 8, 8, 8, 8], red: [7, 7, 7, 7, 7] } } }] },
	}));
	t.status = "complete";
	s.phases = [{ kind: "split", split: "winter", label: "Winter", tournamentIds: [t.id], status: "complete" }];
	s.phaseIndex = 0;
	s.tournaments = { [t.id]: t };
	return s;
}

describe("SS phase review", () => {
	it("freezes the review-time club after a transfer without rewriting the event club", () => {
		const s = fixture();
		const original = s.teams[0].players[0];
		const replacement = s.teams[2].players[0];
		s.teams[0].players[0] = replacement;
		s.teams[2].players[0] = original;
		const reviewed = reviewSSPlayers(s);
		expect(reviewed.ssReviews![0].holders.find(h => h.playerId === original.id)?.team?.teamName).toBe(s.teams[2].name);
		expect(Object.values(reviewed.tournaments)[0].teams[0].players![0].id).toBe(original.id);
	});
	it("freezes review identity and decisions without changing entrant tiers or counting renewals as acquisitions", () => {
		const input = fixture();
		input.ssOpening = [];
		const reviewed = reviewSSPlayers(input);
		expect(reviewed.ssReviews?.[0]).toMatchObject({ version: 1, holders: [{ playerId: "0-0", playerName: input.teams[0].players[0].name, team: { teamName: input.teams[0].name }, decision: "gained" }, {}, {}, {}, {}] });
		expect(Object.values(reviewed.tournaments)[0].teams[0].players![0].tier).toBe("S");
		expect(reviewSSPlayers(reviewed)).toEqual(reviewed);
	});
	it("projects active-phase SS contenders without awarding or mutating players", () => {
		const s = fixture();
		s.phases[0].status = "in-progress";
		const before = JSON.stringify(s);
		const race = computeSSRace(s);
		const top = race.find(row => row.lane === "top")!;
		expect(top.holder).toBeNull();
		expect(top.contenders[0]).toMatchObject({ player: { id: "0-0" }, eligible: true, chance: 100, projected: true });
		expect(top.contenders[0].stats?.avgRating).toBe(8);
		expect(JSON.stringify(s)).toBe(before);
		expect(computeSSRace(s)).toEqual(race);
	});
	it("estimates uncertainty between close contenders and respects holder protection", () => {
		const s = fixture();
		for (const t of Object.values(s.tournaments)) for (const [i, m] of t.matches.entries()) {
			m.series!.games[0].recap!.ratings = { blue: Array(5).fill(i % 2 ? 9 : 5), red: Array(5).fill(i % 2 ? 9 : 5) };
		}
		const top = computeSSRace(s)[0];
		for (const row of top.contenders.filter(c => c.eligible)) {
			expect(row.chance).toBeGreaterThan(20);
			expect(row.chance).toBeLessThan(80);
		}
		const awarded = reviewSSPlayers(s);
		const defended = computeSSRace(awarded)[0];
		expect(defended.holder?.projected).toBe(true);
		expect(defended.contenders.find(c => c.eligible)?.gap).toBeCloseTo(0.15);
	});
	it("keeps absent gold unknown and flips recorded gold for the opposing side", () => {
		const s = fixture();
		expect(computeSSRace(s)[0].contenders[0].stats?.goldDiffGames).toBe(0);
		for (const t of Object.values(s.tournaments)) for (const m of t.matches) m.series!.games[0].recap!.laneGoldDiff = { top: 600, jungle: 0, middle: 0, bottom: 0, support: 0 };
		const top = computeSSRace(s)[0];
		expect(top.contenders[0].stats!.goldDiffSum / top.contenders[0].stats!.goldDiffGames).toBe(600);
		expect(top.contenders[1].stats!.goldDiffSum / top.contenders[1].stats!.goldDiffGames).toBe(-600);
	});
	it("does not leak future phases into live grades or SS projections", () => {
		const s = fixture();
		const future = structuredClone(Object.values(s.tournaments)[0]);
		future.id = "future";
		for (const m of future.matches) m.series!.games[0].recap!.ratings!.blue = [1, 1, 1, 1, 1];
		const before = computeSSRace(s);
		s.tournaments[future.id] = future;
		s.phases.push({ ...s.phases[0], tournamentIds: [future.id] });
		expect(computeSSRace(s)).toEqual(before);
	});
	it("exposes missing evidence and never offers B players an SS probability", () => {
		const s = fixture("S+", 7);
		const candidate = computeSSRace(s)[0].contenders[0];
		expect(candidate).toMatchObject({ eligible: false, chance: null, games: 7, requiredGames: 8 });
		expect(candidate.reasons).toContain("Needs 8 rated games (7 recorded)");
		expect(computeSSRace(fixture("B"))[0].contenders).toHaveLength(0);
	});
	it("assigns zero estimated eligibility when eight games do not meet participation", () => {
		const s = fixture();
		for (const t of Object.values(s.tournaments)) for (const m of t.matches.slice(8)) m.series!.games[0].recap!.perPickIds!.blue = [];
		const row = computeSSRace(s)[0].contenders.find(c => c.player.id === "0-0")!;
		expect(row).toMatchObject({ games: 8, requiredGames: 10, eligible: false, chance: 0, projected: false });
	});
	it("shows existing SS during next-year grace without inventing new-year grades", () => {
		const s = reviewSSPlayers(fixture());
		s.id = "next-year";
		s.tournaments = {};
		s.phases[0].status = "in-progress";
		const holder = computeSSRace(s)[0].holder!;
		expect(holder).toMatchObject({ carry: true, projected: true, stats: null, score: null, chance: null, games: 0 });
	});
	it("shows the real holder separately and projects the same winners as a phase review", () => {
		const s = fixture();
		const awarded = reviewSSPlayers(s);
		for (const row of computeSSRace(awarded)) {
			expect(row.holder?.player.tier).toBe("SS");
			expect(row.holder?.projected).toBe(true);
			expect(row.contenders.some(c => c.player.id === row.holder?.player.id)).toBe(false);
		}
		for (const row of computeSSRace(s)) expect(row.contenders.find(c => c.projected)?.player.id).toBe(awarded.teams[0].players.find(p => p.lane === row.lane)?.id);
	});
	it("reviews once when the engine completes a competitive phase", () => {
		const s = fixture();
		s.franchise!.aging = false;
		const done = Object.values(s.tournaments)[0];
		s.tournaments[done.id] = { ...done, status: "in-progress" };
		s.phases[0].status = "in-progress";
		const next = applyTournamentUpdate(s, done);
		expect(next.teams[0].players.every(p => p.tier === "SS")).toBe(true);
		expect(next.ssReviews).toHaveLength(1);
		expect(applyTournamentUpdate(next, done).ssReviews).toEqual(next.ssReviews);
	});
	it("selects at most one eligible player per position without mutating completed rosters", () => {
		const s = fixture();
		const before = JSON.stringify(s);
		const next = reviewSSPlayers(s);
		expect(next.teams[0].players.every(p => p.tier === "SS" && p.ss?.baseTier === "S")).toBe(true);
		expect(next.teams.flatMap(t => t.players).filter(p => p.tier === "SS")).toHaveLength(5);
		expect(JSON.stringify(s)).toBe(before);
		expect(next.tournaments).toBe(s.tournaments);
		expect(reviewSSPlayers(next)).toEqual(next);
	});
	it.each(["B", "A"] as const)("never promotes a %s player directly despite exceptional ratings", tier => {
		expect(reviewSSPlayers(fixture(tier)).teams.flatMap(t => t.players).some(p => p.tier === "SS")).toBe(false);
	});
	it("requires more than a short hot streak", () => {
		expect(reviewSSPlayers(fixture("S+", 7)).teams.flatMap(t => t.players).some(p => p.tier === "SS")).toBe(false);
	});
	it("does not count unfinished games or unknown player identities", () => {
		const s = fixture();
		for (const t of Object.values(s.tournaments)) for (const m of t.matches) m.series!.games[0].winner = null;
		expect(reviewSSPlayers(s).teams.flatMap(t => t.players).some(p => p.tier === "SS")).toBe(false);
	});
	it("does not award an ambiguous duplicated live ID", () => {
		const s = fixture();
		s.teams[2].players[0] = { ...s.teams[0].players[0] };
		expect(reviewSSPlayers(s).teams.flatMap(t => t.players).filter(p => p.id === "0-0").some(p => p.tier === "SS")).toBe(false);
	});
	it("preserves a new-year holder until its region has eight opportunities, then requires evidence", () => {
		const old = reviewSSPlayers(fixture()).teams[0].players;
		const s = fixture("S", 6);
		s.id = "next-year";
		s.teams[0].players = old;
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier === "SS" && p.ss?.seasonId !== s.id)).toBe(true);
		const noActivity = fixture("S", 16);
		noActivity.id = "next-year";
		noActivity.teams[2].players = old;
		noActivity.teams[0].players = noActivity.teams[0].players.map(p => ({ ...p, id: `different-${p.id}` }));
		for (const t of Object.values(noActivity.tournaments)) for (const m of t.matches) m.series!.games[0].recap!.perPickIds!.blue = [null, null, null, null, null];
		expect(reviewSSPlayers(noActivity).teams[2].players.every(p => p.tier !== "SS")).toBe(true);
	});
	it("rejects eight frozen games when peers have sixteen opportunities", () => {
		const s = fixture();
		const matches = Object.values(s.tournaments)[0].matches;
		for (const m of matches.slice(8)) {
			m.blueTeamId = s.teams[2].id;
			m.series!.games[0].recap!.perPickIds!.blue = LANE_ORDER.map((_, li) => `2-${li}`);
			m.series!.games[0].recap!.ratings!.blue = [6, 6, 6, 6, 6];
		}
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier !== "SS")).toBe(true);
	});
	it("uses opponent strength and sample reliability rather than raw averages alone", () => {
		const s = fixture();
		const t = Object.values(s.tournaments)[0];
		s.teams[2].players = s.teams[2].players.map(p => ({ ...p, tier: "D" }));
		s.teams[3].players = s.teams[3].players.map(p => ({ ...p, tier: "S+" }));
		t.teams = s.teams.map((team, i) => ({ ...team, seed: i + 1 }));
		for (const [i, m] of t.matches.entries()) {
			m.redTeamId = s.teams[2].id;
			m.series!.games[0].recap!.perPickIds!.red = LANE_ORDER.map((_, li) => `2-${li}`);
			m.series!.games[0].recap!.ratings!.blue = [8.1, 8.1, 8.1, 8.1, 8.1];
			if (i >= 12) m.series!.games[0].recap!.perPickIds!.blue = [null, null, null, null, null];
		}
		const extra = t.matches.map((m, i) => ({ ...m, id: `strong${i}`, blueTeamId: s.teams[1].id, redTeamId: s.teams[3].id,
			series: { ...m.series!, games: [{ ...m.series!.games[0], blueTeam: s.teams[1].name,
				recap: { ...m.series!.games[0].recap!, perPickIds: { blue: LANE_ORDER.map((_, li) => `1-${li}`), red: LANE_ORDER.map((_, li) => `3-${li}`) }, ratings: { blue: [8, 8, 8, 8, 8], red: [6, 6, 6, 6, 6] } } }] } }));
		t.matches.push(...extra);
		expect(reviewSSPlayers(s).teams[1].players.every(p => p.tier === "SS")).toBe(true);
	});
	it("retains an incumbent within the margin and replaces one clearly surpassed", () => {
		const s = reviewSSPlayers(fixture());
		// Counterfactual unreviewed checkpoint with an existing incumbent.
		delete s.ssReviews;
		const t = Object.values(s.tournaments)[0];
		for (const m of t.matches) m.series!.games[0].recap!.ratings!.red = [8.1, 8.1, 8.1, 8.1, 8.1];
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier === "SS")).toBe(true);
		for (const m of t.matches) m.series!.games[0].recap!.ratings!.red = [9, 9, 9, 9, 9];
		const replaced = reviewSSPlayers(s);
		expect(replaced.teams[1].players.every(p => p.tier === "SS")).toBe(true);
		expect(replaced.teams[0].players.every(p => p.tier === "S" && !p.ss)).toBe(true);
	});
	it("uses participated titles only to break an exact performance tie", () => {
		const s = fixture();
		const t = Object.values(s.tournaments)[0];
		for (const m of t.matches) {
			m.winner = { teamId: s.teams[1].id, blueWins: 0, redWins: 1 };
			m.series!.winner = "red";
			m.series!.games[0].winner = "red";
			m.series!.games[0].recap!.ratings!.red = [8, 8, 8, 8, 8];
		}
		s.splitResults = { winter: { LCK: [s.teams[1].id, s.teams[0].id] } };
		expect(reviewSSPlayers(s).teams[1].players.every(p => p.tier === "SS")).toBe(true);
		for (const m of t.matches) m.series!.games[0].recap!.ratings!.red = [7.5, 7.5, 7.5, 7.5, 7.5];
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier === "SS")).toBe(true);
	});
	it("keeps idle-region holders during internationals but removes a frozen prior-split average", () => {
		const s = reviewSSPlayers(fixture());
		s.phases.push({ kind: "international", event: "msi", label: "MSI", status: "complete", tournamentIds: [] });
		s.phaseIndex = 1;
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier === "SS")).toBe(true);
		const old = Object.values(s.tournaments)[0];
		const newer = structuredClone(old);
		newer.id = "spring";
		for (const m of newer.matches) {
			m.blueTeamId = s.teams[2].id;
			m.series!.games[0].blueTeam = s.teams[2].name;
			m.series!.games[0].recap!.perPickIds!.blue = LANE_ORDER.map((_, li) => `2-${li}`);
		}
		s.tournaments.spring = newer;
		s.phases.push({ kind: "split", split: "spring", label: "Spring", status: "complete", tournamentIds: ["spring"] });
		s.phaseIndex = 2;
		expect(reviewSSPlayers(s).teams[0].players.every(p => p.tier !== "SS")).toBe(true);
	});
	it("follows stable IDs across transfers and resolves swapped game sides", () => {
		const s = fixture();
		const p = s.teams[0].players[0];
		[s.teams[0].players[0], s.teams[2].players[0]] = [s.teams[2].players[0], p];
		const t = Object.values(s.tournaments)[0];
		for (const m of t.matches) {
			const game = m.series!.games[0];
			game.blueTeam = s.teams[1].name;
			[game.recap!.perPickIds!.blue, game.recap!.perPickIds!.red] = [game.recap!.perPickIds!.red, game.recap!.perPickIds!.blue];
			[game.recap!.ratings!.blue, game.recap!.ratings!.red] = [game.recap!.ratings!.red, game.recap!.ratings!.blue];
		}
		expect(reviewSSPlayers(s).teams[2].players[0]).toMatchObject({ id: p.id, tier: "SS" });
	});
	it("preserves development and S+ assignment without stacking or generating SS", () => {
		const s = reviewSSPlayers(fixture());
		const p = s.teams[0].players[0];
		expect(withDevelopmentTier(p, "A")).toMatchObject({ tier: "A" });
		expect(withDevelopmentTier(p, "A").ss).toBeUndefined();
		expect(withoutSS(withDevelopmentTier(p, "S+"))).toMatchObject({ tier: "S+" });
		expect(assignRoleElites(s.teams)[0].players[0].tier).toBe("SS");
		for (let seed = 0; seed < 20; seed++) expect(randomizeRoster({ champions: [], rng: createRng(seed) }).some(p => p.tier === "SS")).toBe(false);
	});
	it("changes gameplay strength and comfort while preserving the five-star cap", () => {
		const normal = fixture().teams[0].players;
		const boosted = [...normal];
		boosted[0] = reviewSSPlayers(fixture()).teams[0].players[0];
		expect(playerLaneTierBias(boosted, normal, "top")).toBeGreaterThan(0);
		expect(deriveStar(boosted.map(p => ({ ...p, tier: "SS" })))).toBe(5);
		expect(averageTierFromRoster(boosted.map(p => ({ ...p, tier: "SS" })))).toBe("SS");
		const cappedSS = boosted.map(p => ({ ...p, tier: "SS" as const }));
		const cappedSPlus = normal.map(p => ({ ...p, tier: "S+" as const }));
		expect(deriveStar(cappedSS)).toBe(deriveStar(cappedSPlus));
		expect(playerLaneTierBias(cappedSS, cappedSPlus, "top")).toBeGreaterThan(0);
		expect(rosterComfortWeight([{ ...boosted[0], goodChamps: [1] }], 1)).toBeGreaterThan(rosterComfortWeight([{ ...normal[0], tier: "S+", goodChamps: [1] }], 1));
		const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };
		expect(transferValue(boosted[0], 7, new Map(), meta)).toBeGreaterThan(transferValue({ ...withoutSS(boosted[0]), tier: "S+" }, 7, new Map(), meta));
	});
	it("carries ownership across years without fabricating new-year evidence", () => {
		const s = reviewSSPlayers(fixture());
		s.status = "complete";
		s.franchise!.aging = false;
		s.teams.push(...makeAuditSeason().teams.filter(t => t.leagueId !== "LCK"));
		const next = startNextSeason(s, [], createRng(7));
		expect(next.teams[0].players[0]).toMatchObject({ tier: "SS", ss: { seasonId: s.id } });
		expect(next.ssReviews).toBeUndefined();
	});
	it("round trips SS through normalization, compact saves and archive evidence", () => {
		const s = reviewSSPlayers(fixture());
		const roundTrip = decodeCompactSeason(JSON.parse(JSON.stringify(compactEncodeSeasonForPersist(s))));
		expect(roundTrip.teams[0].players[0]).toEqual(s.teams[0].players[0]);
		expect(normalizeRoster(s.teams[0].players)[0]).toMatchObject({ tier: "SS", ss: s.teams[0].players[0].ss });
		const archived = buildSeasonHistoryEntry(s, 1);
		expect(archived.ssReviews).toEqual(s.ssReviews);
		expect(validHistoryEntry(JSON.parse(JSON.stringify(archived)))).toBe(true);
	});
	it("validates live SS evidence and rejects duplicate owners or SS potential", () => {
		const s = makeAuditSeason();
		const ss = reviewSSPlayers(fixture()).teams[0].players[0];
		s.teams[0].players[0] = ss;
		expect(validSeason(s)).toBe(true);
		s.teams[1].players[0] = { ...ss, id: "duplicate" };
		expect(validSeason(s)).toBe(false);
		s.teams[1].players[0] = { ...withoutSS(ss), id: "other", potential: "SS" };
		expect(validSeason(s)).toBe(false);
		delete s.teams[1].players[0].potential;
		s.teams[0].players[0] = { ...ss, ss: { ...ss.ss!, score: NaN } };
		expect(validSeason(s)).toBe(false);
		s.teams[0].players[0] = { ...ss, ss: { ...ss.ss!, baseTier: "corrupt" as never } };
		expect(reconcileSSPlayers(s).teams[0].players[0]).toMatchObject({ tier: "S" });
		expect(reconcileSSPlayers(s).teams[0].players[0].ss).toBeUndefined();
	});
});
