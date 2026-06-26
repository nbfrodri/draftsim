// The pentakiller picker must be carry-weighted but reach EVERY role — a
// jungler/top/mid assassin can solo-ace, not just the ADC (the old behavior).
import { describe, expect, it } from "vitest";
import { pentakiller } from "./descriptions";
import { createRng } from "../rng";
import type { Champion, Lane } from "../types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
let id = 1;
const champ = (alias: string, lane: Lane): Champion => ({
  id: id++,
  name: alias,
  alias,
  roles: lane === "bottom" ? ["Marksman"] : [],
  iconUrl: "",
  lanes: [lane],
});

describe("pentakiller", () => {
  // A carry-heavy team: bruiser top, assassin jungle, burst mid, ADC bot,
  // enchanter support. Over many rolls every non-support lane shows up, and
  // the ADC leads — but top/jungle/mid are all well-represented.
  const picks = [
    champ("Darius", "top"),
    champ("LeeSin", "jungle"),
    champ("Ahri", "middle"),
    champ("Jinx", "bottom"),
    champ("Lulu", "support"),
  ];

  it("reaches top, jungle and mid — not just the ADC", () => {
    const rng = createRng(42);
    const byLane: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const p = pentakiller(picks, rng);
      if (p) byLane[p.lane] = (byLane[p.lane] ?? 0) + 1;
    }
    // Every carry role is reachable.
    expect(byLane.top ?? 0).toBeGreaterThan(0);
    expect(byLane.jungle ?? 0).toBeGreaterThan(0);
    expect(byLane.middle ?? 0).toBeGreaterThan(0);
    expect(byLane.bottom ?? 0).toBeGreaterThan(0);
    // The ADC is the most common pentakiller.
    expect(byLane.bottom).toBeGreaterThan(byLane.top);
    // Support pentas are rare (×0.3 dampener) — far below the ADC.
    expect(byLane.support ?? 0).toBeLessThan(byLane.bottom / 2);
  });

  it("returns a champion that actually belongs to the winning team", () => {
    const p = pentakiller(picks, createRng(1));
    expect(p).not.toBeNull();
    expect(picks).toContain(p!.champ);
    expect(LANES).toContain(p!.lane);
  });

  it("handles gaps (null picks) without crashing", () => {
    const sparse = [null, champ("Graves", "jungle"), null, null, null];
    const p = pentakiller(sparse, createRng(7));
    expect(p?.lane).toBe("jungle");
  });
});
