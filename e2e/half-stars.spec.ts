import { expect, test } from "@playwright/test";
import { deriveStar } from "../lib/players";
import type { Roster } from "../lib/types";

test("season strength accepts half steps with keyboard and survives saving", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New Season Mode/ }).click();
  await page.getByRole("button", { name: /LCK.*Korea/ }).click();
  const slider = page.getByRole("slider", { name: /team rating/ }).first();
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("End");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("4.5");
  await expect(slider).toHaveAttribute("aria-valuetext", "4.5 out of 5 stars");
  const stars = slider.locator("..").getByRole("img", { name: "4.5 out of 5 stars" });
  await expect(stars).toBeVisible();
  await expect(stars.locator('[style="width: 50%;"]')).toHaveCount(1);
  await stars.screenshot({ path: "test-results/playwright/half-stars.png" });
  await page.getByRole("button", { name: "Start Season", exact: true }).click();
  await expect.poll(async () => {
    const roster = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.season?.teams?.[0]?.players);
    return roster ? deriveStar(roster as Roster) : null;
  }).toBe(4.5);
  await page.reload();
  const roster = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.teams[0].players);
  expect(deriveStar(roster)).toBe(4.5);
});

test("compiled bulk worker preserves fractional strength in completed matches", async ({ page }) => {
  const { createTournament } = await import("../lib/tournament");
  const { rosterFromStar, LANE_ORDER } = await import("../lib/players");
  const tournament = createTournament({ name: "Half Worker", format: "single-elim",
    teams: [{ id: "one", name: "First", seed: 1, starRating: 1, players: rosterFromStar(4.5) }, { id: "two", name: "Second", seed: 2, starRating: 5, players: rosterFromStar(2.5) }],
    defaults: { format: "bo1", fearless: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false },
  });
  const champions = LANE_ORDER.flatMap((lane, laneIndex) => Array.from({ length: 10 }, (_, index) => ({ id: laneIndex * 10 + index + 1, name: `Champion${laneIndex}-${index}`, alias: `Champion${laneIndex}-${index}`, roles: [], iconUrl: "", lanes: [lane] })));
  await page.goto("/");
  const result = await page.evaluate(payload => new Promise<import("../lib/sim/bulkSim.worker").BulkSimWorkerResponse>((resolve, reject) => {
    const worker = new Worker("/workers/bulkSim.worker.js");
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Worker timeout")); }, 20000);
    worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); resolve(event.data); };
    worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage(payload);
  }), { type: "autoPlayMatch", id: 1, tournament, matchId: tournament.matches[0].id, champions, playerForms: {} });
  expect(result.error).toBeUndefined();
  const series = result.tournament!.matches[0].series!;
  expect(series.status).toBe("complete");
  expect([series.blueStarRating, series.redStarRating].sort()).toEqual([2.5, 4.5]);
});

test("tournament selection generates a half-star roster and displays it on the bracket", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Bracket Tournament/ }).click();
  const slider = page.getByRole("slider", { name: "Team rating", exact: true }).first();
  await slider.focus();
  await slider.press("End");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue("4.5");
  await page.getByRole("button", { name: "Generate Bracket", exact: true }).click();
  await expect(page.getByRole("img", { name: "4.5 out of 5 stars", exact: true }).first()).toBeVisible();
  await expect.poll(async () => {
    const team = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.tournament?.teams?.[0]);
    return team?.players ? deriveStar(team.players) : null;
  }).toBe(4.5);
});
