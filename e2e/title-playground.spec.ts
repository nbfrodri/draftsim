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
            {id: `buddy-${team.name}`, name: `${team.name} teammate`, lane: "support", tier: "A"},
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
      playerCareers: [{playerId:"traveller",playerName:"Traveller",leagueId:"LCK",teamName:"T1",lane:"middle",games:1000000,kills:0,mvps:0,allPro:0,splitTitles:3,intlAppearances:2,intlTitles:2,champs:[{championId:1,games:1000000,wins:543210}]}],
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
  await playground.getByRole("button", {name:"Pie chart",exact:true}).click();
  const pie = playground.getByRole("group", {name:"Team title share pie chart",exact:true});
  await expect(pie.getByRole("button", {name:"T1: 17 titles (20.0%). View breakdown",exact:true})).toBeVisible();
  await pie.getByRole("button", {name:"T1: 17 titles (20.0%). View breakdown",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(playground.getByRole("region",{name:"Title breakdown",exact:true})).toBeVisible();
  await expect(pie.locator("foreignObject")).toHaveCount(6);
  const percentages = playground.getByRole("checkbox",{name:"Show percentages on chart",exact:true});
  await expect(pie.locator("text")).toHaveCount(6);
  await percentages.uncheck();
  await expect(pie.locator("text")).toHaveCount(0);
  await percentages.check();
  expect(await pie.getByRole("button").first().evaluate(el => getComputedStyle(el).outlineStyle)).toBe("none");
  await page.screenshot({path:"test-results/playwright/title-playground-pie.png",fullPage:true});
  await playground.getByRole("group",{name:"Regions",exact:true}).getByRole("button",{name:"LCK",exact:true}).click();
  await expect(pie.getByRole("button", {name:"T1: 17 titles (100.0%). View breakdown",exact:true})).toBeVisible();
  await playground.getByRole("button",{name:"Domestic splits",exact:true}).click();
  await expect(pie.getByRole("button", {name:"T1: 12 titles (100.0%). View breakdown",exact:true})).toBeVisible();
  await playground.getByRole("button",{name:"Internationals",exact:true}).click();
  await expect(pie.getByRole("button", {name:"T1: 5 titles (100.0%). View breakdown",exact:true})).toBeVisible();
  await playground.getByRole("button",{name:"Reset filters",exact:true}).click();
  await playground.getByRole("button",{name:"Bars",exact:true}).click();
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
  await detail.getByRole("button", { name: "1", exact: true }).click();
  await expect(detail.getByRole("cell", { name: "MSI", exact: true })).toHaveCount(1);
  await detail.getByRole("button", { name: "G2", exact: true }).click();
  await expect(detail.getByRole("button", { name: "Team: G2 ×", exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Clear breakdown filters", exact: true }).click();
  await expect(detail.getByRole("cell", { name: "MSI", exact: true })).toHaveCount(4);
  await detail.getByRole("combobox", { name: "Breakdown split / event", exact: true }).click();
  await page.getByRole("option", { name: "Winter", exact: true }).click();
  await expect(detail.getByText("No titles match these breakdown filters.")).toBeVisible();
  await detail.getByRole("button", { name: "Clear breakdown filters", exact: true }).click();
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
  // Cards are desktop-only. Enable their environment gate after browser storage hydration.
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", {value:{}, configurable:true}));
  await page.getByRole("button", {name:"Reality · Alpha",exact:true}).click();
  const teamRow = playground.getByRole("button", {name:"T1: 17 titles. View breakdown",exact:true});
  await teamRow.getByText("T1", {exact:true}).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("tooltip").click();
  const results = page.getByText("Results History", {exact:true}).locator("..");
  await results.locator("summary").filter({hasText:"Winter"}).first().click();
  await expect(results.getByRole("region", {name:"winter roster snapshot"}).first()).toContainText("Traveller");
  await page.screenshot({path:"test-results/playwright/team-roster-snapshot.png",fullPage:true});
  const teamSnapshot = results.getByRole("region", {name:"winter roster snapshot"}).first();
  await teamSnapshot.getByRole("button",{name:"Close roster",exact:true}).click();
  await expect(teamSnapshot).not.toBeVisible();
  await expect(results.locator("summary").filter({hasText:"Winter"}).first()).toBeFocused();

  await page.getByRole("button", {name:"Title Playground",exact:true}).click();
  await playground.getByRole("button", {name:"Players",exact:true}).click();
  await playground.getByRole("button", {name:"Traveller: 21 titles. View breakdown",exact:true}).getByText("Traveller",{exact:true}).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByRole("tooltip").click();
  const teammates = page.getByRole("region",{name:"Most frequent teammates",exact:true});
  await expect(teammates.getByRole("listitem").first()).toContainText("T1 teammate");
  await expect(teammates.getByRole("listitem").first()).toContainText("4 seasons");
  await expect(teammates.getByRole("listitem").first()).toContainText("17 events");
  await teammates.getByText("T1 teammate",{exact:true}).click();
  const shared = teammates.getByRole("listitem").first();
  for (const year of [1,2,3,4]) await expect(shared.getByText(`Alpha — Year ${year}`,{exact:true})).toBeVisible();
  await expect(shared.getByRole("button",{name:"Open player profile",exact:true})).toBeVisible();
  await expect(shared.getByText("Winter",{exact:true})).toHaveCount(4);
  await expect(shared.getByText("Worlds",{exact:true})).toHaveCount(4);
  await expect(shared.getByRole("img",{name:"Global Cup",exact:true})).toHaveCount(1);
  await expect(shared.getByRole("button",{name:"View Alpha — Year 1 in timeline",exact:true})).toBeVisible();
  const pool = page.getByText("Champion Pool · Career",{exact:true}).locator("..");
  const gamesBox = await pool.getByText("4000000g",{exact:true}).boundingBox();
  const winsBox = await pool.getByText("2172840W",{exact:true}).boundingBox();
  expect(gamesBox!.x + gamesBox!.width).toBeLessThan(winsBox!.x);
  await page.screenshot({path:"test-results/playwright/teammate-years-and-large-pool.png",fullPage:true});
  const career = page.getByText("Career History",{exact:true}).locator("..");
  await career.locator("summary").filter({hasText:"Winter"}).first().click();
  await expect(career.getByRole("region", {name:/Winter.*roster snapshot/}).first()).toContainText("Traveller");
  await page.screenshot({path:"test-results/playwright/player-roster-snapshot.png",fullPage:true});
  const snapshot = career.getByRole("region", {name:/Winter.*roster snapshot/}).first();
  await snapshot.getByRole("button",{name:"Traveller",exact:true}).hover();
  await expect(page.getByRole("tooltip")).toContainText("T1");
  await page.mouse.move(0,0);
  await snapshot.getByRole("button",{name:"T1",exact:true}).hover();
  await expect(page.getByRole("tooltip")).toContainText("Traveller");
  await page.mouse.move(0,0);
  await snapshot.getByRole("button",{name:"Close roster",exact:true}).click();
  await expect(snapshot).not.toBeVisible();
  await expect(career.locator("summary").filter({hasText:"Winter"}).first()).toBeFocused();
  await page.getByRole("button", {name:"Title Playground",exact:true}).click();
  await playground.getByRole("button", {name:"T1: 17 titles. View breakdown",exact:true}).click();
  await playground.getByRole("button",{name:"View Alpha — Year 1 in timeline",exact:true}).first().click();
  await expect(playground).not.toBeVisible();
  await expect(page.getByRole("button",{name:"Timeline",exact:true})).toBeVisible();


});
