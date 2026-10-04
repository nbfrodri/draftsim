import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createTournament, recordMatchWinner, type TournamentState } from "../lib/tournament";
import { marketOrigin } from "../lib/season/marketOrigin";
import { createQualificationClinchDetector } from "../lib/season/qualificationClinch";
import { SPLIT_FEEDS_EVENT, type SplitId } from "../lib/season/types";
import { tournamentMatchContext } from "../lib/tournamentMatchContext";
import { BUNDLED_TEAMS } from "../lib/season/realTeams";

const screenshots = "test-results/transfer-window-qualification";
const screenshotStyle = '[aria-label="Save status"] { visibility: hidden !important; }';

async function seed(page: Page, state: unknown) {
  await page.addInitScript(state => {
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state }));
  }, state);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
}

function play(t: TournamentState, id: string, winner?: string) {
  const m = t.matches.find(m => m.id === id)!;
  const teamId = winner ?? m.blueTeamId!;
  return recordMatchWinner(t, id, { teamId, blueWins: teamId === m.blueTeamId ? 1 : 0, redWins: teamId === m.redTeamId ? 1 : 0 });
}

function fixture(split: SplitId, doubleElim = false) {
  const season = makeAuditSeason("Qualification review");
  const teams = season.teams.filter(t => t.leagueId === "LCK").slice(0, 8);
  const tournament = createTournament({ name: "LCK Playoffs", format: doubleElim ? "double-elim" : "single-elim",
    teams: teams.map((t, i) => ({ ...t, seed: i + 1 })),
    defaults: { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false },
  });
  season.phases = [
    { kind: "split", split, label: `${split} playoffs`, status: "in-progress", tournamentIds: [tournament.id] },
    { kind: "international", event: SPLIT_FEEDS_EVENT[split], label: "Next international", status: "pending", tournamentIds: [] },
  ];
  season.phaseIndex = 0;
  season.tournaments = { [tournament.id]: tournament };
  return { season, tournament, teams };
}

