import { describe, it, expect } from "vitest";
import {
  mergePersistedState,
  parseMetaConfigJson,
  splitPersistedState,
  UPSERT_REALITY_HISTORY_SQL,
} from "./desktopSqliteSchema";

describe("desktopSqliteSchema", () => {
  it("splitPersistedState separates global blob from realities", () => {
    const state = {
      soundEnabled: true,
      activeRealityId: "r1",
      realities: [
        {
          id: "r1",
          name: "LCK",
          year: 2026,
          season: { id: "s1" },
          history: [{ id: "h1" }],
        },
      ],
    };
    const { global, realities, activeRealityId } = splitPersistedState(state);
    expect(activeRealityId).toBe("r1");
    expect(global.soundEnabled).toBe(true);
    expect(global.realities).toEqual([]);
    expect(realities).toHaveLength(1);
    expect(realities[0]?.history).toEqual([{ id: "h1" }]);
  });

  it("mergePersistedState lazy-loads inactive history", () => {
    const global = { soundEnabled: false, activeRealityId: "active", realities: [] };
    const realities = [
      {
        id: "active",
        name: "A",
        year: 1,
        season: {},
        history: [{ id: "h-active" }],
      },
      {
        id: "other",
        name: "B",
        year: 10,
        season: {},
        history: [{ id: "h-other" }],
      },
    ];
    const merged = mergePersistedState(global, realities, {
      lazyHistoryForInactive: true,
      activeRealityId: "active",
    });
    expect(merged.realities?.[0]?.history).toEqual([{ id: "h-active" }]);
    expect(merged.realities?.[1]?.history).toEqual([]);
  });

  it("parseMetaConfigJson accepts string and null values", () => {
    const parsed = parseMetaConfigJson(
      JSON.stringify({ a: "x", b: null, c: 1 }),
    );
    expect(parsed).toEqual({ a: "x", b: null });
  });

  it("UPSERT_REALITY_HISTORY_SQL targets reality_id + entry_id conflict", () => {
    expect(UPSERT_REALITY_HISTORY_SQL).toContain("ON CONFLICT(reality_id, entry_id)");
    expect(UPSERT_REALITY_HISTORY_SQL).toContain("entry_json = excluded.entry_json");
    expect(UPSERT_REALITY_HISTORY_SQL).toContain("sort_order = excluded.sort_order");
  });
});
