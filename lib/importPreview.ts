import { assertRealityJsonSize, decodeRealityShareCode, MAX_REALITY_IMPORT_NODES } from "./realityShare";
import { record, validSeason, validHistoryEntry, validTournament, validSeries, validateImportTree } from "./importValidation";
import { assertShareInputSize } from "./shareCodec";
import type { LoadedReality, SavedReality, SavedSeasonEntry } from "@/store/types";
export interface RealityImportPreview {
  json: string; id: string; name: string; year: number; archivedYears: number;
  teams: string[]; replaces: string | null;
}
export function parseRealityImport(json: string) {
  assertRealityJsonSize(json);
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("The file is not valid JSON or is truncated."); }
  validateImportTree(parsed, MAX_REALITY_IMPORT_NODES);
  if (!record(parsed) || parsed.kind !== "reality") throw new Error("Expected a DraftSim reality export.");
  if (parsed.version !== undefined && parsed.version !== 1) throw new Error("This reality export version is not supported. Update DraftSim before importing it.");
  const r = parsed.reality;
  if (!record(r) || typeof r.id !== "string" || !r.id || typeof r.name !== "string" || !r.name) throw new Error("Reality name or identifier is missing.");
  if (!validSeason(r.season)) throw new Error("The season contains invalid teams, tournaments or settings.");
  if (r.year !== undefined && (!Number.isSafeInteger(r.year) || typeof r.year !== "number" || r.year < 1)) throw new Error("The reality year must be a positive integer.");
  if (r.history !== undefined && (!Array.isArray(r.history) || !r.history.every(validHistoryEntry))) throw new Error("The season history contains invalid entries.");
  return r as unknown as LoadedReality;
}
export async function previewRealityImport(input: string, existing: Pick<SavedReality, "id" | "name">[], onStage?: (stage: "decode" | "validate" | "summary") => Promise<void>): Promise<RealityImportPreview> {
  await onStage?.("decode");
  const decoded = await decodeRealityShareCode(input);
  if (!decoded.json) throw new Error(decoded.error ?? "Could not decode the reality code.");
  await onStage?.("validate");
  const r = parseRealityImport(decoded.json);
  await onStage?.("summary");
  return { json: decoded.json, id: r.id, name: r.name, year: r.year ?? r.season.franchise?.year ?? 1,
    archivedYears: r.history?.length ?? 0, teams: r.season.teams.map(t => t.name),
    replaces: existing.find(slot => slot.id === r.id)?.name ?? null };
}

export function parseSeasonImport(json: string): SavedSeasonEntry {
  assertShareInputSize(json);
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("The season file is invalid JSON or truncated."); }
  validateImportTree(value);
  if (!record(value) || typeof value.id !== "string" || !validSeason(value.season) ||
    (value.playerForms !== undefined && !record(value.playerForms)) ||
    (value.tournament != null && !validTournament(value.tournament)) ||
    (value.series != null && !validSeries(value.series))) throw new Error("The season contains invalid settings, teams or match data.");
  return value as unknown as SavedSeasonEntry;
}
