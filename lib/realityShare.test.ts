import { describe, expect, it } from "vitest";

import { assertRealityJsonSize, decodeRealityShareCode, encodeRealityShareCode } from "@/lib/realityShare";

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


it("previews raw and compressed realities larger than 128 MiB", async () => {
  const { makeAuditSeason } = await import("./auditFixtures");
  const { previewRealityImport } = await import("./importPreview");
  const { deflateString } = await import("./shareCodec");
  // Padding exercises real byte handling without a multi-year simulation.
  const json = JSON.stringify({ kind: "reality", version: 1, reality: {
    id: "large", name: "Large reality", year: 1, season: makeAuditSeason(), history: [],
  }, notes: "x".repeat(129 * 1024 * 1024) });
  expect((await previewRealityImport(json, [])).id).toBe("large");
  const code = await encodeRealityShareCode(json);
  const preview = await previewRealityImport(code, []);
  expect(preview.id).toBe("large");
  expect(preview.json.length).toBe(json.length);
  // Other export types retain their original budget.
  await expect(deflateString(json)).rejects.toThrow("128 MiB");
}, 30_000);

it("rejects reality UTF-8 beyond 512 MiB even when character count fits", () => {
  // A rope stays compact until the chunked byte counter consumes it.
  expect(() => assertRealityJsonSize("\u0800".repeat(180 * 1024 * 1024))).toThrow("512 MiB");
});
