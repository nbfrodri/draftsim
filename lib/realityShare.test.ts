import { describe, expect, it } from "vitest";

import { decodeRealityShareCode, encodeRealityShareCode } from "@/lib/realityShare";

describe("reality share codes", () => {
  it("round-trips a JSON export through REAL1:", async () => {
    const json = JSON.stringify({
      kind: "reality",
      version: 1,
      reality: { id: "r-test", name: "Test", year: 1 },
    });
    const code = await encodeRealityShareCode(json);
    expect(code.startsWith("REAL1:")).toBe(true);
    const decoded = await decodeRealityShareCode(code);
    expect(decoded.error).toBeNull();
    expect(decoded.json).toBe(json);
  });

  it("accepts raw JSON without REAL1 prefix", async () => {
    const json = '{"kind":"reality"}';
    const decoded = await decodeRealityShareCode(json);
    expect(decoded.json).toBe(json);
  });
});
