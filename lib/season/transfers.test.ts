import { describe, it, expect } from "vitest";
import {
  planLaneSwaps,
  poolFit,
  resolveTransfer,
  transferCandidates,
  executeUserTransfer,
  userTransferCount,
  userTransferCapReached,
  USER_MAX_TRANSFERS_PER_WINDOW,
  settle,
  transferValue,
  rewardRosterStability,
  awardStabilityBonus,
  STABILITY_FORM_BONUS,
  bestCoachHire,
  type LaneEntry,
} from "./transfers";
import { playerLaneCohesionBias } from "../matchSimulator";
import type { Champion, Lane, Player } from "../types";
import type { ProposedTransfer, SeasonPhase, SeasonState } from "./types";
import type { SeasonMetaSnapshot } from "./types";

describe("rewardRosterStability", () => {
  it("bonuses only the teams that made no move; involved teams unchanged", () => {
    const form = { A: 0, B: 0, C: 0.1 };
    const involved = new Set(["A"]); // A transferred
    const out = rewardRosterStability(form, ["A", "B", "C"], involved);
    expect(out.A).toBe(0); // involved → no bonus
    expect(out.B).toBeCloseTo(STABILITY_FORM_BONUS); // sat out → bonus
    expect(out.C).toBeCloseTo(0.1 + STABILITY_FORM_BONUS);
    expect(form.B).toBe(0); // input not mutated
  });

  it("clamps the bonus to the form ceiling", () => {
    const out = rewardRosterStability({ A: 0.95 }, ["A"], new Set());
    expect(out.A).toBeLessThanOrEqual(1);
  });
});

describe("awardStabilityBonus (window close)", () => {
  const seasonWith = (
    moves: Array<{ fromTeamId: string; toTeamId: string }>,
    teamForm: Record<string, number> | undefined = {},
  ) =>
    ({
      teams: [{ id: "A" }, { id: "B" }, { id: "C" }],
      teamForm,
      transfersByEvent: { "first-stand": moves },
    }) as unknown as SeasonState;

  it("bonuses teams not in the final transfer record (a declined proposal counts as sitting out)", () => {
    // A↔B moved; C was proposed a swap but DECLINED, so it never landed in
    // transfersByEvent → it correctly gets the stability bonus.
    const out = awardStabilityBonus(seasonWith([{ fromTeamId: "A", toTeamId: "B" }]), "first-stand");
    expect(out.teamForm!.C).toBeCloseTo(STABILITY_FORM_BONUS);
    expect(out.teamForm!.A ?? 0).toBe(0);
    expect(out.teamForm!.B ?? 0).toBe(0);
  });

  it("is a no-op when form isn't tracked or the window saw no churn", () => {
    const noForm = {
      teams: [{ id: "A" }, { id: "B" }],
      transfersByEvent: { "first-stand": [{ fromTeamId: "A", toTeamId: "B" }] },
    } as unknown as SeasonState; // no teamForm field
    expect(awardStabilityBonus(noForm, "first-stand")).toBe(noForm);
    const quiet = awardStabilityBonus(seasonWith([]), "first-stand");
    expect(quiet.teamForm).toEqual({}); // nobody moved → no relative bonus
  });
});

// ── planLaneSwaps: a stuck star (high value, weak seat) swaps with a weak
//    link (low value, strong seat); nothing moves without a real gap. ──
describe("planLaneSwaps", () => {
  it("poaches a stuck star up and drops a weak link down", () => {
    const entries: LaneEntry[] = [
      { teamId: "star-on-bad", value: 2, dest: 1 }, // S on a bottom team
      { teamId: "weak-on-top", value: -2, dest: 12 }, // D on a top team
      { teamId: "filler", value: 0, dest: 6 },
    ];
    const swaps = planLaneSwaps(entries);
    expect(swaps).toContainEqual({ aTeamId: "star-on-bad", bTeamId: "weak-on-top" });
  });

  it("does nothing when the value gap is below the floor", () => {
    const entries: LaneEntry[] = [
      { teamId: "a", value: 0.1, dest: 1 },
      { teamId: "b", value: -0.1, dest: 12 },
    ];
    expect(planLaneSwaps(entries)).toHaveLength(0);
  });

  it("does not move a player to a worse seat", () => {
    // High value already on the best seat — no upward move exists.
    const entries: LaneEntry[] = [
      { teamId: "good-on-good", value: 2, dest: 12 },
      { teamId: "bad-on-bad", value: -2, dest: 1 },
    ];
    expect(planLaneSwaps(entries)).toHaveLength(0);
  });
});

