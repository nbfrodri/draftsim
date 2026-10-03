import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BRACES_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const EXCEPTION_EXPIRES = "2026-11-03T00:00:00Z";
const DEVELOPMENT_CHAIN = new Set([
  "braces", "chokidar", "micromatch", "fast-glob", "tailwindcss",
  "@next/eslint-plugin-next", "eslint-config-next",
]);

function vulnerabilitiesFrom(report) {
  if (report?.error || report?.auditReportVersion !== 2 || !report.vulnerabilities ||
      typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
    throw new Error("Invalid npm audit report; refusing to pass the dependency check.");
  }
  return report.vulnerabilities;
}

/** Accept only this advisory's known dev-only chain; all other findings block. */
export function evaluateAudit(report, lock, now = new Date()) {
  const vulnerabilities = vulnerabilitiesFrom(report);
  const allowed = [];
  const blocked = [];
  const notExpired = now.getTime() < Date.parse(EXCEPTION_EXPIRES);
  const isAllowed = (name, visiting = new Set()) => {
    const finding = vulnerabilities[name];
    if (!notExpired || visiting.has(name) || !DEVELOPMENT_CHAIN.has(name) ||
        !finding || finding.name !== name || finding.severity !== "high" ||
        !Array.isArray(finding.nodes) || !finding.nodes.length ||
        !finding.nodes.every((node) => lock?.packages?.[node]?.dev === true) ||
        !Array.isArray(finding.via) || !finding.via.length) return false;
    const next = new Set(visiting).add(name);
    return finding.via.every((cause) => typeof cause === "string"
      ? isAllowed(cause, next)
      : name === "braces" && cause?.url === BRACES_ADVISORY &&
        cause.name === "braces" && cause.dependency === "braces" &&
        cause.severity === "high" && cause.range === "<=3.0.3" &&
        finding.nodes.every((node) => lock.packages[node].version === "3.0.3"));
  };
  for (const name of Object.keys(vulnerabilities)) {
    (isAllowed(name) ? allowed : blocked).push(name);
  }
  return { allowed, blocked };
}

function runAudit(npmCli, args) {
  const result = spawnSync(process.execPath, [npmCli, "audit", "--json", "--audit-level=low", ...args], {
    encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`npm audit could not complete: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  const report = JSON.parse(result.stdout);
  vulnerabilitiesFrom(report);
  return report;
}

export function auditDependencies(npmCli, root = process.cwd()) {
  if (!npmCli) throw new Error("Run this check through npm run audit:dependencies.");
  const production = runAudit(npmCli, ["--omit=dev"]);
  if (Object.keys(production.vulnerabilities).length) {
    throw new Error(`Production dependency audit failed: ${Object.keys(production.vulnerabilities).join(", ")}`);
  }
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const result = evaluateAudit(runAudit(npmCli, []), lock);
  if (result.blocked.length) {
    throw new Error(`Dependency audit failed: ${result.blocked.join(", ")}. Run npm audit for details.`);
  }
  console.log("Production audit: no vulnerabilities.");
  if (result.allowed.length) {
    console.log(`Temporary development-only exception: ${BRACES_ADVISORY}`);
    console.log(`Still present in ${result.allowed.length} build-tool packages; expires ${EXCEPTION_EXPIRES}.`);
  } else {
    console.log("Development audit: no vulnerabilities.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    auditDependencies(process.env.npm_execpath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
