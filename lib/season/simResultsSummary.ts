// Lightweight snapshots of regional / international outcomes for live sim feeds.

import { seasonHasGlobalCup } from "./engine";
import { computeSeasonIntlMvps } from "./stats";
import type { PlayerAward } from "../awards";
import {
  INTERNATIONAL_DISPLAY_ORDER,
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  QUALIFYING_SPLIT,
  SPLIT_FEEDS_EVENT,
  SPLIT_LABELS,
  seasonTeam,
  type InternationalId,
  type LeagueId,
  type SeasonState,
  type PhaseRosterSnapshot,
  type SplitId,
} from "./types";
import type { RosterNewsEvent } from "./playerLifecycle";
import { transfersForDigestEvent } from "./transfers";
import type { Lane, PlayerTier } from "../types";

export interface SimResultTeamRef {
  id: string;
  name: string;
  leagueId: LeagueId;
  iconKey: string;
  logoUrl?: string;
  color: string;
}

/** Minimal per-player line stored in feed snapshots for hover cards. */
export interface SimRosterPlayer {
  lane: Lane;
  tier: PlayerTier;
  name?: string;
  id?: string;
}

/** Per-team roster at the moment a split/intl result was recorded. */
export type SimRosterSnapshots = Record<string, SimRosterPlayer[]>;

/**
 * One transfer summarised for the feed.
 * - Absent / undefined `kind`: bilateral team-to-team swap (star moves TO `toTeam`).
 * - `"callup"`: academy player promoted to main roster (`toTeam` = receiving team).
 * - `"fa-sign"`: free-agent signed onto main roster (`toTeam` = receiving team).
 * - `"retire"`: player retired from the game (`fromTeam` = last team; one-sided exit).
 * - `"demotion"`: player sent to academy by the followed team (`fromTeam` = team; one-sided exit).
 * - `"release"`: player released to free agency (academy or main roster; `fromTeam` = org; one-sided exit).
 * For callup/fa-sign, `fromTeam === toTeam` (internal org or FA pool); display
 * uses the source badge ("ACY" / "FA") instead of a second team logo.
 * For retire/demotion/release, `fromTeam === toTeam`; `swapName`/`swapTier` is the departing player.
 */
export interface SimRosterMoveSummary {
  kind?: "callup" | "fa-sign" | "retire" | "demotion" | "release";
  fromTeam: SimResultTeamRef;
  toTeam: SimResultTeamRef;
  lane: Lane;
  /** Departing player name, if known (swap: player leaving fromTeam; callup/fa-sign: displaced starter). */
  swapName?: string;
  /** Arriving star name, if known. */
  starName?: string;
  /** Stable id for hover / profile (departing player). */
  swapId?: string;
  /** Stable id for hover / profile (arriving player). */
  starId?: string;
  swapTier: PlayerTier;
  starTier: PlayerTier;
}

/** A head coach changing teams, summarised for the feed. */
export interface SimCoachMoveSummary {
  coachName: string;
  coachId?: string;
  rating: number;
  fromTeam: SimResultTeamRef;
  toTeam: SimResultTeamRef;
}

/** Feed entry for a transfer window (post-First Stand / post-MSI / post-Worlds offseason). */
export interface SimRosterMovesEntry {
  kind: "roster-moves";
  seasonId: string;
  year: number;
  afterEvent: InternationalId;
  /** "Post First Stand", "Post MSI", etc. */
  label: string;
  moves: SimRosterMoveSummary[];
  /** Head-coach moves (post-Worlds offseason only). */
  coaches?: SimCoachMoveSummary[];
  /**
   * When true, this entry covers the **pre-international** window: roster
   * moves that happened after the qualifying split ended but BEFORE the
   * international event started (mid-split demotion checkpoint). Distinct
   * from the normal post-international transfer window entries.
   */
  preIntl?: true;
}

export interface SimSplitLeagueResult {
  leagueId: LeagueId;
  placements: SimResultTeamRef[];
}

export interface SimSplitResultEntry {
  kind: "split";
  seasonId: string;
  year: number;
  split: SplitId;
  label: string;
  leagues: SimSplitLeagueResult[];
  /** Per-team roster captured for every placed team in this split. */
  rosterSnapshots?: SimRosterSnapshots;
}

export interface SimIntlResultEntry {
  kind: "intl";
  seasonId: string;
  year: number;
  event: InternationalId;
  label: string;
  placements: Array<SimResultTeamRef & { rank: number }>;
  /** Winner-team tournament MVP, frozen when the event concluded. */
  mvp?: PlayerAward;
  /** Per-team roster captured when this event concluded. */
  rosterSnapshots?: SimRosterSnapshots;
}

