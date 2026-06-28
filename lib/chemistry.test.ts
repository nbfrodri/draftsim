import { describe, it, expect } from "vitest";
import type { Player, Roster } from "./types";
import {
  pairChemistry,
  playerChemistry,
  projectedChemistry,
  laneChemistryBias,
  assignSynergies,
  driftSynergiesFromResult,
  driftSynergiesOverTime,
  CHEM_DUO,
  CHEM_RESULT_STEP,
  CHEM_TIME_TARGET,
} from "./chemistry";

function p(over: Partial<Player>): Player {
  return {
    lane: "middle",
    tier: "B",
    goodChamps: [],
    badChamps: [],
    ...over,
  };
}

describe("pairChemistry", () => {
  it("is 0 for unrelated players with no stored synergy / region / duo", () => {
    expect(pairChemistry(p({ lane: "top" }), p({ lane: "jungle" }))).toBe(0);
  });

  it("reads the stored signed value, mirrored either direction", () => {
    const good = p({ id: "a", synergy: { b: 0.6 } });
    const b = p({ id: "b" });
    expect(pairChemistry(good, b)).toBeCloseTo(0.6);
    expect(pairChemistry(b, good)).toBeCloseTo(0.6); // mirror lookup
    const clash = p({ id: "c", synergy: { d: -0.7 } });
    expect(pairChemistry(clash, p({ id: "d" }))).toBeCloseTo(-0.7);
  });

  it("adds the bot-lane duo nudge gated by acclimation", () => {
    const adc = p({ lane: "bottom", acclimation: 1 });
    const sup = p({ lane: "support", acclimation: 1 });
    expect(pairChemistry(adc, sup)).toBeCloseTo(CHEM_DUO);
  });
});

describe("projectedChemistry", () => {
  // My roster: support from EU, the rest unset region.
  const roster: Roster = [
    p({ id: "t", lane: "top" }),
    p({ id: "j", lane: "jungle" }),
    p({ id: "m", lane: "middle" }),
    p({ id: "adc", lane: "bottom" }),
    p({ id: "sup", lane: "support", homeRegion: "EU", acclimation: 1 }),
  ];

  it("projects the derived bot-duo + same-region nudge for an incoming ADC", () => {
    // A fresh EU bottom signing has no stored synergy with my players, but gets
    // the bot-duo nudge (with my support) AND a same-region nudge (both EU).
    const incoming = p({ id: "new", lane: "bottom", homeRegion: "EU", acclimation: 1 });
    expect(projectedChemistry(roster, incoming, "bottom")).toBeGreaterThan(0);
  });

  it("is ~0 for a region-less non-bot signing (no derived signal, no stored pair)", () => {
    const incoming = p({ id: "new", lane: "middle" });
    expect(projectedChemistry(roster, incoming, "middle")).toBe(0);
  });
});

describe("laneChemistryBias", () => {
  it("favors the side with better chemistry; clashing pulls negative; symmetric = 0", () => {
    const gelled: Roster = [
      p({ id: "t" }),
      p({ id: "j" }),
      p({ id: "m" }),
      p({ id: "adc", lane: "bottom", synergy: { sup: 0.8 } }),
      p({ id: "sup", lane: "support", synergy: { adc: 0.8 } }),
    ];
    const clashing: Roster = [
      p({ id: "t2" }),
      p({ id: "j2" }),
      p({ id: "m2" }),
      p({ id: "adc2", lane: "bottom", synergy: { sup2: -0.8 } }),
      p({ id: "sup2", lane: "support", synergy: { adc2: -0.8 } }),
    ];
    expect(laneChemistryBias(gelled, clashing, "bottom")).toBeGreaterThan(0);
    expect(laneChemistryBias(clashing, gelled, "bottom")).toBeLessThan(0);
    expect(laneChemistryBias(gelled, gelled, "bottom")).toBe(0);
    expect(laneChemistryBias(undefined, undefined, "middle")).toBe(0);
  });
});

