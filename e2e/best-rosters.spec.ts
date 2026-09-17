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
