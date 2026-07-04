import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "workers");
const outfile = path.join(outDir, "bulkSim.worker.js");

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "lib", "sim", "bulkSim.worker.ts")],
  bundle: true,
  format: "iife",
  outfile,
  platform: "browser",
  target: "es2022",
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "info",
});

console.log(`Wrote ${path.relative(root, outfile)}`);
