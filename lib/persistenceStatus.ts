const errors = new Map<string, string>();
let error: string | null = null;
const listeners = new Set<() => void>();
export const getPersistenceLoadBlocked = () => errors.has("hydrate");
export const getPersistenceError = () => error;
export const getServerPersistenceError = () => null;
export function subscribePersistenceError(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function reportPersistenceError(message: string | null, source = "default"): void {
  if (message === null) errors.delete(source);
  else errors.set(source, message);
  error = [...errors.values()].join(" ") || null;
  updateStatus();
  for (const listener of listeners) listener();
}

export interface PersistenceSnapshot {
  phase: "idle" | "pending" | "saving" | "saved" | "error";
  confirmedAt: number | null;
  bytes: number | null;
}
const initial: PersistenceSnapshot = { phase: "idle", confirmedAt: null, bytes: null };
let snapshot = initial;
const writes = new Map<string, "pending" | "saving">();
const statusListeners = new Set<() => void>();
export const getPersistenceSnapshot = () => snapshot;
export const getServerPersistenceSnapshot = () => initial;
export function subscribePersistenceStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}
function updateStatus(patch: Partial<PersistenceSnapshot> = {}) {
  const phase = error ? "error" : [...writes.values()].includes("saving") ? "saving"
    : writes.size ? "pending" : snapshot.confirmedAt ? "saved" : "idle";
  snapshot = { ...snapshot, ...patch, phase };
  for (const listener of statusListeners) listener();
}
export function markSavePending(source: string) {
  writes.set(source, "pending"); updateStatus();
}
export function markSaveStarted(source: string) {
  writes.set(source, "saving"); updateStatus();
}
export function markSaveConfirmed(source: string, bytes?: number) {
  writes.delete(source);
  updateStatus({ confirmedAt: Date.now(), ...(bytes === undefined ? {} : { bytes }) });
}
export function markSaveCancelled(source: string) {
  writes.delete(source); updateStatus();
}
