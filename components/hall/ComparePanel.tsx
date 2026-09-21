"use client";
import {
type SeasonHistoryEntry,
type SeasonHistoryTeamRef
} from "@/lib/season/history";
import {
careerWinLoss,
comparePlayers,
compareTeams,
computePlayerCareers,
computePlayerTitlesByEvent,
computeTeamRecords,
headToHeadScopeLabel,
resolveCanonicalFranchiseKey,
teamRecordKey,
type PlayerCareerLine,
type TeamRecord
} from "@/lib/season/historyRecords";
import {
buildTeamIdentity,
formatGoldAdvAvg,
listTeams,
playerCareerStatuses,
refFor
} from "@/lib/season/historySearch";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import {
LEAGUE_IDS,
LEAGUE_NAMES,
type LeagueId
} from "@/lib/season/types";
import type { Lane } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import {
useDeferredValue,
useMemo,
useState
} from "react";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamLogoLink from "../team/TeamLogoLink";
import { HallPager } from "./RecordRows";
import { CareerStatus,CareerStatusBadge,DynastyBadge,LANES,NavFn,NavPlayerName,PlayerTeamIcon,TeamRef } from "./shared";

const COMPARE_PICK_PAGE = 20;

export const LANE_SHORT: Record<Lane, string> = {
  top: "TOP",
  jungle: "JNG",
  middle: "MID",
  bottom: "BOT",
  support: "SUP",
};

