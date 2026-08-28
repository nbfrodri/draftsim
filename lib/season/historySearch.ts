// Liquipedia-style search over the Hall of Seasons archive: build player, team,
// and coach PROFILES by scanning the archived season entries (champions, split
// results, phase rosters, careers). Pure + framework-free so the UI just renders.
//
// Teams are matched across seasons by NAME + LEAGUE (same convention as
// historyRecords). Players are matched by stable id; coaches by name.

import type { Lane, PlayerTier } from "../types";
import { PLAYER_TIER_VALUE } from "../players";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "./history";
import {
  SPLIT_LABELS,
  INTERNATIONAL_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
  INTERNATIONAL_DISPLAY_ORDER,
} from "./types";
import {
  careerWinLoss,
  computePlayerCareers,
  computeTeamRecords,
  type PlayerCareerLine,
  type TeamRecord,
} from "./historyRecords";
import type { PlayerChampStat } from "./stats";
import {
  bumpSplitFinalsReached,
  reachedIntlFinal,
  reachedSplitFinal,
  teamIntlOutcome,
  teamSplitPlacement,
  type IntlOutcome,
  type SplitFinalsReachedMap,
} from "./placements";
import {
  ACADEMY_YEARS,
  TOTAL_INACTIVE_BEFORE_RETIRE,
  academyTenureYears,
  yearsAsFreeAgent,
  yearsInAcademy,
  type InactivePlayerSnapshot,
} from "./playerLifecycle";

const teamKey = (t: { name: string; leagueId: LeagueId }) => `${t.leagueId}:${t.name}`;
function yearOf(entry: SeasonHistoryEntry): string {
  // The season name already carries the year/franchise label.
  return entry.name;
}

// The richest archived identity (color/icon/logo) for each team, from the refs
// that carry full identity (champions, finalists, best-team). Newest wins. Used
// to give player/coach tenure refs proper logos instead of bare shields.
export function buildTeamIdentity(entries: SeasonHistoryEntry[]): Map<string, SeasonHistoryTeamRef> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byKey = new Map<string, SeasonHistoryTeamRef>();
  const add = (t: SeasonHistoryTeamRef | null | undefined) => {
    if (!t) return;
    const k = teamKey(t);
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, t);
    else if (!cur.logoUrl && t.logoUrl) byKey.set(k, { ...cur, logoUrl: t.logoUrl });
  };
  for (const e of ordered) {
    add(e.champion);
    add(e.runnerUp);
    for (const ref of Object.values(e.intlChampions)) add(ref);
    for (const byLeague of Object.values(e.splitChampions)) for (const ref of Object.values(byLeague)) add(ref);
    for (const best of Object.values(e.leagueBestTeams ?? {})) add(best?.team);
    for (const ph of e.phaseRosters ?? []) {
      for (const t of ph.teams) {
        add({
          name: t.teamName,
          leagueId: t.leagueId,
          color: "",
          iconKey: "shield",
          ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
        });
      }
    }
  }
  return byKey;
}

// A team ref with the best identity we have, falling back to a bare ref.
export function refFor(
  identity: Map<string, SeasonHistoryTeamRef>,
  name: string,
  leagueId: LeagueId,
  logoUrl?: string,
): SeasonHistoryTeamRef {
  return (
    identity.get(`${leagueId}:${name}`) ?? {
      name,
      leagueId,
      color: "",
      iconKey: "shield",
      ...(logoUrl ? { logoUrl } : {}),
    }
  );
}

// ─── Search indexes (what the user can pick from) ────────────────────────────

export interface PlayerHit {
  id: string;
  name: string;
  leagueId: LeagueId | null;
  team: SeasonHistoryTeamRef | null; // most-recent team, for a logo
  lane: Lane | null; // primary (most-recent) position, for the lane filter/icon
  tier: PlayerTier | null; // most-recent skill tier
  /** @deprecated Prefer `careerStatus` — true when status === "retired". */
  retired: boolean;
  /** Active / academy / free-agent / retired. Legacy archives without an
   *  inactive pool fall back to active vs retired (missing from latest roster). */
  careerStatus: "active" | "academy" | "free-agent" | "retired";
  /** Total years since demotion when academy / FA / retired; unset when active. */
  inactiveYears?: number;
  /** Academy badge years (1…ACADEMY_YEARS_MAX); only set while in academy. */
  academyYears?: number;
  /** Years spent as free agent after academy; set when FA / retired. */
  freeAgentYears?: number;
  /** Last active grade when demoted (from inactive snapshot). */
  lastActiveGrade?: number | null;
  /** Shadow form while inactive. */
  shadowGrade?: number | null;
  /** Years remaining until FA (academy) or retirement (academy/FA). */
  yearsLeftToFa?: number;
  yearsLeftToRetire?: number;
  debutYear?: number; // franchise year they debuted as a rookie (badge); unset for founders
  // Career totals, so the search list can be ordered by accolades/stats.
  titles: number; // split + international titles
  mvps: number;
  allPro: number;
  pentakills: number;
  kills: number;
  games: number;
  gamesWon: number; // career games won (from champ-pool tallies)
  winRate: number | null; // career win rate (0..1), null when no recorded games
  grade: number; // career average grade (0 when no rated games)
}

// Players who appeared in an earlier archived season but are absent from the
// latest roster-bearing one — i.e. they've stopped playing (retired/aged out).
// Needs ≥2 archived seasons to call anyone retired (a single season has no
// "later" roster to be missing from). Pure over the archive — realities carry
// rosters across years, so this is meaningful there; one-off season Halls
// rarely reuse player ids, so few (if any) get flagged.
export function retiredPlayerIds(entries: SeasonHistoryEntry[]): Set<string> {
  const status = playerCareerStatuses(entries);
  const out = new Set<string>();
  for (const [id, s] of status) if (s.status === "retired") out.add(id);
  return out;
}

export type CareerStatusInfo = {
  status: PlayerHit["careerStatus"];
  inactiveYears?: number;
  academyYears?: number;
  freeAgentYears?: number;
};

export interface PlayerCareerStatusOpts {
  /** When set, resolve status from that archived season only (point-in-time). */
  asOfSeasonId?: string;
  /**
   * End-of-season truth: inactive-pool membership wins even if the player also
   * appeared on a phase roster that year (demoted in the closing offseason).
   * Default false — roster membership ⇒ active (correct for stage lineup sheets).
   */
  preferInactive?: boolean;
  /**
   * Live franchise inactive pool — overlays *current* Search status only.
   * Never used for as-of / year-history tenure rows.
   */
  liveInactive?: readonly InactivePlayerSnapshot[];
  /** Live roster ids — signed-back players clear inactive overlay. */
  liveRosterIds?: ReadonlySet<string>;
}

/** Completed Hall archives only — unfinished seasons are not year-history. */
function completedEntries(entries: SeasonHistoryEntry[]): SeasonHistoryEntry[] {
  return entries.filter((e) => e.complete);
}

function rosterPlayerIds(entry: SeasonHistoryEntry): Set<string> {
  const active = new Set<string>();
  for (const ph of entry.phaseRosters ?? [])
    for (const t of ph.teams) for (const p of t.players) if (p.id) active.add(p.id);
  return active;
}

/**
 * Badge years for an inactive row. `academyYears` is the *live* academy badge,
 * so it is only set while the player is actually in an academy — an FA or
 * retired row would otherwise report a synthetic academy stay (opening FA
 * seeds never spent a day in one). FA/retired rows carry `freeAgentYears`.
 */
function inactiveStatusInfo(
  status: "academy" | "free-agent" | "retired",
  inactiveYears: number,
): CareerStatusInfo {
  return {
    status,
    inactiveYears,
    ...(status === "academy"
      ? { academyYears: yearsInAcademy(status, inactiveYears) }
      : { freeAgentYears: yearsAsFreeAgent(status, inactiveYears) }),
  };
}

