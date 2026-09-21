import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createSeries } from "../lib/series";
import { LEAGUE_IDS, type SeasonState } from "../lib/season/types";

async function seed(page: Page, state: unknown) {
  await page.addInitScript(state => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })), state);
  await page.emulateMedia({ reducedMotion: "reduce" });
}

function playedSeason() {
  const season = makeAuditSeason("UI regression");
  const tournament = Object.values(season.tournaments)[0];
  const match = tournament.matches.find(m => m.blueTeamId && m.redTeamId)!;
  const blue = tournament.teams.find(t => t.id === match.blueTeamId)!;
  const red = tournament.teams.find(t => t.id === match.redTeamId)!;
  blue.logoUrl = "/league-logos/LCK.png"; red.logoUrl = "/league-logos/LPL.png";
  const series = createSeries({ format: "bo3", fearless: false, timerEnabled: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", blueTeam: blue.name, redTeam: red.name });
  const game = series.games[0];
  series.games = [0, 1, 2].map(i => ({ ...game, id: `game-${i}`, gameNumber: i + 1, status: "complete" as const, blueTeam: i === 1 ? red.name : blue.name, redTeam: i === 1 ? blue.name : red.name, winner: (i === 1 ? "red" : "blue") as "blue" | "red", bluePicks: [1, 2, 3, 4, 5], redPicks: [6, 7, 8, 9, 10], blueRoles: ["top", "jungle", "middle", "bottom", "support"] as const, redRoles: ["top", "jungle", "middle", "bottom", "support"] as const,
    recap: { durationMinutes: 30, mvp: null, biggestSwing: null, ratings: { blue: [8, 7, 7, 7, 7], red: [6, 6, 6, 6, 6] } },
  })).map(g => ({ ...g, blueRoles: [...g.blueRoles], redRoles: [...g.redRoles] }));
  series.status = "complete";
  match.series = series; match.winner = { teamId: blue.id, blueWins: 2, redWins: 1 };
  return { season, tournament, blue };
}

test("bulk controls start collapsed, preserve inputs, and Escape returns from the season", async ({ page }) => {
  const season = makeAuditSeason("Disclosure");
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /^Bulk Simulation/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#bulk-sim-controls")).toBeHidden();
  await toggle.click();
  const input = page.locator("#bulk-sim-controls input[type=number]");
  await input.fill("12"); await toggle.click(); await toggle.click();
  await expect(input).toHaveValue("12");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "DRAFTSIM", exact: true })).toBeVisible();
});

test("Escape closes a backup confirmation before its parent dialog and restores focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  await panel.getByLabel("Backup name").fill("Escape fixture");
  await panel.getByRole("button", { name: "Create backup", exact: true }).click();
  const trigger = panel.getByRole("button", { name: "Delete backup Escape fixture", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Delete backup", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible(); await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape"); await expect(panel).toHaveCount(0);
});

test("recap tabs show the winner logo even after the teams swap sides", async ({ page }) => {
  const { season, tournament, blue } = playedSeason();
  await seed(page, { season, tournament, seasonViewOpen: true });
  await page.goto("/");
  await page.getByTitle("View per-game results").first().click();
  for (const n of [1, 2, 3]) {
    const tab = page.getByRole("button", { name: `Game ${n}, won by ${blue.name}`, exact: true });
    await expect(tab).toBeVisible();
    await expect(tab.locator("img")).toHaveAttribute("src", "/league-logos/LCK.png");
    await tab.click();
  }
  await page.screenshot({ path: "test-results/playwright/winner-logo-recap.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Game 1, won by/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Exit Tournament?" })).toHaveCount(0);
});

test("live split and international stats show role/champion icons without longest series", async ({ page }) => {
  const { season, tournament } = playedSeason();
  // A completed MVP fixture needs a decided final, not just a regular match
  // in an otherwise unfinished bracket.
  const final = tournament.matches.find(match => match.series && match.winner)!;
  tournament.matches = [{ ...final, round: 1, feedsInto: null, bracket: undefined }];
  tournament.format = "single-elim";
  tournament.status = "complete";
  season.phases[0].status = "complete";
  season.phases[0].tournamentIds = [tournament.id];
  const intl = { ...structuredClone(tournament), id: "test-international", name: "Test International", seasonStageKind: "international" as const };
  season.tournaments[intl.id] = intl;
  season.phases.splice(1, 0, { kind: "international", event: "first-stand", label: "Test International", status: "complete", tournamentIds: [intl.id] });
  season.phaseIndex = 2;
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  for (const index of [0, 1]) {
    await page.getByRole("button", { name: /^Stats/ }).nth(index).click();
    const stats = page.getByRole("region", { name: `${index === 0 ? tournament.name : intl.name} statistics`, exact: true });
    const mvp = stats.getByText("MVP", { exact: true }).locator("..");
    await expect(mvp.locator('img[src*="icon-position-"]')).toHaveCount(1);
    for (const label of ["Most Contested", "Best Win Rate"]) {
      const cell = stats.getByText(label, { exact: true }).locator("..");
      await expect(cell.locator("img")).toHaveCount(1);
    }
    await expect(page.getByText("Longest Series", { exact: true })).toHaveCount(0);
    if (index === 1) await expect(page.getByText("Domestic Split All-Pro", { exact: true })).toHaveCount(0);
    await stats.screenshot({ path: `test-results/playwright/live-stats-${index}.png` });
    await page.getByRole("button", { name: /^Hide Stats/ }).click();
  }
});

