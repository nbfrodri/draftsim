import { describe, expect, it } from "vitest";

import {
  isLikelyAcademyLineup,
  preferPriorOnTeamObject,
  stickyPriorStarters,
} from "../../scripts/rosterFetchHelpers.mjs";

const ROLE2LANE = {
  top: "top",
  jungle: "jungle",
  mid: "middle",
  bottom: "bottom",
  support: "support",
};

const T1_PRIOR = {
  top: "Doran",
  jungle: "Oner",
  middle: "Faker",
  bottom: "Peyz",
  support: "Keria",
};

describe("isLikelyAcademyLineup", () => {
  it("flags a full academy five when prior starters remain on the org", () => {
    expect(
      isLikelyAcademyLineup(
        T1_PRIOR,
        {
          top: "Guardian",
          jungle: "Carim",
          middle: "Guti",
          bottom: "Cypher",
          support: "Cloud",
        },
        ["Guardian", "Carim", "Guti", "Cypher", "Cloud", "Doran", "Oner", "Faker", "Peyz", "Keria"],
      ),
    ).toBe(true);
  });

  it("allows a real rebuild when prior starters left the org", () => {
    expect(
      isLikelyAcademyLineup(
        T1_PRIOR,
        {
          top: "Guardian",
          jungle: "Carim",
          middle: "Guti",
          bottom: "Cypher",
          support: "Cloud",
        },
        ["Guardian", "Carim", "Guti", "Cypher", "Cloud"],
      ),
    ).toBe(false);
  });
});

describe("stickyPriorStarters", () => {
  it("keeps prior lanes still on the squad (partial sub-swap)", () => {
    expect(
      stickyPriorStarters(
        {
          top: "Photon",
          jungle: "eXyu",
          middle: "Palafox",
          bottom: "FBI",
          support: "IgNar",
        },
        ["Photon", "eXyu", "Palafox", "FBI", "IgNar", "Denathor", "Dardoch"],
      ),
    ).toEqual({
      top: "Photon",
      jungle: "eXyu",
      middle: "Palafox",
      bottom: "FBI",
      support: "IgNar",
    });
  });

  it("drops lanes whose prior starter left (real transfer)", () => {
    expect(
      stickyPriorStarters(
        {
          top: "PerfecT",
          jungle: "Cuzz",
          middle: "Bdd",
          bottom: "Aiming",
          support: "Effort",
        },
        ["PerfecT", "Cuzz", "Bdd", "Jiwoo", "Effort"],
      ),
    ).toEqual({
      top: "PerfecT",
      jungle: "Cuzz",
      middle: "Bdd",
      support: "Effort",
    });
  });
});

describe("preferPriorOnTeamObject", () => {
  it("prefers prior starters over academy-first getTeams order", () => {
    const players = [
      { role: "top", summonerName: "Guardian" },
      { role: "top", summonerName: "Doran" },
      { role: "jungle", summonerName: "Carim" },
      { role: "jungle", summonerName: "Oner" },
      { role: "mid", summonerName: "Guti" },
      { role: "mid", summonerName: "Faker" },
      { role: "bottom", summonerName: "Cypher" },
      { role: "bottom", summonerName: "Peyz" },
      { role: "support", summonerName: "Cloud " },
      { role: "support", summonerName: "Keria" },
    ];
    expect(preferPriorOnTeamObject(players, ROLE2LANE, T1_PRIOR)).toEqual(T1_PRIOR);
  });
});