/** Resolve career status from the newest inactive-pool snapshot, falling back
 *  to the legacy "missing from latest roster ⇒ retired" heuristic only when no
 *  archive carries an inactive pool (pre-lifecycle Hall entries).
 *
 *  Current (no asOf) status uses **completed** archives only, then optionally
 *  overlays `liveInactive` for Search filters mid-season. Year-history /
 *  as-of lookups never see the live unfinished season.
 *
 *  Pass `asOfSeasonId` for point-in-time status on a specific archived year
 *  (stage rosters / year-history rows). Legacy as-of seasons without an
 *  `inactivePlayers` snapshot only mark rostered players active — academy/FA
 *  distinction is omitted. */
export function playerCareerStatuses(
  entries: SeasonHistoryEntry[],
  opts?: PlayerCareerStatusOpts,
): Map<string, CareerStatusInfo> {
  const out = new Map<string, CareerStatusInfo>();
  const asOfId = opts?.asOfSeasonId;
  const preferInactive = opts?.preferInactive === true;

  // ── Point-in-time for one archived season ─────────────────────────────────
  if (asOfId != null) {
    const entry = entries.find((e) => e.id === asOfId);
    if (!entry) return out;
    const active = rosterPlayerIds(entry);
    const pool = entry.inactivePlayers;

    if (preferInactive && pool != null) {
      for (const p of pool) {
        if (!p.playerId) continue;
        out.set(p.playerId, inactiveStatusInfo(p.status, p.inactiveYears));
      }
      for (const id of active) {
        if (!out.has(id)) out.set(id, { status: "active" });
      }
      return out;
    }

    if (pool != null) {
      for (const p of pool) {
        if (!p.playerId || active.has(p.playerId)) continue;
        out.set(p.playerId, inactiveStatusInfo(p.status, p.inactiveYears));
      }
    }
    // Legacy as-of (no pool): roster ⇒ active only; no cross-season retired guess.
    for (const id of active) {
      if (!out.has(id)) out.set(id, { status: "active" });
    }
    return out;
  }

  // ── Current (latest) career status — completed archives only ──────────────
  // End-of-season truth: the newest inactivePlayers snapshot wins for anyone
  // in the pool (demoted / FA / retired), even if they still appear on that
  // year's phaseRosters (they played, then were benched/demoted in the
  // closing offseason). Stale pools from older archives do NOT override a
  // player who is rostered on a newer season (promoted / signed back).
  const hall = completedEntries(entries);
  const withRosters = hall.filter((e) => (e.phaseRosters?.length ?? 0) > 0);
  const withPool = [...hall]
    .filter((e) => e.inactivePlayers != null)
    .sort((a, b) => b.archivedAt - a.archivedAt)[0];
  const hasLifecycleSnapshots = withPool != null;

  // No roster-bearing archives and no pool → nothing from Hall yet.
  if (withRosters.length === 0 && !withPool) {
    // Still allow live overlay when Hall is empty / mid Year 1.
  } else {
    const latest =
      withRosters.length > 0
        ? withRosters.reduce((a, b) => (b.archivedAt > a.archivedAt ? b : a))
        : withPool!;
    const active = rosterPlayerIds(latest);
    // Pool is current when it belongs to the newest roster season (or there is
    // no newer roster-only archive). Otherwise treat it as stale.
    const poolIsCurrent =
      withPool != null && withPool.archivedAt >= latest.archivedAt;

    if (withPool?.inactivePlayers) {
      for (const p of withPool.inactivePlayers) {
        if (!p.playerId) continue;
        // Stale pool: a player back on a newer roster is active again.
        if (!poolIsCurrent && active.has(p.playerId)) continue;
        out.set(p.playerId, inactiveStatusInfo(p.status, p.inactiveYears));
      }
    }

    // Legacy fallback: anyone who appeared before but isn't on the latest roster
    // and isn't already tagged from the inactive pool → retired. Only when no
    // archive has lifecycle snapshots (otherwise missing ⇒ not in pool / active).
    if (!hasLifecycleSnapshots && withRosters.length >= 2) {
      for (const e of withRosters) {
        if (e.id === latest.id) continue;
        for (const ph of e.phaseRosters ?? [])
          for (const t of ph.teams)
            for (const p of t.players) {
              if (!p.id || active.has(p.id) || out.has(p.id)) continue;
              out.set(p.id, { status: "retired" });
            }
      }
    }

    for (const id of active) {
      if (!out.has(id)) out.set(id, { status: "active" });
    }
  }

  // Live franchise overlay for Search "current status" only.
  if (opts?.liveInactive) {
    const liveRoster = opts.liveRosterIds;
    for (const p of opts.liveInactive) {
      if (!p.playerId) continue;
      if (liveRoster?.has(p.playerId)) continue;
      out.set(p.playerId, inactiveStatusInfo(p.status, p.inactiveYears));
    }
    if (liveRoster) {
      for (const id of liveRoster) {
        out.set(id, { status: "active" });
      }
    }
  }

  return out;
}

/** Single-player status — current, or point-in-time when `asOfSeasonId` is set. */
export function playerCareerStatus(
  entries: SeasonHistoryEntry[],
  playerId: string,
  opts?: PlayerCareerStatusOpts,
): CareerStatusInfo | undefined {
  return playerCareerStatuses(entries, opts).get(playerId);
}

type PlayerMeta = {
  lane: Lane;
  tier: PlayerTier;
  teamName?: string;
  leagueId?: LeagueId;
  logoUrl?: string;
  debutYear?: number;
  name?: string;
};

// Each player's most-recent lane + tier + team, from the newest roster
// appearance, falling back to inactive-pool affiliate identity.
function playerMeta(entries: SeasonHistoryEntry[]): Map<string, PlayerMeta> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const identity = buildTeamIdentity(entries);
  const out = new Map<string, PlayerMeta>();
  for (const e of ordered) {
    for (const phase of [...(e.phaseRosters ?? [])].sort((a, b) => b.phaseIndex - a.phaseIndex)) {
      for (const t of phase.teams)
        for (const p of t.players)
          if (p.id && !out.has(p.id))
            out.set(p.id, {
              lane: p.lane,
              tier: p.tier,
              teamName: t.teamName,
              leagueId: t.leagueId,
              ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
              ...(p.debutYear != null ? { debutYear: p.debutYear } : {}),
              ...(p.name ? { name: p.name } : {}),
            });
    }
  }
  // Fill gaps (and pool-only players) from the newest inactive snapshots.
  for (const e of ordered) {
    for (const snap of e.inactivePlayers ?? []) {
      if (!snap.playerId || out.has(snap.playerId)) continue;
      const affiliate = teamRefFromInactive(identity, entries, snap);
      out.set(snap.playerId, {
        lane: snap.lane,
        tier: snap.tier,
        ...(affiliate
          ? {
              teamName: affiliate.name,
              leagueId: affiliate.leagueId,
              ...(affiliate.logoUrl ? { logoUrl: affiliate.logoUrl } : {}),
            }
          : snap.lastTeamName
            ? { teamName: snap.lastTeamName }
            : {}),
        ...(snap.debutYear != null ? { debutYear: snap.debutYear } : {}),
        ...(snap.playerName ? { name: snap.playerName } : {}),
      });
    }
  }
  return out;
}

