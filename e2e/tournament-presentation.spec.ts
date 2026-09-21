import { expect, test, type Page } from "@playwright/test";
import { createTournament, recordMatchWinner } from "../lib/tournament";
import { createSeries } from "../lib/series";
import { rosterFromStar } from "../lib/players";
import { makeAuditSeason } from "../lib/auditFixtures";

const lanes = ["top", "jungle", "middle", "bottom", "support"] as const;
async function seed(page: Page, state: unknown) {
  await page.addInitScript(state => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })), state);
  await page.emulateMedia({ reducedMotion: "reduce" });
}
function tournamentFixture() {
  let t = createTournament({ name: "Presentation Cup", format: "single-elim", teams: Array.from({ length: 8 }, (_, i) => ({
    id: `visual-${i}`, name: `Visual Team ${i + 1}`, seed: i + 1, leagueId: i % 2 ? "LPL" as const : "LCK" as const,
    logoUrl: `/league-logos/${i % 2 ? "LPL" : "LCK"}.png`, players: rosterFromStar(4).map((p, n) => ({ ...p, id: `player-${i}-${n}`, name: `Player ${i + 1} ${n + 1}` })) as ReturnType<typeof rosterFromStar>,
  })), defaults: { format: "bo3", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false } });
  for (let i = 0; i < 20; i++) {
    const m = t.matches.find(row => !row.winner && row.blueTeamId && row.redTeamId);
    if (!m) break;
    const blue = t.teams.find(team => team.id === m.blueTeamId)!;
    const red = t.teams.find(team => team.id === m.redTeamId)!;
    const series = createSeries({ ...t.defaults, blueTeam: blue.name, redTeam: red.name });
    series.games = [0, 1].map(n => {
      const b = n === 0 ? blue : red, r = n === 0 ? red : blue;
      return { ...series.games[0], id: `${m.id}-game-${n}`, gameNumber: n + 1, status: "complete" as const,
        blueTeam: b.name, redTeam: r.name, winner: n === 0 ? "blue" as const : "red" as const,
        bluePicks: [266, 103, 84, 22, 12], redPicks: [1, 2, 3, 4, 5], blueRoles: [...lanes], redRoles: [...lanes],
        recap: { durationMinutes: 25 + n * 10, mvp: null, biggestSwing: null,
          goldLeadTimeline: [{ minute: 10, goldLead: n === 0 ? -9000 : 7000 }],
          ratings: { blue: [9, 8, 7, 7, 7], red: [8, 7, 7, 7, 7] },
          perPickKDA: { blue: lanes.map(() => ({ k: 8, d: 0, a: 12 })), red: lanes.map(() => ({ k: 0, d: 0, a: 0 })) },
          perPickNames: { blue: b.players!.map(p => p.name!), red: r.players!.map(p => p.name!) },
          perPickIds: { blue: b.players!.map(p => p.id!), red: r.players!.map(p => p.id!) },
        },
      };
    });
    series.status = "complete";
    t = { ...t, matches: t.matches.map(row => row.id === m.id ? { ...row, series } : row) };
    t = recordMatchWinner(t, m.id, { teamId: blue.id, blueWins: 2, redWins: 0 });
  }
  t.liveMeta = true;
  t.metaEvolutionLog = [{ championId: 266, games: 10, winRate: 0.8, presence: 0.9, alias: "Aatrox", lane: "top", from: "A", to: "S", reason: "dominant", roundLabel: "Final" }];
  return t;
}

