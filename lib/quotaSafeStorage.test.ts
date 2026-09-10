import { expect, it, vi } from "vitest";
import { createQuotaSafeStorage } from "./quotaSafeStorage";
import { getPersistenceError } from "./persistenceStatus";
it("preserves the previous save and reports an error when a new save exceeds quota", () => {
  const storage = { getItem: () => "previous valid save", setItem: vi.fn(() => { throw new DOMException("Full", "QuotaExceededError"); }), removeItem: vi.fn() };
  const safe = createQuotaSafeStorage(storage);
  expect(() => safe.setItem("draftsim-store", "new save")).toThrow();
  expect(safe.getItem("draftsim-store")).toBe("previous valid save");
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(getPersistenceError()).toContain("previous save");
  storage.setItem.mockImplementation(() => {});
  safe.setItem("draftsim-store", "new save");
  expect(getPersistenceError()).toBeNull();
});
