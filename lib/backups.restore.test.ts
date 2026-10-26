import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ order: [] as string[], invoke: vi.fn() }));
vi.mock("./desktopStorage", () => ({
  isDesktop: () => true,
  isDesktopOperationBlocking: () => false,
  flushPendingPersistWrites: async () => {},
  pausePersistWrites: () => () => {},
  signalRestoringBackup: () => {},
  signalCreatingBackup: () => {},
  waitForDesktopOverlayPaint: async () => {},
  discardPendingPersistWritesAfterRestore: async () => {},
  prepareConfirmedRestoreReload: () => () => {},
  clearDesktopOperation: () => {},
}));
vi.mock("./persistenceStatus", () => ({ getPersistenceError: () => null, getPersistenceSnapshot: () => ({}), subscribePersistenceStatus: () => () => {} }));
vi.mock("@/store/draftStore", () => ({ useDraftStore: { getState: () => ({ simulating: null }) } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: calls.invoke, Channel: class { onmessage?: (step: string) => void; } }));
vi.mock("./desktopSqlite", () => ({ forgetDesktopWriteBaselines: vi.fn(async () => { calls.order.push("forget"); }) }));
import { restoreBackup } from "./backups";
import { forgetDesktopWriteBaselines } from "./desktopSqlite";

beforeEach(() => {
  calls.order.length = 0;
  vi.stubGlobal("window", { location: { reload: () => calls.order.push("reload") } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("desktop backup restore", () => {
  it("forgets save baselines of the replaced database before reloading", async () => {
    calls.invoke.mockImplementation(async () => { calls.order.push("restore"); });
    await restoreBackup("backup-1.db");
    expect(calls.order).toEqual(["restore", "forget", "reload"]);
  });
  it("forgets save baselines when the native restore fails", async () => {
    calls.invoke.mockRejectedValue(new Error("Restart to complete interrupted recovery"));
    await expect(restoreBackup("backup-1.db")).rejects.toThrow("interrupted recovery");
    expect(forgetDesktopWriteBaselines).toHaveBeenCalledOnce();
    expect(calls.order).not.toContain("reload");
  });
});
