import { expect, it } from "vitest";
import { buildMatchPresentation, participantAliases } from "./matchPresentation";
import type { Champion } from "./types";
const champions = new Map([[1, { name: "Ahri" } as Champion]]);
it("uses the game's side and recorded player identity over a replacement roster", () => {
  const result = buildMatchPresentation({ blue: { name: "Team B", players: [{ lane: "top", name: "Replacement", id: "new", tier: "A", pool: [] }] }, red: { name: "Team A" } }, champions, {
    blue: { picks: [1], names: ["Original"], ids: ["old"] }, red: { picks: [] },
  });
  expect(result.players[0]).toMatchObject({ name: "Original", id: "old", lane: "top", side: "blue", championName: "Ahri" });
  expect(participantAliases(result.players).get("Ahri")?.name).toBe("Original");
});
it("does not borrow a replacement's name when only a different recorded ID survives", () => {
  const result = buildMatchPresentation({ blue: { name: "Team B", players: [{ lane: "top", name: "Replacement", id: "new", tier: "A", pool: [] }] }, red: { name: "Team A" } }, champions, {
    blue: { picks: [1], ids: ["old"] }, red: { picks: [] },
  });
  expect(result.players[0].name).toBeUndefined();
  expect(participantAliases(result.players).size).toBe(0);
});
it("leaves ambiguous champion aliases unchanged", () => {
  expect(participantAliases([{ side: "blue", lane: "top", championName: "Ahri", name: "A" }, { side: "red", lane: "top", championName: "Ahri", name: "B" }]).has("Ahri")).toBe(false);
});

it("does not attach a replacement ID to a historical name without an ID", () => {
  const result = buildMatchPresentation({ blue: { name: "Team B", players: [{ lane: "top", name: "Replacement", id: "new", tier: "A", pool: [] }] }, red: { name: "Team A" } }, champions, {
    blue: { picks: [1], names: ["Original"] }, red: { picks: [] },
  });
  expect(result.players[0]).toMatchObject({ name: "Original" });
  expect(result.players[0].id).toBeUndefined();
});
