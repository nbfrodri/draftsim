import { autoPlayMatch } from "./autoPlayMatch";

export type BulkSimWorkerRequest = {
  type: "autoPlayMatch";
  id: number;
  tournament: import("@/lib/tournament").TournamentState;
  matchId: string;
  champions: import("@/lib/types").Champion[];
  playerForms: import("@/lib/playerForm").PlayerFormMap;
};

export type BulkSimWorkerResponse = {
  id: number;
  tournament?: import("@/lib/tournament").TournamentState;
  playerForms?: import("@/lib/playerForm").PlayerFormMap;
  error?: string;
};

self.onmessage = (event: MessageEvent<BulkSimWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== "autoPlayMatch") return;
  try {
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
