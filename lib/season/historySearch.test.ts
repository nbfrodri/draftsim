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
} from "./historySearch";

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
