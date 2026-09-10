import { flushPendingPersistWrites } from "@/lib/desktopStorage";
import { getPersistenceError, reportPersistenceError } from "@/lib/persistenceStatus";
import {
writeRealityExportToTarget
} from "@/lib/realityExport";
import { bulkSimRealityMatches,clampBulkYearCount } from "@/lib/season/bulkYears";
import {
type SimResultEntryCache
} from "@/lib/season/simResultsSummary";
import type { DraftStore,StoreGet,StoreSet } from "../types";
type Helpers = { resetSimResultsBatch: typeof import("../draftStore").resetSimResultsBatch; runFranchiseSeasonSim: typeof import("../draftStore").runFranchiseSeasonSim; appendSimResults: typeof import("../draftStore").appendSimResults; autoResolveOffseasonShop: typeof import("../draftStore").autoResolveOffseasonShop; rollFranchiseToNextYearState: typeof import("../draftStore").rollFranchiseToNextYearState; applyMetaSnapshotPatch: typeof import("../draftStore").applyMetaSnapshotPatch; flushSimResultsFeed: typeof import("../draftStore").flushSimResultsFeed };
export function createSimulationActions(get: StoreGet, set: StoreSet, helpers: Helpers): Pick<DraftStore, "cancelBulkYears" | "resumeBulkYears" | "simulateRealityYears"> {
const { resetSimResultsBatch, runFranchiseSeasonSim, appendSimResults, autoResolveOffseasonShop, rollFranchiseToNextYearState, applyMetaSnapshotPatch, flushSimResultsFeed } = helpers;
return {
cancelBulkYears: () => {
    if (get().simulating || get().bulkYearsProgress) set({ bulkYearsCancelRequested: true });
  },
resumeBulkYears: () => {
    const state = get(), fr = state.season?.franchise;
    const job = fr && state.bulkYearJobs[fr.id];
    if (!fr || !job || !Number.isSafeInteger(job.targetYear) || job.targetYear <= fr.year) return;
    state.simulateRealityYears(job.targetYear - fr.year, { saveAfterEachYear: true });
  },
simulateRealityYears: (count, options) => {
    const { season, simulating, bulkYearsProgress } = get();
    if (!season?.franchise || simulating || bulkYearsProgress || getPersistenceError()) return;
    const total = clampBulkYearCount(count);

    const exportTarget = options?.exportTarget;
    const realityId = season.franchise.id;
    const startYear = season.franchise.year;
    const startedAt = Date.now();
    resetSimResultsBatch();
    reportPersistenceError(null, "simulation");
    set({
      bulkYearJobs: { ...get().bulkYearJobs, [realityId]: { targetYear: startYear + total, startedAt, error: null } },
      simulating: "all",
      simProgress: null,
      simStartedAt: startedAt,
      simResultsFeed: [],
      bulkYearsProgress: { completed: 0, total, year: startYear, startedAt },
      bulkYearsCancelRequested: false,
    });
    void (async () => {
      const seen = new Set<string>();
      const entryCache: SimResultEntryCache = new Map();
      try {
        await new Promise((r) => setTimeout(r, 0));
        const shouldCancel = () => get().bulkYearsCancelRequested;
        let completed = 0;

        while (completed < total) {
          if (shouldCancel()) break;
          const cur = get().season;
          if (!bulkSimRealityMatches(cur, realityId)) break;

          if (cur.status !== "complete") {
            const ok = await runFranchiseSeasonSim(
              get,
              set,
              realityId,
              shouldCancel,
              seen,
              entryCache,
            );
            if (!ok || shouldCancel()) break;
          }

          const finished = get().season;
          if (!finished?.franchise || finished.status !== "complete") break;
          appendSimResults(set, finished, seen, entryCache);
          entryCache.clear();

          set({ season: autoResolveOffseasonShop(finished, get().champions) });
          if (shouldCancel()) break;

          const rid = finished.franchise.id;
          const prevHistory =
            get().realities.find((r) => r.id === rid)?.history ?? [];
          const { season: next, history } = rollFranchiseToNextYearState(
            get().season!,
            get().champions,
            prevHistory,
          );
          completed++;
          set((s) => ({
            season: next,
            playerForms: {},
            bulkYearsProgress: {
              completed,
              total,
              year: next.franchise!.year,
              startedAt: s.bulkYearsProgress?.startedAt ?? startedAt,
            },
            realities: s.realities.map((r) =>
              r.id === next.franchise!.id
                ? { ...r, year: next.franchise!.year, season: next, history }
                : r,
            ),
            ...(next.currentMeta
              ? applyMetaSnapshotPatch(
                  {
                    metaOverride: next.currentMeta.metaOverride,
                    metaSource: next.currentMeta.metaOverride ? "custom" : "default",
                    metaEnabled: next.currentMeta.metaEnabled,
                    synergyOverride: next.currentMeta.synergyOverride,
                    counterOverride: next.currentMeta.counterOverride,
                  },
                  s,
                )
              : {}),
          }));

          await flushPendingPersistWrites();

          if (exportTarget) {
            const json = await get().exportReality(realityId);
            if (json) {
              await writeRealityExportToTarget(exportTarget, json);
            }
          }

          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set(s => ({ bulkYearJobs: { ...s.bulkYearJobs, [realityId]: { targetYear: startYear + total, startedAt, error: message } } }));

      } finally {
        flushSimResultsFeed(set);
        const fr = get().season?.franchise;
        if (fr?.id === realityId && fr.year >= startYear + total) {
          const jobs = { ...get().bulkYearJobs }; delete jobs[realityId]; set({ bulkYearJobs: jobs });
        }
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsProgress: null, bulkYearsCancelRequested: false });
        try { await flushPendingPersistWrites(); }
        catch (error) { reportPersistenceError(`Simulation paused but saving failed: ${String(error)}`, "simulation"); }
      }
    })();
  }
};
}
