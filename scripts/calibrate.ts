// Calibration script — runs many simulated matches against random drafts
// and measures whether the AI's draft-strength scoring (TeamScore.total)
// actually correlates with simulated win rate. Outputs:
//
//   1. Pearson correlation between TeamScore diff and blue win rate.
//   2. Bin-by-diff win-rate distribution (sanity table).
//   3. Per-component correlation: for each TeamScore field, how strong is
//      the diff in that field alone as a win-rate predictor? Components
//      with weak signal are candidates for tuning.
//   4. Per-component "leave-one-out" delta: correlation when we subtract
//      that component from the total. A small drop = component carries
//      its weight; a large drop = component was load-bearing; a NEGATIVE
//      drop (correlation goes UP without it) = component is noise/harm.
//
// Run: npm run calibrate
// Default: 600 random drafts × 40 sims/draft = 24k matches. ~30-60 sec.
//
// Tweak via env vars:
//   CALIB_DRAFTS=300 CALIB_SIMS_PER_DRAFT=20 npm run calibrate

import { simulateMatch, type TeamScore } from "../lib/matchSimulator";
import type { Champion, GameDraft, Lane } from "../lib/types";

const CHAMPIONS_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";
const MERAKI_URL =
  "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";

const POSITIONAL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

const MERAKI_POS_TO_LANE: Record<string, Lane> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  SUPPORT: "support",
};

interface RawChampion {
  id: number;
  name: string;
  alias: string;
  roles?: string[];
  squarePortraitPath?: string;
}

interface MerakiChampion {
  id: number;
  positions?: string[];
}

