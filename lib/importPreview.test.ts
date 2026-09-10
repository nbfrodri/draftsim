import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
import { parseRealityImport, previewRealityImport, parseSeasonImport } from "./importPreview";
import { encodeRealityShareCode } from "./realityShare";
const season = makeAuditSeason("Preview");
const reality = { id: "Preview", name: "Preview", year: 1, season, history: [] };
const json = JSON.stringify({ kind: "reality", version: 1, reality });
describe("import preview", () => {
  it("shows replacements and teams without changing the target", async () => {
    const existing = [{ id: "Preview", name: "Original" }];
    const preview = await previewRealityImport(await encodeRealityShareCode(json), existing);
    expect(preview.replaces).toBe("Original"); expect(preview.teams).toHaveLength(season.teams.length);
    expect(preview.json).toBe(json); expect(existing[0].name).toBe("Original");
  });
  it("rejects unsupported versions, truncation and invalid history with specific reasons", () => {
    expect(() => parseRealityImport(json.replace('"version":1', '"version":99'))).toThrow(/version/);
    expect(() => parseRealityImport(json.slice(0,-1))).toThrow(/truncated/);
    expect(() => parseRealityImport(JSON.stringify({ kind: "reality", reality: { ...reality, history: [{}] } }))).toThrow(/history/);
  });
  it("uses the same season validation for preview and apply", () => {
    expect(parseSeasonImport(JSON.stringify({ id: season.id, season })).season.id).toBe(season.id);
    expect(() => parseSeasonImport(JSON.stringify({ id: "x", season: {} }))).toThrow(/invalid/);
  });
});
