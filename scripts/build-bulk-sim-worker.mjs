import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "workers");

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: ["bulkSim.worker.ts", "rosterOutlook.worker.ts"].map(file => path.join(root, "lib", "sim", file)),
  bundle: true,
  format: "iife",
  outdir: outDir,
  platform: "browser",
  target: "es2022",
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "info",
});

console.log(`Wrote workers to ${path.relative(root, outDir)}`);
