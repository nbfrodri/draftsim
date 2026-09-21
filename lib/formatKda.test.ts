import { describe, expect, it } from "vitest";
import { formatKda, formatAggregateKda } from "./formatKda";

describe("KDA presentation", () => {
  it("distinguishes a perfect game, an explicit zero game and absent data", () => {
    expect(formatKda({ k: 8, d: 0, a: 12 })).toBe("Perfect KDA");
    expect(formatKda({ k: 0, d: 0, a: 0 })).toBe("Perfect KDA");
    expect(formatKda(null)).toBe("—");
    expect(formatKda(undefined)).toBe("—");
    expect(formatAggregateKda(0, 0, 0)).toBe("—");
  });
  it("formats finite ratios and rejects invalid statistics", () => {
    expect(formatKda({ k: 8, d: 2, a: 12 })).toBe("10.0 KDA");
    expect(formatKda({ k: 0, d: 2, a: 0 }, 2)).toBe("0.00 KDA");
    expect(formatKda({ k: NaN, d: 0, a: 0 })).toBe("—");
    expect(formatKda({ k: 1, d: -1, a: 0 })).toBe("—");
  });
});
