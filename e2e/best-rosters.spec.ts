import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type {
  SeasonHistoryEntry,
  SeasonHistoryTeamRef,
} from "../lib/season/history";
import { ROSTER_LANES } from "../lib/season/bestRosters";

function fixture(): SeasonHistoryEntry[] {
  return [1, 2, 3].map((year) => {
    const team: SeasonHistoryTeamRef = {
      name: year === 2 ? "G2" : "T1",
      leagueId: year === 2 ? "LEC" : "LCK",
      iconKey: "shield",
      color: "#c8aa6e",
    };
    const event = year === 2 ? "msi" : "worlds";
    return {
      id: `roster-${year}`,
      name: `Rosters Year ${year}`,
      archivedAt: year,
      complete: true,
      champion: null,
      runnerUp: null,
      intlChampions: { [event]: team },
      splitChampions: {},
      phaseRosters: [
        {
          phaseIndex: 0,
          label: event,
          kind: "international",
          event,
          teams: [
            {
              teamId: team.name,
              teamName: team.name,
              leagueId: team.leagueId,
              players: ROSTER_LANES.map((lane, i) => ({
                id: year === 3 && i === 0 ? "replacement" : `p${i}`,
                name: year === 3 && i === 0 ? "NewTop" : `Legend${i}`,
                lane,
                tier: "S",
              })),
            },
          ],
        },
      ],
    };
  });
}
test("best rosters show five-player snapshots and filter by winning region and year", async ({
  page,
}) => {
  const season = makeAuditSeason("Rosters");
  await page.addInitScript(
    ({ season, history }) => {
      localStorage.setItem(
        "draftsim-store",
        JSON.stringify({
          version: 7,
          state: {
            season: null,
            seasonViewOpen: false,
            seasonHistory: [],
            realities: [
              { id: "rosters", name: "Rosters", year: 4, season, history },
            ],
          },
        }),
      );
    },
    { season, history: fixture() },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Rosters/ }).click();
  await page
    .getByRole("button", { name: "Best Rosters of All Time", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Best rosters of all time",
    exact: true,
  });
  const top = panel.getByRole("listitem", {
    name: "Roster rank 1",
    exact: true,
  });
  await expect(panel).toContainText("2 winning rosters / 2 shown");
  for (let i = 0; i < 5; i++)
    await expect(top.getByText(`Legend${i}`, { exact: true })).toBeVisible();
  await expect(top).not.toContainText("NewTop");
  await top.getByText("Title history (2)", { exact: true }).click();
  await expect(top).toContainText("Year 2");
  await expect(top).toContainText("Year 1");
  const events = top.getByRole("group", {
    name: "Filter title history by event",
  });
  const titles = top.getByRole("list", { name: "Title history results" });
  await events.getByRole("button", { name: "MSI", exact: true }).click();
  await expect(titles.getByRole("listitem")).toHaveCount(1);
  await expect(titles).toContainText("Year 2");
  await expect(titles).not.toContainText("Year 1");
  await expect(top).toContainText("1 of 2 titles");
  await events.getByRole("button", { name: "Winter", exact: true }).click();
  await expect(titles.getByRole("listitem")).toHaveCount(0);
  await expect(top).toContainText("No Winter titles");
  await events.getByRole("button", { name: "All titles", exact: true }).click();
  await expect(titles.getByRole("listitem")).toHaveCount(2);
  await page.setViewportSize({ width: 1024, height: 768 });
  await panel.screenshot({ path: "test-results/playwright/best-rosters.png" });
  await panel.getByRole("button", { name: "LEC", exact: true }).click();
  await expect(panel).toContainText("1 winning roster / 1 shown");
  await expect(top).not.toContainText("T1");
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await panel.getByRole("combobox", { name: "From year" }).click();
  await page.getByRole("option", { name: "Year 3", exact: true }).click();
  await expect(top.getByText("NewTop", { exact: true })).toBeVisible();
  await expect(top).not.toContainText("Legend0");
  await top.getByText("Title history (1)", { exact: true }).click();
  await top
    .getByRole("button", {
      name: "View Rosters Year 3 in timeline",
      exact: true,
    })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByText("Rosters Year 3", { exact: true }).first(),
  ).toBeVisible();
});

