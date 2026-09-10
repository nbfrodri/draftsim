import { markRealityHistoryLoaded,upsertRealityInDb } from "@/lib/desktopSqlite";
import { isDesktop } from "@/lib/desktopStorage";
import { seedFranchise } from "@/lib/season/franchise";
import type { DraftStore,StoreGet,StoreSet } from "../types";
type Helpers = { rollFranchiseToNextYearState: typeof import("../draftStore").rollFranchiseToNextYearState };
export function createFranchiseActions(get: StoreGet, set: StoreSet, helpers: Helpers): Pick<DraftStore, "beginNewReality" | "startReality" | "continueSeasonToNextYear"> {
const { rollFranchiseToNextYearState } = helpers;
return {
beginNewReality: (name, aging) => {
    set({ pendingReality: { name: name.trim() || "My Reality", aging } });
  },
startReality: (name, aging) => {
    const { season, champions } = get();
    if (!season) return;
    const seeded = seedFranchise(season, name, aging, Math.random, champions);
    const id = seeded.franchise!.id;
    set((s) => ({
      season: seeded,
      seasonViewOpen: true,
      activeRealityId: id,
      realities: [
        ...s.realities.filter((r) => r.id !== id),
        { id, name: seeded.franchise!.name, year: 1, season: seeded, history: [] },
      ],
    }));
    if (isDesktop()) {
      markRealityHistoryLoaded(id);
      void upsertRealityInDb(
        {
          id,
          name: seeded.franchise!.name,
          year: 1,
          season: seeded,
          history: [],
        },
        { syncHistory: true },
      ).catch((err) => console.warn("[draftsim] create reality DB sync failed:", err));
    }
  },
continueSeasonToNextYear: () => {
    const { season, champions } = get();
    if (!season || !season.franchise || season.status !== "complete") return;
    const rid = season.franchise.id;
    const prevHistory = get().realities.find((r) => r.id === rid)?.history ?? [];
    const { season: next, history } = rollFranchiseToNextYearState(
      season,
      champions,
      prevHistory,
    );
    set((s) => ({
      season: next,
      realities: s.realities.map((r) =>
        r.id === next.franchise!.id
          ? { ...r, year: next.franchise!.year, season: next, history }
          : r,
      ),
    }));
  }
};
}
