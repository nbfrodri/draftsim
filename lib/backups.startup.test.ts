import { afterEach, beforeEach, expect, it, vi } from "vitest";
const status = vi.hoisted(() => ({ phase: "saved", listener: undefined as undefined | (() => void) }));
vi.mock("./desktopStorage", () => ({ isDesktop: () => false, flushPendingPersistWrites: async () => {} }));
vi.mock("./persistenceStatus", () => ({ getPersistenceError: () => null, getPersistenceSnapshot: () => ({ phase: status.phase }), subscribePersistenceStatus: (fn: () => void) => { status.listener = fn; return () => { status.listener = undefined; }; } }));
let items: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-17")); status.phase = "saved";
  items = new Map([["draftsim-store", JSON.stringify({ version: 7, state: { realities: [] } })]]);
  vi.stubGlobal("localStorage", { get length() { return items.size; }, key: (i: number) => [...items.keys()][i], getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("keeps automatic backup work out of startup, then creates a recovery copy", async () => {
  const { startAutomaticBackups } = await import("./backups");
  const stop = startAutomaticBackups();
  await vi.advanceTimersByTimeAsync(29_999); expect(items.size).toBe(1);
  await vi.advanceTimersByTimeAsync(1); expect(items.size).toBe(2);
  stop();
});
it("waits for successful saving and cancels scheduled work on cleanup", async () => {
  const { startAutomaticBackups } = await import("./backups");
  const stop = startAutomaticBackups();
  status.phase = "saving";
  await vi.advanceTimersByTimeAsync(30_000); expect(items.size).toBe(1);
  status.phase = "saved"; status.listener?.();
  stop(); await vi.advanceTimersByTimeAsync(5_000); expect(items.size).toBe(1);
});
it("manual backup still works immediately and suppresses the queued duplicate", async () => {
  const { startAutomaticBackups, createBackup } = await import("./backups");
  const stop = startAutomaticBackups();
  await createBackup(); expect(items.size).toBe(2);
  await vi.advanceTimersByTimeAsync(30_000); expect(items.size).toBe(2);
  stop();
});
