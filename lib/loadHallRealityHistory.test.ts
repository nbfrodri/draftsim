import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: { realities: [{ id: "dormant", history: [] as unknown[], season: null }], activeRealityId: "active", season: null },
  loaded: new Set<string>(), flush: vi.fn(), read: vi.fn(), set: vi.fn(),
}));
vi.mock("@/store/draftStore", () => ({ useDraftStore: { getState: () => mocks.state, setState: (patch: Partial<typeof mocks.state>) => { mocks.set(patch); mocks.state = { ...mocks.state, ...patch }; } } }));
vi.mock("./desktopStorage", () => ({ isDesktop: () => true, flushPendingPersistWrites: mocks.flush }));
vi.mock("./desktopSqlite", () => ({ isRealityHistoryLoaded: (id: string) => mocks.loaded.has(id), markRealityHistoryLoaded: (id: string) => mocks.loaded.add(id), loadRealityHistoryFromDb: mocks.read }));
import { loadHallRealityHistory } from "./loadHallRealityHistory";
beforeEach(() => {
  mocks.state = { realities: [{ id: "dormant", history: [], season: null }], activeRealityId: "active", season: null };
  mocks.loaded.clear(); mocks.set.mockReset(); mocks.flush.mockReset().mockResolvedValue(undefined); mocks.read.mockReset().mockResolvedValue([{ id: "year-1" }]);
});
it("installs the complete history for every Hall tab without activating or loading the season", async () => {
  await loadHallRealityHistory("dormant");
  expect(mocks.state.realities[0].history).toEqual([{ id: "year-1" }]);
  expect(mocks.state.activeRealityId).toBe("active"); expect(mocks.state.realities[0].season).toBeNull();
  expect(mocks.flush).toHaveBeenCalledTimes(2); expect(mocks.loaded.has("dormant")).toBe(true);
  await loadHallRealityHistory("dormant"); expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("does not authorize writes after a failed read, and can retry", async () => {
  mocks.read.mockRejectedValueOnce(new Error("read failed"));
  await expect(loadHallRealityHistory("dormant")).rejects.toThrow("read failed");
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.loaded.size).toBe(0);
  await loadHallRealityHistory("dormant"); expect(mocks.state.realities[0].history).toHaveLength(1);
});
it("discards results after source changes or a concurrent reality replacement", async () => {
  await loadHallRealityHistory("dormant", () => false);
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.loaded.size).toBe(0);
  mocks.read.mockImplementationOnce(async () => { mocks.state.realities = [{ ...mocks.state.realities[0], history: [{ id: "newer" }] }]; return [{ id: "stale" }]; });
  await loadHallRealityHistory("dormant");
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.loaded.size).toBe(0);
  expect(mocks.state.realities[0].history).toEqual([{ id: "newer" }]);
});
it("does not install a history when pending save drainage fails", async () => {
  mocks.flush.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("save failed"));
  await expect(loadHallRealityHistory("dormant")).rejects.toThrow("save failed");
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.loaded.size).toBe(0);
});
it("installs a successfully read empty history as loaded", async () => {
  mocks.read.mockResolvedValueOnce([]);
  await loadHallRealityHistory("dormant");
  expect(mocks.set).toHaveBeenCalledTimes(1); expect(mocks.loaded.has("dormant")).toBe(true);
});

it("shares in-flight reads across simultaneous Hall requests, including Strict Mode remounts", async () => {
  const cancelled = loadHallRealityHistory("dormant", () => false);
  const current = loadHallRealityHistory("dormant");
  await Promise.all([cancelled, current]);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.flush).toHaveBeenCalledTimes(2);
  expect(mocks.set).toHaveBeenCalledTimes(1);
});

it("preserves years already in memory after dev resets load flags, instead of replacing them with empty SQLite", async () => {
  mocks.state.realities[0].history = Array.from({ length: 5 }, (_, i) => ({ id: `year-${i}` }));
  mocks.read.mockResolvedValueOnce([]);
  await loadHallRealityHistory("dormant");
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.state.realities[0].history).toHaveLength(5);
  expect(mocks.loaded.has("dormant")).toBe(true);
  expect(mocks.set).toHaveBeenCalledTimes(1);
});
