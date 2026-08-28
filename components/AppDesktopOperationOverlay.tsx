"use client";

import type { DesktopOperationPhase } from "@/lib/desktopStorage";
import AppLifecycleShell from "./AppLifecycleShell";

type Props = {
  phase: Exclude<DesktopOperationPhase, "idle">;
};

/** Full-screen overlay while desktop delete or VACUUM runs. */
export default function AppDesktopOperationOverlay({ phase }: Props) {
  const deleting = phase === "deleting-reality";

  return (
    <AppLifecycleShell
      overlay
      ornament={deleting ? "Removing reality" : "Compacting database"}
      message={deleting ? "Deleting reality…" : "Reclaiming disk space…"}
      aria-label={
        deleting
          ? "Deleting reality from DraftSim"
          : "Compacting DraftSim database"
      }
    />
  );
}
