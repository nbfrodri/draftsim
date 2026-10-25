import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/matchSimulator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/matchSimulator")>();
  return { ...actual, simulateMatch: vi.fn(actual.simulateMatch) };
});

import { simulateMatch } from "@/lib/matchSimulator";
import { LANE_ORDER } from "@/lib/players";
import { playerFormKey, type PlayerFormMap } from "@/lib/playerForm";
import { createTournament } from "@/lib/tournament";
import type { Champion } from "@/lib/types";
import { autoPlayMatch } from "./autoPlayMatch";

const CHAMPIONS: Champion[] = Array.from({ length: 80 }, (_, i) => ({
  id: i + 1,
  name: `C${i + 1}`,
  alias: `C${i + 1}`,
  roles: [],
  iconUrl: "",
  lanes: [LANE_ORDER[i % 5]],
}));

function setup() {
  const tournament = createTournament({
    name: "Form",
    format: "single-elim",
    teams: [1, 2].map((seed) => ({
      id: `t${seed}`,
      name: `Team ${seed}`,
      seed,
      starRating: 3,
    })),
    defaults: {
      format: "bo3",
      fearless: false,
      mode: "aivai",
      aiSide: null,
      aiDifficulty: "normal",
      timerEnabled: false,
    },
    sideRule: "alternate",
  });
  const match = tournament.matches.find((m) => m.blueTeamId && m.redTeamId)!;
  return { tournament, matchId: match.id };
}

describe("autoPlayMatch player form with swapped sides", () => {
  it("reads and updates form for the team actually on each side", () => {
    const { tournament, matchId } = setup();
    const forms: PlayerFormMap = {};
    for (const lane of LANE_ORDER) {
      forms[playerFormKey("t1", lane)] = 0.9;
      forms[playerFormKey("t2", lane)] = -0.9;
    }
    vi.mocked(simulateMatch).mockClear();
    const [, after] = autoPlayMatch(tournament, matchId, CHAMPIONS, forms);

    const calls = vi.mocked(simulateMatch).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    for (const [game, , opts] of calls) {
      const t1Side = game.blueTeam === "Team 1" ? "blue" : "red";
      const other = t1Side === "blue" ? "red" : "blue";
      expect(opts?.playerForms?.[t1Side]?.top).toBeGreaterThan(
        opts?.playerForms?.[other]?.top ?? 0,
      );
    }
    expect(after[playerFormKey("t1", "top")]).toBeGreaterThan(
      after[playerFormKey("t2", "top")],
    );
  });
});
