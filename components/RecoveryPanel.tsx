"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconArchive, IconCheck, IconHistory, IconPlus, IconShieldCheck, IconX } from "@tabler/icons-react";
import { createManualBackup, listBackups, restoreBackup, chooseBackupDestination, importExternalBackup, getBackupError, subscribeBackupError, type Backup } from "@/lib/backups";
import { isDesktop } from "@/lib/desktopStorage";
import { useDraftStore } from "@/store/draftStore";

const primary = "btn-gold inline-flex min-h-10 items-center justify-center gap-2 border px-4 py-2.5 font-display text-[10px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 border border-rift-line px-3 py-2 font-display text-[10px] uppercase tracking-[0.16em] text-rift-mutedbright transition-colors hover:border-rift-gold/60 hover:bg-rift-gold/5 hover:text-rift-goldbright focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold disabled:cursor-not-allowed disabled:opacity-50";
const date = (value: number) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function RecoveryPanel({ open, onClose, saveUnavailable = false }: {
  open: boolean; onClose: () => void; saveUnavailable?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const restoreTrigger = useRef<string | null>(null);
  const operation = useRef(false);
  const outsidePress = useRef(false);
  const titleId = useId();
  const nameId = useId();
  const [backupName, setBackupName] = useState("");
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
    void listBackups().then(value => { if (active) { setCopies(value); setError(null); } })
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
  const cancelRestore = () => { if (!operation.current) { setSelected(null); setError(null); } };
  if (!open) return null;
  const restoring = busy === "Restoring saved data...";

  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onPointerDown={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      outsidePress.current = event.button === 0 && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
    }}
    onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (event.target === event.currentTarget && outsidePress.current && outside && !operation.current) onClose();
      outsidePress.current = false;
    }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary, [tabindex='0']")).filter(element => element.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); if (!operation.current) { if (selected) cancelRestore(); else onClose(); } }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border border-rift-gold/50 bg-rift-paneldark p-0 text-rift-mutedbright shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop:bg-black/75 backdrop:backdrop-blur-sm">
    <header className="relative flex items-start justify-between gap-3 border-b border-rift-gold/20 bg-gradient-to-br from-rift-gold/[0.08] via-rift-panel to-rift-paneldark px-5 py-6 sm:px-7">
      <div className="flex min-w-0 items-start gap-4">
        <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center border border-rift-gold/30 bg-rift-bg/50 text-rift-gold sm:flex"><IconArchive size={22} stroke={1.4} /></span>
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.3em] text-rift-gold">Saved data</p>
          <h2 id={titleId} className="font-display text-xl tracking-[0.12em] text-rift-goldbright sm:text-2xl">{selected ? "Restore saved data" : "Backups"}</h2>
          <p id={descriptionId} className="mt-2 max-w-sm text-xs leading-relaxed">{selected ? "Return all saved data to an earlier point." : "Keep your realities and their history within reach."}</p>
        </div>
      </div>
      {!selected && <button type="button" autoFocus disabled={!!busy} aria-label="Close" className={`${secondary} shrink-0 !px-2.5`} onClick={onClose}><IconX aria-hidden="true" size={16} stroke={1.5} /></button>}
    </header>
    <div className="space-y-5 p-5 sm:p-7">
      {selected ? <>
        <div className="border border-rift-gold/25 border-l-2 border-l-rift-gold bg-rift-gold/5 p-4">
          {selected.name && <p className="mb-1 break-words font-display text-lg text-rift-goldbright">{selected.name}</p>}
          <p className="font-medium text-rift-goldbright">{date(selected.createdAt)}</p>
          <p className="mt-2 break-words text-sm">{selected.realities.join(", ") || "Saved drafts, tournaments and seasons"}</p>
        </div>
        <p className="text-sm leading-relaxed">The backup is fully checked before restoring. This replaces <strong className="text-rift-goldbright">all current saved data</strong>, including every reality and its history. Progress made after this copy will no longer be active.</p>
        <p className="text-sm leading-relaxed">Your current data will be kept separately before restoring. After a successful restore, only the latest pre-restore safety copy is kept. The app will reload when finished.</p>
        {error && <div role="alert" className="border border-rift-red/30 bg-rift-red/5 p-4 text-xs leading-relaxed text-rift-redbright"><p>Could not restore this copy. You can retry or go back.</p><details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words">{error}</p></details></div>}
        {busy && <p role="status" className="text-sm text-rift-goldbright">{busy} Keep the app open.</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-rift-line pt-5">
          <button ref={cancel} type="button" disabled={restoring} className={secondary} onClick={cancelRestore}>Cancel</button>
          <button type="button" disabled={restoring || !!simulating} className="min-h-10 border border-rift-red bg-gradient-to-b from-rift-red to-rift-reddeep px-5 py-2 font-display text-[10px] uppercase tracking-[0.18em] text-white hover:brightness-110 disabled:opacity-50" onClick={() => void run("Restoring saved data...", () => restoreBackup(selected.id))}>Restore</button>
        </div>
      </> : <>
        <section className="relative overflow-hidden border border-rift-gold/25 bg-gradient-to-br from-rift-gold/[0.07] to-rift-bg/40 p-4 sm:p-5" aria-label="Latest backup">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rift-gold/60 to-transparent" />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-rift-gold">Latest backup</p>
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-rift-mutedbright"><IconShieldCheck aria-hidden="true" size={13} />{saveUnavailable ? "Automatic copies paused" : backupError ? "Last copy failed" : "Automatic copies enabled"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words font-display text-base text-rift-goldbright">{copies === null ? (error ? "Backup history unavailable" : "Loading backup history...") : copies[0] ? copies[0].name || date(copies[0].createdAt) : "No backups yet"}</p>
              <p className="mt-1.5 text-xs leading-relaxed">{copies?.[0] ? copies[0].name ? date(copies[0].createdAt) : "A restore point for all your saved data." : "Create your first restore point when you are ready."}</p>
            </div>

          </div>
          <form className="mt-4 border-t border-rift-gold/15 pt-4" onSubmit={event => {
            event.preventDefault();
            if (busy || saveUnavailable || copies === null) return;
            void run("Creating backup...", async () => {
              await createManualBackup(backupName);
              setCopies(await listBackups()); setBackupName("");
              setSuccess("Backup created. Your saved data is ready to restore.");
            });
          }}>
            <label htmlFor={nameId} className="text-[10px] uppercase tracking-[0.15em] text-rift-goldbright">Backup name <span className="normal-case tracking-normal text-rift-mutedbright">(optional)</span></label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input id={nameId} value={backupName} onChange={event => setBackupName(event.target.value)} maxLength={80} disabled={!!busy || saveUnavailable} placeholder="e.g. Before the playoffs" autoComplete="off" className="min-h-10 min-w-0 flex-1 border border-rift-line bg-rift-bg/60 px-3 py-2 text-sm text-rift-goldbright placeholder:text-rift-muted focus:border-rift-gold/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/60 disabled:opacity-50" />
              <button type="submit" disabled={!!busy || saveUnavailable || copies === null} className={`${primary} shrink-0`}><IconPlus aria-hidden="true" size={14} />Create backup</button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rift-mutedbright">Named copies follow the same automatic cleanup schedule.</p>
          </form>
        </section>
        {saveUnavailable && <p className="border-l border-rift-gold/50 pl-3 text-xs leading-relaxed text-rift-gold">Resolve the save error before creating a new copy. You can still restore an earlier backup.</p>}
        {busy && <p role="status" className="text-sm text-rift-goldbright">{busy}</p>}
        {success && <p role="status" className="flex items-start gap-2 border border-rift-blue/20 bg-rift-blue/5 p-3 text-xs leading-relaxed text-rift-bluebright"><IconCheck aria-hidden="true" size={16} className="shrink-0" />{success}</p>}
        {(error || backupError) && <div role="alert" className="border border-rift-red/30 bg-rift-red/5 p-4 text-xs leading-relaxed text-rift-redbright">
          <p>{error ? "The backup action could not be completed." : "The last backup attempt failed."} Try again when ready.</p>
          <details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p className="mt-2 break-words">{error || backupError}</p></details>
          <button type="button" disabled={!!busy} className={`${secondary} mt-3`} onClick={() => void run("Checking backups...", async () => setCopies(await listBackups()))}>Refresh copies</button>
        </div>}
        <section aria-label="Available backups" aria-busy={copies === null && !error}>
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.18em] text-rift-goldbright"><IconHistory aria-hidden="true" size={16} className="text-rift-gold" />Backup history</h3>{copies && <span className="text-[10px] tabular-nums text-rift-mutedbright">{copies.length} {copies.length === 1 ? "copy" : "copies"}</span>}</div>
          {copies === null && !error && <p role="status" className="flex items-center justify-center gap-3 border border-rift-gold/15 bg-rift-bg/30 px-5 py-8 text-xs"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-rift-gold/20 border-t-rift-gold motion-reduce:animate-none" />Loading backup history...</p>}
          {copies?.length === 0 && <p className="border border-dashed border-rift-gold/20 bg-rift-bg/30 px-5 py-8 text-center text-xs leading-relaxed">Your backups will appear here. Create one now, or let automatic backups keep copies as you play.</p>}
          {copies && copies.length > 0 && <ul className="divide-y divide-rift-gold/10 border border-rift-gold/15 bg-rift-bg/30">{copies.map((copy, index) => <li key={copy.id} className="flex flex-col items-start justify-between gap-3 p-4 transition-colors hover:bg-rift-gold/[0.03] sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">{copy.name && <p className="mb-1 break-words font-display text-sm text-rift-goldbright">{copy.name}</p>}<div className="flex flex-wrap items-center gap-2"><time dateTime={new Date(copy.createdAt).toISOString()} className="text-sm text-rift-goldbright">{date(copy.createdAt)}</time>{index === 0 && <span className="border border-rift-gold/25 bg-rift-gold/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] text-rift-gold">Latest</span>}</div>
              <p className="mt-1 break-words text-xs leading-relaxed">{copy.realities.join(", ") || "Saved drafts, tournaments and seasons"}</p>
              <p className="mt-2 text-[10px] tabular-nums text-rift-mutedbright">{copy.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(copy.bytes / 1024))} KB` : `${(copy.bytes / 1024 / 1024).toFixed(1)} MB`}</p></div>
            <button type="button" disabled={!!busy || !!simulating} className={`${secondary} w-full shrink-0 sm:w-auto`} data-backup-id={copy.id} onClick={() => { restoreTrigger.current = copy.id; setError(null); setSelected(copy); }}>Review restore</button>
          </li>)}</ul>}
          {simulating && <p className="mt-3 text-xs text-rift-gold">Pause simulation before restoring a backup.</p>}
        </section>
        <details className="group border-t border-rift-gold/15 pt-4 text-xs">
          <summary className="cursor-pointer py-1 font-display text-[10px] uppercase tracking-[0.15em] text-rift-mutedbright transition-colors hover:text-rift-goldbright">{isDesktop() ? "Storage & external copies" : "About automatic backups"}</summary>
          <div className="mt-3 space-y-3 text-xs leading-relaxed">
            <p>Automatic backups keep up to 5 recent, 7 daily and 4 weekly copies. The same copy can belong to more than one group.</p>
            <p>{isDesktop() ? "Local copies are stored on this device. Choose a folder on another device for extra protection, or import a copy you kept elsewhere." : "Copies are stored in this browser. Clearing browser data also removes these copies. Export important realities from the Realities screen to keep a separate file."}</p>
            {isDesktop() && <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} className={secondary} onClick={() => void run("Choosing backup folder...", chooseBackupDestination)}>Choose external folder</button><button type="button" disabled={!!busy} className={secondary} onClick={() => void run("Importing backup...", async () => { await importExternalBackup(); setCopies(await listBackups()); })}>Import backup file</button></div>}
          </div>
        </details>
      </>}
    </div>
  </dialog>, document.body);
}