function hitFromCareer(
  c: PlayerCareerLine,
  meta: Map<string, PlayerMeta>,
  statuses: Map<string, CareerStatusInfo>,
  identity: Map<string, SeasonHistoryTeamRef>,
): PlayerHit {
  const m = meta.get(c.playerId);
  const wl = careerWinLoss(c);
  const st = statuses.get(c.playerId) ?? { status: "active" as const };
  const leagueId = m?.leagueId ?? c.leagueId;
  const teamName = m?.teamName ?? c.teamName;
  return {
    id: c.playerId,
    name: c.playerName || m?.name || c.playerId,
    leagueId,
    team:
      teamName && leagueId
        ? refFor(identity, teamName, leagueId, m?.logoUrl)
        : null,
    lane: m?.lane ?? c.lane ?? null,
    tier: m?.tier ?? null,
    retired: st.status === "retired",
    careerStatus: st.status,
    ...(st.inactiveYears != null ? { inactiveYears: st.inactiveYears } : {}),
    ...(st.academyYears != null ? { academyYears: st.academyYears } : {}),
    ...(st.freeAgentYears != null ? { freeAgentYears: st.freeAgentYears } : {}),
    ...(m?.debutYear != null ? { debutYear: m.debutYear } : {}),
    titles: c.splitTitles + c.intlTitles,
    mvps: c.mvps,
    allPro: c.allPro,
    pentakills: c.pentakills,
    kills: c.kills,
    games: c.games,
    gamesWon: wl.wins,
    winRate: wl.rate,
    grade: c.ratingGames > 0 ? Math.round((c.ratingSum / c.ratingGames) * 10) / 10 : 0,
  };
}

/** Empty career shell for inactive-pool players with no archived playerCareers. */
function emptyCareerShell(
  playerId: string,
  name: string,
  leagueId: LeagueId | null,
  teamName: string | undefined,
  lane: Lane | null,
): PlayerCareerLine {
  return {
    playerId,
    playerName: name,
    leagueId,
    ...(teamName ? { teamName } : {}),
    ...(lane ? { lane } : {}),
    seasons: 0,
    games: 0,
    wins: 0,
    winsGames: 0,
    kills: 0,
    mvps: 0,
    allPro: 0,
    allProSplit: 0,
    allProSeason: 0,
    intlMvps: 0,
    splitMvps: 0,
    champs: [],
    splitTitles: 0,
    intlAppearances: 0,
    intlTitles: 0,
    deaths: 0,
    assists: 0,
    pentakills: 0,
    ratingSum: 0,
    ratingGames: 0,
    goldDiffSum: 0,
    goldDiffGames: 0,
  };
}

/** Every player who appears in any archived career OR inactive pool
 *  (academy / free-agent / retired), newest identity first. */
export function listPlayers(
  entries: SeasonHistoryEntry[],
  opts?: Pick<PlayerCareerStatusOpts, "liveInactive" | "liveRosterIds">,
): PlayerHit[] {
  const identity = buildTeamIdentity(entries);
  const meta = playerMeta(entries);
  const statuses = playerCareerStatuses(entries, opts);
  const byId = new Map<string, PlayerHit>();

  for (const c of computePlayerCareers(entries)) {
    byId.set(c.playerId, hitFromCareer(c, meta, statuses, identity));
  }

  // Include academy / FA / retired players who never got a playerCareers row
  // (or only exist in the inactive pool of the newest lifecycle snapshot).
  const hall = completedEntries(entries);
  const withPool = [...hall]
    .filter((e) => e.inactivePlayers != null)
    .sort((a, b) => b.archivedAt - a.archivedAt)[0];
  for (const snap of withPool?.inactivePlayers ?? []) {
    if (!snap.playerId || byId.has(snap.playerId)) continue;
    const m = meta.get(snap.playerId);
    const name = snap.playerName || m?.name || snap.playerId;
    const leagueId = m?.leagueId ?? null;
    const teamName = m?.teamName ?? snap.lastTeamName;
    const shell = emptyCareerShell(
      snap.playerId,
      name,
      leagueId,
      teamName,
      snap.lane,
    );
    if (!statuses.has(snap.playerId)) {
      statuses.set(
        snap.playerId,
        inactiveStatusInfo(snap.status, snap.inactiveYears),
      );
    }
    byId.set(snap.playerId, hitFromCareer(shell, meta, statuses, identity));
  }

  // Live-only inactive players (demoted mid Year 1 before any complete archive).
  for (const snap of opts?.liveInactive ?? []) {
    if (!snap.playerId || byId.has(snap.playerId)) continue;
    if (opts?.liveRosterIds?.has(snap.playerId)) continue;
    const m = meta.get(snap.playerId);
    const name = snap.playerName || m?.name || snap.playerId;
    const shell = emptyCareerShell(
      snap.playerId,
      name,
      m?.leagueId ?? null,
      m?.teamName ?? snap.lastTeamName,
      snap.lane,
    );
    if (!statuses.has(snap.playerId)) {
      statuses.set(
        snap.playerId,
        inactiveStatusInfo(snap.status, snap.inactiveYears),
      );
    }
    byId.set(snap.playerId, hitFromCareer(shell, meta, statuses, identity));
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// 1..5 star rating from a roster's tiers (mirrors players.deriveStar without
// needing full Player objects). Empty → 3 (neutral).
function starOf(players: ReadonlyArray<{ tier: PlayerTier }>): number {
  if (players.length === 0) return 3;
  const mean = players.reduce((s, p) => s + PLAYER_TIER_VALUE[p.tier], 0) / players.length;
  return Math.max(1, Math.min(5, Math.round(3 + mean)));
}

/** Each team's most-recent star rating (key = `${leagueId}:${name}`). */
export function teamStars(entries: SeasonHistoryEntry[]): Map<string, number> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const out = new Map<string, number>();
  for (const e of ordered) {
    for (const phase of [...(e.phaseRosters ?? [])].sort((a, b) => b.phaseIndex - a.phaseIndex)) {
      for (const t of phase.teams) {
        const k = teamKey({ name: t.teamName, leagueId: t.leagueId });
        if (!out.has(k) && t.players.length) out.set(k, starOf(t.players));
      }
    }
  }
  return out;
}

export interface CoachHit {
  name: string;
  rating: number; // most-recent rating
  team: SeasonHistoryTeamRef | null; // most-recent team, for a logo
  playstyle?: string; // most-recent drafting playstyle label
  titles: number; // career split + international titles (for ordering)
}

// A coach's career titles for the Records boards — split out by event, with the
// most-recent team/region for a logo and per-region grouping.
export interface CoachRecord {
  name: string;
  team: SeasonHistoryTeamRef | null; // most-recent team (logo)
  leagueId: LeagueId | null; // most-recent region
  splitTitles: number;
  firstStand: number;
  msi: number;
  worlds: number;
  globalCup: number;
  intlTotal: number;
  total: number; // splits + internationals (raw count)
  /** International finals reached while coaching (#1 or #2). */
  intlFinalsReached: Partial<Record<InternationalId, number>>;
  /** Domestic split finals reached while coaching, per split × region. */
  splitFinalsReached: SplitFinalsReachedMap;
}
const COACH_INTL_FIELD: Record<
  InternationalId,
  "firstStand" | "msi" | "worlds" | "globalCup"
> = {
  "first-stand": "firstStand",
  msi: "msi",
  worlds: "worlds",
  "global-cup": "globalCup",
};

/** Per-coach career titles, broken out by event. A team's titles are credited
 *  to its END-OF-SEASON coach (latest phase wins) so a mid-season coaching
 *  change never double-counts. Region/team are the coach's most recent. */
export function computeCoachRecords(entries: SeasonHistoryEntry[]): CoachRecord[] {
  const identity = buildTeamIdentity(entries);
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt); // newest first → most-recent identity
  const acc = new Map<string, CoachRecord>();
  const ensure = (name: string) => {
    let r = acc.get(name);
    if (!r) {
      r = { name, team: null, leagueId: null, splitTitles: 0, firstStand: 0, msi: 0, worlds: 0, globalCup: 0, intlTotal: 0, total: 0, intlFinalsReached: {}, splitFinalsReached: {} };
      acc.set(name, r);
    }
    return r;
  };
  for (const e of ordered) {
    const coachOfTeam = new Map<string, string>();
    for (const phase of e.phaseRosters ?? []) {
      for (const t of phase.teams) {
        if (t.coach?.name) coachOfTeam.set(teamKey({ name: t.teamName, leagueId: t.leagueId }), t.coach.name);
      }
    }
    for (const [k, coach] of coachOfTeam) {
      const leagueId = k.slice(0, k.indexOf(":")) as LeagueId;
      const name = k.slice(k.indexOf(":") + 1);
      const r = ensure(coach);
      // Newest entry first, so the first team we see is their most-recent.
      if (!r.team) {
        r.team = refFor(identity, name, leagueId);
        r.leagueId = leagueId;
      }
      const tally = teamSeasonTitles(e, { name, leagueId });
      r.splitTitles += tally.splits.length;
      for (const ev of tally.intl) r[COACH_INTL_FIELD[ev]] += 1;
    }
    for (const phase of e.phaseRosters ?? []) {
      if (phase.kind === "split" && phase.split) {
        for (const t of phase.teams) {
          const coach = t.coach?.name;
          if (!coach) continue;
          const placement = teamSplitPlacement(
            e,
            { name: t.teamName, leagueId: t.leagueId },
            phase.split,
          );
          if (!reachedSplitFinal(placement)) continue;
          bumpSplitFinalsReached(ensure(coach).splitFinalsReached, phase.split, t.leagueId);
        }
      }
      if (phase.kind === "international" && phase.event) {
        for (const t of phase.teams) {
          const coach = t.coach?.name;
          if (!coach) continue;
          const outcome = teamIntlOutcome(
            e,
            { name: t.teamName, leagueId: t.leagueId },
            phase.event,
          );
          if (!reachedIntlFinal(outcome.placement)) continue;
          const r = ensure(coach);
          r.intlFinalsReached[phase.event] = (r.intlFinalsReached[phase.event] ?? 0) + 1;
        }
      }
    }
  }
  for (const r of acc.values()) {
    r.intlTotal = r.firstStand + r.msi + r.worlds + r.globalCup;
    r.total = r.splitTitles + r.intlTotal;
  }
  return [...acc.values()];
}

