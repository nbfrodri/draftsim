/**
 * desktopStorage.ts — Zustand-persist-compatible StateStorage backed by
 * APPDATA files (via @tauri-apps/plugin-fs).
 *
 * All Tauri imports are dynamic so this module is safe to import during
 * Next.js SSG/prerender (Node environment, no `window`). No Tauri symbol
 * is evaluated at module scope.
 *
 * Design notes:
 *  - isDesktop() returns false in SSR/Node and in a browser that doesn't
 *    have the __TAURI_INTERNALS__ global injected by Tauri's webview.
 *  - getItem / setItem / removeItem all return Promises — Zustand's
 *    createJSONStorage accepts async StateStorage since v4.
 *  - Writes are debounced 500ms (trailing) to avoid hammering disk on
 *    every Zustand state change. A `pendingFlush` map holds the resolve
 *    callbacks so the debounce can be flushed synchronously on window
 *    beforeunload (best-effort; Tauri close events may not fire the
 *    beforeunload listener on all platforms, so we also fire the flush
 *    eagerly from the debounce itself when the timer triggers).
 *  - Atomic writes: we attempt write-to-.tmp then rename. If rename is
 *    unavailable we fall back to a direct write (acceptable — the window
 *    for corruption is tiny on desktop).
 */

import type { PersistStorage, StorageValue } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** True only inside a Tauri webview (not SSR, not a plain browser). */
export function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  // __TAURI_INTERNALS__ is injected by Tauri into its embedded webview.
  return "__TAURI_INTERNALS__" in window;
}

// ---------------------------------------------------------------------------
// Persist write gate — blocks empty-state overwrites during async hydrate
// ---------------------------------------------------------------------------
//
// Zustand's persist middleware calls setItem on EVERY set(), including while
// async getItem is still in flight. DraftApp's mount effect calls
// setChampions() before the AppData file has been read, which would schedule
// a debounced write of the empty initial state and wipe realities / season
// history on disk. Writes stay disabled until enablePersistWrites() runs from
// onRehydrateStorage (success or failure).

let persistWritesEnabled = false;
let persistReady = false;
const persistReadyListeners = new Set<() => void>();

/** Allow Zustand persist setItem calls (call once rehydration finishes). */
export function enablePersistWrites(): void {
  persistWritesEnabled = true;
  if (!persistReady) {
    persistReady = true;
    for (const cb of persistReadyListeners) cb();
  }
}

/** True after enablePersistWrites — UI should wait for this before empty states. */
export function isPersistReady(): boolean {
  return persistReady;
}

/** Subscribe to persist-ready. Fires immediately if already ready. */
export function onPersistReady(cb: () => void): () => void {
  if (persistReady) {
    cb();
    return () => {};
  }
  persistReadyListeners.add(cb);
  return () => {
    persistReadyListeners.delete(cb);
  };
}

/**
 * Subscribe for useSyncExternalStore — never calls the listener
 * synchronously (getSnapshot / getServerSnapshot cover the current value).
 */
export function subscribePersistReady(onStoreChange: () => void): () => void {
  persistReadyListeners.add(onStoreChange);
  return () => {
    persistReadyListeners.delete(onStoreChange);
  };
}

/** @internal — test helper to reset gate between cases. */
export function resetPersistGateForTests(): void {
  persistWritesEnabled = false;
  persistReady = false;
  persistReadyListeners.clear();
}

/** SSR / no-localStorage fallback — getItem resolves empty, writes no-op. */
const noopPersistStorage: PersistStorage<unknown> = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Wrap any Zustand PersistStorage so setItem is a no-op until
 * enablePersistWrites(). getItem/removeItem pass through unchanged.
 *
 * `storage` may be undefined: createJSONStorage returns undefined when its
 * factory throws (Node SSR has no localStorage). Passing that through raw
 * used to skip hydrate entirely; wrapping undefined used to crash on
 * getItem. A noop fallback lets rehydration finish so enablePersistWrites
 * still unlocks the UI gate.
 */
export function gatePersistWritesUntilReady<S>(
  storage: PersistStorage<S> | undefined,
): PersistStorage<S> {
  const inner = storage ?? (noopPersistStorage as PersistStorage<S>);
  return {
    getItem: (name) => inner.getItem(name),
    setItem: (name, value) => {
      if (!persistWritesEnabled) return;
      return inner.setItem(name, value);
    },
    removeItem: (name) => inner.removeItem(name),
  };
}

