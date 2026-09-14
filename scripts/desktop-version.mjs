import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// NSIS and MSI releases use the same stable numeric version.
export function validateVersion(version, tag) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Use a stable numeric version X.Y.Z for Windows installers.");
  }
  const [major, minor, patch] = version.split(".").map(Number);
  if (major > 255 || minor > 255 || patch > 65535) {
    throw new Error("MSI versions require major/minor <= 255 and patch <= 65535.");
  }
  if (tag !== undefined && tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must match v${version}.`);
  }
}

export async function desktopVersion(root, { sync = false, tag } = {}) {
  const paths = ["package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
  const [packageText, lockText, tauriText, cargoText, cargoLockText] = await Promise.all(
    paths.map((path) => readFile(resolve(root, path), "utf8")),
  );
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const tauri = JSON.parse(tauriText);
  const version = pkg.version;
  validateVersion(version, tag);
  const cargoPackage = /(^\[package\][\s\S]*?^version = ")([^"]+)(")/m;
  const cargoApp = /(^\[\[package\]\]\r?\nname = "app"\r?\nversion = ")([^"]+)(")/m;
  const cargoVersion = cargoText.match(cargoPackage)?.[2];
  const cargoLockVersion = cargoLockText.match(cargoApp)?.[2];
  if (!cargoVersion || !cargoLockVersion) throw new Error("Cannot locate the app version in Cargo metadata.");
  const versions = {
    "package-lock.json": lock.version,
    "package-lock.json root package": lock.packages?.[""]?.version,
    "tauri.conf.json": tauri.version,
    "Cargo.toml": cargoVersion,
    "Cargo.lock app": cargoLockVersion,
  };
  // npm version updates package.json and package-lock.json before the version hook.
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    throw new Error("npm versions differ; update with npm version <version> --no-git-tag-version.");
  }
  if (sync) {
    tauri.version = version;
    const replace = (_match, prefix, _oldVersion, suffix) => `${prefix}${version}${suffix}`;
    await writeFile(resolve(root, paths[2]), JSON.stringify(tauri, null, 2) + "\n");
    await writeFile(resolve(root, paths[3]), cargoText.replace(cargoPackage, replace));
    await writeFile(resolve(root, paths[4]), cargoLockText.replace(cargoApp, replace));
  } else {
    for (const [name, actual] of Object.entries(versions)) {
      if (actual !== version) throw new Error(`${name} is ${actual}; expected ${version}. Run npm run version to synchronize desktop metadata.`);
    }
  }
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!(args.length === 0 || (args.length === 1 && args[0] === "--sync") || (args.length === 2 && args[0] === "--tag"))) {
      throw new Error("Usage: node scripts/desktop-version.mjs [--sync | --tag vX.Y.Z]");
    }
    const version = await desktopVersion(process.cwd(), { sync: args[0] === "--sync", tag: args[0] === "--tag" ? args[1] : undefined });
    console.log(`Desktop version verified: ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
