"use client";

import { getBulkBreadcrumbContext, readBulkBreadcrumbLog, recordBulkBreadcrumb, unexpectedBulkEnd } from "@/lib/bulkBreadcrumbs";
import { isDesktop } from "@/lib/desktopStorage";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useState } from "react";

/** Desktop only: reports a bulk simulation whose native breadcrumb log never reached a clean end. */
export default function BulkCrashNotice() {
  const [notice, setNotice] = useState<{ message: string; log: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void readBulkBreadcrumbLog().then(log => {
      const end = unexpectedBulkEnd(log);
      if (!cancelled && end) setNotice({ message: end.message, log });
    });
    return () => { cancelled = true; };
  }, []);
  if (!notice) return null;

  const dismiss = () => {
    setNotice(null);
    // A run started since launch already wrote newer breadcrumbs.
    if (!getBulkBreadcrumbContext()) void recordBulkBreadcrumb({ stage: "acknowledged" });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(notice.log);
      setStatus("Log copied.");
    } catch {
      setStatus("Could not copy the log. It is saved as logs/bulk-diagnostics.log in the DraftSim app data folder.");
    }
  };
  const button = "min-h-9 border px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.15em]";
  return <aside aria-label="Previous session" className="fixed left-4 right-4 top-4 z-[70] mx-auto max-w-xl border border-rift-gold/40 bg-rift-paneldark p-4 shadow-2xl">
    <div role="alert">
      <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-rift-gold"><IconAlertTriangle aria-hidden="true" size={15} />Previous session</p>
      <p className="mt-2 text-sm leading-relaxed text-rift-goldbright">{notice.message}</p>
      <p className="mt-1 text-xs leading-relaxed text-rift-mutedbright">Completed years were saved at each checkpoint. Copy the log to report the problem; it contains only stages, years, ids and sizes.</p>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={`btn-gold ${button}`} onClick={() => void copy()}>Copy log</button>
      <button type="button" className={`${button} border-rift-line text-rift-mutedbright hover:border-rift-gold/60 hover:text-rift-goldbright`} onClick={dismiss}>Dismiss</button>
    </div>
    {status && <p role="status" className="mt-2 text-xs text-rift-mutedbright">{status}</p>}
  </aside>;
}
