"use client";

import { lazy, Suspense, useState } from "react";
import { IconChartBar, IconChevronDown } from "@tabler/icons-react";
import RosterOutlookLoading from "./RosterOutlookLoading";

const RosterOutlookContent = lazy(() => import("./RosterOutlookContent"));

/** A closed panel loads neither the table nor its worker and subscribes to no state. */
export default function RosterOutlookPanel() {
  const [open, setOpen] = useState(false);
  return <section aria-label="Roster outlook" className="mb-8">
    <button type="button" aria-expanded={open} aria-controls="roster-outlook-content" onClick={() => setOpen(value => !value)}
      className={`flex w-full items-center gap-2.5 border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold ${open ? "border-rift-gold/40 bg-rift-gold/[0.06] text-rift-goldbright" : "border-rift-line/50 bg-rift-bg/40 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"}`}>
      <IconChartBar size={15} className="text-rift-gold" aria-hidden="true" />
      <span className="font-display text-[10px] uppercase tracking-[0.25em]">Roster outlook</span>
      <span className="ml-auto hidden text-[10px] text-rift-mutedbright sm:inline">Next window probabilities</span>
      <IconChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden="true" />
    </button>
    {open && <div id="roster-outlook-content" className="border border-t-0 border-rift-line/40 bg-rift-bg/20">
      <Suspense fallback={<div className="p-3"><RosterOutlookLoading message="Opening roster outlook" /></div>}><RosterOutlookContent /></Suspense>
    </div>}
  </section>;
}
