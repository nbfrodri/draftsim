import { writeFile } from 'node:fs/promises';
import { makeAuditSeason } from '../lib/auditFixtures';
const season = makeAuditSeason('Install-smoke-fixture');
const dormant = makeAuditSeason('Dormant-unfinished-fixture');
await writeFile(process.argv[2] ?? 'test-results/install-fixture.json', JSON.stringify({ version: 6, state: {
  activeRealityId: 'Install-smoke-fixture', season,
  realities: [{ id: 'Install-smoke-fixture', name: 'Install-smoke-fixture', year: 1, season, history: [] }, { id: 'Dormant-unfinished-fixture', name: 'Dormant-unfinished-fixture', year: 1, season: dormant, history: [] }]
} }));
