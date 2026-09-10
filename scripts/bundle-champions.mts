import { refreshChampions } from '../lib/communityDragon';
import { writeFile } from 'node:fs/promises';
const champions = await refreshChampions();
if (champions.length < 100 || champions.some(c => !c.id || !c.alias)) throw new Error('Invalid champion catalogue');
await writeFile('lib/data/champions.json', JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), champions }));
console.log(`Bundled ${champions.length} champions`);