test("teammate toggle shows a button with a count and expands or collapses the list", async ({ page }) => {
  const season = makeAuditSeason("Teammates");
  const history = fixture();
  history.forEach((entry, year) => entry.phaseRosters![0].teams[0].players.forEach((player, index) => {
    player.id = index === 0 ? "shared" : `peer-${year}-${index}`;
    player.name = index === 0 ? "SharedPlayer" : `Teammate${year}${index}`;
  }));
  await page.addInitScript(({ season, history }) => {
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season: null, seasonHistory: [], realities: [{ id: "teammates", name: "Teammates", year: 4, season, history }] } }));
  }, { season, history });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Teammates/ }).click();
  await page.getByRole("button", { name: "Best Rosters of All Time", exact: true }).click();
  await page.getByRole("button", { name: "SharedPlayer", exact: true }).first().click();
  const teammates = page.getByRole("region", { name: "Most frequent teammates", exact: true });
  const toggle = teammates.getByRole("button", { name: /Show all.*12/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(teammates.getByRole("listitem")).toHaveCount(10);
  await teammates.screenshot({ path: "test-results/playwright/teammates-toggle.png" });
  await toggle.click();
  await expect(teammates.getByRole("listitem")).toHaveCount(12);
  await teammates.getByRole("button", { name: /Show top.*10/ }).click();
  await expect(teammates.getByRole("listitem")).toHaveCount(10);
});

test("teammate years show historical teams, event results and the full event roster", async ({ page }) => {
  const season = makeAuditSeason("Rosters");
  const history = fixture();
  const first = history[0];
  const worlds = first.phaseRosters![0];
  worlds.phaseIndex = 5;
  worlds.teams[0].logoUrl = "/team-logos/t1.png";
  worlds.teams[0].coach = { name: "Worlds Coach", rating: 4 };
  const winter = structuredClone(worlds);
  winter.phaseIndex = 0;
  winter.kind = "split";
  delete winter.event;
  winter.split = "winter";
  winter.label = "Winter";
  winter.teams[0].logoUrl = "/team-logos/t1.png?archive=winter";
  winter.teams[0].coach!.name = "Winter Coach";
  winter.teams[0].players[3] = { id: "winter-bot", name: "WinterBot", lane: "bottom", tier: "A" };
  const spring = structuredClone(winter);
  spring.phaseIndex = 2;
  spring.split = "spring";
  spring.teams[0].players[1] = { id: "spring-jungle", name: "SpringJungle", lane: "jungle", tier: "A" };
  first.phaseRosters!.push(winter, spring);
  const t1 = first.intlChampions.worlds!;
  first.splitPlacements = { winter: { LCK: [{ ...t1, name: "Gen.G" }, t1] } };
  history[1].phaseRosters![0].teams[0].logoUrl = "/team-logos/g2-esports.png";
  await page.addInitScript(({ season, history }) => {
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: {
      season: null, seasonHistory: [], realities: [{ id: "rosters", name: "Rosters", year: 4, season, history }],
    } }));
  }, { season, history });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Rosters/ }).click();
  await page.getByRole("button", { name: "Best Rosters of All Time", exact: true }).click();
  await page.getByRole("button", { name: "Legend0", exact: true }).first().click();
  const teammates = page.getByRole("region", { name: "Most frequent teammates", exact: true });
  const peer = teammates.getByRole("listitem").filter({ has: page.locator("summary").getByText("Legend1", { exact: true }) });
  await peer.locator("summary").first().click();
  const yearOne = peer.locator('[aria-label="Rosters Year 1 shared events"]');
  await expect(yearOne.locator("summary")).toHaveCount(2);
  await expect(yearOne).not.toContainText("Spring");
  const winterSummary = yearOne.locator("summary").filter({ hasText: "Winter" });
  await expect(winterSummary).toContainText("T1");
  await expect(winterSummary).toContainText("Runner-up · #2");
  await expect(winterSummary.locator('img[src="/team-logos/t1.png?archive=winter"]')).toBeVisible();
  await winterSummary.click();
  const winterRoster = yearOne.getByRole("region", { name: "Winter roster snapshot", exact: true });
  for (const player of ["Legend0", "Legend1", "Legend2", "WinterBot", "Legend4"])
    await expect(winterRoster.getByText(player, { exact: true })).toBeVisible();
  await expect(winterRoster).toContainText("Winter Coach");
  await expect(winterRoster.locator('img[src="/team-logos/t1.png?archive=winter"]')).toBeVisible();
  await expect(winterRoster).not.toContainText("Legend3");
  await winterRoster.getByRole("button", { name: "Close roster", exact: true }).click();
  await expect(winterRoster).toHaveCount(0);
  await expect(winterSummary).toBeFocused();
  await yearOne.locator("summary").filter({ hasText: "Worlds" }).click();
  const worldsRoster = yearOne.getByRole("region", { name: "Worlds roster snapshot", exact: true });
  await expect(worldsRoster).toContainText("Legend3");
  await expect(worldsRoster).toContainText("Worlds Coach");
  await expect(worldsRoster).not.toContainText("WinterBot");
  const yearTwo = peer.locator('[aria-label="Rosters Year 2 shared events"]');
  await expect(yearTwo.locator("summary")).toContainText("G2");
  await expect(yearTwo.locator("summary")).toContainText("Champion · #1");
  await expect(yearTwo.locator('summary img[src="/team-logos/g2-esports.png"]')).toBeAttached();
  await page.setViewportSize({ width: 1024, height: 768 });
  await teammates.screenshot({ path: "test-results/playwright/teammate-event-rosters.png" });
});
