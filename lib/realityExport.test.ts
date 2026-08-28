import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  realityExportFilename,
  writeRealityExportToTarget,
  type RealityExportTarget,
} from "./realityExport";

vi.mock("./desktopStorage", () => ({
  isDesktop: () => false,
  pickSavePathNative: vi.fn(),
  saveFileNative: vi.fn(),
  writeTextFileAtPathNative: vi.fn(),
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