export interface SimFollowedTeamSummary {
  team: SimResultTeamRef;
  splits: Partial<Record<SplitId, number>>;
  intls: Partial<Record<InternationalId, number>>;
}

export interface SimYearResultEntry {
  kind: "year";
  seasonId: string;
  year: number;
  seasonName: string;
  splits: SimSplitResultEntry[];
  intls: SimIntlResultEntry[];
  worldsChampion: SimResultTeamRef | null;
  followedTeam: SimFollowedTeamSummary | null;
}

export type SimResultEntry =
  | SimSplitResultEntry
  | SimIntlResultEntry
  | SimYearResultEntry
  | SimRosterMovesEntry;

const SPLITS: SplitId[] = ["winter", "spring", "summer"];

/** Intl events with a mid-split demotion checkpoint (pre-intl roster moves). */
const PRE_INTL_EVENTS: InternationalId[] = ["first-stand", "msi", "worlds"];

/**
 * The `timeMark` value stamped on mid-split demotion news for each intl's
 * qualifying split. These events happen AFTER the split ends but BEFORE the
 * international starts — the "pre-intl" window.
 */
// Global Cup intentionally omitted: roster does not change Worlds → Global Cup,
// so Summer mid-split moves are Pre Worlds only (never Pre Global Cup).
const PRE_INTL_TIME_MARK: Partial<Record<InternationalId, string>> = {
  "first-stand": "Winter",
  msi: "Spring",
  worlds: "Summer",
};

function tryEmitPreIntlMoves(
  season: SeasonState,
  event: InternationalId,
  seen: Set<string>,
  fillsByWindow: Map<string, SeasonRosterNews[]>,
  exitsByWindow: Map<string, SeasonRosterNews[]>,
  out: SimResultEntry[],
): void {
  if (!PRE_INTL_TIME_MARK[event]) return;
  const preKey = `roster-moves:${season.id}:pre-${event}`;
  if (seen.has(preKey)) return;
  const preEntry = buildPreIntlMovesEntry(
    season,
    event,
    fillsByWindow,
    exitsByWindow,
  );
  if (preEntry) {
    seen.add(preKey);
    out.push(preEntry);
  }
}

function teamRef(
  season: SeasonState,
  teamId: string,
): SimResultTeamRef | null {
  const t = seasonTeam(season, teamId);
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    leagueId: t.leagueId,
    iconKey: t.iconKey,
    ...(t.logoUrl ? { logoUrl: t.logoUrl } : {}),
    color: t.color,
  };
}

/**
 * Snapshot minimal per-player data for the listed teams — used for hover cards
 * in the Live Results feed so you see who actually won that event, not today's roster.
 */
function buildRosterSnapshots(
  season: SeasonState,
  teamIds: readonly string[],
  scope: { split: SplitId } | { event: InternationalId },
): SimRosterSnapshots {
  const matches = (phase: { kind: string; split?: SplitId; event?: InternationalId }) =>
    "split" in scope
      ? phase.kind === "split" && phase.split === scope.split
      : phase.kind === "international" && phase.event === scope.event;
  const archived = season.phaseRosters?.find(matches);
  const phase = season.phases.find(matches);
  // Tournament entrants were fixed before play. They also recover snapshots
  // for older saves without phaseRosters; never substitute today's lineup.
  const entrants = new Map(
    (phase?.tournamentIds ?? []).flatMap((id) =>
      (season.tournaments[id]?.teams ?? []).map((team) => [team.id, team] as const),
    ),
  );
  const out: SimRosterSnapshots = {};
  for (const id of teamIds) {
    const players = archived?.teams.find((team) => team.teamId === id)?.players
      ?? entrants.get(id)?.players;
    if (!players?.length) continue;
    out[id] = players
      .filter((p) => p.lane)
      .map((p) => ({
        lane: p.lane,
        tier: p.tier,
        ...(p.name ? { name: p.name } : {}),
        ...(p.id ? { id: p.id } : {}),
      }));
  }
  return out;
}

