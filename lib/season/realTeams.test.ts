import { describe, expect, it } from "vitest";

import { dedupeAcrossLeagues, extractStandingsTeams } from "./realTeams";
import type { RealTeam } from "./realTeams";
import type { LeagueId } from "./types";

describe("extractStandingsTeams", () => {
  it("collects teams from rankings and bracket matches, skipping TBD", () => {
    const standing = {
      stages: [
        {
          sections: [
            {
              rankings: [
                {
                  teams: [
                    { name: "T1", image: "http://logo/t1.png" },
                    { name: "Gen.G Esports", image: "https://logo/geng.png" },
                  ],
                },
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
    expect(extractStandingsTeams(standing)).toEqual([
      // http logos are upgraded to https to avoid mixed-content blocking.
      { name: "T1", logoUrl: "https://logo/t1.png" },
      { name: "Gen.G Esports", logoUrl: "https://logo/geng.png" },
      { name: "T1", logoUrl: undefined },
      { name: "kt Rolster", logoUrl: undefined },
    ]);
  });

  it("handles empty standings", () => {
    expect(extractStandingsTeams(undefined)).toEqual([]);
    expect(extractStandingsTeams({})).toEqual([]);
    expect(extractStandingsTeams({ stages: [{ sections: [{}] }] })).toEqual(
      [],
    );
  });
});

describe("dedupeAcrossLeagues", () => {
  const t = (name: string): RealTeam => ({ name });

  it("drops names already used by an earlier league and caps at 10", () => {
    const raw = {
      LCK: Array.from({ length: 12 }, (_, i) => t(`K${i}`)),
      LPL: [t("K0"), t("P1"), t("P2")],
      LEC: [],
      LCS: [t("P1"), t("N1")],
      CBLOL: [t("B1")],
      LCP: [t("A1")],
    } as Record<LeagueId, RealTeam[]>;
    const out = dedupeAcrossLeagues(raw);
    expect(out.LCK).toHaveLength(10);
    expect(out.LPL).toEqual([t("P1"), t("P2")]);
    expect(out.LCS).toEqual([t("N1")]);
    expect(out.LEC).toEqual([]);
  });

  it("preserves the logo URL on kept teams", () => {
    const raw = {
      LCK: [{ name: "T1", logoUrl: "https://logo/t1.png" }],
      LPL: [],
      LEC: [],
      LCS: [],
      CBLOL: [],
      LCP: [],
    } as Record<LeagueId, RealTeam[]>;
    expect(dedupeAcrossLeagues(raw).LCK).toEqual([
      { name: "T1", logoUrl: "https://logo/t1.png" },
    ]);
  });
});
