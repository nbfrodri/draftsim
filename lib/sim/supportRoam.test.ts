import { describe, it, expect } from "vitest";
import { supportRoamLaneGold } from "./descriptions";

// The support roam: upside in the lane the support helps, with the ADC left
// alone in bot as the causal counterpart. Net positive for the roaming side
// (the roam is worth it) but bottom pays a real cost — and the whole thing is
// mirror-symmetric so it cancels in an even matchup (calibration holds).
describe("supportRoamLaneGold", () => {
  it("rewards target lane + support, penalizes the abandoned ADC (blue)", () => {
    const d = supportRoamLaneGold("middle", 100, 50, "blue");
    expect(d.middle).toBeCloseTo(60);
    expect(d.support).toBeCloseTo(40);
    expect(d.bottom).toBeCloseTo(-50); // ADC left alone bleeds
    const net = (d.middle ?? 0) + (d.support ?? 0) + (d.bottom ?? 0);
    expect(net).toBeGreaterThan(0); // a good roam still nets the team ahead
  });

  it("is mirror-symmetric (red is the sign-flip of blue)", () => {
    const blue = supportRoamLaneGold("top", 100, 50, "blue");
    const red = supportRoamLaneGold("top", 100, 50, "red");
    expect(red.top).toBeCloseTo(-(blue.top ?? 0));
    expect(red.support).toBeCloseTo(-(blue.support ?? 0));
    expect(red.bottom).toBeCloseTo(-(blue.bottom ?? 0));
  });
});
