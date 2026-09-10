import type { PlayerFormMap } from "@/lib/playerForm";
import type { TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import { autoPlayMatch } from "./autoPlayMatch";
import type { BulkSimWorkerRequest,BulkSimWorkerResponse } from "./bulkSim.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  {
    resolve: (v: [TournamentState, PlayerFormMap]) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function rejectAllPending(reason: string) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
  }
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    // Pre-bundled by scripts/build-bulk-sim-worker.mjs (Turbopack static export
    // cannot bundle Worker entry points with relative imports).
    worker = new Worker("/workers/bulkSim.worker.js");
    worker.onmessage = (event: MessageEvent<BulkSimWorkerResponse>) => {
      const { id, tournament, playerForms, error } = event.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      if (error || !tournament || !playerForms) {
        p.reject(new Error(error ?? "Bulk sim worker returned no result"));
        return;
      }
      p.resolve([tournament, playerForms]);
    };
    const fail = (reason: string) => {
      worker?.terminate();
      worker = null;
      rejectAllPending(reason);
    };
    worker.onerror = () => fail("Bulk sim worker crashed");
    worker.onmessageerror = () => fail("Bulk sim worker returned an unreadable message");
    return worker;
  } catch {
    return null;
  }
}

/** Run one AI-vs-AI match off the main thread when a worker is available. */
export function runAutoPlayMatch(
  tournament: TournamentState,
  matchId: string,
  champions: Champion[],
  playerForms: PlayerFormMap,
): Promise<[TournamentState, PlayerFormMap]> {
  const w = ensureWorker();
  if (!w) {
    return Promise.resolve().then(() => autoPlayMatch(tournament, matchId, champions, playerForms));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate();
      if (worker === w) worker = null;
      rejectAllPending("Bulk sim worker timed out");
    }, 120_000);
    pending.set(id, { resolve, reject, timer });
    const msg: BulkSimWorkerRequest = {
      type: "autoPlayMatch",
      id,
      tournament,
      matchId,
      champions,
      playerForms,
    };
    try {
      w.postMessage(msg);
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Terminate the worker (tests / teardown). */
export function terminateBulkSimWorker(): void {
  worker?.terminate();
  worker = null;
  rejectAllPending("Worker terminated");
}