// ---------------------------------------------------------------------------
// Internal write helpers — all async, all dynamic-import Tauri
// ---------------------------------------------------------------------------

type BaseDirectory = import("@tauri-apps/plugin-fs").BaseDirectory;

async function fsModule() {
  return import("@tauri-apps/plugin-fs");
}

/** Resolve the BaseDirectory.AppData constant dynamically. */
async function appDataDir(): Promise<BaseDirectory> {
  const { BaseDirectory } = await fsModule();
  return BaseDirectory.AppData;
}

/** Resolve the filesystem path for a given store key. */
function keyToFilename(key: string): string {
  // Sanitize key so it is safe as a filename (replace any slashes / colons).
  const safe = key.replace(/[/\\:*?"<>|]/g, "_");
  return `${safe}.json`;
}

/** Ensure the AppData directory exists (mkdir -p equivalent). */
async function ensureAppDataDir(): Promise<void> {
  const { mkdir, BaseDirectory, exists } = await fsModule();
  const base = BaseDirectory.AppData;
  try {
    const dirExists = await exists(".", { baseDir: base });
    if (!dirExists) {
      await mkdir(".", { baseDir: base, recursive: true });
    }
  } catch {
    // exists() or mkdir() may throw if the dir is already there on some
    // platforms — treat any error here as "dir exists, continue".
  }
}

// ---------------------------------------------------------------------------
// Debounce infrastructure
// ---------------------------------------------------------------------------

interface PendingWrite {
  /**
   * Lazy producer of the serialized payload. JSON.stringify is deferred to
   * the moment the debounced write actually fires (or is flushed), so rapid
   * set() bursts — e.g. bulk tournament simulation — never pay per-set
   * serialization cost: superseded writes are cancelled before their thunk
   * ever runs. For plain string writes the thunk just returns the string.
   */
  serialize: () => string;
  /** Where the serialized string lands (AppData file or localStorage). */
  flush: (key: string, value: string) => void | Promise<void>;
  timer: ReturnType<typeof setTimeout>;
}

const pendingWrites = new Map<string, PendingWrite>();
const DEBOUNCE_MS = 500;

/** Cancel a debounced write for `key` without flushing it. */
export function cancelPendingWrite(key: string): void {
  const pending = pendingWrites.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingWrites.delete(key);
}

/** Execute a write immediately (bypassing debounce). */
async function executeWrite(key: string, value: string): Promise<void> {
  const { writeTextFile, rename, BaseDirectory, exists } = await fsModule();
  const base = BaseDirectory.AppData;
  const filename = keyToFilename(key);
  const tmpFilename = `${filename}.tmp`;

  await ensureAppDataDir();

  try {
    // Attempt atomic write: write to .tmp then rename over the target.
    await writeTextFile(tmpFilename, value, { baseDir: base });
    try {
      // Check if target exists first; rename always overwrites on most OSes.
      await rename(tmpFilename, filename, {
        oldPathBaseDir: base,
        newPathBaseDir: base,
      });
    } catch {
      // rename failed (edge case on some fs) — direct write as fallback.
      await writeTextFile(filename, value, { baseDir: base });
      // Best-effort cleanup of tmp.
      try {
        const { remove } = await fsModule();
        await remove(tmpFilename, { baseDir: base });
      } catch {
        // ignore
      }
    }
  } catch {
    // Atomic path entirely unavailable — fall back to direct write.
    try {
      await writeTextFile(filename, value, { baseDir: base });
    } catch (err) {
      console.warn("[desktopStorage] write failed for key:", key, err);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = exists; // imported for side-effect in ensureAppDataDir
}

/** Schedule a debounced write; cancels any pending write for the same key.
 *  `serialize` runs lazily when the write actually fires — not at schedule
 *  time — so superseded writes cost nothing. */
function scheduleWrite(
  key: string,
  serialize: () => string,
  flush: (k: string, value: string) => void | Promise<void> = executeWrite,
): void {
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingWrites.delete(key);
    let value: string;
    try {
      value = serialize();
    } catch (err) {
      console.warn("[desktopStorage] serialization failed for key:", key, err);
      return;
    }
    void Promise.resolve(flush(key, value)).catch((err) => {
      console.warn("[desktopStorage] debounced write failed:", key, err);
    });
  }, DEBOUNCE_MS);

  pendingWrites.set(key, { serialize, flush, timer });
}

/**
 * Flush all pending (debounced) writes immediately.
 * Called on beforeunload — best-effort since the promise may not resolve
 * before the window closes, but it at least cancels the timer so we don't
 * write to a half-closed app.
 */
/** Flush all debounced persist writes immediately (e.g. after a year boundary). */
export async function flushPendingPersistWrites(): Promise<void> {
  const { flushPendingSqliteWrites } = await import("./desktopSqliteStorage");
  await flushPendingSqliteWrites();
  await flushPendingWrites();
}

async function flushPendingWrites(): Promise<void> {
  const entries = [...pendingWrites.entries()];
  for (const [key, pending] of entries) {
    clearTimeout(pending.timer);
    pendingWrites.delete(key);
    // Stringify NOW (the deferred serialization must happen at flush time)
    // then write. Errors are ignored — we're shutting down.
    try {
      const value = pending.serialize();
      await Promise.resolve(pending.flush(key, value));
    } catch {
      // Ignore flush errors.
    }
  }
}

/** Best-effort flush when the page is going away (can't await in sync handlers). */
function schedulePersistFlushOnExit(): void {
  void flushPendingPersistWrites();
}

/** Web-only exit flush (localStorage debounce — no SQLite on web). */
function scheduleWebPersistFlushOnExit(): void {
  void flushPendingWrites();
}

/** Register Tauri close handler: veto close, flush SQLite + files, then destroy. */
async function registerTauriCloseFlushHandler(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { hasPendingSqliteWrites } = await import("./desktopSqliteStorage");
  const appWindow = getCurrentWindow();
  await appWindow.onCloseRequested(async (event) => {
    if (pendingWrites.size === 0 && !hasPendingSqliteWrites()) return;
    event.preventDefault();
    try {
      await flushPendingPersistWrites();
    } catch {
      // Ignore — we're shutting down regardless.
    } finally {
      // destroy() force-closes WITHOUT re-emitting onCloseRequested
      // (unlike close()), so this can't loop.
      await appWindow.destroy();
    }
  });
}

// Register flush on page exit. Tauri's native ✕ does NOT reliably fire
// beforeunload, so desktop also hooks onCloseRequested (see below).
if (typeof window !== "undefined") {
  const onExit = isDesktop()
    ? schedulePersistFlushOnExit
    : scheduleWebPersistFlushOnExit;

  window.addEventListener("beforeunload", onExit);
  // pagehide is more reliable than beforeunload on mobile / bfcache navigations.
  window.addEventListener("pagehide", onExit);
  // Tab switch / minimize / app background — backup so debounced writes land.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onExit();
  });

  if (isDesktop()) {
    void registerTauriCloseFlushHandler().catch((err) => {
      console.warn(
        "[desktopStorage] could not register Tauri close handler:",
        err,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Public StateStorage implementation
// ---------------------------------------------------------------------------

export const desktopStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!isDesktop()) return null;
    try {
      const { readTextFile, BaseDirectory, exists } = await fsModule();
      const base = BaseDirectory.AppData;
      const filename = keyToFilename(key);
      const fileExists = await exists(filename, { baseDir: base });
      if (!fileExists) return null;
      return await readTextFile(filename, { baseDir: base });
    } catch (err) {
      console.warn("[desktopStorage] getItem failed for key:", key, err);
      return null;
    }
  },

  setItem(key: string, value: string): Promise<void> {
    if (!isDesktop()) return Promise.resolve();
    // Debounce the write; return immediately so Zustand isn't blocked.
    scheduleWrite(key, () => value);
    return Promise.resolve();
  },

  async removeItem(key: string): Promise<void> {
    if (!isDesktop()) return;
    // Cancel any pending write for this key.
    cancelPendingWrite(key);
    try {
      const { remove, BaseDirectory, exists } = await fsModule();
      const base = BaseDirectory.AppData;
      const filename = keyToFilename(key);
      const fileExists = await exists(filename, { baseDir: base });
      if (fileExists) {
        await remove(filename, { baseDir: base });
      }
    } catch (err) {
      console.warn("[desktopStorage] removeItem failed for key:", key, err);
    }
  },
};

// ---------------------------------------------------------------------------
// Lazy zustand PersistStorage (desktop)
// ---------------------------------------------------------------------------

/**
 * Custom zustand-v5 PersistStorage for desktop. Unlike
 * `createJSONStorage(() => desktopStorage)` — which JSON.stringifies the whole
 * persisted state synchronously on EVERY set() before handing the string to
 * the debounced file write — this storage receives the StorageValue OBJECT
 * and defers JSON.stringify into the 500ms debounced flush. Because zustand
 * state is immutable, the captured object snapshot is safe to serialize
 * later; superseded snapshots are simply dropped (their stringify never runs).
 *
 * getItem returns the parsed StorageValue object (NOT a string) — the shape
 * zustand expects from a custom PersistStorage — so the normal version-check/
 * migrate/onRehydrateStorage flow is unchanged.
 *
 * Writes are gated until enablePersistWrites() so a pre-hydration set()
 * (e.g. setChampions on mount) cannot schedule an empty-state overwrite.
 * Atomic tmp+rename writes and the beforeunload flush are inherited from the
 * shared debounce infrastructure above.
 */
export function createDesktopLazyStorage<S>(): PersistStorage<S> {
  return {
    async getItem(name: string): Promise<StorageValue<S> | null> {
      // Drop any write scheduled before we finished reading disk — those
      // snapshots were taken from the empty initial store.
      cancelPendingWrite(name);
      // Import localStorage → AppData BEFORE the first read so hydration
      // sees migrated data (must not run after rehydrate with empty state).
      await migrateWebStorageToDesktop(name);
      const raw = await desktopStorage.getItem(name);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch (err) {
        console.warn("[desktopStorage] failed to parse persisted state:", name, err);
        return null;
      }
    },
    setItem(name: string, value: StorageValue<S>): void {
      if (!persistWritesEnabled) return;
      if (!isDesktop()) return;
      // Defer serialization into the debounced write — stringify happens at
      // flush time (timer fire or beforeunload), at most once per 500ms.
      scheduleWrite(name, () => JSON.stringify(value));
    },
    removeItem(name: string): Promise<void> {
      cancelPendingWrite(name);
      return desktopStorage.removeItem(name);
    },
  };
}

// ---------------------------------------------------------------------------
// Lazy zustand PersistStorage (web / localStorage)
// ---------------------------------------------------------------------------

type StringStateStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Browser-only localStorage accessor — never touches storage during SSR. */
export function resolveWebStringStorage(
  preferred?: StringStateStorage,
): StringStateStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return preferred ?? window.localStorage;
}

/**
 * Web counterpart to createDesktopLazyStorage: receives the persisted state
 * OBJECT from zustand-persist and defers JSON.stringify + localStorage write
 * into the shared 500ms debounce. Uses the supplied storage (quotaSafeStorage
 * on web) so QuotaExceededError fallback is unchanged.
 */
export function createWebLazyStorage<S>(
  getStorage: () => StringStateStorage | undefined,
): PersistStorage<S> {
  return {
    getItem(name: string): StorageValue<S> | null {
      cancelPendingWrite(name);
      const storage = getStorage();
      if (!storage) return null;
      const raw = storage.getItem(name);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch (err) {
        console.warn("[desktopStorage] failed to parse persisted state:", name, err);
        return null;
      }
    },
    setItem(name: string, value: StorageValue<S>): void {
      if (!persistWritesEnabled) return;
      const storage = getStorage();
      if (!storage) return;
      scheduleWrite(
        name,
        () => JSON.stringify(value),
        (_key, serialized) => {
          storage.setItem(name, serialized);
        },
      );
    },
    removeItem(name: string): void {
      cancelPendingWrite(name);
      getStorage()?.removeItem(name);
    },
  };
}

// ---------------------------------------------------------------------------
// One-time migration: web localStorage → desktop file on first run
// ---------------------------------------------------------------------------

/**
 * On the very first desktop run, if the Zustand key exists in localStorage
 * (populated by a prior web-build session running in the same origin, e.g.
 * during `tauri dev`), copy it to the desktop file so the user's state
 * carries over. This is a no-op if the file already exists.
 *
 * Called from createDesktopLazyStorage.getItem BEFORE the first read so
 * hydration sees migrated data. Must not run after rehydrate with empty
 * in-memory state — a later set() could then overwrite the migrated file.
 *
 * In production the Tauri webview starts with an empty localStorage, so
 * this migration is a harmless no-op in that case too.
 */
export async function migrateWebStorageToDesktop(key: string): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { exists, BaseDirectory } = await fsModule();
    const base = BaseDirectory.AppData;
    const filename = keyToFilename(key);
    // Only migrate if the file doesn't exist yet.
    const fileExists = await exists(filename, { baseDir: base });
    if (fileExists) return;
    // Check localStorage.
    const webData =
      typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (!webData) return;
    // Write the web data to the desktop file directly (bypassing debounce,
    // since this is a one-time startup migration and we want it settled
    // before Zustand tries to read).
    await executeWrite(key, webData);
    console.info("[desktopStorage] migrated web localStorage to desktop file:", key);
  } catch (err) {
    // Migration is best-effort — if it fails, the app just starts fresh.
    console.warn("[desktopStorage] migration failed (non-fatal):", key, err);
  }
}

