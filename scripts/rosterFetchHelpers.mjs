// Pure helpers for scripts/fetch-player-names.mjs — kept separate so vitest
// can lock the academy/sub-swap guards without hitting the live API.

export const ROSTER_LANES = ["top", "jungle", "middle", "bottom", "support"];

export function trimHandle(s) {
  return (s || "").trim();
}

/**
 * Challengers/academy under the main team code: brand-new five while the
 * previous starters are still listed on the org.
 */
export function isLikelyAcademyLineup(prior, roster, squadHandles) {
  if (!prior) return false;
  const prevFive = ROSTER_LANES.map((l) => trimHandle(prior[l])).filter(Boolean);
  if (prevFive.length < 5) return false;
  const onSquad = new Set(
    [...squadHandles].map(trimHandle).filter(Boolean),
  );
  if (!prevFive.every((h) => onSquad.has(h))) return false;
  const overlap = ROSTER_LANES.filter(
    (l) => roster[l] && prior[l] && trimHandle(roster[l]) === trimHandle(prior[l]),
  ).length;
  return overlap === 0;
}

/**
 * Prefer previous starters who are still on the squad (getTeams lists academy
 * first and recent matches can be sub/cup games). Returns lane → handle for
 * sticky slots only.
 */
export function stickyPriorStarters(prior, squadHandles) {
  if (!prior) return {};
  const onSquad = new Set(
    [...squadHandles].map(trimHandle).filter(Boolean),
  );
  const out = {};
  for (const l of ROSTER_LANES) {
    const h = trimHandle(prior[l]);
    if (h && onSquad.has(h)) out[l] = h;
  }
  return out;
}

/**
 * Team-object roster with prior-starter preference (avoids academy-first order).
 */
export function preferPriorOnTeamObject(players, roleToLane, prior) {
  if (!players?.length) return null;
  const byLane = {};
  for (const p of players) {
    const l = roleToLane[p.role];
    const name = trimHandle(p.summonerName);
    if (!l || !name) continue;
    (byLane[l] ??= []).push(name);
  }
  const roster = {};
  for (const l of ROSTER_LANES) {
    const candidates = byLane[l] ?? [];
    if (!candidates.length) continue;
    const prefer = trimHandle(prior?.[l]);
    roster[l] = prefer && candidates.includes(prefer) ? prefer : candidates[0];
  }
  return Object.keys(roster).length ? roster : null;
}
