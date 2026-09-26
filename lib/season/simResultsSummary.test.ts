import { describe, expect, it } from "vitest";

import {
  restoreFeedRosters,
  buildSplitResultEntry,
  buildIntlResultEntry,
  buildPostWorldsMovesEntry,
  buildPreIntlMovesEntry,
  buildRosterMovesEntry,
  buildYearResultEntry,
  collectSimResultUpdates,
  compressSimResultsFeed,
  countSummarizedYears,
  feedEntryOrder,
  groupSimResultFeedEntries,
  simResultKey,
  simResultYears,
  type SimResultEntry,
  type SimResultEntryCache,
  type SimSplitResultEntry,
  type SimIntlResultEntry,
} from "./simResultsSummary";
import { LEAGUE_IDS, type InternationalId, type SeasonState } from "./types";

function fabricate(
  parts: Partial<SeasonState> & Pick<SeasonState, "id">,
): SeasonState {
  return {
    name: "Test Season",
    status: "in-progress",
    teams: [
      {
        id: "t1",
        leagueId: "LCK",
        name: "Alpha",
        color: "#fff",
        iconKey: "shield",
        players: [],
        personalityId: "balanced",
      },
      {
        id: "t2",
        leagueId: "LCK",
        name: "Beta",
        color: "#000",
        iconKey: "shield",
        players: [],
        personalityId: "balanced",
      },
    ],
    splitResults: {},
    intlResults: {},
    phases: [],
    phaseIndex: 0,
    tournaments: {},
    config: {} as SeasonState["config"],
    currentMeta: {} as SeasonState["currentMeta"],
    updatedAt: 0,
    ...parts,
  } as SeasonState;
}