// ── poolFit: champion pool drives value beyond tier — an S-meta pool reads
//    positive, a D-meta pool negative, at the player's lane. ──
describe("poolFit", () => {
  const champ = (id: number, alias: string): Champion =>
    ({ id, alias, name: alias, lanes: ["middle"] }) as Champion;
  const byId = new Map([champ(1, "Hot"), champ(2, "Cold")].map((c) => [c.id, c]));
  const meta: SeasonMetaSnapshot = {
    metaOverride: { Hot: { middle: "S+" }, Cold: { middle: "D" } },
    metaEnabled: true,
    synergyOverride: null,
    counterOverride: null,
  };
  const mid = (goodChamps: number[]): Player =>
    ({ lane: "middle", tier: "B", goodChamps, badChamps: [] }) as Player;

  it("rates an S-tier pool positively and a cold pool negatively", () => {
    expect(poolFit(mid([1]), byId, meta)).toBeGreaterThan(0);
    expect(poolFit(mid([2]), byId, meta)).toBeLessThan(0);
  });
});

// ── resolveTransfer: the followed team only ever changes by the user's call.
describe("resolveTransfer", () => {
  const p = (tier: string): Player =>
    ({ lane: "middle", tier, goodChamps: [], badChamps: [] }) as Player;
  const prop: ProposedTransfer = {
    event: "first-stand",
    lane: "middle",
    laneIndex: 2,
    controlledTeamId: "mine",
    otherTeamId: "rival",
    kind: "incoming",
    mine: { tier: "C", grade: 4, goodChamps: [] },
    theirs: { tier: "S", grade: 8, goodChamps: [] },
  };
  // One auto move already recorded for the window, so we can prove the
  // followed team's decision adds to it only on accept, never on decline.
  const autoMove = {
    event: "first-stand",
    lane: "top",
    fromTeamId: "x",
    toTeamId: "y",
    star: { tier: "A", grade: 7, goodChamps: [] },
    swap: { tier: "C", grade: 4, goodChamps: [] },
  };
  const season = (): SeasonState =>
    ({
      teams: [
        { id: "mine", players: [p("B"), p("B"), p("C"), p("B"), p("B")] },
        { id: "rival", players: [p("A"), p("A"), p("S"), p("A"), p("A")] },
      ],
      proposedTransfers: [prop],
      transfersByEvent: { "first-stand": [autoMove] },
    }) as unknown as SeasonState;

  it("swaps the lane players on accept, clears the proposal, logs the window", () => {
    const out = resolveTransfer(season(), 0, true);
    expect(out.teams[0].players[2].tier).toBe("S"); // mine received the star
    expect(out.teams[1].players[2].tier).toBe("C"); // rival received the weak link
    expect(out.proposedTransfers).toHaveLength(0);
    // Auto move + the accepted one.
    expect(out.transfersByEvent?.["first-stand"]).toHaveLength(2);
  });

  it("declining touches nothing and never adds to the window's moves", () => {
    const out = resolveTransfer(season(), 0, false);
    expect(out.teams[0].players[2].tier).toBe("C");
    expect(out.teams[1].players[2].tier).toBe("S");
    expect(out.proposedTransfers).toHaveLength(0);
    // Still just the one auto move — the declined one is NOT recorded.
    expect(out.transfersByEvent?.["first-stand"]).toHaveLength(1);
  });

  it("refuses to accept once the followed team's per-window cap is reached", () => {
    // Two moves already involve "mine" this window (in-season cap is 2), on
    // OTHER lanes so the one-per-role rule doesn't fire instead.
    const mineMove = (lane: string) => ({
      event: "first-stand" as const,
      lane,
      fromTeamId: "mine",
      toTeamId: "z",
      star: { tier: "B", grade: null, goodChamps: [] },
      swap: { tier: "B", grade: null, goodChamps: [] },
    });
    const atCap = {
      ...season(),
      transfersByEvent: { "first-stand": [mineMove("top"), mineMove("jungle")] },
    } as unknown as SeasonState;
    const out = resolveTransfer(atCap, 0, true); // try to ACCEPT past the cap
    // Treated as declined: rosters untouched, proposal cleared, no new move.
    expect(out.teams[0].players[2].tier).toBe("C");
    expect(out.teams[1].players[2].tier).toBe("S");
    expect(out.proposedTransfers).toHaveLength(0);
    expect(out.transfersByEvent?.["first-stand"]).toHaveLength(2);
  });
});

