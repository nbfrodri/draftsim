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
} from "./types";
import {
  computePlayerCareers,
  computeTeamRecords,
  type PlayerCareerLine,
  type TeamRecord,
} from "./historyRecords";
import type { PlayerChampStat } from "./stats";

const teamKey = (t: { name: string; leagueId: LeagueId }) => `${t.leagueId}:${t.name}`;
function yearOf(entry: SeasonHistoryEntry): string {
  // The season name already carries the year/franchise label.
  return entry.name;
}

// The richest archived identity (color/icon/logo) for each team, from the refs
// that carry full identity (champions, finalists, best-team). Newest wins. Used
// to give player/coach tenure refs proper logos instead of bare shields.
function buildTeamIdentity(entries: SeasonHistoryEntry[]): Map<string, SeasonHistoryTeamRef> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const byKey = new Map<string, SeasonHistoryTeamRef>();
  const add = (t: SeasonHistoryTeamRef | null | undefined) => {
    if (t && !byKey.has(teamKey(t))) byKey.set(teamKey(t), t);
  };
  for (const e of ordered) {
    add(e.champion);
    add(e.runnerUp);
    for (const ref of Object.values(e.intlChampions)) add(ref);
    for (const byLeague of Object.values(e.splitChampions)) for (const ref of Object.values(byLeague)) add(ref);
    for (const best of Object.values(e.leagueBestTeams ?? {})) add(best?.team);
  }
  return byKey;
}

// A team ref with the best identity we have, falling back to a bare ref.
function refFor(
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
  retired: boolean; // no longer on a roster in the latest archived season
}

// Players who appeared in an earlier archived season but are absent from the
// latest roster-bearing one — i.e. they've stopped playing (retired/aged out).
// Needs ≥2 archived seasons to call anyone retired (a single season has no
// "later" roster to be missing from). Pure over the archive — realities carry
// rosters across years, so this is meaningful there; one-off season Halls
// rarely reuse player ids, so few (if any) get flagged.
function retiredPlayerIds(entries: SeasonHistoryEntry[]): Set<string> {
  const withRosters = entries.filter((e) => (e.phaseRosters?.length ?? 0) > 0);
  if (withRosters.length < 2) return new Set();
  const latest = withRosters.reduce((a, b) => (b.archivedAt > a.archivedAt ? b : a));
  const active = new Set<string>();
  for (const ph of latest.phaseRosters ?? [])
    for (const t of ph.teams) for (const p of t.players) if (p.id) active.add(p.id);
  const retired = new Set<string>();
  for (const e of withRosters) {
    if (e.id === latest.id) continue;
    for (const ph of e.phaseRosters ?? [])
      for (const t of ph.teams)
        for (const p of t.players) if (p.id && !active.has(p.id)) retired.add(p.id);
  }
  return retired;
}

// Each player's most-recent lane + tier + team, from the newest roster appearance.
function playerMeta(
  entries: SeasonHistoryEntry[],
): Map<string, { lane: Lane; tier: PlayerTier; teamName: string; leagueId: LeagueId; logoUrl?: string }> {
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const out = new Map<string, { lane: Lane; tier: PlayerTier; teamName: string; leagueId: LeagueId; logoUrl?: string }>();
  for (const e of ordered) {
    for (const phase of [...(e.phaseRosters ?? [])].sort((a, b) => b.phaseIndex - a.phaseIndex)) {
      for (const t of phase.teams)
        for (const p of t.players)
          if (p.id && !out.has(p.id))
            out.set(p.id, { lane: p.lane, tier: p.tier, teamName: t.teamName, leagueId: t.leagueId, ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}) });
    }
  }
  return out;
}

