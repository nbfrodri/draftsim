import { beforeEach, expect, it, vi } from "vitest";
import { makeAuditSeason } from "./auditFixtures";
vi.mock("./backups", () => ({ backupBeforeDestructiveChange: vi.fn() }));
vi.mock("./desktopStorage", async original => ({
  ...await original<typeof import("./desktopStorage")>(),
  isDesktop: () => true,
  flushPendingPersistWrites: vi.fn().mockResolvedValue(undefined),
  waitForDesktopOverlayPaint: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./desktopSqlite", async original => ({
  ...await original<typeof import("./desktopSqlite")>(),
  deleteRealityFromDb: vi.fn().mockResolvedValue(undefined),
}));
import { backupBeforeDestructiveChange } from "./backups";
import { deleteRealityFromDb } from "./desktopSqlite";
import { flushPendingPersistWrites, getDesktopOperationPhase, isDesktopOperationBlocking, resetDesktopOperationPhaseForTests } from "./desktopStorage";
import { useDraftStore } from "../store/draftStore";
beforeEach(() => {
  vi.clearAllMocks();
  resetDesktopOperationPhaseForTests();
  vi.mocked(backupBeforeDestructiveChange).mockReset();
  vi.mocked(deleteRealityFromDb).mockResolvedValue(undefined);
  const season = makeAuditSeason("Delete");
  useDraftStore.setState({ simulating: null, activeRealityId: "Delete", season,
    realities: [{ id: "Delete", name: "Delete", year: 1, season, history: [] }] });
});
it("blocks close and duplicate deletion throughout backup and database deletion", async () => {
  let finishBackup!: () => void;
  let finishDelete!: () => void;
  vi.mocked(backupBeforeDestructiveChange).mockReturnValue(new Promise(resolve => { finishBackup = resolve; }));
  vi.mocked(deleteRealityFromDb).mockReturnValue(new Promise(resolve => { finishDelete = resolve; }));
  const deletion = useDraftStore.getState().deleteReality("Delete");
  expect(isDesktopOperationBlocking()).toBe(true);
  expect(getDesktopOperationPhase()).toBe("backing-up-reality");
  await vi.waitFor(() => expect(backupBeforeDestructiveChange).toHaveBeenCalledOnce());
  expect(useDraftStore.getState().realities).toHaveLength(1);
  expect(deleteRealityFromDb).not.toHaveBeenCalled();
  await expect(useDraftStore.getState().deleteReality("Delete")).rejects.toThrow("current operation");
  finishBackup();
  await vi.waitFor(() => expect(deleteRealityFromDb).toHaveBeenCalledWith("Delete"));
  expect(getDesktopOperationPhase()).toBe("deleting-reality");
  expect(useDraftStore.getState().realities).toHaveLength(1);
  expect(isDesktopOperationBlocking()).toBe(true);
  finishDelete();
  await deletion;
  expect(flushPendingPersistWrites).toHaveBeenCalledOnce();
  expect(isDesktopOperationBlocking()).toBe(false);
  expect(useDraftStore.getState().realities).toEqual([]);
  expect(useDraftStore.getState().activeRealityId).toBeNull();
});
it("unlocks on backup failure and leaves the reality intact for retry", async () => {
  vi.mocked(backupBeforeDestructiveChange).mockRejectedValue(new Error("External drive unavailable"));
  await expect(useDraftStore.getState().deleteReality("Delete")).rejects.toThrow("External drive unavailable");
  expect(isDesktopOperationBlocking()).toBe(false);
  expect(useDraftStore.getState().realities).toHaveLength(1);
  expect(deleteRealityFromDb).not.toHaveBeenCalled();
});
it("surfaces database failures and releases the operation lock", async () => {
  vi.mocked(backupBeforeDestructiveChange).mockResolvedValue(undefined);
  vi.mocked(deleteRealityFromDb).mockRejectedValue(new Error("Database locked"));
  await expect(useDraftStore.getState().deleteReality("Delete")).rejects.toThrow("Database locked");
  expect(useDraftStore.getState().realities).toHaveLength(1);
  expect(isDesktopOperationBlocking()).toBe(false);
});
