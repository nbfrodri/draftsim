import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { useDraftStore, resetSimResultsBatch, runFranchiseSeasonSim, appendSimResults, autoResolveOffseasonShop, rollFranchiseToNextYearState, applyMetaSnapshotPatch, flushSimResultsFeed } from '../store/draftStore';
import { createSimulationActions } from '../store/actions/simulation';
import { makeAuditSeason } from '../lib/auditFixtures';
import { createSeason } from '../lib/season/engine';
import type { SeasonConfig } from '../lib/season/types';
import { localChampions } from '../lib/communityDragon';
const desktopHistory = process.argv.includes('--desktop-history');
const output = desktopHistory ? '.benchmarks/franchise-desktop-history' : '.benchmarks/franchise';
await mkdir(output, { recursive: true });
let seed = 20260910;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const warn = console.warn;
console.warn = (...args: unknown[]) => { if (!String(args[0]).includes('Unable to update item')) warn(...args); };
let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('Stopping after this year and its checkpoint.'); });
process.on('SIGTERM', () => { stopping = true; });
const checkpointPath = `${output}/checkpoint.json`;
type Sample = { years: number; simulationMs: number; exportMs: number; heapBytes: number; fileBytes: number; historyEntries: number };
let samples: Sample[] = [];
let simulationMs = 0;
useDraftStore.setState({ champions: localChampions(), realities: [], bulkYearJobs: {} });
if (desktopHistory) {
  // Same production simulator and archive builder; emulate the desktop's
  // 200-entry retention without opening Tauri or any personal database.
  useDraftStore.setState(createSimulationActions(useDraftStore.getState, useDraftStore.setState, {
    resetSimResultsBatch, runFranchiseSeasonSim, appendSimResults, autoResolveOffseasonShop,
    applyMetaSnapshotPatch, flushSimResultsFeed,
    rollFranchiseToNextYearState: (season, champions, previous) => {
      const next = rollFranchiseToNextYearState(season, champions, previous);
      const included = new Set(next.history.map(entry => entry.id));
      return { ...next, history: [...next.history, ...previous.filter(entry => !included.has(entry.id))].slice(0, 200) };
    },
  }));
}
try {
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const result = await useDraftStore.getState().importReality(checkpoint.reality);
  if (!result.ok || !result.id) throw new Error(result.error);
  await useDraftStore.getState().switchReality(result.id);
  seed = checkpoint.seed;
  samples = checkpoint.samples;
  simulationMs = checkpoint.simulationMs;
  console.log(`Resuming after ${useDraftStore.getState().season!.franchise!.year - 1} completed years`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  const initial = makeAuditSeason('Benchmark franchise');
  const season = desktopHistory ? createSeason({
    config: { ...initial.config, leagueConfigs: Object.fromEntries(Object.entries(initial.config.leagueConfigs)
      .map(([id, config]) => [id, { ...config, format: 'single-elim', regularSeries: 'bo1', playoffSeries: 'bo1' }])) as SeasonConfig['leagueConfigs'] },
    teams: initial.teams, activeMeta: initial.currentMeta,
  }) : initial;
  useDraftStore.setState({ season });
  useDraftStore.getState().startReality('Benchmark franchise', true);
}
if (process.argv.includes('--verify-checkpoint')) {
  const state = useDraftStore.getState();
  if (!state.activeRealityId || !state.season?.franchise || state.season.franchise.year <= 1) throw new Error('No completed checkpoint to verify');
  const exported = await state.exportReality(state.activeRealityId);
  if (!exported || JSON.parse(exported).reality.year !== state.season.franchise.year) throw new Error('Checkpoint round-trip failed');
  console.log(`Checkpoint reopened and exported: year ${state.season.franchise.year}, ${state.realities[0].history.length} archived seasons`);
  process.exit(0);
}
while (useDraftStore.getState().season!.franchise!.year <= 100 && !stopping) {
  const beforeYear = useDraftStore.getState().season!.franchise!.year;
  const start = performance.now();
  useDraftStore.getState().simulateRealityYears(1, { saveAfterEachYear: true });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe(); useDraftStore.getState().cancelBulkYears();
      reject(new Error('Simulation exceeded 90 minutes; previous checkpoint is retained'));
    }, 90 * 60_000);
    const unsubscribe = useDraftStore.subscribe(state => {
      if (!state.simulating && !state.bulkYearsProgress) {
        clearTimeout(timeout); unsubscribe();
        const job = Object.values(state.bulkYearJobs)[0];
        if (job?.error) reject(new Error(job.error)); else resolve();
      }
    });
  });
  simulationMs += performance.now() - start;
  const state = useDraftStore.getState();
  const years = state.season!.franchise!.year - 1;
  if (years !== beforeYear) throw new Error('Incomplete franchise generation');
  const exportStart = performance.now();
  const reality = await state.exportReality(state.activeRealityId!);
  if (!reality) throw new Error('Reality export failed');
  const exportMs = performance.now() - exportStart;
  if (years === 50 || years === 100) {
    await writeFile(`${output}/franchise-${years}.json`, reality);
    samples.push({ years, simulationMs, exportMs, heapBytes: process.memoryUsage().heapUsed,
      fileBytes: Buffer.byteLength(reality), historyEntries: state.realities[0].history.length });
    await writeFile(`${output}/measurements.json`, JSON.stringify({ runtime: process.version,
      platform: process.platform, cpu: cpus()[0]?.model, totalMemoryBytes: totalmem(), seed: 20260910,
      historyPolicy: desktopHistory ? 'desktop: 200 archives' : 'web: 40 archives',
      leagueConfiguration: state.season!.config.leagueConfigs, note: desktopHistory ? 'Shorter legitimate single-elimination BO1 domestic seasons; internationals and all match results use the production engine' : 'Round-robin/playoffs domestic seasons',
      engine: 'Full production match simulator; no mocked results', samples }, null, 2));
  }
  // Publish a single envelope so the random state and reality always agree.
  await writeFile(`${checkpointPath}.tmp`, JSON.stringify({ version: 1, seed, reality, simulationMs, samples }));
  await rename(`${checkpointPath}.tmp`, checkpointPath);
  console.log(`Checkpoint: ${years}/100 years; heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MiB`);
}
console.log(stopping ? 'Paused with a resumable checkpoint.' : 'Franchise generation complete');
