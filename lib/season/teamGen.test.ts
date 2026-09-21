import { describe, it, expect } from "vitest";
import type { Champion, Lane } from "../types";
import { LANE_ORDER } from "../players";
import { generateSeasonTeams, assignRoleElites, SPLUS_PER_ROLE, STAR_DISTRIBUTIONS } from "./teamGen";
import type { SeasonTeam } from "./types";

let nid = 1;
const championPool = (): Champion[] =>
  LANE_ORDER.flatMap((lane) =>
    Array.from({ length: 8 }, (_, i) => ({ id: nid++, name: `${lane}-${i}`, alias: `${lane}-${i}`, roles: [], iconUrl: "", lanes: [lane as Lane] })),
  );
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("S+ elite promotion", () => {
  it("marks up to the top-N per role as S+, spread across regions", () => {
    const teams = generateSeasonTeams(championPool(), rngFrom(3));
    const byRole = new Map<Lane, number>();
    const regions = new Set<string>();
    for (const t of teams) {
      for (const p of t.players) {
        if (p.tier === "S+") {
          byRole.set(p.lane, (byRole.get(p.lane) ?? 0) + 1);
          regions.add(t.leagueId);
        }
      }
    }
    // At most SPLUS_PER_ROLE per role, and the role actually has some elites.
    for (const lane of LANE_ORDER) {
      expect(byRole.get(lane) ?? 0).toBeLessThanOrEqual(SPLUS_PER_ROLE);
    }
    expect([...byRole.values()].reduce((s, n) => s + n, 0)).toBeGreaterThan(0);
    // Elites aren't all in one region.
    expect(regions.size).toBeGreaterThan(1);
  });

  it("yearly refresh caps S+ at the per-role limit and is idempotent", () => {
    // 8 teams, each with an S-tier middle — only SPLUS_PER_ROLE may be S+.
    const team = (i: number): SeasonTeam =>
      ({
        id: `t${i}`,
        leagueId: "LCK",
        name: `T${i}`,
        players: (["top", "jungle", "middle", "bottom", "support"] as const).map((lane) => ({
          lane,
          tier: lane === "middle" ? "S" : "B",
          goodChamps: [],
          badChamps: [],
          name: `p${i}-${lane}`,
        })),
      }) as unknown as SeasonTeam;
    const teams = Array.from({ length: 8 }, (_, i) => team(i));
    const out = assignRoleElites(teams);
    const splus = out.flatMap((t) => t.players).filter((p) => p.lane === "middle" && p.tier === "S+");
    expect(splus).toHaveLength(SPLUS_PER_ROLE); // exactly the cap, others demoted to S
    // Re-running on the result keeps the same elite set (incumbents hold).
    const ids = (ts: SeasonTeam[]) => ts.flatMap((t) => t.players).filter((p) => p.tier === "S+").map((p) => p.name).sort();
    expect(ids(assignRoleElites(out))).toEqual(ids(out));
  });

  it("is deterministic for a given world (same champions + seed)", () => {
    const champs = championPool();
    const a = generateSeasonTeams(champs, rngFrom(7));
    const b = generateSeasonTeams(champs, rngFrom(7));
    const tiers = (teams: ReturnType<typeof generateSeasonTeams>) => teams.flatMap((t) => t.players.map((p) => p.tier)).join(",");
    expect(tiers(a)).toBe(tiers(b));
  });
});

it("initial half-step league targets preserve regional strength totals", () => {
  const totals = { LCK: 35, LPL: 35, LEC: 32, LCS: 31, CBLOL: 28, LCP: 28 };
  for (const [region, targets] of Object.entries(STAR_DISTRIBUTIONS)) {
    expect(targets.reduce((sum, value) => sum + value, 0)).toBe(totals[region as keyof typeof totals]);
    expect(targets.some(value => value % 1 === 0.5)).toBe(true);
    expect(targets.every(value => value >= 1 && value <= 5 && Number.isInteger(value * 2))).toBe(true);
  }
});