/** Correct existing feed cards from retained phase archives without rewriting saves. */
export function restoreFeedRosters(
  entries: SimResultEntry[],
  sources: readonly { id: string; phaseRosters?: PhaseRosterSnapshot[] }[],
): SimResultEntry[] {
  const bySeason = new Map(sources.map(source => [source.id, source.phaseRosters]));
  const restore = (entry: SimResultEntry): SimResultEntry => {
    if (entry.kind === "roster-moves") return entry;
    if (entry.kind === "year") return {
      ...entry,
      splits: entry.splits.map(item => restore(item) as SimSplitResultEntry),
      intls: entry.intls.map(item => restore(item) as SimIntlResultEntry),
    };
    const phase = bySeason.get(entry.seasonId)?.find(snapshot =>
      entry.kind === "split"
        ? snapshot.kind === "split" && snapshot.split === entry.split
        : snapshot.kind === "international" && snapshot.event === entry.event,
    );
    if (!phase) return entry;
    const ids = entry.kind === "split"
      ? entry.leagues.flatMap(league => league.placements.map(team => team.id))
      : entry.placements.map(team => team.id);
    const participants = new Set(ids);
    const rosterSnapshots: SimRosterSnapshots = {};
    for (const team of phase.teams) {
      if (participants.has(team.teamId)) rosterSnapshots[team.teamId] = team.players.map(({ id, name, lane, tier }) => ({ id, name, lane, tier }));
    }
    return { ...entry, rosterSnapshots };
  };
  return entries.map(restore);
}

function splitComplete(season: SeasonState, split: SplitId): boolean {
  const byLeague = season.splitResults[split];
  if (!byLeague) return false;
  return LEAGUE_IDS.every((l) => (byLeague[l]?.length ?? 0) > 0);
}

export function buildSplitResultEntry(
  season: SeasonState,
  split: SplitId,
): SimSplitResultEntry {
  const byLeague = season.splitResults[split]!;
  const leagues: SimSplitLeagueResult[] = [];
  const snapshotIds: string[] = [];
  for (const leagueId of LEAGUE_IDS) {
    const ids = byLeague[leagueId] ?? [];
    const placements = ids
      .map((id) => teamRef(season, id))
      .filter((r): r is SimResultTeamRef => r != null);
    if (placements.length > 0) {
      leagues.push({ leagueId, placements });
      // Expanded league rows need the same historical roster as the podium.
      snapshotIds.push(...ids);
    }
  }
  const rosterSnapshots = buildRosterSnapshots(season, snapshotIds, { split });
  return {
    kind: "split",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    split,
    label: SPLIT_LABELS[split],
    leagues,
    ...(Object.keys(rosterSnapshots).length > 0 ? { rosterSnapshots } : {}),
  };
}

export function buildIntlResultEntry(
  season: SeasonState,
  event: InternationalId,
): SimIntlResultEntry {
  const ids = season.intlResults[event] ?? [];
  const placements = ids
    .map((id, i) => {
      const ref = teamRef(season, id);
      return ref ? { ...ref, rank: i + 1 } : null;
    })
    .filter((r): r is SimResultTeamRef & { rank: number } => r != null);
  // Snapshot all participating teams (≤24) so hover shows the winning roster.
  const rosterSnapshots = buildRosterSnapshots(season, ids, { event });
  const award = ids.length > 0
    ? computeSeasonIntlMvps(season, event).find((result) => result.event === event)?.mvp
    : undefined;
  // Never display a play-in winner or a runner-up as the event champion's MVP.
  const mvp = award?.teamId === ids[0] ? award : undefined;
  return {
    kind: "intl",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    event,
    label: INTERNATIONAL_LABELS[event],
    placements,
    ...(mvp ? { mvp: { ...mvp } } : {}),
    ...(Object.keys(rosterSnapshots).length > 0 ? { rosterSnapshots } : {}),
  };
}

function intlEventsForSeason(season: SeasonState): InternationalId[] {
  return INTERNATIONAL_DISPLAY_ORDER.filter((event) => {
    if (event === "global-cup" && !seasonHasGlobalCup(season)) return false;
    return true;
  });
}

function teamSplitRank(
  season: SeasonState,
  teamId: string,
  split: SplitId,
): number | undefined {
  const team = seasonTeam(season, teamId);
  if (!team) return undefined;
  const order = season.splitResults[split]?.[team.leagueId];
  if (!order?.length) return undefined;
  const idx = order.indexOf(teamId);
  return idx >= 0 ? idx + 1 : undefined;
}

function teamIntlRank(
  season: SeasonState,
  teamId: string,
  event: InternationalId,
): number | undefined {
  const order = season.intlResults[event];
  if (!order?.length) return undefined;
  const idx = order.indexOf(teamId);
  return idx >= 0 ? idx + 1 : undefined;
}

function buildFollowedTeamSummary(
  season: SeasonState,
): SimFollowedTeamSummary | null {
  const teamId = season.config.controlledTeamId;
  if (!teamId) return null;
  const ref = teamRef(season, teamId);
  if (!ref) return null;

  const splits: Partial<Record<SplitId, number>> = {};
  for (const split of SPLITS) {
    const rank = teamSplitRank(season, teamId, split);
    if (rank != null) splits[split] = rank;
  }

  const intls: Partial<Record<InternationalId, number>> = {};
  for (const event of intlEventsForSeason(season)) {
    const rank = teamIntlRank(season, teamId, event);
    if (rank != null) intls[event] = rank;
  }

  if (Object.keys(splits).length === 0 && Object.keys(intls).length === 0) {
    return null;
  }

  return { team: ref, splits, intls };
}

