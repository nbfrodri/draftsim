import type { Champion } from "@/lib/types";
import type { PlayerFormMap } from "@/lib/playerForm";
import type { TournamentState } from "@/lib/tournament";
import { autoPlayMatch } from "./autoPlayMatch";
import type { BulkSimWorkerRequest, BulkSimWorkerResponse } from "./bulkSim.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  {
    resolve: (v: [TournamentState, PlayerFormMap]) => void;
    reject: (e: Error) => void;
  }
>();

function rejectAllPending(reason: string) {
  for (const [, p] of pending) p.reject(new Error(reason));
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./bulkSim.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<BulkSimWorkerResponse>) => {
      const { id, tournament, playerForms, error } = event.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error || !tournament || !playerForms) {
        p.reject(new Error(error ?? "Bulk sim worker returned no result"));
        return;
      }
      p.resolve([tournament, playerForms]);
    };
    worker.onerror = () => {
      rejectAllPending("Bulk sim worker crashed");
      worker = null;
    };
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
    return Promise.resolve(autoPlayMatch(tournament, matchId, champions, playerForms));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg: BulkSimWorkerRequest = {
      type: "autoPlayMatch",
      id,
      tournament,
      matchId,
      champions,
      playerForms,
    };
    w.postMessage(msg);
  });
}

/** Terminate the worker (tests / teardown). */
export function terminateBulkSimWorker(): void {
  worker?.terminate();
  worker = null;
  rejectAllPending("Worker terminated");
}
