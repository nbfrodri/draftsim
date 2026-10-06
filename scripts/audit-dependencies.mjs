import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BRACES_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const SELECTOR_PARSER_ADVISORY = "https://github.com/advisories/GHSA-rj75-hqrm-r3gf";
export const EXCEPTION_EXPIRES = "2026-11-03T00:00:00Z";
// Known dev-only chains (Tailwind 3, ESLint/Next) and the severity npm reports for each.
const DEVELOPMENT_CHAIN = new Map([
  ["braces", "high"], ["chokidar", "high"], ["micromatch", "high"], ["fast-glob", "high"], ["tailwindcss", "high"],
  ["@next/eslint-plugin-next", "high"], ["eslint-config-next", "high"],
  ["postcss-nested", "moderate"], ["postcss-selector-parser", "moderate"],
]);
// The only advisories accepted at the end of those chains, pinned to the audited version.
const DEVELOPMENT_ADVISORIES = {
  braces: { url: BRACES_ADVISORY, severity: "high", range: "<=3.0.3", version: "3.0.3" },
  "postcss-selector-parser": { url: SELECTOR_PARSER_ADVISORY, severity: "moderate", range: "<7.1.6", version: "6.1.4" },
};

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
        !finding || finding.name !== name || finding.severity !== DEVELOPMENT_CHAIN.get(name) ||
        !Array.isArray(finding.nodes) || !finding.nodes.length ||
        !finding.nodes.every((node) => lock?.packages?.[node]?.dev === true) ||
        !Array.isArray(finding.via) || !finding.via.length) return false;
    const next = new Set(visiting).add(name);
    const advisory = Object.hasOwn(DEVELOPMENT_ADVISORIES, name) ? DEVELOPMENT_ADVISORIES[name] : undefined;
    return finding.via.every((cause) => typeof cause === "string"
      ? isAllowed(cause, next)
      : advisory !== undefined && cause?.url === advisory.url &&
        cause.name === name && cause.dependency === name &&
        cause.severity === advisory.severity && cause.range === advisory.range &&
        finding.nodes.every((node) => lock.packages[node].version === advisory.version));
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
    console.log(`Temporary development-only exceptions: ${BRACES_ADVISORY}, ${SELECTOR_PARSER_ADVISORY}`);
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
