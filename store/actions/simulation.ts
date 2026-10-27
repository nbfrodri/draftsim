import { bulkMemoryGuardMessage, readJsHeap, recordBulkBreadcrumb, setBulkBreadcrumbContext, type BulkStage } from "@/lib/bulkBreadcrumbs";
import { holdDebouncedSqliteWrites } from "@/lib/desktopSqliteStorage";
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
type Helpers = { resetSimResultsBatch: typeof import("../draftStore").resetSimResultsBatch; runFranchiseSeasonSim: typeof import("../draftStore").runFranchiseSeasonSim; appendSimResults: typeof import("../draftStore").appendSimResults; attachSimYearEventSummary: typeof import("../draftStore").attachSimYearEventSummary; autoResolveOffseasonShop: typeof import("../draftStore").autoResolveOffseasonShop; rollFranchiseToNextYearState: typeof import("../draftStore").rollFranchiseToNextYearState; applyMetaSnapshotPatch: typeof import("../draftStore").applyMetaSnapshotPatch; flushSimResultsFeed: typeof import("../draftStore").flushSimResultsFeed };
export function createSimulationActions(get: StoreGet, set: StoreSet, helpers: Helpers): Pick<DraftStore, "cancelBulkYears" | "resumeBulkYears" | "simulateRealityYears"> {
const { resetSimResultsBatch, runFranchiseSeasonSim, appendSimResults, attachSimYearEventSummary, autoResolveOffseasonShop, rollFranchiseToNextYearState, applyMetaSnapshotPatch, flushSimResultsFeed } = helpers;
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
      let completed = 0;
      let memoryStopped = false;
      // Awaited before each heavy step so a renderer crash leaves the year and stage on disk.
      const crumb = (stage: BulkStage) => {
        const year = get().season?.franchise?.year ?? startYear;
        setBulkBreadcrumbContext({ realityId, year });
        return recordBulkBreadcrumb({ stage, realityId, year, completed, total });
      };
      // Mid-year snapshots of the live season are the largest saves; checkpoints flush below.
      const releaseDebounce = holdDebouncedSqliteWrites();
      try {
        await crumb("start");
        await new Promise((r) => setTimeout(r, 0));
        const shouldCancel = () => get().bulkYearsCancelRequested;

        while (completed < total) {
          if (shouldCancel()) break;
          const cur = get().season;
          if (!bulkSimRealityMatches(cur, realityId)) break;
          const guard = bulkMemoryGuardMessage(readJsHeap(), cur.franchise!.year);
          if (guard) {
            memoryStopped = true;
            await crumb("guard-stop");
            set(s => ({ bulkYearJobs: { ...s.bulkYearJobs, [realityId]: { targetYear: startYear + total, startedAt, error: guard } } }));
            break;
          }

          if (cur.status !== "complete") {
            await crumb("season-sim");
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

          await crumb("offseason");
          set({ season: autoResolveOffseasonShop(finished, get().champions) });
          // Yield so the completed year can paint and a queued cancel can run before synchronous archival.
          await new Promise((r) => setTimeout(r, 0));
          if (shouldCancel() || !bulkSimRealityMatches(get().season, realityId)) break;

          await crumb("archive");
          const rid = finished.franchise.id;
          const prevHistory =
            get().realities.find((r) => r.id === rid)?.history ?? [];
          const { season: next, history } = rollFranchiseToNextYearState(
            get().season!,
            get().champions,
            prevHistory,
          );
          const archived = history.find((e) => e.id === finished.id);
          if (archived) attachSimYearEventSummary(set, archived);
          await crumb("publish");
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

          // Season and history were published together; yield once, then always flush
          // that checkpoint, even if a cancel arrives during the yield.
          await new Promise((r) => setTimeout(r, 0));
          await crumb("save");
          await flushPendingPersistWrites();

          await crumb("year-done");
          await new Promise((r) => setTimeout(r, 0));
        }

        // One whole-reality JSON string costs >1 GB of heap on a long reality, so export
        // once at the end (also after a cancel), never per year and never while memory is short.
        if (exportTarget && completed > 0 && !memoryStopped && !bulkMemoryGuardMessage(readJsHeap(), get().season?.franchise?.year ?? startYear)) {
          await crumb("export");
          // The years are already saved; an export problem must not read as a failed simulation.
          let exportError: string | null = null;
          try {
            const parts = await get().exportRealityStream(realityId);
            const written = parts ? await writeRealityExportToTarget(exportTarget, parts) : { ok: false, error: "the reality could not be read" };
            if (!written.ok) exportError = written.error ?? "unknown error";
          } catch (error) { exportError = error instanceof Error ? error.message : String(error); }
          if (exportError) {
            const message = `Simulation saved, but the export file could not be written: ${exportError}`;
            set(s => ({ bulkYearJobs: { ...s.bulkYearJobs, [realityId]: { targetYear: startYear + total, startedAt, error: message } } }));
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set(s => ({ bulkYearJobs: { ...s.bulkYearJobs, [realityId]: { targetYear: startYear + total, startedAt, error: message } } }));

      } finally {
        flushSimResultsFeed(set);
        const fr = get().season?.franchise;
        // A finished run keeps its job only to show an export failure until dismissed.
        if (fr?.id === realityId && fr.year >= startYear + total && !get().bulkYearJobs[realityId]?.error) {
          const jobs = { ...get().bulkYearJobs }; delete jobs[realityId]; set({ bulkYearJobs: jobs });
        }
        releaseDebounce();
        // Stay busy until the last save lands, or a new run could start on top of it.
        try { await flushPendingPersistWrites(); }
        catch (error) { reportPersistenceError(`Simulation paused but saving failed: ${String(error)}`, "simulation"); }
        set({ simulating: null, simProgress: null, simStartedAt: null, bulkYearsProgress: null, bulkYearsCancelRequested: false });
        await crumb("idle");
        setBulkBreadcrumbContext(null);
      }
    })();
  }
};
}
