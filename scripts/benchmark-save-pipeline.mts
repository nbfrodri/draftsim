import { mkdir, writeFile } from "node:fs/promises";
import { makeAuditSeason } from "../lib/auditFixtures";
import { localChampions } from "../lib/communityDragon";
import { autoPlayMatch } from "../lib/sim/autoPlayMatch";
import { savePersistedStateToDbExecutor, type SqlExecutor } from "../lib/desktopSqlite";
import { createRequire } from "node:module";
const { clearSaveDiagnostics, getSaveDiagnostics, setSaveDiagnosticsEnabled } = createRequire(import.meta.url)("../lib/saveDiagnostics.ts") as typeof import("../lib/saveDiagnostics");
import type { PersistedStoreState } from "../lib/desktopSqliteSchema";
import type { PlayerFormMap } from "../lib/playerForm";

// Measures frontend encoding/planning only: no personal files or native DB.
let seed = 20260920;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const season = makeAuditSeason("Save benchmark");
const champions = localChampions();
let tournament = Object.values(season.tournaments)[0];
let forms: PlayerFormMap = {};
for (let i = 0; i < 12; i++) {
  const match = tournament.matches.find(m => !m.winner && m.blueTeamId && m.redTeamId);
  if (!match) break;
  [tournament, forms] = autoPlayMatch(tournament, match.id, champions, forms);
}
season.tournaments[tournament.id] = tournament;
const realities = ["A", "B", "C"].map(id => ({ id, name: id, year: 101, season: { ...season, id },
  history: Array.from({ length: 100 }, (_, i) => ({ id: `${id}-${i}`, name: "Archived year", archivedAt: i, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} })) }));
let statementCount = 0;
const db: SqlExecutor = {
  execute: async () => ({ rowsAffected: 1 }),
  select: async <T>() => realities.map(r => ({ id: r.id })) as T[],
  batch: async statements => { statementCount += statements.length; },
};
let state: PersistedStoreState = { realities, season, activeRealityId: "A", volume: 0.5 };
await savePersistedStateToDbExecutor(db, "draftsim-store", state, { forceAllHistory: true });
setSaveDiagnosticsEnabled(true);
const samples = [];
for (const scenario of ["unchanged", "setting", "active-season"]) {
  if (scenario === "setting") state = { ...state, volume: 0.6 };
  if (scenario === "active-season") state = { ...state, season: { ...season, updatedAt: season.updatedAt + 1 } };
  clearSaveDiagnostics(); statementCount = 0;
  const started = performance.now();
  await savePersistedStateToDbExecutor(db, "draftsim-store", state);
  samples.push({ scenario, elapsedMs: performance.now() - started, statementCount, metrics: getSaveDiagnostics().entries });
}
const report = { note: "Frontend fixture benchmark; mock commit is not native disk latency", simulatedMatches: tournament.matches.filter(m => m.winner).length, realities: 3, historyEntries: 300, samples };
await mkdir(".benchmarks", { recursive: true });
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid benchmark label");
await writeFile(`.benchmarks/save-pipeline-${label}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
