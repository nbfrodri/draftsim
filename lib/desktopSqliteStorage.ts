/**
 * Zustand PersistStorage backed by SQLite on desktop.
 */

import type { PersistStorage, StorageValue } from "zustand/middleware";
import {
  cancelPendingWrite,
  isDesktop,
  migrateWebStorageToDesktop,
} from "./desktopStorage";
import {
  clearDesktopStoreFromDb,
  loadLegacyJsonStorageValue,
  loadStorageValueFromSqlite,
  migrateJsonFilesToSqlite,
  saveStorageValueToSqlite,
} from "./desktopSqlite";

interface PendingSqliteWrite<S> {
  value: StorageValue<S>;
  timer: ReturnType<typeof setTimeout>;
}

const pendingSqliteWrites = new Map<string, PendingSqliteWrite<unknown>>();
const SQLITE_DEBOUNCE_MS = 500;

async function flushSqliteWrite<S>(name: string, value: StorageValue<S>): Promise<void> {
  await saveStorageValueToSqlite(name, value);
}

/** Cancel a debounced SQLite write for `name` without flushing it. */
export function cancelPendingSqliteWrite(name: string): void {
  const pending = pendingSqliteWrites.get(name);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingSqliteWrites.delete(name);
}

function scheduleSqliteWrite<S>(name: string, value: StorageValue<S>): void {
  const existing = pendingSqliteWrites.get(name);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingSqliteWrites.delete(name);
    void flushSqliteWrite(name, value).catch((err) => {
      console.warn("[desktopSqliteStorage] write failed:", name, err);
    });
  }, SQLITE_DEBOUNCE_MS);

  pendingSqliteWrites.set(name, { value, timer });
}

/** Whether debounced SQLite writes are still queued. */
export function hasPendingSqliteWrites(): boolean {
  return pendingSqliteWrites.size > 0;
}

/** Flush debounced SQLite writes (window close / year boundary). */
export async function flushPendingSqliteWrites(): Promise<void> {
  const entries = [...pendingSqliteWrites.entries()];
  for (const [name, pending] of entries) {
    clearTimeout(pending.timer);
    pendingSqliteWrites.delete(name);
    try {
      await flushSqliteWrite(name, pending.value);
    } catch {
      // ignore on shutdown
    }
  }
}

/** @internal test helper */
export function resetSqliteWriteQueueForTests(): void {
  for (const pending of pendingSqliteWrites.values()) {
    clearTimeout(pending.timer);
  }
  pendingSqliteWrites.clear();
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

      await migrateWebStorageToDesktop(name);
      await migrateJsonFilesToSqlite(name);

      const fromDb = await loadStorageValueFromSqlite<S>(name);
      if (fromDb) return fromDb;

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
        await clearDesktopStoreFromDb(name);
      } catch (err) {
        console.warn("[desktopSqliteStorage] removeItem failed:", name, err);
      }
    },
  };
}
