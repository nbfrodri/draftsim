import { describe, expect, it } from "vitest";

import type { SeasonHistoryEntry } from "./history";
import { teamTitleHighlightsFromEntry } from "./teamCard";

const ref = (name: string, leagueId: string) => ({ name, leagueId, color: "#000", iconKey: "shield" });

describe("teamTitleHighlightsFromEntry", () => {
  it("does not give an international badge to a same-named club from another region", () => {
    const entry = {
      id: "Y1",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      splitChampions: {},
      intlChampions: { msi: ref("Phoenix", "LCK") },
    } as unknown as SeasonHistoryEntry;
    expect(teamTitleHighlightsFromEntry(entry, { name: "Phoenix", leagueId: "LEC" })).toEqual([]);
    expect(teamTitleHighlightsFromEntry(entry, { name: "Phoenix", leagueId: "LCK" })).toEqual(["MSI"]);
  });
});
