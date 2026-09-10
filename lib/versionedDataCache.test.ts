import { afterEach, describe, expect, it, vi } from "vitest";
import { readCachedData, writeCachedData } from "./versionedDataCache";
import { fetchChampions, refreshChampions, validChampions } from "./communityDragon";
afterEach(() => vi.unstubAllGlobals());
describe("offline catalogue", () => {
  it("starts with the full local catalogue without fetching", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetch);
    const champions = await fetchChampions();
    expect(validChampions(champions)).toBe(true); expect(fetch).not.toHaveBeenCalled();
    await expect(refreshChampions()).rejects.toThrow();
    expect(await fetchChampions()).toEqual(champions);
  });
  it("ignores incompatible or corrupt cache and preserves last good data on quota failure", () => {
    let raw = JSON.stringify({ version: 2, value: [2] });
    vi.stubGlobal("localStorage", { getItem: () => raw, setItem: () => { throw new Error("quota"); } });
    const valid = (value: unknown): value is number[] => Array.isArray(value) && value.every(v => typeof v === "number");
    expect(readCachedData("test", 1, valid, [1])).toEqual([1]);
    raw = JSON.stringify({ version: 1, value: [3] });
    writeCachedData("test", 1, [4]); expect(readCachedData("test", 1, valid, [1])).toEqual([3]);
    raw = "truncated"; expect(readCachedData("test", 1, valid, [1])).toEqual([1]);
  });
});
