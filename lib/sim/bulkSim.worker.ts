import { autoPlayMatch } from "@/lib/sim/autoPlayMatch";
import { setActivePowerSpikeOverride } from "@/lib/championBuilds";
import {
  setActiveCounterOverride,
  setActiveMetaOverride,
  setActiveSynergyOverride,
  setMetaEnabled,
} from "@/lib/championMeta";

// The meta/synergy/counter/power-spike overrides are module singletons, and a
// worker has its own module instance — without this the worker would draft
// and simulate on the BASELINE tier list regardless of the active meta.
export type BulkSimActiveOverrides = {
  metaOverride: import("@/lib/championMeta").MetaOverride | null;
  metaEnabled: boolean;
  synergyOverride: import("@/lib/championMeta").Synergy[] | null;
  counterOverride: readonly import("@/lib/championMeta").CounterPair[] | null;
  powerSpikeOverride: Record<string, number> | null;
};

export type BulkSimWorkerRequest = {
  type: "autoPlayMatch";
  id: number;
  tournament: import("@/lib/tournament").TournamentState;
  matchId: string;
  champions: import("@/lib/types").Champion[];
  playerForms: import("@/lib/playerForm").PlayerFormMap;
  overrides: BulkSimActiveOverrides;
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
    const o = msg.overrides;
    setActiveMetaOverride(o.metaOverride);
    setMetaEnabled(o.metaEnabled);
    setActiveSynergyOverride(o.synergyOverride);
    setActiveCounterOverride(o.counterOverride);
    setActivePowerSpikeOverride(o.powerSpikeOverride);
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
