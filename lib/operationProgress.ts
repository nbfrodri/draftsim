export type OperationKind = "review" | "delete" | "restore" | "backup" | "compact" | "import" | "open" | "leave";
const backupSteps = [
  ["prepare", "Save current changes", "Finish pending saves before making the copy."],
  ["snapshot", "Create backup", "Copy all saved data into a recovery file."],
  ["verify", "Verify the new backup", "Check the copy before relying on it."],
  ["retention", "Organize backup history", "Keep recent, daily and weekly recovery points."],
  ["external", "Finish backup copies", "Complete the external copy if a folder is configured."],
] as const;
export const OPERATIONS = {
  review: { title: "Preparing reality import", description: "Read and check the archive before showing the import review.", steps: [
    ["prepare", "Read the archive", "Read the chosen file or pasted share code."],
    ["decode", "Decode shared data", "Unpack the reality archive if needed."],
    ["validate", "Validate the reality", "Check seasons, history and compatibility."],
    ["summary", "Build the import preview", "Summarize the archive and check for an existing reality."]] },
  delete: { title: "Deleting reality", description: "Protect your saved data, then remove the selected reality and its history.", steps: [...backupSteps,
    ["delete", "Remove the reality", "Delete only the selected reality and its archived seasons."],
    ["save", "Save the updated list", "Finish saving before returning to your realities."]] },
  backup: { title: "Creating backup", description: "Create a checked recovery point for your saved data.", steps: [...backupSteps] },
  restore: { title: "Restoring backup", description: "Recover all saved data while keeping the current version separately.", steps: [
    ["prepare", "Prepare recovery", "Finish pending work and protect the current save."],
    ["validate", "Check the selected backup", "Verify compatibility and integrity."],
    ["stage", "Prepare the recovery file", "Copy and verify the data to restore."],
    ["protect", "Preserve current data", "Keep the original save before replacing it."],
    ["replace", "Restore saved data", "Install the selected recovery point."],
    ["reopen", "Open restored data", "Reconnect to the restored save."],
    ["cleanup", "Clean up older safety copies", "Keep the latest pre-restore save and remove older originals."],
    ["reload", "Return to DraftSim", "Reload the app with your recovered data."]] },
  compact: { title: "Optimizing storage", description: "Reclaim unused space while preserving saved realities.", steps: [
    ["prepare", "Measure current storage", "Check the database before maintenance."],
    ["encode", "Optimize saved realities", "Re-encode saved seasons to reduce their footprint."],
    ["vacuum", "Reclaim disk space", "Finish pending database changes and compact the file."],
    ["measure", "Check the result", "Measure the space reclaimed."]] },
  import: { title: "Importing reality", description: "Check the archive and bring its reality and history into DraftSim.", steps: [
    ["prepare", "Check the archive", "Validate the selected reality export."],
    ["protect", "Protect existing data", "Create a backup if this replaces an existing reality."],
    ["decode", "Prepare the reality", "Load its seasons, teams and history."],
    ["save", "Save imported data", "Finish writing before opening the result."]] },
  open: { title: "Opening reality", description: "Load the selected reality and prepare its history.", steps: [
    ["prepare", "Prepare the selected reality", "Check which reality to open."],
    ["history", "Load season history", "Read archived seasons for the selected reality."],
    ["open", "Save and open the season", "Finish pending saves and open the selected reality."]] },
  leave: { title: "Saving progress", description: "Keep your latest season progress before returning to the menu.", steps: [
    ["prepare", "Prepare the current season", "Capture the latest state of your reality."],
    ["save", "Save your progress", "Finish saving changes before returning to the menu."]] },
} as const;
export interface OperationProgress {
  id: number; kind: OperationKind; startedAt: number; stepStartedAt: number; index: number;
  durations: number[]; previous: number[] | null;
}
let current: OperationProgress | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const historyKey = () => `draftsim-operation-times-v1-${typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "desktop" : "web"}`;
function readHistory(): Partial<Record<OperationKind, number[]>> {
  try { const parsed = JSON.parse(localStorage.getItem(historyKey()) ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
function publish(value: OperationProgress | null) { current = value; listeners.forEach(listener => listener()); }
export const getOperationProgress = () => current;
export const getServerOperationProgress = () => null;
export const subscribeOperationProgress = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function beginOperationProgress(kind: OperationKind): number {
  const now = Date.now(), previous = readHistory()[kind];
  const valid = Array.isArray(previous) && previous.length === OPERATIONS[kind].steps.length && previous.every(n => Number.isFinite(n) && n >= 0 && n < 7 * 86400000);
  const id = ++sequence;
  publish({ id, kind, startedAt: now, stepStartedAt: now, index: 0, durations: [], previous: valid ? previous : null });
  return id;
}
/** Ignore late native messages from an older invocation or a completed stage. */
export function advanceOperationProgress(step: string, id = current?.id): void {
  if (!current || current.id !== id) return;
  const index = OPERATIONS[current.kind].steps.findIndex(item => item[0] === step);
  if (index <= current.index) return;
  const now = Date.now(), durations = [...current.durations];
  durations[current.index] = Math.max(0, now - current.stepStartedAt);
  for (let skipped = current.index + 1; skipped < index; skipped++) durations[skipped] = 0;
  publish({ ...current, index, stepStartedAt: now, durations });
}
/** Only completed operations train the estimate; failures must not shorten it. */
export function recordOperationSuccess(): void {
  if (!current) return;
  const durations = [...current.durations];
  durations[current.index] = Math.max(0, Date.now() - current.stepStartedAt);
  if (durations.length !== OPERATIONS[current.kind].steps.length) return;
  const history = readHistory();
  const known: Partial<Record<OperationKind, number[]>> = {};
  for (const kind of Object.keys(OPERATIONS) as OperationKind[]) if (Array.isArray(history[kind])) known[kind] = history[kind];
  known[current.kind] = durations;
  try { localStorage.setItem(historyKey(), JSON.stringify(known)); } catch { /* Timing is optional, never part of save durability. */ }
}
export function clearOperationProgress(): void { publish(null); }
export function estimatedRemainingMs(progress: OperationProgress, now: number): number | null {
  if (!progress.previous) return null;
  const currentExpected = progress.previous[progress.index];
  const spent = Math.max(0, now - progress.stepStartedAt);
  if (spent >= currentExpected) return null;
  return currentExpected - spent + progress.previous.slice(progress.index + 1).reduce((sum, value) => sum + value, 0);
}
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
