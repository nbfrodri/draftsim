import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
import { parseRealityImport, parseRealityImportBytes, previewRealityImport, previewRealityImportFile, parseSeasonImport } from "./importPreview";
import { buildSeasonHistoryEntry } from "./season/history";
import { encodeRealityShareCode } from "./realityShare";
const season = makeAuditSeason("Preview");
const reality = { id: "Preview", name: "Preview", year: 1, season, history: [] };
const json = JSON.stringify({ kind: "reality", version: 1, reality });
describe("import preview", () => {
  it("shows replacements and teams without changing the target", async () => {
    const existing = [{ id: "Preview", name: "Original" }];
    const preview = await previewRealityImport(await encodeRealityShareCode(json), existing);
    expect(preview.replaces).toBe("Original"); expect(preview.teams).toHaveLength(season.teams.length);
    expect(preview.reality).toEqual(parseRealityImport(json)); expect(existing[0].name).toBe("Original");
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


it("accepts a reality with more than the former 12 million nodes", () => {
  // A wide JSON array catches both the old node cap and breadth-sized queues.
  const input = json.slice(0, -1) + ',"archiveIndex":[' + '0,'.repeat(12_000_000) + '0]}';
  expect(parseRealityImport(input).id).toBe(reality.id);
}, 30_000);

describe("reality files read in parts", () => {
  const archived = JSON.parse(JSON.stringify(buildSeasonHistoryEntry(season, 1)));
  const withHistory = JSON.stringify({ kind: "reality", version: 1, reality: { ...reality, history: [archived, { ...archived, id: "second" }] } }, null, 1);
  const gzip = async (text: string) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

  it("reads plain and gzip files into the same reality as the single-text path", async () => {
    const expected = parseRealityImport(withHistory);
    expect(await parseRealityImportBytes(new TextEncoder().encode(withHistory))).toEqual(expected);
    expect(await parseRealityImportBytes(await gzip(withHistory))).toEqual(expected);
    const preview = await previewRealityImportFile(await gzip(withHistory), []);
    expect(preview).toMatchObject({ id: reality.id, archivedYears: 2, replaces: null });
  });

  it("validates every archived year and refuses unsafe or invalid parts", async () => {
    const bad = (history: unknown[]) => new TextEncoder().encode(JSON.stringify({ kind: "reality", version: 1, reality: { ...reality, history } }));
    await expect(parseRealityImportBytes(bad([archived, {}]))).rejects.toThrow(/history/);
    const unsafe = new TextEncoder().encode(withHistory.replace('"name"', '"__proto__":{"x":1},"name"'));
    await expect(parseRealityImportBytes(unsafe)).rejects.toThrow(/Unsafe key/);
    await expect(parseRealityImportBytes(new TextEncoder().encode(withHistory.slice(0, -2)))).rejects.toThrow(/truncated/);
  });

  it("keeps a reality without history and checks the export kind", async () => {
    expect((await parseRealityImportBytes(new TextEncoder().encode(json))).id).toBe(reality.id);
    await expect(parseRealityImportBytes(new TextEncoder().encode(JSON.stringify({ kind: "season" })))).rejects.toThrow(/reality export/);
  });
});
