"use client";

import type { DesktopOperationPhase } from "@/lib/desktopStorage";
import AppLifecycleShell from "./AppLifecycleShell";

type Props = {
  phase: Exclude<DesktopOperationPhase, "idle">;
};

const COPY: Record<
  Exclude<DesktopOperationPhase, "idle">,
  { ornament: string; message: string; aria: string }
> = {
  "deleting-reality": {
    ornament: "Removing reality",
    message: "Deleting reality…",
    aria: "Deleting reality from DraftSim",
  },
  "compacting-database": {
    ornament: "Compacting database",
    message: "Re-compressing realities and reclaiming disk space…",
    aria: "Compacting DraftSim database",
  },
  "importing-reality": {
    ornament: "Importing reality",
    message: "Importing reality into the database… Please keep the app open.",
    aria: "Importing reality into DraftSim database",
  },
  "opening-reality": {
    ornament: "Opening reality",
    message: "Loading franchise…",
    aria: "Opening reality",
  },
  "leaving-season": {
    ornament: "Saving progress",
    message: "Saving reality and returning to menu… Please wait.",
    aria: "Saving reality before leaving season",
  },
};

/** Full-screen overlay while desktop delete, import, open, or VACUUM runs. */
export default function AppDesktopOperationOverlay({ phase }: Props) {
  const copy = COPY[phase];

  return (
    <AppLifecycleShell
      overlay
      ornament={copy.ornament}
      message={copy.message}
      aria-label={copy.aria}
    />
  );
}
