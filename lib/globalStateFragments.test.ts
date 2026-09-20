import { describe, expect, it } from "vitest";
import { joinGlobalState, partitionGlobalState } from "./globalStateFragments";
describe("global state fragments", () => {
  it("round-trips separate settings, arrays, nulls and competitive data", () => {
    const global = { volume: 0.5, season: { teams: [1, 2] }, savedSeasons: [], tournament: null };
    const { root, fragments } = partitionGlobalState(global);
    expect(root).not.toHaveProperty("season");
    const rows = [...fragments].map(([fragment_key, value]) => ({ fragment_key, value_json: JSON.stringify(value) }));
    expect(joinGlobalState(root, rows)).toEqual(global);
  });
  it("rejects missing, corrupt and unknown referenced fragments", () => {
    const { root } = partitionGlobalState({ season: {} });
    expect(() => joinGlobalState(root, [])).toThrow("missing");
    expect(() => joinGlobalState(root, [{ fragment_key: "season", value_json: "{" }])).toThrow("invalid");
    expect(() => joinGlobalState({ _draftsimFragments: ["__proto__"] }, [])).toThrow("invalid");
    expect(() => joinGlobalState({ _draftsimFragments: ["season", "season"] }, [])).toThrow("invalid");
  });
  it("reads unmodified legacy roots without fabricating fragments", () => {
    const legacy = { volume: 1, season: { id: "old" } };
    expect(joinGlobalState(legacy, [])).toBe(legacy);
  });
});
