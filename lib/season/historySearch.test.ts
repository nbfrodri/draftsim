import { describe, it, expect } from "vitest";
import type { SeasonHistoryEntry } from "./history";
import {
  listPlayers,
  listTeams,
  listCoaches,
  listCoachesRich,
  teamStars,
  playerProfile,
  teamProfile,
  coachProfile,
  playerCareerStatuses,
  playerCareerStatus,
} from "./historySearch";
import { computePlayerTitlesByEvent } from "./historyRecords";
import { computeCoachRecords } from "./historySearch";
import type { InactivePlayerSnapshot } from "./playerLifecycle";

// ─── Retired detection + coach playstyle ────────────────────────────────────
const LANES5 = ["top", "jungle", "middle", "bottom", "support"] as const;
function retiredFixture(ids: string[][]): SeasonHistoryEntry[] {
  return ids.map(
    (seasonIds, si) =>
      ({
        id: `S${si}`,
        archivedAt: si + 1,
        name: `S${si}`,
        complete: true,
        champion: null,
        runnerUp: null,
        intlChampions: {},
        splitChampions: {},
        phaseRosters: [
          {
            phaseIndex: 0,
            label: "Winter Split",
            kind: "split",
            split: "winter",
            teams: [
              {
                teamId: "T1",
                teamName: "T1",
                leagueId: "LCK",
                coach: { name: "Kim", rating: 4, playstyle: "Aggressive" },
                players: seasonIds.map((pid, i) => ({ id: pid, name: pid, tier: "A", lane: LANES5[i] })),
              },
            ],
          },
        ],
        playerCareers: seasonIds.map((pid) => ({
          playerId: pid,
          playerName: pid,
          leagueId: "LCK",
          teamName: "T1",
          games: 10,
          kills: 10,
          mvps: 0,
          allPro: 0,
          splitTitles: 0,
          intlAppearances: 0,
          intlTitles: 0,
        })),
      }) as unknown as SeasonHistoryEntry,
  );
}

describe("retired detection", () => {
  it("flags players absent from the latest season but not those still rostered", () => {
    // S1 has 'vet'; S2 (later) replaces them with 'rookie' → vet retired.
    const hits = listPlayers(
      retiredFixture([
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ]),
    );
    const by = new Map(hits.map((h) => [h.id, h.retired]));
    expect(by.get("vet")).toBe(true);
    expect(by.get("rookie")).toBe(false);
    expect(by.get("b")).toBe(false); // still on the latest roster
  });

  it("never flags anyone with only one archived season", () => {
    const hits = listPlayers(retiredFixture([["vet", "b", "c", "d", "e"]]));
    expect(hits.every((h) => !h.retired)).toBe(true);
  });
});

