import type { ParsedBreadcrumb } from "./bulkBreadcrumbs";
/** Session-only, opt-in metrics. Never accepts payloads, paths or error messages. */
export type SaveDiagnosticPhase = "global-encode" | "season-encode" | "history-encode" | "plan" | "commit" | "flush";
export interface SaveDiagnostic {
  phase: SaveDiagnosticPhase;
  durationMs: number;
  bytes: number;
  statements: number;
  success: boolean;
  /** JS heap in use when the step finished (WebView2/Chromium only). */
  heapUsed?: number;
}
const LIMIT = 200;
const listeners = new Set<() => void>();
let generation = 0;
let state: { enabled: boolean; entries: readonly SaveDiagnostic[] } = { enabled: false, entries: [] };
const serverState = state;
export const getSaveDiagnostics = () => state;
export const getServerSaveDiagnostics = () => serverState;
export function subscribeSaveDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish() { for (const listener of listeners) listener(); }
export function setSaveDiagnosticsEnabled(enabled: boolean) {
  generation++;
  state = { enabled, entries: [] };
  publish();
}
export function clearSaveDiagnostics() {
  generation++;
  state = { ...state, entries: [] };
  publish();
}
/** Clearing/disabling also invalidates measurements already in flight. */
export function beginSaveDiagnostic(phase: SaveDiagnosticPhase) {
  if (!state.enabled) return () => {};
  const current = generation;
  const started = performance.now();
  let finished = false;
  return (success = true, bytes = 0, statements = 0) => {
    if (finished || !state.enabled || current !== generation) return;
    finished = true;
    const finite = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
    const entry: SaveDiagnostic = { phase, durationMs: finite(performance.now() - started), bytes: finite(bytes), statements: finite(statements), success };
    const heapUsed = (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
    if (typeof heapUsed === "number" && Number.isFinite(heapUsed)) entry.heapUsed = heapUsed;
    state = { ...state, entries: [...state.entries.slice(-(LIMIT - 1)), entry] };
    publish();
  };
}
export function encodeWithSaveDiagnostic(phase: SaveDiagnosticPhase, encode: () => string): string {
  if (!state.enabled) return encode();
  const finish = beginSaveDiagnostic(phase);
  try {
    const value = encode();
    finish(true, new TextEncoder().encode(value).byteLength);
    return value;
  } catch (error) { finish(false); throw error; }
}
/** `bulkBreadcrumbs` carries the native bulk log (stages, ids, sizes), which survives a crash. */
export function exportSaveDiagnostics(bulkBreadcrumbs?: readonly ParsedBreadcrumb[]): string {
  return JSON.stringify({ format: "draftsim-save-diagnostics", version: 1, entries: state.entries,
    ...(bulkBreadcrumbs ? { bulkBreadcrumbs: bulkBreadcrumbs.slice(-LIMIT) } : {}) }, null, 2);
}
