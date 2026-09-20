/** Heavy branches are stored independently from small global settings. */
export const GLOBAL_FRAGMENT_KEYS = ["series", "tournament", "season", "savedSeasons", "savedTournaments", "tournamentHistory", "seasonHistory", "aiRationaleHistory", "playerForms"] as const;
export const FRAGMENT_MANIFEST = "_draftsimFragments";
export function partitionGlobalState(global: Record<string, unknown>) {
  const root = { ...global };
  const fragments = new Map<string, unknown>();
  for (const key of GLOBAL_FRAGMENT_KEYS) {
    if (Object.hasOwn(root, key) && root[key] !== undefined) fragments.set(key, root[key]);
    delete root[key];
  }
  root[FRAGMENT_MANIFEST] = [...fragments.keys()];
  return { root, fragments };
}
export function joinGlobalState(root: Record<string, unknown>, rows: Array<{ fragment_key: string; value_json: string }>) {
  const manifest = root[FRAGMENT_MANIFEST];
  if (manifest === undefined) return root; // Unmodified legacy global JSON.
  if (!Array.isArray(manifest) || new Set(manifest).size !== manifest.length || !manifest.every(key => GLOBAL_FRAGMENT_KEYS.includes(key))) {
    throw new Error("Saved global fragment manifest is invalid; refusing to overwrite it.");
  }
  const byKey = new Map(rows.map(row => [row.fragment_key, row.value_json]));
  const global = { ...root };
  delete global[FRAGMENT_MANIFEST];
  for (const key of manifest) {
    if (!byKey.has(key)) throw new Error("Saved global fragment is missing; refusing to overwrite it.");
    try { global[key] = JSON.parse(byKey.get(key)!); }
    catch { throw new Error("Saved global fragment is invalid; refusing to overwrite it."); }
  }
  return global;
}