// ---------------------------------------------------------------------------
// Native file dialogs — re-exported for use by UI components
// ---------------------------------------------------------------------------

/**
 * Open a native Save dialog and return the chosen path (no write).
 * Returns { ok: true, path } on success, { ok: false, error } on failure/cancel.
 */
export async function pickSavePathNative(opts: {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const filePath = await save({
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    if (filePath == null) {
      return { ok: false, error: "cancelled" };
    }
    return { ok: true, path: filePath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Write text to an absolute filesystem path (desktop only, no dialog).
 */
export async function writeTextFileAtPathNative(
  path: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, content);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Open a native Save dialog and write `content` to the chosen file.
 * Returns { ok: true } on success, { ok: false, error } on failure or cancel.
 */
export async function saveFileNative(opts: {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    if (filePath == null) {
      // User cancelled.
      return { ok: false, error: "cancelled" };
    }
    await writeTextFile(filePath, opts.content);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Open a native Save dialog and write binary `content` to the chosen file.
 * Same contract as saveFileNative, but for non-text payloads (e.g. .xlsx).
 */
export async function saveBinaryFileNative(opts: {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  content: Uint8Array;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: opts.defaultPath,
      filters: opts.filters,
    });
    if (filePath == null) {
      // User cancelled.
      return { ok: false, error: "cancelled" };
    }
    await writeFile(filePath, opts.content);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Open a native Open dialog and read the chosen file(s) as binary.
 * Same contract as openFileNative, but for non-text payloads (e.g. .xlsx).
 * Always returns the selection as an array in `contents` (one entry per
 * file); pass `multiple: true` to let the user pick several at once.
 */
export async function openBinaryFileNative(opts: {
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
}): Promise<{ ok: boolean; contents?: Uint8Array[]; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");

    const result = await open({
      multiple: opts.multiple ?? false,
      filters: opts.filters,
    });
    if (result == null) {
      // User cancelled.
      return { ok: false, error: "cancelled" };
    }
    // result is a string (single file) or string[] (multiple).
    const paths = Array.isArray(result) ? result : [result];
    if (paths.length === 0) return { ok: false, error: "cancelled" };
    const contents = await Promise.all(paths.map((p) => readFile(p)));
    return { ok: true, contents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Open a native Open dialog and read the chosen file's contents.
 * Returns { ok: true, content } on success, { ok: false, error } on failure/cancel.
 */
export async function openFileNative(opts: {
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<{ ok: boolean; content?: string; error?: string }> {
  if (!isDesktop()) {
    return { ok: false, error: "Not running in desktop mode" };
  }
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const result = await open({
      multiple: false,
      filters: opts.filters,
    });
    if (result == null) {
      // User cancelled.
      return { ok: false, error: "cancelled" };
    }
    // result is a string (single file path) when multiple: false
    const filePath = typeof result === "string" ? result : result[0];
    if (!filePath) return { ok: false, error: "cancelled" };
    const content = await readTextFile(filePath);
    return { ok: true, content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