// Career title count per coach (raw), keyed by name — for the search sort.
function coachTitleTally(entries: SeasonHistoryEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of computeCoachRecords(entries)) if (r.total) out.set(r.name, r.total);
  return out;
}

/** Every distinct coach, with their latest rating + team. */
export function listCoachesRich(entries: SeasonHistoryEntry[]): CoachHit[] {
  const identity = buildTeamIdentity(entries);
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const titles = coachTitleTally(entries);
  const out = new Map<string, CoachHit>();
  for (const e of ordered) {
    for (const phase of [...(e.phaseRosters ?? [])].sort((a, b) => b.phaseIndex - a.phaseIndex)) {
      for (const t of phase.teams) {
        if (!t.coach?.name || out.has(t.coach.name)) continue;
        out.set(t.coach.name, {
          name: t.coach.name,
          rating: t.coach.rating,
          team: refFor(identity, t.teamName, t.leagueId, t.logoUrl),
          ...(t.coach.playstyle ? { playstyle: t.coach.playstyle } : {}),
          titles: titles.get(t.coach.name) ?? 0,
        });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every distinct team (by name+league), with the richest identity available. */
export function listTeams(entries: SeasonHistoryEntry[]): SeasonHistoryTeamRef[] {
  const identity = buildTeamIdentity(entries);
  const keys = new Set<string>(identity.keys());
  for (const e of entries) {
    for (const phase of e.phaseRosters ?? []) {
      for (const t of phase.teams) keys.add(teamKey({ name: t.teamName, leagueId: t.leagueId }));
    }
  }
  return [...keys]
    .map((k) => refFor(identity, k.slice(k.indexOf(":") + 1), k.slice(0, k.indexOf(":")) as LeagueId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every distinct coach name across all archived rosters. */
export function listCoaches(entries: SeasonHistoryEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    for (const phase of e.phaseRosters ?? []) {
      for (const t of phase.teams) if (t.coach?.name) set.add(t.coach.name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ─── Title detection helpers ─────────────────────────────────────────────────

function teamWonSplit(entry: SeasonHistoryEntry, split: SplitId, team: { name: string; leagueId: LeagueId }): boolean {
  return entry.splitChampions[split]?.[team.leagueId]?.name === team.name;
}
function teamWonIntl(entry: SeasonHistoryEntry, event: InternationalId, teamName: string): boolean {
  return entry.intlChampions[event]?.name === teamName;
}

// A structured tally of titles, kept split vs international (per event), so the
// UI can break them out instead of lumping into one number.
export interface TitleTally {
  splits: SplitId[];
  intl: InternationalId[];
}
const emptyTally = (): TitleTally => ({ splits: [], intl: [] });

/**
 * A player's trophies grouped by the REGION they were won in. Careers cross
 * leagues — an LCK champion who moves to the LEC keeps his LCK titles under
 * the LCK, so a flat career total (which silently reads as "his newest
 * league") is the wrong shape for the profile.
 */
export interface PlayerRegionTitles {
  leagueId: LeagueId;
  /** Split titles in this region, per split, plus their total. */
  splits: Partial<Record<SplitId, number>>;
  splitTotal: number;
  /** Internationals won while representing this region, per event. */
  intl: Partial<Record<InternationalId, number>>;
  intlTotal: number;
  /** Clubs the trophies were lifted with, newest first. */
  teams: SeasonHistoryTeamRef[];
  /** Seasons any of them were won in, newest first. */
  seasons: string[];
}

const SPLIT_WINDOW_LABELS: Record<SplitId, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
};

/** Short chip label for a career window ("Winter", "MSI", "Offseason"). */
export function careerWindowLabel(key: CareerWindowKey): string {
  if (key === "offseason") return "Offseason";
  return (
    SPLIT_WINDOW_LABELS[key as SplitId] ??
    INTERNATIONAL_LABELS[key as InternationalId] ??
    key
  );
}

// All titles a given team won in one season, structured.
function teamSeasonTitles(entry: SeasonHistoryEntry, team: { name: string; leagueId: LeagueId }): TitleTally {
  const out = emptyTally();
  for (const [split, byLeague] of Object.entries(entry.splitChampions) as Array<[SplitId, Partial<Record<LeagueId, SeasonHistoryTeamRef>>]>) {
    if (byLeague[team.leagueId]?.name === team.name) out.splits.push(split);
  }
  for (const [event, ref] of Object.entries(entry.intlChampions) as Array<[InternationalId, SeasonHistoryTeamRef]>) {
    if (ref.name === team.name) out.intl.push(event);
  }
  return out;
}

// ─── Player profile ──────────────────────────────────────────────────────────

// One stint = a continuous run of stages on the SAME team within a season. A
// player transferred mid-year shows multiple stints (e.g. team A for the Winter
// Split, team B from MSI on).
export interface PlayerStint {
  team: SeasonHistoryTeamRef;
  lane: Lane;
  tier: PlayerTier;
  stages: string[]; // stage labels in play order
}

/** Calendar slot a career window covers — a split, an international, or the
 *  year-end offseason that closes the year. */
export type CareerWindowKey = SplitId | InternationalId | "offseason";

/**
 * Where a player stood in ONE window of a season: on a main roster (with the
 * club), in an academy, on the FA board, or retired. Built from the phase
 * roster + {@link PhaseInactiveSnapshot} stamps taken as each split /
 * international completed, so the timeline reads split-by-split instead of
 * collapsing the whole year into its final status.
 */
export interface PlayerCareerWindow {
  key: CareerWindowKey;
  /** Short chip label — "Winter", "MSI", "Offseason". */
  label: string;
  kind: "split" | "international" | "offseason";
  status: PlayerHit["careerStatus"];
  /** Main-roster club while active; affiliate org / last club while inactive. */
  team?: SeasonHistoryTeamRef | null;
  lane?: Lane;
  tier?: PlayerTier;
  /** Trophy lifted in THIS window. Main roster only — academy and FA never
   *  inherit their org's title. */
  title?: SplitId | InternationalId;
  /** 1-based domestic split finish while active on a main roster. */
  splitPlacement?: number;
  /** International result for the player's club this window. */
  intlOutcome?: IntlOutcome;
}

export interface PlayerTenure {
  season: string;
  /** Archived season entry id — for point-in-time status lookups. */
  seasonId: string;
  archivedAt: number;
  stints: PlayerStint[]; // 0 when inactive-only that year; >1 = transferred mid-year
  titles: TitleTally; // titles won while rostered for that stage
  /**
   * Status per split / international / offseason, in play order. Omitted for
   * legacy archives with nothing to say about the windows the player did not
   * play — those rows stay year-only.
   */
  windows?: PlayerCareerWindow[];
  /**
   * End-of-season career status for this year (from `inactivePlayers` when
   * present). Career History rows cover active / academy / FA / retired.
   */
  careerStatus: PlayerHit["careerStatus"];
  inactiveYears?: number;
  academyYears?: number;
  freeAgentYears?: number;
  /** Last club from the inactive snapshot when academy / FA / retired that year. */
  affiliateTeam?: SeasonHistoryTeamRef | null;
}

/**
 * Career History is newest-first. After retirement the inactive pool keeps
 * carrying the player as `retired` every later archive — collapse that to a
 * single retirement year (keep the earliest retired row, drop newer repeats).
 */
export function trimRetiredCareerTenures<
  T extends { careerStatus: PlayerHit["careerStatus"] },
>(tenuresNewestFirst: readonly T[]): T[] {
  let lead = 0;
  while (
    lead < tenuresNewestFirst.length &&
    tenuresNewestFirst[lead]!.careerStatus === "retired"
  ) {
    lead++;
  }
  if (lead <= 1) return [...tenuresNewestFirst];
  return [tenuresNewestFirst[lead - 1]!, ...tenuresNewestFirst.slice(lead)];
}

// One season's per-player numbers, for the profile's season-by-season readout
// (age over the years, All-Pro splits/season, champion pool that season).
export interface PlayerSeasonStat {
  season: string;
  archivedAt: number;
  age?: number;
  allPro: number; // total per-tournament All-Pro picks that season
  allProSplit: number;
  allProSeason: number;
  intlMvpEvents: InternationalId[]; // international events this player was finals MVP
  splitMvps: SplitId[]; // domestic splits this player was finals MVP
  champs: PlayerChampStat[];
}

export interface PlayerProfile {
  id: string;
  name: string;
  lane: Lane | null; // primary (most-recent) position
  tier: PlayerTier | null; // most-recent skill tier
  age?: number; // most-recent known age
  debutYear?: number; // franchise year they debuted as a rookie; unset for founders
  retired: boolean; // absent from the latest archived season's rosters
  careerStatus: "active" | "academy" | "free-agent" | "retired";
  inactiveYears?: number;
  academyYears?: number;
  freeAgentYears?: number;
  lastActiveGrade?: number | null;
  shadowGrade?: number | null;
  yearsLeftToFa?: number;
  yearsLeftToRetire?: number;
  splitTitles: number;
  intlTitles: Partial<Record<InternationalId, number>>; // by event
  /** Finals reached (#1 or #2) while rostered, aggregated across teams. */
  intlFinalsReached: Partial<Record<InternationalId, number>>;
  /** Split finals reached while rostered, per split × region. */
  splitFinalsReached: SplitFinalsReachedMap;
  /** Same trophies, grouped by the region they were won in — most decorated
   *  region first. Empty when the player has never won anything. */
  titlesByRegion: PlayerRegionTitles[];
  career: PlayerCareerLine | null;
  /** Per completed season, newest first — Career History timeline (roster + academy/FA). */
  tenures: PlayerTenure[];
  seasons: PlayerSeasonStat[]; // newest first, only seasons with recorded stats
}

/**
 * Personal academy stay for an archived / live snapshot. Snapshots carry the
 * same signals {@link academyTenureYears} scores on (tier, potential, shadow
 * form, `academyTenureShift`), so the Hall can show the player's own "y to FA"
 * instead of the league-wide soft default. Falls back to the soft default when
 * no snapshot is available.
 */
function academyTenureFromSnapshot(
  snap: InactivePlayerSnapshot | undefined,
  inactiveYears: number,
): number {
  if (!snap) return ACADEMY_YEARS;
  return academyTenureYears({
    player: {
      lane: snap.lane,
      tier: snap.tier,
      goodChamps: snap.goodChamps ?? [],
      badChamps: snap.badChamps ?? [],
      ...(snap.playerId ? { id: snap.playerId } : {}),
      ...(snap.age != null ? { age: snap.age } : {}),
      ...(snap.potential ? { potential: snap.potential } : {}),
    },
    status: snap.status,
    inactiveYears,
    demotedYear: snap.demotedYear,
    lastTeamId: snap.lastTeamId,
    ...(snap.lastActiveGrade != null ? { lastActiveGrade: snap.lastActiveGrade } : {}),
    ...(snap.shadowGrade != null ? { shadowGrade: snap.shadowGrade } : {}),
    ...(snap.academyTenureShift != null
      ? { academyTenureShift: snap.academyTenureShift }
      : {}),
  });
}

function teamRefFromInactive(
  identity: Map<string, SeasonHistoryTeamRef>,
  entries: SeasonHistoryEntry[],
  snap: { lastTeamId: string; lastTeamName?: string },
): SeasonHistoryTeamRef | null {
  // Prefer matching the archived teamId on any phase roster (stable franchise id).
  for (const e of entries) {
    for (const ph of e.phaseRosters ?? []) {
      for (const t of ph.teams) {
        if (t.teamId === snap.lastTeamId) {
          return refFor(identity, t.teamName, t.leagueId, t.logoUrl);
        }
      }
    }
  }
  if (snap.lastTeamName) {
    for (const ref of identity.values()) {
      if (ref.name === snap.lastTeamName) return ref;
    }
  }
  return null;
}

export function playerProfile(
  entries: SeasonHistoryEntry[],
  playerId: string,
  opts?: Pick<PlayerCareerStatusOpts, "liveInactive" | "liveRosterIds">,
): PlayerProfile | null {
  const identity = buildTeamIdentity(entries);
  const career = computePlayerCareers(entries).find((c) => c.playerId === playerId) ?? null;
  const ordered = [...completedEntries(entries)].sort((a, b) => b.archivedAt - a.archivedAt);
  const tenures: PlayerTenure[] = [];
  const intlTitles: Partial<Record<InternationalId, number>> = {};
  const intlFinalsReached: Partial<Record<InternationalId, number>> = {};
  const splitFinalsReached: SplitFinalsReachedMap = {};
  const byRegion = new Map<LeagueId, PlayerRegionTitles>();
  const creditRegion = (
    team: SeasonHistoryTeamRef,
    season: string,
    won: { split?: SplitId; event?: InternationalId },
  ) => {
    let row = byRegion.get(team.leagueId);
    if (!row) {
      row = {
        leagueId: team.leagueId,
        splits: {},
        splitTotal: 0,
        intl: {},
        intlTotal: 0,
        teams: [],
        seasons: [],
      };
      byRegion.set(team.leagueId, row);
    }
    if (won.split) {
      row.splits[won.split] = (row.splits[won.split] ?? 0) + 1;
      row.splitTotal += 1;
    }
    if (won.event) {
      row.intl[won.event] = (row.intl[won.event] ?? 0) + 1;
      row.intlTotal += 1;
    }
    if (!row.teams.some((t) => teamKey(t) === teamKey(team))) row.teams.push(team);
    if (!row.seasons.includes(season)) row.seasons.push(season);
  };
  let splitTitles = 0;
  let name = career?.playerName ?? "";
  let debutYear: number | undefined; // set from any snapshot carrying it (invariant)
  let inactiveLane: Lane | null = null;
  let inactiveTier: PlayerTier | null = null;
  for (const e of ordered) {
    // Walk stages in PLAY ORDER so within-year transfers read left→right.
    const phases = [...(e.phaseRosters ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex);
    const stints: PlayerStint[] = [];
    const titles = emptyTally();
    const windows: PlayerCareerWindow[] = [];
    for (const phase of phases) {
      const windowKey: CareerWindowKey | null =
        phase.kind === "split" ? (phase.split ?? null) : (phase.event ?? null);
      let me: { t: (typeof phase.teams)[number]; lane: Lane; tier: PlayerTier } | null = null;
      for (const t of phase.teams) {
        const found = t.players.find((p) => p.id === playerId);
        if (found) {
          me = { t, lane: found.lane, tier: found.tier };
          if (found.name) name = found.name;
          if (found.debutYear != null) debutYear = found.debutYear;
          break;
        }
      }
      if (!me) {
        // Off every main roster this window — the phase stamp says whether he
        // was in an academy or on the FA board. Nothing stamped (legacy
        // archive) means we genuinely don't know, so emit no row.
        const stamp = phase.inactive?.find((p) => p.playerId === playerId);
        if (stamp && windowKey) {
          const org =
            stamp.teamId != null
              ? teamRefFromInactive(identity, entries, {
                  lastTeamId: stamp.teamId,
                  ...(stamp.teamName ? { lastTeamName: stamp.teamName } : {}),
                })
              : null;
          const intlOutcome =
            phase.kind === "international" && phase.event && org
              ? teamIntlOutcome(e, org, phase.event)
              : undefined;
          windows.push({
            key: windowKey,
            label: careerWindowLabel(windowKey),
            kind: phase.kind,
            status: stamp.status,
            team: org,
            ...(intlOutcome ? { intlOutcome } : {}),
          });
        }
        continue;
      }
      const ref = refFor(identity, me.t.teamName, me.t.leagueId, me.t.logoUrl);
      const k = teamKey({ name: me.t.teamName, leagueId: me.t.leagueId });
      const last = stints[stints.length - 1];
      if (last && teamKey(last.team) === k) last.stages.push(phase.label);
      else stints.push({ team: ref, lane: me.lane, tier: me.tier, stages: [phase.label] });
      // Titles the player was actually rostered for at this stage.
      let wonHere: SplitId | InternationalId | undefined;
      if (phase.kind === "split" && phase.split && teamWonSplit(e, phase.split, { name: me.t.teamName, leagueId: me.t.leagueId }) && !titles.splits.includes(phase.split)) {
        titles.splits.push(phase.split);
        splitTitles++;
        wonHere = phase.split;
        creditRegion(ref, yearOf(e), { split: phase.split });
      }
      if (phase.kind === "international" && phase.event && teamWonIntl(e, phase.event, me.t.teamName) && !titles.intl.includes(phase.event)) {
        titles.intl.push(phase.event);
        intlTitles[phase.event] = (intlTitles[phase.event] ?? 0) + 1;
        wonHere = phase.event;
        creditRegion(ref, yearOf(e), { event: phase.event });
      }
      const splitPlacement =
        phase.kind === "split" && phase.split
          ? teamSplitPlacement(e, { name: me.t.teamName, leagueId: me.t.leagueId }, phase.split)
          : undefined;
      const intlOutcome =
        phase.kind === "international" && phase.event
          ? teamIntlOutcome(e, { name: me.t.teamName, leagueId: me.t.leagueId }, phase.event)
          : undefined;
      if (
        phase.kind === "international" &&
        phase.event &&
        reachedIntlFinal(intlOutcome?.placement ?? null)
      ) {
        intlFinalsReached[phase.event] = (intlFinalsReached[phase.event] ?? 0) + 1;
      }
      if (
        phase.kind === "split" &&
        phase.split &&
        reachedSplitFinal(splitPlacement ?? null)
      ) {
        bumpSplitFinalsReached(splitFinalsReached, phase.split, me.t.leagueId);
      }
      if (windowKey) {
        windows.push({
          key: windowKey,
          label: careerWindowLabel(windowKey),
          kind: phase.kind,
          status: "active",
          team: ref,
          lane: me.lane,
          tier: me.tier,
          ...(wonHere ? { title: wonHere } : {}),
          ...(splitPlacement != null ? { splitPlacement } : {}),
          ...(intlOutcome ? { intlOutcome } : {}),
        });
      }
    }

    // End-of-season lifecycle status (prefer inactive pool over roster).
    const asOf = playerCareerStatus(entries, playerId, {
      asOfSeasonId: e.id,
      preferInactive: true,
    });
    const snap = e.inactivePlayers?.find((p) => p.playerId === playerId);
    if (snap?.playerName) name = snap.playerName;
    if (snap) {
      inactiveLane = snap.lane;
      inactiveTier = snap.tier;
      if (snap.debutYear != null) debutYear = snap.debutYear;
    }
    const affiliate =
      snap != null ? teamRefFromInactive(identity, entries, snap) : null;
    // Emit a year row when they played OR spent the year in the inactive pool.
    if (stints.length > 0 || snap != null) {
      const status = asOf ?? { status: "active" as const };
      // The year closes on the offseason: how they END the year is exactly the
      // status the annual badge already reports, so reuse it as the last chip.
      if (windows.length > 0) {
        windows.push({
          key: "offseason",
          label: careerWindowLabel("offseason"),
          kind: "offseason",
          status: status.status,
          team:
            status.status === "active"
              ? (stints[stints.length - 1]?.team ?? null)
              : (affiliate ?? stints[stints.length - 1]?.team ?? null),
        });
      }
      tenures.push({
        season: yearOf(e),
        seasonId: e.id,
        archivedAt: e.archivedAt,
        stints,
        titles,
        ...(windows.length > 0 ? { windows } : {}),
        careerStatus: status.status,
        ...(status.inactiveYears != null ? { inactiveYears: status.inactiveYears } : {}),
        ...(status.academyYears != null ? { academyYears: status.academyYears } : {}),
        ...(status.freeAgentYears != null ? { freeAgentYears: status.freeAgentYears } : {}),
        ...(affiliate ? { affiliateTeam: affiliate } : {}),
      });
    }
  }
  // One retirement row is enough — drop newer years that only repeat Retired.
  const trimmedTenures = trimRetiredCareerTenures(tenures);
  // Per-season stat lines (age, All-Pro splits/season, champion pool), newest
  // first, from the archived per-season records.
  const seasons: PlayerSeasonStat[] = [];
  for (const e of ordered) {
    const r = e.playerCareers?.find((pc) => pc.playerId === playerId);
    if (!r) continue;
    seasons.push({
      season: yearOf(e),
      archivedAt: e.archivedAt,
      ...(r.age != null ? { age: r.age } : {}),
      allPro: r.allPro,
      allProSplit: r.allProSplit ?? 0,
      allProSeason: r.allProSeason ?? 0,
      intlMvpEvents: (e.intlMvps ?? [])
        .filter((m) => m.playerId === playerId)
        .map((m) => m.event),
      splitMvps: (e.splitMvps ?? [])
        .filter((m) => m.playerId === playerId)
        .map((m) => m.split),
      champs: r.champs ?? [],
    });
  }
  // Most-recent stint = last stint of the newest season (stages are play-order).
  const recent = trimmedTenures[0]?.stints.at(-1);
  const st =
    playerCareerStatuses(entries, opts).get(playerId) ?? { status: "active" as const };
  // Newest inactive snapshot for form / years-left storytelling (Hall, then live).
  let lastActiveGrade: number | null | undefined;
  let shadowGrade: number | null | undefined;
  let hallSnapshot: InactivePlayerSnapshot | undefined;
  for (const e of ordered) {
    const snap = e.inactivePlayers?.find((p) => p.playerId === playerId);
    if (snap) {
      hallSnapshot = snap;
      lastActiveGrade = snap.lastActiveGrade;
      shadowGrade = snap.shadowGrade;
      break;
    }
  }
  const liveSnap = opts?.liveInactive?.find((p) => p.playerId === playerId);
  const liveInactive =
    liveSnap != null && !opts?.liveRosterIds?.has(playerId) ? liveSnap : undefined;
  if (lastActiveGrade == null && shadowGrade == null && liveInactive) {
    lastActiveGrade = liveInactive.lastActiveGrade;
    shadowGrade = liveInactive.shadowGrade;
    if (liveInactive.playerName) name = liveInactive.playerName;
    inactiveLane = liveInactive.lane;
    inactiveTier = liveInactive.tier;
  }
  if (!career && trimmedTenures.length === 0 && !liveInactive) return null;
  if (!name) name = liveInactive?.playerName || playerId;
  const iy = st.inactiveYears ?? 0;
  // Personal tenure (value + academyTenureShift), not the soft league default:
  // a cold C leaves after 2, an A+ can stay 4.
  const newestSnapshot = liveInactive ?? hallSnapshot;
  const yearsLeftToFa =
    st.status === "academy"
      ? Math.max(0, academyTenureFromSnapshot(newestSnapshot, iy) - Math.max(1, iy))
      : undefined;
  const yearsLeftToRetire =
    st.status === "academy" || st.status === "free-agent"
      ? Math.max(0, TOTAL_INACTIVE_BEFORE_RETIRE - Math.max(1, iy))
      : undefined;
  return {
    id: playerId,
    name,
    lane: recent?.lane ?? inactiveLane,
    tier: recent?.tier ?? inactiveTier,
    ...(career?.age != null ? { age: career.age } : {}),
    ...(debutYear != null ? { debutYear } : {}),
    retired: st.status === "retired",
    careerStatus: st.status,
    ...(st.inactiveYears != null ? { inactiveYears: st.inactiveYears } : {}),
    ...(st.academyYears != null ? { academyYears: st.academyYears } : {}),
    ...(st.freeAgentYears != null ? { freeAgentYears: st.freeAgentYears } : {}),
    ...(lastActiveGrade != null ? { lastActiveGrade } : {}),
    ...(shadowGrade != null ? { shadowGrade } : {}),
    ...(yearsLeftToFa != null ? { yearsLeftToFa } : {}),
    ...(yearsLeftToRetire != null ? { yearsLeftToRetire } : {}),
    splitTitles,
    intlTitles,
    intlFinalsReached,
    splitFinalsReached,
    titlesByRegion: [...byRegion.values()].sort(
      (a, b) =>
        b.intlTotal + b.splitTotal - (a.intlTotal + a.splitTotal) ||
        b.intlTotal - a.intlTotal ||
        a.leagueId.localeCompare(b.leagueId),
    ),
    career,
    tenures: trimmedTenures,
    seasons,
  };
}

// ─── Team profile ────────────────────────────────────────────────────────────

export interface TeamStageRoster {
  label: string;
  kind: "split" | "international";
  coach?: string;
  roster: Array<{
    id?: string;
    name?: string;
    tier: PlayerTier;
    lane: Lane;
    age?: number;
    debutYear?: number;
    potential?: PlayerTier;
    goodChamps?: number[];
    badChamps?: number[];
  }>;
}

/** End-of-year academy affiliate for a team (from inactivePlayers snapshot). */
export interface TeamAcademySnapshot {
  playerId: string;
  playerName?: string;
  lane: Lane;
  tier: PlayerTier;
  age?: number;
  potential?: PlayerTier;
  goodChamps?: number[];
  badChamps?: number[];
  debutYear?: number;
  inactiveYears: number;
  academyYears: number;
}

export interface TeamSeasonLine {
  season: string;
  /** Archived season entry id — for point-in-time status on stage lineups. */
  seasonId: string;
  archivedAt: number;
  worlds: "champion" | "finalist" | null;
  intlTitles: InternationalId[];
  splitTitles: SplitId[];
  /** 1-based split finishes this season. */
  splitPlacements: Partial<Record<SplitId, number>>;
  /** International results this season. */
  intlOutcomes: Partial<Record<InternationalId, IntlOutcome>>;
  stages: TeamStageRoster[]; // every stage the team played, in play order
  /** Academy players parked with this org at year-end (flat list). */
  academy?: TeamAcademySnapshot[];
}

// A player in a team's Hall of Fame — ranked by how much of their career they
// spent here (distinct seasons, then total stage appearances).
export interface HallOfFamer {
  playerId?: string;
  name: string;
  lane: Lane;
  seasons: number; // distinct archived seasons played for this team
  stages: number; // total stage appearances (splits + internationals)
}

export interface TeamProfile {
  team: SeasonHistoryTeamRef;
  star: number | null; // most-recent roster star rating (1..5)
  record: TeamRecord | null;
  seasons: TeamSeasonLine[]; // newest first
  hallOfFame: HallOfFamer[]; // players who played the most for this team
}

export function teamProfile(entries: SeasonHistoryEntry[], key: string): TeamProfile | null {
  const identity = buildTeamIdentity(entries);
  const record = computeTeamRecords(entries).find((r) => r.key === key) ?? null;
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const [leagueId, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)] as [LeagueId, string];
  const team = { name, leagueId };
  const seasons: TeamSeasonLine[] = [];
  // Hall-of-Fame tally: how much of each player's career was spent on THIS team.
  const fame = new Map<string, { playerId?: string; name: string; lane: Lane; seasons: Set<string>; stages: number }>();
  for (const e of ordered) {
    const intlTitles = (Object.keys(e.intlChampions) as InternationalId[]).filter((ev) => teamWonIntl(e, ev, name));
    const splitTitles = (Object.keys(e.splitChampions) as SplitId[]).filter((s) => teamWonSplit(e, s, team));
    const splitPlacements: Partial<Record<SplitId, number>> = {};
    for (const split of ["winter", "spring", "summer"] as SplitId[]) {
      const p = teamSplitPlacement(e, team, split);
      if (p != null) splitPlacements[split] = p;
    }
    const intlOutcomes: Partial<Record<InternationalId, IntlOutcome>> = {};
    for (const event of INTERNATIONAL_DISPLAY_ORDER) {
      const hasEvent =
        (e.intlPlacements?.[event]?.length ?? 0) > 0 ||
        e.intlChampions[event] != null ||
        e.phaseRosters?.some(
          (p) => p.kind === "international" && p.event === event,
        );
      if (!hasEvent) continue;
      intlOutcomes[event] = teamIntlOutcome(e, team, event);
    }
    const worlds: TeamSeasonLine["worlds"] =
      e.champion?.name === name && e.champion?.leagueId === leagueId
        ? "champion"
        : e.runnerUp?.name === name && e.runnerUp?.leagueId === leagueId
          ? "finalist"
          : null;
    // EVERY stage roster this season for this team, in play order.
    const phases = [...(e.phaseRosters ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex);
    const stages: TeamStageRoster[] = [];
    let resolvedTeamId: string | undefined;
    for (const phase of phases) {
      const t = phase.teams.find((x) => x.teamName === name && x.leagueId === leagueId);
      if (!t) continue;
      if (!resolvedTeamId) resolvedTeamId = t.teamId;
      stages.push({
        label: phase.label,
        kind: phase.kind,
        ...(t.coach?.name ? { coach: t.coach.name } : {}),
        roster: t.players.map((p) => ({
          ...(p.id ? { id: p.id } : {}),
          ...(p.name ? { name: p.name } : {}),
          tier: p.tier,
          lane: p.lane,
          ...(p.age != null ? { age: p.age } : {}),
          ...(p.debutYear != null ? { debutYear: p.debutYear } : {}),
          ...(p.potential ? { potential: p.potential } : {}),
          ...(p.goodChamps?.length ? { goodChamps: [...p.goodChamps] } : {}),
          ...(p.badChamps?.length ? { badChamps: [...p.badChamps] } : {}),
        })),
      });
      // Tally each rostered player's tenure with this team. Key by stable id
      // when present, else name+lane (legacy rosters without ids).
      for (const p of t.players) {
        const k = p.id ?? `${p.name ?? ""}:${p.lane}`;
        let f = fame.get(k);
        if (!f) {
          f = { ...(p.id ? { playerId: p.id } : {}), name: p.name ?? "—", lane: p.lane, seasons: new Set(), stages: 0 };
          fame.set(k, f);
        }
        if (p.name) f.name = p.name;
        f.seasons.add(e.id);
        f.stages += 1;
      }
    }
    const academy: TeamAcademySnapshot[] = (e.inactivePlayers ?? [])
      .filter(
        (p) =>
          p.status === "academy" &&
          ((resolvedTeamId != null && p.lastTeamId === resolvedTeamId) ||
            p.lastTeamName === name),
      )
      .map((p) => ({
        playerId: p.playerId,
        ...(p.playerName ? { playerName: p.playerName } : {}),
        lane: p.lane,
        tier: p.tier,
        ...(p.age != null ? { age: p.age } : {}),
        ...(p.potential ? { potential: p.potential } : {}),
        ...(p.goodChamps?.length ? { goodChamps: [...p.goodChamps] } : {}),
        ...(p.badChamps?.length ? { badChamps: [...p.badChamps] } : {}),
        ...(p.debutYear != null ? { debutYear: p.debutYear } : {}),
        inactiveYears: p.inactiveYears,
        academyYears: yearsInAcademy("academy", p.inactiveYears),
      }));
    if (
      worlds ||
      intlTitles.length ||
      splitTitles.length ||
      stages.length ||
      Object.keys(splitPlacements).length > 0 ||
      Object.keys(intlOutcomes).length > 0
    ) {
      seasons.push({
        season: yearOf(e),
        seasonId: e.id,
        archivedAt: e.archivedAt,
        worlds,
        intlTitles,
        splitTitles,
        splitPlacements,
        intlOutcomes,
        stages,
        ...(academy.length > 0 ? { academy } : {}),
      });
    }
  }
  const teamRef = refFor(identity, name, leagueId);
  if (teamRef.iconKey === "shield" && teamRef.color === "" && seasons.length === 0 && !record) return null;
  // Most-recent roster star (newest season's last stage with a roster).
  const latestRoster = seasons.find((s) => s.stages.length > 0)?.stages.at(-1)?.roster ?? [];
  const star = latestRoster.length ? starOf(latestRoster) : null;
  const hallOfFame: HallOfFamer[] = [...fame.values()]
    .map((f) => ({ ...(f.playerId ? { playerId: f.playerId } : {}), name: f.name, lane: f.lane, seasons: f.seasons.size, stages: f.stages }))
    .sort((a, b) => b.seasons - a.seasons || b.stages - a.stages || a.name.localeCompare(b.name))
    .slice(0, 10);
  return { team: teamRef, star, record, seasons, hallOfFame };
}

// ─── Coach profile ───────────────────────────────────────────────────────────

export interface CoachTenure {
  season: string;
  archivedAt: number;
  team: SeasonHistoryTeamRef;
  rating: number;
  playstyle?: string; // drafting playstyle that season
  titles: TitleTally;
}

export interface CoachProfile {
  name: string;
  team: SeasonHistoryTeamRef | null; // most recent team, for a logo
  playstyle?: string; // most-recent drafting playstyle
  tenures: CoachTenure[]; // newest first
  splitTitles: number;
  intlTitles: Partial<Record<InternationalId, number>>; // by event
  intlFinalsReached: Partial<Record<InternationalId, number>>;
  splitFinalsReached: SplitFinalsReachedMap;
}

export function coachProfile(entries: SeasonHistoryEntry[], coachName: string): CoachProfile | null {
  const identity = buildTeamIdentity(entries);
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const tenures: CoachTenure[] = [];
  const intlTitles: Partial<Record<InternationalId, number>> = {};
  const intlFinalsReached: Partial<Record<InternationalId, number>> = {};
  const splitFinalsReached: SplitFinalsReachedMap = {};
  let splitTitles = 0;
  for (const e of ordered) {
    const phases = [...(e.phaseRosters ?? [])].sort((a, b) => b.phaseIndex - a.phaseIndex);
    let found: { ref: SeasonHistoryTeamRef; rating: number; playstyle?: string } | null = null;
    for (const phase of phases) {
      const t = phase.teams.find((x) => x.coach?.name === coachName);
      if (t) {
        found = {
          ref: refFor(identity, t.teamName, t.leagueId, t.logoUrl),
          rating: t.coach!.rating,
          ...(t.coach!.playstyle ? { playstyle: t.coach!.playstyle } : {}),
        };
        break;
      }
    }
    if (!found) continue;
    for (const phase of [...(e.phaseRosters ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex)) {
      const t = phase.teams.find((x) => x.coach?.name === coachName);
      if (!t) continue;
      const team = { name: t.teamName, leagueId: t.leagueId };
      if (phase.kind === "split" && phase.split) {
        const placement = teamSplitPlacement(e, team, phase.split);
        if (reachedSplitFinal(placement)) {
          bumpSplitFinalsReached(splitFinalsReached, phase.split, t.leagueId);
        }
      }
      if (phase.kind === "international" && phase.event) {
        const outcome = teamIntlOutcome(e, team, phase.event);
        if (reachedIntlFinal(outcome.placement)) {
          intlFinalsReached[phase.event] = (intlFinalsReached[phase.event] ?? 0) + 1;
        }
      }
    }
    const seasonTitles = teamSeasonTitles(e, { name: found.ref.name, leagueId: found.ref.leagueId });
    splitTitles += seasonTitles.splits.length;
    for (const ev of seasonTitles.intl) intlTitles[ev] = (intlTitles[ev] ?? 0) + 1;
    tenures.push({ season: yearOf(e), archivedAt: e.archivedAt, team: found.ref, rating: found.rating, ...(found.playstyle ? { playstyle: found.playstyle } : {}), titles: seasonTitles });
  }
  return tenures.length > 0
    ? {
        name: coachName,
        team: tenures[0].team,
        ...(tenures[0].playstyle ? { playstyle: tenures[0].playstyle } : {}),
        tenures,
        intlTitles,
        intlFinalsReached,
        splitFinalsReached,
        splitTitles,
      }
    : null;
}
