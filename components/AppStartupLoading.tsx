"use client";

import { useEffect } from "react";
import { forcePersistReady } from "@/lib/desktopStorage";
import AppLifecycleShell from "./AppLifecycleShell";

/** Last-resort unlock if async hydrate never settles (corrupt DB, hung I/O). */
const HYDRATE_TIMEOUT_MS = 45_000;

/**
 * Full-screen branded shell shown while Zustand persist rehydrates (SQLite /
 * localStorage). Matches the entry menu typography so the first paint is not
 * an empty frame or a flash of the wrong screen.
 */
export default function AppStartupLoading() {
  useEffect(() => {
    const timer = setTimeout(() => forcePersistReady(), HYDRATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AppLifecycleShell
      ornament="Restoring your saves"
      message="Loading…"
      aria-label="Loading DraftSim"
    />
  );
}
