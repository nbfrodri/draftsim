import assert from "node:assert/strict";
import { test } from "node:test";
import { BRACES_ADVISORY, EXCEPTION_EXPIRES, SELECTOR_PARSER_ADVISORY, evaluateAudit } from "./audit-dependencies.mjs";

const beforeExpiry = new Date("2026-10-03T00:00:00Z");
function fixture() {
  const advisory = { url: BRACES_ADVISORY, name: "braces", dependency: "braces", severity: "high", range: "<=3.0.3" };
  const report = { auditReportVersion: 2, vulnerabilities: {
    braces: { name: "braces", severity: "high", nodes: ["node_modules/braces"], via: [advisory] },
    micromatch: { name: "micromatch", severity: "high", nodes: ["node_modules/micromatch"], via: ["braces"] },
    tailwindcss: { name: "tailwindcss", severity: "high", nodes: ["node_modules/tailwindcss"], via: ["micromatch"] },
  } };
  const lock = { packages: Object.fromEntries(Object.keys(report.vulnerabilities).map((name) =>
    [`node_modules/${name}`, { dev: true, version: name === "braces" ? "3.0.3" : "1.0.0" }],
  )) };
  return { report, lock };
}

test("accepts only the documented development advisory and its transitive findings", () => {
  const { report, lock } = fixture();
  assert.deepEqual(evaluateAudit(report, lock, beforeExpiry), { allowed: ["braces", "micromatch", "tailwindcss"], blocked: [] });
});
test("blocks the whole chain if any affected copy is a production dependency", () => {
  for (const name of ["braces", "micromatch", "tailwindcss"]) {
    const { report, lock } = fixture();
    lock.packages[`node_modules/${name}`].dev = false;
    assert.ok(evaluateAudit(report, lock, beforeExpiry).blocked.includes(name));
  }
  const { report, lock } = fixture();
  report.vulnerabilities.braces.nodes.push("node_modules/other/node_modules/braces");
  lock.packages["node_modules/other/node_modules/braces"] = { version: "3.0.3" };
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
});
test("blocks a new advisory even when the package already has an exception", () => {
  const { report, lock } = fixture();
  report.vulnerabilities.braces.via.push({ ...report.vulnerabilities.braces.via[0], url: "https://github.com/advisories/GHSA-new" });
  assert.equal(evaluateAudit(report, lock, beforeExpiry).blocked.length, 3);
});
test("blocks newly affected packages, versions and severity changes", () => {
  const { report, lock } = fixture();
  report.vulnerabilities.other = { name: "other", severity: "high", nodes: ["node_modules/other"], via: ["braces"] };
  lock.packages["node_modules/other"] = { dev: true };
  assert.deepEqual(evaluateAudit(report, lock, beforeExpiry).blocked, ["other"]);
  lock.packages["node_modules/braces"].version = "3.0.2";
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
  lock.packages["node_modules/braces"].version = "3.0.3";
  report.vulnerabilities.braces.severity = "critical";
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
});
test("expires automatically and does not affect a clean audit", () => {
  const { report, lock } = fixture();
  assert.equal(evaluateAudit(report, lock, new Date(EXCEPTION_EXPIRES)).allowed.length, 0);
  assert.deepEqual(evaluateAudit({ auditReportVersion: 2, vulnerabilities: {} }, lock), { allowed: [], blocked: [] });
});
test("fails closed for registry errors, malformed reports, missing lock entries and cycles", () => {
  const { report, lock } = fixture();
  for (const invalid of [null, {}, { auditReportVersion: 2, vulnerabilities: {}, error: { code: "network" } }]) {
    assert.throws(() => evaluateAudit(invalid, lock, beforeExpiry), /Invalid npm audit/);
  }
  assert.equal(evaluateAudit(report, {}, beforeExpiry).allowed.length, 0);
  report.vulnerabilities.braces.via = ["tailwindcss"];
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
  report.vulnerabilities.braces.via = ["missing"];
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
});

function selectorFixture() {
  const advisory = { url: SELECTOR_PARSER_ADVISORY, name: "postcss-selector-parser", dependency: "postcss-selector-parser", severity: "moderate", range: "<7.1.6" };
  const report = { auditReportVersion: 2, vulnerabilities: {
    "postcss-selector-parser": { name: "postcss-selector-parser", severity: "moderate", nodes: ["node_modules/postcss-selector-parser"], via: [advisory] },
    "postcss-nested": { name: "postcss-nested", severity: "moderate", nodes: ["node_modules/postcss-nested"], via: ["postcss-selector-parser"] },
    tailwindcss: { name: "tailwindcss", severity: "high", nodes: ["node_modules/tailwindcss"], via: ["postcss-nested", "postcss-selector-parser"] },
  } };
  const lock = { packages: Object.fromEntries(Object.keys(report.vulnerabilities).map((name) =>
    [`node_modules/${name}`, { dev: true, version: name === "postcss-selector-parser" ? "6.1.4" : "1.0.0" }],
  )) };
  return { report, lock };
}
test("accepts the documented postcss-selector-parser advisory only for its dev-only Tailwind chain", () => {
  const { report, lock } = selectorFixture();
  assert.deepEqual(evaluateAudit(report, lock, beforeExpiry), { allowed: ["postcss-selector-parser", "postcss-nested", "tailwindcss"], blocked: [] });
  lock.packages["node_modules/postcss-selector-parser"].dev = false;
  assert.equal(evaluateAudit(report, lock, beforeExpiry).allowed.length, 0);
});
test("blocks postcss-selector-parser on another version, severity or advisory", () => {
  for (const mutate of [
    ({ lock }) => { lock.packages["node_modules/postcss-selector-parser"].version = "6.1.3"; },
    ({ report }) => { report.vulnerabilities["postcss-selector-parser"].severity = "high"; },
    ({ report }) => { report.vulnerabilities["postcss-selector-parser"].via[0].url = BRACES_ADVISORY; },
  ]) {
    const fixtureData = selectorFixture();
    mutate(fixtureData);
    assert.ok(evaluateAudit(fixtureData.report, fixtureData.lock, beforeExpiry).blocked.includes("postcss-selector-parser"));
  }
});
