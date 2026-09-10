import { describe, expect, it } from "vitest";
import { getPersistenceSnapshot, markSavePending, markSaveStarted, markSaveConfirmed, reportPersistenceError } from "./persistenceStatus";
describe("durable save status", () => {
  it("does not mark the whole store saved while another write is pending", () => {
    markSavePending("first"); markSavePending("second"); markSaveStarted("first");
    expect(getPersistenceSnapshot().phase).toBe("saving");
    markSaveConfirmed("first", 100); expect(getPersistenceSnapshot().phase).toBe("pending");
    markSaveStarted("second"); reportPersistenceError("disk full", "test");
    expect(getPersistenceSnapshot().phase).toBe("error");
    reportPersistenceError(null, "test"); markSaveConfirmed("second");
    expect(getPersistenceSnapshot()).toMatchObject({ phase: "saved", bytes: 100 });
    expect(getPersistenceSnapshot().confirmedAt).toBeGreaterThan(0);
  });
});
