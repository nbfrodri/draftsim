import { isDesktop } from "./desktopStorage";

/**
 * Crash-surviving bulk-simulation breadcrumbs (desktop only).
 *
 * Each heavy bulk step first awaits one native append to
 * `<app data>/logs/bulk-diagnostics.log` (src-tauri/src/diagnostics.rs), so a
 * WebView renderer crash leaves the year and stage it died in. Only stages,
 * ids, counters and sizes are sent; the native side rejects anything else.
 */
export type BulkStage =
  | "start" | "season-sim" | "phase" | "offseason" | "archive" | "publish" | "save"
  | "persist-batch" | "export" | "year-done" | "guard-stop" | "idle" | "app-closed" | "acknowledged";

export interface BulkBreadcrumb {
  stage: BulkStage;
  realityId?: string;
  year?: number;
  phase?: number;
  completed?: number;
  total?: number;
  payloadBytes?: number;
  statements?: number;
}

export interface JsHeap { heapUsed?: number; heapTotal?: number; heapLimit?: number }
export type ParsedBreadcrumb = BulkBreadcrumb & JsHeap & { ts?: number };

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const FIELDS = ["stage", "realityId", "year", "phase", "completed", "total", "payloadBytes", "statements"] as const;
/** A run that stopped on one of these ended normally. */
const CLEAN_STAGES = new Set<string>(["idle", "app-closed", "acknowledged"]);
/** Stop bulk before the next year once the renderer heap passes this share of its limit. */
export const BULK_HEAP_GUARD_RATIO = 0.85;

let invokeForTests: Invoke | null = null;
let context: { realityId: string; year: number } | null = null;

/** @internal test helper */
export function setBreadcrumbInvokeForTests(invoke: Invoke | null): void { invokeForTests = invoke; }

async function nativeInvoke(): Promise<Invoke | null> {
  if (invokeForTests) return invokeForTests;
  if (!isDesktop()) return null;
  return (await import("@tauri-apps/api/core")).invoke as Invoke;
}

/** Chromium/WebView2 `performance.memory` (non-standard; coarse unless precise memory info is on). */
export function readJsHeap(): JsHeap {
  const memory = (globalThis.performance as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } } | undefined)?.memory;
  if (!memory) return {};
  const heap: JsHeap = {};
  if (Number.isFinite(memory.usedJSHeapSize)) heap.heapUsed = memory.usedJSHeapSize;
  if (Number.isFinite(memory.totalJSHeapSize)) heap.heapTotal = memory.totalJSHeapSize;
  if (Number.isFinite(memory.jsHeapSizeLimit)) heap.heapLimit = memory.jsHeapSizeLimit;
  return heap;
}

/** Await before a heavy step. Logging failures never interrupt the simulation. */
export async function recordBulkBreadcrumb(breadcrumb: BulkBreadcrumb): Promise<void> {
  try {
    const invoke = await nativeInvoke();
    if (!invoke) return;
    const payload: Record<string, unknown> = {};
    for (const key of FIELDS) {
      const value = breadcrumb[key];
      if (value !== undefined) payload[key] = typeof value === "number" ? Math.max(0, Math.round(value)) : value;
    }
    await invoke("diagnostics_breadcrumb", { breadcrumb: { ...payload, ...readJsHeap() } });
  } catch {
    // Diagnostics are best-effort.
  }
}

/** Reality and year of the running bulk job, so save paths can log their payload sizes. */
export function setBulkBreadcrumbContext(next: { realityId: string; year: number } | null): void { context = next; }
export function getBulkBreadcrumbContext(): { realityId: string; year: number } | null { return context; }

export async function readBulkBreadcrumbLog(): Promise<string> {
  try {
    const invoke = await nativeInvoke();
    if (!invoke) return "";
    const log = await invoke("diagnostics_breadcrumb_log");
    return typeof log === "string" ? log : "";
  } catch {
    return "";
  }
}

/** Valid breadcrumb lines in file order; torn or foreign lines are skipped. */
export function parseBulkBreadcrumbLog(log: string): ParsedBreadcrumb[] {
  const entries: ParsedBreadcrumb[] = [];
  for (const raw of log.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const value = JSON.parse(raw) as ParsedBreadcrumb;
      if (value && typeof value === "object" && typeof value.stage === "string") entries.push(value);
    } catch {
      // A crash can tear the last line.
    }
  }
  return entries;
}

/** Non-null when the last breadcrumb shows a bulk run that never finished. */
export function unexpectedBulkEnd(log: string): { year: number | null; stage: string; message: string } | null {
  const last = parseBulkBreadcrumbLog(log).at(-1);
  if (!last || CLEAN_STAGES.has(last.stage)) return null;
  const year = typeof last.year === "number" ? last.year : null;
  const when = year === null ? "bulk simulation" : `bulk year ${year}`;
  return { year, stage: last.stage, message: `The previous session ended unexpectedly during ${when}, stage ${last.stage}.` };
}

/** Message that stops bulk before `year`, or null to continue. Unknown heap sizes never stop it. */
export function bulkMemoryGuardMessage(heap: JsHeap, year: number): string | null {
  if (!heap.heapUsed || !heap.heapLimit) return null;
  if (heap.heapUsed / heap.heapLimit < BULK_HEAP_GUARD_RATIO) return null;
  const used = Math.round(heap.heapUsed / 1048576), limit = Math.round(heap.heapLimit / 1048576);
  return `Bulk simulation paused before year ${year}: the app is close to its memory limit (${used} of ${limit} MB). Completed years are saved. Restart DraftSim, then resume the simulation.`;
}
