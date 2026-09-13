"use client";

import { flushPendingPersistWrites } from "@/lib/desktopStorage";
import { getPersistenceSnapshot, getServerPersistenceSnapshot, subscribePersistenceStatus, getPersistenceError, getPersistenceLoadBlocked, getServerPersistenceError, subscribePersistenceError } from "@/lib/persistenceStatus";
import { useDraftStore } from "@/store/draftStore";
import { IconArchive, IconPlayerPause, IconAlertTriangle } from "@tabler/icons-react";
import RecoveryPanel from "./RecoveryPanel";
import { startAutomaticBackups } from "@/lib/backups";
import { useEffect, useState, useSyncExternalStore } from "react";

export default function PersistenceNotice() {
  const simulating = useDraftStore(s => s.simulating);
  const pause = useDraftStore(s => s.cancelBulkYears);
  const pauseRequested = useDraftStore(s => s.bulkYearsCancelRequested);
  useEffect(startAutomaticBackups, []);
  const error = useSyncExternalStore(subscribePersistenceError, getPersistenceError, getServerPersistenceError);
  const status = useSyncExternalStore(subscribePersistenceStatus, getPersistenceSnapshot, getServerPersistenceSnapshot);
  const [retrying, setRetrying] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const loadBlocked = getPersistenceLoadBlocked();
  const retry = async () => {
    setRetrying(true);
    try {
      if (loadBlocked) await useDraftStore.persist.rehydrate();
      else await flushPendingPersistWrites();
    } catch { /* Persistence status retains the actionable error. */ }
    finally { setRetrying(false); }
  };
  const savedLabel = status.phase === "idle" ? "Autosave ready" : status.phase === "saved" ? "All changes saved" : status.phase === "pending" ? "Changes pending" : "Saving...";

  return <>
    {error ? <aside className={loadBlocked ? "fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-rift-bg p-5" : "fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl border border-rift-gold/40 bg-rift-paneldark p-5 shadow-2xl"}>
      <div className={loadBlocked ? "w-full max-w-lg border border-rift-gold/40 bg-gradient-to-br from-rift-panel to-rift-paneldark p-6 shadow-2xl sm:p-8" : ""}>
        <div role="alert">
          <p className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-rift-gold"><IconAlertTriangle aria-hidden="true" size={15} />{loadBlocked ? "Saved data unavailable" : "Autosave needs attention"}</p>
          <h2 className="font-display text-xl tracking-[0.06em] text-rift-goldbright">{loadBlocked ? "We couldn't open your saved data" : "Your latest changes haven't been saved"}</h2>
          <p className="mt-3 text-sm leading-relaxed text-rift-mutedbright">{loadBlocked ? "Try loading again. If the problem continues, you can restore an earlier backup. Your existing data has been left in place." : "Keep the app open and retry saving. You can also review your available backups."}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={retrying} className="btn-gold min-h-10 border px-4 py-2 font-display text-[10px] uppercase tracking-[0.15em] disabled:opacity-50" onClick={() => void retry()}>{retrying ? "Retrying..." : loadBlocked ? "Retry loading saved data" : "Retry save"}</button>
          <button type="button" className="min-h-10 border border-rift-line px-4 py-2 font-display text-[10px] uppercase tracking-[0.15em] text-rift-mutedbright transition-colors hover:border-rift-gold/60 hover:text-rift-goldbright" onClick={() => setBackupsOpen(true)}>Open backups</button>
        </div>
        <details className="mt-4 text-xs text-rift-mutedbright"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words leading-relaxed">{error}</p></details>
      </div>
    </aside> : <aside aria-label="Save status" className="fixed bottom-2 left-2 z-[60] flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 border border-rift-gold/20 bg-rift-paneldark/95 px-3 py-1.5 text-[10px] text-rift-mutedbright shadow-lg backdrop-blur-sm sm:bottom-3 sm:left-3">
      <span role="status" aria-live="polite" title={status.confirmedAt ? `Last saved ${new Date(status.confirmedAt).toLocaleTimeString()}` : undefined} className="flex items-center gap-2"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.phase === "saved" ? "bg-rift-blue" : "bg-rift-gold"}`} />{savedLabel}</span>
      <button type="button" className="inline-flex min-h-8 items-center gap-1.5 border-l border-rift-gold/20 py-1 pl-3 font-display text-[9px] uppercase tracking-[0.16em] text-rift-gold transition-colors hover:text-rift-goldbright" onClick={() => setBackupsOpen(true)}><IconArchive aria-hidden="true" size={13} stroke={1.5} />Backups</button>
      {simulating && <button type="button" disabled={pauseRequested} className="inline-flex min-h-8 items-center gap-1.5 border-l border-rift-gold/20 py-1 pl-3 text-rift-goldbright disabled:opacity-50" onClick={pause}><IconPlayerPause aria-hidden="true" size={13} />{pauseRequested ? "Pausing after current match..." : "Pause simulation"}</button>}
    </aside>}
    {backupsOpen && <RecoveryPanel open onClose={() => setBackupsOpen(false)} saveUnavailable={!!error} />}
  </>;
}