describe("lifecycle inactive pool status", () => {
  function withPool(
    ids: string[][],
    inactiveBySeason: Array<InactivePlayerSnapshot[] | undefined>,
  ): SeasonHistoryEntry[] {
    return retiredFixture(ids).map((e, i) => {
      const pool = inactiveBySeason[i];
      return pool !== undefined ? { ...e, inactivePlayers: pool } : e;
    });
  }

  it("uses inactivePlayers snapshots for academy / FA instead of retired heuristic", () => {
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
          },
        ],
      ],
    );
    const st = playerCareerStatuses(entries);
    expect(st.get("vet")?.status).toBe("academy");
    expect(st.get("vet")?.academyYears).toBe(1);

    const hits = listPlayers(entries);
    const vet = hits.find((h) => h.id === "vet");
    expect(vet?.careerStatus).toBe("academy");
    expect(vet?.academyYears).toBe(1);
    expect(vet?.retired).toBe(false);

    const profile = playerProfile(entries, "vet");
    expect(profile?.careerStatus).toBe("academy");
    expect(profile?.academyYears).toBe(1);
  });

  it("shows free-agent years after academy completes", () => {
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "free-agent",
            // After 3 academy years + 2 FA years (inactiveYears = 3+2).
            inactiveYears: 5,
            demotedYear: 1,
            lastTeamId: "T1",
          },
        ],
      ],
    );
    const st = playerCareerStatuses(entries).get("vet");
    expect(st?.status).toBe("free-agent");
    expect(st?.academyYears).toBe(3);
    expect(st?.freeAgentYears).toBe(2);

    const profile = playerProfile(entries, "vet");
    expect(profile?.careerStatus).toBe("free-agent");
    expect(profile?.freeAgentYears).toBe(2);
  });

  it("does not mark demoted players retired when an empty lifecycle pool is present", () => {
    // Newest archive ran lifecycle but nobody is inactive — missing players are
    // NOT auto-retired (they may have left via id gaps; prefer explicit pool).
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [undefined, []],
    );
    const st = playerCareerStatuses(entries);
    expect(st.get("vet")?.status).toBeUndefined();
    const hits = listPlayers(entries);
    expect(hits.find((h) => h.id === "vet")?.careerStatus).toBe("active");
    expect(hits.find((h) => h.id === "vet")?.retired).toBe(false);
  });

  it("falls back to retired heuristic when no archive has inactivePlayers", () => {
    const st = playerCareerStatuses(
      retiredFixture([
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ]),
    );
    expect(st.get("vet")?.status).toBe("retired");
  });

  it("exposes academy as its own careerStatus (filterable separately from FA)", () => {
    const entries = withPool(
      [
        ["acy", "fa", "b", "c", "d"],
        ["r1", "r2", "b", "c", "d"],
      ],
      [
        undefined,
        [
          {
            playerId: "acy",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
          },
          {
            playerId: "fa",
            lane: "jungle",
            tier: "C",
            status: "free-agent",
            inactiveYears: 3,
            demotedYear: 1,
            lastTeamId: "T1",
          },
        ],
      ],
    );
    const hits = listPlayers(entries);
    const academy = hits.filter((h) => h.careerStatus === "academy");
    const inactive = hits.filter((h) => h.careerStatus === "free-agent");
    expect(academy.map((h) => h.id)).toEqual(["acy"]);
    expect(inactive.map((h) => h.id)).toEqual(["fa"]);
    expect(academy[0]?.academyYears).toBe(1);
    expect(inactive[0]?.freeAgentYears).toBe(1);
  });

  it("same-season demotion (roster + pool) is Academy in search, not Active", () => {
    // Player played the year (on phaseRosters) then was benched/demoted in the
    // closing offseason — inactivePlayers is end-of-season truth for Hall Search.
    const entries = withPool(
      [["bench", "b", "c", "d", "e"]],
      [
        [
          {
            playerId: "bench",
            playerName: "Bench",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    expect(playerCareerStatuses(entries).get("bench")?.status).toBe("academy");
    const hits = listPlayers(entries);
    const bench = hits.find((h) => h.id === "bench");
    expect(bench).toBeDefined();
    expect(bench?.careerStatus).toBe("academy");
    expect(bench?.retired).toBe(false);
    expect(bench?.name).toBe("bench"); // career name from fixture
    expect(hits.filter((h) => h.careerStatus === "academy").map((h) => h.id)).toContain(
      "bench",
    );
    expect(hits.filter((h) => h.careerStatus === "active").map((h) => h.id)).not.toContain(
      "bench",
    );
    expect(playerProfile(entries, "bench")?.careerStatus).toBe("academy");
  });

  it("includes pool-only academy/FA players with no playerCareers row", () => {
    // Archive has an inactive pool entry that never appeared in playerCareers
    // (e.g. edge archive / demoted before career rows existed).
    const base = retiredFixture([["a", "b", "c", "d", "e"]])[0]!;
    const entries: SeasonHistoryEntry[] = [
      {
        ...base,
        playerCareers: [], // no careers at all
        inactivePlayers: [
          {
            playerId: "ghost-acy",
            playerName: "GhostAcy",
            lane: "middle",
            tier: "B",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
          {
            playerId: "ghost-fa",
            playerName: "GhostFA",
            lane: "support",
            tier: "C",
            status: "free-agent",
            inactiveYears: 3,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      },
    ];
    const hits = listPlayers(entries);
    const acy = hits.find((h) => h.id === "ghost-acy");
    const fa = hits.find((h) => h.id === "ghost-fa");
    expect(acy?.careerStatus).toBe("academy");
    expect(acy?.name).toBe("GhostAcy");
    expect(acy?.lane).toBe("middle");
    expect(acy?.team?.name).toBe("T1");
    expect(fa?.careerStatus).toBe("free-agent");
    expect(fa?.name).toBe("GhostFA");
    expect(fa?.freeAgentYears).toBe(1);
    // Status filters (mirrors SeasonHistoryView SearchPanel)
    expect(hits.filter((h) => h.careerStatus === "academy").map((h) => h.id)).toEqual([
      "ghost-acy",
    ]);
    expect(hits.filter((h) => h.careerStatus === "free-agent").map((h) => h.id)).toEqual([
      "ghost-fa",
    ]);
    // Rostered players without playerCareers are out of scope; pool-only ids must appear.
    expect(hits.map((h) => h.id).sort()).toEqual(["ghost-acy", "ghost-fa"]);
    // Profiles still open from search ids
    expect(playerProfile(entries, "ghost-acy")?.careerStatus).toBe("academy");
    expect(playerProfile(entries, "ghost-fa")?.careerStatus).toBe("free-agent");
  });

  it("academy → FA transition stays searchable with updated badge/filter", () => {
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["r1", "b", "c", "d", "e"],
        ["r2", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "free-agent",
            inactiveYears: 4,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    const hits = listPlayers(entries);
    const vet = hits.find((h) => h.id === "vet");
    expect(vet?.careerStatus).toBe("free-agent");
    expect(vet?.academyYears).toBe(3);
    expect(vet?.freeAgentYears).toBe(1);
    expect(hits.filter((h) => h.careerStatus === "free-agent").map((h) => h.id)).toContain(
      "vet",
    );
    expect(hits.filter((h) => h.careerStatus === "academy").map((h) => h.id)).not.toContain(
      "vet",
    );
    expect(playerProfile(entries, "vet")?.careerStatus).toBe("free-agent");
  });

  it("stale pool does not keep a promoted player tagged Academy", () => {
    // S0 demoted; S1 called back onto roster with an empty/fresh pool.
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["vet", "b", "c", "d", "e"],
      ],
      [
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
          },
        ],
        [], // lifecycle ran; nobody inactive
      ],
    );
    expect(playerCareerStatuses(entries).get("vet")?.status).toBe("active");
    expect(listPlayers(entries).find((h) => h.id === "vet")?.careerStatus).toBe("active");
  });
});

describe("point-in-time career status (asOfSeasonId)", () => {
  function withPool(
    ids: string[][],
    inactiveBySeason: Array<InactivePlayerSnapshot[] | undefined>,
  ): SeasonHistoryEntry[] {
    return retiredFixture(ids).map((e, i) => {
      const pool = inactiveBySeason[i];
      return pool !== undefined ? { ...e, inactivePlayers: pool } : e;
    });
  }

  it("stage as-of keeps rostered players active even if later academy", () => {
    // S0: vet on roster. S1: vet demoted to academy, rookie takes the slot.
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    // Current status = academy
    expect(playerCareerStatuses(entries).get("vet")?.status).toBe("academy");
    // As of S0 (when they played): active
    expect(
      playerCareerStatus(entries, "vet", { asOfSeasonId: "S0" })?.status,
    ).toBe("active");
    // As of S1: academy (not on roster, in pool)
    expect(
      playerCareerStatus(entries, "vet", { asOfSeasonId: "S1" })?.status,
    ).toBe("academy");
  });

  it("preferInactive surfaces end-of-season demotion even when they played that year", () => {
    // Same season: on roster AND in inactive pool (demoted in closing offseason).
    const entries = withPool(
      [["vet", "b", "c", "d", "e"]],
      [
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    // Stage sheets: roster wins → active
    expect(
      playerCareerStatus(entries, "vet", { asOfSeasonId: "S0" })?.status,
    ).toBe("active");
    // Year history: end-of-season pool wins → academy
    expect(
      playerCareerStatus(entries, "vet", {
        asOfSeasonId: "S0",
        preferInactive: true,
      })?.status,
    ).toBe("academy");
  });

  it("legacy as-of (no inactivePlayers) only marks rostered players active", () => {
    const entries = retiredFixture([
      ["vet", "b", "c", "d", "e"],
      ["rookie", "b", "c", "d", "e"],
    ]);
    expect(
      playerCareerStatus(entries, "vet", { asOfSeasonId: "S0" })?.status,
    ).toBe("active");
    // Not on S1 roster and no pool → omitted (no academy/FA guess)
    expect(
      playerCareerStatus(entries, "vet", { asOfSeasonId: "S1" }),
    ).toBeUndefined();
  });

  it("player profile year history carries as-of status + affiliate for inactive years", () => {
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    const profile = playerProfile(entries, "vet")!;
    // Header still shows current status
    expect(profile.careerStatus).toBe("academy");
    // Newest tenure = S1 inactive-only year
    expect(profile.tenures[0].seasonId).toBe("S1");
    expect(profile.tenures[0].careerStatus).toBe("academy");
    expect(profile.tenures[0].academyYears).toBe(1);
    expect(profile.tenures[0].stints).toHaveLength(0);
    expect(profile.tenures[0].affiliateTeam?.name).toBe("T1");
    // Older tenure = S0 when they played — end-of-season had no pool, so active
    expect(profile.tenures[1].seasonId).toBe("S0");
    expect(profile.tenures[1].careerStatus).toBe("active");
    expect(profile.tenures[1].stints[0]?.team.name).toBe("T1");
  });

  it("Career History includes academy then FA years under affiliate team", () => {
    // S0 active on T1 → S1 academy T1 → S2 FA (last team T1)
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [
        undefined,
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "free-agent",
            inactiveYears: 4,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    const profile = playerProfile(entries, "vet")!;
    expect(profile.careerStatus).toBe("free-agent");
    expect(profile.tenures).toHaveLength(3);
    expect(profile.tenures[0]!.careerStatus).toBe("free-agent");
    expect(profile.tenures[0]!.freeAgentYears).toBe(1);
    expect(profile.tenures[0]!.affiliateTeam?.name).toBe("T1");
    expect(profile.tenures[0]!.stints).toHaveLength(0);
    expect(profile.tenures[1]!.careerStatus).toBe("academy");
    expect(profile.tenures[1]!.academyYears).toBe(1);
    expect(profile.tenures[1]!.affiliateTeam?.name).toBe("T1");
    expect(profile.tenures[2]!.careerStatus).toBe("active");
    expect(profile.tenures[2]!.stints[0]?.team.name).toBe("T1");
  });

  it("Career History academy badges progress ACY 1→2→3 then FA 1 (no duplicate 1Y)", () => {
    // Post-advance Hall stamps from continueSeasonToNextYear:
    // demotion year 1y → next closes at 2y → 3y → FA 1y.
    const snap = (
      years: number,
      status: "academy" | "free-agent",
    ): InactivePlayerSnapshot[] => [
      {
        playerId: "vet",
        playerName: "Vet",
        lane: "top",
        tier: "C",
        status,
        inactiveYears: years,
        demotedYear: 1,
        lastTeamId: "T1",
        lastTeamName: "T1",
      },
    ];
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"], // demotion year — roster + pool
        ["r1", "b", "c", "d", "e"],
        ["r2", "b", "c", "d", "e"],
        ["r3", "b", "c", "d", "e"],
      ],
      [snap(1, "academy"), snap(2, "academy"), snap(3, "academy"), snap(4, "free-agent")],
    );
    const profile = playerProfile(entries, "vet")!;
    // Newest first — monotonic, never repeats ACY 1Y.
    expect(
      profile.tenures.map((t) => ({
        id: t.seasonId,
        status: t.careerStatus,
        acy: t.academyYears,
        fa: t.freeAgentYears,
      })),
    ).toEqual([
      { id: "S3", status: "free-agent", acy: 3, fa: 1 },
      { id: "S2", status: "academy", acy: 3, fa: undefined },
      { id: "S1", status: "academy", acy: 2, fa: undefined },
      { id: "S0", status: "academy", acy: 1, fa: undefined },
    ]);
    expect(profile.tenures[0]!.affiliateTeam?.name).toBe("T1");
    expect(profile.tenures[3]!.stints.length).toBeGreaterThan(0);
  });

  it("teamProfile seasons expose seasonId for as-of stage lookups", () => {
    const entries = withPool(
      [
        ["vet", "b", "c", "d", "e"],
        ["rookie", "b", "c", "d", "e"],
      ],
      [undefined, []],
    );
    const t = teamProfile(entries, "LCK:T1")!;
    expect(t.seasons.map((s) => s.seasonId)).toEqual(["S1", "S0"]);
    const asOf = playerCareerStatuses(entries, {
      asOfSeasonId: t.seasons[1]!.seasonId,
    });
    expect(asOf.get("vet")?.status).toBe("active");
  });

  it("excludes unfinished seasons from tenure / year-history badges", () => {
    const completed = withPool(
      [["vet", "b", "c", "d", "e"]],
      [
        [
          {
            playerId: "vet",
            playerName: "Vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
            lastTeamName: "T1",
          },
        ],
      ],
    );
    const unfinished = {
      ...retiredFixture([["vet", "b", "c", "d", "e"]])[0]!,
      id: "LIVE",
      archivedAt: 99,
      name: "In progress",
      complete: false,
      inactivePlayers: [
        {
          playerId: "vet",
          playerName: "Vet",
          lane: "top" as const,
          tier: "C" as const,
          status: "academy" as const,
          // Inflated as if live year-end advance leaked into history.
          inactiveYears: 2,
          demotedYear: 1,
          lastTeamId: "T1",
          lastTeamName: "T1",
        },
      ],
    };
    const entries = [...completed, unfinished];
    const profile = playerProfile(entries, "vet")!;
    expect(profile.tenures.every((t) => t.seasonId !== "LIVE")).toBe(true);
    expect(profile.tenures).toHaveLength(1);
    expect(profile.tenures[0]!.academyYears).toBe(1);
    // Current Hall status also ignores unfinished archives.
    expect(playerCareerStatuses(entries).get("vet")?.academyYears).toBe(1);
  });

  it("live inactive overlays current status without adding a tenure row", () => {
    const entries = withPool(
      [["vet", "b", "c", "d", "e"]],
      [
        [
          {
            playerId: "vet",
            lane: "top",
            tier: "C",
            status: "academy",
            inactiveYears: 1,
            demotedYear: 1,
            lastTeamId: "T1",
          },
        ],
      ],
    );
    const liveInactive = [
      {
        playerId: "vet",
        lane: "top" as const,
        tier: "C" as const,
        status: "academy" as const,
        inactiveYears: 2,
        demotedYear: 1,
        lastTeamId: "T1",
      },
    ];
    const profile = playerProfile(entries, "vet", { liveInactive })!;
    expect(profile.careerStatus).toBe("academy");
    expect(profile.academyYears).toBe(2);
    expect(profile.tenures).toHaveLength(1);
    expect(profile.tenures[0]!.academyYears).toBe(1);
  });
});

describe("coach playstyle", () => {
  it("surfaces the most-recent playstyle on the profile", () => {
    const c = coachProfile(retiredFixture([["a", "b", "c", "d", "e"]]), "Kim");
    expect(c?.playstyle).toBe("Aggressive");
  });
});

// Two seasons: a player moves T1→GEN, T1 wins Worlds in S1, GEN wins it in S2.
function entries(): SeasonHistoryEntry[] {
  const t1 = { name: "T1", leagueId: "LCK" as const, color: "#e00", iconKey: "sword" };
  const gen = { name: "GEN", leagueId: "LCK" as const, color: "#0e0", iconKey: "crown" };
  const roster = (names: string[], ids: string[]) =>
    (["top", "jungle", "middle", "bottom", "support"] as const).map((lane, i) => ({
      id: ids[i],
      name: names[i],
      tier: "A" as const,
      lane,
    }));
  const mk = (
    id: string,
    name: string,
    archivedAt: number,
    champ: typeof t1,
    teamsByStage: { mid: string; idMid: string; team: typeof t1; coach: string }[],
  ): SeasonHistoryEntry =>
    ({
      id,
      archivedAt,
      name,
      complete: true,
      champion: champ,
      runnerUp: champ === t1 ? gen : t1,
      intlChampions: { worlds: champ },
      splitChampions: { winter: { LCK: champ } },
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Winter Split",
          kind: "split" as const,
          split: "winter" as const,
          teams: teamsByStage.map((s) => ({
            teamId: s.team.name,
            teamName: s.team.name,
            leagueId: "LCK" as const,
            coach: { name: s.coach, rating: 4 },
            players: roster(["a", s.mid, "c", "d", "e"], ["i0", s.idMid, "i2", "i3", "i4"]),
          })),
        },
        {
          phaseIndex: 1,
          label: "Worlds",
          kind: "international" as const,
          event: "worlds" as const,
          teams: teamsByStage.map((s) => ({
            teamId: s.team.name,
            teamName: s.team.name,
            leagueId: "LCK" as const,
            coach: { name: s.coach, rating: 4 },
            players: roster(["a", s.mid, "c", "d", "e"], ["i0", s.idMid, "i2", "i3", "i4"]),
          })),
        },
      ],
      playerCareers: [
        { playerId: "faker", playerName: "Faker", leagueId: "LCK", teamName: champ.name, games: 30, kills: 100, mvps: 2, allPro: 1, splitTitles: 1, intlAppearances: 1, intlTitles: 1 },
      ],
    }) as unknown as SeasonHistoryEntry;

  // Season 1: Faker (id "faker") on T1, T1 wins Worlds. Coach "kkOma" on T1.
  const s1 = mk("s1", "Year 1", 1, t1, [
    { mid: "Faker", idMid: "faker", team: t1, coach: "kkOma" },
    { mid: "Chovy", idMid: "chovy", team: gen, coach: "Score" },
  ]);
  // Season 2: Faker moved to GEN, GEN wins Worlds. Coach "kkOma" now on GEN.
  const s2 = mk("s2", "Year 2", 2, gen, [
    { mid: "Faker", idMid: "faker", team: gen, coach: "kkOma" },
    { mid: "Zeus", idMid: "zeus", team: t1, coach: "Daeny" },
  ]);
  return [s1, s2];
}

describe("history search indexes", () => {
  it("lists players, teams and coaches", () => {
    const es = entries();
    expect(listPlayers(es).map((p) => p.id)).toContain("faker");
    expect(listTeams(es).map((t) => t.name).sort()).toEqual(["GEN", "T1"]);
    expect(listCoaches(es).sort()).toEqual(["Daeny", "Score", "kkOma"].sort());
  });

  it("carries rating/tier + identity on the hits", () => {
    const es = entries();
    const faker = listPlayers(es).find((p) => p.id === "faker")!;
    expect(faker.tier).toBe("A"); // fixture seats everyone at A
    expect(faker.team?.name).toBe("GEN"); // most-recent team, enriched (logo/color)
    expect(faker.team?.color).toBe("#0e0");
    // Roster of five A-tier players → 4★.
    expect(teamStars(es).get("LCK:T1")).toBe(4);
    // Coaches carry their latest rating + team for the row logo.
    const kkoma = listCoachesRich(es).find((c) => c.name === "kkOma")!;
    expect(kkoma.rating).toBe(4);
    expect(kkoma.team?.name).toBe("GEN");
    // Sortable career stats ride along on the hits (for the order-by filter).
    // kkOma coached the Worlds+Winter winner in both seasons → 4 titles.
    expect(kkoma.titles).toBe(4);
    expect(faker.titles).toBe(4); // 2 Winter splits + 2 Worlds
    expect(faker.games).toBeGreaterThanOrEqual(0);
  });
});

describe("playerProfile", () => {
  it("tracks a player's team history and titles across seasons", () => {
    const p = playerProfile(entries(), "faker")!;
    expect(p.name).toBe("Faker");
    expect(p.career?.intlTitles).toBe(2); // aggregated from both seasons' careers
    // Newest first: Year 2 on GEN (won Worlds + Winter), Year 1 on T1 (won both).
    // One stint per season here (no mid-year transfer in the fixture).
    expect(p.tenures.map((t) => t.stints[0].team.name)).toEqual(["GEN", "T1"]);
    expect(p.tenures[0].titles.intl).toContain("worlds");
    expect(p.tenures[1].titles.intl).toContain("worlds");
    // Per-event aggregation: 2 Worlds across both seasons, plus 2 Winter splits.
    expect(p.intlTitles.worlds).toBe(2);
    expect(p.splitTitles).toBe(2);
    // Tenure team refs are enriched with the full identity (color/icon), not
    // bare shields synthesized from the roster snapshot.
    expect(p.tenures[0].stints[0].team.color).toBe("#0e0");
    expect(p.tenures[1].stints[0].team.iconKey).toBe("sword");
    expect(p.lane).toBe("jungle"); // primary position (fixture seats them at idx 1)
  });
});

describe("teamProfile", () => {
  it("shows a team's worlds results, titles, all stage rosters and coach per season", () => {
    const t = teamProfile(entries(), "LCK:T1")!;
    expect(t.team.name).toBe("T1");
    const [y2, y1] = t.seasons; // newest first
    expect(y1.worlds).toBe("champion"); // Year 1 T1 won
    expect(y1.intlTitles).toContain("worlds");
    expect(y2.worlds).toBe("finalist"); // Year 2 T1 lost final to GEN
    // Both stages (Winter Split + Worlds) are captured, in play order, each
    // with its coach.
    expect(y1.stages.map((s) => s.kind)).toEqual(["split", "international"]);
    expect(y1.stages[0].coach).toBe("kkOma");
    expect(y1.stages[0].roster).toHaveLength(5);
  });
});

describe("coachProfile", () => {
  it("follows a coach across teams and counts titles", () => {
    const c = coachProfile(entries(), "kkOma")!;
    expect(c.tenures.map((t) => t.team.name)).toEqual(["GEN", "T1"]); // moved
    // 4 titles total, now split out: 2 Winter splits + 2 Worlds.
    expect(c.splitTitles).toBe(2);
    expect(c.intlTitles.worlds).toBe(2);
    expect(c.team?.name).toBe("GEN"); // latest team, for the header logo
    expect(c.team?.color).toBe("#0e0"); // enriched identity
  });
});

describe("retired S+ players keep their tier in the search", () => {
  // Season 0: 'legend' is S+ on T1. Season 1: replaced by 'kid' (legend retired).
  const splusRetireFixture: SeasonHistoryEntry[] = [
    {
      id: "S0",
      archivedAt: 1,
      name: "Year 1",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Winter Split",
          kind: "split",
          split: "winter",
          teams: [
            {
              teamId: "T1",
              teamName: "T1",
              leagueId: "LCK",
              players: [
                { id: "legend", name: "Legend", tier: "S+", lane: "middle" },
                { id: "b", name: "B", tier: "A", lane: "top" },
              ],
            },
          ],
        },
      ],
      playerCareers: [
        { playerId: "legend", playerName: "Legend", leagueId: "LCK", teamName: "T1", games: 30, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlAppearances: 0, intlTitles: 0 },
        { playerId: "b", playerName: "B", leagueId: "LCK", teamName: "T1", games: 30, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlAppearances: 0, intlTitles: 0 },
      ],
    },
    {
      id: "S1",
      archivedAt: 2,
      name: "Year 2",
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: {},
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: "Winter Split",
          kind: "split",
          split: "winter",
          teams: [
            {
              teamId: "T1",
              teamName: "T1",
              leagueId: "LCK",
              players: [
                { id: "kid", name: "Kid", tier: "A", lane: "middle" },
                { id: "b", name: "B", tier: "A", lane: "top" },
              ],
            },
          ],
        },
      ],
      playerCareers: [
        { playerId: "kid", playerName: "Kid", leagueId: "LCK", teamName: "T1", games: 30, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlAppearances: 0, intlTitles: 0 },
        { playerId: "b", playerName: "B", leagueId: "LCK", teamName: "T1", games: 30, kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlAppearances: 0, intlTitles: 0 },
      ],
    },
  ] as unknown as SeasonHistoryEntry[];

  it("shows a retired player's final S+ tier (and flags them retired)", () => {
    const legend = listPlayers(splusRetireFixture).find((p) => p.id === "legend")!;
    expect(legend.tier).toBe("S+"); // their last-recorded tier is preserved visually
    expect(legend.retired).toBe(true);
    expect(playerProfile(splusRetireFixture, "legend")!.tier).toBe("S+");
  });
});

