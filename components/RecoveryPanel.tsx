"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createBackup, listBackups, restoreBackup, chooseBackupDestination, importExternalBackup, getBackupError, subscribeBackupError, type Backup } from "@/lib/backups";
import { isDesktop } from "@/lib/desktopStorage";
import { useDraftStore } from "@/store/draftStore";

const secondary = "rounded-sm border border-rift-line px-3 py-2 text-sm text-rift-mutedbright transition-colors hover:border-rift-gold/60 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold disabled:opacity-50";
const date = (value: number) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function RecoveryPanel({ open, onClose, saveUnavailable = false }: {
  open: boolean; onClose: () => void; saveUnavailable?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const restoreTrigger = useRef<string | null>(null);
  const operation = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [copies, setCopies] = useState<Backup[] | null>(null);
  const [selected, setSelected] = useState<Backup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const simulating = useDraftStore(s => s.simulating);
  const backupError = useSyncExternalStore(subscribeBackupError, getBackupError, () => null);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    panel?.showModal();
    let active = true;
    void listBackups().then(value => { if (active) setCopies(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; panel?.close(); previous?.focus(); };
  }, [open]);

  useEffect(() => {
    if (selected) cancel.current?.focus();
    else if (restoreTrigger.current) {
      const button = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("[data-backup-id]") ?? []).find(element => element.dataset.backupId === restoreTrigger.current);
      button?.focus();
    }
  }, [selected]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(label); setError(null); setSuccess(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { operation.current = false; setBusy(null); }
  };
  const cancelRestore = () => { setSelected(null); setError(null);  };
  if (!open) return null;
  const restoring = busy === "Restoring saved data?";

  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), summary, [tabindex='0']")).filter(element => element.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); if (!restoring) { if (selected) cancelRestore(); else onClose(); } }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-sm border border-rift-gold/40 bg-rift-panel p-0 text-rift-mutedbright shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
    <header className="flex items-start justify-between gap-4 border-b border-rift-line px-5 py-5 sm:px-7">
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-[0.25em] text-rift-gold">Saved data</p>
        <h2 id={titleId} className="font-display text-2xl text-rift-goldbright">{selected ? "Restore saved data" : "Backups"}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed">{selected ? "Return all saved data to an earlier point." : "Copies of your saved data, ready when you need them."}</p>
      </div>
      {!selected && <button type="button" autoFocus className={secondary} onClick={onClose}>Close</button>}
    </header>
    <div className="space-y-5 p-5 sm:p-7">
      {selected ? <>
        <div className="border-l-2 border-rift-gold bg-rift-gold/5 p-4">
          <p className="font-medium text-rift-goldbright">{date(selected.createdAt)}</p>
          <p className="mt-2 break-words text-sm">{selected.realities.join(", ") || "Saved drafts, tournaments and seasons"}</p>
        </div>
        <p className="text-sm leading-relaxed">This replaces <strong className="text-rift-goldbright">all current saved data</strong>, including every reality and its history. Progress made after this copy will no longer be active.</p>
        <p className="text-sm leading-relaxed">Your current data will be kept separately before restoring. The app will reload when finished.</p>
        {error && <div role="alert" className="rounded-sm border border-red-400/40 bg-red-400/5 p-3 text-sm text-red-200"><p>Could not restore this copy. You can retry or go back.</p><details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words">{error}</p></details></div>}
        {busy && <p role="status" className="text-sm text-rift-goldbright">{busy} Keep the app open.</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-rift-line pt-5">
          <button ref={cancel} type="button" disabled={restoring} className={secondary} onClick={cancelRestore}>Cancel</button>
          <button type="button" disabled={restoring || !!simulating} className="rounded-sm border border-red-400/60 bg-red-400/10 px-4 py-2 text-sm text-red-200 hover:bg-red-400/20 disabled:opacity-50" onClick={() => void run("Restoring saved data?", () => restoreBackup(selected.id))}>Restore</button>
        </div>
      </> : <>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-rift-line bg-rift-bg/40 p-4" aria-label="Latest backup">
          <div><p className="text-xs text-rift-mutedbright">Latest backup</p><p className="mt-1 text-sm font-medium text-rift-goldbright">{copies === null ? "Checking available copies?" : copies[0] ? date(copies[0].createdAt) : "No backups yet"}</p></div>
          <button type="button" disabled={!!busy || saveUnavailable || copies === null} className="btn-gold rounded-sm px-4 py-2 text-sm disabled:opacity-50" onClick={() => void run("Creating backup?", async () => { await createBackup(); setCopies(await listBackups()); setSuccess("Backup created. Your saved data is ready to restore."); })}>Create backup</button>
        </section>
        {saveUnavailable && <p className="text-sm text-amber-200">Resolve the save error before creating a new copy. You can still restore an earlier backup.</p>}
        {busy && <p role="status" className="text-sm text-rift-goldbright">{busy}</p>}
        {success && <p role="status" className="text-sm text-emerald-200">{success}</p>}
        {(error || backupError) && <div role="alert" className="rounded-sm border border-red-400/40 bg-red-400/5 p-3 text-sm text-red-200">
          <p>{error ? "The backup action could not be completed." : "The last backup attempt failed."} Try again when ready.</p>
          <details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words">{error || backupError}</p></details>
          <button type="button" disabled={!!busy} className={`${secondary} mt-3`} onClick={() => void run("Checking backups?", async () => setCopies(await listBackups()))}>Refresh copies</button>
        </div>}
        <section aria-label="Available backups">
          <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="font-display text-lg text-rift-goldbright">Backup history</h3>{copies && <span className="text-xs">{copies.length} {copies.length === 1 ? "copy" : "copies"}</span>}</div>
          {copies?.length === 0 && <p className="border-y border-dashed border-rift-line py-6 text-sm leading-relaxed">Your backups will appear here. Create one now, or let automatic backups keep copies as you play.</p>}
          {copies && copies.length > 0 && <ul className="divide-y divide-rift-line border-y border-rift-line">{copies.map((copy, index) => <li key={copy.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><time dateTime={new Date(copy.createdAt).toISOString()} className="text-sm text-rift-goldbright">{date(copy.createdAt)}</time>{index === 0 && <span className="rounded-sm bg-rift-gold/10 px-2 py-0.5 text-[10px] text-rift-goldbright">Latest</span>}</div>
              <p className="mt-1 break-words text-xs leading-relaxed">{copy.realities.join(", ") || "Saved drafts, tournaments and seasons"}</p>
              <p className="mt-1 text-xs text-rift-mutedbright">{copy.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(copy.bytes / 1024))} KB` : `${(copy.bytes / 1024 / 1024).toFixed(1)} MB`}</p></div>
            <button type="button" disabled={!!busy || !!simulating} className={`${secondary} shrink-0`} data-backup-id={copy.id} onClick={() => { restoreTrigger.current = copy.id; setError(null); setSelected(copy); }}>Review restore</button>
          </li>)}</ul>}
          {simulating && <p className="mt-3 text-sm text-amber-200">Pause simulation before restoring a backup.</p>}
        </section>
        <details className="border-t border-rift-line pt-4 text-sm">
          <summary className="cursor-pointer text-rift-mutedbright hover:text-rift-goldbright">{isDesktop() ? "Storage & external copies" : "About automatic backups"}</summary>
          <div className="mt-3 space-y-3 text-xs leading-relaxed">
            <p>Automatic backups keep up to 5 recent, 7 daily and 4 weekly copies. The same copy can belong to more than one group.</p>
            <p>{isDesktop() ? "Local copies are stored on this device. Choose a folder on another device for extra protection, or import a copy you kept elsewhere." : "Copies are stored in this browser. Clearing browser data also removes these copies. Export important realities from the Realities screen to keep a separate file."}</p>
            {isDesktop() && <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} className={secondary} onClick={() => void run("Choosing backup folder?", chooseBackupDestination)}>Choose external folder</button><button type="button" disabled={!!busy} className={secondary} onClick={() => void run("Importing backup?", async () => { await importExternalBackup(); setCopies(await listBackups()); })}>Import backup file</button></div>}
          </div>
        </details>
      </>}
    </div>
  </dialog>, document.body);
}
