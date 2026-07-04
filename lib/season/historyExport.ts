// Hall of Seasons → spreadsheet export. Builds a styled .xlsx workbook
// (rift-gold theme, league/team colors, tier fills) that Google Sheets,
// Excel and LibreOffice all open with the formatting intact — "export
// for Google Sheets" without needing the Sheets API.
//
// ExcelJS is dynamic-imported so the ~1MB library only loads when the
// user actually exports (and never during SSG).

import {
  diffMetaOverrides,
  type SeasonHistoryEntry,
  type SeasonHistoryTeamRef,
} from "./history";
import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "../championMeta";
import type { Lane } from "../types";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  SPLIT_LABELS,
  type InternationalId,
  type SplitId,
  INTERNATIONAL_DISPLAY_ORDER,
} from "./types";
import { isDesktop, saveBinaryFileNative } from "../desktopStorage";
import {
  HISTORY_DATA_CHUNK,
  HISTORY_DATA_MARKER,
  HISTORY_DATA_SHEET,
} from "./historyImport";

type Worksheet = import("exceljs").Worksheet;
type Workbook = import("exceljs").Workbook;
type Fill = import("exceljs").Fill;
type Borders = import("exceljs").Borders;

// ---------------------------------------------------------------------------
// Theme (mirrors the rift palette in tailwind.config.ts), as ARGB.
// ---------------------------------------------------------------------------

const C = {
  bg: "FF010A13",
  bgdeep: "FF000308",
  panel: "FF091428",
  paneldark: "FF04101C",
  line: "FF1E2328",
  gold: "FFC8AA6E",
  goldbright: "FFF0E6D2",
  golddark: "FF785A28",
  blue: "FF0AC8B9",
  bluebright: "FFCDFAFA",
  bluedeep: "FF005A82",
  muted: "FF5B5A56",
  mutedbright: "FFA09B8C",
} as const;

function fill(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const BORDER: Partial<Borders> = {
  top: { style: "thin", color: { argb: C.line } },
  left: { style: "thin", color: { argb: C.line } },
  bottom: { style: "thin", color: { argb: C.line } },
  right: { style: "thin", color: { argb: C.line } },
};

// Tier pill colors — gold-to-dim with tier strength, same idea as the UI.
const TIER_STYLE: Record<MetaTier, { fill: Fill; font: string }> = {
  "S+": { fill: fill(C.gold), font: C.bg },
  S: { fill: fill(C.golddark), font: C.goldbright },
  A: { fill: fill(C.bluedeep), font: C.bluebright },
  B: { fill: fill(C.line), font: C.mutedbright },
  C: { fill: fill(C.paneldark), font: C.mutedbright },
  D: { fill: fill(C.bgdeep), font: C.muted },
};

const INTL_ORDER = INTERNATIONAL_DISPLAY_ORDER;
const SPLIT_ORDER: readonly SplitId[] = ["winter", "spring", "summer"];
const LANES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

/** Team `color` (CSS hex like "#e84057") → ARGB, with a readable fallback. */
function teamArgb(team: SeasonHistoryTeamRef): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(team.color?.trim() ?? "");
  if (m) return `FF${m[1].toUpperCase()}`;
  const short = /^#?([0-9a-fA-F]{3})$/.exec(team.color?.trim() ?? "");
  if (short) {
    const [r, g, b] = short[1].toUpperCase();
    return `FF${r}${r}${g}${g}${b}${b}`;
  }
  return C.goldbright;
}

