import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const flushPendingSqliteWrites = vi.fn().mockResolvedValue(undefined);
const hasPendingSqliteWrites = vi.fn(() => false);

vi.mock("./desktopSqliteStorage", () => ({
  flushPendingSqliteWrites,
  hasPendingSqliteWrites,
}));

import { flushPendingPersistWrites } from "./desktopStorage";

describe("flushPendingPersistWrites", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flushPendingSqliteWrites.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes SQLite writes before legacy file writes", async () => {
    const order: string[] = [];
    flushPendingSqliteWrites.mockImplementation(async () => {
      order.push("sqlite");
    });

    // Schedule a debounced file write via the module's internal scheduleWrite.
    // We reach it through createWebLazyStorage which shares the debounce map.
    const { createWebLazyStorage, enablePersistWrites } = await import(
      "./desktopStorage"
    );
    const mockStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    enablePersistWrites();
    const lazy = createWebLazyStorage(() => mockStorage);
    lazy.setItem("draftsim-store", { state: {}, version: 6 });

    await flushPendingPersistWrites();

    expect(flushPendingSqliteWrites).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("sqlite");
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