export function TeamComparePanel({
  entries,
  records,
  onNavigate,
}: {
  entries: SeasonHistoryEntry[];
  records: TeamRecord[];
  onNavigate?: NavFn;
}) {
  const [keyA, setKeyA] = useState("");
  const [keyB, setKeyB] = useState("");
  const [query, setQuery] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | null>(null);
  const [pageA, setPageA] = useState(0);
  const [pageB, setPageB] = useState(0);

  const teamOptions = useMemo(() => {
    const byKey = new Map<string, SeasonHistoryTeamRef>();
    const add = (key: string, team: SeasonHistoryTeamRef) => {
      const canon = resolveCanonicalFranchiseKey(
        entries,
        records,
        team.name,
        team.leagueId,
      );
      const existing = byKey.get(canon);
      if (!existing) byKey.set(canon, team);
      else if (!existing.logoUrl && team.logoUrl)
        byKey.set(canon, { ...existing, logoUrl: team.logoUrl });
    };
    for (const r of records) add(r.key, r.team);
    for (const e of entries) {
      for (const rv of e.rivalries ?? []) {
        add(teamRecordKey(rv.teamA), rv.teamA);
        add(teamRecordKey(rv.teamB), rv.teamB);
      }
      for (const rv of e.headToHead ?? []) {
        add(teamRecordKey(rv.teamA), rv.teamA);
        add(teamRecordKey(rv.teamB), rv.teamB);
      }
    }
    for (const t of listTeams(entries)) add(teamRecordKey(t), t);
    return [...byKey.entries()]
      .map(([key, team]) => ({ key, team }))
      .sort(
        (a, b) =>
          a.team.leagueId.localeCompare(b.team.leagueId) ||
          a.team.name.localeCompare(b.team.name),
      );
  }, [entries, records]);

  // Deferred so the input stays responsive while the (long) option list
  // re-filters at low priority.
  const q = useDeferredValue(query).normalize("NFKD").toLowerCase().trim();
  const filteredTeams = useMemo(
    () =>
      teamOptions.filter(
        (o) =>
          (!leagueFilter || o.team.leagueId === leagueFilter) &&
          (!q ||
            o.team.name.toLowerCase().includes(q) ||
            o.team.leagueId.toLowerCase().includes(q) ||
            (LEAGUE_NAMES[o.team.leagueId]?.toLowerCase().includes(q) ?? false)),
      ),
    [teamOptions, leagueFilter, q],
  );

  const teamFilterKey = `${leagueFilter ?? ""}|${q}`;
  const [previousTeamFilterKey, setPreviousTeamFilterKey] = useState(teamFilterKey);
  if (previousTeamFilterKey !== teamFilterKey) {
    setPreviousTeamFilterKey(teamFilterKey);
    setPageA(0);
    setPageB(0);
  }

  const compare = useMemo(
    () =>
      keyA && keyB && keyA !== keyB
        ? compareTeams(entries, records, keyA, keyB)
        : null,
    [entries, records, keyA, keyB],
  );

  const statRow = (
    label: string,
    a: string | number,
    b: string | number,
    hint?: string,
  ) => {
    const na = Number(a);
    const nb = Number(b);
    return (
      <div
        key={label}
        className="grid grid-cols-[1fr_auto_1fr] gap-2 px-3 py-1.5 text-[11px] items-center border-b border-rift-line/15 last:border-b-0"
      >
        <span
          className={`text-right tabular-nums ${na > nb ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright"}`}
        >
          {a}
        </span>
        <span
          className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 text-center min-w-[5.5rem]"
          title={hint}
        >
          {label}
        </span>
        <span
          className={`tabular-nums ${nb > na ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright"}`}
        >
          {b}
        </span>
      </div>
    );
  };

  const pickColumn = (
    label: string,
    value: string,
    onChange: (key: string) => void,
    disabledKey: string,
    page: number,
    setPage: (page: number) => void,
  ) => {
    const pageCount = Math.max(1, Math.ceil(filteredTeams.length / COMPARE_PICK_PAGE));
    const current = Math.min(page, pageCount - 1);
    const visible = filteredTeams.slice(
      current * COMPARE_PICK_PAGE,
      (current + 1) * COMPARE_PICK_PAGE,
    );
    return (
    <div className="min-w-0 flex-1 flex flex-col border border-rift-line/40 bg-rift-bg/30">
      <div className="px-2.5 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.25em] text-rift-gold/60">
        {label}
      </div>
      <div className="divide-y divide-rift-line/15">
        {filteredTeams.length === 0 ? (
          <p className="px-2.5 py-2 text-[10px] italic text-rift-muted">No matches.</p>
        ) : (
          visible.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={o.key === disabledKey}
              onClick={() => onChange(o.key)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 transition-colors cv-row disabled:opacity-35 disabled:cursor-not-allowed ${
                value === o.key
                  ? "bg-rift-gold/[0.08] border-l-2 border-l-rift-gold/70"
                  : "hover:bg-rift-bg/50 border-l-2 border-l-transparent"
              }`}
            >
              <TeamLogoLink
                name={o.team.name}
                leagueId={o.team.leagueId}
                iconKey={o.team.iconKey}
                logoUrl={resolveTeamLogo(o.team.name, o.team.logoUrl)}
                color={o.team.color}
                size={14}
                renderAs="span"
                hint={{
                  name: o.team.name,
                  leagueId: o.team.leagueId,
                  iconKey: o.team.iconKey,
                  logoUrl: o.team.logoUrl,
                  color: o.team.color,
                }}
              />
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block text-[11px] text-rift-mutedbright truncate">
                  {o.team.name}
                </span>
                <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] text-rift-muted/50">
                  <LeagueIcon league={o.team.leagueId} size={9} />
                  {o.team.leagueId}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <HallPager
        page={current}
        pageCount={pageCount}
        total={filteredTeams.length}
        pageSize={COMPARE_PICK_PAGE}
        label={`${label} pages`}
        previousLabel={`Previous ${label.toLowerCase()}`}
        nextLabel={`Next ${label.toLowerCase()}`}
        compact
        onChange={setPage}
      />
    </div>
    );
  };

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        Team Compare
      </div>
      <p className="text-[9px] italic text-rift-muted mb-2">
        Pick two franchises to compare all-time head-to-head (splits and
        internationals) plus trophy counts across every archived season.
      </p>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by team or region…"
        className="w-full mb-2 px-2.5 py-1.5 border border-rift-line/60 bg-rift-bg/40 text-[11px] text-rift-mutedbright placeholder:text-rift-muted/40 focus:border-rift-gold/50 focus:outline-none"
      />
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          type="button"
          onClick={() => setLeagueFilter(null)}
          className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
            leagueFilter == null
              ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
              : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
          }`}
        >
          All
        </button>
        {LEAGUE_IDS.map((lg) => (
          <button
            key={lg}
            type="button"
            onClick={() => setLeagueFilter(lg)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              leagueFilter === lg
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            <LeagueIcon league={lg} size={11} />
            {lg}
          </button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-3">
        {pickColumn("Team A", keyA, setKeyA, keyB, pageA, setPageA)}
        <div className="flex sm:flex-col items-center justify-center px-1 py-1 sm:py-0">
          <span className="text-[10px] uppercase tracking-[0.3em] text-rift-gold/60">
            vs
          </span>
        </div>
        {pickColumn("Team B", keyB, setKeyB, keyA, pageB, setPageB)}
      </div>

      {keyA && keyB && keyA === keyB ? (
        <p className="text-[10px] italic text-rift-muted">
          Choose two different franchises.
        </p>
      ) : compare ? (
        <div className="border border-rift-line/40 bg-rift-bg/30 overflow-hidden">
          {/* All-time head-to-head hero */}
          <div className="bg-gradient-to-b from-rift-gold/[0.07] via-rift-gold/[0.02] to-transparent px-3 py-4 border-b border-rift-line/30">
            <div className="text-[8px] uppercase tracking-[0.35em] text-rift-gold/70 text-center mb-3">
              All-Time Head-to-Head
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 flex-1 flex flex-col items-end gap-1 overflow-hidden">
                <TeamRef team={compare.teamA} size={15} onNavigate={onNavigate} />
                {compare.recordA?.dynasty.tier !== "none" && compare.recordA && (
                  <DynastyBadge tier={compare.recordA.dynasty.tier} />
                )}
              </span>
              {compare.h2h ? (
                <div className="shrink-0 text-center px-2">
                  <div className="font-display text-2xl text-rift-goldbright tabular-nums leading-none">
                    {compare.h2h.aWins}–{compare.h2h.bWins}
                  </div>
                  <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-rift-muted/75">
                    {compare.h2h.meetings} series
                  </div>
                </div>
              ) : (
                <div className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/70 shrink-0 px-2 text-center">
                  No meetings
                  <span className="block text-[8px] normal-case tracking-normal text-rift-muted/55 mt-0.5">
                    Trophy counts only
                  </span>
                </div>
              )}
              <span className="min-w-0 flex-1 flex flex-col items-start gap-1 overflow-hidden">
                <TeamRef team={compare.teamB} size={15} onNavigate={onNavigate} />
                {compare.recordB?.dynasty.tier !== "none" && compare.recordB && (
                  <DynastyBadge tier={compare.recordB.dynasty.tier} />
                )}
              </span>
            </div>
            {compare.h2h?.byScope && compare.h2h.byScope.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1">
                {compare.h2h.byScope.map((s) => (
                  <span
                    key={s.scope}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-rift-line/45 bg-rift-bg/50 text-[8px] uppercase tracking-[0.12em] text-rift-mutedbright"
                    title={`${headToHeadScopeLabel(s.scope)} — ${s.meetings} series`}
                  >
                    <span className="text-rift-muted/65">{headToHeadScopeLabel(s.scope)}</span>
                    <span className="text-rift-goldbright tabular-nums">
                      {s.aWins}–{s.bWins}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {compare.h2h && !compare.h2h.byScope?.length && (
              <p className="mt-2 text-center text-[8px] italic text-rift-muted/60">
                Per-stage breakdown appears after re-archiving seasons with full H2H data.
              </p>
            )}
          </div>

          {/* Per-season / franchise-year ledger */}
          {compare.h2h && compare.h2h.seasons.length > 0 && (
            <div className="border-b border-rift-line/25">
              <div className="px-3 py-1.5 border-b border-rift-line/20 text-[8px] uppercase tracking-[0.3em] text-rift-gold/65">
                By Season
              </div>
              <div className="divide-y divide-rift-line/12 max-h-48 overflow-y-auto">
                {[...compare.h2h.seasons]
                  .sort((a, b) => b.archivedAt - a.archivedAt)
                  .map((s) => (
                    <div
                      key={`${s.seasonName}-${s.archivedAt}`}
                      className="px-3 py-2 text-[10px]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-rift-mutedbright truncate block">
                            {s.seasonName}
                          </span>
                          {s.franchiseYear != null && (
                            <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/55">
                              Franchise Year {s.franchiseYear}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-display text-sm text-rift-goldbright tabular-nums">
                            {s.aWins}–{s.bWins}
                          </span>
                          <span className="block text-[8px] text-rift-muted/60 tabular-nums">
                            {s.meetings} series
                          </span>
                        </div>
                      </div>
                      {s.byScope && s.byScope.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {s.byScope.map((scope) => (
                            <span
                              key={scope.scope}
                              className="inline-flex items-center gap-1 px-1 py-px border border-rift-line/35 bg-rift-bg/40 text-[7px] uppercase tracking-[0.1em] text-rift-muted/80"
                            >
                              {headToHeadScopeLabel(scope.scope)}
                              <span className="text-rift-mutedbright tabular-nums">
                                {scope.aWins}–{scope.bWins}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Trophy & footprint comparison */}
          <div>
            <div className="px-3 py-1.5 border-b border-rift-line/20 text-[8px] uppercase tracking-[0.3em] text-rift-gold/65">
              Trophy Ledger
            </div>
            {statRow(
              "Total titles",
              compare.recordA?.totalTitles ?? 0,
              compare.recordB?.totalTitles ?? 0,
            )}
            {statRow(
              "Split titles",
              compare.recordA?.splitTitles ?? 0,
              compare.recordB?.splitTitles ?? 0,
            )}
            {statRow(
              "Intl titles",
              compare.recordA?.intlTotal ?? 0,
              compare.recordB?.intlTotal ?? 0,
            )}
            {statRow(
              "Worlds titles",
              compare.recordA?.worldsTitles ?? 0,
              compare.recordB?.worldsTitles ?? 0,
            )}
            {statRow(
              "Global Cups",
              compare.recordA?.intlTitles["global-cup"] ?? 0,
              compare.recordB?.intlTitles["global-cup"] ?? 0,
            )}
            {statRow(
              "Intl seasons",
              compare.intlAppearancesA,
              compare.intlAppearancesB,
              "Archived seasons with at least one international roster appearance (First Stand, MSI, Worlds, or Global Cup)",
            )}
            {statRow(
              "Worlds finals",
              compare.worldsFinalsA,
              compare.worldsFinalsB,
            )}
          </div>
        </div>
      ) : keyA && keyB ? (
        <p className="text-[10px] italic text-rift-muted">
          No archived data found for that pairing.
        </p>
      ) : null}
    </div>
  );
}

export function PlayerComparePanel({
  entries,
  careers,
  identity,
  careerStatus,
  onNavigate,
}: {
  entries: SeasonHistoryEntry[];
  careers: PlayerCareerLine[];
  identity: Map<string, SeasonHistoryTeamRef>;
  careerStatus: Map<string, { status: CareerStatus; academyYears?: number; freeAgentYears?: number; inactiveYears?: number }>;
  onNavigate?: NavFn;
}) {
  const champions = useDraftStore((s) => s.champions);
  const champById = useMemo(
    () => new Map(champions.map((ch) => [ch.id, ch])),
    [champions],
  );
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [query, setQuery] = useState("");
  const [laneFilter, setLaneFilter] = useState<Lane | null>(null);
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [pageA, setPageA] = useState(0);
  const [pageB, setPageB] = useState(0);

  const playerOptions = useMemo(
    () =>
      [...careers].sort(
        (a, b) =>
          a.playerName.localeCompare(b.playerName) ||
          a.playerId.localeCompare(b.playerId),
      ),
    [careers],
  );

  // Franchise chips — scoped to the selected region when one is set.
  // Prefer logo/icon chips (like league filters) over bare team-name text.
  const teamOptions = useMemo(() => {
    const byName = new Map<string, SeasonHistoryTeamRef>();
    for (const p of playerOptions) {
      if (!p.teamName || !p.leagueId) continue;
      if (leagueFilter && p.leagueId !== leagueFilter) continue;
      if (byName.has(p.teamName)) continue;
      byName.set(p.teamName, refFor(identity, p.teamName, p.leagueId));
    }
    return [...byName.entries()]
      .map(([name, team]) => ({ name, team }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [playerOptions, leagueFilter, identity]);

  if (teamFilter && !teamOptions.some(t => t.name === teamFilter)) setTeamFilter(null);

  // Deferred so the input stays responsive while the (long) option list
  // re-filters at low priority.
  const q = useDeferredValue(query).normalize("NFKD").toLowerCase().trim();
  const filteredPlayers = useMemo(
    () =>
      playerOptions.filter((p) => {
        if (laneFilter && (p.lane ?? null) !== laneFilter) return false;
        if (leagueFilter && p.leagueId !== leagueFilter) return false;
        if (teamFilter && p.teamName !== teamFilter) return false;
        if (!q) return true;
        return (
          p.playerName.toLowerCase().includes(q) ||
          (p.teamName?.toLowerCase().includes(q) ?? false) ||
          (p.leagueId?.toLowerCase().includes(q) ?? false) ||
          (p.leagueId
            ? (LEAGUE_NAMES[p.leagueId]?.toLowerCase().includes(q) ?? false)
            : false)
        );
      }),
    [playerOptions, laneFilter, leagueFilter, teamFilter, q],
  );
  const playerFilterKey = `${laneFilter ?? ""}|${leagueFilter ?? ""}|${teamFilter ?? ""}|${q}`;
  const [previousPlayerFilterKey, setPreviousPlayerFilterKey] = useState(playerFilterKey);
  if (previousPlayerFilterKey !== playerFilterKey) {
    setPreviousPlayerFilterKey(playerFilterKey);
    setPageA(0);
    setPageB(0);
  }

  const compare = useMemo(
    () =>
      idA && idB && idA !== idB
        ? comparePlayers(entries, careers, idA, idB)
        : null,
    [entries, careers, idA, idB],
  );
  const titlesByEvent = useMemo(
    () => computePlayerTitlesByEvent(entries),
    [entries],
  );

  const fmtRate = (n: number | null) =>
    n == null ? "—" : `${Math.round(n * 100)}%`;
  const fmtAvg = (sum: number, games: number) =>
    games > 0 ? (sum / games).toFixed(2) : "—";
  const fmtGd = (sum: number, games: number) =>
    games <= 0 ? "—" : formatGoldAdvAvg(sum / games);

  const statRow = (
    label: string,
    a: string | number,
    b: string | number,
    hint?: string,
  ) => {
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    const numeric = Number.isFinite(na) && Number.isFinite(nb);
    return (
      <div
        key={label}
        className="grid grid-cols-[1fr_auto_1fr] gap-2 px-3 py-1.5 text-[11px] items-center border-b border-rift-line/15 last:border-b-0"
      >
        <span
          className={`text-right tabular-nums ${
            numeric && na > nb
              ? "text-rift-goldbright font-semibold"
              : "text-rift-mutedbright"
          }`}
        >
          {a}
        </span>
        <span
          className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 text-center min-w-[5.5rem]"
          title={hint}
        >
          {label}
        </span>
        <span
          className={`tabular-nums ${
            numeric && nb > na
              ? "text-rift-goldbright font-semibold"
              : "text-rift-mutedbright"
          }`}
        >
          {b}
        </span>
      </div>
    );
  };

  const pickColumn = (
    label: string,
    value: string,
    onChange: (id: string) => void,
    disabledId: string,
    page: number,
    setPage: (page: number) => void,
  ) => {
    const pageCount = Math.max(1, Math.ceil(filteredPlayers.length / COMPARE_PICK_PAGE));
    const current = Math.min(page, pageCount - 1);
    const visible = filteredPlayers.slice(
      current * COMPARE_PICK_PAGE,
      (current + 1) * COMPARE_PICK_PAGE,
    );
    return (
    <div className="min-w-0 flex-1 flex flex-col border border-rift-line/40 bg-rift-bg/30">
      <div className="px-2.5 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.25em] text-rift-gold/60">
        {label}
      </div>
      <div className="divide-y divide-rift-line/15">
        {filteredPlayers.length === 0 ? (
          <p className="px-2.5 py-2 text-[10px] italic text-rift-muted">
            No matches.
          </p>
        ) : (
          visible.map((p) => (
            <button
              key={p.playerId}
              type="button"
              disabled={p.playerId === disabledId}
              onClick={() => onChange(p.playerId)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 transition-colors cv-row disabled:opacity-35 disabled:cursor-not-allowed ${
                value === p.playerId
                  ? "bg-rift-gold/[0.08] border-l-2 border-l-rift-gold/70"
                  : "hover:bg-rift-bg/50 border-l-2 border-l-transparent"
              }`}
            >
              {p.lane && (
                <LaneIcon lane={p.lane} size="xs" className="flex-shrink-0" />
              )}
              {p.teamName && (
                <PlayerTeamIcon
                  teamName={p.teamName}
                  leagueId={p.leagueId}
                  identity={identity}
                  size={13}
                  nested
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <PlayerNameLink
                    playerId={p.playerId}
                    name={p.playerName}
                    noNavigate
                    renderAs="span"
                    className="block text-[11px] text-rift-mutedbright truncate min-w-0"
                    title={p.playerName}
                  />
                  <CareerStatusBadge
                    status={careerStatus.get(p.playerId)?.status}
                    academyYears={careerStatus.get(p.playerId)?.academyYears}
                    freeAgentYears={careerStatus.get(p.playerId)?.freeAgentYears}
                    inactiveYears={careerStatus.get(p.playerId)?.inactiveYears}
                  />
                </span>
                <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] text-rift-muted/50 truncate min-w-0" title={p.teamName ? `${p.lane ? LANE_SHORT[p.lane] : "—"} · ${p.teamName}` : undefined}>
                  {p.leagueId && <LeagueIcon league={p.leagueId} size={9} />}
                  {p.lane ? LANE_SHORT[p.lane] : "—"}
                  {p.teamName ? ` · ${p.teamName}` : ""}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <HallPager
        page={current}
        pageCount={pageCount}
        total={filteredPlayers.length}
        pageSize={COMPARE_PICK_PAGE}
        label={`${label} pages`}
        previousLabel={`Previous ${label.toLowerCase()}`}
        nextLabel={`Next ${label.toLowerCase()}`}
        compact
        onChange={setPage}
      />
    </div>
    );
  };

  const playerHeader = (p: PlayerCareerLine) => (
    <span className="min-w-0 flex flex-col gap-1 items-center">
      <span className="inline-flex items-center gap-1.5 max-w-full">
        {p.lane && <LaneIcon lane={p.lane} size="xs" className="flex-shrink-0" />}
        {p.teamName && (
          <PlayerTeamIcon
            teamName={p.teamName}
            leagueId={p.leagueId}
            identity={identity}
            size={14}
            onNavigate={onNavigate}
          />
        )}
        <NavPlayerName
          name={p.playerName}
          playerId={p.playerId}
          onNavigate={onNavigate}
          className="text-[12px] font-medium text-rift-goldbright truncate"
        />
        <CareerStatusBadge
          status={careerStatus.get(p.playerId)?.status}
          academyYears={careerStatus.get(p.playerId)?.academyYears}
          freeAgentYears={careerStatus.get(p.playerId)?.freeAgentYears}
          inactiveYears={careerStatus.get(p.playerId)?.inactiveYears}
        />
      </span>
      <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/55">
        {p.lane ? LANE_SHORT[p.lane] : "—"}
        {p.leagueId ? ` · ${p.leagueId}` : ""}
        {p.seasons > 0 ? ` · ${p.seasons} season${p.seasons !== 1 ? "s" : ""}` : ""}
      </span>
    </span>
  );

  const topChamps = (p: PlayerCareerLine) => p.champs.slice(0, 4);

  const champCell = (p: PlayerCareerLine) => {
    const list = topChamps(p);
    if (list.length === 0)
      return <span className="text-[10px] italic text-rift-muted/60">—</span>;
    return (
      <div className="flex flex-wrap gap-1 justify-center">
        {list.map((cs) => {
          const champ = champById.get(cs.championId);
          return (
            <span
              key={cs.championId}
              className="inline-flex items-center gap-0.5 text-[9px] text-rift-mutedbright"
              title={`${champ?.name ?? `#${cs.championId}`} · ${cs.games}g`}
            >
              {champ?.iconUrl ? (
                 
                <img
                  src={champ.iconUrl}
                  alt=""
                  className="w-3.5 h-3.5 rounded-sm"
                />
              ) : null}
              <span className="tabular-nums text-rift-muted/60">{cs.games}</span>
            </span>
          );
        })}
      </div>
    );
  };

  if (careers.length === 0) {
    return (
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Player Compare
        </div>
        <p className="text-[10px] italic text-rift-muted">
          Player careers appear once seasons are archived with player ids —
          finish and archive a season to unlock face-to-face compare.
        </p>
      </div>
    );
  }

  const wlA = compare ? careerWinLoss(compare.playerA) : null;
  const wlB = compare ? careerWinLoss(compare.playerB) : null;

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        Player Compare
      </div>
      <p className="text-[9px] italic text-rift-muted mb-2">
        Pick two players for a career side-by-side. When both were rostered on
        opposing teams in stages those franchises met, series H2H is inferred
        from the archive (not match-level player stats).
      </p>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by player, team, or region…"
        className="w-full mb-2 px-2.5 py-1.5 border border-rift-line/60 bg-rift-bg/40 text-[11px] text-rift-mutedbright placeholder:text-rift-muted/40 focus:border-rift-gold/50 focus:outline-none"
      />
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          type="button"
          onClick={() => setLeagueFilter(null)}
          className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
            leagueFilter == null
              ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
              : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
          }`}
        >
          All
        </button>
        {LEAGUE_IDS.map((lg) => (
          <button
            key={lg}
            type="button"
            onClick={() => setLeagueFilter(lg)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              leagueFilter === lg
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            <LeagueIcon league={lg} size={11} />
            {lg}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          type="button"
          onClick={() => setLaneFilter(null)}
          className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
            laneFilter == null
              ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
              : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
          }`}
        >
          All roles
        </button>
        {LANES.map(({ lane, label }) => (
          <button
            key={lane}
            type="button"
            onClick={() => setLaneFilter(lane)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              laneFilter === lane
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            <LaneIcon lane={lane} size="xs" />
            {label}
          </button>
        ))}
      </div>
      {teamOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
          <button
            type="button"
            onClick={() => setTeamFilter(null)}
            className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              teamFilter == null
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            All teams
          </button>
          {teamOptions.map(({ name, team }) => (
            <button
              key={name}
              type="button"
              onClick={() => setTeamFilter(name)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 border transition-all ${
                teamFilter === name
                  ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                  : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
              }`}
              title={name}
              aria-label={name}
            >
              <TeamLogoLink
                name={team.name}
                leagueId={team.leagueId}
                iconKey={team.iconKey}
                logoUrl={resolveTeamLogo(team.name, team.logoUrl)}
                color={team.color}
                size={13}
                renderAs="span"
                hint={{
                  name: team.name,
                  leagueId: team.leagueId,
                  iconKey: team.iconKey,
                  logoUrl: team.logoUrl,
                  color: team.color,
                }}
              />
              <span className="text-[8px] uppercase tracking-[0.12em] truncate max-w-[5.5rem]">
                {name}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-3">
        {pickColumn("Player A", idA, setIdA, idB, pageA, setPageA)}
        <div className="flex sm:flex-col items-center justify-center px-1 py-1 sm:py-0">
          <span className="text-[10px] uppercase tracking-[0.3em] text-rift-gold/60">
            vs
          </span>
        </div>
        {pickColumn("Player B", idB, setIdB, idA, pageB, setPageB)}
      </div>

      {idA && idB && idA === idB ? (
        <p className="text-[10px] italic text-rift-muted">
          Choose two different players.
        </p>
      ) : compare ? (
        <div className="border border-rift-line/40 bg-rift-bg/30 overflow-hidden">
          <div className="bg-gradient-to-b from-rift-gold/[0.07] via-rift-gold/[0.02] to-transparent px-3 py-4 border-b border-rift-line/30">
            <div className="text-[8px] uppercase tracking-[0.35em] text-rift-gold/70 text-center mb-3">
              {compare.h2h ? "Inferred Head-to-Head" : "Career Face-Off"}
            </div>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 flex justify-end">
                {playerHeader(compare.playerA)}
              </span>
              {compare.h2h ? (
                <div className="shrink-0 text-center px-2">
                  <div className="font-display text-2xl text-rift-goldbright tabular-nums leading-none">
                    {compare.h2h.aWins}–{compare.h2h.bWins}
                  </div>
                  <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-rift-muted/75">
                    {compare.h2h.meetings} series
                  </div>
                </div>
              ) : (
                <div className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/70 shrink-0 px-2 text-center">
                  No meetings
                  <span className="block text-[8px] normal-case tracking-normal text-rift-muted/55 mt-0.5">
                    Career stats only
                  </span>
                </div>
              )}
              <span className="min-w-0 flex-1 flex justify-start">
                {playerHeader(compare.playerB)}
              </span>
            </div>
            {compare.h2h?.byScope && compare.h2h.byScope.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1">
                {compare.h2h.byScope.map((s) => (
                  <span
                    key={s.scope}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-rift-line/45 bg-rift-bg/50 text-[8px] uppercase tracking-[0.12em] text-rift-mutedbright"
                    title={`${headToHeadScopeLabel(s.scope)} — ${s.meetings} series`}
                  >
                    <span className="text-rift-muted/65">
                      {headToHeadScopeLabel(s.scope)}
                    </span>
                    <span className="text-rift-goldbright tabular-nums">
                      {s.aWins}–{s.bWins}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {compare.h2h && (
              <p className="mt-2 text-center text-[8px] italic text-rift-muted/60">
                Series counted when both players were rostered on opposing
                franchises in stages those teams met — not individual game
                matchups.
              </p>
            )}
          </div>

          {compare.h2h && compare.h2h.seasons.length > 0 && (
            <div className="border-b border-rift-line/25">
              <div className="px-3 py-1.5 border-b border-rift-line/20 text-[8px] uppercase tracking-[0.3em] text-rift-gold/65">
                By Season
              </div>
              <div className="divide-y divide-rift-line/12 max-h-40 overflow-y-auto">
                {[...compare.h2h.seasons]
                  .sort((a, b) => b.archivedAt - a.archivedAt)
                  .map((s) => (
                    <div
                      key={`${s.seasonName}-${s.archivedAt}`}
                      className="px-3 py-2 text-[10px] flex items-baseline justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-rift-mutedbright truncate block">
                          {s.seasonName}
                        </span>
                        {s.franchiseYear != null && (
                          <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/55">
                            Franchise Year {s.franchiseYear}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-display text-sm text-rift-goldbright tabular-nums">
                          {s.aWins}–{s.bWins}
                        </span>
                        <span className="block text-[8px] text-rift-muted/60 tabular-nums">
                          {s.meetings} series
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div>
            <div className="px-3 py-1.5 border-b border-rift-line/20 text-[8px] uppercase tracking-[0.3em] text-rift-gold/65">
              Career Ledger
            </div>
            {statRow("Games", compare.playerA.games, compare.playerB.games)}
            {statRow(
              "Win rate",
              fmtRate(wlA?.rate ?? null),
              fmtRate(wlB?.rate ?? null),
            )}
            {statRow("Kills", compare.playerA.kills, compare.playerB.kills)}
            {statRow("MVPs", compare.playerA.mvps, compare.playerB.mvps)}
            {statRow(
              "Split MVPs",
              compare.playerA.splitMvps,
              compare.playerB.splitMvps,
            )}
            {statRow(
              "Intl MVPs",
              compare.playerA.intlMvps,
              compare.playerB.intlMvps,
            )}
            {statRow("Total All-Pro Selections", compare.playerA.allProIncomplete ? "Unavailable" : compare.playerA.allPro, compare.playerB.allProIncomplete ? "Unavailable" : compare.playerB.allPro)}
            {statRow(
              "Split titles",
              compare.playerA.splitTitles,
              compare.playerB.splitTitles,
            )}
            {statRow(
              "Intl titles",
              compare.playerA.intlTitles,
              compare.playerB.intlTitles,
            )}
            {statRow(
              "Global Cups",
              titlesByEvent.get(compare.playerA.playerId)?.globalCup ?? 0,
              titlesByEvent.get(compare.playerB.playerId)?.globalCup ?? 0,
            )}
            {statRow(
              "Intl seasons",
              compare.playerA.intlAppearances,
              compare.playerB.intlAppearances,
              "Career international event appearances — each First Stand, MSI, Worlds, or Global Cup rostered counts once per season",
            )}
            {statRow(
              "Avg grade",
              fmtAvg(compare.playerA.ratingSum, compare.playerA.ratingGames),
              fmtAvg(compare.playerB.ratingSum, compare.playerB.ratingGames),
            )}
            {statRow(
              "Avg GD@15",
              fmtGd(compare.playerA.goldDiffSum, compare.playerA.goldDiffGames),
              fmtGd(compare.playerB.goldDiffSum, compare.playerB.goldDiffGames),
            )}
            {statRow(
              "Pentakills",
              compare.playerA.pentakills,
              compare.playerB.pentakills,
            )}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-3 py-2 text-[11px] items-center border-t border-rift-line/20">
              <div className="flex justify-end">{champCell(compare.playerA)}</div>
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 text-center min-w-[5.5rem]">
                Top champs
              </span>
              <div className="flex justify-start">{champCell(compare.playerB)}</div>
            </div>
          </div>
        </div>
      ) : idA && idB ? (
        <p className="text-[10px] italic text-rift-muted">
          No career data found for that pairing.
        </p>
      ) : null}
    </div>
  );
}

export function ComparePanel({
  entries,
  onNavigate,
  liveInactive,
  liveRosterIds,
}: {
  entries: SeasonHistoryEntry[];
  onNavigate?: NavFn;
  liveInactive?: import("@/lib/season/playerLifecycle").InactivePlayerSnapshot[];
  liveRosterIds?: ReadonlySet<string>;
}) {
  const teamIdentity = useMemo(() => buildTeamIdentity(entries), [entries]);
  const records = useMemo(() => computeTeamRecords(entries), [entries]);
  const careers = useMemo(() => computePlayerCareers(entries), [entries]);
  const careerStatus = useMemo(
    () =>
      playerCareerStatuses(
        entries,
        liveInactive
          ? {
              liveInactive,
              ...(liveRosterIds ? { liveRosterIds } : {}),
            }
          : undefined,
      ),
    [entries, liveInactive, liveRosterIds],
  );

  return (
    <>
      <div className="cv-section">
        <TeamComparePanel entries={entries} records={records} onNavigate={onNavigate} />
      </div>
      <div className="cv-section">
        <PlayerComparePanel
          entries={entries}
          careers={careers}
          identity={teamIdentity}
          careerStatus={careerStatus}
          onNavigate={onNavigate}
        />
      </div>
    </>
  );
}
