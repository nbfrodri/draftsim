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
});