/**
 * True when a roster-news event represents an actual main-roster fill by an
 * academy or free-agent entrant — i.e. a notable promotion or signing worth
 * showing in the live feed. Excludes stash-to-academy, releases, retirements,
 * rookie parked in academy, and pending bench slots.
 */
function isMainRosterFill(n: RosterNewsEvent): boolean {
  const note = n.marketNote;
  if (
    note === "fa-academy" ||
    note === "academy-stash" ||
    note === "academy-rookie"
  )
    return false;
  if (
    note === "academy-release" ||
    note === "became-fa" ||
    note === "academy-bump" ||
    note === "retired"
  )
    return false;
  if (
    note === "manual-demote" ||
    note === "ai-demote" ||
    note === "agency-depart" ||
    note === "agency-leave"
  )
    return false;
  return n.entrantSource === "academy" || n.entrantSource === "free-agent";
}

/**
 * True when a roster-news event represents a notable player exit:
 * - `"retired"`: inactive-path clock expired, player left the game entirely.
 * - `"manual-demote"` / `"ai-demote"`: followed-team player sent to academy.
 * - releases to free agency (academy or main roster) — the Hall lists them,
 *   so the live feed must too.
 */
const RELEASE_NOTES = new Set(["academy-release", "became-fa", "academy-bump", "agency-leave"]);

function isExitEvent(n: RosterNewsEvent): boolean {
  const note = n.marketNote;
  return note === "retired" || note === "manual-demote" || note === "ai-demote" ||
    (note != null && RELEASE_NOTES.has(note));
}

function exitKind(n: RosterNewsEvent): "retire" | "demotion" | "release" {
  if (n.marketNote === "retired") return "retire";
  return n.marketNote && RELEASE_NOTES.has(n.marketNote) ? "release" : "demotion";
}

type SeasonRosterNews = RosterNewsEvent & { teamId: string };

/** Fills and exits indexed by transfer-window timeMark (one pass per season tick). */
function indexRosterNewsByWindow(rosterNews: SeasonRosterNews[] | undefined): {
  fills: Map<string, SeasonRosterNews[]>;
  exits: Map<string, SeasonRosterNews[]>;
} {
  const fills = new Map<string, SeasonRosterNews[]>();
  const exits = new Map<string, SeasonRosterNews[]>();
  for (const n of rosterNews ?? []) {
    if (!n.timeMark) continue;
    if (isMainRosterFill(n)) {
      const list = fills.get(n.timeMark) ?? [];
      list.push(n);
      fills.set(n.timeMark, list);
    } else if (isExitEvent(n)) {
      const list = exits.get(n.timeMark) ?? [];
      list.push(n);
      exits.set(n.timeMark, list);
    }
  }
  return { fills, exits };
}

/** Fills and exits of one window as feed rows, in the order they happened
 *  (a release followed by a signing must read release → signing). */
function pushNewsMoves(
  out: SimRosterMoveSummary[],
  season: SeasonState,
  fills: readonly SeasonRosterNews[],
  exits: readonly SeasonRosterNews[],
): void {
  const order = new Map((season.rosterNews ?? []).map((n, i) => [n, i]));
  const isFill = new Set<SeasonRosterNews>(fills);
  const news = [...fills, ...exits].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  for (const n of news) {
    const team = teamRef(season, n.teamId);
    if (!team) continue;
    if (isFill.has(n)) {
      out.push({
        kind: n.entrantSource === "academy" ? "callup" : "fa-sign",
        fromTeam: team,
        toTeam: team,
        lane: n.lane,
        ...(n.departedName ? { swapName: n.departedName } : {}),
        ...(n.departedId ? { swapId: n.departedId } : {}),
        swapTier: n.departedTier ?? n.entrantTier,
        starName: n.entrantName,
        ...(n.entrantId ? { starId: n.entrantId } : {}),
        starTier: n.entrantTier,
      });
    } else {
      out.push({
        kind: exitKind(n),
        fromTeam: team,
        toTeam: team,
        lane: n.lane,
        ...(n.departedName ? { swapName: n.departedName } : {}),
        ...(n.departedId ? { swapId: n.departedId } : {}),
        swapTier: n.departedTier ?? n.entrantTier,
        ...(n.entrantId ? { starId: n.entrantId } : {}),
        starTier: n.entrantTier,
      });
    }
  }
}

