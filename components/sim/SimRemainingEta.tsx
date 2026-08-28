"use client";

import { useEffect, useState } from "react";
import { estimateRemainingMs, formatRemainingDuration } from "@/lib/sim/simEta";

/** Live-updating ETA label for bulk sim overlays and inline progress. */
export default function SimRemainingEta({
  startedAt,
  completed,
  total,
  className,
}: {
  startedAt: number | null | undefined;
  completed: number;
  total: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || completed <= 0 || total <= completed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, completed, total]);

  if (!startedAt || completed <= 0) return null;

  const remainingMs = estimateRemainingMs(now - startedAt, completed, total);
  if (remainingMs == null) return null;

  return <span className={className}>{formatRemainingDuration(remainingMs)}</span>;
}
