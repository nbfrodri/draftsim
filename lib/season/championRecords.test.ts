import { describe,it,expect } from "vitest";
import { championRecords } from "./championRecords";
import type { SeasonHistoryEntry } from "./history";

function archive(id:string, archivedAt:number, games:number): SeasonHistoryEntry {
  return {id,archivedAt,complete:true,name:id,champion:null,runnerUp:null,intlChampions:{},splitChampions:{},playerCareers:[
    {playerId:"a",playerName:"Same name",leagueId:"LCK",lane:"middle",games,kills:0,mvps:0,allPro:0,splitTitles:0,intlAppearances:0,intlTitles:0,champs:[{championId:1,games,wins:games-1}]},
    {playerId:"b",playerName:"Same name",leagueId:"LEC",lane:"top",games:2,kills:0,mvps:0,allPro:0,splitTitles:0,intlAppearances:0,intlTitles:0,champs:[{championId:1,games:2,wins:0}]}
  ]};
}
describe("global champion records",()=>{
  it("replaces duplicate archives, sums games and outcomes and keeps identical player names separate",()=>{
    const a=archive("one",1,10), replacement=archive("one",2,20), b=archive("two",3,30);
    const data=championRecords([a,replacement,b]);
    expect(data.rows[0]).toMatchObject({championId:1,games:54,wins:48,losses:6});
    expect(data.rows[0].players.map(p=>[p.id,p.games,p.seasonId])).toEqual([["a",50,"two"],["b",4,"two"]]);
    expect(data.seasons).toBe(2);
    expect(data.incompleteSeasons).toBe(0);
  });
  it("reports incomplete pools and ignores unfinished seasons",()=>{
    const old=archive("old",1,20);
    old.playerCareers![0].champs![0].games=10;
    old.playerCareers![0].champs![0].wins=9;
    expect(championRecords([old,{...archive("live",2,100),complete:false}])).toMatchObject({seasons:1,incompleteSeasons:1});
    expect(championRecords([]).rows).toEqual([]);
  });
  it("preserves all champions and sorts by games without capping the leaderboard",()=>{
    const e=archive("many",1,60);
    e.playerCareers=e.playerCareers!.slice(0,1);
    e.playerCareers[0].champs=Array.from({length:60},(_,i)=>({championId:i+1,games:i+1,wins:0}));
    const rows=championRecords([e]).rows;
    expect(rows).toHaveLength(60);
    expect(rows[0].championId).toBe(60);
    expect(rows.at(-1)!.championId).toBe(1);
  });
  it("counts only seasons played in the selected role when a player changes roles", () => {
    const old = archive("old", 1, 10);
    const recent = archive("recent", 2, 20);
    recent.playerCareers![0].lane = "top";

    const mid = championRecords([old, recent], "middle");
    expect(mid.rows[0]).toMatchObject({ championId: 1, games: 10, wins: 9, losses: 1 });
    expect(mid.rows[0].players).toEqual([
      expect.objectContaining({ id: "a", lane: "middle", games: 10, seasonId: "old" }),
    ]);
    const top = championRecords([old, recent], "top");
    expect(top.rows[0]).toMatchObject({ games: 24, wins: 19, losses: 5 });
    expect(top.rows[0].players.map(p => [p.id, p.games])).toEqual([["a", 20], ["b", 4]]);
    expect(championRecords([old, recent]).rows[0].games).toBe(34);
  });
  it("reranks champions by filtered games and preserves history coverage for empty roles", () => {
    const e = archive("one", 1, 100);
    e.playerCareers![1].games = 30;
    e.playerCareers![1].champs = [
      { championId: 1, games: 10, wins: 5 },
      { championId: 2, games: 20, wins: 12 },
    ];
    expect(championRecords([e]).rows.map(r => r.championId)).toEqual([1, 2]);
    expect(championRecords([e], "top").rows.map(r => [r.championId, r.games, r.wins, r.losses]))
      .toEqual([[2, 20, 12, 8], [1, 10, 5, 5]]);
    expect(championRecords([e], "support")).toEqual({ rows: [], seasons: 1, incompleteSeasons: 0 });
  });
  it("uses archived roster roles for legacy careers and leaves unknown roles unassigned", () => {
    const e = archive("legacy", 1, 10);
    delete e.playerCareers![0].lane;
    delete e.playerCareers![1].lane;
    e.phaseRosters = [{
      phaseIndex: 0, label: "Winter", kind: "split", split: "winter",
      teams: [{
        teamId: "t1", teamName: "T1", leagueId: "LCK",
        players: [{ id: "a", name: "Same name", lane: "jungle", tier: "S" }],
      }],
    }];
    expect(championRecords([e], "jungle").rows[0]).toMatchObject({ games: 10, wins: 9, losses: 1 });
    expect(championRecords([e], "top").rows).toEqual([]);
    expect(championRecords([e]).rows[0].games).toBe(12);
    e.playerCareers![1].champs = undefined;
    expect(championRecords([e], "support").incompleteSeasons).toBe(1);
  });
});