// ── User-initiated shopping: willingness + execution ────────────────────────
describe("transferCandidates / executeUserTransfer", () => {
  const mid = (tier: string, champs: number[]): Player =>
    ({ lane: "middle", tier, goodChamps: champs, badChamps: [] }) as Player;
  // A team's 5-slot roster; only middle (index 2) matters here.
  const roster = (tier: string, champs: number[]) =>
    [mid("B", []), mid("B", []), mid(tier, champs), mid("B", []), mid("B", [])];
  const phases: SeasonPhase[] = [
    { kind: "split", split: "winter", label: "", tournamentIds: [], status: "complete" },
    { kind: "international", event: "first-stand", label: "", tournamentIds: [], status: "complete" },
    { kind: "transfer", event: "first-stand", label: "", tournamentIds: [], status: "in-progress" },
  ];
  const season = (): SeasonState =>
    ({
      config: { playerTransfers: true, controlledTeamId: "mine" },
      phaseIndex: 2,
      phases,
      tournaments: {},
      currentMeta: { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null },
      teams: [
        { id: "mine", leagueId: "LCK", players: roster("B", [1]) },
        { id: "rivalA", leagueId: "LPL", players: roster("A", [2]) }, // out of reach
        { id: "rivalB", leagueId: "LEC", players: roster("B", [99]) }, // lateral
        { id: "rivalC", leagueId: "LCS", players: roster("C", [3]) }, // downgrade
      ],
    }) as unknown as SeasonState;

  it("marks an upgrade out of reach but lateral/down swaps willing", () => {
    const cands = transferCandidates(season(), [], "middle");
    const byId = new Map(cands.map((c) => [c.otherTeamId, c]));
    expect(byId.get("rivalA")?.willing).toBe(false); // can't grab an A for a B
    expect(byId.get("rivalB")?.willing).toBe(true);
    expect(byId.get("rivalC")?.willing).toBe(true);
    // Willing candidates sort ahead of unwilling.
    expect(cands[cands.length - 1]?.otherTeamId).toBe("rivalA");
  });

  it("executes a willing swap and refuses an out-of-reach one", () => {
    const ok = executeUserTransfer(season(), [], "middle", "rivalB");
    const myMid = ok.teams.find((t) => t.id === "mine")!.players[2];
    expect(myMid.goodChamps).toEqual([99]); // received rivalB's player
    expect(ok.transfersByEvent?.["first-stand"]).toHaveLength(1);

    const blocked = executeUserTransfer(season(), [], "middle", "rivalA");
    expect(blocked.teams.find((t) => t.id === "mine")!.players[2].goodChamps).toEqual([1]);
  });

  it("allows only one move per role per window", () => {
    const first = executeUserTransfer(season(), [], "middle", "rivalB");
    expect(first.transfersByEvent?.["first-stand"]).toHaveLength(1);
    // A second mid swap this window is rejected — the slot already moved.
    const second = executeUserTransfer(first, [], "middle", "rivalC");
    expect(second).toBe(first); // no-op, same object
    expect(transferCandidates(first, [], "middle")).toHaveLength(0); // shop closed
  });

  it("caps the followed team at the per-window transfer limit", () => {
    const move = (lane: string) => ({
      event: "first-stand" as const,
      lane,
      fromTeamId: "rivalB",
      toTeamId: "mine",
      star: { tier: "B", grade: null, goodChamps: [] },
      swap: { tier: "B", grade: null, goodChamps: [] },
    });
    // Fill exactly the per-window cap (in-season = 2) on distinct lanes.
    const lanes: Lane[] = ["top", "jungle", "bottom"];
    const atCap = {
      ...season(),
      transfersByEvent: {
        "first-stand": lanes.slice(0, USER_MAX_TRANSFERS_PER_WINDOW).map(move),
      },
    } as unknown as SeasonState;
    expect(userTransferCount(atCap, "first-stand", "mine")).toBe(
      USER_MAX_TRANSFERS_PER_WINDOW,
    );
    expect(userTransferCapReached(atCap, "first-stand", "mine")).toBe(true);
    // One more transfer on a fresh lane is refused despite a willing rival …
    const blocked = executeUserTransfer(atCap, [], "middle", "rivalB");
    expect(blocked).toBe(atCap); // no-op
    // … and the shop closes on every remaining lane.
    expect(transferCandidates(atCap, [], "middle")).toHaveLength(0);
  });
});

