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
  loadRealitySeasonFromDb: vi.fn(),
}));
import { loadRealitySeasonFromDb, loadRealityHistoryFromDb, resetSqliteStorageForTests } from "./desktopSqlite";
import { useDraftStore } from "../store/draftStore";
const entry: SeasonHistoryEntry = { id: "past", name: "Past", archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} };
function slot(id: string) { return { id, name: id, year: 1, season: makeAuditSeason(id), history: [] as SeasonHistoryEntry[] }; }
beforeEach(() => {
  desktop.enabled = false;
  resetSqliteStorageForTests();
  vi.mocked(loadRealityHistoryFromDb).mockReset();
  vi.mocked(loadRealitySeasonFromDb).mockReset();
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


describe("lazy season bodies", () => {
  function unloadB() {
    desktop.enabled = true;
    useDraftStore.setState(s => ({ realities: s.realities.map(r => r.id === "B" ? { ...r, season: null } : r) }));
    vi.mocked(loadRealityHistoryFromDb).mockResolvedValue([entry]);
  }
  it("exports an unloaded body and full history without activating it", async () => {
    unloadB();
    const body = makeAuditSeason("B");
    vi.mocked(loadRealitySeasonFromDb).mockResolvedValue(body);
    const exported = JSON.parse((await useDraftStore.getState().exportReality("B"))!);
    expect(exported.reality.season.id).toBe(body.id);
    expect(exported.reality.season.teams).toEqual(JSON.parse(JSON.stringify(body.teams)));
    expect(exported.reality.history).toEqual([entry]);
    expect(useDraftStore.getState().activeRealityId).toBe("A");
    expect(useDraftStore.getState().realities.find(r => r.id === "B")!.season).toBeNull();
  });
  it("failed body loading keeps current state and refuses incomplete export", async () => {
    unloadB();
    vi.mocked(loadRealitySeasonFromDb).mockRejectedValue(new Error("corrupt season"));
    await expect(useDraftStore.getState().switchReality("B")).rejects.toThrow("corrupt season");
    expect(useDraftStore.getState().activeRealityId).toBe("A");
    expect(await useDraftStore.getState().exportReality("B")).toBeNull();
  });
  it("a delayed inactive body cannot replace a more recently opened reality", async () => {
    unloadB();
    let resolve!: (season: ReturnType<typeof makeAuditSeason>) => void;
    vi.mocked(loadRealitySeasonFromDb).mockReturnValue(new Promise(r => { resolve = r; }));
    const first = useDraftStore.getState().switchReality("B");
    await vi.waitFor(() => expect(loadRealitySeasonFromDb).toHaveBeenCalledWith("B"));
    await useDraftStore.getState().switchReality("C");
    resolve(makeAuditSeason("B")); await first;
    expect(useDraftStore.getState().activeRealityId).toBe("C");
    expect(useDraftStore.getState().realities.find(r => r.id === "B")!.season).toBeNull();
  });
});