export function buildRosterMovesEntry(
  season: SeasonState,
  event: InternationalId,
  fillsByWindow?: Map<string, SeasonRosterNews[]>,
  exitsByWindow?: Map<string, SeasonRosterNews[]>,
): SimRosterMovesEntry | null {
  const out: SimRosterMoveSummary[] = [];

  // ── Bilateral team-to-team swaps ──────────────────────────────────────────
  // Stamp-aware (matches Transfer Window digest — not raw bucket keys).
  for (const m of transfersForDigestEvent(season, event)) {
    const from = teamRef(season, m.fromTeamId);
    const to = teamRef(season, m.toTeamId);
    if (!from || !to) continue;
    out.push({
      fromTeam: from,
      toTeam: to,
      lane: m.lane,
      ...(m.swap.name ? { swapName: m.swap.name } : {}),
      ...(m.star.name ? { starName: m.star.name } : {}),
      ...(m.swap.id ? { swapId: m.swap.id } : {}),
      ...(m.star.id ? { starId: m.star.id } : {}),
      swapTier: m.swap.tier,
      starTier: m.star.tier,
    });
  }

  // ── Academy call-ups and FA signings in this window ───────────────────────
  const windowMark = `${INTERNATIONAL_LABELS[event]} window`;
  const windowNews = fillsByWindow
    ? (fillsByWindow.get(windowMark) ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === windowMark && isMainRosterFill(n),
      );

  // ── Retirements, demotions and releases in this window ────────────────────
  const windowExits = exitsByWindow
    ? (exitsByWindow.get(windowMark) ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === windowMark && isExitEvent(n),
      );
  pushNewsMoves(out, season, windowNews, windowExits);

  if (out.length === 0) return null;
  return {
    kind: "roster-moves",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    afterEvent: event,
    label: `Post ${INTERNATIONAL_LABELS[event]}`,
    moves: out,
  };
}

/**
 * Human label for the pre-intl period. Shown in the live feed and feed cards.
 * e.g. "After Winter Split · Pre First Stand"
 */
export const PRE_INTL_LABEL: Partial<Record<InternationalId, string>> = {
  "first-stand": "After Winter Split · Pre First Stand",
  msi: "After Spring Split · Pre MSI",
  worlds: "After Summer Split · Pre Worlds",
};

/**
 * Build a roster-moves feed entry for the **pre-intl** window: fills and
 * exits that happened after the qualifying split ended but BEFORE the
 * international event started. These carry `timeMark: "Winter" / "Spring" /
 * "Summer"` in `rosterNews` (set by the mid-split demotion checkpoint).
 *
 * Only produces fills and exits — there are no bilateral team swaps in this
 * window (those all happen post-intl via `applyTransfers`). Returns null
 * when there is nothing to show.
 */
export function buildPreIntlMovesEntry(
  season: SeasonState,
  event: InternationalId,
  fillsByWindow?: Map<string, SeasonRosterNews[]>,
  exitsByWindow?: Map<string, SeasonRosterNews[]>,
): SimRosterMovesEntry | null {
  const preIntlMark = PRE_INTL_TIME_MARK[event];
  if (!preIntlMark) return null;

  const out: SimRosterMoveSummary[] = [];

  // Academy call-ups and FA signings from the mid-split demotion checkpoint.
  const preIntlFills = fillsByWindow
    ? (fillsByWindow.get(preIntlMark) ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === preIntlMark && isMainRosterFill(n),
      );

  // Retirements, demotions and releases from the mid-split checkpoint.
  const preIntlExits = exitsByWindow
    ? (exitsByWindow.get(preIntlMark) ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === preIntlMark && isExitEvent(n),
      );
  pushNewsMoves(out, season, preIntlFills, preIntlExits);

  if (out.length === 0) return null;

  const label = PRE_INTL_LABEL[event] ?? `After ${SPLIT_LABELS[QUALIFYING_SPLIT[event]]}`;
  return {
    kind: "roster-moves",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    afterEvent: event,
    label,
    moves: out,
    preIntl: true,
  };
}

export function buildYearResultEntry(
  season: SeasonState,
  prebuiltSplits?: SimSplitResultEntry[],
  prebuiltIntls?: SimIntlResultEntry[],
): SimYearResultEntry {
  const splits = prebuiltSplits ?? SPLITS.filter((s) => splitComplete(season, s)).map((s) =>
    buildSplitResultEntry(season, s),
  );
  const intls = prebuiltIntls ?? intlEventsForSeason(season)
    .filter((e) => (season.intlResults[e]?.length ?? 0) > 0)
    .map((e) => buildIntlResultEntry(season, e));
  const worldsId = season.intlResults.worlds?.[0] ?? season.champion;
  return {
    kind: "year",
    seasonId: season.id,
    year: season.franchise?.year ?? 1,
    seasonName: season.name,
    splits,
    intls,
    worldsChampion: worldsId ? teamRef(season, worldsId) : null,
    followedTeam: buildFollowedTeamSummary(season),
  };
}

