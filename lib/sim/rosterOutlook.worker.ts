import { rosterOutlookSteps } from "../season/rosterOutlook";
import type { SeasonState } from "../season/types";
import type { Champion } from "../types";

self.onmessage = (event: MessageEvent<{ season: SeasonState; champions: Champion[] }>) => {
  try {
    const work = rosterOutlookSteps(event.data.season, event.data.champions);
    let step = work.next();
    while (!step.done) {
      self.postMessage({ progress: step.value });
      step = work.next();
    }
    self.postMessage({ result: step.value });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Forecast failed" });
  }
};
