import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import {
  cancelPendingWrite,
  createWebLazyStorage,
  enablePersistWrites,
  forcePersistReady,
  gatePersistWritesUntilReady,
  isPersistReady,
  onPersistReady,
  resetPersistGateForTests,
  resetAppClosePhaseForTests,
  resolveWebStringStorage,
  signalAppClosing,
  signalAppCloseError,
  getAppClosePhase,
  subscribeAppClosePhase,
  subscribePersistReady,
} from "./desktopStorage";

describe("persist write gate", () => {
  beforeEach(() => {
    resetPersistGateForTests();
    resetAppClosePhaseForTests();
  });

  it("drops setItem until enablePersistWrites", () => {
    const writes: StorageValue<{ realities: unknown[] }>[] = [];
    const inner: PersistStorage<{ realities: unknown[] }> = {
      getItem: async () => null,
      setItem: (_name, value) => {
        writes.push(value);
      },
      removeItem: async () => {},
    };
    const gated = gatePersistWritesUntilReady(inner);

    gated.setItem("draftsim-store", {
      state: { realities: [] },
      version: 6,
    });
    expect(writes).toHaveLength(0);

    enablePersistWrites();
    gated.setItem("draftsim-store", {
      state: { realities: [{ id: "r1" }] },
      version: 6,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].state.realities).toEqual([{ id: "r1" }]);
  });

  it("marks persist ready and notifies subscribers", () => {
    const spy = vi.fn();
    const unsub = onPersistReady(spy);
    expect(isPersistReady()).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    enablePersistWrites();
    expect(isPersistReady()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Late subscribers fire immediately.
    const spy2 = vi.fn();
    onPersistReady(spy2);
    expect(spy2).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("forcePersistReady unlocks gate when hydrate stalls", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isPersistReady()).toBe(false);
    forcePersistReady();
    expect(isPersistReady()).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    // Idempotent when already ready.
    forcePersistReady();
  });

  it("subscribePersistReady does not fire synchronously when already ready", () => {
    enablePersistWrites();
    const spy = vi.fn();
    const unsub = subscribePersistReady(spy);
    expect(spy).not.toHaveBeenCalled();
    unsub();
  });

  it("subscribePersistReady notifies when gate opens", () => {
    const spy = vi.fn();
    const unsub = subscribePersistReady(spy);
    expect(spy).not.toHaveBeenCalled();
    enablePersistWrites();
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("cancelPendingWrite is a safe no-op when nothing is pending", () => {
    expect(() => cancelPendingWrite("missing-key")).not.toThrow();
  });

  it("resolveWebStringStorage returns undefined without window", () => {
    expect(resolveWebStringStorage()).toBeUndefined();
    expect(resolveWebStringStorage({ getItem: () => null, setItem: () => {}, removeItem: () => {} })).toBeUndefined();
  });

  it("createWebLazyStorage getItem is safe when storage resolver returns undefined", () => {
    const storage = createWebLazyStorage(() => undefined);
    expect(storage.getItem("draftsim-store")).toBeNull();
  });

  it("tolerates undefined storage (SSR createJSONStorage miss)", async () => {
    const gated = gatePersistWritesUntilReady(undefined);
    expect(gated.getItem("draftsim-store")).toBeNull();
    expect(() =>
      gated.setItem("draftsim-store", { state: {}, version: 6 }),
    ).not.toThrow();
    enablePersistWrites();
    expect(() =>
      gated.setItem("draftsim-store", { state: {}, version: 6 }),
    ).not.toThrow();
    await expect(
      Promise.resolve(gated.removeItem("draftsim-store")),
    ).resolves.toBeUndefined();
  });
});

describe("app close lifecycle", () => {
  beforeEach(() => {
    resetAppClosePhaseForTests();
  });

  it("signals saving and error phases to subscribers", () => {
    const spy = vi.fn();
    const unsub = subscribeAppClosePhase(spy);
    expect(getAppClosePhase()).toBe("idle");
    expect(spy).not.toHaveBeenCalled();

    signalAppClosing();
    expect(getAppClosePhase()).toBe("saving");
    expect(spy).toHaveBeenCalledTimes(1);

    signalAppCloseError();
    expect(getAppClosePhase()).toBe("error");
    expect(spy).toHaveBeenCalledTimes(2);

    unsub();
  });
});