test("tournament identities, meta tiers and perfect KDA remain visible through recap navigation", async ({ page }) => {
  const tournament = tournamentFixture();
  await seed(page, { tournament, season: null });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: tournament.name, exact: true })).toBeVisible();
  const section = (name: string) => page.getByText(name, { exact: true }).first().locator("..");
  const momentum = section("Momentum").locator("..");
  await expect(momentum.locator('img[src="/league-logos/LCK.png"]').first()).toBeVisible();
  await expect(momentum.getByTitle("Tournament seed").first()).toBeVisible();
  const meta = section("Meta Shifts").locator("..");
  await expect(meta.locator('img[src*="266.png"]')).toHaveCount(1);
  await expect(meta.getByTitle("Tier A")).toBeVisible();
  await expect(meta.getByTitle("Tier S")).toBeVisible();
  const mvp = section("Tournament MVP");
  await expect(mvp.locator('img[src*="icon-position-"]')).toHaveCount(1);
  await expect(mvp.locator('img[src*="league-logos"]')).toHaveCount(2);
  const awards = section("Individual Awards").locator("..");
  expect(await awards.locator('img[src*="icon-position-"]').count()).toBeGreaterThan(0);
  const pools = section("Team Champion Pools").locator("..");
  await expect(pools.getByRole("button").first().locator('img[src*="league-logos"]').first()).toBeVisible();
  await expect(page.getByRole("article", { name: "Most Kills", exact: true })).toContainText("40 kills");
  await expect(page.getByRole("article", { name: "Closest Kill Score", exact: true })).toContainText("40 kill gap");
  await expect(page.getByRole("article", { name: "Biggest Momentum Swing", exact: true }).getByRole("button")).toBeDisabled();
  await expect(page.getByRole("article", { name: "Largest Gold Lead", exact: true })).toContainText("9,000 gold");
  const fastest = page.getByRole("article", { name: "Fastest", exact: true });
  await expect(fastest.getByTitle("Tournament seed")).toHaveCount(3);
  const winnerLine = fastest.getByText("Won by", { exact: true }).locator("..");
  const lineBox = await winnerLine.boundingBox();
  const labelBox = await winnerLine.locator(":scope > span").first().boundingBox();
  const winnerBox = await winnerLine.locator(":scope > span").last().boundingBox();
  expect(Math.abs((labelBox!.x + winnerBox!.x + winnerBox!.width) / 2 - lineBox!.x - lineBox!.width / 2)).toBeLessThan(2);
  const role = await meta.locator('img[src*="icon-position-"]').boundingBox();
  const tier = await meta.getByTitle("Tier A").boundingBox();
  expect(Math.abs(role!.y + role!.height / 2 - tier!.y - tier!.height / 2)).toBeLessThan(2);
  expect(tier!.x - role!.x - role!.width).toBeLessThan(12);
  await fastest.locator("..").screenshot({ path: "test-results/playwright/notable-games-layout.png" });
  await fastest.getByRole("button", { name: /^Fastest: replay/ }).click();
  await expect(page.getByText("Perfect KDA", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Game 2, won by/ }).click();
  await expect(page.getByText("Perfect KDA", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/playwright/tournament-perfect-kda.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Game 2, won by/ })).toHaveCount(0);
  await meta.scrollIntoViewIfNeeded();
  await meta.screenshot({ path: "test-results/playwright/tournament-meta-shifts.png" });
  await page.setViewportSize({ width: 480, height: 900 });
  await fastest.scrollIntoViewIfNeeded();
  const narrowCard = await fastest.boundingBox();
  expect(narrowCard!.x + narrowCard!.width).toBeLessThanOrEqual(480);
  await fastest.locator("..").screenshot({ path: "test-results/playwright/notable-games-narrow.png" });
});

test("Latest Matchday captures regular stage before advancing", async ({ page }) => {
  const season = makeAuditSeason("Matchday context");
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  await page.getByRole("button", { name: /Sim Matchday/ }).first().click();
  const badges = page.getByLabel("Match context").first();
  await expect(badges).toContainText("Regular Split", { timeout: 60000 });
  await expect(badges).toContainText("Matchday 1");
  const badgeBounds = await badges.boundingBox();
  const firstBadge = await badges.locator(":scope > span").first().boundingBox();
  const lastBadge = await badges.locator(":scope > span").last().boundingBox();
  expect(Math.abs((firstBadge!.x + lastBadge!.x + lastBadge!.width) / 2 - badgeBounds!.x - badgeBounds!.width / 2)).toBeLessThan(2);
  await badges.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/playwright/latest-matchday-context.png" });
});

