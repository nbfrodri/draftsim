import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desktopVersion, validateVersion } from "./desktop-version.mjs";

async function fixture(t, version = "0.2.0", desktop = version) {
  const root = await mkdtemp(join(tmpdir(), "draftsim-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src-tauri"));
  const files = {
    "package.json": JSON.stringify({ version }),
    "package-lock.json": JSON.stringify({ version, packages: { "": { version } } }),
    "src-tauri/tauri.conf.json": JSON.stringify({ version: desktop, identifier: "app.draftsim.desktop" }),
    "src-tauri/Cargo.toml": `[package]\nname = "app"\nversion = "${desktop}"\n\n[dependencies]\nserde = "1.0"\n`,
    "src-tauri/Cargo.lock": `version = 3\n\n[[package]]\nname = "app"\nversion = "${desktop}"\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n`,
  };
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(join(root, path), text)));
  return root;
}

test("accepts matching versions and release tag", async (t) => {
  const root = await fixture(t);
  assert.equal(await desktopVersion(root, { tag: "v0.2.0" }), "0.2.0");
});

test("rejects a mismatched tag and unsupported MSI versions", () => {
  for (const [version, tag] of [["0.2.0", "v0.3.0"], ["0.2.0", "0.2.0"], ["01.2.3"], ["0.2.0-beta.1"], ["256.0.0"], ["0.256.0"], ["0.0.65536"]]) {
    assert.throws(() => validateVersion(version, tag));
  }
  assert.doesNotThrow(() => validateVersion("255.255.65535", "v255.255.65535"));
});

test("refuses mismatched desktop metadata before release", async (t) => {
  const root = await fixture(t, "0.2.0", "0.1.0");
  await assert.rejects(desktopVersion(root), /expected 0.2.0/);
});

test("synchronizes desktop versions without changing identity or dependency versions", async (t) => {
  const root = await fixture(t, "0.2.0", "0.1.0");
  await desktopVersion(root, { sync: true });
  assert.equal(await desktopVersion(root, { tag: "v0.2.0" }), "0.2.0");
  const tauri = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(tauri.identifier, "app.draftsim.desktop");
  assert.match(await readFile(join(root, "src-tauri/Cargo.lock"), "utf8"), /name = "serde"\nversion = "1.0.0"/);
  assert.match(await readFile(join(root, "src-tauri/Cargo.toml"), "utf8"), /serde = "1.0"/);
});

test("refuses to sync when npm lock metadata is stale", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ version: "0.1.0", packages: { "": { version: "0.1.0" } } }));
  await assert.rejects(desktopVersion(root, { sync: true }), /npm versions differ/);
});

test("refuses incomplete Cargo metadata before writing any desktop file", async (t) => {
  const root = await fixture(t, "0.2.0", "0.1.0");
  const path = join(root, "src-tauri/tauri.conf.json");
  const before = await readFile(path, "utf8");
  await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 3\n");
  await assert.rejects(desktopVersion(root, { sync: true }), /Cannot locate/);
  assert.equal(await readFile(path, "utf8"), before);
});
