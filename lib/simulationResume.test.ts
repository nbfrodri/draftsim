import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./desktopStorage", () => ({ flushPendingPersistWrites: vi.fn().mockResolvedValue(undefined) }));
import { flushPendingPersistWrites } from "./desktopStorage";
import { reportPersistenceError } from "./persistenceStatus";
import { createSimulationActions } from "@/store/actions/simulation";
import type { DraftStore, StoreSet } from "@/store/types";
import { makeAuditSeason } from "./auditFixtures";
function harness(options: { cancelAfterShop?: boolean } = {}) {
  const season = makeAuditSeason("Resume");
  let state = { season, champions: [], playerForms: {}, bulkYearJobs: {}, simulating: null, bulkYearsProgress: null,
    realities: [{ id: "Resume", name: "Resume", year: 1, season, history: [] }] } as unknown as DraftStore;
  let pauseAt = 2, cancelAfterShop = !!options.cancelAfterShop;
  const get = () => state;
  const set: StoreSet = patch => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    if (state.bulkYearsProgress && state.season?.franchise?.year === pauseAt) state.bulkYearsCancelRequested = true;
  };
  const helpers: Parameters<typeof createSimulationActions>[2] = {
    resetSimResultsBatch: () => {}, appendSimResults: () => {}, flushSimResultsFeed: () => {},
    applyMetaSnapshotPatch: () => ({}), autoResolveOffseasonShop: s => {
      // A click queued while the completed year renders, before archival starts.
      if (cancelAfterShop) { cancelAfterShop = false; setTimeout(() => get().cancelBulkYears(), 0); }
      return s;
    },
    runFranchiseSeasonSim: async () => { set({ season: { ...state.season!, status: "complete" } }); return true; },
    rollFranchiseToNextYearState: s => ({ season: { ...s, status: "in-progress", franchise: { ...s.franchise!, year: s.franchise!.year+1 } }, history: [] }),
  };
  Object.assign(state, createSimulationActions(get, set, helpers));
  return { get, resume: () => { pauseAt = -1; get().resumeBulkYears(); } };
}
beforeEach(() => { reportPersistenceError(null, "simulation"); vi.mocked(flushPendingPersistWrites).mockReset().mockResolvedValue(undefined); });
describe("bulk simulation checkpoint", () => {
  it("lets a queued cancellation run before archiving the completed season", async () => {
    const h = harness({ cancelAfterShop: true }); h.get().simulateRealityYears(3);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().season?.franchise?.year).toBe(1);
    expect(h.get().season?.status).toBe("complete");
    expect(h.get().realities[0].history).toEqual([]);
    expect(h.get().bulkYearJobs.Resume.targetYear).toBe(4);
    expect(flushPendingPersistWrites).toHaveBeenCalled();
    h.resume(); await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().season?.franchise?.year).toBe(4);
    expect(h.get().bulkYearJobs.Resume).toBeUndefined();
  });
  it("does not start another simulation while a save failure is unresolved", () => {
    reportPersistenceError("disk full", "simulation");
    const h = harness();
    h.get().simulateRealityYears(3);
    expect(h.get().simulating).toBeNull();
    expect(h.get().bulkYearJobs).toEqual({});
    reportPersistenceError(null, "simulation");
  });
  it("resumes only remaining years after a coherent pause", async () => {
    const h = harness(); h.get().simulateRealityYears(3);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().season?.franchise?.year).toBe(2);
    expect(h.get().bulkYearJobs.Resume.targetYear).toBe(4);
    h.resume(); await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().season?.franchise?.year).toBe(4);
    expect(h.get().bulkYearJobs.Resume).toBeUndefined();
    expect(flushPendingPersistWrites).toHaveBeenCalled();
  });
  it("clears busy flags on persistence failure and retains a resumable target", async () => {
    vi.mocked(flushPendingPersistWrites).mockRejectedValue(new Error("disk full"));
    const h = harness(); h.get().simulateRealityYears(3);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().bulkYearsProgress).toBeNull();
    expect(h.get().bulkYearJobs.Resume).toMatchObject({ targetYear: 4, error: "disk full" });
  });
});
