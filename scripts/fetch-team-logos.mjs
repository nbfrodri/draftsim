// Bundle real pro team logos for offline use.
//
// Reads lib/season/realTeamNames.json (the offline snapshot of real pro
// teams), downloads each team's logo from its source URL, resizes it to a
// small icon (so the whole set is a few hundred KB, not multiple MB),
// writes the files into public/team-logos/, and rewrites the snapshot so
// each `logoUrl` points at the LOCAL bundled file (/team-logos/<slug>.png).
//
// The original remote URL is preserved on each entry as `logoRemote`, so
// re-running this script re-downloads from source even after `logoUrl`
// has been rewritten to a local path. Idempotent: run it again any time
// to refresh the bundled logos.
//
//   npm run fetch-team-logos
//
// `sharp` is a build-time-only devDependency — it is never shipped in the
// app bundle.

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(ROOT, "lib/season/realTeamNames.json");
const OUT_DIR = resolve(ROOT, "public/team-logos");
const PUBLIC_PREFIX = "/team-logos";
const SIZE = 64; // px — logos only render as tiny marks next to a name.

/** A url-safe, accent-stripped slug for a team name. */
function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The source URL to (re)download from: the preserved remote if present,
 *  else a still-remote logoUrl (first run, before rewriting). */
function sourceUrl(team) {
  if (team.logoRemote) return team.logoRemote;
  if (typeof team.logoUrl === "string" && /^https?:\/\//.test(team.logoUrl))
    return team.logoUrl;
  return null;
}

async function main() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf-8"));

  // Fresh output dir so removed teams don't leave orphan files behind.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const usedSlugs = new Set();
  let ok = 0;
  let skipped = 0;
  const failures = [];

  for (const league of Object.keys(snapshot)) {
    for (const team of snapshot[league]) {
      const src = sourceUrl(team);
      if (!src) {
        skipped += 1;
        continue;
      }

      // Unique, stable filename per team.
      let slug = slugify(team.name) || slugify(league + "-team");
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${slugify(team.name)}-${n++}`;
      usedSlugs.add(slug);

      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const input = Buffer.from(await res.arrayBuffer());
        await sharp(input)
          .resize(SIZE, SIZE, {
            fit: "inside",
            withoutEnlargement: true,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toFile(resolve(OUT_DIR, `${slug}.png`));

        team.logoRemote = src;
        team.logoUrl = `${PUBLIC_PREFIX}/${slug}.png`;
        ok += 1;
      } catch (err) {
        failures.push(`${team.name} (${league}): ${err.message}`);
      }
    }
  }

  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");

  console.log(`Bundled ${ok} logos into public/team-logos/ at ${SIZE}px.`);
  if (skipped) console.log(`Skipped ${skipped} entr(y/ies) with no source URL.`);
  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
