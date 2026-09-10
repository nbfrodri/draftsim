import { backupBeforeDestructiveChange } from "@/lib/backups";
import {
setActiveCounterOverride,
setActiveMetaOverride,
setActiveSynergyOverride,
setMetaEnabled
} from "@/lib/championMeta";
import { markRealityHistoryLoaded,upsertRealityInDb } from "@/lib/desktopSqlite";
import { clearDesktopOperation,flushPendingPersistWrites,isDesktop,signalImportingReality,waitForDesktopOverlayPaint } from "@/lib/desktopStorage";
import { parseRealityImport,parseSeasonImport } from "@/lib/importPreview";
import {
saveCounterOverride,
saveMetaEnabled,
saveMetaOverride,
saveMetaSource,
saveSynergyOverride
} from "@/lib/metaRandomizer";
import { decodeRealityShareCode } from "@/lib/realityShare";
import {
decodeCompactTournament
} from "@/lib/recapCompression";
import {
type SeasonHistoryEntry
} from "@/lib/season/history";
import type {
SeasonState
} from "@/lib/season/types";
import {
decodeTournament
} from "@/lib/tournament";
import type {
SeriesState
} from "@/lib/types";
import type { DraftStore,MetaSource,SavedReality,SavedSeasonEntry,StoreGet,StoreSet } from "../types";
type Helpers = { ensureSeasonIdentities: typeof import("../draftStore").ensureSeasonIdentities; applyMetaSnapshotPatch: typeof import("../draftStore").applyMetaSnapshotPatch; savedSeasonsCap: typeof import("../draftStore").savedSeasonsCap; seasonHistoryCap: typeof import("../draftStore").seasonHistoryCap; ACTION_SECONDS: typeof import("../draftStore").ACTION_SECONDS };
export function createImportsActions(get: StoreGet, set: StoreSet, helpers: Helpers): Pick<DraftStore, "importReality" | "importRealityShareCode" | "importSeason" | "importSeasonHistory" | "importTournament"> {
const { ensureSeasonIdentities, applyMetaSnapshotPatch, savedSeasonsCap, seasonHistoryCap, ACTION_SECONDS } = helpers;
return {
importReality: async (json) => {
    if (get().simulating) return { ok: false, error: "Pause simulation before importing." };
    const desktop = isDesktop();
    // Overlay covers parse + (on desktop) JSON→SQLite. Close is blocked while
    // the phase is active so a mid-import quit can't drop the write.
    signalImportingReality();
    await waitForDesktopOverlayPaint();
    try {
      let r: SavedReality;
      try { r = parseRealityImport(json); }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Invalid reality export." }; }
      const rs = r.season;
      const id = r.id;
      if (get().realities.some(slot => slot.id === id)) {
        try { await backupBeforeDestructiveChange(); }
        catch (error) { return { ok: false, error: `Preventive backup failed: ${String(error)}` }; }
      }
      // Decode the compact tournaments back to full form, mirroring loadSavedSeason.
      const decoded = ensureSeasonIdentities({
        ...(rs as SeasonState),
        tournaments: Object.fromEntries(
          Object.entries((rs as SeasonState).tournaments).map(([tid, t]) => [
            tid,
            decodeCompactTournament(t),
          ]),
        ),
      });
      // Keep the franchise id pinned to the slot id (switchReality / archive
      // routing key off season.franchise.id).
      const season: SeasonState = decoded.franchise
        ? { ...decoded, franchise: { ...decoded.franchise, id, name: r.name } }
        : decoded;
      const slot: SavedReality = {
        id,
        name: r.name,
        year: typeof r.year === "number" ? r.year : (season.franchise?.year ?? 1),
        season,
        history: Array.isArray(r.history) ? (r.history as SeasonHistoryEntry[]) : [],
      };
      set((st) => ({
        realities: [slot, ...st.realities.filter((x) => x.id !== id)],
        ...(st.activeRealityId === id ? {
          season: slot.season,
          seasonHistory: slot.history,
          series: null,
          tournament: null,
          seasonViewOpen: true,
          playerForms: {},
          simulating: null,
          simProgress: null,
          selectedChampionId: null,
          secondsLeft: null,
          aiRationale: null,
          ...applyMetaSnapshotPatch({
            metaOverride: slot.season.currentMeta.metaOverride,
            metaSource: slot.season.currentMeta.metaOverride ? "custom" : "default",
            metaEnabled: slot.season.currentMeta.metaEnabled,
            synergyOverride: slot.season.currentMeta.synergyOverride,
            counterOverride: slot.season.currentMeta.counterOverride,
          }, st),
        } : {}),
      }));
      if (desktop) {
        markRealityHistoryLoaded(id);
        try {
          await upsertRealityInDb(slot, { syncHistory: true });
          await flushPendingPersistWrites();
        } catch (err) {
          console.warn("[draftsim] importReality DB sync failed:", err);
          return {
            ok: false,
            error:
              "Reality loaded in memory but failed to save to the database. Keep the app open and try again.",
          };
        }
      }
      return { ok: true, id };
    } finally {
      clearDesktopOperation();
    }
  },
importRealityShareCode: async (code) => {
    const decoded = await decodeRealityShareCode(code);
    if (!decoded.json) return { ok: false, error: decoded.error ?? "Invalid code" };
    return get().importReality(decoded.json);
  },
importSeason: (json) => {
    let entry: SavedSeasonEntry;
    try { entry = parseSeasonImport(json); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Invalid season export." }; }
    const safe: SavedSeasonEntry = {
      ...(entry as SavedSeasonEntry),
      savedAt:
        typeof entry.savedAt === "number" ? entry.savedAt : Date.now(),
      playerForms: entry.playerForms ?? {},
    };
    set((st) => ({
      savedSeasons: [
        safe,
        ...st.savedSeasons.filter((e) => e.id !== safe.id),
      ].slice(0, savedSeasonsCap()),
    }));
    return { ok: true, id: safe.id };
  },
importSeasonHistory: (entries) => {
    // Dedupe the incoming batch by id (last occurrence wins), then
    // upsert into the existing archive and re-sort the timeline.
    const incoming = [...new Map(entries.map((e) => [e.id, e])).values()];
    const existingIds = new Set(get().seasonHistory.map((e) => e.id));
    const added = incoming.filter((e) => !existingIds.has(e.id)).length;
    const updated = incoming.length - added;
    set((s) => {
      const byId = new Map(incoming.map((e) => [e.id, e]));
      const merged = [
        ...s.seasonHistory.map((e) => byId.get(e.id) ?? e),
        ...incoming.filter((e) => !existingIds.has(e.id)),
      ]
        .sort((a, b) => b.archivedAt - a.archivedAt)
        .slice(0, seasonHistoryCap());
      return { seasonHistory: merged };
    });
    return { added, updated };
  },
importTournament: async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Empty code" };
    try {
      const { tournament, error } = await decodeTournament(trimmed);
      if (!tournament) {
        return { ok: false, error: error ?? "Invalid tournament code" };
      }
      // Mid-tournament resume: if the snapshot has an active match
      // with a saved series, restore that series to state.series so
      // DraftApp routes the user straight back into where they left
      // off. Status === "complete" snapshots leave activeMatchId null.
      let resumedSeries: SeriesState | null = null;
      if (tournament.activeMatchId) {
        const activeMatch = tournament.matches.find(
          (m) => m.id === tournament.activeMatchId,
        );
        if (activeMatch?.series) {
          resumedSeries = activeMatch.series;
        }
      }
      // Restore the meta snapshot so the AI sees the same tier list
      // and pairings the original tournament was played on. Falls back
      // gracefully when the snapshot isn't present (legacy codes).
      const snap = tournament.metaSnapshot;
      // Apply meta side-effects (the imperative singletons) to mirror
      // the loaded snapshot. AI scoring reads from these, not the store.
      if (snap !== undefined) {
        setActiveMetaOverride(snap.metaOverride ?? null);
        setMetaEnabled(snap.metaEnabled);
        saveMetaOverride(snap.metaOverride ?? null);
        saveMetaSource(snap.metaOverride ? "custom" : "default");
        saveMetaEnabled(snap.metaEnabled);
        // Pairings are optional in the snapshot — only restore if the
        // loaded tournament actually carried them. Calling setActive*
        // with null when the user hadn't randomized would otherwise
        // wipe their currently-active pairings.
        if (snap.synergyOverride !== undefined) {
          setActiveSynergyOverride(snap.synergyOverride ?? null);
          saveSynergyOverride(snap.synergyOverride ?? null);
        }
        if (snap.counterOverride !== undefined) {
          setActiveCounterOverride(snap.counterOverride ?? null);
          saveCounterOverride(snap.counterOverride ?? null);
        }
      }
      set((state) => ({
        tournament,
        series: resumedSeries,
        selectedChampionId: null,
        secondsLeft:
          resumedSeries && resumedSeries.timerEnabled ? ACTION_SECONDS : null,
        aiRationale: null,
        aiRationaleHistory: [],
        ...(snap !== undefined
          ? {
              metaOverride: snap.metaOverride ?? null,
              metaSource: (snap.metaOverride
                ? "custom"
                : "default") as MetaSource,
              metaEnabled: snap.metaEnabled,
              // Use the updater form's `state` so the bump is on the
              // most-current store value, not a pre-await read.
              metaVersion: state.metaVersion + 1,
              ...(snap.synergyOverride !== undefined
                ? {
                    synergyOverride: snap.synergyOverride ?? null,
                    synergyVersion: state.synergyVersion + 1,
                  }
                : {}),
              ...(snap.counterOverride !== undefined
                ? {
                    counterOverride: snap.counterOverride ?? null,
                    counterVersion: state.counterVersion + 1,
                  }
                : {}),
            }
          : {}),
      }));
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid tournament code";
      return { ok: false, error: message };
    }
  }
};
}
