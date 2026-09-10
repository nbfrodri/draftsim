import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
import type { SeasonHistoryEntry } from "./season/history";
const desktop = vi.hoisted(() => ({ enabled: false }));
vi.mock("./desktopStorage", async (original) => ({
  ...await original<typeof import("./desktopStorage")>(),
  isDesktop: () => desktop.enabled,
  flushPendingPersistWrites: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./desktopSqlite", async (original) => ({
  ...await original<typeof import("./desktopSqlite")>(),
  loadRealityHistoryFromDb: vi.fn(),
}));
import { loadRealityHistoryFromDb, resetSqliteStorageForTests } from "./desktopSqlite";
import { useDraftStore } from "../store/draftStore";
const entry: SeasonHistoryEntry = { id: "past", name: "Past", archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} };
function slot(id: string) { return { id, name: id, year: 1, season: makeAuditSeason(id), history: [] as SeasonHistoryEntry[] }; }
beforeEach(() => {
  desktop.enabled = false;
  resetSqliteStorageForTests();
  vi.mocked(loadRealityHistoryFromDb).mockReset();
  const a = slot("A"), b = slot("B"), c = slot("C");
  useDraftStore.setState({ realities: [a,b,c], activeRealityId: "A", season: a.season });
});
describe("reality state transitions", () => {
  it("replaces the live season when importing over the active slot", async () => {
    const replacement = slot("A"); replacement.season.name = "Imported";
    const result = await useDraftStore.getState().importReality(JSON.stringify({ kind: "reality", reality: replacement }));
    expect(result.ok).toBe(true);
    expect(useDraftStore.getState().season?.name).toBe("Imported");
    expect(JSON.parse((await useDraftStore.getState().exportReality("A"))!).reality.season.name).toBe("Imported");
  });
  it("does not activate an empty placeholder while history is loading", async () => {
    desktop.enabled = true;
    let resolve!: (history: SeasonHistoryEntry[]) => void;
    vi.mocked(loadRealityHistoryFromDb).mockReturnValue(new Promise(r => { resolve = r; }));
    const switching = useDraftStore.getState().switchReality("B");
    await vi.waitFor(() => expect(loadRealityHistoryFromDb).toHaveBeenCalled());
    expect(useDraftStore.getState().activeRealityId).toBe("A");
    resolve([entry]); await switching;
    expect(useDraftStore.getState().activeRealityId).toBe("B");
    expect(useDraftStore.getState().realities.find(r => r.id === "B")?.history).toEqual([entry]);
  });
  it("keeps the current reality on a failed history read", async () => {
    desktop.enabled = true;
    vi.mocked(loadRealityHistoryFromDb).mockRejectedValue(new Error("locked"));
    await expect(useDraftStore.getState().switchReality("B")).rejects.toThrow("locked");
    expect(useDraftStore.getState().activeRealityId).toBe("A");
  });
  it("a late B read cannot replace C after rapid switches", async () => {
    desktop.enabled = true;
    let resolveB!: (history: SeasonHistoryEntry[]) => void;
    vi.mocked(loadRealityHistoryFromDb).mockImplementation(id => id === "B"
      ? new Promise(r => { resolveB = r; }) : Promise.resolve([entry]));
    const b = useDraftStore.getState().switchReality("B");
    await vi.waitFor(() => expect(loadRealityHistoryFromDb).toHaveBeenCalledWith("B"));
    await useDraftStore.getState().switchReality("C");
    resolveB([entry]); await b;
    expect(useDraftStore.getState().activeRealityId).toBe("C");
    expect(useDraftStore.getState().realities.find(r => r.id === "B")?.history).toEqual([]);
  });
});


it("exports dormant history without activating or marking the slot loaded", async () => {
  desktop.enabled = true;
  vi.mocked(loadRealityHistoryFromDb).mockResolvedValue([entry]);
  const json = await useDraftStore.getState().exportReality("B");
  expect(JSON.parse(json!).reality.history).toEqual([entry]);
  expect(useDraftStore.getState().activeRealityId).toBe("A");
  expect(useDraftStore.getState().realities.find(r => r.id === "B")?.history).toEqual([]);
});
it("refuses a silently incomplete backup when the history read fails", async () => {
  desktop.enabled = true;
  vi.mocked(loadRealityHistoryFromDb).mockRejectedValue(new Error("locked"));
  expect(await useDraftStore.getState().exportReality("B")).toBeNull();
});
