import {
  isDesktop,
  pickSavePathNative,
  saveFileNative,
  textContentBlob,
  writeTextFileAtPathNative,
  type TextContent,
} from "@/lib/desktopStorage";
import { joinDeferredEventRecords } from "@/lib/eventRecordsAccess";
import type { SeasonHistoryEntry } from "@/lib/season/history";

/**
 * A reality export as ordered JSON text parts, byte-identical to
 * JSON.stringify({ kind, version, reality: { id, name, year, season, history } }).
 * One archived year (with its event records loaded just for it) is serialized at
 * a time, so a long reality never needs one string beyond the engine's limit.
 */
export async function* realityExportParts(reality: { id: string; name: string; year: number; season: unknown; history: readonly SeasonHistoryEntry[] }): AsyncGenerator<string> {
  yield `{"kind":"reality","version":1,"reality":{"id":${JSON.stringify(reality.id)},"name":${JSON.stringify(reality.name)},"year":${JSON.stringify(reality.year)},"season":${JSON.stringify(reality.season) ?? "null"},"history":[`;
  for (let i = 0; i < reality.history.length; i++) {
    const [entry] = await joinDeferredEventRecords([reality.history[i]!]);
    yield `${i ? "," : ""}${JSON.stringify(entry) ?? "null"}`;
  }
  yield "]}}";
}

export async function textFromParts(parts: AsyncIterable<string>): Promise<string> {
  const all: string[] = [];
  for await (const part of parts) all.push(part);
  return all.join("");
}

const REALITY_EXPORT_FILTER = {
  name: "DraftSim Reality",
  extensions: ["json"],
};

type WritableFileHandle = FileSystemFileHandle & {
  queryPermission: (descriptor: {
    mode: "readwrite";
  }) => Promise<PermissionState>;
  requestPermission: (descriptor: {
    mode: "readwrite";
  }) => Promise<PermissionState>;
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

type SaveFilePickerWindow = Window &
  typeof globalThis & {
    showSaveFilePicker: (options?: {
      suggestedName?: string;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandle>;
  };

function hasSaveFilePicker(
  win: Window & typeof globalThis,
): win is SaveFilePickerWindow {
  return "showSaveFilePicker" in win && typeof win.showSaveFilePicker === "function";
}

/** Safe filename for a reality JSON export. */
export function realityExportFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, "_").trim() || "reality";
  return `${safe}.draftsim-reality.json`;
}

/** Target chosen once at bulk-sim start; each year overwrites the same destination. */
export type RealityExportTarget =
  | { kind: "desktop"; path: string }
  | { kind: "web-handle"; handle: FileSystemFileHandle }
  | { kind: "web-download"; filename: string };

export function supportsSilentRealityExportOverwrite(): boolean {
  if (typeof window === "undefined") return false;
  if (isDesktop()) return true;
  return hasSaveFilePicker(window);
}

/** One-time save location for bulk export — dialog on desktop / File System Access on web. */
export async function pickRealityExportTarget(
  realityName: string,
): Promise<
  | { ok: true; target: RealityExportTarget }
  | { ok: false; error?: string; cancelled?: boolean }
> {
  const filename = realityExportFilename(realityName);

  if (isDesktop()) {
    const res = await pickSavePathNative({
      defaultPath: filename,
      filters: [REALITY_EXPORT_FILTER],
    });
    if (!res.ok || !res.path) {
      return {
        ok: false,
        error: res.error,
        cancelled: res.error === "cancelled",
      };
    }
    return { ok: true, target: { kind: "desktop", path: res.path } };
  }

  if (typeof window !== "undefined" && hasSaveFilePicker(window)) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: REALITY_EXPORT_FILTER.name,
            accept: { "application/json": [".json"] },
          },
        ],
      });
      return { ok: true, target: { kind: "web-handle", handle } };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { ok: false, cancelled: true, error: "cancelled" };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  return { ok: true, target: { kind: "web-download", filename } };
}

/** Overwrite export JSON at a previously chosen target (no further prompts). */
export async function writeRealityExportToTarget(
  target: RealityExportTarget,
  json: TextContent,
): Promise<{ ok: boolean; error?: string }> {
  switch (target.kind) {
    case "desktop": {
      return writeTextFileAtPathNative(target.path, json);
    }
    case "web-handle": {
      return writeRealityExportToFileHandle(target.handle, json);
    }
    case "web-download": {
      await triggerBrowserDownload(json, target.filename);
      return { ok: true };
    }
  }
}

async function writeRealityExportToFileHandle(
  handle: FileSystemFileHandle,
  json: TextContent,
): Promise<{ ok: boolean; error?: string }> {
  const writableHandle = handle as WritableFileHandle;
  try {
    const permission = await writableHandle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      const requested = await writableHandle.requestPermission({ mode: "readwrite" });
      if (requested !== "granted") {
        return { ok: false, error: "permission denied" };
      }
    }
    const writable = await writableHandle.createWritable();
    if (typeof json === "string") await writable.write(json);
    else for await (const part of json) await writable.write(part);
    await writable.close();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function triggerBrowserDownload(json: TextContent, filename: string): Promise<void> {
  const url = URL.createObjectURL(await textContentBlob(json, "application/json"));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save a reality export — native Save on desktop, browser download on web. */
export async function saveRealityExportJson(
  json: TextContent,
  realityName: string,
): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const filename = realityExportFilename(realityName);
  if (isDesktop()) {
    const res = await saveFileNative({
      defaultPath: filename,
      filters: [REALITY_EXPORT_FILTER],
      content: json,
    });
    return {
      ok: res.ok,
      error: res.error,
      cancelled: res.error === "cancelled",
    };
  }
  await triggerBrowserDownload(json, filename);
  return { ok: true };
}
