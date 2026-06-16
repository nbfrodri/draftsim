// Hall of Seasons ← spreadsheet import. Reads a .xlsx workbook back
// into SeasonHistoryEntry[] so an exported archive can be restored (or
// moved between devices / web ↔ desktop).
//
// Two sources, tried in order:
//  1. The hidden "Archive Data" sheet — a JSON payload every export
//     embeds (see historyExport). Lossless round-trip: ids, timestamps,
//     icons and meta tables all survive.
//  2. The styled visible sheets ("Hall of Seasons" + "Split Champions",
//     or a single season's "Overview") — best-effort fallback for
//     exports made before the data sheet existed or files edited by
//     hand. Team colors are recovered from the cell font colors; icons
//     and meta tables can't be (the sheets only carry display text).
//
// ExcelJS is dynamic-imported for the same reason as the exporter: the
// ~1MB library only loads when the user actually imports.

import { TIER_ORDER, type MetaOverride, type MetaTier } from "../championMeta";
import type { Lane } from "../types";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "./types";

type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;

// Hidden payload sheet — written by historyExport, read here. The
// marker cell guards against unrelated workbooks that happen to have a
// sheet with the same name; chunking keeps every cell well under
// Excel's 32 767-character cell limit.
export const HISTORY_DATA_SHEET = "Archive Data";
export const HISTORY_DATA_MARKER = "draftsim:hall-of-seasons:v1";
export const HISTORY_DATA_CHUNK = 30000;