test("AI difficulty stays aligned with Follow Team across options and widths", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New Season Mode/ }).click();
  const row = page.getByTestId("season-control-row");
  await expect(row).toBeVisible();
  for (const width of [1440, 1024, 480]) {
    await page.setViewportSize({ width, height: 900 });
    for (const toggle of [/Fearless (ON|OFF)/, /Draft Timer (ON|OFF)/]) {
      await page.getByRole("button", { name: toggle }).click();
      const select = await row.getByLabel("AI Difficulty").boundingBox();
      const follow = await row.getByRole("button", { name: /Spectate/ }).boundingBox();
      expect(select).not.toBeNull(); expect(follow).not.toBeNull();
      if (width >= 640) expect(Math.abs(select!.y - follow!.y)).toBeLessThan(2);
      else expect(follow!.y).toBeGreaterThan(select!.y + select!.height);
      expect(select!.x + select!.width).toBeLessThanOrEqual(width);
    }
  }
  await row.screenshot({ path: "test-results/playwright/season-control-alignment.png" });
});


test("legacy recaps without KDA never claim a perfect game", async ({ page }) => {
  const tournament = tournamentFixture();
  for (const match of tournament.matches) for (const game of match.series?.games ?? []) {
    if (game.recap) delete game.recap.perPickKDA;
  }
  await seed(page, { tournament, season: null });
  await page.goto("/");
  await page.getByRole("button", { name: /^Fastest/ }).click();
  await expect(page.getByRole("button", { name: /^Game 1, won by/ })).toBeVisible();
  await expect(page.getByText(/Perfect KDA/)).toHaveCount(0);
});

test("annual recap separates rookie/player/team and offseason leaders show roles and team logos", async ({ page }) => {
  const season = makeAuditSeason("Recap Year 1");
  const tournament = tournamentFixture();
  tournament.seasonId = season.id;
  tournament.seasonStageKind = "split";
  season.teams = tournament.teams.map(team => ({ ...season.teams[0], ...team, leagueId: team.leagueId!, players: team.players!.map(p => ({ ...p, debutYear: 1 })) as ReturnType<typeof rosterFromStar> }));
  season.tournaments = { [tournament.id]: tournament };
  season.phases[0].tournamentIds = [tournament.id];
  season.phases[0].status = "complete";
  season.status = "complete";
  season.champion = tournament.matches.find(m => !m.feedsInto)!.winner!.teamId;
  const champion = season.teams.find(team => team.id === season.champion)!;
  for (const split of ["winter", "spring", "summer"] as const) season.splitResults[split] = { [champion.leagueId]: [champion.id] };
  for (const event of ["first-stand", "msi", "worlds"] as const) season.intlResults[event] = [champion.id];
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  const banner = page.getByText("World Champion", { exact: true }).locator("..");
  const championLine = await banner.locator(":scope > div").nth(1).boundingBox();
  const goldenRoad = await banner.getByText("★ Golden Road ★", { exact: true }).locator("..").boundingBox();
  expect(goldenRoad!.y - championLine!.y - championLine!.height).toBeGreaterThanOrEqual(15);
  const rookies = page.getByText("Rookie of the Year", { exact: true }).locator("..");
  await expect(rookies).toBeVisible();
  const card = rookies.locator('div[class*="border-rift-blue/30"]').first();
  const player = card.getByText(/^Player/).first();
  const team = card.getByText(/^Visual Team/).first();
  await player.scrollIntoViewIfNeeded();
  const p = await player.boundingBox(), t = await team.boundingBox();
  expect(t!.y).toBeGreaterThanOrEqual(p!.y + p!.height);
  await expect(card.locator('img[src*="icon-position-"]')).toHaveCount(1);
  await expect(card.locator('img[src*="league-logos"]')).toHaveCount(2);
  const leader = page.getByText("Kills leader", { exact: true }).locator("..");
  await expect(leader.locator('img[src*="icon-position-"]')).toHaveCount(1);
  await expect(leader.locator('img[src*="league-logos"]')).toHaveCount(2);
  await card.screenshot({ path: "test-results/playwright/rookie-year-spacing.png" });
});