// ── Language barrier / region cohesion ──────────────────────────────────────
describe("language barrier", () => {
  const mid = (over: Partial<Player>): Player =>
    ({ lane: "middle", tier: "B", goodChamps: [], badChamps: [], ...over });

  it("settle: home = full, lateral = unchanged, cross-region = reset low", () => {
    const p = mid({ homeRegion: "LCK", acclimation: 1 });
    expect(settle(p, "LCK", "LCK").acclimation).toBe(1); // stayed home
    expect(settle(p, "LPL", "LCK").acclimation).toBe(1); // came home
    expect(settle(p, "LCK", "LCK").acclimation).toBe(1);
    // Lateral within a foreign region keeps current acclimation.
    const imp = mid({ homeRegion: "LCK", acclimation: 0.5 });
    expect(settle(imp, "LEC", "LEC").acclimation).toBe(0.5);
    // A fresh cross-region move resets low in-season …
    expect(settle(mid({ homeRegion: "LCK", acclimation: 1 }), "LCK", "LEC").acclimation).toBe(0.15);
    // … but an OFFSEASON move lands far more settled (preseason to adjust).
    expect(settle(mid({ homeRegion: "LCK", acclimation: 1 }), "LCK", "LEC", true).acclimation).toBe(0.5);
  });

  it("transfer value discounts an un-acclimated import", () => {
    const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };
    const byId = new Map();
    const settled = transferValue(mid({ tier: "A", acclimation: 1 }), null, byId, meta);
    const fresh = transferValue(mid({ tier: "A", acclimation: 0 }), null, byId, meta);
    expect(fresh).toBeLessThan(settled);
  });

  it("cohesion bias penalises the side with the un-acclimated player", () => {
    const blue = [mid({ acclimation: 0.1 }), mid({ lane: "top" }), mid({ lane: "jungle" }), mid({ lane: "bottom" }), mid({ lane: "support" })];
    const red = [mid({ acclimation: 1 }), mid({ lane: "top" }), mid({ lane: "jungle" }), mid({ lane: "bottom" }), mid({ lane: "support" })];
    // Blue mid is a fresh import → blue loses lane gold (negative, blue-positive frame).
    expect(playerLaneCohesionBias(blue as never, red as never, "middle")).toBeLessThan(0);
    // Symmetric: swap sides → positive.
    expect(playerLaneCohesionBias(red as never, blue as never, "middle")).toBeGreaterThan(0);
  });
});

describe("bestCoachHire", () => {
  const season = (coaches: Record<string, number | null>): SeasonState =>
    ({
      config: { controlledTeamId: "mine" },
      teams: Object.entries(coaches).map(([id, rating]) => ({
        id,
        coach: rating == null ? undefined : { name: id, rating },
      })),
    }) as unknown as SeasonState;

  it("picks the clearly-better coach, ignores ties/own team", () => {
    // mine 3.0; rivalA 4.2 (clear upgrade), rivalB 3.1 (under the 0.3 margin).
    expect(bestCoachHire(season({ mine: 3.0, rivalA: 4.2, rivalB: 3.1 }))).toBe("rivalA");
    // Nobody clearly better → null.
    expect(bestCoachHire(season({ mine: 4.5, rivalA: 4.4, rivalB: 4.0 }))).toBeNull();
    // No coach of our own → still hires the best available.
    expect(bestCoachHire(season({ mine: null, rivalA: 2.0, rivalB: 3.5 }))).toBe("rivalB");
  });
});

import { offseasonTransferPass } from "./transfers";
import { generateSeasonTeams } from "./teamGen";
import { LANE_ORDER as LANES2 } from "../players";

describe("cross-region resistance (auto market)", () => {
  let cid = 5000;
  const champs = () =>
    LANES2.flatMap((lane) => Array.from({ length: 8 }, () => ({ id: cid++, name: `c${cid}`, alias: `c${cid}`, roles: [], iconUrl: "", lanes: [lane] }))) as never;

  it("never moves an S/S+ player to a different region", () => {
    const champions = champs();
    const teams = generateSeasonTeams(champions, (() => { let a = 11 >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })());
    const origRegion = new Map<string, string>();
    for (const t of teams) for (const p of t.players) if (p.name) origRegion.set(p.name, t.leagueId);
    const byId = new Map(champions.map((c: never) => [(c as { id: number }).id, c]));
    const meta = { metaOverride: null, metaEnabled: true, synergyOverride: null, counterOverride: null };
    const { teams: after, moves } = offseasonTransferPass(teams, () => null, byId as never, meta as never);
    // Some movement happened (lower tiers still cross / move) ...
    expect(moves.length).toBeGreaterThan(0);
    // ... but no elite ended up in a different region than they started.
    for (const t of after) {
      for (const p of t.players) {
        if (p.name && (p.tier === "S" || p.tier === "S+")) {
          expect(t.leagueId).toBe(origRegion.get(p.name));
        }
      }
    }
  });
});
