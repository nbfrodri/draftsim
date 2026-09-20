"use client";
import { useState, useSyncExternalStore } from "react";
import { clearSaveDiagnostics, exportSaveDiagnostics, getSaveDiagnostics, getServerSaveDiagnostics, setSaveDiagnosticsEnabled, subscribeSaveDiagnostics } from "@/lib/saveDiagnostics";
import { saveFileNative } from "@/lib/desktopStorage";

export default function SaveDiagnosticsPanel({ disabled = false }: { disabled?: boolean }) {
  const snapshot = useSyncExternalStore(subscribeSaveDiagnostics, getSaveDiagnostics, getServerSaveDiagnostics);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const button = "border border-rift-line px-3 py-2 text-xs text-rift-goldbright disabled:opacity-50";
  return <details className="border border-rift-line p-4">
    <summary className="cursor-pointer text-sm text-rift-goldbright">Save performance diagnostics</summary>
    <p className="my-3 text-xs leading-relaxed">Optional measurements for this session only. Records save timings and sizes, never player names, game content or file paths. Disabling clears the measurements.</p>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={snapshot.enabled} disabled={disabled || exporting} onChange={event => { setSaveDiagnosticsEnabled(event.target.checked); setMessage(null); }} />
      Record save performance
    </label>
    <p className="my-3 text-xs">{snapshot.entries.length} / 200 measurements</p>
    <div className="flex gap-2">
      <button type="button" className={button} disabled={disabled || exporting || !snapshot.entries.length} onClick={() => { clearSaveDiagnostics(); setMessage(null); }}>Clear measurements</button>
      <button type="button" className={button} disabled={disabled || exporting || !snapshot.entries.length} onClick={async () => {
        setExporting(true); setMessage(null);
        try {
          const result = await saveFileNative({ defaultPath: "draftsim-save-diagnostics.json", filters: [{ name: "Save diagnostics", extensions: ["json"] }], content: exportSaveDiagnostics() });
          if (result.ok) setMessage("Diagnostics exported.");
          else if (result.error !== "cancelled") setMessage("Could not export diagnostics. Please retry.");
        } finally { setExporting(false); }
      }}>Export diagnostics</button>
    </div>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </details>;
}
