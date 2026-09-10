import { chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
const output = process.env.BENCHMARK_DIRECTORY || '.benchmarks/franchise';
const milestones = process.argv.slice(2).map(Number);
if (!milestones.length || milestones.some(n => n !== 50 && n !== 100)) throw new Error('Specify 50 and/or 100');
const server = spawn(process.execPath, ['scripts/serve-static.mjs'], {
  env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let lastPage: Page | undefined;
try {
  const baseURL = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server startup timed out')), 30000);
    server.once('error', reject);
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  for (const years of milestones) {
    const path = resolve(output, `franchise-${years}.json`);
    const reality = JSON.parse(await readFile(path, 'utf8')).reality;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    // Rendering benchmark only: browser localStorage quota cannot hold century
    // fixtures. Keep exact serialized writes in memory; do not claim disk timings.
    await context.addInitScript(() => {
      const values = new Map<string, string>();
      Storage.prototype.getItem = function(key) { return values.get(key) ?? null; };
      Storage.prototype.setItem = function(key, value) { values.set(key, String(value)); };
      Storage.prototype.removeItem = function(key) { values.delete(key); };
      Storage.prototype.key = function(index) { return [...values.keys()][index] ?? null; };
      Object.defineProperty(Storage.prototype, 'length', { get() { return values.size; } });
    });
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(30000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByRole('button', { name: /Realities/ }).click();
    const importStart = performance.now();
    await page.locator('input[type=file]').setInputFiles(path);
    await page.getByRole('dialog', { name: 'Review reality import' }).getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
    const importMs = performance.now() - importStart;
    const secondary = { ...reality, id: `${reality.id}-copy`, name: `${reality.name} copy`,
      season: { ...reality.season, franchise: { ...reality.season.franchise, id: `${reality.id}-copy`, name: `${reality.name} copy` } } };
    const secondaryPath = resolve(output, `secondary-${years}.json`);
    await writeFile(secondaryPath, JSON.stringify({ kind: 'reality', version: 1, reality: secondary }));
    await page.locator('input[type=file]').setInputFiles(secondaryPath);
    await page.getByRole('dialog', { name: 'Review reality import' }).getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText(secondary.name, { exact: true }).waitFor();
    const openReality = (name: string) => page.getByText(name, { exact: true }).locator('..').locator('..')
      .getByRole('button', { name: /^(Open|Resume)$/ }).click();
    const openStart = performance.now();
    await openReality(reality.name);
    await page.getByRole('heading', { name: 'Bulk Simulation', exact: true }).waitFor();
    const openMs = performance.now() - openStart;
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
    if (await page.getByRole('button', { name: /Season History|Hall of Seasons/ }).count() === 0) {
      await page.getByRole('button', { name: /Menu/ }).click();
    }
    const firstStart = performance.now();
    await page.getByRole('button', { name: /Season History|Hall of Seasons/ }).click();
    await page.getByRole('heading', { name: 'Season History', exact: true }).waitFor();
    await page.getByRole('button', { name: `Reality \u00b7 ${reality.name}`, exact: true }).click();
    const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await settle();
    const firstHallMs = performance.now() - firstStart;
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const heapBefore = await cdp.send('Runtime.getHeapUsage');
    const warmHallMs: number[] = [];
    for (let cycle = 0; cycle < 10; cycle++) {
      await page.getByRole('button', { name: 'Season Mode', exact: true }).click();
      const start = performance.now();
      await page.getByRole('button', { name: `Reality \u00b7 ${reality.name}`, exact: true }).click();
      await settle(); warmHallMs.push(performance.now() - start);
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const heapAfter = await cdp.send('Runtime.getHeapUsage');
    await page.screenshot({ path: `${output}/hall-${years}.png` });
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
    await page.getByRole('button', { name: /Realities/ }).click();
    const switchesMs: number[] = [];
    for (let cycle = 0; cycle < 10; cycle++) {
      const start = performance.now();
      await openReality(cycle % 2 === 0 ? secondary.name : reality.name);
      await page.getByRole('heading', { name: 'Bulk Simulation', exact: true }).waitFor();
      await settle(); switchesMs.push(performance.now() - start);
      await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
      await page.getByRole('heading', { name: 'Realities', exact: true }).waitFor();
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const heapAfterSwitches = await cdp.send('Runtime.getHeapUsage');
    switchesMs.sort((a,b) => a-b);
    warmHallMs.sort((a,b) => a-b);
    const result = { years, archivedSeasons: reality.history.length, browser: browser.version(), storage: 'In-memory Storage adapter; rendering and serialization only, no durable storage timing',
      importMs, openMs, firstHallMs, warmHallMs, switchesMs, switchP50: switchesMs[4], switchP95: switchesMs[9], heapAfterSwitches, p50: warmHallMs[4], p95: warmHallMs[9], heapBefore, heapAfter, errors };
    await writeFile(`${output}/ui-${years}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    await context.close();
    if (errors.length) throw new Error('Browser errors during benchmark');
  }
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    console.error('Visible buttons:', await lastPage.getByRole('button').allTextContents());
    await lastPage.screenshot({ path: `${output}/ui-failure.png` });
  }
  throw error;
} finally { await browser?.close(); server.kill(); }
