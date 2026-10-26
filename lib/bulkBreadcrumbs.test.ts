import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bulkMemoryGuardMessage,
  getBulkBreadcrumbContext,
  parseBulkBreadcrumbLog,
  readBulkBreadcrumbLog,
  recordBulkBreadcrumb,
  setBreadcrumbInvokeForTests,
  setBulkBreadcrumbContext,
  unexpectedBulkEnd,
} from "./bulkBreadcrumbs";

const line = (value: Record<string, unknown>) => JSON.stringify({ ts: 1, ...value });

afterEach(() => {
  setBreadcrumbInvokeForTests(null);
  setBulkBreadcrumbContext(null);
  vi.unstubAllGlobals();
});

describe("unexpectedBulkEnd", () => {
  it("reports the year and stage of a bulk run that never reached idle", () => {
    const log = [line({ stage: "start", realityId: "r1", year: 2026 }), line({ stage: "archive", realityId: "r1", year: 2028 })].join("\n") + "\n";
    expect(unexpectedBulkEnd(log)).toEqual({
      year: 2028,
      stage: "archive",
      message: "The previous session ended unexpectedly during bulk year 2028, stage archive.",
    });
  });

  it("stays quiet when the last breadcrumb is a clean end", () => {
    for (const stage of ["idle", "app-closed", "acknowledged"]) {
      expect(unexpectedBulkEnd(`${line({ stage: "save", year: 1 })}\n${line({ stage })}\n`)).toBeNull();
    }
  });

  it("stays quiet without any breadcrumbs", () => {
    expect(unexpectedBulkEnd("")).toBeNull();
  });

  it("ignores a torn or foreign last line and uses the last valid breadcrumb", () => {
    const log = `${line({ stage: "persist-batch", year: 3, payloadBytes: 8_000_000 })}\n{"ts":2,"sta`;
    expect(unexpectedBulkEnd(log)?.stage).toBe("persist-batch");
    expect(parseBulkBreadcrumbLog(`not json\n${line({ stage: 5 })}\n${line({ stage: "idle" })}`)).toHaveLength(1);
  });

  it("omits the year when the breadcrumb has none", () => {
    expect(unexpectedBulkEnd(line({ stage: "start" }))?.message)
      .toBe("The previous session ended unexpectedly during bulk simulation, stage start.");
  });
});

describe("recordBulkBreadcrumb", () => {
  it("sends only whitelisted fields plus the JS heap when available", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    setBreadcrumbInvokeForTests(invoke);
    vi.stubGlobal("performance", { now: () => 0, memory: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 40 } });
    await recordBulkBreadcrumb({ stage: "archive", realityId: "r1", year: 3, completed: 1, total: 5, extra: "secret" } as never);
    expect(invoke).toHaveBeenCalledWith("diagnostics_breadcrumb", {
      breadcrumb: { stage: "archive", realityId: "r1", year: 3, completed: 1, total: 5, heapUsed: 10, heapTotal: 20, heapLimit: 40 },
    });
  });

  it("never throws when the native log is unavailable", async () => {
    setBreadcrumbInvokeForTests(vi.fn().mockRejectedValue(new Error("disk full")));
    await expect(recordBulkBreadcrumb({ stage: "save" })).resolves.toBeUndefined();
    await expect(readBulkBreadcrumbLog()).resolves.toBe("");
  });

  it("is a no-op outside the desktop app", async () => {
    await expect(recordBulkBreadcrumb({ stage: "save" })).resolves.toBeUndefined();
    await expect(readBulkBreadcrumbLog()).resolves.toBe("");
  });

  it("keeps the active bulk context for persistence breadcrumbs", () => {
    setBulkBreadcrumbContext({ realityId: "r1", year: 4 });
    expect(getBulkBreadcrumbContext()).toEqual({ realityId: "r1", year: 4 });
    setBulkBreadcrumbContext(null);
    expect(getBulkBreadcrumbContext()).toBeNull();
  });
});

describe("bulkMemoryGuardMessage", () => {
  it("stops when the JS heap is close to its limit", () => {
    expect(bulkMemoryGuardMessage({ heapUsed: 3_500, heapLimit: 4_000 }, 2030)).toMatch(/paused before year 2030.*memory/i);
  });

  it("continues below the threshold or when the heap size is unknown", () => {
    expect(bulkMemoryGuardMessage({ heapUsed: 1_000, heapLimit: 4_000 }, 2030)).toBeNull();
    expect(bulkMemoryGuardMessage({}, 2030)).toBeNull();
  });
});
