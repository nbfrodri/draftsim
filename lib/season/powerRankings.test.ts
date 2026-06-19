import { describe, it, expect } from "vitest";

import { computePowerRankings } from "./powerRankings";
import type { SeasonState, SeasonTeam } from "./types";
import type { Player, PlayerTier, Roster } from "../types";

const LANES: Player["lane"][] = ["top", "jungle", "middle", "bottom", "support"];

function roster(tier: PlayerTier): Roster {
  return LANES.map((lane) => ({
    lane,
    tier,
    goodChamps: [],
    badChamps: [],
  }));
}

function team(id: string, tier: PlayerTier): SeasonTeam {
  return {
    id,
    leagueId: "LCK",
    name: id,
    color: "#fff",
    iconKey: "a",
    players: roster(tier),
    personalityId: "balanced",
  };
}

// Minimal season carrying only what computePowerRankings reads.
function season(
  teams: SeasonTeam[],
  teamForm?: Record<string, number>,
): SeasonState {
  return {
    teams,
    phases: [],
    phaseIndex: 0,
    tournaments: {},
    currentMeta: {
      metaOverride: null,
      metaEnabled: true,
      synergyOverride: null,
      counterOverride: null,
    },
    ...(teamForm ? { teamForm } : {}),
  } as unknown as SeasonState;
}

describe("computePowerRankings", () => {
  it("ranks by roster strength when form is absent", () => {
    const rows = computePowerRankings(
      season([team("Weak", "C"), team("Strong", "S")]),
    );
    expect(rows.map((r) => r.team.id)).toEqual(["Strong", "Weak"]);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].star).toBe(5);
    // Realism off → no form, no movement, no riser/faller tags.
    expect(rows.every((r) => r.form === 0)).toBe(true);
    expect(rows.every((r) => r.movement === "flat")).toBe(true);
    expect(rows[0].tags).toContain("team-of-split");
    expect(rows.flatMap((r) => r.tags)).not.toContain("biggest-riser");
  });

  it("hot form can leapfrog an equally-rated cold team, and tags it", () => {
    const rows = computePowerRankings(
      season([team("Cold", "B"), team("Hot", "B")], { Hot: 0.5, Cold: 0 }),
    );
    expect(rows[0].team.id).toBe("Hot");
    expect(rows[0].tags).toEqual(
      expect.arrayContaining(["team-of-split", "biggest-riser"]),
    );
    expect(rows[0].movement).toBe("up");
    expect(rows.find((r) => r.team.id === "Cold")!.movement).toBe("flat");
  });

  it("flags the biggest faller", () => {
    const rows = computePowerRankings(
      season([team("Steady", "A"), team("Slumping", "A")], {
        Slumping: -0.6,
      }),
    );
    const slump = rows.find((r) => r.team.id === "Slumping")!;
    expect(slump.tags).toContain("biggest-faller");
    expect(slump.movement).toBe("down");
  });
});
