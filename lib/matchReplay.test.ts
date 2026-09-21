import { expect, it } from "vitest";
import { createSeries } from "./series";
import { replayPentakills, groupedReplayPentakills } from "./matchReplay";

it("uses the pentakiller's game-side lane after sides swap and picks change order, including multiple pentas", () => {
  const game = createSeries({ format: "bo3", blueTeam: "B", redTeam: "A", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false }).games[0];
  game.redPicks = [22, 1, 2, 3, 4];
  game.redRoles = ["bottom", "top", "jungle", "middle", "support"];
  game.recap = { mvp: null, biggestSwing: null, perPickNames: { blue: [], red: ["Top", "Jungle", "Mid", "Recorded carry", "Support"] }, perPickIds: { blue: [], red: ["top-id", "jungle-id", "mid-id", "stable-carry", "support-id"] },
    pentakills: [20, 30].map(minute => ({ minute, side: "red", championId: 22, championName: "Ashe", teamName: "A" })) };
  expect(replayPentakills(game)).toEqual([20, 30].map(minute => expect.objectContaining({ minute, lane: "bottom", playerName: "Recorded carry", playerId: "stable-carry" })));
  delete game.recap.perPickIds;
  delete game.recap.perPickNames;
  expect(replayPentakills(game)[0].playerName).toBeUndefined();
  delete game.recap.pentakills;
  expect(replayPentakills(game)).toEqual([]);
});

it("counts repeated pentas while keeping different sides, players and champions separate", () => {
  const game = createSeries({ format: "bo1", blueTeam: "A", redTeam: "B", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false }).games[0];
  const penta = { minute: 20, side: "blue" as const, lane: "bottom" as const, championId: 22, championName: "Ashe", teamName: "A" };
  game.recap = { mvp: null, biggestSwing: null, pentakills: [penta, { ...penta, minute: 28 }, { ...penta, minute: 35 },
    { ...penta, side: "red", teamName: "B" }, { ...penta, lane: "middle", championId: 103, championName: "Ahri" }] };
  expect(groupedReplayPentakills(game).map(p => p.count)).toEqual([3, 1, 1]);
  expect(game.recap.pentakills).toHaveLength(5);
  delete game.recap.pentakills;
  expect(groupedReplayPentakills(game)).toEqual([]);
});
