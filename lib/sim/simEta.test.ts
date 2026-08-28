import { describe, expect, it } from "vitest";
import {
  estimateRemainingMs,
  formatElapsedDuration,
  formatRemainingDuration,
} from "./simEta";

describe("estimateRemainingMs", () => {
  it("returns null when nothing completed yet", () => {
    expect(estimateRemainingMs(5000, 0, 10)).toBeNull();
  });

  it("extrapolates linearly from average per unit", () => {
    // 2 of 10 done in 60s → 8 left × 30s = 240s
    expect(estimateRemainingMs(60_000, 2, 10)).toBe(240_000);
  });

  it("returns null when already finished", () => {
    expect(estimateRemainingMs(60_000, 10, 10)).toBeNull();
  });
});

describe("formatRemainingDuration", () => {
  it("formats seconds", () => {
    expect(formatRemainingDuration(15_000)).toBe("~15s remaining");
  });

  it("formats minutes", () => {
    expect(formatRemainingDuration(180_000)).toBe("~3 min remaining");
  });

  it("formats hours and minutes", () => {
    expect(formatRemainingDuration(5_400_000)).toBe("~1 hr 30 min remaining");
  });

  it("formats whole hours", () => {
    expect(formatRemainingDuration(7_200_000)).toBe("~2 hr remaining");
  });
});

describe("formatElapsedDuration", () => {
  it("formats seconds", () => {
    expect(formatElapsedDuration(12_000)).toBe("12s elapsed");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedDuration(135_000)).toBe("2m 15s elapsed");
  });

  it("formats whole minutes", () => {
    expect(formatElapsedDuration(120_000)).toBe("2m elapsed");
  });

  it("formats hours and minutes", () => {
    expect(formatElapsedDuration(5_400_000)).toBe("1h 30m elapsed");
  });
});
