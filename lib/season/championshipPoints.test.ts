import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { validHistoryEntry } from "../importValidation";
import { championshipPoints, championshipPointsRows, rankChampionshipPoints } from "./championshipPoints";
import { buildSeasonHistoryEntry } from "./history";

describe("championship points snapshots", () => {
  it("uses all five qualifying events and excludes Worlds and Global Cup", () => {
    const season = makeAuditSeason("Points");
    const [a, b, c] = season.teams;
    season.splitResults = {
      winter: { LCK: [a.id, b.id, c.id] }, spring: { LCK: [b.id, a.id, c.id] }, summer: { LCK: [c.id, b.id, a.id] },
    };
    season.intlResults = { "first-stand": [a.id, b.id], msi: [b.id, a.id], worlds: [c.id], "global-cup": [c.id] };
    expect(championshipPoints(season)).toEqual({ [a.id]: 51, [b.id]: 53, [c.id]: 22 });
    const rows = championshipPointsRows(season);
    expect(rows.find(row => row.teamId === a.id)).toMatchObject({
      total: 51, summerPlace: 3, stages: { winter: 10, spring: 8, summer: 6, "first-stand": 15, msi: 12 },
    });
    expect(rankChampionshipPoints(rows).slice(0, 3).map(row => row.teamId)).toEqual([b.id, a.id, c.id]);
  });

  it("keeps recorded zero separate from missing events and uses Summer to break points ties", () => {
    const season = makeAuditSeason("Points ties");
    const ids = season.teams.filter(t => t.leagueId === "LCK").map(t => t.id);
    season.splitResults = { winter: { LCK: ids }, summer: { LCK: [ids[1], ids[0], ...ids.slice(2)] } };
    const rows = championshipPointsRows(season);
    const ninth = rows.find(row => row.teamId === ids[8])!;
    expect(ninth.stages.winter).toBe(0);
    expect(ninth.stages.msi).toBeUndefined();
    expect(rows.filter(row => ids.slice(0, 2).includes(row.teamId)).map(row => row.total)).toEqual([18, 18]);
    expect(rankChampionshipPoints(rows)[0].teamId).toBe(ids[1]);
  });

  it("freezes points and identities on archive without merging same-named teams across regions", () => {
    const season = makeAuditSeason("Frozen points");
    const a = season.teams.find(t => t.leagueId === "LCK")!;
    const b = season.teams.find(t => t.leagueId === "LPL")!;
    a.name = b.name = "Shared name";
    a.logoUrl = "/team-logos/t1.png";
    season.splitResults = { winter: { LCK: [a.id], LPL: [b.id] } };
    season.intlResults = { "first-stand": [b.id, a.id] };
    const archive = buildSeasonHistoryEntry(season, 123);
    expect(validHistoryEntry(archive)).toBe(true);
    const sameName = archive.championshipPoints!.filter(row => row.team.name === "Shared name");
    expect(sameName.map(row => [row.team.leagueId, row.total])).toEqual([["LCK", 22], ["LPL", 25]]);
    a.name = "Renamed";
    a.logoUrl = "/changed.png";
    season.intlResults["first-stand"] = [a.id, b.id];
    expect(sameName[0].team).toMatchObject({ name: "Shared name", logoUrl: "/team-logos/t1.png" });
    expect(sameName[0].total).toBe(22);
  });

  it("accepts absent legacy snapshots but rejects corrupt or inconsistent imported point rows", () => {
    const entry = buildSeasonHistoryEntry(makeAuditSeason("Validated points"), 123);
    const row = entry.championshipPoints![0];
    const invalid = [
      { ...row, total: -1 }, { ...row, total: 5 }, { ...row, stages: { worlds: 10 }, total: 10 },
      { ...row, stages: { winter: -1 }, total: -1 }, { ...row, summerPlace: 0 },
      { ...row, team: { ...row.team, logoUrl: 123 } },
    ];
    for (const badRow of invalid) expect(validHistoryEntry({ ...entry, championshipPoints: [badRow] })).toBe(false);
    expect(validHistoryEntry({ ...entry, championshipPoints: [row, row] })).toBe(false);
    delete entry.championshipPoints;
    expect(validHistoryEntry(entry)).toBe(true);
    expect(entry.championshipPoints).toBeUndefined();
  });
});