/** Every player who appears in any archived career, newest identity first. */
export function listPlayers(entries: SeasonHistoryEntry[]): PlayerHit[] {
  const identity = buildTeamIdentity(entries);
  const meta = playerMeta(entries);
  const retired = retiredPlayerIds(entries);
  return computePlayerCareers(entries)
    .map((c) => {
      const m = meta.get(c.playerId);
      return {
        id: c.playerId,
        name: c.playerName,
        leagueId: m?.leagueId ?? c.leagueId,
        team: m ? refFor(identity, m.teamName, m.leagueId, m.logoUrl) : null,
        lane: m?.lane ?? null,
        tier: m?.tier ?? null,
        retired: retired.has(c.playerId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
}

/** Every distinct coach, with their latest rating + team. */
export function listCoachesRich(entries: SeasonHistoryEntry[]): CoachHit[] {
  const identity = buildTeamIdentity(entries);
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
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

export interface PlayerTenure {
  season: string;
  archivedAt: number;
  stints: PlayerStint[]; // ≥1; more than one = transferred mid-year
  titles: TitleTally; // titles won while rostered for that stage
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
  retired: boolean; // absent from the latest archived season's rosters
  splitTitles: number;
  intlTitles: Partial<Record<InternationalId, number>>; // by event
  career: PlayerCareerLine | null;
  tenures: PlayerTenure[]; // newest first
  seasons: PlayerSeasonStat[]; // newest first, only seasons with recorded stats
}

export function playerProfile(entries: SeasonHistoryEntry[], playerId: string): PlayerProfile | null {
  const identity = buildTeamIdentity(entries);
  const career = computePlayerCareers(entries).find((c) => c.playerId === playerId) ?? null;
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const tenures: PlayerTenure[] = [];
  const intlTitles: Partial<Record<InternationalId, number>> = {};
  let splitTitles = 0;
  let name = career?.playerName ?? "";
  for (const e of ordered) {
    // Walk stages in PLAY ORDER so within-year transfers read left→right.
    const phases = [...(e.phaseRosters ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex);
    const stints: PlayerStint[] = [];
    const titles = emptyTally();
    for (const phase of phases) {
      let me: { t: (typeof phase.teams)[number]; lane: Lane; tier: PlayerTier } | null = null;
      for (const t of phase.teams) {
        const found = t.players.find((p) => p.id === playerId);
        if (found) {
          me = { t, lane: found.lane, tier: found.tier };
          if (found.name) name = found.name;
          break;
        }
      }
      if (!me) continue;
      const k = teamKey({ name: me.t.teamName, leagueId: me.t.leagueId });
      const last = stints[stints.length - 1];
      if (last && teamKey(last.team) === k) last.stages.push(phase.label);
      else stints.push({ team: refFor(identity, me.t.teamName, me.t.leagueId, me.t.logoUrl), lane: me.lane, tier: me.tier, stages: [phase.label] });
      // Titles the player was actually rostered for at this stage.
      if (phase.kind === "split" && phase.split && teamWonSplit(e, phase.split, { name: me.t.teamName, leagueId: me.t.leagueId }) && !titles.splits.includes(phase.split)) {
        titles.splits.push(phase.split);
        splitTitles++;
      }
      if (phase.kind === "international" && phase.event && teamWonIntl(e, phase.event, me.t.teamName) && !titles.intl.includes(phase.event)) {
        titles.intl.push(phase.event);
        intlTitles[phase.event] = (intlTitles[phase.event] ?? 0) + 1;
      }
    }
    if (stints.length) tenures.push({ season: yearOf(e), archivedAt: e.archivedAt, stints, titles });
  }
  if (!career && tenures.length === 0) return null;
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
  const recent = tenures[0]?.stints.at(-1);
  return {
    id: playerId,
    name,
    lane: recent?.lane ?? null,
    tier: recent?.tier ?? null,
    ...(career?.age != null ? { age: career.age } : {}),
    retired: retiredPlayerIds(entries).has(playerId),
    splitTitles,
    intlTitles,
    career,
    tenures,
    seasons,
  };
}

// ─── Team profile ────────────────────────────────────────────────────────────

export interface TeamStageRoster {
  label: string;
  kind: "split" | "international";
  coach?: string;
  roster: Array<{ name?: string; tier: PlayerTier; lane: Lane }>;
}

export interface TeamSeasonLine {
  season: string;
  archivedAt: number;
  worlds: "champion" | "finalist" | null;
  intlTitles: InternationalId[];
  splitTitles: SplitId[];
  stages: TeamStageRoster[]; // every stage the team played, in play order
}

export interface TeamProfile {
  team: SeasonHistoryTeamRef;
  star: number | null; // most-recent roster star rating (1..5)
  record: TeamRecord | null;
  seasons: TeamSeasonLine[]; // newest first
}

export function teamProfile(entries: SeasonHistoryEntry[], key: string): TeamProfile | null {
  const identity = buildTeamIdentity(entries);
  const record = computeTeamRecords(entries).find((r) => r.key === key) ?? null;
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const [leagueId, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)] as [LeagueId, string];
  const team = { name, leagueId };
  const seasons: TeamSeasonLine[] = [];
  for (const e of ordered) {
    const intlTitles = (Object.keys(e.intlChampions) as InternationalId[]).filter((ev) => teamWonIntl(e, ev, name));
    const splitTitles = (Object.keys(e.splitChampions) as SplitId[]).filter((s) => teamWonSplit(e, s, team));
    const worlds: TeamSeasonLine["worlds"] =
      e.champion?.name === name && e.champion?.leagueId === leagueId
        ? "champion"
        : e.runnerUp?.name === name && e.runnerUp?.leagueId === leagueId
          ? "finalist"
          : null;
    // EVERY stage roster this season for this team, in play order.
    const phases = [...(e.phaseRosters ?? [])].sort((a, b) => a.phaseIndex - b.phaseIndex);
    const stages: TeamStageRoster[] = [];
    for (const phase of phases) {
      const t = phase.teams.find((x) => x.teamName === name && x.leagueId === leagueId);
      if (!t) continue;
      stages.push({
        label: phase.label,
        kind: phase.kind,
        ...(t.coach?.name ? { coach: t.coach.name } : {}),
        roster: t.players.map((p) => ({ ...(p.name ? { name: p.name } : {}), tier: p.tier, lane: p.lane })),
      });
    }
    if (worlds || intlTitles.length || splitTitles.length || stages.length) {
      seasons.push({ season: yearOf(e), archivedAt: e.archivedAt, worlds, intlTitles, splitTitles, stages });
    }
  }
  const teamRef = refFor(identity, name, leagueId);
  if (teamRef.iconKey === "shield" && teamRef.color === "" && seasons.length === 0 && !record) return null;
  // Most-recent roster star (newest season's last stage with a roster).
  const latestRoster = seasons.find((s) => s.stages.length > 0)?.stages.at(-1)?.roster ?? [];
  const star = latestRoster.length ? starOf(latestRoster) : null;
  return { team: teamRef, star, record, seasons };
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
}

export function coachProfile(entries: SeasonHistoryEntry[], coachName: string): CoachProfile | null {
  const identity = buildTeamIdentity(entries);
  const ordered = [...entries].sort((a, b) => b.archivedAt - a.archivedAt);
  const tenures: CoachTenure[] = [];
  const intlTitles: Partial<Record<InternationalId, number>> = {};
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
        splitTitles,
      }
    : null;
}
