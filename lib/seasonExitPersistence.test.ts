import { beforeEach, expect, it, vi } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
import type { SeasonHistoryEntry } from "./season/history";
import type { PersistedStoreState } from "./desktopSqliteSchema";
const desktop = vi.hoisted(() => ({ enabled: false }));
vi.mock("./desktopStorage", async original => ({
  ...await original<typeof import("./desktopStorage")>(),
  isDesktop: () => desktop.enabled,
  flushPendingPersistWrites: vi.fn(),
  waitForDesktopOverlayPaint: vi.fn().mockResolvedValue(undefined),
}));
import { flushPendingPersistWrites, getDesktopOperationPhase, resetDesktopOperationPhaseForTests } from "./desktopStorage";
import { savePersistedStateToDbExecutor, setDesktopDatabaseForTests, type SqlExecutor } from "./desktopSqlite";
import { useDraftStore } from "../store/draftStore";

const batch = vi.fn().mockResolvedValue(undefined);
const db: SqlExecutor = {
  execute: async () => ({ rowsAffected: 1 }),
  select: async <T>() => ["A", "B", "C"].map(id => ({ id })) as T[],
  batch,
};
function snapshot() {
  return useDraftStore.persist.getOptions().partialize!(useDraftStore.getState()) as PersistedStoreState;
}
beforeEach(async () => {
  desktop.enabled = true;
  resetDesktopOperationPhaseForTests();
  batch.mockReset().mockResolvedValue(undefined);
  setDesktopDatabaseForTests(db);
  const realities = ["A", "B", "C"].map(id => ({
    id, name: id, year: 101, season: makeAuditSeason(id),
    history: Array.from({ length: 100 }, (_, i): SeasonHistoryEntry => ({
      id: `${id}-${i}`, name: `Year ${i}`, archivedAt: i, complete: true,
      champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
    })),
  }));
  useDraftStore.setState({ realities, activeRealityId: "A", season: realities[0].season,
    seasonViewOpen: true, preSeasonMetaSnapshot: null, simulating: null });
  await savePersistedStateToDbExecutor(db, "draftsim-store", snapshot(), { forceAllHistory: true });
  batch.mockClear();
  vi.mocked(flushPendingPersistWrites).mockReset().mockImplementation(() =>
    savePersistedStateToDbExecutor(db, "draftsim-store", snapshot()));
});

it("leaving a reality commits once without rewriting dormant realities or unchanged history", async () => {
  await useDraftStore.getState().exitSeasonView();
  expect(batch).toHaveBeenCalledTimes(1);
  const statements = batch.mock.calls[0][0] as Array<{ query: string; bindValues: unknown[] }>;
  expect(statements.some(s => s.query.includes("global_state"))).toBe(true);
  expect(statements.filter(s => s.query.includes("INSERT INTO realities")).map(s => s.bindValues[0])).toEqual(["A"]);
  expect(statements.some(s => s.query.includes("reality_history"))).toBe(false);
  expect(getDesktopOperationPhase()).toBe("idle");
});

it("keeps the exit overlay until the transaction settles and releases it on failure", async () => {
  let reject!: (error: Error) => void;
  batch.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
  const leaving = useDraftStore.getState().exitSeasonView();
  const failed = expect(leaving).rejects.toThrow("disk full");
  await vi.waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
  expect(getDesktopOperationPhase()).toBe("leaving-season");
  reject(new Error("disk full"));
  await failed;
  expect(getDesktopOperationPhase()).toBe("idle");
  expect(useDraftStore.getState().season?.franchise?.id).toBe("A");
  batch.mockResolvedValue(undefined);
  await useDraftStore.getState().exitSeasonView();
  expect(getDesktopOperationPhase()).toBe("idle");
});
