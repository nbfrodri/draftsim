import { describe, expect, it } from "vitest";

import {
  buildAllSeasonsWorkbook,
  buildSeasonWorkbook,
} from "./historyExport";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";

const team = (
  name: string,
  leagueId: SeasonHistoryTeamRef["leagueId"] = "LCK",
  color = "#e84057",
): SeasonHistoryTeamRef => ({ name, leagueId, color, iconKey: "sword" });

function fabricateEntry(
  overrides: Partial<SeasonHistoryEntry> = {},
): SeasonHistoryEntry {
  return {
    id: "season-x",
    archivedAt: 1750000000000, // 2025-06-15
    name: "2026 Season",
    complete: true,
    champion: team("T1"),
    runnerUp: team("BLG", "LPL", "#0ac8b9"),
    intlChampions: {
      "first-stand": team("G2", "LEC", "#c8aa6e"),
      msi: team("T1"),
      worlds: team("T1"),
    },
    splitChampions: {
      winter: { LCK: team("T1"), LEC: team("G2", "LEC") },
      summer: { LCK: team("GEN") },
    },
    initialMetaOverride: { ahri: { middle: "A" } },
    finalMetaOverride: { ahri: { middle: "S+" } },
    ...overrides,
  };
}

const NAMES = new Map([["ahri", "Ahri"]]);

describe("buildAllSeasonsWorkbook", () => {
  it("creates the three sheets with the season rows", async () => {
    const wb = await buildAllSeasonsWorkbook(
      [fabricateEntry(), fabricateEntry({ id: "s2", name: "2027 Season", complete: false, champion: null })],
      NAMES,
      1750000000000,
    );
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Hall of Seasons",
      "Split Champions",
      "Meta Shifts",
      "Archive Data",
    ]);
    // The data sheet is the hidden round-trip payload, not user-facing.
    expect(wb.getWorksheet("Archive Data")!.state).toBe("veryHidden");

    const overview = wb.getWorksheet("Hall of Seasons")!;
    // Title, subtitle, blank, header, then one row per season.
    expect(overview.getCell("A1").value).toBe("HALL OF SEASONS");
    expect(overview.getCell("B5").value).toBe("2026 Season");
    expect(overview.getCell("E5").value).toContain("T1 (LCK)");
    // Team font colored with the frozen team color.
    expect(overview.getCell("E5").font?.color?.argb).toBe("FFE84057");
    expect(overview.getCell("B6").value).toBe("2027 Season");
    expect(overview.getCell("D6").value).toBe("Unfinished");

    // Split champions: 2 seasons × 2 splits each = 4 data rows.
    const splits = wb.getWorksheet("Split Champions")!;
    expect(splits.getCell("B5").value).toBe("Winter Split");
    expect(splits.getCell("C5").value).toBe("T1 (LCK)");
    expect(splits.getCell("B6").value).toBe("Summer Split");

    // Meta shifts: ahri rose A → S+ in both seasons.
    const shifts = wb.getWorksheet("Meta Shifts")!;
    expect(shifts.getCell("B5").value).toBe("Ahri");
    expect(shifts.getCell("D5").value).toBe("A");
    expect(shifts.getCell("E5").value).toBe("S+");
    expect(String(shifts.getCell("F5").value)).toContain("▲");
  });

  it("produces a valid xlsx buffer (zip magic)", async () => {
    const wb = await buildAllSeasonsWorkbook([fabricateEntry()], NAMES, 1);
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(buf.length).toBeGreaterThan(1000);
    expect([buf[0], buf[1]]).toEqual([0x50, 0x4b]); // "PK"
  });
});

describe("buildSeasonWorkbook", () => {
  it("creates overview + both meta sheets + shifts", async () => {
    const wb = await buildSeasonWorkbook(fabricateEntry(), NAMES);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Overview",
      "Starting Meta",
      "Final Meta",
      "Meta Shifts",
      "Archive Data",
    ]);
    const overview = wb.getWorksheet("Overview")!;
    expect(overview.getCell("A1").value).toBe("2026 SEASON");
    // Headline row carries champion def. runner-up.
    const headline = String(overview.getCell("A5").value);
    expect(headline).toContain("T1 (LCK)");
    expect(headline).toContain("BLG (LPL)");
    // Final meta tier table places Ahri in the S+ row, Mid column.
    const final = wb.getWorksheet("Final Meta")!;
    const tierCol: string[] = [];
    final.getColumn(1).eachCell((cell) => tierCol.push(String(cell.value)));
    const sPlusRowIdx = tierCol.indexOf("S+");
    expect(sPlusRowIdx).toBeGreaterThan(-1);
  });

  it("omits meta sheets when the archive pre-dates meta snapshots", async () => {
    const wb = await buildSeasonWorkbook(
      fabricateEntry({
        initialMetaOverride: undefined,
        finalMetaOverride: undefined,
      }),
      NAMES,
    );
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Overview",
      "Archive Data",
    ]);
  });

  it("handles an empty unfinished season without crashing", async () => {
    const wb = await buildSeasonWorkbook(
      fabricateEntry({
        complete: false,
        champion: null,
        runnerUp: null,
        intlChampions: {},
        splitChampions: {},
        initialMetaOverride: undefined,
        finalMetaOverride: null,
      }),
      NAMES,
    );
    const overview = wb.getWorksheet("Overview")!;
    expect(overview.getCell("A4").value).toBe("SEASON UNFINISHED");
    expect(overview.getCell("A5").value).toBe("No champion recorded");
  });
});
