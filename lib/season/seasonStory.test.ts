import { describe, it, expect } from "vitest";

import { buildSeasonStory } from "./seasonStory";
import type { SeasonState, SeasonTeam } from "./types";

function team(id: string, leagueId: SeasonTeam["leagueId"] = "LCK"): SeasonTeam {
  return {
    id,
    leagueId,
    name: id,
    color: "#fff",
    iconKey: "a",
    players: [],
    personalityId: "balanced",
  };
}

// A match fixture for the upset scan. Non-bracket (no bracket / feedsInto)
// so round-depth classification is skipped.
function match(blue: string, red: string, winner: string) {
  return {
    id: `${blue}-${red}`,
    blueTeamId: blue,
    redTeamId: red,
    winner: { teamId: winner, blueWins: 0, redWins: 0 },
  };
}

function season(partial: Partial<SeasonState>): SeasonState {
  return {
    teams: [],
    tournaments: {},
    splitResults: {},
    intlResults: {},
    phases: [],
    phaseIndex: 0,
    currentMeta: {
      metaOverride: null,
      metaEnabled: true,
      synergyOverride: null,
      counterOverride: null,
    },
    champion: null,
    ...partial,
  } as unknown as SeasonState;
}

describe("buildSeasonStory", () => {
  it("resolves champion and runner-up from the Worlds placements", () => {
    const s = season({
      teams: [team("Gold"), team("Silver")],
      champion: "Gold",
      intlResults: { worlds: ["Gold", "Silver"] },
    });
    const story = buildSeasonStory(s);
    expect(story.champion?.name).toBe("Gold");
    expect(story.runnerUp?.name).toBe("Silver");
  });

  it("picks the biggest star-gap upset across the season", () => {
    const teams = [team("Giant"), team("David"), team("MidA"), team("MidB")];
    const tourney = {
      name: "World Championship",
      teams: [
        { id: "Giant", name: "Giant", seed: 1, starRating: 5 },
        { id: "David", name: "David", seed: 8, starRating: 2 },
        { id: "MidA", name: "MidA", seed: 3, starRating: 4 },
        { id: "MidB", name: "MidB", seed: 4, starRating: 3 },
      ],
      matches: [
        match("Giant", "David", "David"), // 3★ upset
        match("MidA", "MidB", "MidB"), // 1★ upset
      ],
    };
    const s = season({
      teams,
      tournaments: { w: tourney as never },
    });
    const story = buildSeasonStory(s);
    expect(story.biggestUpset?.winner.name).toBe("David");
    expect(story.biggestUpset?.loser.name).toBe("Giant");
    expect(story.biggestUpset?.starGap).toBe(3);
    expect(story.biggestUpset?.event).toBe("World Championship");
  });

  it("names the most-decorated franchise as team of the year", () => {
    const s = season({
      teams: [team("Dynasty"), team("OneHit")],
      splitResults: {
        winter: { LCK: ["Dynasty"] },
        spring: { LCK: ["OneHit"] },
      },
      intlResults: { worlds: ["Dynasty"] },
    });
    const story = buildSeasonStory(s);
    // Dynasty: 1 split + Worlds (heavily weighted); OneHit: 1 split only.
    expect(story.teamOfTheYear?.team.name).toBe("Dynasty");
    expect(story.teamOfTheYear?.titles).toBe(2);
  });

  it("uses region tides for the region that rose when present", () => {
    const s = season({
      teams: [team("A", "LPL")],
      leagueStrength: { LPL: 0.6, LCK: 0.2 },
    });
    expect(buildSeasonStory(s).regionThatRose).toBe("LPL");
  });

  it("tolerates an empty/unfinished season without throwing", () => {
    expect(() => buildSeasonStory(season({}))).not.toThrow();
    expect(buildSeasonStory(season({}))).toEqual({});
  });
});
