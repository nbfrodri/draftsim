import { describe, it, expect } from "vitest";
import type { Champion, Lane, Player } from "../types";
import {
  AGENCY_MIN_TIER_VALUE,
  AGENCY_MIN_VALUE,
  AGENCY_LEAVE_GAP,
  AGENCY_ACCEPT_TOLERANCE,
  AGENCY_TARGET_TEAM_GAP,
  hasPlayerAgency,
  destinationScore,
  currentStarterSeatScore,
  rankDestinations,
  wouldAcceptDestination,
  preferOffer,
  generateAgencyDemands,
  overrideDemand,
  honorDemand,
  agencyFaBidBoost,
  formatAgencyWants,
  userFacingAgencyDemands,
  type AgencyTeamInput,
} from "./playerAgency";
import { NEUTRAL_META, type MarketInactive } from "./faMarket";
import { PLAYER_TIER_VALUE } from "../players";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

const champions: Champion[] = LANES.flatMap((lane, li) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: li * 10 + i,
    name: `${lane}${i}`,
    alias: `${lane}${i}`,
    roles: [],
    iconUrl: "",
    lanes: [lane],
  })),
);
const byId = new Map(champions.map((c) => [c.id, c]));

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const player = (over: Partial<Player>): Player =>
  ({ lane: "middle", tier: "B", goodChamps: [], badChamps: [], ...over });

function fullRoster(
  mid: Player,
  fillerTier: Player["tier"] = "B",
): Player[] {
  return LANES.map((lane) =>
    lane === "middle"
      ? mid
      : player({
          lane,
          tier: fillerTier,
          id: `${fillerTier}-${lane}`,
          name: `${fillerTier}-${lane}`,
        }),
  );
}

describe("playerAgency thresholds", () => {
  it("requires A+ tier and solid value", () => {
    expect(AGENCY_MIN_TIER_VALUE).toBe(1);
    expect(PLAYER_TIER_VALUE.A).toBeGreaterThanOrEqual(AGENCY_MIN_TIER_VALUE);
    expect(PLAYER_TIER_VALUE.B).toBeLessThan(AGENCY_MIN_TIER_VALUE);
    expect(hasPlayerAgency(player({ tier: "A" }), AGENCY_MIN_VALUE)).toBe(true);
    expect(hasPlayerAgency(player({ tier: "A" }), AGENCY_MIN_VALUE - 0.1)).toBe(false);
    expect(hasPlayerAgency(player({ tier: "B" }), 2)).toBe(false);
    expect(hasPlayerAgency(player({ tier: "S" }), AGENCY_MIN_VALUE)).toBe(true);
  });
});

describe("preference ranking", () => {
  it("ranks stronger orgs + starter roles above weak academy seats", () => {
    const star = player({
      id: "star",
      name: "Star",
      tier: "S",
      lane: "middle",
      homeRegion: "LCK",
    });
    const strong: AgencyTeamInput = {
      id: "t1",
      name: "T1",
      leagueId: "LCK",
      players: fullRoster(player({ lane: "middle", tier: "S", id: "t1-mid" }), "S"),
    };
    const weak: AgencyTeamInput = {
      id: "gen",
      name: "Gen",
      leagueId: "LCS",
      players: fullRoster(player({ lane: "middle", tier: "C", id: "gen-mid" }), "C"),
    };
    const strongStarter = destinationScore(star, strong, "starter");
    const weakAcademy = destinationScore(star, weak, "academy");
    expect(strongStarter).toBeGreaterThan(weakAcademy);

    const prefs = rankDestinations(star, [weak, strong], { limit: 4 });
    expect(prefs[0]!.teamId).toBe("t1");
    expect(prefs[0]!.role).toBe("starter");
  });

  it("user team wins offer preference ties", () => {
    const p = player({ tier: "S", id: "p1" });
    expect(
      preferOffer(
        p,
        2,
        { teamId: "ai", score: 1.5 },
        { teamId: "user", score: 1.4 },
        "user",
      ),
    ).toBe("b");
  });

  it("agency players refuse clear downgrades unless override / user team", () => {
    const p = player({ tier: "S", id: "p1" });
    const current = 2.0;
    const weakOffer = current - AGENCY_ACCEPT_TOLERANCE - 0.2;
    expect(wouldAcceptDestination(p, 2, current, weakOffer, "ai")).toBe(false);
    expect(wouldAcceptDestination(p, 2, current, weakOffer, "user", "user")).toBe(true);
    expect(wouldAcceptDestination(p, 2, current, weakOffer, "ai", null, true)).toBe(true);
    expect(wouldAcceptDestination(player({ tier: "B" }), 0, current, weakOffer, "ai")).toBe(
      true,
    );
  });
});

