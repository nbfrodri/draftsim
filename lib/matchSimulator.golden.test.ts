// Golden regression test for simulateMatch / generateTimeline.
//
// Purpose: pin the EXACT byte-level output of the simulator across a set of
// diverse draft fixtures and fixed seeds, so the generateTimeline
// decomposition (lib/sim/timeline/*) can be verified to be behavior-
// preserving. The seeded RNG (lib/rng) guarantees same seed → same result,
// so ANY change in RNG call order/count, formula, constant, or even object
// key order in the events shows up as a snapshot mismatch.
//
// Two layers per fixture:
//   1. A full-JSON snapshot of one representative seed (debuggable diff).
//   2. A compact FNV-1a hash per seed across SEEDS (broad coverage without
//      megabytes of snapshot file).
//
// If this test fails after a refactor, the refactor changed behavior — fix
// the refactor, do NOT update the snapshots (unless the behavior change is
// deliberate and reviewed).

import { describe, expect, it } from "vitest";
import { simulateMatch, type SimulateOptions } from "./matchSimulator";
import { createRng } from "./rng";
import { DEFAULT_STRATEGY, type TeamStrategy } from "./sim/strategies";
import { LANE_ORDER } from "./players";
import type { Champion, GameDraft, Lane, PlayerTier, Roster } from "./types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

let nextId = 1;
// Minimal Champion fixture (same pattern as matchSimulator.calibration.test).
// metaFor() keys off `alias`, so real meta aliases give real phase/archetype
// behavior.
function champ(alias: string, lane: Lane): Champion {
  return { id: nextId++, name: alias, alias, roles: [], iconUrl: "", lanes: [lane] };
}

function comp(aliases: string[]): Champion[] {
  return aliases.map((a, i) => champ(a, LANES[i]));
}

function game(blue: Champion[], red: Champion[]): GameDraft {
  return {
    id: "g1",
    gameNumber: 1,
    blueTeam: "Blue",
    redTeam: "Red",
    blueBans: [],
    redBans: [],
    bluePicks: blue.map((c) => c.id),
    redPicks: red.map((c) => c.id),
    blueRoles: [...LANES],
    redRoles: [...LANES],
    actionIndex: 0,
    status: "complete",
    winner: null,
  } as GameDraft;
}

function roster(tiers: PlayerTier[], goodTop: number[] = [], badMid: number[] = []): Roster {
  return LANE_ORDER.map((lane, i) => ({
    lane,
    tier: tiers[i],
    goodChamps: lane === "top" ? goodTop : [],
    badChamps: lane === "middle" ? badMid : [],
  }));
}

// Comp fixtures spanning the simulator's main axes: mirror (pure noise),
// phase contrast (early vs late), splitpush identity (backdoor path), pick
// identity (pick-event path), and bruiser-heavy comps.
const MIRROR = ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"];
const LATE = ["Anivia", "Azir", "AurelionSol", "Aphelios", "Anivia"];
const EARLY = ["Darius", "Draven", "Elise", "LeeSin", "Renekton"];
const SPLIT = ["Fiora", "MasterYi", "Gangplank", "Caitlyn", "Thresh"];
const PICK = ["Camille", "Elise", "Ahri", "Ashe", "Blitzcrank"];
const BRAWL = ["Jax", "Vi", "Sylas", "Lucian", "Rell"];

// FNV-1a 32-bit over the JSON serialization — tiny, dependency-free, and
// sensitive to any single-character change in the result.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const SEEDS = [11, 42, 101, 777, 1234, 5150, 9001, 31337, 65535, 999983];

interface Fixture {
  name: string;
  blue: string[];
  red: string[];
  options?: Omit<SimulateOptions, "rng">;
}

const splitStrategy: TeamStrategy = {
  ...DEFAULT_STRATEGY,
  gamePlan: "early-snowball",
  macro: "splitpush",
  topPlay: "splitpush",
  risk: "high-roll",
};
const pickStrategy: TeamStrategy = {
  ...DEFAULT_STRATEGY,
  macro: "pick",
  jungle: "gank",
  vision: "proactive",
  pickTarget: "mid",
  tempo: "aggressive",
};
const scalingStrategy: TeamStrategy = {
  ...DEFAULT_STRATEGY,
  gamePlan: "scaling",
  tempo: "passive",
  objective: "dragon",
  weakside: "top",
  winCondition: "bot-carry",
};

const FIXTURES: Fixture[] = [
  { name: "mirror-even", blue: MIRROR, red: MIRROR },
  { name: "late-vs-early", blue: LATE, red: EARLY },
  { name: "early-stomp-bias", blue: EARLY, red: LATE, options: { scoreBias: 35 } },
  {
    name: "split-vs-mirror-strategies",
    blue: SPLIT,
    red: MIRROR,
    options: { blueStrategy: splitStrategy, redStrategy: scalingStrategy },
  },
  {
    name: "pick-vs-late-strategies",
    blue: PICK,
    red: LATE,
    options: { blueStrategy: pickStrategy, scoreBias: -12 },
  },
  {
    name: "brawl-with-players",
    blue: BRAWL,
    red: EARLY,
    options: {
      bluePlayers: roster(["S", "B", "A", "C", "B"], [1], [3]),
      redPlayers: roster(["B", "B", "B", "S", "D"]),
      scoreBias: -8,
    },
  },
];

// Each fixture builds its champions once (ids are deterministic via nextId,
// assigned at module load in FIXTURES order through these prebuilt comps).
const PREBUILT = FIXTURES.map((f) => {
  const blue = comp(f.blue);
  const red = comp(f.red);
  return { fixture: f, blue, red, champions: [...blue, ...red], game: game(blue, red) };
});

describe("simulateMatch golden snapshots (behavior lock)", () => {
  for (const { fixture, champions, game: g } of PREBUILT) {
    it(`${fixture.name}: full result snapshot (seed ${SEEDS[0]})`, () => {
      const result = simulateMatch(g, champions, {
        ...fixture.options,
        rng: createRng(SEEDS[0]),
      });
      expect(JSON.stringify(result, null, 1)).toMatchSnapshot();
    });

    it(`${fixture.name}: result hashes across ${SEEDS.length} seeds`, () => {
      const hashes = SEEDS.map(
        (seed) =>
          `${seed}:${fnv1a(
            JSON.stringify(
              simulateMatch(g, champions, {
                ...fixture.options,
                rng: createRng(seed),
              }),
            ),
          )}`,
      );
      expect(hashes).toMatchSnapshot();
    });
  }
});
