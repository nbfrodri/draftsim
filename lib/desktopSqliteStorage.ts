import { beginSaveDiagnostic } from "./saveDiagnostics";
/**
 * Zustand PersistStorage backed by SQLite on desktop.
 */

import type { PersistStorage,StorageValue } from "zustand/middleware";
import {
clearDesktopStoreFromDb,
loadLegacyJsonStorageValue,
loadStorageValueFromSqlite,
migrateJsonFilesToSqlite,
saveStorageValueToSqlite,
} from "./desktopSqlite";
import {
cancelPendingWrite,
holdHiddenFlush,
setPersistLoadStage,
isDesktop,
migrateWebStorageToDesktop,
} from "./desktopStorage";
import { markSavePending, markSaveStarted, markSaveConfirmed, markSaveCancelled, reportPersistenceError } from "./persistenceStatus";

interface PendingSqliteWrite {
  value: StorageValue<unknown>;
  timer?: ReturnType<typeof setTimeout>;
}

const pendingSqliteWrites = new Map<string, PendingSqliteWrite>();
let inFlight: Promise<void> | null = null;
const SQLITE_DEBOUNCE_MS = 500;
let debounceHolds = 0;

function armDebounce(name: string, pending: PendingSqliteWrite): void {
  pending.timer = setTimeout(() => {
    pending.timer = undefined;
    void flushPendingSqliteWrites().catch((err) => {
      console.warn("[desktopSqliteStorage] write failed; snapshot retained for retry:", name, err);
    });
  }, SQLITE_DEBOUNCE_MS);
}

/**
 * Keep the latest snapshot queued without its debounce timer, so only explicit
 * flushes write it (bulk simulation checkpoints, pause, close). A mid-year
 * snapshot of a live franchise season is the largest save payload (10-16 MB
 * in docs/plans/2026-10-26-windows-bulk-blank-screen.md) and bulk publishes
 * after every match. Releasing re-arms the debounce for anything still queued.
 */
export function holdDebouncedSqliteWrites(): () => void {
  debounceHolds++;
  const releaseHiddenFlush = holdHiddenFlush();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseHiddenFlush();
    debounceHolds--;
    if (debounceHolds > 0) return;
    for (const [name, pending] of pendingSqliteWrites) if (!pending.timer) armDebounce(name, pending);
  };
}

/** Cancel a queued snapshot. Already-running I/O must still finish. */
export function cancelPendingSqliteWrite(name: string): void {
  const pending = pendingSqliteWrites.get(name);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingSqliteWrites.delete(name);
  markSaveCancelled(`sqlite:${name}`);
}

function scheduleSqliteWrite<S>(name: string, value: StorageValue<S>): void {
  cancelPendingSqliteWrite(name);
  const pending: PendingSqliteWrite = { value };
  if (debounceHolds === 0) armDebounce(name, pending);
  pendingSqliteWrites.set(name, pending);
  markSavePending(`sqlite:${name}`);
}

/** Includes writes that have started but have not reached durable storage. */
export function hasPendingSqliteWrites(): boolean {
  return pendingSqliteWrites.size > 0 || inFlight !== null;
}

/** Drain in order, including snapshots queued while awaiting an earlier write. */
export async function flushPendingSqliteWrites(): Promise<void> {
  if (inFlight) return inFlight;
  const drain = async () => {
    while (pendingSqliteWrites.size > 0) {
      const [name, pending] = pendingSqliteWrites.entries().next().value!;
      if (pending.timer) clearTimeout(pending.timer);
      pendingSqliteWrites.delete(name);
      markSaveStarted(`sqlite:${name}`);
      try {
        await saveStorageValueToSqlite(name, pending.value);
        reportPersistenceError(null, "sqlite");
        if (!pendingSqliteWrites.has(name)) markSaveConfirmed(`sqlite:${name}`);
        else markSavePending(`sqlite:${name}`);
      } catch (error) {
        reportPersistenceError("Your latest changes could not be saved. Keep the app open and retry, or export your current game.", "sqlite");
        // Never replace a newer snapshot with the failed older one.
        if (!pendingSqliteWrites.has(name)) {
          pending.timer = undefined;
          pendingSqliteWrites.set(name, pending);
        }
        throw error;
      }
    }
  };
  const finish = beginSaveDiagnostic("flush");
  const operation = drain();
  inFlight = operation;
  try {
    await operation;
    finish();
  } catch (error) { finish(false); throw error; } finally {
    if (inFlight === operation) inFlight = null;
  }
}

/** @internal test helper; callers must await outstanding writes first. */
export function resetSqliteWriteQueueForTests(): void {
  for (const pending of pendingSqliteWrites.values()) {
    if (pending.timer) clearTimeout(pending.timer);
  }
  pendingSqliteWrites.clear();
  inFlight = null;
  debounceHolds = 0;
}

/**
 * Desktop SQLite PersistStorage — defers DB writes 500ms and splits franchise
 * data into per-reality rows (see desktopSqlite.ts).
 */
export function createDesktopSqliteStorage<S>(): PersistStorage<S> {
  return {
    async getItem(name: string): Promise<StorageValue<S> | null> {
      cancelPendingWrite(name);
      cancelPendingSqliteWrite(name);
      if (!isDesktop()) return null;

      if (inFlight) await inFlight;
      setPersistLoadStage("Checking legacy web saves");
      await migrateWebStorageToDesktop(name);
      setPersistLoadStage("Opening saved database");
      await migrateJsonFilesToSqlite(name);

      const fromDb = await loadStorageValueFromSqlite<S>(name);
      if (fromDb) return fromDb;

      setPersistLoadStage("Reading legacy save file");
      return loadLegacyJsonStorageValue<S>(name);
    },

    setItem(name: string, value: StorageValue<S>): void {
      if (!isDesktop()) return;
      scheduleSqliteWrite(name, value);
    },

    async removeItem(name: string): Promise<void> {
      cancelPendingWrite(name);
      cancelPendingSqliteWrite(name);
      if (!isDesktop()) return;
      try {
        if (inFlight) await inFlight;
        cancelPendingSqliteWrite(name);
        await clearDesktopStoreFromDb(name);
      } catch (err) {
        console.warn("[desktopSqliteStorage] removeItem failed:", name, err);
        throw err;
      }
    },
  };
}
