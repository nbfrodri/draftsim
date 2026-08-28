import {
  isDesktop,
  pickSavePathNative,
  saveFileNative,
  writeTextFileAtPathNative,
} from "@/lib/desktopStorage";

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
  json: string,
): Promise<{ ok: boolean; error?: string }> {
  switch (target.kind) {
    case "desktop": {
      return writeTextFileAtPathNative(target.path, json);
    }
    case "web-handle": {
      return writeRealityExportToFileHandle(target.handle, json);
    }
    case "web-download": {
      triggerBrowserDownload(json, target.filename);
      return { ok: true };
    }
  }
}

async function writeRealityExportToFileHandle(
  handle: FileSystemFileHandle,
  json: string,
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
    await writable.write(json);
    await writable.close();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function triggerBrowserDownload(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save a reality export — native Save on desktop, browser download on web. */
export async function saveRealityExportJson(
  json: string,
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
  triggerBrowserDownload(json, filename);
  return { ok: true };
}