/** How many recent franchise years keep split/intl detail in the live feed. */
export const SIM_RESULTS_FULL_DETAIL_YEARS = 3;

function isRosterMovesEntry(entry: SimResultEntry): entry is SimRosterMovesEntry {
  return entry.kind === "roster-moves";
}

/** Chronological ordering for feed entries within a year group (see SimResultsFeedPanel). */
export function feedEntryOrder(entry: SimResultEntry): number {
  switch (entry.kind) {
    case "split":
      switch (entry.split) {
        case "winter":
          return 10;
        case "spring":
          return 40;
        case "summer":
          return 70;
      }
      return 15;
    case "roster-moves":
      if (entry.preIntl) {
        switch (entry.afterEvent) {
          case "first-stand":
            return 20;
          case "msi":
            return 50;
          case "worlds":
            return 80;
          default:
            return 25;
        }
      }
      switch (entry.afterEvent) {
        case "first-stand":
          return 35;
        case "msi":
          return 65;
        case "worlds":
          return 90;
        default:
          return 95;
      }
    case "intl":
      switch (entry.event) {
        case "first-stand":
          return 30;
        case "msi":
          return 60;
        case "worlds":
          return 85;
        case "global-cup":
          return 92;
        default:
          return 88;
      }
    case "year":
      return 100;
    default:
      return 50;
  }
}

function sortYearEntries(entries: SimResultEntry[]): SimResultEntry[] {
  if (entries.length <= 1) return entries;
  for (let i = 1; i < entries.length; i++) {
    if (feedEntryOrder(entries[i - 1]!) > feedEntryOrder(entries[i]!)) {
      return [...entries].sort((a, b) => feedEntryOrder(a) - feedEntryOrder(b));
    }
  }
  return entries;
}

export type SimResultYearGroup = readonly [year: number, entries: SimResultEntry[]];

/**
 * Group feed entries by franchise year with stable chronological ordering.
 * When `showRosterMoves` is false, roster-moves cards are omitted.
 */
export function groupSimResultFeedEntries(
  entries: SimResultEntry[],
  showRosterMoves = true,
): SimResultYearGroup[] {
  const map = new Map<number, SimResultEntry[]>();
  for (const entry of entries) {
    if (!showRosterMoves && isRosterMovesEntry(entry)) continue;
    const list = map.get(entry.year) ?? [];
    list.push(entry);
    map.set(entry.year, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, yearEntries]) => [year, sortYearEntries(yearEntries)] as const);
}

/** Distinct franchise years represented in the feed (sorted ascending). */
export function simResultYears(entries: SimResultEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) years.add(e.year);
  return [...years].sort((a, b) => a - b);
}

/** True when a year is represented only by its season-complete summary. */
export function isYearSummarizedInFeed(
  entries: SimResultEntry[],
  year: number,
): boolean {
  let hasYear = false;
  let hasOther = false;
  for (const entry of entries) {
    if (entry.year !== year) continue;
    if (entry.kind === "year") hasYear = true;
    else hasOther = true;
  }
  return hasYear && !hasOther;
}

/** Count years stored as season-complete summaries only (older bulk-sim years). */
export function countSummarizedYears(entries: SimResultEntry[]): number {
  const byYear = new Map<number, { hasYear: boolean; hasOther: boolean }>();
  for (const entry of entries) {
    let row = byYear.get(entry.year);
    if (!row) {
      row = { hasYear: false, hasOther: false };
      byYear.set(entry.year, row);
    }
    if (entry.kind === "year") row.hasYear = true;
    else row.hasOther = true;
  }
  let count = 0;
  for (const row of byYear.values()) {
    if (row.hasYear && !row.hasOther) count++;
  }
  return count;
}

/**
 * Drop per-split / per-intl detail for older years so the in-memory feed
 * stays bounded during long bulk sims. Recent years keep full live detail.
 */