describe("computeCoachRecords", () => {
  it("tallies a coach's split + per-event intl titles with most-recent region", () => {
    const kk = computeCoachRecords(entries()).find((c) => c.name === "kkOma")!;
    expect(kk.splitTitles).toBe(2);
    expect(kk.worlds).toBe(2);
    expect(kk.intlTotal).toBe(2);
    expect(kk.total).toBe(4);
    expect(kk.leagueId).toBe("LCK");
    expect(kk.team?.name).toBe("GEN"); // most-recent team
  });
});

describe("computePlayerTitlesByEvent", () => {
  it("breaks a player's titles out by event (splits + FS/MSI/Worlds)", () => {
    const t = computePlayerTitlesByEvent(entries()).get("faker")!;
    expect(t.worlds).toBe(2); // won Worlds both years (T1 then GEN)
    expect(t.splits).toBe(2); // won the Winter split both years
    expect(t.firstStand).toBe(0);
    expect(t.msi).toBe(0);
  });
});

describe("teamProfile hall of fame", () => {
  it("ranks players by tenure with the team", () => {
    const t1 = teamProfile(entries(), "LCK:T1")!;
    const faker = t1.hallOfFame.find((h) => h.name === "Faker");
    expect(faker).toBeTruthy();
    expect(faker!.seasons).toBe(1); // only Year 1 on T1 (moved to GEN in Year 2)
    expect(faker!.stages).toBeGreaterThan(0);
  });
});