describe("collectSimResultUpdates", () => {
  it("emits split results once all leagues are placed", () => {
    const season = fabricate({
      id: "s1",
      franchise: { id: "r1", name: "Reality", year: 3 },
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
    });
    const seen = new Set<string>();
    const first = collectSimResultUpdates(season, seen);
    expect(first).toHaveLength(1);
    expect(first[0].kind).toBe("split");
    if (first[0].kind === "split") {
      expect(first[0].year).toBe(3);
      expect(first[0].leagues[0]?.placements[0]?.name).toBe("Alpha");
    }
    expect(collectSimResultUpdates(season, seen)).toHaveLength(0);
  });

  it("emits intl and year summaries when the season completes", () => {
    const season = fabricate({
      id: "s2",
      status: "complete",
      intlResults: {
        "first-stand": ["t1", "t2"],
        msi: ["t2", "t1"],
        worlds: ["t1", "t2"],
      },
      champion: "t1",
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const kinds = updates.map((u) => u.kind);
    expect(kinds).toContain("intl");
    expect(kinds).toContain("year");
    const year = updates.find((u) => u.kind === "year");
    expect(year && year.kind === "year" && year.worldsChampion?.name).toBe(
      "Alpha",
    );
  });
});

describe("simResultKey", () => {
  it("dedupes by season id and event", () => {
    const season = fabricate({
      id: "abc",
      status: "complete",
      intlResults: { worlds: ["t1"] },
    });
    const entry = buildYearResultEntry(season);
    expect(simResultKey(entry)).toBe("year:abc");
  });
});

describe("buildYearResultEntry", () => {
  it("includes followed-team placements when controlledTeamId is set", () => {
    const season = fabricate({
      id: "s3",
      status: "complete",
      config: { controlledTeamId: "t1" } as SeasonState["config"],
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t2", "t1"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
      intlResults: {
        "first-stand": ["t2", "t1"],
        msi: ["t1", "t2"],
        worlds: ["t2", "t1"],
      },
      champion: "t2",
    });
    const entry = buildYearResultEntry(season);
    expect(entry.followedTeam?.team.name).toBe("Alpha");
    expect(entry.followedTeam?.splits.winter).toBe(1);
    expect(entry.followedTeam?.intls.msi).toBe(1);
    expect(entry.followedTeam?.intls.worlds).toBe(2);
  });
});

describe("simResultYears", () => {
  it("returns sorted unique years from feed entries", () => {
    const years = simResultYears([
      { kind: "split", seasonId: "a", year: 5, split: "winter", label: "Winter Split", leagues: [] },
      { kind: "intl", seasonId: "a", year: 3, event: "msi", label: "MSI", placements: [] },
      { kind: "year", seasonId: "b", year: 5, seasonName: "Y5", splits: [], intls: [], worldsChampion: null, followedTeam: null },
      { kind: "roster-moves", seasonId: "a", year: 3, afterEvent: "msi", label: "Post MSI", moves: [] },
    ]);
    expect(years).toEqual([3, 5]);
  });
});

describe("roster-moves entries", () => {
  it("buildRosterMovesEntry returns null when no transfers exist", () => {
    const season = fabricate({ id: "s4" });
    expect(buildRosterMovesEntry(season, "first-stand")).toBeNull();
  });

  it("buildRosterMovesEntry builds an entry from transfersByEvent", () => {
    const season = fabricate({
      id: "s5",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: {
        "first-stand": [
          {
            event: "first-stand",
            lane: "middle",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S", grade: 8, goodChamps: [] },
            swap: { tier: "A", grade: 6, goodChamps: [] },
          },
        ],
      },
    });
    const entry = buildRosterMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.kind).toBe("roster-moves");
    expect(entry?.afterEvent).toBe("first-stand");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.lane).toBe("middle");
    expect(entry?.moves[0]?.starTier).toBe("S");
    expect(entry?.moves[0]?.swapTier).toBe("A");
    expect(entry?.moves[0]?.fromTeam.name).toBe("Alpha");
    expect(entry?.moves[0]?.toTeam.name).toBe("Beta");
  });

  it("collectSimResultUpdates emits roster-moves entry for completed transfer window", () => {
    const season = fabricate({
      id: "s6",
      franchise: { id: "r2", name: "Reality", year: 1 },
      intlResults: { "first-stand": ["t1", "t2"] },
      transfersByEvent: {
        "first-stand": [
          {
            event: "first-stand",
            lane: "top",
            fromTeamId: "t2",
            toTeamId: "t1",
            star: { tier: "A", grade: null, goodChamps: [] },
            swap: { tier: "B", grade: null, goodChamps: [] },
          },
        ],
      },
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const kinds = updates.map((u) => u.kind);
    expect(kinds).toContain("intl");
    expect(kinds).toContain("roster-moves");
    // Should not emit again
    expect(collectSimResultUpdates(season, seen)).toHaveLength(0);
  });

  it("buildRosterMovesEntry includes academy call-up from rosterNews window mark", () => {
    const season = fabricate({
      id: "s-callup",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "jungle",
          entrantName: "Prospect",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "First Stand window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.kind).toBe("roster-moves");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("callup");
    expect(entry?.moves[0]?.lane).toBe("jungle");
    expect(entry?.moves[0]?.starName).toBe("Prospect");
    expect(entry?.moves[0]?.starTier).toBe("B");
    expect(entry?.moves[0]?.toTeam.name).toBe("Alpha");
  });

  it("buildRosterMovesEntry includes FA signing from rosterNews window mark", () => {
    const season = fabricate({
      id: "s-fa-sign",
      franchise: { id: "r1", name: "Reality", year: 3 },
      rosterNews: [
        {
          teamId: "t2",
          lane: "top",
          departedName: "OldTop",
          departedTier: "C",
          entrantName: "FaStar",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "open-fa",
          timeMark: "MSI window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "msi");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("fa-sign");
    expect(entry?.moves[0]?.lane).toBe("top");
    expect(entry?.moves[0]?.starName).toBe("FaStar");
    expect(entry?.moves[0]?.swapName).toBe("OldTop");
    expect(entry?.moves[0]?.toTeam.name).toBe("Beta");
  });

  it("buildRosterMovesEntry excludes academy-stash noise but includes retire exits", () => {
    const season = fabricate({
      id: "s-noise",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "support",
          entrantName: "Stashed",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "academy-stash",
          timeMark: "First Stand window",
        },
        {
          teamId: "t1",
          lane: "bottom",
          departedName: "Veteran",
          departedTier: "B",
          entrantName: "Veteran",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "retired",
          timeMark: "First Stand window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("retire");
    expect(entry?.moves[0]?.lane).toBe("bottom");
  });

  it("buildRosterMovesEntry returns null when only non-feed rosterNews exists", () => {
    const season = fabricate({
      id: "s-stash-only",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "support",
          entrantName: "Stashed",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "academy-stash",
          timeMark: "First Stand window",
        },
      ],
    });
    expect(buildRosterMovesEntry(season, "first-stand")).toBeNull();
  });

  it("buildRosterMovesEntry includes manual-demote as demotion kind", () => {
    const season = fabricate({
      id: "s-demote",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          departedName: "BenchedTop",
          departedTier: "B",
          entrantName: "AcyReplacement",
          entrantTier: "C",
          entrantPotential: "B",
          entrantSource: "academy",
          marketNote: "manual-demote",
          timeMark: "First Stand window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("demotion");
    expect(entry?.moves[0]?.lane).toBe("top");
    expect(entry?.moves[0]?.swapName).toBe("BenchedTop");
    expect(entry?.moves[0]?.swapTier).toBe("B");
    expect(entry?.moves[0]?.fromTeam.name).toBe("Alpha");
  });

  it("buildRosterMovesEntry includes ai-demote as demotion kind", () => {
    const season = fabricate({
      id: "s-ai-demote",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t2",
          lane: "jungle",
          departedName: "WeakJungler",
          departedTier: "C",
          entrantName: "NewJungler",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "ai-demote",
          timeMark: "MSI window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "msi");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("demotion");
    expect(entry?.moves[0]?.swapName).toBe("WeakJungler");
    expect(entry?.moves[0]?.fromTeam.name).toBe("Beta");
  });

  it("buildRosterMovesEntry includes retirement and callup together in the same window", () => {
    const season = fabricate({
      id: "s-mixed-retire",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "support",
          departedName: "OldVet",
          departedTier: "A",
          entrantName: "OldVet",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "retired",
          timeMark: "MSI window",
        },
        {
          teamId: "t2",
          lane: "middle",
          entrantName: "AcyMid",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "MSI window",
        },
      ],
    });
    const entry = buildRosterMovesEntry(season, "msi");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(2);
    const retire = entry?.moves.find((m) => m.kind === "retire");
    const callup = entry?.moves.find((m) => m.kind === "callup");
    expect(retire?.swapName).toBe("OldVet");
    expect(callup?.starName).toBe("AcyMid");
  });

  it("collectSimResultUpdates emits roster-moves when only rosterNews fills exist (no transfersByEvent)", () => {
    const season = fabricate({
      id: "s-rn-only",
      franchise: { id: "r2", name: "Reality", year: 1 },
      intlResults: { "first-stand": ["t1", "t2"] },
      rosterNews: [
        {
          teamId: "t1",
          lane: "middle",
          entrantName: "CallUp",
          entrantTier: "A",
          entrantPotential: "S",
          entrantSource: "academy",
          marketNote: "agency-callup",
          timeMark: "First Stand window",
        },
      ],
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const kinds = updates.map((u) => u.kind);
    expect(kinds).toContain("roster-moves");
    const rm = updates.find((u) => u.kind === "roster-moves");
    expect(rm?.kind === "roster-moves" && rm.moves[0]?.kind).toBe("callup");
  });

  it("collectSimResultUpdates does not emit post-worlds entry for year-1 season (no prior year)", () => {
    const season = fabricate({
      id: "s7",
      franchise: { id: "r3", name: "Reality", year: 1 },
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "support",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S", grade: null, goodChamps: [] },
            swap: { tier: "A", grade: null, goodChamps: [] },
          },
        ],
      },
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    expect(updates.every((u) => u.kind !== "roster-moves")).toBe(true);
  });

  it("collectSimResultUpdates includes roster snapshots in split entries", () => {
    const season = fabricate({
      id: "s8",
      franchise: { id: "r4", name: "Reality", year: 1 },
      teams: [
        {
          id: "t1",
          leagueId: "LCK",
          name: "Alpha",
          color: "#fff",
          iconKey: "shield",
          players: [
            { lane: "top", tier: "S", name: "Zeus", goodChamps: [], badChamps: [] },
            { lane: "jungle", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "middle", tier: "S+", name: "Faker", goodChamps: [], badChamps: [] },
            { lane: "bottom", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "support", tier: "B", goodChamps: [], badChamps: [] },
          ],
          personalityId: "balanced",
        },
        { id: "t2", leagueId: "LCK", name: "Beta", color: "#000", iconKey: "shield", players: [], personalityId: "balanced" },
      ],
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
    });
    season.phaseRosters = [{ phaseIndex: 0, kind: "split", split: "winter", label: "Winter", teams: season.teams.map(t => ({ teamId: t.id, teamName: t.name, leagueId: t.leagueId, players: structuredClone(t.players) })) }];
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const split = updates.find((u) => u.kind === "split");
    expect(split?.kind === "split" && split.rosterSnapshots?.["t1"]).toBeDefined();
    const snap = split?.kind === "split" ? split.rosterSnapshots?.["t1"] : undefined;
    expect(snap?.find((p) => p.name === "Faker")?.tier).toBe("S+");
  });

  it("year entry split/intl snapshots reflect event-time roster, not post-transfer lineup", () => {
    // Simulate split-1 captured with the original roster ("OldTop").
    const splitSeason = fabricate({
      id: "s-snap-fix",
      franchise: { id: "r6", name: "Reality", year: 2 },
      teams: [
        {
          id: "t1",
          leagueId: "LCK",
          name: "Alpha",
          color: "#fff",
          iconKey: "shield",
          players: [
            { lane: "top", tier: "S", name: "OldTop", goodChamps: [], badChamps: [] },
            { lane: "jungle", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "middle", tier: "S+", name: "Faker", goodChamps: [], badChamps: [] },
            { lane: "bottom", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "support", tier: "B", goodChamps: [], badChamps: [] },
          ],
          personalityId: "balanced",
        },
        { id: "t2", leagueId: "LCK", name: "Beta", color: "#000", iconKey: "shield", players: [], personalityId: "balanced" },
      ],
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
    });

    const seen = new Set<string>();
    const entryCache: SimResultEntryCache = new Map();

    splitSeason.phaseRosters = [{ phaseIndex: 0, kind: "split", split: "winter", label: "Winter", teams: splitSeason.teams.map(t => ({ teamId: t.id, teamName: t.name, leagueId: t.leagueId, players: structuredClone(t.players) })) }];
    // Call 1: capture winter split with original roster.
    const firstUpdates = collectSimResultUpdates(splitSeason, seen, entryCache);
    expect(firstUpdates.find((u) => u.kind === "split")).toBeDefined();

    // "Transfer window": t1 replaces OldTop with NewTop.
    const completedSeason = fabricate({
      id: "s-snap-fix",
      status: "complete",
      franchise: { id: "r6", name: "Reality", year: 2 },
      teams: [
        {
          id: "t1",
          leagueId: "LCK",
          name: "Alpha",
          color: "#fff",
          iconKey: "shield",
          players: [
            { lane: "top", tier: "A", name: "NewTop", goodChamps: [], badChamps: [] },
            { lane: "jungle", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "middle", tier: "S+", name: "Faker", goodChamps: [], badChamps: [] },
            { lane: "bottom", tier: "A", goodChamps: [], badChamps: [] },
            { lane: "support", tier: "B", goodChamps: [], badChamps: [] },
          ],
          personalityId: "balanced",
        },
        { id: "t2", leagueId: "LCK", name: "Beta", color: "#000", iconKey: "shield", players: [], personalityId: "balanced" },
      ],
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
      intlResults: { worlds: ["t1", "t2"] },
      champion: "t1",
    });

    // Call 2: season complete with post-transfer roster — same seen + entryCache.
    const yearUpdates = collectSimResultUpdates(completedSeason, seen, entryCache);
    const yearEntry = yearUpdates.find((u) => u.kind === "year");
    expect(yearEntry).toBeDefined();

    if (yearEntry?.kind === "year") {
      const winterSplit = yearEntry.splits.find((s) => s.split === "winter");
      expect(winterSplit).toBeDefined();
      const snap = winterSplit?.rosterSnapshots?.["t1"];
      expect(snap).toBeDefined();
      // Should preserve OldTop from split-completion time, not NewTop from post-transfer.
      expect(snap?.find((p) => p.name === "OldTop")).toBeDefined();
      expect(snap?.find((p) => p.name === "NewTop")).toBeUndefined();
    }
  });
});

describe("compressSimResultsFeed", () => {
  it("keeps only year summaries for older franchise years", () => {
    const yearSummary = (year: number): SimResultEntry => ({
      kind: "year",
      seasonId: `y${year}`,
      year,
      seasonName: `Year ${year}`,
      splits: [],
      intls: [],
      worldsChampion: null,
      followedTeam: null,
    });
    const split = (year: number): SimResultEntry => ({
      kind: "split",
      seasonId: `y${year}`,
      year,
      split: "winter",
      label: "Winter Split",
      leagues: [],
    });

    const entries: SimResultEntry[] = [
      split(1),
      yearSummary(1),
      split(2),
      yearSummary(2),
      split(3),
      yearSummary(3),
      split(4),
      yearSummary(4),
      split(5),
      yearSummary(5),
    ];

    const compressed = compressSimResultsFeed(entries, 3);
    expect(compressed).toHaveLength(8);
    expect(compressed.filter((e) => e.year === 1)).toEqual([yearSummary(1)]);
    expect(compressed.filter((e) => e.year === 2)).toEqual([yearSummary(2)]);
    expect(compressed.filter((e) => e.kind === "split" && e.year >= 3)).toHaveLength(3);
    expect(countSummarizedYears(compressed)).toBe(2);
  });

  it("returns the same array reference when compression is a no-op", () => {
    const entries: SimResultEntry[] = [
      {
        kind: "year",
        seasonId: "y1",
        year: 1,
        seasonName: "Year 1",
        splits: [],
        intls: [],
        worldsChampion: null,
        followedTeam: null,
      },
    ];
    expect(compressSimResultsFeed(entries, 3)).toBe(entries);
  });
});

describe("groupSimResultFeedEntries", () => {
  it("orders pre-intl roster moves before their international event", () => {
    const entries: SimResultEntry[] = [
      {
        kind: "intl",
        seasonId: "s1",
        year: 2,
        event: "first-stand",
        label: "First Stand",
        placements: [],
      },
      {
        kind: "roster-moves",
        seasonId: "s1",
        year: 2,
        afterEvent: "first-stand",
        label: "Pre",
        moves: [],
        preIntl: true,
      },
      {
        kind: "split",
        seasonId: "s1",
        year: 2,
        split: "winter",
        label: "Winter Split",
        leagues: [],
      },
    ];
    const grouped = groupSimResultFeedEntries(entries);
    expect(grouped).toHaveLength(1);
    const order = grouped[0]![1].map((e) => e.kind);
    expect(order).toEqual(["split", "roster-moves", "intl"]);
    expect(feedEntryOrder(entries[1]!)).toBeLessThan(feedEntryOrder(entries[0]!));
  });

  it("omits roster-moves when showRosterMoves is false", () => {
    const entries: SimResultEntry[] = [
      {
        kind: "split",
        seasonId: "s1",
        year: 1,
        split: "winter",
        label: "Winter Split",
        leagues: [],
      },
      {
        kind: "roster-moves",
        seasonId: "s1",
        year: 1,
        afterEvent: "first-stand",
        label: "Post FS",
        moves: [],
      },
    ];
    const grouped = groupSimResultFeedEntries(entries, false);
    expect(grouped[0]![1]).toHaveLength(1);
    expect(grouped[0]![1][0]?.kind).toBe("split");
  });
});

describe("post-Worlds offseason entries", () => {
  it("buildPostWorldsMovesEntry returns null for year-1 season", () => {
    const season = fabricate({
      id: "pw-yr1",
      franchise: { id: "r1", name: "Reality", year: 1 },
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "top",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S", grade: null, goodChamps: [] },
            swap: { tier: "A", grade: null, goodChamps: [] },
          },
        ],
      },
    });
    expect(buildPostWorldsMovesEntry(season)).toBeNull();
  });

  it("buildPostWorldsMovesEntry returns null when worldsOffseasonBaseline > 0", () => {
    const season = fabricate({
      id: "pw-baseline",
      franchise: { id: "r1", name: "Reality", year: 2 },
      worldsOffseasonBaseline: 1,
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "top",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S", grade: null, goodChamps: [] },
            swap: { tier: "A", grade: null, goodChamps: [] },
          },
        ],
      },
    });
    expect(buildPostWorldsMovesEntry(season)).toBeNull();
  });

  it("buildPostWorldsMovesEntry builds an entry from worlds carry moves in year-2 season", () => {
    const season = fabricate({
      id: "pw-yr2",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "jungle",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S+", grade: 9, goodChamps: [] },
            swap: { tier: "B", grade: 4, goodChamps: [] },
          },
        ],
      },
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.kind).toBe("roster-moves");
    expect(entry?.afterEvent).toBe("worlds");
    expect(entry?.label).toBe("Post Worlds");
    // Attributed to the CLOSING year (year - 1).
    expect(entry?.year).toBe(1);
    expect(entry?.seasonId).toBe("pw-yr2");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.lane).toBe("jungle");
    expect(entry?.moves[0]?.starTier).toBe("S+");
    expect(entry?.moves[0]?.fromTeam.name).toBe("Alpha");
    expect(entry?.moves[0]?.toTeam.name).toBe("Beta");
  });

  it("buildPostWorldsMovesEntry includes Offseason-tagged rosterNews call-ups", () => {
    const season = fabricate({
      id: "pw-rn",
      franchise: { id: "r1", name: "Reality", year: 3 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "bottom",
          entrantName: "OffseasonRookie",
          entrantTier: "A",
          entrantPotential: "S",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Offseason",
        },
        {
          teamId: "t2",
          lane: "top",
          departedName: "Retiree",
          departedTier: "B",
          entrantName: "Retiree",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "retired",
          timeMark: "Offseason",
        },
      ],
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(2);
    const callup = entry?.moves.find((m) => m.kind === "callup");
    expect(callup?.starName).toBe("OffseasonRookie");
    expect(callup?.lane).toBe("bottom");
    const retire = entry?.moves.find((m) => m.kind === "retire");
    expect(retire?.swapName).toBe("Retiree");
    expect(retire?.lane).toBe("top");
  });

  it("buildPostWorldsMovesEntry includes Offseason FA signing", () => {
    const season = fabricate({
      id: "pw-fa",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t2",
          lane: "middle",
          departedName: "OldMid",
          departedTier: "C",
          entrantName: "FaVet",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "open-fa",
          timeMark: "Offseason",
        },
      ],
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.moves[0]?.kind).toBe("fa-sign");
    expect(entry?.moves[0]?.starName).toBe("FaVet");
    expect(entry?.moves[0]?.swapName).toBe("OldMid");
    expect(entry?.year).toBe(1);
  });

  it("buildPostWorldsMovesEntry includes Offseason manual-demote as demotion kind", () => {
    const season = fabricate({
      id: "pw-demote",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "middle",
          departedName: "BenchedMid",
          departedTier: "B",
          entrantName: "NewMid",
          entrantTier: "C",
          entrantPotential: "B",
          entrantSource: "academy",
          marketNote: "manual-demote",
          timeMark: "Offseason",
        },
      ],
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("demotion");
    expect(entry?.moves[0]?.swapName).toBe("BenchedMid");
    expect(entry?.moves[0]?.lane).toBe("middle");
    expect(entry?.year).toBe(1);
  });

  it("collectSimResultUpdates emits post-worlds entry for year-2 season with carry moves", () => {
    const season = fabricate({
      id: "pw-collect",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "support",
            fromTeamId: "t2",
            toTeamId: "t1",
            star: { tier: "A", grade: null, goodChamps: [] },
            swap: { tier: "C", grade: null, goodChamps: [] },
          },
        ],
      },
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const rm = updates.find((u) => u.kind === "roster-moves");
    expect(rm).toBeDefined();
    expect(rm?.kind === "roster-moves" && rm.afterEvent).toBe("worlds");
    expect(rm?.kind === "roster-moves" && rm.year).toBe(1);
    // Should not emit again on a second call.
    expect(collectSimResultUpdates(season, seen)).toHaveLength(0);
  });

  it("post-worlds entry is emitted before splits of the new year", () => {
    const season = fabricate({
      id: "pw-order",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: {
        worlds: [
          {
            event: "worlds",
            lane: "top",
            fromTeamId: "t1",
            toTeamId: "t2",
            star: { tier: "S", grade: null, goodChamps: [] },
            swap: { tier: "A", grade: null, goodChamps: [] },
          },
        ],
      },
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
    });
    const updates = collectSimResultUpdates(season, new Set<string>());
    const rmIdx = updates.findIndex((u) => u.kind === "roster-moves");
    const splitIdx = updates.findIndex((u) => u.kind === "split");
    expect(rmIdx).toBeGreaterThanOrEqual(0);
    expect(splitIdx).toBeGreaterThan(rmIdx);
  });
});

describe("pre-intl roster moves (mid-split checkpoint)", () => {
  it("buildPreIntlMovesEntry returns null when no rosterNews with pre-intl timeMark", () => {
    const season = fabricate({ id: "pi-empty" });
    expect(buildPreIntlMovesEntry(season, "first-stand")).toBeNull();
    expect(buildPreIntlMovesEntry(season, "msi")).toBeNull();
    expect(buildPreIntlMovesEntry(season, "worlds")).toBeNull();
    expect(buildPreIntlMovesEntry(season, "global-cup")).toBeNull();
  });

  it("buildPreIntlMovesEntry returns null when rosterNews only has post-intl marks", () => {
    const season = fabricate({
      id: "pi-post-only",
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "PostFS",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "First Stand window",
        },
      ],
    });
    // "First Stand window" is post-intl — should NOT appear in the pre-intl entry
    expect(buildPreIntlMovesEntry(season, "first-stand")).toBeNull();
  });

  it("buildPreIntlMovesEntry builds entry from timeMark 'Winter' for first-stand", () => {
    const season = fabricate({
      id: "pi-winter-fs",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "AcyTop",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Winter",
        },
      ],
    });
    const entry = buildPreIntlMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.kind).toBe("roster-moves");
    expect(entry?.preIntl).toBe(true);
    expect(entry?.afterEvent).toBe("first-stand");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("callup");
    expect(entry?.moves[0]?.lane).toBe("top");
    expect(entry?.moves[0]?.starName).toBe("AcyTop");
    expect(entry?.moves[0]?.toTeam.name).toBe("Alpha");
    expect(entry?.label).toContain("Winter");
  });

  it("buildPreIntlMovesEntry builds entry from timeMark 'Spring' for msi", () => {
    const season = fabricate({
      id: "pi-spring-msi",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t2",
          lane: "jungle",
          departedName: "OldJungler",
          departedTier: "C",
          entrantName: "FaJungler",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "open-fa",
          timeMark: "Spring",
        },
      ],
    });
    const entry = buildPreIntlMovesEntry(season, "msi");
    expect(entry).not.toBeNull();
    expect(entry?.preIntl).toBe(true);
    expect(entry?.afterEvent).toBe("msi");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("fa-sign");
    expect(entry?.moves[0]?.swapName).toBe("OldJungler");
    expect(entry?.label).toContain("Spring");
  });

  it("buildPreIntlMovesEntry builds entry from timeMark 'Summer' for worlds", () => {
    const season = fabricate({
      id: "pi-summer-worlds",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "bottom",
          departedName: "OldADC",
          departedTier: "A",
          entrantName: "OldADC",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "retired",
          timeMark: "Summer",
        },
      ],
    });
    const entry = buildPreIntlMovesEntry(season, "worlds");
    expect(entry).not.toBeNull();
    expect(entry?.preIntl).toBe(true);
    expect(entry?.afterEvent).toBe("worlds");
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.kind).toBe("retire");
    expect(entry?.label).toContain("Summer");
  });

  it("buildPreIntlMovesEntry excludes non-feed rosterNews (academy-stash etc.)", () => {
    const season = fabricate({
      id: "pi-noise",
      rosterNews: [
        {
          teamId: "t1",
          lane: "support",
          entrantName: "Stashed",
          entrantTier: "B",
          entrantPotential: "B",
          entrantSource: "free-agent",
          marketNote: "academy-stash",
          timeMark: "Winter",
        },
        {
          teamId: "t1",
          lane: "middle",
          entrantName: "Rook",
          entrantTier: "D",
          entrantPotential: "B",
          entrantSource: "rookie",
          marketNote: "open-fa",
          timeMark: "Winter",
        },
      ],
    });
    // academy-stash is not a main-roster fill; rookie (open-fa with entrantSource rookie) also excluded
    expect(buildPreIntlMovesEntry(season, "first-stand")).toBeNull();
  });

  it("simResultKey includes 'pre-' prefix for preIntl entries", () => {
    const season = fabricate({
      id: "pi-key",
      franchise: { id: "r1", name: "Reality", year: 2 },
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "AcyTop",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Winter",
        },
      ],
    });
    const entry = buildPreIntlMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(simResultKey(entry!)).toBe("roster-moves:pi-key:pre-first-stand");
  });

  it("collectSimResultUpdates emits pre-intl entry BEFORE the intl entry", () => {
    const season = fabricate({
      id: "pi-order",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { "first-stand": ["t1", "t2"] },
      rosterNews: [
        {
          teamId: "t1",
          lane: "middle",
          entrantName: "PreFSCallUp",
          entrantTier: "A",
          entrantPotential: "S",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Winter",        // ← pre-First Stand
        },
        {
          teamId: "t2",
          lane: "jungle",
          entrantName: "PostFSSign",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "open-fa",
          timeMark: "First Stand window", // ← post-First Stand
        },
      ],
      transfersByEvent: {
        "first-stand": [
          {
            event: "first-stand",
            lane: "top",
            fromTeamId: "t2",
            toTeamId: "t1",
            star: { tier: "A", grade: null, goodChamps: [] },
            swap: { tier: "B", grade: null, goodChamps: [] },
          },
        ],
      },
    });

    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);

    const intlIdx = updates.findIndex((u) => u.kind === "intl" && u.event === "first-stand");
    const preIdx = updates.findIndex(
      (u) => u.kind === "roster-moves" && "preIntl" in u && u.preIntl === true,
    );
    const postIdx = updates.findIndex(
      (u) => u.kind === "roster-moves" && !("preIntl" in u && u.preIntl),
    );

    // Pre-intl entry must come before the intl result
    expect(preIdx).toBeGreaterThanOrEqual(0);
    expect(intlIdx).toBeGreaterThan(preIdx);
    // Post-intl entry must come after the intl result
    expect(postIdx).toBeGreaterThan(intlIdx);

    // Pre-intl entry has the pre flag, post does not
    const preEntry = updates[preIdx];
    const postEntry = updates[postIdx];
    expect(preEntry?.kind === "roster-moves" && preEntry.preIntl).toBe(true);
    expect(postEntry?.kind === "roster-moves" && !postEntry.preIntl).toBe(true);

    // Pre-intl contains the "Winter" move, not the "First Stand window" move
    expect(preEntry?.kind === "roster-moves" && preEntry.moves[0]?.starName).toBe("PreFSCallUp");
    // Post-intl contains both the swap and the "First Stand window" fill
    expect(postEntry?.kind === "roster-moves" && postEntry.moves.length).toBe(2);

    // Keys are distinct — no collision
    expect(seen.has("roster-moves:pi-order:pre-first-stand")).toBe(true);
    expect(seen.has("roster-moves:pi-order:first-stand")).toBe(true);
  });

  it("collectSimResultUpdates does not emit pre-intl entry when no pre-intl rosterNews exists", () => {
    const season = fabricate({
      id: "pi-no-emit",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { msi: ["t1", "t2"] },
      // only post-MSI marks
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "PostMSI",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "MSI window",
        },
      ],
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const preEntries = updates.filter(
      (u) => u.kind === "roster-moves" && "preIntl" in u && u.preIntl === true,
    );
    expect(preEntries).toHaveLength(0);
    // Exactly one roster-moves entry (post-MSI), no pre-intl one
    expect(updates.filter((u) => u.kind === "roster-moves")).toHaveLength(1);
  });

  it("collectSimResultUpdates emits pre-intl at split completion without waiting for intl", () => {
    const season = fabricate({
      id: "pi-at-split",
      franchise: { id: "r1", name: "Reality", year: 2 },
      splitResults: {
        winter: {
          LCK: ["t1", "t2"],
          LPL: ["t1", "t2"],
          LEC: ["t1", "t2"],
          LCS: ["t1", "t2"],
          CBLOL: ["t1", "t2"],
          LCP: ["t1", "t2"],
        },
      },
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "WinterAcyFill",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Winter",
        },
      ],
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    expect(updates.map((u) => u.kind)).toEqual(["split", "roster-moves"]);
    const pre = updates[1];
    expect(pre?.kind === "roster-moves" && pre.preIntl).toBe(true);
    expect(pre?.kind === "roster-moves" && pre.afterEvent).toBe("first-stand");
    expect(pre?.kind === "roster-moves" && pre.moves[0]?.starName).toBe(
      "WinterAcyFill",
    );
    expect(seen.has("roster-moves:pi-at-split:pre-first-stand")).toBe(true);
    expect(seen.has("intl:pi-at-split:first-stand")).toBe(false);
  });

  it("deferred path: pre-intl emitted on second call after marks become available", () => {
    // Call 1: intl result exists but no pre-intl marks yet (demotions not run yet).
    const seen = new Set<string>();
    const seasonBeforeProceed = fabricate({
      id: "pi-deferred",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { "first-stand": ["t1", "t2"] },
      rosterNews: [],
    });
    const first = collectSimResultUpdates(seasonBeforeProceed, seen);
    // Only the intl entry is emitted; no roster-moves yet.
    expect(first.filter((u) => u.kind === "intl")).toHaveLength(1);
    expect(first.filter((u) => u.kind === "roster-moves")).toHaveLength(0);
    // Pre-intl key is NOT sealed — it must be re-checked on the next call.
    expect(seen.has("roster-moves:pi-deferred:pre-first-stand")).toBe(false);

    // Call 2: after Proceed. "Winter" (pre-FS) and "First Stand window" (post-FS) marks now exist.
    const seasonAfterProceed = fabricate({
      id: "pi-deferred",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { "first-stand": ["t1", "t2"] },
      transfersByEvent: {
        "first-stand": [{
          event: "first-stand",
          lane: "top",
          fromTeamId: "t2",
          toTeamId: "t1",
          star: { tier: "A" as const, grade: null, goodChamps: [] },
          swap: { tier: "B" as const, grade: null, goodChamps: [] },
        }],
      },
      rosterNews: [
        {
          teamId: "t1",
          lane: "jungle",
          entrantName: "WinterAcyFill",
          entrantTier: "B" as const,
          entrantPotential: "A" as const,
          entrantSource: "academy" as const,
          marketNote: "academy-recall" as const,
          timeMark: "Winter", // pre-First Stand (AI demotion fill)
        },
        {
          teamId: "t2",
          lane: "middle",
          entrantName: "FSWindowSign",
          entrantTier: "A" as const,
          entrantPotential: "S" as const,
          entrantSource: "free-agent" as const,
          marketNote: "open-fa" as const,
          timeMark: "First Stand window", // post-First Stand (window sign)
        },
      ],
    });
    const second = collectSimResultUpdates(seasonAfterProceed, seen);
    // FS intl is already sealed → not re-emitted.
    expect(second.filter((u) => u.kind === "intl")).toHaveLength(0);
    // Both pre-FS and post-FS roster-moves entries are now emitted.
    const rosterMoves = second.filter((u) => u.kind === "roster-moves");
    expect(rosterMoves).toHaveLength(2);
    const preEntry = rosterMoves.find((u) => u.kind === "roster-moves" && u.preIntl === true);
    const postEntry = rosterMoves.find((u) => u.kind === "roster-moves" && !u.preIntl);
    expect(preEntry).toBeDefined();
    expect(postEntry).toBeDefined();
    // Pre-intl moves only contain the "Winter" mark move.
    expect(preEntry?.kind === "roster-moves" && preEntry.moves[0]?.starName).toBe("WinterAcyFill");
    // Third call: nothing re-emitted.
    expect(collectSimResultUpdates(seasonAfterProceed, seen).filter((u) => u.kind === "roster-moves")).toHaveLength(0);
  });

  it("pre-intl and post-intl are deduped on second collectSimResultUpdates call", () => {
    const season = fabricate({
      id: "pi-dedup",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { "first-stand": ["t1"] },
      rosterNews: [
        {
          teamId: "t1",
          lane: "top",
          entrantName: "WinterCallUp",
          entrantTier: "A",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Winter",
        },
      ],
    });
    const seen = new Set<string>();
    const first = collectSimResultUpdates(season, seen);
    expect(first.filter((u) => u.kind === "roster-moves")).toHaveLength(1);
    // Second call should not re-emit
    const second = collectSimResultUpdates(season, seen);
    expect(second.filter((u) => u.kind === "roster-moves")).toHaveLength(0);
  });
});

