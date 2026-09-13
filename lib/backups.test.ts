import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./desktopStorage", () => ({ isDesktop: () => false, flushPendingPersistWrites: async () => {}, pausePersistWrites: () => () => {} }));
import { createBackup, listBackups, retainedBackupIds, validWebBackup } from "./backups";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("recovery retention", () => {
  it("rejects incompatible versions and malformed saved collections", () => {
    expect(validWebBackup({ version: 8, state: { realities: [] } })).toBe(false);
    expect(validWebBackup({ version: 7, state: [] })).toBe(false);
    expect(validWebBackup({ version: 7, state: { realities: [{}] } })).toBe(false);
    expect(validWebBackup({ version: 7, state: { season: { teams: [] } } })).toBe(false);
    expect(validWebBackup({ version: 7, state: { realities: [] } })).toBe(true);
  });
  it("preserves two distinct copies when the clock has not advanced", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const value = JSON.stringify({ version: 7, state: { realities: [] } });
    const items = new Map([["draftsim-store", value]]);
    vi.stubGlobal("localStorage", { get length() { return items.size; }, key: (i: number) => [...items.keys()][i],
      getItem: (key: string) => items.get(key) ?? null, removeItem: (key: string) => items.delete(key),
      setItem: (key: string, content: string) => { items.set(key, content); } });
    await createBackup(); await createBackup();
    expect(items.has("draftsim-backup-100")).toBe(true);
    expect(items.has("draftsim-backup-101")).toBe(true);
    expect(await listBackups()).toHaveLength(2);
  });
  it("preserves manual names after reload without naming later automatic copies", async () => {
    vi.spyOn(Date, "now").mockReturnValue(200);
    const value = JSON.stringify({ version: 7, state: { realities: [] } });
    const items = new Map([["draftsim-store", value]]);
    vi.stubGlobal("localStorage", { get length() { return items.size; }, key: (i: number) => [...items.keys()][i],
      getItem: (key: string) => items.get(key) ?? null, removeItem: (key: string) => items.delete(key),
      setItem: (key: string, content: string) => { items.set(key, content); } });
    await createBackup(true, "  Before finals / Finales  ");
    expect(items.get("draftsim-store")).toBe(value);
    expect((await listBackups())[0].name).toBe("Before finals / Finales");
    // Simulate restoring a named snapshot. A later automatic copy gets no inherited name.
    items.set("draftsim-store", items.get("draftsim-backup-200")!);
    await createBackup(false);
    const copies = await listBackups();
    expect(copies[0].name).toBeUndefined();
    expect(copies[1].name).toBe("Before finals / Finales");
    await expect(createBackup(true, "x".repeat(81))).rejects.toThrow("80 characters");
    expect(await listBackups()).toHaveLength(2);
  });
  it("keeps recent, daily and weekly points without accumulating every snapshot", () => {
    const copies = Array.from({ length: 100 }, (_, i) => ({ id: String(i), createdAt: (100-i)*86400000, bytes: 10, realities: [], years: 1 }));
    const ids = retainedBackupIds(copies); expect(ids.has("0")).toBe(true); expect(ids.has("6")).toBe(true);
    expect(ids.has("99")).toBe(false); expect(ids.size).toBeLessThanOrEqual(16);
  });
  it("keeps older copies and the current save when a new copy exceeds quota", async () => {
    const value = JSON.stringify({ version: 7, state: { realities: [] } });
    const items = new Map([["draftsim-store", value], ["draftsim-backup-1", value]]);
    vi.stubGlobal("localStorage", { get length() { return items.size; }, key: (i: number) => [...items.keys()][i],
      getItem: (key: string) => items.get(key) ?? null, removeItem: (key: string) => items.delete(key),
      setItem: () => { throw new Error("quota"); } });
    await expect(createBackup()).rejects.toThrow("quota");
    expect(items.get("draftsim-store")).toBe(value); expect(await listBackups()).toHaveLength(1);
  });
});
