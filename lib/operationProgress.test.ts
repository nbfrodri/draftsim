import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { advanceOperationProgress, beginOperationProgress, clearOperationProgress, estimatedRemainingMs, getOperationProgress, recordOperationSuccess } from "./operationProgress";
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.useFakeTimers(); vi.setSystemTime(10000); clearOperationProgress();
});
afterEach(() => { clearOperationProgress(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("uses completed stage timings, not a made-up first-run countdown", () => {
  beginOperationProgress("leave");
  expect(estimatedRemainingMs(getOperationProgress()!, Date.now())).toBeNull();
  vi.advanceTimersByTime(2000); advanceOperationProgress("save");
  vi.advanceTimersByTime(6000); recordOperationSuccess(); clearOperationProgress();
  beginOperationProgress("leave");
  expect(estimatedRemainingMs(getOperationProgress()!, Date.now())).toBe(8000);
  vi.advanceTimersByTime(1000);
  expect(estimatedRemainingMs(getOperationProgress()!, Date.now())).toBe(7000);
  vi.advanceTimersByTime(2000);
  expect(estimatedRemainingMs(getOperationProgress()!, Date.now())).toBeNull();
  advanceOperationProgress("save");
  expect(estimatedRemainingMs(getOperationProgress()!, Date.now())).toBe(6000);
});
it("ignores backwards and stale native updates and discards failed timings", () => {
  const old = beginOperationProgress("restore"); advanceOperationProgress("replace", old);
  advanceOperationProgress("validate", old);
  expect(getOperationProgress()!.index).toBe(4);
  clearOperationProgress();
  const next = beginOperationProgress("restore");
  advanceOperationProgress("reload", old);
  expect(getOperationProgress()!.id).toBe(next);
  expect(getOperationProgress()!.index).toBe(0);
  expect(getOperationProgress()!.previous).toBeNull();
});
it("tolerates corrupt timing storage without blocking the operation", () => {
  values.set("draftsim-operation-times-v1-web", "{broken");
  beginOperationProgress("backup");
  expect(getOperationProgress()!.previous).toBeNull();
});