describe("Global Cup has no transfer / roster-move window", () => {
  const summerNews = {
    teamId: "t1" as const,
    lane: "top" as const,
    entrantName: "SummerCallUp",
    entrantTier: "A" as const,
    entrantPotential: "S" as const,
    entrantSource: "academy" as const,
    marketNote: "academy-recall" as const,
    timeMark: "Summer",
  };

  const worldsCarry = {
    event: "worlds" as const,
    lane: "jungle" as const,
    fromTeamId: "t1",
    toTeamId: "t2",
    star: { tier: "S" as const, grade: null, goodChamps: [] },
    swap: { tier: "B" as const, grade: null, goodChamps: [] },
  };

  it("buildPreIntlMovesEntry returns null for global-cup (Summer is Pre Worlds only)", () => {
    const season = fabricate({
      id: "gc-pre",
      franchise: { id: "r1", name: "Reality", year: 4 },
      rosterNews: [summerNews],
    });
    expect(buildPreIntlMovesEntry(season, "global-cup")).toBeNull();
    const worldsPre = buildPreIntlMovesEntry(season, "worlds");
    expect(worldsPre).not.toBeNull();
    expect(worldsPre?.label).toBe("After Summer Split · Pre Worlds");
  });

  it("collectSimResultUpdates never emits Pre/Post Global Cup roster-moves", () => {
    const season = fabricate({
      id: "gc-collect",
      franchise: { id: "r1", name: "Reality", year: 4 },
      phases: [
        {
          kind: "international",
          event: "global-cup",
          label: "Global Cup",
          tournamentIds: [],
          status: "complete",
        },
      ],
      intlResults: {
        worlds: ["t1", "t2"],
        "global-cup": ["t1", "t2"],
      },
      rosterNews: [
        summerNews,
        {
          teamId: "t2",
          lane: "middle",
          entrantName: "GcWindowSign",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "free-agent",
          marketNote: "open-fa",
          timeMark: "Global Cup window",
        },
      ],
      transfersByEvent: {
        "global-cup": [
          {
            event: "global-cup",
            lane: "top",
            fromTeamId: "t2",
            toTeamId: "t1",
            star: { tier: "A", grade: null, goodChamps: [] },
            swap: { tier: "C", grade: null, goodChamps: [] },
          },
        ],
      },
    });

    const updates = collectSimResultUpdates(season, new Set<string>());
    const rosterMoves = updates.filter((u) => u.kind === "roster-moves");
    expect(
      rosterMoves.every(
        (u) =>
          u.kind === "roster-moves" &&
          u.afterEvent !== "global-cup" &&
          !u.label.includes("Global Cup"),
      ),
    ).toBe(true);
    // Summer checkpoint still surfaces once as Pre Worlds.
    const preWorlds = rosterMoves.find(
      (u) =>
        u.kind === "roster-moves" &&
        u.preIntl === true &&
        u.afterEvent === "worlds",
    );
    expect(preWorlds).toBeDefined();
    expect(preWorlds?.kind === "roster-moves" && preWorlds.label).toBe(
      "After Summer Split · Pre Worlds",
    );
    // Global Cup intl result still emits (tournament card only).
    expect(updates.some((u) => u.kind === "intl" && u.event === "global-cup")).toBe(
      true,
    );
  });

  it("Post Worlds still emits after a Global Cup year (year-end, not post-GC)", () => {
    const season = fabricate({
      id: "gc-post-worlds",
      franchise: { id: "r1", name: "Reality", year: 5 },
      phases: [
        {
          kind: "international",
          event: "global-cup",
          label: "Global Cup",
          tournamentIds: [],
          status: "complete",
        },
      ],
      transfersByEvent: { worlds: [worldsCarry] },
      rosterNews: [
        {
          teamId: "t1",
          lane: "support",
          entrantName: "OffseasonRook",
          entrantTier: "B",
          entrantPotential: "A",
          entrantSource: "academy",
          marketNote: "academy-recall",
          timeMark: "Offseason",
        },
      ],
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.afterEvent).toBe("worlds");
    expect(entry?.label).toBe("Post Worlds");
    expect(entry?.year).toBe(4);

    const updates = collectSimResultUpdates(season, new Set<string>());
    const rm = updates.find((u) => u.kind === "roster-moves");
    expect(rm?.kind === "roster-moves" && rm.afterEvent).toBe("worlds");
    expect(rm?.kind === "roster-moves" && rm.label).toBe("Post Worlds");
    expect(
      updates.every(
        (u) =>
          !(
            u.kind === "roster-moves" &&
            (u.afterEvent === "global-cup" || u.label.includes("Global Cup"))
          ),
      ),
    ).toBe(true);
  });

  it("Post Worlds still emits when the prior year had no Global Cup", () => {
    const season = fabricate({
      id: "no-gc-post-worlds",
      franchise: { id: "r1", name: "Reality", year: 2 },
      phases: [],
      transfersByEvent: { worlds: [worldsCarry] },
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.label).toBe("Post Worlds");
    expect(entry?.year).toBe(1);
  });
});

describe("stamp-aware transfer attribution (feed ↔ digest parity)", () => {
  const worldsOnly = {
    event: "worlds" as const,
    lane: "middle" as const,
    fromTeamId: "t1",
    toTeamId: "t2",
    star: { tier: "S" as const, grade: null, goodChamps: [] },
    swap: { tier: "A" as const, grade: null, goodChamps: [] },
  };
  const fsMove = {
    ...worldsOnly,
    event: "first-stand" as const,
    lane: "top" as const,
  };
  const msiMove = {
    ...worldsOnly,
    event: "msi" as const,
    lane: "jungle" as const,
  };

  it("buildRosterMovesEntry finds First Stand stamps in the worlds carry array", () => {
    const season = fabricate({
      id: "stamp-fs",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: { worlds: [worldsOnly, fsMove] },
    });
    const entry = buildRosterMovesEntry(season, "first-stand");
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.lane).toBe("top");
    expect(entry?.label).toBe("Post First Stand");
  });

  it("buildPostWorldsMovesEntry excludes First Stand / MSI stamps from worlds bucket", () => {
    const season = fabricate({
      id: "stamp-pw",
      franchise: { id: "r1", name: "Reality", year: 2 },
      transfersByEvent: { worlds: [worldsOnly, fsMove, msiMove] },
    });
    const entry = buildPostWorldsMovesEntry(season);
    expect(entry).not.toBeNull();
    expect(entry?.moves).toHaveLength(1);
    expect(entry?.moves[0]?.lane).toBe("middle");
  });

  it("collectSimResultUpdates emits post-FS when swap only lives in worlds bucket", () => {
    const season = fabricate({
      id: "stamp-collect-fs",
      franchise: { id: "r1", name: "Reality", year: 2 },
      intlResults: { "first-stand": ["t1", "t2"] },
      transfersByEvent: { worlds: [fsMove] },
    });
    const seen = new Set<string>();
    const updates = collectSimResultUpdates(season, seen);
    const postFs = updates.find(
      (u) => u.kind === "roster-moves" && u.afterEvent === "first-stand" && !u.preIntl,
    );
    expect(postFs).toBeDefined();
    expect(postFs?.kind === "roster-moves" && postFs.moves[0]?.lane).toBe("top");
    const postWorlds = updates.find(
      (u) => u.kind === "roster-moves" && u.afterEvent === "worlds" && !u.preIntl,
    );
    expect(postWorlds).toBeUndefined();
  });

  it("collectSimResultUpdates post-worlds carry ignores mis-bucketed in-season rows", () => {
    const season = fabricate({
      id: "stamp-pw-collect",
      franchise: { id: "r1", name: "Reality", year: 3 },
      transfersByEvent: { worlds: [worldsOnly, fsMove, msiMove] },
    });
    const updates = collectSimResultUpdates(season, new Set<string>());
    const postWorlds = updates.find(
      (u) => u.kind === "roster-moves" && u.afterEvent === "worlds",
    );
    expect(postWorlds?.kind === "roster-moves" && postWorlds.moves).toHaveLength(1);
    expect(postWorlds?.kind === "roster-moves" && postWorlds.moves[0]?.lane).toBe(
      "middle",
    );
    expect(postWorlds?.kind === "roster-moves" && postWorlds.year).toBe(2);
  });
});


describe("event-time feed rosters", () => {
  it.each(["winter", "spring", "summer", "first-stand", "msi", "worlds", "global-cup"] as const)("uses %s participants even when the first feed update follows transfers", (event) => {
    const split = event === "winter" || event === "spring" || event === "summer" ? event : undefined;
    const scope = split ? { kind: "split" as const, split } : { kind: "international" as const, event: event as InternationalId };
    const season = fabricate({ id: "frozen", status: "complete" });
    const played = { id: "original", name: "PlayedTheEvent", lane: "top" as const, tier: "S" as const };
    season.teams[0].players = [{ ...played, id: "replacement", name: "SignedAfterwards", goodChamps: [], badChamps: [] }];
    season.phaseRosters = [{ ...scope, phaseIndex: 0, label: event, teams: [{ teamId: "t1", teamName: "Alpha", leagueId: "LCK", players: [played] }] }];
    season.phases = [{ ...scope, status: "complete", label: event, tournamentIds: [] }];
    if (split) season.splitResults[split] = Object.fromEntries(LEAGUE_IDS.map(league => [league, ["t2", "t2", "t2", "t2", "t1"]]));
    else season.intlResults[event as InternationalId] = ["t1"];
    const entry = split ? buildSplitResultEntry(season, split) : buildIntlResultEntry(season, event as InternationalId);
    expect(entry.rosterSnapshots?.t1).toEqual([played]);
    const year = buildYearResultEntry(season);
    expect((split ? year.splits.find(s => s.split === split) : year.intls.find(s => s.event === event))?.rosterSnapshots?.t1).toEqual([played]);
    played.name = "Changed after capture";
    expect(entry.rosterSnapshots?.t1[0].name).toBe("PlayedTheEvent");
  });

  it("recovers legacy play-in and main-event entrants without borrowing another phase or the live roster", () => {
    const season = fabricate({ id: "legacy" });
    const player = { id: "original", name: "Played", lane: "top" as const, tier: "S" as const, goodChamps: [], badChamps: [] };
    season.teams[0].players = [{ ...player, name: "Replacement" }];
    season.phases = [{ kind: "international", event: "worlds", label: "Worlds", status: "complete", tournamentIds: ["play-in", "main"] }];
    season.tournaments = Object.fromEntries(["play-in", "main"].map((id, i) => [id, { id, teams: [{ ...season.teams[i], players: [player] }], matches: [] }])) as SeasonState["tournaments"];
    season.intlResults.worlds = ["t2", "t1"];
    expect(Object.keys(buildIntlResultEntry(season, "worlds").rosterSnapshots!)).toEqual(["t2", "t1"]);
    expect(buildIntlResultEntry(season, "worlds").rosterSnapshots?.t1[0].name).toBe("Played");
    season.intlResults.msi = ["t1"];
    expect(buildIntlResultEntry(season, "msi").rosterSnapshots).toBeUndefined();
  });
});


it("repairs saved feed cards and year summaries from retained archives without mutating saved data", () => {
  const season = fabricate({ id: "saved", splitResults: { winter: { LCK: ["t1"] } } });
  const entry = buildSplitResultEntry(season, "winter");
  entry.rosterSnapshots = { t1: [{ id: "wrong", name: "Replacement", lane: "top", tier: "B" }] };
  const correct = { id: "winner", name: "Winner", lane: "top" as const, tier: "S" as const };
  const archive = { id: "saved", phaseRosters: [{ phaseIndex: 0, kind: "split" as const, split: "winter" as const, label: "Winter", teams: [{ teamId: "t1", teamName: "Alpha", leagueId: "LCK" as const, players: [correct] }] }] };
  const year = { ...buildYearResultEntry(season), splits: [entry] };
  const repaired = restoreFeedRosters([entry, year], [archive]);
  expect((repaired[0] as SimSplitResultEntry).rosterSnapshots?.t1).toEqual([correct]);
  expect(repaired[1].kind === "year" && repaired[1].splits[0].rosterSnapshots?.t1).toEqual([correct]);
  expect(entry.rosterSnapshots.t1[0].name).toBe("Replacement");
  expect(restoreFeedRosters([entry], [])[0]).toBe(entry);
});


it("does not re-emit current offseason news as previous-year carry when the transfer baseline is zero", () => {
  const season = fabricate({ id: "zero-baseline", status: "complete", franchise: { id: "r1", name: "R", year: 2 }, worldsOffseasonBaseline: 0,
    rosterNews: [{ teamId: "t1", lane: "top", entrantName: "New signing", entrantTier: "A", entrantPotential: "A", entrantSource: "academy", marketNote: "academy-recall", timeMark: "Offseason" }],
  });
  expect(buildPostWorldsMovesEntry(season)).toBeNull();
});

describe("releases in live roster moves", () => {
  it("lists an academy release before the FA signing that followed it", () => {
    const season = fabricate({
      id: "rel",
      rosterNews: [
        { teamId: "t2", lane: "middle", entrantName: "Kid", entrantId: "kid", entrantTier: "B", entrantPotential: "B",
          entrantSource: "free-agent", timeMark: "MSI window" },
        { teamId: "t1", lane: "middle", departedName: "Kid", departedId: "kid", departedTier: "B", entrantName: "Kid", entrantId: "kid",
          entrantTier: "B", entrantPotential: "B", entrantSource: "free-agent", marketNote: "academy-release", timeMark: "MSI window" },
      ].reverse() as never,
    });
    const entry = buildRosterMovesEntry(season, "msi");
    expect(entry?.moves.map((m) => [m.kind, m.fromTeam.name])).toEqual([["release", "Alpha"], ["fa-sign", "Beta"]]);
  });
});
