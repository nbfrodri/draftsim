"use client";

import { useEffect, useState } from "react";
import { forcePersistReady, getPersistLoadStage, isPersistReady, startupLoadStalled, subscribePersistLoadStage } from "@/lib/desktopStorage";
import AppLifecycleShell from "./AppLifecycleShell";

/**
 * Full-screen branded shell shown while Zustand persist rehydrates (SQLite /
 * localStorage). Shows the current loading step; a last-resort unlock fires only
 * when hydration stops making progress (corrupt DB, hung I/O), never during a
 * long upgrade that keeps reporting steps.
 */
export default function AppStartupLoading() {
  const [stage, setStage] = useState(getPersistLoadStage);
  useEffect(() => subscribePersistLoadStage(setStage), []);
  useEffect(() => {
    const timer = setInterval(() => {
      // A long synchronous decode may finish before React unmounts this shell.
      if (!isPersistReady() && startupLoadStalled()) { clearInterval(timer); forcePersistReady(); }
    }, 5_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AppLifecycleShell
      ornament="Restoring your saves"
      message={`${stage}…`}
      aria-label="Loading DraftSim"
    />
  );
}