test("previous offseason stays first and role icons filter transfers, retirements and split news together", async ({ page }) => {
  const season = makeAuditSeason("Market review");
  const previous = marketOrigin(season, "Offseason");
  season.id = "market-year-two";
  season.franchise.year = 2;
  season.config.playerTransfers = true;
  const [team, other] = season.teams;
  const row = { teamId: team.id, entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "free-agent" as const };
  season.rosterNews = [
    { ...row, lane: "top", entrantName: "VeteranTop", marketNote: "retired", timeMark: "Offseason", origin: previous },
    { ...row, lane: "jungle", entrantName: "SilverRiver", marketNote: "retired", timeMark: "Offseason", origin: previous },
    { ...row, teamId: other.id, lane: "jungle", entrantName: "Northwind", marketNote: "retired", timeMark: "Offseason", origin: previous },
    { ...row, lane: "jungle", entrantName: "WinterJungle", timeMark: "Winter", origin: marketOrigin(season, "Winter") },
    { ...row, lane: "top", entrantName: "SpringTop", timeMark: "Spring", origin: marketOrigin(season, "Spring") },
  ];
  season.transfersByEvent = { worlds: [
    { event: "worlds", lane: "top", fromTeamId: team.id, toTeamId: other.id,
      star: { name: "TransferredTop", tier: "A", grade: null, goodChamps: [] }, swap: { name: "OtherTop", tier: "B", grade: null, goodChamps: [] } },
    { event: "worlds", lane: "jungle", fromTeamId: team.id, toTeamId: other.id,
      star: { name: "TransferredJungle", tier: "A", grade: null, goodChamps: [] }, swap: { name: "OtherJungle", tier: "B", grade: null, goodChamps: [] } },
  ] };
  await seed(page, { season, seasonViewOpen: true });
  const digest = page.getByRole("button", { name: /^Transfer Window/ }).locator("..");
  const roster = digest.getByRole("button", { name: /^Roster moves/ }).locator("..");
  const headings = roster.getByRole("button").filter({ hasText: /Offseason · Year 1|After Winter Split|After Spring Split/ });
  await expect(headings).toHaveCount(3);
  expect(await headings.allTextContents()).toEqual([
    expect.stringContaining("Offseason · Year 1"), expect.stringContaining("After Winter Split"), expect.stringContaining("After Spring Split"),
  ]);
  const previousOffseason = roster.getByRole("button", { name: /Offseason · Year 1/ });
  await expect(previousOffseason).toHaveAttribute("aria-expanded", "false");
  await expect(digest.getByText("SilverRiver", { exact: true })).toHaveCount(0);
  await digest.screenshot({ path: `${screenshots}/previous-offseason-collapsed-1440.png`, style: screenshotStyle });
  await previousOffseason.click();
  await expect(previousOffseason).toHaveAttribute("aria-expanded", "true");
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await digest.screenshot({ path: `${screenshots}/offseason-order-${width}.png`, style: screenshotStyle });
  }
  const roles = digest.getByRole("group", { name: "Player roles" });
  await expect(roles.getByRole("button")).toHaveCount(6);
  for (const name of ["Top", "Jungle", "Mid", "Bot", "Support"]) await expect(roles.getByRole("button", { name, exact: true }).locator("img")).toHaveCount(1);
  await roles.getByRole("button", { name: "Jungle", exact: true }).click();
  await expect(roles.getByRole("button", { name: "Jungle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(digest.getByText("VeteranTop", { exact: true })).toHaveCount(0);
  await expect(digest.getByText("TransferredTop", { exact: true })).toHaveCount(0);
  await expect(digest.getByText("SilverRiver", { exact: true })).toBeVisible();
  await expect(digest.getByText("TransferredJungle", { exact: true })).toBeVisible();
  await digest.getByRole("button", { name: team.leagueId, exact: true }).click();
  await digest.getByRole("button", { name: team.name, exact: true }).click();
  await expect(digest.getByText("Northwind", { exact: true })).toHaveCount(0);
  await digest.getByRole("tab", { name: /^Retired/ }).click();
  await expect(digest.getByText("SilverRiver", { exact: true })).toBeVisible();
  await digest.screenshot({ path: `${screenshots}/jungle-retirements-filter-1024.png`, style: screenshotStyle });
  await roles.getByRole("button", { name: "Support", exact: true }).click();
  await expect(digest.getByText("No transfers match these filters.")).toBeVisible();
  await expect(digest.getByText("SilverRiver", { exact: true })).toHaveCount(0);
  await roles.getByRole("button", { name: "All roles", exact: true }).click();
  await expect(digest.getByText("VeteranTop", { exact: true })).toBeVisible();
  await expect(digest.getByText("SilverRiver", { exact: true })).toBeVisible();
});

for (const split of ["winter", "spring", "summer"] as const) {
  test(`simulated ${split} matchday announces international berths before the final`, async ({ page }) => {
    test.setTimeout(90_000);
    const { season, tournament, teams } = fixture(split, split === "spring");
    let t = tournament;
    for (const m of t.matches.filter(m => m.round === 1 && m.bracket !== "losers")) t = play(t, m.id);
    if (split === "spring") for (const m of t.matches.filter(m => m.round === 1 && m.bracket === "losers")) t = play(t, m.id);
    if (split === "summer") {
      const prior = [...teams].reverse().map(t => t.id);
      season.splitResults = { winter: { LCK: prior }, spring: { LCK: prior } };
    }
    season.tournaments[t.id] = t;
    await seed(page, { season, seasonViewOpen: true });
    await page.getByRole("button", { name: /Sim Matchday/ }).first().click();
    const latest = page.getByText("Latest Matchday", { exact: true }).locator("../..");
    await expect(latest).toBeVisible({ timeout: 60_000 });
    const badges = latest.getByTestId("qualification-badge");
    const event = split === "winter" ? "First Stand" : split === "spring" ? "MSI" : "Worlds";
    await expect(badges.filter({ hasText: `${event} qualified` }).first()).toBeVisible();
    if (split !== "summer") await expect(badges).toHaveCount(2);
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await latest.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
      await latest.screenshot({ path: `${screenshots}/${SPLIT_FEEDS_EVENT[split]}-clinched-${width}.png`, style: screenshotStyle });
    }
  });
}

test("Worlds points badge names an eliminated team qualified by another semifinal", async ({ page }) => {
  const { season, tournament, teams } = fixture("summer");
  const ids = teams.map(t => t.id);
  season.splitResults = { winter: { LCK: ids }, spring: { LCK: [ids[1], ids[0], ids[3], ids[2], ...ids.slice(4)] } };
  season.intlResults = { "first-stand": [ids[3]] };
  let t = tournament;
  for (const m of t.matches.filter(m => m.round === 1)) t = play(t, m.id, m.blueTeamId === ids[0] ? m.redTeamId! : m.blueTeamId!);
  const semifinal = t.matches.find(m => m.round === 2 && (m.blueTeamId === ids[3] || m.redTeamId === ids[3]))!;
  const after = play(t, semifinal.id, ids[3]);
  const qualifications = createQualificationClinchDetector(season, t)(t, after);
  expect(qualifications).toContainEqual(expect.objectContaining({ teamId: ids[0], via: "points" }));
  season.tournaments[t.id] = after;
  await seed(page, { season, seasonViewOpen: true, seasonMatchday: {
    label: "Summer · Playoffs", regions: [{ name: "LCK", league: "LCK", results: [{
      blue: teams.find(t => t.id === semifinal.blueTeamId), red: teams.find(t => t.id === semifinal.redTeamId),
      blueScore: semifinal.blueTeamId === ids[3] ? 1 : 0, redScore: semifinal.redTeamId === ids[3] ? 1 : 0,
      blueWon: semifinal.blueTeamId === ids[3], stage: "winners", context: tournamentMatchContext(t, semifinal), qualifications,
    }] }],
  } });
  const latest = page.getByText("Latest Matchday", { exact: true }).locator("../..");
  await expect(latest.getByTestId("qualification-badge").filter({ hasText: teams[0].name })).toContainText("Worlds qualified · Points · 22 pts");
  await page.setViewportSize({ width: 1024, height: 700 });
  await latest.screenshot({ path: `${screenshots}/worlds-points-clinched-1024.png`, style: screenshotStyle });
});

test("T1's First Stand berth stays visible in the first match and qualification badges include team logos", async ({ page }) => {
  test.setTimeout(90_000);
  const { season, tournament, teams } = fixture("spring", true);
  const names = ["T1", "Gen.G Esports", "DN SOOPers", "kt Rolster"];
  for (let i = 0; i < teams.length; i++) {
    const real = BUNDLED_TEAMS.LCK.find(t => t.name === names[i]) ?? BUNDLED_TEAMS.LCK[i];
    Object.assign(teams[i], { name: real.name, logoUrl: real.logoUrl });
    Object.assign(tournament.teams[i], { name: real.name, logoUrl: real.logoUrl });
  }
  season.intlResults = { "first-stand": [teams[0].id] };
  let t = tournament;
  for (const m of t.matches.filter(m => m.round === 1 && m.bracket !== "losers")) t = play(t, m.id);
  for (const m of t.matches.filter(m => m.round === 1 && m.bracket === "losers")) t = play(t, m.id);
  season.tournaments[t.id] = t;
  await seed(page, { season, seasonViewOpen: true });
  await page.getByRole("button", { name: /Sim Matchday/ }).first().click();
  const latest = page.getByText("Latest Matchday", { exact: true }).locator("../..");
  const t1 = latest.getByTestId("qualification-badge").filter({ hasText: "T1" });
  await expect(t1).toContainText("MSI already qualified", { timeout: 60_000 });
  await expect(t1).toContainText("First Stand champion");
  await expect(t1).toHaveAttribute("data-qualification-status", "existing");
  await expect(t1.locator('img[src="/team-logos/t1.png"]')).toBeVisible();
  await expect(t1.locator('img[src="/league-logos/msi.png"]')).toBeVisible();
  const newBerths = latest.locator('[data-qualification-status="new"]');
  await expect(newBerths.first()).toContainText("MSI qualified");
  for (const badge of await latest.getByTestId("qualification-badge").all()) {
    const logo = badge.locator('img[src^="/team-logos/"]');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await latest.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await latest.screenshot({ path: `${screenshots}/t1-already-qualified-team-logos-${width}.png`, style: screenshotStyle });
  }
});

test("Worlds points badges distinguish a guaranteed minimum from a final score", async ({ page }) => {
  const { season, tournament, teams } = fixture("summer");
  const match = tournament.matches[0];
  const after = play(tournament, match.id);
  const qualifications = createQualificationClinchDetector(season, tournament)(tournament, after);
  expect(qualifications).toContainEqual(expect.objectContaining({ teamId: teams[0].id, points: 6, pointsProvisional: true }));
  season.tournaments[tournament.id] = after;
  await seed(page, { season, seasonViewOpen: true, seasonMatchday: { label: "Summer · Playoffs", regions: [{
    name: "LCK", league: "LCK", results: [{ blue: teams.find(t => t.id === match.blueTeamId), red: teams.find(t => t.id === match.redTeamId),
      blueScore: 1, redScore: 0, blueWon: true, stage: "winners", context: tournamentMatchContext(tournament, match), qualifications }],
  }] } });
  const latest = page.getByText("Latest Matchday", { exact: true }).locator("../..");
  await expect(latest.getByTestId("qualification-badge").filter({ hasText: teams[0].name })).toContainText("Worlds qualified · Points · ≥6 pts");
  await page.setViewportSize({ width: 1024, height: 700 });
  await latest.screenshot({ path: `${screenshots}/worlds-points-minimum-1024.png`, style: screenshotStyle });
});