export function compressSimResultsFeed(
  entries: SimResultEntry[],
  fullDetailYears = SIM_RESULTS_FULL_DETAIL_YEARS,
): SimResultEntry[] {
  const years = simResultYears(entries);
  if (years.length <= fullDetailYears) return entries;

  const detailFromYear = years[years.length - fullDetailYears]!;
  const byYear = new Map<number, SimResultEntry[]>();
  for (const entry of entries) {
    const list = byYear.get(entry.year) ?? [];
    list.push(entry);
    byYear.set(entry.year, list);
  }

  const out: SimResultEntry[] = [];
  for (const year of years) {
    const yearEntries = byYear.get(year) ?? [];
    if (year < detailFromYear) {
      const summary = yearEntries.find((e) => e.kind === "year");
      if (summary) out.push(summary);
      continue;
    }
    out.push(...yearEntries);
  }
  if (out.length === entries.length && out.every((e, i) => e === entries[i])) {
    return entries;
  }
  return out;
}

export function simResultKey(entry: SimResultEntry): string {
  switch (entry.kind) {
    case "split":
      return `split:${entry.seasonId}:${entry.split}`;
    case "intl":
      return `intl:${entry.seasonId}:${entry.event}`;
    case "year":
      return `year:${entry.seasonId}`;
    case "roster-moves":
      return entry.preIntl
        ? `roster-moves:${entry.seasonId}:pre-${entry.afterEvent}`
        : `roster-moves:${entry.seasonId}:${entry.afterEvent}`;
  }
}

/**
 * Build a roster-moves feed entry for the post-Worlds offseason between years.
 * Covers bilateral swaps from `transfersByEvent.worlds` (prior-year carry when
 * `worldsOffseasonBaseline` is unset) PLUS academy call-ups and FA signings
 * tagged with `timeMark === "Offseason"` in `rosterNews`. Returns null when
 * there is nothing to show, or when this is year 1 (no prior Worlds).
 */
export function buildPostWorldsMovesEntry(
  season: SeasonState,
  fillsByWindow?: Map<string, SeasonRosterNews[]>,
  exitsByWindow?: Map<string, SeasonRosterNews[]>,
): SimRosterMovesEntry | null {
  const year = season.franchise?.year ?? 1;
  if (year <= 1) return null;
  // A defined worldsOffseasonBaseline (including zero) means the current year's offseason has already
  // opened — the worlds bucket now mixes prior-year carry AND new moves, so we
  // can no longer safely attribute everything to "prior year". At that point the
  // entry should already be in `seen` from an earlier call.
  if (season.status === "complete" || season.worldsOffseasonBaseline != null) return null;

  const out: SimRosterMoveSummary[] = [];

  // Bilateral swaps carried from the prior year's offseason market.
  // Only rows stamped `worlds` — FS/MSI leaks in the carry array stay out.
  for (const m of transfersForDigestEvent(season, "worlds")) {
    const from = teamRef(season, m.fromTeamId);
    const to = teamRef(season, m.toTeamId);
    if (!from || !to) continue;
    out.push({
      fromTeam: from,
      toTeam: to,
      lane: m.lane,
      ...(m.swap.name ? { swapName: m.swap.name } : {}),
      ...(m.star.name ? { starName: m.star.name } : {}),
      ...(m.swap.id ? { swapId: m.swap.id } : {}),
      ...(m.star.id ? { starId: m.star.id } : {}),
      swapTier: m.swap.tier,
      starTier: m.star.tier,
    });
  }

  // Academy call-ups and FA signings from the offseason lifecycle pass.
  const offseasonFills = fillsByWindow
    ? (fillsByWindow.get("Offseason") ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === "Offseason" && isMainRosterFill(n),
      );

  // Retirements, demotions and releases from the offseason lifecycle pass.
  const offseasonExits = exitsByWindow
    ? (exitsByWindow.get("Offseason") ?? [])
    : (season.rosterNews ?? []).filter(
        (n) => n.timeMark === "Offseason" && isExitEvent(n),
      );
  pushNewsMoves(out, season, offseasonFills, offseasonExits);

  const coaches: SimCoachMoveSummary[] = [];
  for (const m of season.offseasonCoachMoves ?? []) {
    const from = teamRef(season, m.fromTeamId);
    const to = teamRef(season, m.toTeamId);
    if (!from || !to) continue;
    coaches.push({ coachName: m.coachName, ...(m.coachId ? { coachId: m.coachId } : {}), rating: m.rating, fromTeam: from, toTeam: to });
  }

  if (out.length === 0 && coaches.length === 0) return null;
  return {
    kind: "roster-moves",
    seasonId: season.id,
    year: year - 1,
    afterEvent: "worlds",
    label: "Post Worlds",
    moves: out,
    ...(coaches.length > 0 ? { coaches } : {}),
  };
}

// In-season transfer windows (not the post-Worlds offseason, which spans two
// year states — handled separately by buildPostWorldsMovesEntry above).
// Global Cup has no transfer window — roster is frozen Worlds → Global Cup.
const INSEASON_TRANSFER_EVENTS: InternationalId[] = [
  "first-stand",
  "msi",
];