export type HistoryImportResult =
  | { ok: true; entries: SeasonHistoryEntry[]; source: "embedded" | "sheets" }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Validation / sanitization — imported data is untrusted (hand-edited
// spreadsheets, other tools), so every field is checked before it gets
// anywhere near the persisted store.
// ---------------------------------------------------------------------------

const VALID_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

function isLeagueId(v: unknown): v is LeagueId {
  return typeof v === "string" && (LEAGUE_IDS as readonly string[]).includes(v);
}

const SPLIT_IDS = Object.keys(SPLIT_LABELS) as SplitId[];
const INTL_IDS = Object.keys(INTERNATIONAL_LABELS) as InternationalId[];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function sanitizeTeamRef(v: unknown): SeasonHistoryTeamRef | null {
  const o = asRecord(v);
  if (!o || typeof o.name !== "string" || o.name.trim() === "") return null;
  if (!isLeagueId(o.leagueId)) return null;
  return {
    name: o.name.trim(),
    leagueId: o.leagueId,
    color: typeof o.color === "string" ? o.color : "#c8aa6e",
    iconKey: typeof o.iconKey === "string" ? o.iconKey : "shield",
  };
}

/** Keep only champion→lane→tier entries with valid lanes and tiers.
 *  null stays null (= default tiers); anything malformed → undefined. */
function sanitizeMetaOverride(v: unknown): MetaOverride | null | undefined {
  if (v === null) return null;
  const o = asRecord(v);
  if (!o) return undefined;
  const out: MetaOverride = {};
  for (const [alias, lanes] of Object.entries(o)) {
    const laneRec = asRecord(lanes);
    if (!laneRec) continue;
    const cleaned: Partial<Record<Lane, MetaTier>> = {};
    for (const lane of VALID_LANES) {
      const tier = laneRec[lane];
      if (typeof tier === "string" && TIER_ORDER.includes(tier as MetaTier)) {
        cleaned[lane] = tier as MetaTier;
      }
    }
    if (Object.keys(cleaned).length > 0) out[alias] = cleaned;
  }
  return out;
}

function intOr(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : fallback;
}

/** Per-league best-team map from an imported entry. Malformed entries
 *  are dropped; an empty result returns undefined so the field stays off. */
function sanitizeLeagueBestTeams(
  v: unknown,
): SeasonHistoryEntry["leagueBestTeams"] | undefined {
  const o = asRecord(v);
  if (!o) return undefined;
  const out: NonNullable<SeasonHistoryEntry["leagueBestTeams"]> = {};
  for (const league of LEAGUE_IDS) {
    const cell = asRecord(o[league]);
    if (!cell) continue;
    const team = sanitizeTeamRef(cell.team);
    if (!team) continue;
    out[league] = {
      team,
      wins: intOr(cell.wins),
      losses: intOr(cell.losses),
      titles: intOr(cell.titles),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Award tallies (team-position MVP / All-Pro counts) from an imported
 *  entry. Rows with no team, bad lane, or zero counts are dropped. */
function sanitizeAwardTally(
  v: unknown,
): SeasonHistoryEntry["awardTally"] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<SeasonHistoryEntry["awardTally"]> = [];
  for (const raw of v) {
    const o = asRecord(raw);
    if (!o) continue;
    const team = sanitizeTeamRef(o.team);
    if (!team) continue;
    if (!VALID_LANES.includes(o.lane as Lane)) continue;
    const mvp = intOr(o.mvp);
    const allPro = intOr(o.allPro);
    if (mvp === 0 && allPro === 0) continue;
    out.push({ team, lane: o.lane as Lane, mvp, allPro });
  }
  return out.length > 0 ? out : undefined;
}

function slugId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `imported-${slug || "season"}`;
}

/** Validate one entry-shaped value; null when it can't become a valid
 *  SeasonHistoryEntry. `now` stamps entries missing a usable date. */
function sanitizeEntry(v: unknown, now: number): SeasonHistoryEntry | null {
  const o = asRecord(v);
  if (!o || typeof o.name !== "string" || o.name.trim() === "") return null;
  const name = o.name.trim();
  const intlChampions: SeasonHistoryEntry["intlChampions"] = {};
  const rawIntl = asRecord(o.intlChampions) ?? {};
  for (const ev of INTL_IDS) {
    const ref = sanitizeTeamRef(rawIntl[ev]);
    if (ref) intlChampions[ev] = ref;
  }
  const splitChampions: SeasonHistoryEntry["splitChampions"] = {};
  const rawSplits = asRecord(o.splitChampions) ?? {};
  for (const split of SPLIT_IDS) {
    const byLeague = asRecord(rawSplits[split]);
    if (!byLeague) continue;
    const out: Partial<Record<LeagueId, SeasonHistoryTeamRef>> = {};
    for (const league of LEAGUE_IDS) {
      const ref = sanitizeTeamRef(byLeague[league]);
      if (ref) out[league] = ref;
    }
    if (Object.keys(out).length > 0) splitChampions[split] = out;
  }
  const initial = sanitizeMetaOverride(o.initialMetaOverride);
  const final = sanitizeMetaOverride(o.finalMetaOverride);
  const leagueBestTeams = sanitizeLeagueBestTeams(o.leagueBestTeams);
  const awardTally = sanitizeAwardTally(o.awardTally);
  return {
    id:
      typeof o.id === "string" && o.id.trim() !== "" ? o.id.trim() : slugId(name),
    archivedAt:
      typeof o.archivedAt === "number" && Number.isFinite(o.archivedAt)
        ? o.archivedAt
        : now,
    name,
    complete: o.complete === true,
    champion: sanitizeTeamRef(o.champion),
    runnerUp: sanitizeTeamRef(o.runnerUp),
    intlChampions,
    splitChampions,
    ...(initial !== undefined ? { initialMetaOverride: initial } : {}),
    ...(final !== undefined ? { finalMetaOverride: final } : {}),
    ...(leagueBestTeams ? { leagueBestTeams } : {}),
    ...(awardTally ? { awardTally } : {}),
  };
}

// ---------------------------------------------------------------------------
// Source 1: the hidden JSON payload sheet
// ---------------------------------------------------------------------------

function readEmbeddedEntries(
  wb: Workbook,
  now: number,
): SeasonHistoryEntry[] | null {
  const ws = wb.getWorksheet(HISTORY_DATA_SHEET);
  if (!ws || String(ws.getCell(1, 1).value ?? "") !== HISTORY_DATA_MARKER) {
    return null;
  }
  let json = "";
  for (let r = 2; r <= ws.rowCount; r++) {
    const chunk = ws.getCell(r, 1).value;
    if (chunk == null || chunk === "") break;
    json += String(chunk);
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((e) => sanitizeEntry(e, now))
      .filter((e): e is SeasonHistoryEntry => e !== null);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 2: the styled visible sheets (best-effort)
// ---------------------------------------------------------------------------

function cellText(ws: Worksheet, row: number, col: number): string {
  try {
    return ws.getCell(row, col).text?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Cell font color (ARGB like "FFE84057") → CSS hex, or null. */
function cellColor(ws: Worksheet, row: number, col: number): string | null {
  try {
    const argb = ws.getCell(row, col).font?.color?.argb;
    if (typeof argb === "string" && /^[0-9A-Fa-f]{8}$/.test(argb)) {
      return `#${argb.slice(2).toLowerCase()}`;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Parse a "Name (LCK)" team cell (optionally 🏆-prefixed) into a ref,
 *  recovering the team color from the cell's font color. */
function parseTeamCell(
  ws: Worksheet,
  row: number,
  col: number,
): SeasonHistoryTeamRef | null {
  const text = cellText(ws, row, col);
  if (text === "" || text === "—") return null;
  const m = /^(?:🏆\s*)?(.+?)\s*\(([A-Za-z0-9]{2,8})\)$/u.exec(text);
  if (!m || !isLeagueId(m[2])) return null;
  return {
    name: m[1].trim(),
    leagueId: m[2],
    color: cellColor(ws, row, col) ?? "#c8aa6e",
    iconKey: "shield",
  };
}

/** First row whose column-A text matches (case-insensitive). */
function findRow(ws: Worksheet, text: string, from = 1): number {
  for (let r = from; r <= ws.rowCount; r++) {
    if (cellText(ws, r, 1).toUpperCase() === text.toUpperCase()) return r;
  }
  return -1;
}

function parseArchivedDate(text: string, now: number): number {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return now;
  const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ts) ? ts : now;
}

const SPLIT_BY_LABEL = new Map<string, SplitId>(
  SPLIT_IDS.map((s) => [SPLIT_LABELS[s].toUpperCase(), s]),
);
const INTL_BY_LABEL = new Map<string, InternationalId>(
  INTL_IDS.map((e) => [INTERNATIONAL_LABELS[e].toUpperCase(), e]),
);

/** All-seasons workbook: "Hall of Seasons" timeline rows, then the
 *  "Split Champions" grid merged in by season name. */
function parseAllSeasonsSheets(
  wb: Workbook,
  now: number,
): SeasonHistoryEntry[] | null {
  const ws = wb.getWorksheet("Hall of Seasons");
  if (!ws) return null;
  const header = findRow(ws, "#");
  if (header === -1) return null;
  const entries: SeasonHistoryEntry[] = [];
  const byName = new Map<string, SeasonHistoryEntry>();
  for (let r = header + 1; r <= ws.rowCount; r++) {
    const name = cellText(ws, r, 2);
    if (name === "") continue;
    const champion = parseTeamCell(ws, r, 5);
    const intlChampions: SeasonHistoryEntry["intlChampions"] = {};
    const fs = parseTeamCell(ws, r, 7);
    const msi = parseTeamCell(ws, r, 8);
    if (fs) intlChampions["first-stand"] = fs;
    if (msi) intlChampions.msi = msi;
    // The timeline's World Champion IS the Worlds title holder.
    if (champion) intlChampions.worlds = champion;
    const entry: SeasonHistoryEntry = {
      id: slugId(name),
      archivedAt: parseArchivedDate(cellText(ws, r, 3), now),
      name,
      complete: cellText(ws, r, 4).toUpperCase() === "COMPLETE",
      champion,
      runnerUp: parseTeamCell(ws, r, 6),
      intlChampions,
      splitChampions: {},
    };
    entries.push(entry);
    byName.set(name, entry);
  }
  if (entries.length === 0) return null;

  const splitsWs = wb.getWorksheet("Split Champions");
  if (splitsWs) {
    const sHeader = findRow(splitsWs, "SEASON");
    if (sHeader !== -1) {
      let currentName = ""; // season cell is merged across its splits
      for (let r = sHeader + 1; r <= splitsWs.rowCount; r++) {
        const nameCell = cellText(splitsWs, r, 1);
        if (nameCell !== "") currentName = nameCell;
        const split = SPLIT_BY_LABEL.get(cellText(splitsWs, r, 2).toUpperCase());
        const entry = byName.get(currentName);
        if (!split || !entry) continue;
        const out: Partial<Record<LeagueId, SeasonHistoryTeamRef>> = {};
        LEAGUE_IDS.forEach((league, i) => {
          const ref = parseTeamCell(splitsWs, r, 3 + i);
          if (ref) out[league] = ref;
        });
        if (Object.keys(out).length > 0) entry.splitChampions[split] = out;
      }
    }
  }
  return entries;
}

/** Single-season workbook: the "Overview" résumé sheet. Meta tier
 *  sheets are display-only (champion display names) and aren't
 *  reconstructed — the entry imports without its meta story. */
function parseSeasonOverviewSheet(
  wb: Workbook,
  now: number,
): SeasonHistoryEntry[] | null {
  const ws = wb.getWorksheet("Overview");
  if (!ws) return null;
  const name = cellText(ws, 1, 1);
  if (name === "") return null;
  const subtitle = cellText(ws, 2, 1);

  let champion: SeasonHistoryTeamRef | null = null;
  let runnerUp: SeasonHistoryTeamRef | null = null;
  const headlineHeader = Math.max(
    findRow(ws, "WORLD CHAMPION"),
    findRow(ws, "SEASON UNFINISHED"),
  );
  if (headlineHeader !== -1) {
    const text = cellText(ws, headlineHeader + 1, 1);
    const [champPart, runnerPart] = text.split(/\s+def\.\s+/);
    const parse = (part: string | undefined): SeasonHistoryTeamRef | null => {
      if (!part) return null;
      const m = /^(?:🏆\s*)?(.+?)\s*\(([A-Za-z0-9]{2,8})\)$/u.exec(part.trim());
      if (!m || !isLeagueId(m[2])) return null;
      return { name: m[1].trim(), leagueId: m[2], color: "#c8aa6e", iconKey: "shield" };
    };
    champion = parse(champPart);
    if (champion) {
      // The headline cell is painted with the champion's color.
      champion.color = cellColor(ws, headlineHeader + 1, 1) ?? champion.color;
    }
    runnerUp = parse(runnerPart);
  }

  const intlChampions: SeasonHistoryEntry["intlChampions"] = {};
  const intlHeader = findRow(ws, "INTERNATIONAL CHAMPIONS");
  if (intlHeader !== -1) {
    for (let r = intlHeader + 1; r <= ws.rowCount; r++) {
      const ev = INTL_BY_LABEL.get(cellText(ws, r, 1).toUpperCase());
      if (!ev) break;
      const ref = parseTeamCell(ws, r, 2);
      if (ref) intlChampions[ev] = ref;
    }
  }

  const splitChampions: SeasonHistoryEntry["splitChampions"] = {};
  const splitsHeader = findRow(ws, "LEAGUE");
  if (splitsHeader !== -1) {
    // Header row: "LEAGUE", then the splits present in the export.
    const splitCols: Array<{ split: SplitId; col: number }> = [];
    for (let c = 2; c <= 4; c++) {
      const split = SPLIT_BY_LABEL.get(cellText(ws, splitsHeader, c).toUpperCase());
      if (split) splitCols.push({ split, col: c });
    }
    for (let r = splitsHeader + 1; r <= ws.rowCount; r++) {
      const league = cellText(ws, r, 1);
      if (!isLeagueId(league)) break;
      for (const { split, col } of splitCols) {
        const ref = parseTeamCell(ws, r, col);
        if (!ref) continue;
        (splitChampions[split] ??= {})[league] = ref;
      }
    }
  }

  return [
    {
      id: slugId(name),
      archivedAt: parseArchivedDate(subtitle, now),
      name,
      complete: /season complete/i.test(subtitle),
      champion,
      runnerUp,
      intlChampions,
      splitChampions,
    },
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Parse a Hall of Seasons .xlsx (whole-hall or single-season export)
 *  into history entries. `now` stamps entries whose archive date can't
 *  be recovered — pass Date.now(). */
export async function parseHistoryWorkbook(
  data: ArrayBuffer,
  now: number,
): Promise<HistoryImportResult> {
  let wb: Workbook;
  try {
    // exceljs is CJS — handle both interop shapes (same as the exporter).
    const mod = (await import("exceljs")) as
      | typeof import("exceljs")
      | { default: typeof import("exceljs") };
    const ExcelJS = "Workbook" in mod ? mod : mod.default;
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
  } catch (err) {
    return {
      ok: false,
      error: `Could not read the workbook: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const embedded = readEmbeddedEntries(wb, now);
  if (embedded && embedded.length > 0) {
    return { ok: true, entries: embedded, source: "embedded" };
  }

  const fromSheets =
    parseAllSeasonsSheets(wb, now) ?? parseSeasonOverviewSheet(wb, now);
  if (fromSheets && fromSheets.length > 0) {
    return { ok: true, entries: fromSheets, source: "sheets" };
  }

  return {
    ok: false,
    error:
      "No seasons found — expected a Hall of Seasons export (.xlsx) from DraftSim.",
  };
}
