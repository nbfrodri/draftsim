"use client";

import { useDraftStore } from "@/store/draftStore";

// In-dashboard reality banner: shows which reality/year you're in and, once the
// year is finished (Worlds done), the button to roll into the next season.
// Creating, switching and deleting realities lives in the Realities hub.

export default function FranchisePanel() {
  const season = useDraftStore((s) => s.season);

  const fr = season?.franchise ?? null;
  if (!fr) return null;

  // When the year is complete the Offseason view takes over (stats + the big
  // transfer window + the Finalize button), so this is just the live banner.
  if (season?.status === "complete") return null;

  return (
    <div className="mb-8 border border-rift-blue/40 bg-rift-blue/[0.04]">
      <div className="px-3 py-1.5 border-b border-rift-blue/30 flex items-center gap-2">
        <span className="font-display text-sm tracking-wider text-rift-bluebright">
          {fr.name}
        </span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/60">
          Reality · Year {fr.year}
        </span>
        <span className="ml-auto text-[8px] uppercase tracking-[0.25em] text-rift-muted/45">
          aging {fr.aging ? "on" : "off"}
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="text-[10px] italic text-rift-muted/70">
          Play out the year — Winter → First Stand → Spring → MSI → Summer →
          Worlds — then the offseason opens.
        </div>
      </div>
    </div>
  );
}
