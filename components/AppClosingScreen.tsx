"use client";

import type { AppClosePhase } from "@/lib/desktopStorage";
import AppLifecycleShell from "./AppLifecycleShell";

type Props = {
  phase: Exclude<AppClosePhase, "idle">;
};

/** Full-screen overlay while debounced persist writes flush on desktop exit. */
export default function AppClosingScreen({ phase }: Props) {
  const saving = phase === "saving";

  return (
    <AppLifecycleShell
      overlay
      ornament={saving ? "Saving and compacting" : "Save interrupted"}
      message={
        saving
          ? "Saving and compacting…"
          : "Could not save all data — closing anyway"
      }
      status={saving ? "busy" : "error"}
      aria-label={
        saving
          ? "Saving, compacting, and closing DraftSim"
          : "Closing DraftSim after save error"
      }
    />
  );
}
