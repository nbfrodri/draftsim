import { useDraftStore } from "@/store/draftStore";
import { flushPendingPersistWrites, isDesktop } from "./desktopStorage";
import { isRealityHistoryLoaded, loadRealityHistoryFromDb, markRealityHistoryLoaded } from "./desktopSqlite";

type Reality = ReturnType<typeof useDraftStore.getState>["realities"][number];
const pending = new Map<string, { target: Reality; promise: ReturnType<typeof readHistory> }>();
async function readHistory(id: string, initial: Reality) {
  await flushPendingPersistWrites();
  // HMR may reset module-local loaded flags while Zustand still has full data.
  // Never replace those years with an empty or older database snapshot.
  if (initial.history.length > 0) return initial.history;
  const history = await loadRealityHistoryFromDb(id);
  await flushPendingPersistWrites();
  return history;
}

/** Install complete history for all Hall tabs without opening or activating a reality. */
export async function loadHallRealityHistory(id: string, isCurrent: () => boolean = () => true): Promise<void> {
  if (!isDesktop() || isRealityHistoryLoaded(id)) return;
  const initial = useDraftStore.getState().realities.find(r => r.id === id);
  if (!initial) return;
  let request = pending.get(id);
  if (!request || request.target !== initial) {
    request = { target: initial, promise: readHistory(id, initial) };
    pending.set(id, request);
  }
  let history;
  try { history = await request.promise; }
  finally { if (pending.get(id) === request) pending.delete(id); }
  if (!isCurrent()) return;
  const current = useDraftStore.getState();
  if (current.realities.find(r => r.id === id) !== initial) return;
  markRealityHistoryLoaded(id, history);
  useDraftStore.setState({ realities: current.realities.map(r => r.id === id ? { ...r, history } : r) });
}
