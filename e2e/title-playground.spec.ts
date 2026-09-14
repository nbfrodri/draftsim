import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type {
  SeasonHistoryEntry,
  SeasonHistoryTeamRef,
} from "../lib/season/history";
import { LEAGUE_IDS, type PhaseRosterSnapshot } from "../lib/season/types";

function historyFixture(): SeasonHistoryEntry[] {
  const names = ["T1", "BLG", "G2", "Cloud9", "LOUD", "PSG"];
  const teams: SeasonHistoryTeamRef[] = LEAGUE_IDS.map((leagueId, i) => ({
    name: names[i],
    leagueId,
    iconKey: "shield",
    color: "#c8aa6e",
  }));
  return Array.from({ length: 4 }, (_, i) => {
    const year = i + 1;
    const phases: PhaseRosterSnapshot[] = [];
    const snapshots = (
      winners: SeasonHistoryTeamRef[],
      phase: Omit<PhaseRosterSnapshot, "teams">,
    ) =>
      phases.push({
        ...phase,
        teams: winners.map((team) => ({
          teamId: team.name,
          teamName: team.name,
          leagueId: team.leagueId,
          players: [
            {
              id:
                team.name === "T1" ||
                (team.name === "G2" && phase.event === "msi")
                  ? "traveller"
                  : `player-${team.name}`,
              name:
                team.name === "T1" ||
                (team.name === "G2" && phase.event === "msi")
                  ? "Traveller"
                  : `${team.name} star`,
              lane: "middle",
              tier: "S",
            },
          ],
        })),
      });
    const splitChampions: SeasonHistoryEntry["splitChampions"] = {};
    for (const split of ["winter", "spring", "summer"] as const) {
      splitChampions[split] = Object.fromEntries(
        teams.map((team) => [team.leagueId, team]),
      );
      snapshots(teams, {
        phaseIndex: phases.length,
        label: split,
        kind: "split",
        split,
      });
    }
    const intlChampions: SeasonHistoryEntry["intlChampions"] = {
      worlds: teams[0],
      msi: teams[2],
      "first-stand": teams[1],
      ...(year === 4 ? { "global-cup": teams[0] } : {}),
    };
    for (const event of [
      "first-stand",
      "msi",
      "worlds",
      "global-cup",
    ] as const) {
      if (intlChampions[event])
        snapshots([intlChampions[event]!], {
          phaseIndex: phases.length,
          label: event,
          kind: "international",
          event,
        });
    }
    return {
      id: `alpha-${year}`,
      name: `Alpha — Year ${year}`,
      archivedAt: year,
      complete: true,
      champion: teams[0],
      runnerUp: teams[2],
      splitChampions,
      intlChampions,
      phaseRosters: phases,
    };
  });
}

test("title playground filters teams, player winning regions, years and realities", async ({
  page,
}) => {
  const season = makeAuditSeason("Alpha");
  const history = historyFixture();
  await page.addInitScript(
    ({ season, history }) => {
      if (localStorage.getItem("draftsim-store")) return;
      localStorage.setItem(
        "draftsim-store",
        JSON.stringify({
          version: 7,
          state: {
            season: null,
            seasonViewOpen: false,
            seasonHistory: [],
            realities: [
              { id: "alpha", name: "Alpha", year: 5, season, history },
              {
                id: "beta",
                name: "Beta",
                year: 1,
                season,
                history: [
                  {
                    ...history[0],
                    id: "beta-1",
                    name: "Beta — Year 1",
                    splitChampions: {},
                    intlChampions: { worlds: history[0].runnerUp },
                    champion: history[0].runnerUp,
                    phaseRosters: [],
                  },
                ],
              },
            ],
          },
        }),
      );
    },
    { season, history },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page
    .getByRole("button", { name: "Reality · Alpha", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Title Playground", exact: true })
    .click();
  const playground = page.getByRole("region", {
    name: "Title Playground",
    exact: true,
  });
  await expect(
    playground.getByRole("button", {
      name: "T1: 17 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/playwright/title-playground-desktop.png",
    fullPage: true,
  });
  await playground.locator("summary").click();
  await playground
    .getByRole("checkbox", { name: "T1 · 17", exact: true })
    .check();
  await expect(
    playground.getByRole("button", {
      name: "G2: 16 titles. View breakdown",
      exact: true,
    }),
  ).toHaveCount(0);
  await playground
    .getByRole("checkbox", { name: "G2 · 16", exact: true })
    .check();
  await expect(
    playground.getByRole("button", {
      name: "G2: 16 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await playground
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await playground.locator("summary").click();
  await playground.getByRole("button", { name: "LCK", exact: true }).click();
  await playground
    .getByRole("button", { name: "Domestic splits", exact: true })
    .click();
  await expect(
    playground.getByRole("button", {
      name: "T1: 12 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await playground
    .getByRole("combobox", { name: "From year", exact: true })
    .click();
  await expect(
    playground.getByRole("listbox", { name: "From year", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/playwright/title-playground-dropdown.png",
    fullPage: true,
  });
  await playground.getByRole("option", { name: "Year 3", exact: true }).click();
  await expect(
    playground.getByRole("button", {
      name: "T1: 6 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await playground
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await playground
    .getByRole("button", { name: "Players", exact: true })
    .click();
  await expect(
    playground.getByRole("button", {
      name: "Traveller: 21 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await playground.getByRole("button", { name: "LEC", exact: true }).click();
  await expect(
    playground.getByRole("button", {
      name: "Traveller: 4 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await playground
    .getByRole("button", {
      name: "Traveller: 4 titles. View breakdown",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await playground.getByRole("button", { name: "Top", exact: true }).click();
  await expect(
    playground.getByText("No competitors match this view"),
  ).toBeVisible();
  await playground.getByRole("button", { name: "Mid", exact: true }).click();
  await playground
    .getByRole("button", {
      name: "Traveller: 4 titles. View breakdown",
      exact: true,
    })
    .click();
  await playground.locator("summary").click();
  const competitor = playground
    .getByRole("checkbox", { name: "Traveller · 4", exact: true })
    .locator("..");
  await expect(competitor.locator('img[alt="middle"]')).toHaveCount(1);
  await page.screenshot({
    path: "test-results/playwright/title-playground-position-comparison.png",
    fullPage: true,
  });
  await playground.locator("summary").click();
  const picker = playground.getByRole("combobox", {
    name: "Show",
    exact: true,
  });
  await picker.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveText("All competitors");
  await picker.click();
  await page.keyboard.press("Escape");
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await picker.click();
  await playground
    .getByRole("heading", { name: "Title Playground", exact: true })
    .click();
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  const detail = playground.getByRole("region", { name: "Title breakdown" });
  await expect(
    detail.getByRole("cell", { name: "MSI", exact: true }),
  ).toHaveCount(4);
  await playground
    .getByRole("button", { name: "Cumulative timeline", exact: true })
    .click();
  await expect(
    playground.getByRole("img", { name: "Cumulative titles by year" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/playwright/title-playground-timeline.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.screenshot({
    path: "test-results/playwright/title-playground-small-window.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Reality · Beta", exact: true })
    .click();
  await expect(
    playground.getByRole("button", {
      name: "G2: 1 titles. View breakdown",
      exact: true,
    }),
  ).toBeVisible();
  await expect(playground.getByRole("button", { name: /^T1: / })).toHaveCount(
    0,
  );
  await playground
    .getByRole("button", { name: "Players", exact: true })
    .click();
  await expect(playground.getByRole("status")).toContainText(
    "incomplete archived player identities",
  );
  await expect(
    playground.getByText("No competitors match this view"),
  ).toBeVisible();
});