/**
 * Per-season cache of split/intl entries captured at event-completion time.
 * Pass alongside `seen` to `collectSimResultUpdates` so the Year ("Season
 * Complete") card uses the roster snapshot from each event, not the
 * post-transfer end-of-year lineup.
 */
export type SimResultEntryCache = Map<string, SimSplitResultEntry | SimIntlResultEntry>;

/** Collect new result snapshots not yet in `seen`. Mutates `seen` (and `entryCache` when provided). */
export function collectSimResultUpdates(
  season: SeasonState,
  seen: Set<string>,
  entryCache?: SimResultEntryCache,
): SimResultEntry[] {
  const out: SimResultEntry[] = [];

  const { fills: fillsByWindow, exits: exitsByWindow } =
    indexRosterNewsByWindow(season.rosterNews);

  // Post-Worlds offseason carry: emit once at the very start of a new franchise
  // year, attributed to the closing year (year N-1). Guarded by year > 1 and
  // worldsOffseasonBaseline is absent (this year's offseason has not opened yet).
  const postWorldsKey = `roster-moves:${season.id}:worlds`;
  if (!seen.has(postWorldsKey)) {
    const pwEntry = buildPostWorldsMovesEntry(season, fillsByWindow, exitsByWindow);
    if (pwEntry) {
      seen.add(postWorldsKey);
      out.push(pwEntry);
    }
  }

  for (const split of SPLITS) {
    if (!splitComplete(season, split)) continue;
    const key = `split:${season.id}:${split}`;
    if (seen.has(key)) continue;
    const entry = buildSplitResultEntry(season, split);
    // Cache immediately so the year entry can reuse this snapshot-correct version.
    entryCache?.set(key, entry);
    seen.add(key);
    out.push(entry);
    // Pre-intl roster moves (mid-split checkpoint) emit as soon as the split
    // finishes and rosterNews exists — not when the international completes.
    tryEmitPreIntlMoves(
      season,
      SPLIT_FEEDS_EVENT[split],
      seen,
      fillsByWindow,
      exitsByWindow,
      out,
    );
  }

  // Catch deferred demotions (winter/spring for followed teams): news may land
  // after Proceed, before the qualifying international finishes.
  for (const event of PRE_INTL_EVENTS) {
    tryEmitPreIntlMoves(
      season,
      event,
      seen,
      fillsByWindow,
      exitsByWindow,
      out,
    );
  }

  for (const event of intlEventsForSeason(season)) {
    if (!(season.intlResults[event]?.length ?? 0)) continue;

    const key = `intl:${season.id}:${event}`;
    if (seen.has(key)) continue;
    const entry = buildIntlResultEntry(season, event);
    entryCache?.set(key, entry);
    seen.add(key);
    out.push(entry);
  }

  // Emit roster-moves entries for completed in-season transfer windows.
  for (const event of INSEASON_TRANSFER_EVENTS) {
    const windowMark = `${INTERNATIONAL_LABELS[event]} window`;
    const hasSwaps = transfersForDigestEvent(season, event).length > 0;
    const hasFills = (fillsByWindow.get(windowMark)?.length ?? 0) > 0;
    const hasExits = (exitsByWindow.get(windowMark)?.length ?? 0) > 0;
    if (!hasSwaps && !hasFills && !hasExits) continue;
    const rKey = `roster-moves:${season.id}:${event}`;
    if (seen.has(rKey)) continue;
    const entry = buildRosterMovesEntry(season, event, fillsByWindow, exitsByWindow);
    if (entry) {
      seen.add(rKey);
      out.push(entry);
    }
  }

  if (season.status === "complete") {
    const yearKey = `year:${season.id}`;
    if (!seen.has(yearKey)) {
      // Prefer cached split/intl entries (roster captured at event time) over
      // rebuilding from current season state which may have post-transfer rosters.
      const cachedSplits = entryCache
        ? SPLITS
            .filter((s) => splitComplete(season, s))
            .map((s) => entryCache.get(`split:${season.id}:${s}`) as SimSplitResultEntry | undefined)
            .filter((e): e is SimSplitResultEntry => e != null)
        : undefined;
      const cachedIntls = entryCache
        ? intlEventsForSeason(season)
            .filter((e) => (season.intlResults[e]?.length ?? 0) > 0)
            .map((e) => entryCache.get(`intl:${season.id}:${e}`) as SimIntlResultEntry | undefined)
            .filter((e): e is SimIntlResultEntry => e != null)
        : undefined;
      const entry = buildYearResultEntry(season, cachedSplits, cachedIntls);
      seen.add(yearKey);
      out.push(entry);
    }
  }

  return out;
}
