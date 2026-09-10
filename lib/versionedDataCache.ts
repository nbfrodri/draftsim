export interface CachedData<T> { version: number; updatedAt: number; value: T }
export function readCachedData<T>(key: string, version: number, valid: (value: unknown) => value is T, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const cached: CachedData<unknown> = JSON.parse(localStorage.getItem(key) ?? "null");
    return cached?.version === version && valid(cached.value) ? cached.value : fallback;
  } catch { return fallback; }
}
export function writeCachedData<T>(key: string, version: number, value: T): void {
  try { localStorage.setItem(key, JSON.stringify({ version, updatedAt: Date.now(), value })); }
  catch { /* Optional cache must never prevent startup or replace the last good value. */ }
}
