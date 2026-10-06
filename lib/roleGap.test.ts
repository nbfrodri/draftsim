import { describe, expect, it } from "vitest";
import { roleGaps } from "./roleGap";

describe("roleGaps", () => {
  it("flags lanes past the threshold, biggest first, with the winning side", () => {
    expect(roleGaps([6, 8.5, 5, 7, 6], [6.5, 6, 8.2, 7.4, 6])).toEqual([
      { lane: "middle", label: "Mid Gap", side: "red", diff: 3.2 },
      { lane: "jungle", label: "Jungle Gap", side: "blue", diff: 2.5 },
    ]);
  });

  it("skips unrated lanes and small differences", () => {
    expect(roleGaps([0, 9, 7, 7, 7], [9, 0, 5.1, 7, 7])).toEqual([]);
  });
});