async function fetchChampions(): Promise<Champion[]> {
  console.log("[calibrate] Fetching champion roster...");
  const [rawArr, lanesMap] = await Promise.all([
    fetch(CHAMPIONS_URL).then((r) => {
      if (!r.ok) throw new Error(`CommunityDragon fetch failed: ${r.status}`);
      return r.json() as Promise<RawChampion[]>;
    }),
    fetch(MERAKI_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Meraki fetch failed: ${r.status}`);
        return r.json() as Promise<Record<string, MerakiChampion>>;
      })
      .then((raw) => {
        const out: Record<number, Lane[]> = {};
        for (const entry of Object.values(raw)) {
          if (typeof entry?.id !== "number") continue;
          out[entry.id] = (entry.positions ?? [])
            .map((p) => MERAKI_POS_TO_LANE[p])
            .filter((l): l is Lane => !!l);
        }
        return out;
      })
      .catch((e) => {
        console.warn("[calibrate] Meraki lane fetch failed:", e);
        return {} as Record<number, Lane[]>;
      }),
  ]);
  return rawArr
    .filter((c) => c.id > 0)
    .filter((c) => !c.alias.startsWith("Ruby_"))
    .map<Champion>((c) => ({
      id: c.id,
      name: c.name,
      alias: c.alias,
      roles: c.roles ?? [],
      iconUrl: "",
      lanes: lanesMap[c.id] ?? [],
    }));
}

// Generate one random plausible draft. For each lane on each side, sample
// a champion that can play that lane, with no overlap. Returns null if it
// can't fill (extremely rare with a normal roster).
function randomDraft(champions: Champion[], gameId: string): GameDraft | null {
  const used = new Set<number>();
  const bluePicks: (number | null)[] = [];
  const redPicks: (number | null)[] = [];
  for (const lane of POSITIONAL_LANES) {
    for (const side of ["blue", "red"] as const) {
      const candidates = champions.filter(
        (c) => !used.has(c.id) && c.lanes.includes(lane),
      );
      if (candidates.length === 0) {
        // Fallback: any unused champion.
        const fallback = champions.filter((c) => !used.has(c.id));
        if (fallback.length === 0) return null;
        const pick = fallback[Math.floor(Math.random() * fallback.length)];
        used.add(pick.id);
        if (side === "blue") bluePicks.push(pick.id);
        else redPicks.push(pick.id);
      } else {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        used.add(pick.id);
        if (side === "blue") bluePicks.push(pick.id);
        else redPicks.push(pick.id);
      }
    }
  }
  return {
    id: gameId,
    gameNumber: 1,
    blueTeam: "Blue",
    redTeam: "Red",
    blueBans: [null, null, null, null, null],
    redBans: [null, null, null, null, null],
    bluePicks,
    redPicks,
    blueRoles: [...POSITIONAL_LANES],
    redRoles: [...POSITIONAL_LANES],
    actionIndex: 20,
    status: "complete",
    winner: null,
  };
}

// Pearson correlation. Pure JS, no deps.
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

// Mean and standard deviation.
function meanStd(xs: number[]): { mean: number; std: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (const x of xs) sum += x;
  const mean = sum / n;
  let varSum = 0;
  for (const x of xs) varSum += (x - mean) * (x - mean);
  return { mean, std: Math.sqrt(varSum / n) };
}

// Numeric scoring fields we want to analyze in isolation. Each maps a
// TeamScore to its numeric value; the per-component analysis computes the
// diff in that field across both teams.
const COMPONENT_ACCESSORS: ReadonlyArray<{
  label: string;
  get: (s: TeamScore) => number;
}> = [
  { label: "damageBalance", get: (s) => s.damageBalance },
  { label: "frontline", get: (s) => s.frontline },
  { label: "laneSynergy", get: (s) => s.laneSynergy },
  { label: "engagePresence", get: (s) => s.engagePresence },
  { label: "ccQuality", get: (s) => s.ccQuality },
  { label: "compIdentity", get: (s) => s.compIdentity },
  { label: "phaseBalance", get: (s) => s.phaseBalance },
  { label: "scalingAdvantage", get: (s) => s.scalingAdvantage },
  { label: "matchupEdge", get: (s) => s.matchupEdge },
  { label: "metaStrength", get: (s) => s.metaStrength },
  { label: "synergyBonus", get: (s) => s.synergyBonus },
];

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const numDrafts = Number(process.env.CALIB_DRAFTS ?? "600");
  const simsPerDraft = Number(process.env.CALIB_SIMS_PER_DRAFT ?? "40");
  console.log(
    `[calibrate] Config: ${numDrafts} drafts × ${simsPerDraft} sims = ${numDrafts * simsPerDraft} matches`,
  );

  const champions = await fetchChampions();
  console.log(`[calibrate] Loaded ${champions.length} champions`);

  // Per-draft samples: { totalDiff, perComponentDiffs, blueWinRate }
  const totalDiffs: number[] = [];
  const blueWinRates: number[] = [];
  const componentDiffs: number[][] = COMPONENT_ACCESSORS.map(() => []);
  // For "leave one out" analysis we also need the full TeamScore-pair so
  // we can recompute diffs minus each component on the fly.
  const blueScores: TeamScore[] = [];
  const redScores: TeamScore[] = [];

  let progressCheckpoint = Math.floor(numDrafts / 20);
  if (progressCheckpoint < 1) progressCheckpoint = 1;
  const start = Date.now();
  for (let d = 0; d < numDrafts; d++) {
    const draft = randomDraft(champions, `calib-${d}`);
    if (!draft) continue;
    let blueWins = 0;
    let firstResult = null;
    for (let s = 0; s < simsPerDraft; s++) {
      const result = simulateMatch(draft, champions);
      if (result.winner === "blue") blueWins++;
      if (firstResult == null) firstResult = result;
    }
    if (firstResult == null) continue;
    const totalDiff = firstResult.blueScore.total - firstResult.redScore.total;
    const winRate = blueWins / simsPerDraft;
    totalDiffs.push(totalDiff);
    blueWinRates.push(winRate);
    blueScores.push(firstResult.blueScore);
    redScores.push(firstResult.redScore);
    for (let i = 0; i < COMPONENT_ACCESSORS.length; i++) {
      const acc = COMPONENT_ACCESSORS[i].get;
      componentDiffs[i].push(acc(firstResult.blueScore) - acc(firstResult.redScore));
    }
    if ((d + 1) % progressCheckpoint === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[calibrate]   ${d + 1}/${numDrafts} drafts done (${elapsed}s)`);
    }
  }

  console.log(
    `[calibrate] Completed ${totalDiffs.length} drafts in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );

  // ─── Headline correlation ────────────────────────────────────────────────
  const r = pearson(totalDiffs, blueWinRates);
  const { mean: meanDiff, std: stdDiff } = meanStd(totalDiffs);
  const { mean: meanWR, std: stdWR } = meanStd(blueWinRates);
  console.log("\n=== HEADLINE ===");
  console.log(`TeamScore.diff vs win rate Pearson r: ${r.toFixed(3)}`);
  console.log(`  diff:   mean=${meanDiff.toFixed(2)}  std=${stdDiff.toFixed(2)}`);
  console.log(`  winrate mean=${meanWR.toFixed(3)} std=${stdWR.toFixed(3)}`);
  console.log(
    `  Interpretation: r=${r.toFixed(3)} means ${(r * r * 100).toFixed(1)}% of win-rate variance is explained by draft strength`,
  );

  // ─── Bin-by-diff sanity table ────────────────────────────────────────────
  console.log("\n=== BIN BY DIFF ===");
  const bins: { lo: number; hi: number; n: number; wr: number }[] = [
    { lo: -100, hi: -20, n: 0, wr: 0 },
    { lo: -20, hi: -10, n: 0, wr: 0 },
    { lo: -10, hi: -3, n: 0, wr: 0 },
    { lo: -3, hi: 3, n: 0, wr: 0 },
    { lo: 3, hi: 10, n: 0, wr: 0 },
    { lo: 10, hi: 20, n: 0, wr: 0 },
    { lo: 20, hi: 100, n: 0, wr: 0 },
  ];
  for (let i = 0; i < totalDiffs.length; i++) {
    const d = totalDiffs[i];
    const bin = bins.find((b) => d >= b.lo && d < b.hi);
    if (!bin) continue;
    bin.n++;
    bin.wr += blueWinRates[i];
  }
  console.log("  diff range            n        avg blue WR");
  for (const b of bins) {
    if (b.n === 0) continue;
    const avgWR = b.wr / b.n;
    const bar = "█".repeat(Math.round(avgWR * 30));
    console.log(
      `  [${String(b.lo).padStart(4)}, ${String(b.hi).padStart(4)})    ${String(b.n).padStart(4)}    ${avgWR.toFixed(3)}  ${bar}`,
    );
  }

  // ─── Per-component correlation ────────────────────────────────────────────
  console.log("\n=== PER-COMPONENT (diff in this field alone vs WR) ===");
  console.log("  component             r        |r|");
  const rowsA: { label: string; r: number; absR: number }[] = [];
  for (let i = 0; i < COMPONENT_ACCESSORS.length; i++) {
    const r = pearson(componentDiffs[i], blueWinRates);
    rowsA.push({
      label: COMPONENT_ACCESSORS[i].label,
      r,
      absR: Math.abs(r),
    });
  }
  rowsA.sort((a, b) => b.absR - a.absR);
  for (const row of rowsA) {
    const sign = row.r >= 0 ? "+" : "";
    const bar = "█".repeat(Math.round(row.absR * 30));
    console.log(
      `  ${row.label.padEnd(20)} ${sign}${row.r.toFixed(3)}    ${bar}`,
    );
  }

  // ─── Leave-one-out correlation ────────────────────────────────────────────
  // For each component, recompute totals MINUS that component's diff, then
  // measure correlation of the modified total vs WR. Compare to the full
  // total's correlation.
  console.log("\n=== LEAVE-ONE-OUT (Δ in r when component removed) ===");
  console.log("  remove component       r_w/o      Δr (lower = more load-bearing)");
  const fullR = pearson(totalDiffs, blueWinRates);
  const rowsB: { label: string; rWithout: number; delta: number }[] = [];
  for (let i = 0; i < COMPONENT_ACCESSORS.length; i++) {
    const acc = COMPONENT_ACCESSORS[i].get;
    const adjusted: number[] = [];
    for (let j = 0; j < blueScores.length; j++) {
      const compDiff = acc(blueScores[j]) - acc(redScores[j]);
      adjusted.push(totalDiffs[j] - compDiff);
    }
    const rWithout = pearson(adjusted, blueWinRates);
    rowsB.push({
      label: COMPONENT_ACCESSORS[i].label,
      rWithout,
      delta: rWithout - fullR,
    });
  }
  rowsB.sort((a, b) => a.delta - b.delta); // most negative delta = most load-bearing
  for (const row of rowsB) {
    const sign = row.delta >= 0 ? "+" : "";
    const flag = row.delta > 0.005 ? "  ⚠ noise?" : row.delta < -0.02 ? "  ✓ load-bearing" : "";
    console.log(
      `  ${row.label.padEnd(20)} ${row.rWithout.toFixed(3)}     ${sign}${row.delta.toFixed(4)}${flag}`,
    );
  }

  console.log("\n=== TUNING NOTES ===");
  console.log("  • r ≥ 0.4 = strong predictor; r < 0.1 = weak / noise.");
  console.log("  • Δr > 0 in leave-one-out = removing the component IMPROVED correlation. The component is hurting prediction.");
  console.log("  • Δr near 0 = component is redundant. Could remove or combine.");
  console.log("  • Δr ≪ 0 = component is load-bearing. Don't touch.");
  console.log("\n[calibrate] Done.");
}

main().catch((err) => {
  console.error("[calibrate] Failed:", err);
  process.exit(1);
});
