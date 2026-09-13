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
      ornament={saving ? "Saving progress" : "Save interrupted"}
      message={
        saving
          ? "Saving progress…"
          : "Could not save all data. App kept open; please retry or export your save."
      }
      status={saving ? "busy" : "error"}
      aria-label={
        saving
          ? "Saving and closing DraftSim"
          : "DraftSim kept open after save error"
      }
    />
  );
}
