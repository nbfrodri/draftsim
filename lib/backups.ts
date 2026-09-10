import { record, validSeason, validTournament, validSeries, validHistoryEntry } from "./importValidation";
import { discardPendingPersistWritesAfterRestore, flushPendingPersistWrites, isDesktop, pausePersistWrites, signalImportingReality, clearDesktopOperation } from "./desktopStorage";
import { getPersistenceError, getPersistenceSnapshot, subscribePersistenceStatus } from "./persistenceStatus";
export interface Backup { id: string; createdAt: number; bytes: number; realities: string[]; years: number }
let lastBackup = 0;
let running: Promise<void> | null = null;
let message: string | null = null;
const listeners = new Set<() => void>();
export const getBackupError = () => message;
export const subscribeBackupError = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function report(value: string | null) { message = value; for (const fn of listeners) fn(); }
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (await import("@tauri-apps/api/core")).invoke<T>(command, args);
}
const WEB_PREFIX = "draftsim-backup-";
export function validWebBackup(payload: unknown): boolean {
  if (!record(payload) || payload.version !== 7 || !record(payload.state)) return false;
  const state = payload.state;
  const list = (key: string, valid: (value: unknown) => boolean) => state[key] === undefined ||
    (Array.isArray(state[key]) && state[key].every(valid));
  return (state.season == null || validSeason(state.season)) &&
    (state.tournament == null || validTournament(state.tournament)) &&
    (state.series == null || validSeries(state.series)) &&
    list("realities", r => record(r) && typeof r.id === "string" && typeof r.name === "string" &&
      Number.isSafeInteger(r.year) && Number(r.year) > 0 && validSeason(r.season) &&
      Array.isArray(r.history) && r.history.every(validHistoryEntry)) &&
    list("savedSeasons", r => record(r) && typeof r.id === "string" && validSeason(r.season)) &&
    list("savedTournaments", r => record(r) && typeof r.id === "string" && validTournament(r.tournament)) &&
    list("seasonHistory", validHistoryEntry) && list("tournamentHistory", validTournament);
}
function webCopies(): Backup[] {
  const out: Backup[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const id = localStorage.key(i)!;
    if (!id.startsWith(WEB_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(id)!;
      const payload = JSON.parse(raw);
      const createdAt = Number(id.slice(WEB_PREFIX.length));
      if (!Number.isSafeInteger(createdAt) || createdAt < 0 || !validWebBackup(payload)) continue;
      out.push({ id, createdAt, bytes: new TextEncoder().encode(raw).length,
        realities: (payload.state.realities ?? []).map((r: { name: string }) => r.name),
        years: (payload.state.realities ?? []).reduce((n: number, r: { year: number }) => n + r.year, 0) });
    } catch { /* Preserve invalid copies, but never offer them for restoration. */ }
  }
  return out.sort((a,b) => b.createdAt-a.createdAt);
}
export async function listBackups(): Promise<Backup[]> { return isDesktop() ? invoke("backup_list") : webCopies(); }
export function retainedBackupIds(copies: Backup[]): Set<string> {
  const keep = new Set<string>(), days = new Set<number>(), weeks = new Set<number>();
  for (const [i, copy] of [...copies].sort((a,b) => b.createdAt-a.createdAt).entries()) {
    if (i < 5) keep.add(copy.id);
    const day = Math.floor(copy.createdAt / 86400000), week = Math.floor(day / 7);
    if (days.size < 7 && !days.has(day)) { days.add(day); keep.add(copy.id); }
    if (weeks.size < 4 && !weeks.has(week)) { weeks.add(week); keep.add(copy.id); }
  }
  return keep;
}
export async function createBackup(flush = true): Promise<void> {
  if (running) {
    await running;
    if (!flush) return;
    return createBackup(flush);
  }
  running = (async () => {
    if (flush) await flushPendingPersistWrites();
    if (getPersistenceError()) throw new Error("Resolve the save error before making a new backup.");
    if (isDesktop()) await invoke("backup_create");
    else {
      const raw = localStorage.getItem("draftsim-store");
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!validWebBackup(payload)) throw new Error("Unsupported or invalid saved data.");
      let timestamp = Date.now();
      while (localStorage.getItem(`${WEB_PREFIX}${timestamp}`) !== null) timestamp++;
      localStorage.setItem(`${WEB_PREFIX}${timestamp}`, raw);
      const copies = webCopies(), keep = retainedBackupIds(copies);
      for (const copy of copies) if (!keep.has(copy.id)) localStorage.removeItem(copy.id);
    }
    lastBackup = Date.now(); report(null);
  })().catch(error => { report(`Backup failed: ${error instanceof Error ? error.message : String(error)}`); throw error; })
    .finally(() => { running = null; });
  return running;
}
export async function restoreBackup(id: string): Promise<void> {
  const { useDraftStore } = await import("@/store/draftStore");
  if (useDraftStore.getState().simulating) throw new Error("Pause simulation before restoring a copy.");
  if (!(await listBackups()).some(copy => copy.id === id)) throw new Error("Backup is no longer available or is invalid.");
  const originalCopy = isDesktop() ? null : localStorage.getItem(id);
  signalImportingReality();
  const unpause = pausePersistWrites();
  try {
    // On failed hydration, never flush the empty in-memory store.
    if (!getPersistenceError()) await flushPendingPersistWrites();
    if (running) await running;
    if (isDesktop()) await invoke("backup_restore", { id });
    else {
      const raw = originalCopy;
      if (!raw) throw new Error("Backup no longer exists.");
      const previous = localStorage.getItem("draftsim-store");
      if (previous) localStorage.setItem(`draftsim-before-restore-${Date.now()}`, previous);
      localStorage.setItem("draftsim-store", raw);
    }
    await discardPendingPersistWritesAfterRestore();
    window.location.reload();
  } catch (error) { unpause(); clearDesktopOperation(); throw error; }
}
export async function importExternalBackup(): Promise<void> { await invoke("backup_import"); }
export async function chooseBackupDestination(): Promise<void> { await invoke("backup_destination"); }
export function startAutomaticBackups(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    const state = getPersistenceSnapshot();
    if (state.phase !== "saved" || running || timer || Date.now()-lastBackup < 15*60_000) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (getPersistenceSnapshot().phase === "saved") void createBackup(false).catch(() => {});
    }, 1000);
  };
  const unsubscribe = subscribePersistenceStatus(check);
  return () => { unsubscribe(); if (timer) clearTimeout(timer); };
}

/** Required before user-requested replacement or deletion; no browser I/O in SSR. */
export async function backupBeforeDestructiveChange(): Promise<void> {
  if (typeof window === "undefined") return;
  await createBackup();
}
