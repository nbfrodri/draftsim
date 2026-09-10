import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";

vi.mock("./desktopStorage", () => ({
  cancelPendingWrite: vi.fn(),
  isDesktop: () => true,
  migrateWebStorageToDesktop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./desktopSqlite", () => ({
  clearDesktopStoreFromDb: vi.fn(),
  loadLegacyJsonStorageValue: vi.fn().mockResolvedValue(null),
  loadStorageValueFromSqlite: vi.fn().mockResolvedValue(null),
  migrateJsonFilesToSqlite: vi.fn().mockResolvedValue(undefined),
  saveStorageValueToSqlite: vi.fn().mockResolvedValue(undefined),
}));

import { saveStorageValueToSqlite } from "./desktopSqlite";
import {
  cancelPendingSqliteWrite,
  createDesktopSqliteStorage,
  flushPendingSqliteWrites,
  hasPendingSqliteWrites,
  resetSqliteWriteQueueForTests,
} from "./desktopSqliteStorage";

const STORE = "draftsim-store";
const sampleValue = (): StorageValue<{ realities: unknown[] }> => ({
  state: { realities: [{ id: "r1" }] },
  version: 6,
});

describe("desktopSqliteStorage flush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSqliteWriteQueueForTests();
    vi.mocked(saveStorageValueToSqlite).mockClear();
  });

  afterEach(() => {
    resetSqliteWriteQueueForTests();
    vi.useRealTimers();
  });

  it("queues debounced writes and flushes before the timer fires", async () => {
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    const value = sampleValue();

    storage.setItem(STORE, value);
    expect(hasPendingSqliteWrites()).toBe(true);
    expect(saveStorageValueToSqlite).not.toHaveBeenCalled();

    await flushPendingSqliteWrites();

    expect(hasPendingSqliteWrites()).toBe(false);
    expect(saveStorageValueToSqlite).toHaveBeenCalledTimes(1);
    expect(saveStorageValueToSqlite).toHaveBeenCalledWith(STORE, value);
  });

  it("writes the latest value when multiple setItem calls are debounced", async () => {
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    const first = sampleValue();
    const second: StorageValue<{ realities: unknown[] }> = {
      state: { realities: [{ id: "r2" }] },
      version: 6,
    };

    storage.setItem(STORE, first);
    storage.setItem(STORE, second);
    expect(hasPendingSqliteWrites()).toBe(true);

    await flushPendingSqliteWrites();

    expect(saveStorageValueToSqlite).toHaveBeenCalledTimes(1);
    expect(saveStorageValueToSqlite).toHaveBeenCalledWith(STORE, second);
  });

  it("cancelPendingSqliteWrite drops a queued write without flushing", async () => {
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    storage.setItem(STORE, sampleValue());
    expect(hasPendingSqliteWrites()).toBe(true);

    cancelPendingSqliteWrite(STORE);
    expect(hasPendingSqliteWrites()).toBe(false);

    await flushPendingSqliteWrites();
    expect(saveStorageValueToSqlite).not.toHaveBeenCalled();
  });

  it("timer eventually persists when not flushed early", async () => {
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    const value = sampleValue();
    storage.setItem(STORE, value);

    await vi.advanceTimersByTimeAsync(500);

    expect(hasPendingSqliteWrites()).toBe(false);
    expect(saveStorageValueToSqlite).toHaveBeenCalledWith(STORE, value);
  });
  it("waits for a write already in flight and serializes newer snapshots", async () => {
    let finish!: () => void;
    vi.mocked(saveStorageValueToSqlite).mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    storage.setItem(STORE, sampleValue());
    await vi.advanceTimersByTimeAsync(500);
    expect(hasPendingSqliteWrites()).toBe(true);
    const next = { state: { realities: [{ id: "new" }] }, version: 6 };
    storage.setItem(STORE, next);
    let settled = false;
    const closing = flushPendingSqliteWrites().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(saveStorageValueToSqlite).toHaveBeenCalledTimes(1);
    finish();
    await closing;
    expect(saveStorageValueToSqlite).toHaveBeenLastCalledWith(STORE, next);
    expect(hasPendingSqliteWrites()).toBe(false);
  });

  it("retains failed data, propagates failure and retries without losing the snapshot", async () => {
    vi.mocked(saveStorageValueToSqlite).mockRejectedValueOnce(new Error("disk full"));
    const storage = createDesktopSqliteStorage<{ realities: unknown[] }>();
    const value = sampleValue();
    storage.setItem(STORE, value);
    await expect(flushPendingSqliteWrites()).rejects.toThrow("disk full");
    expect(hasPendingSqliteWrites()).toBe(true);
    await flushPendingSqliteWrites();
    expect(saveStorageValueToSqlite).toHaveBeenLastCalledWith(STORE, value);
    expect(hasPendingSqliteWrites()).toBe(false);
  });

});
