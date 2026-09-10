import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  callback: null as null | ((event: { preventDefault: () => void }) => Promise<void>),
  flush: vi.fn(), checkpoint: vi.fn(), destroy: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (callback: typeof fake.callback) => { fake.callback = callback; },
    destroy: fake.destroy,
  }),
}));
vi.mock("./desktopSqliteStorage", () => ({ flushPendingSqliteWrites: fake.flush }));
vi.mock("./desktopSqlite", () => ({ checkpointDesktopDatabase: fake.checkpoint }));
import { signalImportingReality, clearDesktopOperation, registerTauriCloseFlushHandler, getAppClosePhase, resetAppClosePhaseForTests } from "./desktopStorage";
describe("native close lifecycle", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    resetAppClosePhaseForTests();
    fake.flush.mockReset().mockResolvedValue(undefined);
    fake.checkpoint.mockReset().mockResolvedValue(undefined);
    fake.destroy.mockReset().mockResolvedValue(undefined);
    await registerTauriCloseFlushHandler();
  });
  afterEach(() => vi.useRealTimers());
  it("keeps the window open on save failure and permits a later successful close", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.flush.mockRejectedValueOnce(new Error("disk full"));
    const preventDefault = vi.fn();
    const failed = fake.callback!({ preventDefault });
    await vi.advanceTimersByTimeAsync(1600); await failed;
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fake.destroy).not.toHaveBeenCalled();
    expect(getAppClosePhase()).toBe("idle");
    await fake.callback!({ preventDefault });
    expect(fake.destroy).toHaveBeenCalledOnce();
    expect(fake.checkpoint).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
  });
  it("blocks closing throughout restoration without flushing over the replacement", async () => {
    signalImportingReality();
    try {
      const preventDefault = vi.fn();
      await fake.callback!({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(fake.flush).not.toHaveBeenCalled();
      expect(fake.destroy).not.toHaveBeenCalled();
    } finally { clearDesktopOperation(); }
  });
  it("waits for pending I/O before destroying the window", async () => {
    let release!: () => void;
    fake.flush.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const closing = fake.callback!({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.destroy).not.toHaveBeenCalled();
    release(); await closing;
    expect(fake.checkpoint).toHaveBeenCalledOnce();
    expect(fake.destroy).toHaveBeenCalledOnce();
  });
});
