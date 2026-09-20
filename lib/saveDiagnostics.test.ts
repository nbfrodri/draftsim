import { beforeEach, describe, expect, it } from "vitest";
import { beginSaveDiagnostic, clearSaveDiagnostics, encodeWithSaveDiagnostic, exportSaveDiagnostics, getSaveDiagnostics, setSaveDiagnosticsEnabled } from "./saveDiagnostics";
beforeEach(() => setSaveDiagnosticsEnabled(false));
describe("optional local save diagnostics", () => {
  it("does not record by default and does not alter encoding", () => {
    expect(encodeWithSaveDiagnostic("global-encode", () => "private-value")).toBe("private-value");
    beginSaveDiagnostic("commit")(true, 10, 1);
    expect(getSaveDiagnostics().entries).toEqual([]);
  });
  it("records only bounded numeric metrics, never encoded content", () => {
    setSaveDiagnosticsEnabled(true);
    for (let i = 0; i < 240; i++) encodeWithSaveDiagnostic("season-encode", () => "private-player-and-path");
    const result = JSON.parse(exportSaveDiagnostics());
    expect(result.entries).toHaveLength(200);
    expect(result.entries[0].bytes).toBe(23);
    expect(exportSaveDiagnostics()).not.toContain("private-player");
    expect(Object.keys(result.entries[0]).sort()).toEqual(["bytes", "durationMs", "phase", "statements", "success"]);
  });
  it("does not retain in-flight data after clear or disable", () => {
    setSaveDiagnosticsEnabled(true);
    const old = beginSaveDiagnostic("commit");
    clearSaveDiagnostics(); old();
    expect(getSaveDiagnostics().entries).toEqual([]);
    const pending = beginSaveDiagnostic("flush");
    setSaveDiagnosticsEnabled(false); setSaveDiagnosticsEnabled(true); pending();
    expect(getSaveDiagnostics().entries).toEqual([]);
  });
  it("records failed operations without their error messages", () => {
    setSaveDiagnosticsEnabled(true);
    expect(() => encodeWithSaveDiagnostic("global-encode", () => { throw new Error("secret-path"); })).toThrow("secret-path");
    expect(getSaveDiagnostics().entries[0].success).toBe(false);
    expect(exportSaveDiagnostics()).not.toContain("secret-path");
  });
});
