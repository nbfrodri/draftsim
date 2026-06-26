// Invariants for the time-ordered scheduler engine (generateTimeline).
//
// The golden snapshot only locks whatever the engine currently produces, so it
// can't tell a CORRECT result from a subtly-wrong one. These structural
// invariants are the real safety net: they must hold for every seed.

import { describe, expect, it } from "vitest";
import { simulateMatch } from "./matchSimulator";
import { createRng } from "./rng";
import type { Champion, GameDraft, Lane } from "./types";

const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
let nextId = 1;
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

// A spread of comps so the invariants are tested across short stomps and long
// scaling games, not just one shape.
const COMPS: Record<string, string[]> = {
  mirror: ["Malphite", "Vi", "Ahri", "Jhin", "Nautilus"],
  early: ["Darius", "LeeSin", "Renekton", "Draven", "Pyke"],
  late: ["Ornn", "Karthus", "Azir", "Aphelios", "Soraka"],
};
const SEEDS = [1, 7, 42, 99, 256, 1000, 31337, 65535];

function allCases() {
  const keys = Object.keys(COMPS);
  const cases: { label: string; blue: Champion[]; red: Champion[] }[] = [];
  for (const b of keys)
    for (const r of keys)
      cases.push({ label: `${b}-vs-${r}`, blue: comp(COMPS[b]), red: comp(COMPS[r]) });
  return cases;
}

describe("scheduler engine invariants", () => {
  for (const c of allCases()) {
    const champions = [...c.blue, ...c.red];
    const g = game(c.blue, c.red);

    it(`${c.label}: events are in game-time order`, () => {
      for (const seed of SEEDS) {
        const r = simulateMatch(g, champions, { rng: createRng(seed) });
        const ev = r.timeline.events;
        for (let i = 1; i < ev.length; i++) {
          expect(ev[i].minutes).toBeGreaterThanOrEqual(ev[i - 1].minutes);
        }
        // Times are finite and within the game.
        for (const e of ev) {
          expect(Number.isFinite(e.minutes)).toBe(true);
          expect(e.minutes).toBeGreaterThanOrEqual(0);
          expect(e.minutes).toBeLessThanOrEqual(r.timeline.durationMinutes + 0.01);
        }
      }
    });

    it(`${c.label}: per-event KDA kills reconcile with the kill counts`, () => {
      for (const seed of SEEDS) {
        const r = simulateMatch(g, champions, { rng: createRng(seed) });
        for (const e of r.timeline.events) {
          const sumK = (side: "blue" | "red") =>
            LANES.reduce((s, l) => s + (e.kdaDelta[side][l]?.k ?? 0), 0);
          // kdaDelta is the per-lane attribution of the same kills; its per-side
          // sum must equal the event's kill count for that side.
          expect(sumK("blue")).toBe(e.kills.blue);
          expect(sumK("red")).toBe(e.kills.red);
        }
      }
    });

    it(`${c.label}: every game ends with a winner and a nexus`, () => {
      for (const seed of SEEDS) {
        const r = simulateMatch(g, champions, { rng: createRng(seed) });
        expect(r.winner === "blue" || r.winner === "red").toBe(true);
        const nexus = r.timeline.events.filter((e) => e.type === "nexus");
        expect(nexus.length).toBe(1);
        // The nexus belongs to the winner.
        expect(nexus[0].side).toBe(r.winner);
        // Exactly one first-blood event at most (no duplicate first bloods).
        expect(
          r.timeline.events.filter((e) => e.type === "first-blood").length,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  it("is deterministic — same seed → identical timeline", () => {
    const blue = comp(COMPS.mirror);
    const red = comp(COMPS.late);
    const champions = [...blue, ...red];
    const g = game(blue, red);
    const a = simulateMatch(g, champions, { rng: createRng(12345) });
    const b = simulateMatch(g, champions, { rng: createRng(12345) });
    expect(a.timeline.events).toEqual(b.timeline.events);
    expect(a.winner).toBe(b.winner);
  });
});