describe("assignSynergies", () => {
  const base: Roster = [
    p({ lane: "top" }),
    p({ lane: "jungle" }),
    p({ lane: "middle" }),
    p({ lane: "bottom" }),
    p({ lane: "support" }),
  ];

  it("fills every teammate pair with a mirrored signed value and stable ids", () => {
    const out = assignSynergies(base, "Team A");
    for (const pl of out) {
      expect(pl.id).toBeTruthy();
      expect(pl.synergy && Object.keys(pl.synergy).length).toBe(4); // 4 teammates
    }
    // Mirrored: a→b equals b→a.
    const [a, b] = out;
    expect(a.synergy![b.id!]).toBeCloseTo(b.synergy![a.id!]);
  });

  // Compare the multiset of rolled VALUES (ids are auto-minted per call via a
  // global counter, so they differ across calls — but the seeded rolls don't).
  const values = (r: Roster): number[] =>
    r.flatMap((x) => Object.values(x.synergy ?? {})).sort((m, n) => m - n);

  it("rolls deterministic values for a given seed key, and is idempotent once set", () => {
    const a = assignSynergies(base, "Team A");
    const b = assignSynergies(base, "Team A");
    expect(values(a)).toEqual(values(b));
    // Re-running on an already-assigned roster returns it untouched.
    expect(assignSynergies(a, "Team A")).toBe(a);
  });

  it("produces different chemistry for different seed keys", () => {
    const a = assignSynergies(base, "Team A");
    const b = assignSynergies(base, "Team B");
    expect(values(a)).not.toEqual(values(b));
  });

  it("fills only the MISSING pairs after a transfer, keeping surviving duos", () => {
    // adc & sup already gel (stored); the other three just arrived (no pairs).
    const reshaped: Roster = [
      p({ id: "t" }),
      p({ id: "j" }),
      p({ id: "m" }),
      p({ id: "adc", lane: "bottom", synergy: { sup: 0.9 } }),
      p({ id: "sup", lane: "support", synergy: { adc: 0.9 } }),
    ];
    const out = assignSynergies(reshaped, "X");
    const adc = out.find((x) => x.id === "adc")!;
    const sup = out.find((x) => x.id === "sup")!;
    expect(adc.synergy!.sup).toBe(0.9); // surviving duo untouched
    expect(sup.synergy!.adc).toBe(0.9);
    // Every player now has all 4 teammate links (the new pairs got rolled).
    for (const pl of out) expect(Object.keys(pl.synergy!).length).toBe(4);
  });
});

describe("chemistry drift", () => {
  const duo: Roster = [
    { id: "adc", lane: "bottom", tier: "B", goodChamps: [], badChamps: [], synergy: { sup: 0.1 } },
    { id: "sup", lane: "support", tier: "B", goodChamps: [], badChamps: [], synergy: { adc: 0.1 } },
    { id: "t", lane: "top", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
    { id: "j", lane: "jungle", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
    { id: "m", lane: "middle", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
  ];

  it("results drift raises pairs on a win, lowers on a loss, mirrored", () => {
    const won = driftSynergiesFromResult(duo, +1);
    const a = won.find((x) => x.id === "adc")!;
    const b = won.find((x) => x.id === "sup")!;
    expect(a.synergy!.sup).toBeCloseTo(0.1 + CHEM_RESULT_STEP);
    expect(b.synergy!.adc).toBeCloseTo(0.1 + CHEM_RESULT_STEP); // mirror

    const lost = driftSynergiesFromResult(duo, -1);
    expect(lost.find((x) => x.id === "adc")!.synergy!.sup).toBeCloseTo(
      0.1 - CHEM_RESULT_STEP,
    );
    // A mid-table finish (0) leaves it untouched (same ref).
    expect(driftSynergiesFromResult(duo, 0)).toBe(duo);
  });

  it("does NOT mint chemistry for never-rolled pairs (rookie stays empty for assignSynergies)", () => {
    const withRookie: Roster = [
      { id: "a", lane: "top", tier: "B", goodChamps: [], badChamps: [], synergy: { b: 0.2 } },
      { id: "b", lane: "jungle", tier: "B", goodChamps: [], badChamps: [], synergy: { a: 0.2 } },
      { id: "rookie", lane: "middle", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
      { id: "d", lane: "bottom", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
      { id: "e", lane: "support", tier: "B", goodChamps: [], badChamps: [], synergy: {} },
    ];
    const out = driftSynergiesOverTime(withRookie);
    // The rookie's pairs were never rolled → drift must leave them empty so a
    // later assignSynergies still rolls their real innate values.
    expect(Object.keys(out.find((x) => x.id === "rookie")!.synergy ?? {})).toHaveLength(0);
    // The existing a-b pair still drifts up.
    expect(out.find((x) => x.id === "a")!.synergy!.b).toBeGreaterThan(0.2);
  });

  it("time drift eases pairs up toward the familiarity ceiling, never past it", () => {
    let r: Roster = duo;
    for (let i = 0; i < 50; i++) r = driftSynergiesOverTime(r);
    const a = r.find((x) => x.id === "adc")!;
    expect(a.synergy!.sup).toBeCloseTo(CHEM_TIME_TARGET); // settles at ceiling
    expect(a.synergy!.sup).toBeLessThanOrEqual(CHEM_TIME_TARGET);
  });
});
