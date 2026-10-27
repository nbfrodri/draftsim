import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  realityExportFilename,
  realityExportParts,
  textFromParts,
  writeRealityExportToTarget,
  type RealityExportTarget,
} from "./realityExport";
import { setEventRecordsLoader } from "./eventRecordsAccess";
import type { SeasonHistoryEntry } from "./season/history";

vi.mock("./desktopStorage", () => ({
  isDesktop: () => false,
  pickSavePathNative: vi.fn(),
  saveFileNative: vi.fn(),
  writeTextFileAtPathNative: vi.fn(),
  textContentBlob: vi.fn(),
}));

describe("realityExportFilename", () => {
  it("sanitizes unsafe characters and uses a stable suffix", () => {
    expect(realityExportFilename("My Reality")).toBe(
      "My Reality.draftsim-reality.json",
    );
    expect(realityExportFilename('bad/name:test')).toBe(
      "bad_name_test.draftsim-reality.json",
    );
  });

  it("falls back when name is empty after trim", () => {
    expect(realityExportFilename("   ")).toBe("reality.draftsim-reality.json");
  });
});

describe("writeRealityExportToTarget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to a desktop path via native helper", async () => {
    const { writeTextFileAtPathNative } = await import("./desktopStorage");
    vi.mocked(writeTextFileAtPathNative).mockResolvedValue({ ok: true });

    const target: RealityExportTarget = {
      kind: "desktop",
      path: "/tmp/save.draftsim-reality.json",
    };
    const res = await writeRealityExportToTarget(target, '{"v":1}');

    expect(res.ok).toBe(true);
    expect(writeTextFileAtPathNative).toHaveBeenCalledWith(
      "/tmp/save.draftsim-reality.json",
      '{"v":1}',
    );
  });

  it("requests permission before writing to a file handle", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const handle = {
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission,
      createWritable,
    } as unknown as FileSystemFileHandle;

    const target: RealityExportTarget = { kind: "web-handle", handle };
    const res = await writeRealityExportToTarget(target, '{"v":2}');

    expect(res.ok).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(createWritable).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('{"v":2}');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("realityExportParts", () => {
  const entry = (id: string, extra: Partial<SeasonHistoryEntry> = {}) => ({ id, name: `Year ${id} Ñ 🏆`, archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, ...extra }) as SeasonHistoryEntry;
  const records = [{ id: "e", label: "LCK · Winter", version: 2, scopes: [] }] as unknown as NonNullable<SeasonHistoryEntry["eventRecords"]>;

  it("streams the same JSON as one stringify, joining deferred records year by year", async () => {
    setEventRecordsLoader(async (_reality, ids) => new Map(ids.map(id => [id, records])));
    const season = { name: "Live", tournaments: { t: { id: "t" } } };
    const inline = entry("y2", { eventRecords: records });
    const deferred = entry("y1", { eventRecordsDeferred: { realityId: "r", count: 1 } });
    const parts: string[] = [];
    for await (const part of realityExportParts({ id: "r", name: "Ré \"q\"", year: 3, season, history: [inline, deferred] })) parts.push(part);
    const { eventRecordsDeferred: _marker, ...joined } = deferred;
    expect(parts.join("")).toBe(JSON.stringify({ kind: "reality", version: 1, reality: { id: "r", name: "Ré \"q\"", year: 3, season, history: [inline, { ...joined, eventRecords: records }] } }));
    // No part holds more than one archived year.
    expect(parts.filter(p => p.includes('"archivedAt"')).every(p => p.split('"archivedAt"').length === 2)).toBe(true);
    setEventRecordsLoader(async () => new Map());
  });

  it("handles an empty history", async () => {
    const text = await textFromParts(realityExportParts({ id: "r", name: "N", year: 1, season: {}, history: [] }));
    expect(JSON.parse(text)).toEqual({ kind: "reality", version: 1, reality: { id: "r", name: "N", year: 1, season: {}, history: [] } });
  });
});