test("Momentum shows named player cards and tournament teams expose their frozen roster cards", async ({ page }) => {
  const tournament = tournamentFixture();
  delete tournament.teams[0].leagueId;
  await seed(page, { tournament: null, season: null, savedTournaments: [{ id: tournament.id, savedAt: 1, tournament, preTournamentMetaSnapshot: null, playerForms: { "visual-0:top": 0.8, "visual-1:jungle": -0.8 } }] });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Presentation Cup/ })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
  await page.getByRole("button", { name: /Presentation Cup/ }).click();
  await expect(page.getByRole("heading", { name: tournament.name })).toBeVisible();
  const momentum = page.getByText("Momentum", { exact: true }).locator("../..");
  const hot = momentum.getByRole("region", { name: "On fire", exact: true });
  const cold = momentum.getByRole("region", { name: "Slumping", exact: true });
  await expect(hot.getByText("Player 1 1", { exact: true })).toBeVisible();
  await expect(cold.getByText("Player 2 2", { exact: true })).toBeVisible();
  await expect(hot.locator('img[src*="icon-position-"]')).toHaveCount(1);
  await hot.getByText("Player 1 1", { exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Player 1 1");
  await page.mouse.move(0, 0);
  await hot.getByText("Visual Team 1", { exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Tournament roster");
  await expect(page.getByRole("tooltip")).toContainText("Player 1 1");
  await expect(page.getByRole("tooltip").locator('img[src*="league-logos"]')).toHaveCount(1); // team logo only, no invented region
  await page.screenshot({ path: "test-results/playwright/momentum-team-card.png" });
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "On fire", exact: true }).locator("../..").screenshot({ path: "test-results/playwright/momentum-layout.png" });
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByRole("region", { name: "On fire", exact: true }).getByText("+0.80")).toBeVisible();
});

test("franchise timeline names expand on the left and profile navigation belongs to the card", async ({ page }) => {
  const team = { name: "Timeline Team", leagueId: "LCK", iconKey: "shield", color: "#c8aa6e" };
  const entry = { id: "timeline-layout", name: "Timeline Year 1", archivedAt: 1, complete: true, champion: team, runnerUp: null,
    intlChampions: { worlds: team }, splitChampions: { winter: { LCK: team } },
    phaseRosters: [{ phaseIndex: 0, label: "Worlds", kind: "international", event: "worlds", teams: [{ teamId: "timeline-team", teamName: team.name, leagueId: "LCK", players: lanes.map((lane, n) => ({ id: `timeline-player-${n}`, name: `Archived Player ${n}`, lane, tier: "S" })) }] }],
  };
  await seed(page, { season: null, seasonHistory: [entry] });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Season History/ })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Franchise Timeline", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Timeline Team title details", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const matrix = page.locator("table").filter({ has: trigger });
  const panel = matrix.locator('div[style*="border-left-width"]').first();
  const matrixBox = await matrix.boundingBox(), panelBox = await panel.boundingBox();
  expect(panelBox!.x - matrixBox!.x).toBeLessThan(20);
  await expect(panel).toBeVisible();
  await trigger.hover();
  await expect(page.getByRole("tooltip")).toContainText("Archived Player 0");
  await page.getByRole("tooltip").click();
  await expect(page.getByRole("button", { name: "Timeline Team title details", exact: true })).toHaveCount(0);
});
