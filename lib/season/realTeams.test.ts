import { describe, expect, it } from "vitest";

import { dedupeAcrossLeagues, extractStandingsNames } from "./realTeams";
import type { LeagueId } from "./types";

describe("extractStandingsNames", () => {
  it("collects names from rankings and bracket matches, skipping TBD", () => {
    const standing = {
      stages: [
        {
          sections: [
            {
              rankings: [
                { teams: [{ name: "T1" }, { name: "Gen.G Esports" }] },
                { teams: [{ name: "TBD" }] },
              ],
            },
            {
              matches: [
                { teams: [{ name: "T1" }, { name: "kt Rolster" }] },
                { teams: [{ name: "TBD" }, {}] },
              ],
            },
          ],
        },
      ],
    };
    expect(extractStandingsNames(standing)).toEqual([
      "T1",
      "Gen.G Esports",
      "T1",
      "kt Rolster",
    ]);
  });

  it("handles empty standings", () => {
    expect(extractStandingsNames(undefined)).toEqual([]);
    expect(extractStandingsNames({})).toEqual([]);
    expect(extractStandingsNames({ stages: [{ sections: [{}] }] })).toEqual(
      [],
    );
  });
});

describe("dedupeAcrossLeagues", () => {
  it("drops names already used by an earlier league and caps at 10", () => {
    const raw = {
      LCK: Array.from({ length: 12 }, (_, i) => `K${i}`),
      LPL: ["K0", "P1", "P2"],
      LEC: [],
      LCS: ["P1", "N1"],
      CBLOL: ["B1"],
      LCP: ["A1"],
    } as Record<LeagueId, string[]>;
    const out = dedupeAcrossLeagues(raw);
    expect(out.LCK).toHaveLength(10);
    expect(out.LPL).toEqual(["P1", "P2"]);
    expect(out.LCS).toEqual(["N1"]);
    expect(out.LEC).toEqual([]);
  });
});
