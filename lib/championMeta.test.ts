import { afterEach, describe, expect, it } from "vitest";
import {
  getEffectiveTier,
  setActiveMetaOverride,
  setMetaEnabled,
} from "./championMeta";

// Overrides are authoritative (lanes not listed read as null), so they give
// a champion a deterministic, dataset-independent set of known tiers.
afterEach(() => {
  setActiveMetaOverride(null);
  setMetaEnabled(true);
});

describe("getEffectiveTier off-position fallback", () => {
  it("returns the explicit tier when one exists", () => {
    setActiveMetaOverride({ T: { middle: "S", top: "C" } });
    expect(getEffectiveTier("T", "middle")).toBe("S");
    expect(getEffectiveTier("T", "top")).toBe("C");
  });

  it("derives a single known tier minus one notch off-position", () => {
    setActiveMetaOverride({ T: { middle: "S" } }); // S(5) -> floor(5)-1 = 4 = A
    expect(getEffectiveTier("T", "top")).toBe("A");
  });

  it("uses the floored median minus one for multiple known tiers", () => {
    // middle S(5) + top C(2) -> median 3.5 -> floor 3 -> minus 1 = 2 = C
    setActiveMetaOverride({ T: { middle: "S", top: "C" } });
    expect(getEffectiveTier("T", "jungle")).toBe("C");
  });

  it("floors at D and never below", () => {
    setActiveMetaOverride({ T: { middle: "D" } }); // D(1) -> floor(1)-1 = 0 -> clamp D
    expect(getEffectiveTier("T", "top")).toBe("D");
  });

  it("floors at D for a lane the champion cannot play", () => {
    setActiveMetaOverride({ T: { middle: "S" } });
    // middle-only champion forced into support: hard off-meta regardless of
    // its S mid tier.
    expect(getEffectiveTier("T", "support", ["middle"])).toBe("D");
  });

  it("uses median-1 for a playable lane that lacks a meta tier", () => {
    setActiveMetaOverride({ T: { middle: "S" } });
    // support is a role it can play, just not a tiered one -> S(5) -> A.
    expect(getEffectiveTier("T", "support", ["middle", "support"])).toBe("A");
  });

  it("returns null when the champion has no tier in any lane", () => {
    setActiveMetaOverride({ T: {} });
    expect(getEffectiveTier("T", "top")).toBeNull();
  });

  it("returns null when the meta is disabled", () => {
    setActiveMetaOverride({ T: { middle: "S" } });
    setMetaEnabled(false);
    expect(getEffectiveTier("T", "top")).toBeNull();
  });
});
