import { autoPlayMatch } from "@/lib/sim/autoPlayMatch";
import {
  initNeuralDraftPolicyAsync,
  isNeuralPolicyDisabled,
} from "@/lib/draftAI";
import type { Champion } from "@/lib/types";

export type BulkSimWorkerRequest = {
  type: "autoPlayMatch";
  id: number;
  tournament: import("@/lib/tournament").TournamentState;
  matchId: string;
  champions: Champion[];
  playerForms: import("@/lib/playerForm").PlayerFormMap;
};

export type BulkSimWorkerResponse = {
  id: number;
  tournament?: import("@/lib/tournament").TournamentState;
  playerForms?: import("@/lib/playerForm").PlayerFormMap;
  error?: string;
};

// Lazy neural init — runs once per worker lifetime, before the first match.
// Cached so concurrent messages all await the same promise.
let _neuralReady: Promise<void> | null = null;

function ensureNeuralReady(champions: Champion[]): Promise<void> {
  if (!_neuralReady) {
    _neuralReady = isNeuralPolicyDisabled()
      ? Promise.resolve()
      : initNeuralDraftPolicyAsync(champions).then(() => void 0);
  }
  return _neuralReady;
}

self.onmessage = async (event: MessageEvent<BulkSimWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== "autoPlayMatch") return;
  try {
    await ensureNeuralReady(msg.champions);
    const [tournament, playerForms] = autoPlayMatch(
      msg.tournament,
      msg.matchId,
      msg.champions,
      msg.playerForms,
    );
    const out: BulkSimWorkerResponse = {
      id: msg.id,
      tournament,
      playerForms,
    };
    self.postMessage(out);
  } catch (err) {
    const out: BulkSimWorkerResponse = {
      id: msg.id,
      error: err instanceof Error ? err.message : "Bulk sim failed",
    };
    self.postMessage(out);
  }
};
