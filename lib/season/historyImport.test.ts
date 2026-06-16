import { describe, expect, it } from "vitest";

import {
  buildAllSeasonsWorkbook,
  buildSeasonWorkbook,
} from "./historyExport";
import { HISTORY_DATA_SHEET, parseHistoryWorkbook } from "./historyImport";
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
const NOW = 1760000000000;

type Workbook = import("exceljs").Workbook;

async function workbookBytes(wb: Workbook): Promise<ArrayBuffer> {
  const u8 = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  // slice() so the returned ArrayBuffer is exactly the workbook bytes
  // (a Node Buffer view can sit inside a larger pooled buffer).
  return u8.slice().buffer;
}

describe("parseHistoryWorkbook — embedded data sheet (lossless)", () => {
  it("round-trips the all-seasons workbook exactly", async () => {
    const entries = [
      fabricateEntry(),
      fabricateEntry({
        id: "s2",
        name: "2027 Season",
        complete: false,
        champion: null,
        initialMetaOverride: null,
        finalMetaOverride: null,
      }),
    ];
    const wb = await buildAllSeasonsWorkbook(entries, NAMES, NOW);
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("embedded");
    expect(result.entries).toEqual(entries);
  });

  it("round-trips a single-season workbook exactly", async () => {
    const entry = fabricateEntry();
    const wb = await buildSeasonWorkbook(entry, NAMES);
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("embedded");
    expect(result.entries).toEqual([entry]);
  });

  it("round-trips the expanded stats fields (best teams + award tallies)", async () => {
    const entry = fabricateEntry({
      leagueBestTeams: {
        LCK: { team: team("T1"), wins: 40, losses: 8, titles: 3 },
        LPL: { team: team("BLG", "LPL", "#0ac8b9"), wins: 35, losses: 12, titles: 1 },
      },
      awardTally: [
        { team: team("T1"), lane: "middle", mvp: 3, allPro: 5 },
        { team: team("GEN"), lane: "top", mvp: 0, allPro: 2 },
      ],
    });
    const wb = await buildSeasonWorkbook(entry, NAMES);
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].leagueBestTeams?.LCK?.wins).toBe(40);
    expect(result.entries[0].awardTally).toEqual(entry.awardTally);
    expect(result.entries).toEqual([entry]);
  });

  it("drops invalid lanes/tiers/teams instead of importing garbage", async () => {
    const corrupt = {
      ...fabricateEntry(),
      // Wrong shapes that a hand-edited payload could carry.
      champion: { name: "", leagueId: "LCK", color: "#fff", iconKey: "x" },
      intlChampions: {
        msi: { name: "T1", leagueId: "NOPE", color: 3, iconKey: null },
      },
      finalMetaOverride: {
        ahri: { middle: "S+", dance: "A", top: "Z" },
      },
    };
    // Build a valid workbook, then overwrite the hidden payload with the
    // corrupt JSON (the styled sheets can't render malformed entries).
    const wb = await buildAllSeasonsWorkbook([fabricateEntry()], NAMES, NOW);
    const ws = wb.getWorksheet(HISTORY_DATA_SHEET)!;
    ws.spliceRows(2, ws.rowCount);
    ws.getCell(2, 1).value = JSON.stringify([corrupt]);
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const e = result.entries[0];
    expect(e.champion).toBeNull(); // empty name rejected
    expect(e.intlChampions.msi).toBeUndefined(); // invalid league rejected
    expect(e.finalMetaOverride).toEqual({ ahri: { middle: "S+" } });
  });
});

describe("parseHistoryWorkbook — visible-sheet fallback (pre-data-sheet exports)", () => {
  it("reconstructs entries from the styled Hall of Seasons sheets", async () => {
    const entries = [fabricateEntry(), fabricateEntry({ id: "s2", name: "2027 Season", complete: false, champion: null })];
    const wb = await buildAllSeasonsWorkbook(entries, NAMES, NOW);
    wb.removeWorksheet(HISTORY_DATA_SHEET); // simulate an old export
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("sheets");
    expect(result.entries).toHaveLength(2);

    const [a, b] = result.entries;
    expect(a.name).toBe("2026 Season");
    expect(a.complete).toBe(true);
    expect(a.champion).toMatchObject({
      name: "T1",
      leagueId: "LCK",
      color: "#e84057", // recovered from the cell font color
    });
    expect(a.runnerUp).toMatchObject({ name: "BLG", leagueId: "LPL" });
    expect(a.intlChampions["first-stand"]).toMatchObject({
      name: "G2",
      leagueId: "LEC",
    });
    // The timeline's World Champion doubles as the Worlds title holder.
    expect(a.intlChampions.worlds).toMatchObject({ name: "T1" });
    // Split champions come from the second sheet.
    expect(a.splitChampions.winter?.LCK).toMatchObject({ name: "T1" });
    expect(a.splitChampions.winter?.LEC).toMatchObject({ name: "G2" });
    expect(a.splitChampions.summer?.LCK).toMatchObject({ name: "GEN" });
    // Ids are stable slugs so re-importing the same file upserts.
    expect(a.id).toBe("imported-2026-season");

    expect(b.name).toBe("2027 Season");
    expect(b.complete).toBe(false);
    expect(b.champion).toBeNull();
  });

  it("reconstructs a single season from its Overview sheet", async () => {
    const entry = fabricateEntry();
    const wb = await buildSeasonWorkbook(entry, NAMES);
    wb.removeWorksheet(HISTORY_DATA_SHEET);
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("sheets");
    const e = result.entries[0];
    // The Overview title is uppercased by the export — accepted as-is.
    expect(e.name).toBe("2026 SEASON");
    expect(e.complete).toBe(true);
    expect(e.champion).toMatchObject({ name: "T1", leagueId: "LCK" });
    expect(e.runnerUp).toMatchObject({ name: "BLG", leagueId: "LPL" });
    expect(e.intlChampions.msi).toMatchObject({ name: "T1" });
    expect(e.splitChampions.winter?.LCK).toMatchObject({ name: "T1" });
    expect(e.splitChampions.summer?.LCK).toMatchObject({ name: "GEN" });
    // Meta tables aren't reconstructable from display names.
    expect(e.initialMetaOverride).toBeUndefined();
    expect(e.finalMetaOverride).toBeUndefined();
  });
});

describe("parseHistoryWorkbook — rejection", () => {
  it("rejects a workbook that isn't a Hall of Seasons export", async () => {
    const mod = (await import("exceljs")) as
      | typeof import("exceljs")
      | { default: typeof import("exceljs") };
    const ExcelJS = "Workbook" in mod ? mod : mod.default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Totally Unrelated").getCell(1, 1).value = "hello";
    const result = await parseHistoryWorkbook(await workbookBytes(wb), NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects bytes that aren't an xlsx at all", async () => {
    const result = await parseHistoryWorkbook(
      new TextEncoder().encode("not a zip").buffer as ArrayBuffer,
      NOW,
    );
    expect(result.ok).toBe(false);
  });
});
