import { reportPersistenceError } from "./persistenceStatus";

/** localStorage.setItem is atomic: preserve the previous save if the new one fails. */
export function createQuotaSafeStorage(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  return {
    getItem: (key: string) => storage.getItem(key),
    setItem(key: string, value: string): void {
      try {
        storage.setItem(key, value);
        reportPersistenceError(null, "localStorage");
      } catch (error) {
        reportPersistenceError("Your latest changes could not be saved. Your previous save is preserved. Free storage space and retry, or export your current game before closing.", "localStorage");
        throw error;
      }
    },
    removeItem: (key: string) => storage.removeItem(key),
  };
}

export function browserSaveStorage() {
  if (typeof window === "undefined") return undefined;
  // Access can itself throw in browsers with storage disabled.
  return createQuotaSafeStorage({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  });
}