function teamLabel(team: SeasonHistoryTeamRef): string {
  return `${team.name} (${team.leagueId})`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Low-level cell helpers
// ---------------------------------------------------------------------------

interface CellSpec {
  v: string | number;
  /** Font color (ARGB). */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  fill?: Fill;
  align?: "left" | "center" | "right";
  wrap?: boolean;
}

function writeRow(
  ws: Worksheet,
  rowIdx: number,
  cells: (CellSpec | null)[],
  opts?: { height?: number; defaultFill?: Fill },
): void {
  const row = ws.getRow(rowIdx);
  if (opts?.height) row.height = opts.height;
  cells.forEach((spec, i) => {
    const cell = row.getCell(i + 1);
    if (spec === null) {
      if (opts?.defaultFill) cell.fill = opts.defaultFill;
      cell.border = BORDER;
      return;
    }
    cell.value = spec.v;
    cell.font = {
      name: "Calibri",
      size: spec.size ?? 10,
      bold: spec.bold ?? false,
      italic: spec.italic ?? false,
      color: { argb: spec.color ?? C.mutedbright },
    };
    cell.fill = spec.fill ?? opts?.defaultFill ?? fill(C.panel);
    cell.alignment = {
      horizontal: spec.align ?? "left",
      vertical: "middle",
      wrapText: spec.wrap ?? false,
    };
    cell.border = BORDER;
  });
}

/** Big merged title banner + muted subtitle, returns the next free row. */
function writeTitle(
  ws: Worksheet,
  title: string,
  subtitle: string,
  widthCols: number,
): number {
  ws.mergeCells(1, 1, 1, widthCols);
  writeRow(
    ws,
    1,
    [{ v: title, color: C.goldbright, bold: true, size: 16, fill: fill(C.bgdeep), align: "center" }],
    { height: 30 },
  );
  ws.mergeCells(2, 1, 2, widthCols);
  writeRow(
    ws,
    2,
    [{ v: subtitle, color: C.muted, italic: true, size: 9, fill: fill(C.bgdeep), align: "center" }],
    { height: 16 },
  );
  return 3;
}

function writeHeaderRow(ws: Worksheet, rowIdx: number, labels: string[]): void {
  writeRow(
    ws,
    rowIdx,
    labels.map((v) => ({
      v: v.toUpperCase(),
      color: C.gold,
      bold: true,
      size: 9,
      fill: fill(C.bg),
      align: "left" as const,
    })),
    { height: 18 },
  );
}

function zebraFill(i: number): Fill {
  return fill(i % 2 === 0 ? C.panel : C.paneldark);
}

function teamCell(team: SeasonHistoryTeamRef | null | undefined, rowFill: Fill): CellSpec {
  if (!team) return { v: "—", color: C.muted, italic: true, fill: rowFill };
  return { v: teamLabel(team), color: teamArgb(team), bold: true, fill: rowFill };
}

// Effective tier of a champion-lane under an archived override (override
// entry wins; baseline CHAMPION_META otherwise).
function effectiveTier(
  override: MetaOverride | null,
  alias: string,
  lane: Lane,
): MetaTier | null {
  return (
    override?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/** One row per archived season — the timeline at a glance. */
function addOverviewSheet(wb: Workbook, entries: SeasonHistoryEntry[], exportedAt: number): void {
  const ws = wb.addWorksheet("Hall of Seasons");
  [5, 26, 12, 12, 30, 26, 24, 24].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  let r = writeTitle(
    ws,
    "HALL OF SEASONS",
    `DraftSim season archive · ${entries.length} season${entries.length === 1 ? "" : "s"} · exported ${fmtDate(exportedAt)}`,
    9,
  );
  r += 1;
  writeHeaderRow(ws, r, [
    "#",
    "Season",
    "Archived",
    "Status",
    "World Champion",
    "Runner-Up",
    "First Stand",
    "MSI",
    "Global Cup",
  ]);
  ws.views = [{ state: "frozen", ySplit: r }];
  r += 1;
  entries.forEach((e, i) => {
    const rf = zebraFill(i);
    const champ = e.champion ? { ...teamCell(e.champion, rf), v: `🏆 ${teamLabel(e.champion)}` } : teamCell(null, rf);
    writeRow(
      ws,
      r + i,
      [
        { v: i + 1, color: C.muted, fill: rf, align: "center" },
        { v: e.name, color: C.goldbright, bold: true, fill: rf },
        { v: fmtDate(e.archivedAt), color: C.mutedbright, fill: rf },
        e.complete
          ? { v: "Complete", color: C.gold, fill: rf }
          : { v: "Unfinished", color: C.muted, italic: true, fill: rf },
        champ,
        teamCell(e.runnerUp, rf),
        teamCell(e.intlChampions["first-stand"], rf),
        teamCell(e.intlChampions.msi, rf),
        teamCell(e.intlChampions["global-cup"], rf),
      ],
      { height: 16 },
    );
  });
}

/** Season × split rows, one column per league. */
function addSplitChampionsSheet(wb: Workbook, entries: SeasonHistoryEntry[]): void {
  const ws = wb.addWorksheet("Split Champions");
  [26, 14, ...LEAGUE_IDS.map(() => 22)].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const cols = 2 + LEAGUE_IDS.length;
  let r = writeTitle(ws, "SPLIT CHAMPIONS", "Winner of every split, per league", cols);
  r += 1;
  writeHeaderRow(ws, r, ["Season", "Split", ...LEAGUE_IDS]);
  ws.views = [{ state: "frozen", ySplit: r }];
  r += 1;
  let band = 0;
  for (const e of entries) {
    const splits = SPLIT_ORDER.filter((s) => e.splitChampions[s]);
    if (splits.length === 0) continue;
    const rf = zebraFill(band++);
    const start = r;
    for (const split of splits) {
      writeRow(
        ws,
        r,
        [
          { v: e.name, color: C.goldbright, bold: true, fill: rf },
          { v: SPLIT_LABELS[split], color: C.gold, fill: rf },
          ...LEAGUE_IDS.map((league) =>
            teamCell(e.splitChampions[split]?.[league], rf),
          ),
        ],
        { height: 16 },
      );
      r += 1;
    }
    if (r - 1 > start) {
      ws.mergeCells(start, 1, r - 1, 1);
      ws.getCell(start, 1).alignment = { horizontal: "left", vertical: "middle" };
    }
  }
}

/** Every champion-lane tier movement over the season(s), biggest swings
 *  first. `withSeasonColumn` is set for the all-seasons workbook. */
function addMetaShiftsSheet(
  wb: Workbook,
  entries: SeasonHistoryEntry[],
  nameByAlias: Map<string, string>,
  withSeasonColumn: boolean,
): void {
  const rows: Array<{ season: string; alias: string; lane: Lane; from: MetaTier; to: MetaTier }> = [];
  for (const e of entries) {
    if (e.initialMetaOverride === undefined || e.finalMetaOverride === undefined) continue;
    for (const s of diffMetaOverrides(e.initialMetaOverride ?? null, e.finalMetaOverride ?? null)) {
      rows.push({ season: e.name, ...s });
    }
  }
  if (rows.length === 0) return;

  const ws = wb.addWorksheet("Meta Shifts");
  const widths = withSeasonColumn ? [26, 20, 10, 8, 8, 10] : [20, 10, 8, 8, 10];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  let r = writeTitle(
    ws,
    "META SHIFTS",
    "Champion tier movement, season start → finish (biggest swings first)",
    widths.length,
  );
  r += 1;
  writeHeaderRow(
    ws,
    r,
    withSeasonColumn
      ? ["Season", "Champion", "Lane", "Start", "End", "Move"]
      : ["Champion", "Lane", "Start", "End", "Move"],
  );
  ws.views = [{ state: "frozen", ySplit: r }];
  r += 1;
  const laneLabel = new Map(LANES.map(({ lane, label }) => [lane, label]));
  rows.forEach((row, i) => {
    const rf = zebraFill(i);
    const delta = TIER_ORDER.indexOf(row.from) - TIER_ORDER.indexOf(row.to);
    const rose = delta > 0;
    const tierCell = (tier: MetaTier): CellSpec => ({
      v: tier,
      ...{ color: TIER_STYLE[tier].font, fill: TIER_STYLE[tier].fill },
      bold: true,
      align: "center",
    });
    writeRow(
      ws,
      r + i,
      [
        ...(withSeasonColumn
          ? [{ v: row.season, color: C.goldbright, fill: rf } satisfies CellSpec]
          : []),
        { v: nameByAlias.get(row.alias) ?? row.alias, color: C.mutedbright, bold: true, fill: rf },
        { v: laneLabel.get(row.lane) ?? row.lane, color: C.muted, fill: rf },
        tierCell(row.from),
        tierCell(row.to),
        {
          v: `${rose ? "▲" : "▼"} ${rose ? "+" : "−"}${Math.abs(delta)}`,
          color: rose ? C.gold : C.blue,
          bold: true,
          fill: rf,
          align: "center",
        },
      ],
      { height: 15 },
    );
  });
}

/** Full tier table snapshot: a row per tier, a column per lane. */
function addTierTableSheet(
  wb: Workbook,
  sheetName: string,
  subtitle: string,
  override: MetaOverride | null,
  nameByAlias: Map<string, string>,
): void {
  const ws = wb.addWorksheet(sheetName);
  [7, ...LANES.map(() => 34)].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  let r = writeTitle(ws, sheetName.toUpperCase(), subtitle, 1 + LANES.length);
  r += 1;
  writeHeaderRow(ws, r, ["Tier", ...LANES.map((l) => l.label)]);
  r += 1;

  const aliases = new Set<string>([
    ...Object.keys(CHAMPION_META),
    ...Object.keys(override ?? {}),
  ]);
  for (const tier of TIER_ORDER) {
    const byLane = LANES.map(({ lane }) => {
      const names: string[] = [];
      for (const alias of aliases) {
        if (effectiveTier(override, alias, lane) === tier) {
          names.push(nameByAlias.get(alias) ?? alias);
        }
      }
      names.sort((a, b) => a.localeCompare(b));
      return names.join(", ");
    });
    if (byLane.every((s) => s === "")) continue;
    writeRow(
      ws,
      r,
      [
        {
          v: tier,
          color: TIER_STYLE[tier].font,
          fill: TIER_STYLE[tier].fill,
          bold: true,
          align: "center",
        },
        ...byLane.map((names) => ({
          v: names,
          color: C.mutedbright,
          fill: fill(C.panel),
          wrap: true,
        })),
      ],
      { height: 44 },
    );
    r += 1;
  }
}

/** Single season résumé — the SeasonDetail panel as a sheet. */
function addSeasonOverviewSheet(
  wb: Workbook,
  e: SeasonHistoryEntry,
): void {
  const ws = wb.addWorksheet("Overview");
  [18, 26, 26, 26].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  let r = writeTitle(
    ws,
    e.name.toUpperCase(),
    `Archived ${fmtDate(e.archivedAt)} · ${e.complete ? "Season complete" : "Season unfinished"}`,
    4,
  );
  r += 1;

  // Headline — World Champion def. runner-up.
  ws.mergeCells(r, 1, r, 4);
  writeRow(ws, r, [
    {
      v: e.complete ? "WORLD CHAMPION" : "SEASON UNFINISHED",
      color: C.gold,
      bold: true,
      size: 9,
      fill: fill(C.bg),
    },
  ]);
  r += 1;
  ws.mergeCells(r, 1, r, 4);
  writeRow(
    ws,
    r,
    [
      e.champion
        ? {
            v: `🏆 ${teamLabel(e.champion)}${e.runnerUp ? `   def.   ${teamLabel(e.runnerUp)}` : ""}`,
            color: teamArgb(e.champion),
            bold: true,
            size: 14,
            fill: fill(C.panel),
          }
        : { v: "No champion recorded", color: C.muted, italic: true, fill: fill(C.panel) },
    ],
    { height: 26 },
  );
  r += 2;

  // International title holders.
  const intls = INTL_ORDER.filter((ev) => e.intlChampions[ev]);
  if (intls.length > 0) {
    ws.mergeCells(r, 1, r, 4);
    writeRow(ws, r, [
      { v: "INTERNATIONAL CHAMPIONS", color: C.gold, bold: true, size: 9, fill: fill(C.bg) },
    ]);
    r += 1;
    for (const ev of intls) {
      const rf = fill(C.panel);
      ws.mergeCells(r, 2, r, 4);
      writeRow(ws, r, [
        { v: INTERNATIONAL_LABELS[ev], color: C.mutedbright, fill: rf },
        teamCell(e.intlChampions[ev], rf),
      ]);
      r += 1;
    }
    r += 1;
  }

  // Split champions grid — a row per league, a column per split.
  const splits = SPLIT_ORDER.filter((s) => e.splitChampions[s]);
  if (splits.length > 0) {
    ws.mergeCells(r, 1, r, 4);
    writeRow(ws, r, [
      { v: "SPLIT CHAMPIONS", color: C.gold, bold: true, size: 9, fill: fill(C.bg) },
    ]);
    r += 1;
    writeHeaderRow(ws, r, ["League", ...splits.map((s) => SPLIT_LABELS[s])]);
    r += 1;
    let band = 0;
    for (const league of LEAGUE_IDS) {
      if (!splits.some((s) => e.splitChampions[s]?.[league])) continue;
      const rf = zebraFill(band++);
      writeRow(
        ws,
        r,
        [
          { v: league, color: C.gold, bold: true, fill: rf, align: "center" },
          ...splits.map((s) => teamCell(e.splitChampions[s]?.[league], rf)),
        ],
        { height: 16 },
      );
      r += 1;
    }
  }
}

/** Hidden machine-readable payload (read back by historyImport). The
 *  styled sheets are lossy — icons, exact timestamps and the meta tier
 *  tables don't survive them — so every export embeds the raw entries
 *  as JSON, letting "Import (.xlsx)" round-trip the archive exactly. */
function addDataSheet(wb: Workbook, entries: SeasonHistoryEntry[]): void {
  const ws = wb.addWorksheet(HISTORY_DATA_SHEET, {
    state: "veryHidden",
  });
  ws.getCell(1, 1).value = HISTORY_DATA_MARKER;
  const json = JSON.stringify(entries);
  for (let i = 0, row = 2; i < json.length; i += HISTORY_DATA_CHUNK, row++) {
    ws.getCell(row, 1).value = json.slice(i, i + HISTORY_DATA_CHUNK);
  }
}

// ---------------------------------------------------------------------------
// Workbook builders + save
// ---------------------------------------------------------------------------

async function newWorkbook(): Promise<Workbook> {
  // exceljs is CJS — handle both interop shapes.
  const mod = (await import("exceljs")) as
    | typeof import("exceljs")
    | { default: typeof import("exceljs") };
  const ExcelJS = "Workbook" in mod ? mod : mod.default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DraftSim";
  return wb;
}

async function workbookBytes(wb: Workbook): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Desktop: native Save dialog. Web: browser download (then import the
 *  file into Google Sheets via File → Import, or drop it into Drive). */
async function saveXlsx(
  filename: string,
  data: Uint8Array,
): Promise<{ ok: boolean; error?: string }> {
  if (isDesktop()) {
    return saveBinaryFileNative({
      defaultPath: filename,
      filters: [{ name: "Excel / Google Sheets Workbook", extensions: ["xlsx"] }],
      content: data,
    });
  }
  try {
    const blob = new Blob([data as unknown as BlobPart], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function safeFilename(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, "_")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "season"
  );
}

/** Build the whole-Hall-of-Seasons workbook (exported for tests). */
export async function buildAllSeasonsWorkbook(
  entries: SeasonHistoryEntry[],
  nameByAlias: Map<string, string>,
  exportedAt: number,
): Promise<Workbook> {
  const wb = await newWorkbook();
  addOverviewSheet(wb, entries, exportedAt);
  addSplitChampionsSheet(wb, entries);
  addMetaShiftsSheet(wb, entries, nameByAlias, true);
  addDataSheet(wb, entries);
  return wb;
}

/** Build a single archived season's workbook (exported for tests). */
export async function buildSeasonWorkbook(
  entry: SeasonHistoryEntry,
  nameByAlias: Map<string, string>,
): Promise<Workbook> {
  const wb = await newWorkbook();
  addSeasonOverviewSheet(wb, entry);
  if (entry.initialMetaOverride !== undefined) {
    addTierTableSheet(
      wb,
      "Starting Meta",
      "Champion tier table the season started on",
      entry.initialMetaOverride ?? null,
      nameByAlias,
    );
  }
  if (entry.finalMetaOverride !== undefined) {
    addTierTableSheet(
      wb,
      "Final Meta",
      "Champion tier table at archive time, after a season of drift",
      entry.finalMetaOverride ?? null,
      nameByAlias,
    );
  }
  addMetaShiftsSheet(wb, [entry], nameByAlias, false);
  addDataSheet(wb, [entry]);
  return wb;
}

/** Export the whole Hall of Seasons as one styled workbook. */
export async function exportAllSeasonsXlsx(
  entries: SeasonHistoryEntry[],
  nameByAlias: Map<string, string>,
  exportedAt: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const wb = await buildAllSeasonsWorkbook(entries, nameByAlias, exportedAt);
    return await saveXlsx("hall-of-seasons.xlsx", await workbookBytes(wb));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Export one archived season as its own styled workbook. */
export async function exportSeasonXlsx(
  entry: SeasonHistoryEntry,
  nameByAlias: Map<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const wb = await buildSeasonWorkbook(entry, nameByAlias);
    return await saveXlsx(
      `${safeFilename(entry.name)}.xlsx`,
      await workbookBytes(wb),
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
