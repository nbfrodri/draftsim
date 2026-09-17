import { expect, it } from "vitest";
import { buildLivePlayerFeed, mergeLivePlayerSearch, livePlayerSearch } from "./livePlayerSearch";
import type {
  SimResultTeamRef,
  SimRosterMovesEntry,
} from "./simResultsSummary";
import type { SeasonState } from "./types";
const a: SimResultTeamRef = {
  id: "a",
  name: "Alpha",
  leagueId: "LCK",
  iconKey: "a",
  color: "#fff",
};
const b: SimResultTeamRef = { ...a, id: "b", name: "Beta" };
const entry: SimRosterMovesEntry = {
  kind: "roster-moves",
  year: 2,
  seasonId: "s2",
  afterEvent: "msi",
  label: "Post MSI",
  moves: [
    {
      fromTeam: a,
      toTeam: b,
      lane: "middle",
      starId: "star",
      starName: "Same",
      swapId: "swap",
      swapName: "Same",
      starTier: "S",
      swapTier: "A",
    },
  ],
};
it("keeps same-name players separate and follows both sides of a swap", () => {
  const rows = livePlayerSearch([entry], null);
  expect(rows).toHaveLength(2);
  expect(rows.find((p) => p.id === "star")!.moves[0]).toMatchObject({
    from: "Alpha",
    to: "Beta",
    year: 2,
  });
  expect(rows.find((p) => p.id === "swap")!.team?.id).toBe("a");
});
it("uses current inactive status after simulation and keeps live transfer history", () => {
  const season = {
    teams: [],
    franchise: {
      inactivePool: [
        {
          player: { id: "star", name: "Same", lane: "middle", tier: "S" },
          status: "retired",
        },
      ],
    },
  } as unknown as SeasonState;
  const row = livePlayerSearch([entry], season).find((p) => p.id === "star")!;
  expect(row.status).toBe("Retired");
  expect(row.team).toBeUndefined();
  expect(row.moves).toHaveLength(1);
});
it("handles academy callups and exits without inventing a reverse swap", () => {
  const rows = livePlayerSearch(
    [
      {
        ...entry,
        moves: [
          { ...entry.moves[0], kind: "callup" },
          { ...entry.moves[0], kind: "retire" },
        ],
      },
    ],
    null,
  );
  expect(rows.find((p) => p.id === "star")!.moves[0].from).toBe("Academy");
  expect(rows.find((p) => p.id === "swap")!.status).toBe("Retired");
  expect(rows.find((p) => p.id === "swap")!.moves).toHaveLength(1);
});

it("preserves team references for movement logos without inventing teams for lifecycle badges", () => {
  const feed = buildLivePlayerFeed([entry]);
  expect(feed.find(p => p.id === "star")!.moves[0]).toMatchObject({ fromTeam: a, toTeam: b });
  expect(feed.find(p => p.id === "swap")!.moves[0]).toMatchObject({ fromTeam: b, toTeam: a });
  const callup = buildLivePlayerFeed([{ ...entry, moves: [{ ...entry.moves[0], kind: "callup" }] }])[0];
  expect(callup.moves[0].fromTeam).toBeUndefined();
  expect(callup.moves[0].toTeam).toBe(b);
});
it("reuses the feed index across roster changes without mutating cached movements or state", () => {
  const feed = buildLivePlayerFeed([entry]);
  const player = { id: "star", name: "Same", lane: "middle" as const, tier: "S" as const, goodChamps: [], badChamps: [] };
  const updated = mergeLivePlayerSearch(feed, [], [{ player, status: "retired", inactiveYears: 1, demotedYear: 3, lastTeamId: b.id }]);
  expect(updated.find(p => p.id === "star")!.status).toBe("Retired");
  expect(feed.find(p => p.id === "star")!.status).toBe("Main roster");
  expect(updated.find(p => p.id === "star")!.moves).toBe(feed.find(p => p.id === "star")!.moves);
  expect(mergeLivePlayerSearch(feed, [], []).find(p => p.id === "star")!.team).toBe(b);
});
