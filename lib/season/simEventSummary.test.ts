import { describe, expect, it } from "vitest";
import type { EventChampion, EventPlayer } from "../eventStats";
import type { EventRecord } from "./eventHistory";
import { buildYearEventSummary } from "./simEventSummary";
import type { Lane } from "../types";

const team = { id: "t1", name: "Alpha", leagueId: "lck" as const, logoUrl: "/logos/alpha.png" };
function player(key: string, lane: Lane, o: Partial<EventPlayer> = {}): EventPlayer {
  return {
    key, playerId: key, name: key.toUpperCase(), lane, teams: [team],
    games: 10, wins: 6, rated: 10, ratingSum: 0, adjusted: 10, sum: 80, squares: 650,
    goldGames: 0, goldSum: 0, kills: 0, deaths: 0, assists: 0, kdaGames: 0, opportunities: 10, ...o,
  };
}
function champ(championId: number, picks: number, bans: number): EventChampion {
  return { championId, picks, bans, wins: 0, losses: 0, pickGames: picks, banGames: bans, presenceGames: picks + bans, roles: {} };
}
function record(version: 1 | 2, players: EventPlayer[], champions: EventChampion[], o: Partial<EventRecord> = {}): EventRecord {
  const stats = { games: 10, players, champions };
  const base = { id: "s:0:lck", label: "LCK · Winter", phaseIndex: 0, split: "winter", leagueId: "lck", championLanes: {}, ...o } as const;
  return version === 1
    ? ({ ...base, version: 1, scopes: [{ id: "all", label: "Whole event", stats, checkpoints: [] }] } as EventRecord)
    : ({ ...base, version: 2, scopes: [{ id: "all", label: "Whole event", stats, checkpointEncoding: "delta-v2", checkpoints: [] }] } as EventRecord);
}
const players = [
  player("a", "top", { sum: 90, squares: 820 }),
  player("b", "top", { sum: 70, squares: 500 }),
  player("c", "jungle", { rated: 1, adjusted: 1, games: 1 }),
];
const champs = [champ(5, 7, 1), champ(2, 7, 9), champ(9, 1, 9)];

describe("buildYearEventSummary", () => {
  it.each([1, 2] as const)("summarises leaders, provisional roles and champions (v%i)", (v) => {
    const s = buildYearEventSummary([record(v, players, champs)]);
    expect(s.events).toHaveLength(1);
    const e = s.events[0]!;
    expect(e).toMatchObject({ id: "s:0:lck", split: "winter", leagueId: "lck", games: 10 });
    const top = e.roles.find((r) => r.lane === "top")!;
    expect(top.leader).toMatchObject({ id: "a", name: "A", teamName: "Alpha", leagueId: "lck", teamId: "t1", logoUrl: "/logos/alpha.png" });
    expect(typeof top.leader!.score).toBe("number");
    expect(e.roles.find((r) => r.lane === "jungle")).toEqual({ lane: "jungle" });
    expect(e.roles.find((r) => r.lane === "mid")).toBeUndefined();
    expect(e.mostPicked).toEqual({ championId: 2, count: 7 });
    expect(e.mostBanned).toEqual({ championId: 2, count: 9 });
  });

  it("breaks ties by lowest champion id and is deterministic", () => {
    const a = buildYearEventSummary([record(2, players, [champ(8, 3, 0), champ(4, 3, 0)])]);
    const b = buildYearEventSummary([record(2, players, [champ(4, 3, 0), champ(8, 3, 0)])]);
    expect(a).toEqual(b);
    expect(a.events[0]!.mostPicked).toEqual({ championId: 4, count: 3 });
    expect(a.events[0]!.mostBanned).toBeUndefined();
  });

  it("treats missing or unusable records as not recorded, never zero", () => {
    expect(buildYearEventSummary(undefined)).toEqual({ events: [] });
    expect(buildYearEventSummary([])).toEqual({ events: [] });
    const noScope = { ...record(2, players, champs), scopes: [] } as EventRecord;
    expect(buildYearEventSummary([noScope])).toEqual({ events: [] });
  });

  it("keeps the summary compact and independent of the source record", () => {
    const many = Array.from({ length: 200 }, (_, i) => player(`p${i}`, (["top", "jungle", "mid", "adc", "support"] as const)[i % 5]!));
    const bigChamps = Array.from({ length: 160 }, (_, i) => champ(i + 1, i, i));
    const s = buildYearEventSummary([record(2, many, bigChamps)]);
    expect(JSON.stringify(s).length).toBeLessThan(900);
    expect(s.events[0]!.roles.length).toBeLessThanOrEqual(5);
  });
});
