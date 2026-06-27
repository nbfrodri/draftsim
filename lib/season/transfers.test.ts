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
  type LaneEntry,
} from "./transfers";
import { playerLaneCohesionBias } from "../matchSimulator";
import type { Champion, Player } from "../types";
import type { ProposedTransfer, SeasonPhase, SeasonState } from "./types";
import type { SeasonMetaSnapshot } from "./types";

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

  it("caps the followed team at 3 transfers per window", () => {
    const move = (lane: string) => ({
      event: "first-stand" as const,
      lane,
      fromTeamId: "rivalB",
      toTeamId: "mine",
      star: { tier: "B", grade: null, goodChamps: [] },
      swap: { tier: "B", grade: null, goodChamps: [] },
    });
    const withThree = {
      ...season(),
      transfersByEvent: { "first-stand": [move("top"), move("jungle"), move("bottom")] },
    } as unknown as SeasonState;
    expect(userTransferCount(withThree, "first-stand", "mine")).toBe(
      USER_MAX_TRANSFERS_PER_WINDOW,
    );
    expect(userTransferCapReached(withThree, "first-stand", "mine")).toBe(true);
    // A 4th transfer on a fresh lane is refused despite a willing rival …
    const blocked = executeUserTransfer(withThree, [], "middle", "rivalB");
    expect(blocked).toBe(withThree); // no-op
    // … and the shop closes on every remaining lane.
    expect(transferCandidates(withThree, [], "middle")).toHaveLength(0);
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
    // A fresh cross-region move resets low.
    expect(settle(mid({ homeRegion: "LCK", acclimation: 1 }), "LCK", "LEC").acclimation).toBe(0.15);
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
