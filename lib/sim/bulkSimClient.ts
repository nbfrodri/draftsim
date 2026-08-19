import type { Champion } from "@/lib/types";
import type { PlayerFormMap } from "@/lib/playerForm";
import type { TournamentState } from "@/lib/tournament";
import { autoPlayMatch } from "./autoPlayMatch";
import type { BulkSimWorkerRequest, BulkSimWorkerResponse } from "./bulkSim.worker";
import {
  initNeuralDraftPolicyAsync,
  isNeuralPolicyDisabled,
} from "@/lib/draftAI";

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
    // Pre-bundled by scripts/build-bulk-sim-worker.mjs (Turbopack static export
    // cannot bundle Worker entry points with relative imports).
    worker = new Worker("/workers/bulkSim.worker.js");
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

// Lazy neural init for the main-thread fallback path (no Worker available).
// Cached so concurrent calls all await the same promise.
let _mainThreadNeuralReady: Promise<void> | null = null;

function ensureMainThreadNeuralReady(champions: Champion[]): Promise<void> {
  if (!_mainThreadNeuralReady) {
    _mainThreadNeuralReady = isNeuralPolicyDisabled()
      ? Promise.resolve()
      : initNeuralDraftPolicyAsync(champions).then(() => void 0);
  }
  return _mainThreadNeuralReady;
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
    return ensureMainThreadNeuralReady(champions).then(() =>
      autoPlayMatch(tournament, matchId, champions, playerForms),
    );
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
  _mainThreadNeuralReady = null;
  rejectAllPending("Worker terminated");
}
