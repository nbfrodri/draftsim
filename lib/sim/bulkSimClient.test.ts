import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TournamentState } from "../tournament";
import { runAutoPlayMatch, terminateBulkSimWorker } from "./bulkSimClient";
vi.mock("./autoPlayMatch", () => ({ autoPlayMatch: vi.fn(() => { throw new Error("fallback failed"); }) }));
class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.last = this; }
}
const run = () => runAutoPlayMatch({} as TournamentState, "m1", [], {});
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", {}); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { terminateBulkSimWorker(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("worker lifecycle", () => {
  it("rejects and cleans up requests on crash", async () => {
    const first = run();
    const rejection = expect(first).rejects.toThrow("crashed");
    FakeWorker.last.onerror!();
    await rejection;
    expect(FakeWorker.last.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("handles structured clone failure without a leaked timeout", async () => {
    const warm = run();
    FakeWorker.last.onmessage!({ data: { id: FakeWorker.last.postMessage.mock.calls[0][0].id, tournament: {}, playerForms: {} } });
    await warm;
    FakeWorker.last.postMessage.mockImplementation(() => { throw new DOMException("Clone", "DataCloneError"); });
    await expect(run()).rejects.toThrow("Clone");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates a hung worker and permits a later restart", async () => {
    const promise = run();
    const rejection = expect(promise).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(120000);
    await rejection;
    const old = FakeWorker.last;
    const next = run();
    const nextRejection = expect(next).rejects.toThrow("unreadable");
    expect(FakeWorker.last).not.toBe(old);
    FakeWorker.last.onmessageerror!();
    await nextRejection;
  });
  it("returns a rejected promise when synchronous fallback fails", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(run()).rejects.toThrow("fallback failed");
  });
});
