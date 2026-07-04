import { describe, expect, it } from "vitest";
import {
  bracketConnectorEdges,
  bracketConnectorPath,
} from "./bracketConnectors";
import type { TournamentMatch } from "./tournament";

function stubMatch(
  id: string,
  overrides: Partial<TournamentMatch> = {},
): TournamentMatch {
  return {
    id,
    round: 1,
    blueTeamId: null,
    redTeamId: null,
    format: "bo3",
    fearless: false,
    series: null,
    winner: null,
    feedsInto: null,
    ...overrides,
  } as TournamentMatch;
}

describe("bracketConnectorEdges", () => {
  it("derives winner edges from feedsInto within the match set", () => {
    const matches = [
      stubMatch("a", { feedsInto: { matchId: "c", slot: "blue" } }),
      stubMatch("b", { feedsInto: { matchId: "c", slot: "red" } }),
      stubMatch("c"),
    ];
    const edges = bracketConnectorEdges(matches);
    expect(edges).toEqual([
      {
        fromId: "a",
        toId: "c",
        kind: "winner",
        toSlot: "blue",
      },
      {
        fromId: "b",
        toId: "c",
        kind: "winner",
        toSlot: "red",
      },
    ]);
  });

  it("ignores losersFeedsInto — loser-drop wires are not rendered", () => {
    const matches = [
      stubMatch("w1", {
        losersFeedsInto: { matchId: "l1", slot: "red" },
      }),
      stubMatch("l1"),
    ];
    const edges = bracketConnectorEdges(matches);
    expect(edges).toEqual([]);
  });

  it("ignores links to matches outside the subset", () => {
    const matches = [
      stubMatch("a", { feedsInto: { matchId: "outside", slot: "blue" } }),
    ];
    expect(bracketConnectorEdges(matches)).toEqual([]);
  });
});

describe("bracketConnectorPath", () => {
  it("builds a horizontal-vertical-horizontal path", () => {
    const container = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
    } as DOMRect;
    const from = {
      left: 10,
      top: 40,
      right: 110,
      bottom: 120,
      width: 100,
      height: 80,
    } as DOMRect;
    const to = {
      left: 250,
      top: 60,
      right: 350,
      bottom: 140,
      width: 100,
      height: 80,
    } as DOMRect;
    const d = bracketConnectorPath(from, to, container, "blue");
    expect(d).toMatch(/^M 110 80 H 180 V \d+(?:\.\d+)? H 250$/);
  });
});
