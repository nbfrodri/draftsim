import { describe, it, expect } from "vitest";
import { applyChampHandles } from "@/components/betweenGames/shared";

// Event-log substitution: champion names in generated descriptions are
// swapped for the player handle of whoever piloted that champion. Lives under
// lib/ because the vitest config only scans lib/** for *.test.ts.
describe("applyChampHandles", () => {
  it("replaces champion names with player handles", () => {
    const map = new Map([["Ahri", "Faker"]]);
    expect(applyChampHandles("Ahri roams mid", map)).toBe("Faker roams mid");
  });

  it("does NOT re-mangle an inserted handle with a shorter champ name", () => {
    // Regression: "Viktor" -> "Vicla", then champ "Vi" must not hit "Vicla".
    const map = new Map([
      ["Viktor", "Vicla"],
      ["Vi", "Jankos"],
    ]);
    expect(applyChampHandles("Viktor outscales Vi", map)).toBe(
      "Vicla outscales Jankos",
    );
  });

  it("prefers the longer name when one is a prefix of another", () => {
    const map = new Map([
      ["Miss Fortune", "Gumayusi"],
      ["Miss", "Nobody"],
    ]);
    expect(applyChampHandles("Miss Fortune fires", map)).toBe("Gumayusi fires");
  });

  it("handles names with regex-special characters", () => {
    const map = new Map([["Kai'Sa", "Ruler"]]);
    expect(applyChampHandles("Kai'Sa cleans up", map)).toBe("Ruler cleans up");
  });
});