test("timeline region order matches for champions and MVPs and region strength has logos", async ({ page }) => {
  const teams = LEAGUE_IDS.map(leagueId => ({ name: `${leagueId} Winner`, leagueId, iconKey: "shield", color: "#c8aa6e" }));
  const entry = { id: "order-year", name: "Region Order Year", archivedAt: 1, complete: true, champion: teams[0], runnerUp: null, intlChampions: { worlds: teams[0] }, splitChampions: { winter: Object.fromEntries(teams.map(t => [t.leagueId, t])) }, splitMvps: [...teams].reverse().map(team => ({ split: "winter", leagueId: team.leagueId, team, lane: "top", playerId: team.leagueId, playerName: `${team.leagueId} MVP`, avgRating: 8, games: 3 })) };
  await seed(page, { seasonHistory: [entry] });
  await page.goto("/"); await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByText("Region Order Year", { exact: true }).first().click();
  const champions = page.getByText("Split Champions", { exact: true }).locator("..");
  await expect(champions.locator('img[src*="league-logos"]')).toHaveCount(LEAGUE_IDS.length);
  for (const league of LEAGUE_IDS) {
    await expect(champions.getByText(league, { exact: true })).toHaveCount(1);
  }
  await champions.screenshot({ path: "test-results/playwright/split-champions.png" });
  const mvps = page.getByText("Split MVPs", { exact: true }).locator("..");
  const logos = await mvps.locator('img[src*="league-logos"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("src")));
  expect(logos).toEqual(LEAGUE_IDS.map(id => `/league-logos/${id}.png`));
  await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
  const regions = page.getByText("Region Strength", { exact: true }).locator("..");
  await expect(regions.locator('img[src*="league-logos"]')).toHaveCount(LEAGUE_IDS.length);
  await regions.screenshot({ path: "test-results/playwright/region-strength.png" });
});


test("manual season save confirms durable success and exposes a failed write for retry", async ({ page }) => {
  const season: SeasonState = makeAuditSeason("Manual save");
  delete season.franchise;
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.click();
  await expect(page.getByText("Season saved", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.savedSeasons.length)).toBe(1);
  const before = await page.evaluate(() => localStorage.getItem("draftsim-store"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === "draftsim-store") throw new DOMException("Test write failure", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await save.click();
  await expect(page.getByText("Save failed - retry or export before closing", { exact: true })).toBeVisible();
  await expect(page.getByText("Season saved", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe(before);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await save.click();
  await expect(page.getByText("Season saved", { exact: true })).toBeVisible();
});


test("completed-year digest retains split moves until advancing and excludes old offseason carry", async ({ page }) => {
  const season: SeasonState = makeAuditSeason("Offseason attribution");
  season.status = "complete";
  season.franchise!.year = 2;
  season.config.playerTransfers = true;
  const row = (name: string, timeMark: string) => ({ teamId: season.teams[0].id, lane: "top" as const,
    entrantName: name, entrantId: name, entrantTier: "A" as const, entrantPotential: "A" as const,
    entrantSource: "rookie" as const, timeMark });
  season.rosterNews = [row("PreviousYearRookie", "Offseason"), row("WinterOnlyRookie", "Winter"), row("SpringOnlyRookie", "Spring"), row("SummerOnlyRookie", "Summer"), row("CurrentOffseasonRookie", "Offseason")];
  season.offseasonRosterNewsBaseline = 4;
  season.franchise!.aging = false;
  await seed(page, { season, seasonViewOpen: true, activeRealityId: season.franchise!.id,
    realities: [{ id: season.franchise!.id, name: season.franchise!.name, year: 2, season, history: [] }] });
  await page.goto("/");
  for (let reload = 0; reload < 2; reload++) {
    const digest = page.getByRole("button", { name: /^Transfer Window/ }).locator("..");
    await expect(digest.getByText("CurrentOffseasonRookie", { exact: true })).toBeVisible();
    await expect(digest.getByText("PreviousYearRookie", { exact: true })).toHaveCount(0);
    await expect(digest.getByText("WinterOnlyRookie", { exact: true })).toHaveCount(0);
    for (const split of ["Winter", "Spring", "Summer"]) {
      await expect(digest.getByRole("button", { name: new RegExp(`After ${split} Split`) })).toBeVisible();
      await digest.getByRole("button", { name: new RegExp(`After ${split} Split`) }).click();
      await expect(digest.getByText(`${split}OnlyRookie`, { exact: true })).toBeVisible();
    }
    await digest.screenshot({ path: `test-results/playwright/completed-year-roster-moves-${reload}.png` });
    await digest.getByRole("button", { name: "Winter", exact: true }).click();
    await expect(digest.getByText("WinterOnlyRookie", { exact: true })).toBeVisible();
    await expect(digest.getByText("CurrentOffseasonRookie", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved to reality", { exact: true })).toBeVisible();
    if (reload === 0) await page.reload();
  }
  await page.getByRole("button", { name: /Finalize Offseason.*Year 3/ }).click();
  await expect(page.getByRole("button", { name: /Sim Matchday/ }).first()).toBeVisible({ timeout: 60000 });
  const nextDigest = page.getByRole("button", { name: /^Transfer Window/ }).locator("..");
  for (const split of ["Winter", "Spring", "Summer"]) {
    await expect(nextDigest.getByRole("button", { name: new RegExp(`After ${split} Split`) })).toHaveCount(0);
    await expect(nextDigest.getByText(`${split}OnlyRookie`, { exact: true })).toHaveCount(0);
  }
});
