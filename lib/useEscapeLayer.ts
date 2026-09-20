"use client";
import { useEffect, useRef } from "react";
import { registerEscapeLayer } from "./escapeNavigation";

/** Priorities: page 0, detail 10, modal 100, popup 200, operation blocker 1000. */
export function useEscapeLayer(active: boolean, dismiss: () => void, priority = 100, restoreFocus = true) {
  const callback = useRef(dismiss);
  useEffect(() => { callback.current = dismiss; });
  useEffect(() => {
    if (!active) return;
    const trigger = document.activeElement;
    return registerEscapeLayer({ priority, dismiss: () => {
      callback.current();
      if (restoreFocus && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    } });
  }, [active, priority, restoreFocus]);
}
