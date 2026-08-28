/** Linear ETA from elapsed time and completed units (years or matches). */
export function estimateRemainingMs(
  elapsedMs: number,
  completed: number,
  total: number,
): number | null {
  if (completed <= 0 || total <= completed || elapsedMs <= 0) return null;
  const remaining = total - completed;
  return (elapsedMs / completed) * remaining;
}

/** Human-readable remaining time, e.g. "~3 min remaining". */
export function formatRemainingDuration(ms: number): string {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `~${sec}s remaining`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `~${min} min remaining`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  if (remMin === 0) return `~${hours} hr remaining`;
  return `~${hours} hr ${remMin} min remaining`;
}

/** Human-readable elapsed time, e.g. "2m 15s elapsed". */
export function formatElapsedDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s elapsed`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) {
    return remSec > 0 ? `${min}m ${remSec}s elapsed` : `${min}m elapsed`;
  }
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  if (remMin === 0) return `${hours}h elapsed`;
  return `${hours}h ${remMin}m elapsed`;
}
