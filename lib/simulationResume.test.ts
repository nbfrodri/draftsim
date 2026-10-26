import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./desktopStorage", () => ({ flushPendingPersistWrites: vi.fn().mockResolvedValue(undefined) }));
const holdRelease = vi.fn();
vi.mock("./desktopSqliteStorage", () => ({ holdDebouncedSqliteWrites: vi.fn(() => holdRelease) }));
import { flushPendingPersistWrites } from "./desktopStorage";
import { holdDebouncedSqliteWrites } from "./desktopSqliteStorage";
import { getBulkBreadcrumbContext, setBreadcrumbInvokeForTests } from "./bulkBreadcrumbs";
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
beforeEach(() => { reportPersistenceError(null, "simulation"); vi.mocked(flushPendingPersistWrites).mockReset().mockResolvedValue(undefined); holdRelease.mockClear(); vi.mocked(holdDebouncedSqliteWrites).mockClear(); });
afterEach(() => { setBreadcrumbInvokeForTests(null); vi.unstubAllGlobals(); });
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

describe("bulk simulation diagnostics", () => {
  function recordSteps() {
    const steps: string[] = [];
    setBreadcrumbInvokeForTests(async (_command, args) => {
      const crumb = (args as { breadcrumb: { stage: string; year?: number } }).breadcrumb;
      steps.push(`${crumb.stage}:${crumb.year}`);
    });
    vi.mocked(flushPendingPersistWrites).mockImplementation(async () => { steps.push("flush"); });
    return steps;
  }

  it("writes each breadcrumb before its heavy step and ends idle", async () => {
    const steps = recordSteps();
    const h = harness(); h.get().simulateRealityYears(1);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    await vi.waitFor(() => expect(steps.at(-1)).toBe("idle:2"));
    expect(steps).toEqual([
      "start:1", "season-sim:1", "offseason:1", "archive:1", "publish:1", "save:2", "flush", "year-done:2", "flush", "idle:2",
    ]);
    expect(getBulkBreadcrumbContext()).toBeNull();
  });

  it("holds debounced saves for the whole run and releases them before the final flush", async () => {
    recordSteps();
    const h = harness(); h.get().simulateRealityYears(1);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(holdDebouncedSqliteWrites).toHaveBeenCalledTimes(1);
    expect(holdRelease).toHaveBeenCalledTimes(1);
    expect(holdRelease.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(flushPendingPersistWrites).mock.invocationCallOrder.at(-1)!);
  });

  it("stops before the next year with a recoverable message when memory is nearly exhausted", async () => {
    const steps = recordSteps();
    vi.stubGlobal("performance", { now: () => 0, memory: { usedJSHeapSize: 3_900, totalJSHeapSize: 3_950, jsHeapSizeLimit: 4_000 } });
    const h = harness(); h.get().simulateRealityYears(2);
    await vi.waitFor(() => expect(h.get().simulating).toBeNull());
    expect(h.get().season?.franchise?.year).toBe(1);
    expect(h.get().bulkYearJobs.Resume).toMatchObject({ targetYear: 3, error: expect.stringMatching(/memory limit/) });
    expect(steps).toContain("guard-stop:1");
    expect(steps).not.toContain("season-sim:1");
  });
});