describe("generateAgencyDemands", () => {
  it("emits leave demands for high-tier stars on weak orgs toward stronger ones", () => {
    const star = player({
      id: "faker",
      name: "Faker",
      tier: "S+",
      lane: "middle",
      homeRegion: "LCK",
      goodChamps: [20, 21, 22],
    });
    const weak: AgencyTeamInput = {
      id: "weak",
      name: "Weak",
      leagueId: "LCS",
      players: fullRoster(star, "D"),
    };
    const strong: AgencyTeamInput = {
      id: "strong",
      name: "Strong",
      leagueId: "LCK",
      players: fullRoster(
        player({ id: "s-mid", name: "Sm", tier: "A", lane: "middle" }),
        "S",
      ),
    };
    // Force chance rolls to hit by using a rng that always returns 0.
    const always = () => 0;
    const demands = generateAgencyDemands(
      [weak, strong],
      [],
      byId,
      NEUTRAL_META,
      always,
      { window: "offseason", controlledTeamId: "strong" },
    );
    const leave = demands.find((d) => d.playerId === "faker" && d.kind === "leave");
    expect(leave).toBeTruthy();
    expect(leave!.fromTeamId).toBe("weak");
    expect(leave!.preferenceGap).toBeGreaterThanOrEqual(AGENCY_LEAVE_GAP);
    expect(leave!.rankedPrefs?.length).toBeGreaterThan(0);
    // Strong preference should target a specific team.
    if (leave!.preferenceGap >= AGENCY_TARGET_TEAM_GAP) {
      expect(leave!.wantTeamId).toBe("strong");
    }
  });

  it("emits call-up demand when academy prospect clearly beats incumbent", () => {
    const prospect = player({
      id: "kid",
      name: "Kid",
      tier: "S",
      lane: "middle",
      goodChamps: [20, 21, 22],
    });
    const incumbent = player({
      id: "old",
      name: "Old",
      tier: "C",
      lane: "middle",
    });
    const team: AgencyTeamInput = {
      id: "org",
      name: "Org",
      leagueId: "LCK",
      players: fullRoster(incumbent, "B"),
    };
    const pool: MarketInactive[] = [
      {
        player: prospect,
        status: "academy",
        inactiveYears: 2,
        demotedYear: 1,
        clockYear: 1,
        lastTeamId: "org",
        lastTeamName: "Org",
        lastActiveGrade: 8,
        shadowGrade: 8,
      },
    ];
    const demands = generateAgencyDemands(
      [team],
      pool,
      byId,
      NEUTRAL_META,
      () => 0,
      { window: "transfer", controlledTeamId: "org" },
    );
    const callup = demands.find((d) => d.kind === "call-up" && d.playerId === "kid");
    expect(callup).toBeTruthy();
    expect(callup!.wantRole).toBe("starter");
    expect(formatAgencyWants(callup!)).toMatch(/starting role/i);
  });

  it("surfaces only followed-team pending demands in userFacingAgencyDemands", () => {
    const demands = generateAgencyDemands(
      [
        {
          id: "me",
          name: "Me",
          players: fullRoster(
            player({ id: "star", name: "Star", tier: "S+", lane: "middle" }),
            "D",
          ),
        },
        {
          id: "them",
          name: "Them",
          players: fullRoster(
            player({ id: "other", name: "Other", tier: "S", lane: "middle" }),
            "S",
          ),
        },
      ],
      [],
      byId,
      NEUTRAL_META,
      () => 0,
      { window: "offseason", controlledTeamId: "me" },
    );
    const facing = userFacingAgencyDemands(demands, "me");
    expect(facing.every((d) => d.fromTeamId === "me" || d.wantTeamId === "me")).toBe(
      true,
    );
  });
});

describe("demand status helpers", () => {
  it("override and honor flip pending status", () => {
    const base = [
      {
        id: "p1:leave",
        playerId: "p1",
        playerTier: "S" as const,
        lane: "middle" as const,
        kind: "leave" as const,
        fromTeamId: "t1",
        wantRole: "fa" as const,
        preferenceGap: 1.2,
        status: "pending" as const,
      },
    ];
    expect(overrideDemand(base, "p1:leave")[0]!.status).toBe("overridden");
    expect(honorDemand(base, "p1:leave")[0]!.status).toBe("honored");
  });
});

describe("agencyFaBidBoost", () => {
  it("boosts user team and stronger orgs for agency FAs", () => {
    const star = player({ tier: "S", id: "fa1", homeRegion: "LCK" });
    const strong: AgencyTeamInput = {
      id: "user",
      name: "User",
      leagueId: "LCK",
      players: fullRoster(player({ lane: "middle", tier: "S", id: "u" }), "S"),
    };
    const weak: AgencyTeamInput = {
      id: "ai",
      name: "AI",
      leagueId: "LCS",
      players: fullRoster(player({ lane: "middle", tier: "C", id: "a" }), "C"),
    };
    const value = 2;
    const userBoost = agencyFaBidBoost(star, value, strong, "user");
    const aiBoost = agencyFaBidBoost(star, value, weak, "user");
    expect(userBoost).toBeGreaterThan(aiBoost);
    expect(agencyFaBidBoost(player({ tier: "B" }), 0, strong, "user")).toBeGreaterThan(0);
  });
});

describe("seat scoring sanity", () => {
  it("starter seat on strong org beats academy on same org", () => {
    const p = player({ tier: "A", id: "p", homeRegion: "LCK" });
    const team: AgencyTeamInput = {
      id: "t",
      name: "T",
      leagueId: "LCK",
      players: fullRoster(p, "A"),
    };
    expect(currentStarterSeatScore(p, team)).toBeGreaterThan(
      destinationScore(p, team, "academy"),
    );
  });
});

// Keep rng helper referenced for future expansion.
void rng;
