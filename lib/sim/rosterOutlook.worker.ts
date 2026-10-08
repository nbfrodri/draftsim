import { buildRosterOutlook } from "../season/rosterOutlook";
import type { SeasonState } from "../season/types";
import type { Champion } from "../types";

self.onmessage = (event: MessageEvent<{ season: SeasonState; champions: Champion[] }>) => {
  try {
    self.postMessage({ result: buildRosterOutlook(event.data.season, event.data.champions) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Forecast failed" });
  }
};
