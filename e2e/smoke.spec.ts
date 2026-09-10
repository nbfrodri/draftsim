import { expect,test } from "@playwright/test";

test("single series survives reload under production CSP", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Solo Single Series/ })).toBeVisible();
  const scripts = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/_next/") && entry.name.endsWith(".js"))
    .map(entry => ({ url: entry.name, bytes: (entry as PerformanceResourceTiming).decodedBodySize })));
  const initialScriptBytes = scripts.reduce((sum, script) => sum + script.bytes, 0);
  console.log("Initial JS decoded bytes:", initialScriptBytes);
  expect(initialScriptBytes).toBeLessThan(3 * 1024 * 1024);
  await testInfo.attach("initial-scripts.json", { body: JSON.stringify(scripts, null, 2), contentType: "application/json" });
  await page.getByRole("button", { name: /Solo Single Series/ }).click();
  await expect(page.getByRole("button", { name: "BEGIN DRAFT" })).toBeVisible();
  await page.getByRole("button", { name: "BEGIN DRAFT" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.series?.id)).toBeTruthy();
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.series.id);
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.series?.id)).toBe(id);
  await expect(page.getByRole("button", { name: "BEGIN DRAFT" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rejects invalid tournament import and leaves existing save intact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import Tournament Code" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem("draftsim-store"));
  await page.locator("textarea").fill('{"id":"bad","name":"bad","format":"single-elim","teams":[null],"matches":[]}');
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/invalid/i).last()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe(before);
});

test("season setup initializes teams and starts a persisted season", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /New Season Mode/ }).click();
  await expect(page.getByRole("button", { name: "Start Season", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start Season", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.season?.teams?.length)).toBe(60);
  expect(errors).toEqual([]);
});


test("quota failure preserves the old save and Retry saves the latest game", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem("draftsim-store"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === "draftsim-store") throw new DOMException("Simulated full storage", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: /Solo Single Series/ }).click();
  await page.getByRole("button", { name: "BEGIN DRAFT" }).click();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe(before);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state?.series?.id)).toBeTruthy();
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.series.id);
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state?.series?.id)).toBe(id);
});

test("invalid saved JSON blocks overwrites and supports loading recovery", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  const saved = await page.evaluate(() => localStorage.getItem("draftsim-store")!);
  await page.evaluate(() => localStorage.setItem("draftsim-store", "{broken"));
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry loading saved data" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe("{broken");
  await page.evaluate(value => localStorage.setItem("draftsim-store", value), saved);
  await page.getByRole("button", { name: "Retry loading saved data" }).click();
  await expect(page.getByRole("button", { name: /Solo Single Series/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry loading saved data" })).toHaveCount(0);
});
