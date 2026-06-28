"use client";

import { useMemo, useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  diffMetaOverrides,
  goldenRoadTeam,
  type HistoryTransfer,
  type SeasonHistoryEntry,
  type SeasonHistoryTeamRef,
  type SeasonHistoryAllProTeam,
  type SeasonHistoryAllProMember,
  type SeasonHistoryIntlMvp,
  type SeasonHistorySplitMvp,
} from "@/lib/season/history";
import {
  exportAllSeasonsXlsx,
  exportSeasonXlsx,
} from "@/lib/season/historyExport";
import { parseHistoryWorkbook } from "@/lib/season/historyImport";
import {
  computeTeamRecords,
  splitWinnersByRegion,
  bestTeamPerRegion,
  computeRegionStrength,
  computeTitleStreaks,
  computePlayerAllTime,
  computePlayerCareers,
  DYNASTY_WINDOW,
  type TeamRecord,
  type DynastyTier,
  type PlayerCareerLine,
} from "@/lib/season/historyRecords";
import { logoForTeamName } from "@/lib/season/realTeams";
import { isDesktop, openBinaryFileNative } from "@/lib/desktopStorage";
import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "@/lib/championMeta";
import type { Champion, Lane, PlayerTier } from "@/lib/types";
import type { PlayerChampStat } from "@/lib/season/stats";
import { LANE_ORDER } from "@/lib/players";
import {
  listPlayers,
  listTeams,
  listCoachesRich,
  teamStars,
  playerProfile,
  teamProfile,
  coachProfile,
} from "@/lib/season/historySearch";
import {
  INTERNATIONAL_LABELS,
  LEAGUE_IDS,
  LEAGUE_NAMES,
  SPLIT_LABELS,
  type InternationalId,
  type LeagueId,
  type SplitId,
} from "@/lib/season/types";
import TeamIcon from "./TeamIcon";
import LeagueIcon from "./LeagueIcon";
import LaneIcon from "./LaneIcon";
import Modal from "./Modal";
import SeasonStoryCard from "./SeasonStoryCard";
import { CopyMetaCodeButton, MetaDriftChips } from "./MetaSnapshots";

// Season History — a full-screen Hall of Seasons. Left: the timeline of
// archived seasons (each card headlined by its Worlds champion). Right:
// the selected season's résumé — champion def. finalist, international
// title holders, the split-champions board — and its meta story: the
// starting and final tier tables side by side (per lane) plus the drift
// between them.

const INTL_ORDER: readonly InternationalId[] = ["first-stand", "msi", "worlds"];
const SPLIT_ORDER: readonly SplitId[] = ["winter", "spring", "summer"];
const LANES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

// Tier pill styling, gold-to-dim with tier strength.
const TIER_CLS: Record<MetaTier, string> = {
  "S+": "border-rift-gold bg-rift-gold/20 text-rift-goldbright",
  S: "border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright",
  A: "border-rift-blue/50 bg-rift-blue/10 text-rift-bluebright",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-rift-line/60 text-rift-mutedbright/70",
  D: "border-rift-line/40 text-rift-muted",
};

function TeamRef({
  team,
  size = 13,
  muted = false,
}: {
  team: SeasonHistoryTeamRef;
  size?: number;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <TeamIcon
        iconKey={team.iconKey}
        logoUrl={team.logoUrl ?? logoForTeamName(team.name)}
        size={size}
        color={team.color}
      />
      <span
        className={`truncate ${muted ? "text-rift-mutedbright" : "text-rift-goldbright"}`}
      >
        {team.name}
      </span>
      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] text-rift-muted/70 flex-shrink-0">
        <LeagueIcon league={team.leagueId} size={12} />
        {team.leagueId}
      </span>
    </span>
  );
}

// Effective tier of a champion-lane under an archived override (the
// override entry wins; baseline CHAMPION_META otherwise).
function effectiveTier(
  override: MetaOverride | null,
  alias: string,
  lane: Lane,
): MetaTier | null {
  return (
    override?.[alias]?.[lane] ?? CHAMPION_META[alias]?.metaTiers?.[lane] ?? null
  );
}

// One snapshot's tier table for a single lane: a row per tier with the
// champions in it. `changes` (final table only) marks risers ▲ / fallers ▼.
function LaneTierTable({
  title,
  override,
  lane,
  nameByAlias,
  changes,
}: {
  title: string;
  override: MetaOverride | null;
  lane: Lane;
  nameByAlias: Map<string, string>;
  changes?: Map<string, { from: MetaTier; to: MetaTier }>;
}) {
  const buckets = useMemo(() => {
    const out = new Map<MetaTier, { alias: string; name: string }[]>();
    for (const tier of TIER_ORDER) out.set(tier, []);
    const aliases = new Set<string>([
      ...Object.keys(CHAMPION_META),
      ...Object.keys(override ?? {}),
    ]);
    for (const alias of aliases) {
      const tier = effectiveTier(override, alias, lane);
      if (!tier) continue;
      out.get(tier)!.push({ alias, name: nameByAlias.get(alias) ?? alias });
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [override, lane, nameByAlias]);
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 min-w-0">
      <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
        {title}
      </div>
      <div className="divide-y divide-rift-line/15">
        {TIER_ORDER.map((tier) => {
          const champs = buckets.get(tier)!;
          if (champs.length === 0) return null;
          return (
            <div key={tier} className="flex items-start gap-2 px-3 py-1.5">
              <span
                className={`inline-flex items-center justify-center w-7 px-1 py-px border text-[10px] font-semibold flex-shrink-0 ${TIER_CLS[tier]}`}
              >
                {tier}
              </span>
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] leading-relaxed min-w-0">
                {champs.map(({ alias, name }) => {
                  const change = changes?.get(alias);
                  const rose =
                    change &&
                    TIER_ORDER.indexOf(change.to) <
                      TIER_ORDER.indexOf(change.from);
                  return (
                    <span
                      key={alias}
                      className={
                        change
                          ? rose
                            ? "text-rift-goldbright"
                            : "text-rift-bluebright"
                          : "text-rift-mutedbright"
                      }
                      title={
                        change
                          ? `${name}: ${change.from} → ${change.to} over the season`
                          : undefined
                      }
                    >
                      {name}
                      {change && (
                        <span aria-hidden className="text-[8px] align-super">
                          {rose ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The selected season's meta story: copy codes, drift chips, and the
// per-lane side-by-side starting/final tier tables.
function MetaStory({ entry }: { entry: SeasonHistoryEntry }) {
  const champions = useDraftStore((s) => s.champions);
  const [lane, setLane] = useState<Lane>("middle");
  const nameByAlias = useMemo(
    () => new Map(champions.map((c) => [c.alias, c.name])),
    [champions],
  );
  const hasInitial = entry.initialMetaOverride !== undefined;
  // Per-lane change markers for the final table.
  const laneChanges = useMemo(() => {
    if (!hasInitial) return undefined;
    const map = new Map<string, { from: MetaTier; to: MetaTier }>();
    for (const s of diffMetaOverrides(
      entry.initialMetaOverride ?? null,
      entry.finalMetaOverride ?? null,
    )) {
      if (s.lane === lane) map.set(s.alias, { from: s.from, to: s.to });
    }
    return map;
  }, [hasInitial, entry.initialMetaOverride, entry.finalMetaOverride, lane]);

  if (entry.finalMetaOverride === undefined) {
    return (
      <p className="text-[10px] italic text-rift-muted">
        This season was archived before meta snapshots existed — re-archive
        it from a save to capture its tier tables.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CopyMetaCodeButton
          label="Starting Meta"
          override={entry.initialMetaOverride}
        />
        <CopyMetaCodeButton
          label="Final Meta"
          override={entry.finalMetaOverride}
        />
      </div>
      <MetaDriftChips
        initial={entry.initialMetaOverride}
        final={entry.finalMetaOverride}
      />
      {/* Lane tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {LANES.map(({ lane: l, label }) => (
          <button
            key={l}
            type="button"
            onClick={() => setLane(l)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.25em] transition-all ${
              lane === l
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={`grid gap-3 ${hasInitial ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}
      >
        {hasInitial && (
          <LaneTierTable
            title="Starting Meta"
            override={entry.initialMetaOverride ?? null}
            lane={lane}
            nameByAlias={nameByAlias}
          />
        )}
        <LaneTierTable
          title={hasInitial ? "Final Meta (shifted)" : "Final Meta"}
          override={entry.finalMetaOverride ?? null}
          lane={lane}
          nameByAlias={nameByAlias}
          changes={laneChanges}
        />
      </div>
      {!hasInitial && (
        <p className="text-[10px] italic text-rift-muted">
          Starting meta unknown for this archive — only the final table is
          available.
        </p>
      )}
    </div>
  );
}

// The roster the international champion fielded at that event, pulled from the
// archived phase snapshot (matched by team name) and lane-ordered. null when
// the snapshot doesn't cover the event (older saves).
function intlChampRoster(entry: SeasonHistoryEntry, event: InternationalId) {
  const champ = entry.intlChampions[event];
  if (!champ) return null;
  const phase = (entry.phaseRosters ?? []).find(
    (p) => p.kind === "international" && p.event === event,
  );
  const team = phase?.teams.find((t) => t.teamName === champ.name && t.leagueId === champ.leagueId);
  if (!team) return null;
  return {
    players: [...team.players].sort(
      (a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane),
    ),
    coach: team.coach?.name,
  };
}

// The split champion's roster (lane-ordered) + coach for a region, from the
// archived phase snapshot. null when the snapshot doesn't cover it.
function splitChampRoster(entry: SeasonHistoryEntry, split: SplitId, league: LeagueId) {
  const champ = entry.splitChampions[split]?.[league];
  if (!champ) return null;
  const phase = (entry.phaseRosters ?? []).find((p) => p.kind === "split" && p.split === split);
  const team = phase?.teams.find((t) => t.teamName === champ.name && t.leagueId === league);
  if (!team) return null;
  return {
    players: [...team.players].sort((a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane)),
    coach: team.coach?.name,
  };
}

// One season's full résumé panel.
function SeasonDetail({ entry }: { entry: SeasonHistoryEntry }) {
  const intls = INTL_ORDER.filter((e) => entry.intlChampions[e]);
  const splits = SPLIT_ORDER.filter((s) => entry.splitChampions[s]);
  return (
    <div className="space-y-5 min-w-0">
      {/* Headline banner */}
      <div className="border-2 border-rift-gold/60 bg-rift-gold/[0.07] px-4 py-4">
        <div className="text-[9px] uppercase tracking-[0.5em] text-rift-gold/80 mb-1.5">
          {entry.complete ? "World Champion" : "Season Unfinished"}
        </div>
        {entry.champion ? (
          <div className="flex items-center gap-2.5 flex-wrap text-base md:text-xl font-display tracking-[0.1em]">
            <span aria-hidden>🏆</span>
            <TeamRef team={entry.champion} size={22} />
            {entry.runnerUp && (
              <>
                <span className="text-rift-muted/70 text-[10px] uppercase tracking-[0.25em]">
                  def.
                </span>
                <TeamRef team={entry.runnerUp} size={16} muted />
              </>
            )}
          </div>
        ) : (
          <div className="text-[11px] italic text-rift-muted">
            No champion recorded
          </div>
        )}
        {goldenRoadTeam(entry) && (
          <div className="mt-2 inline-block border border-rift-goldbright/70 bg-rift-goldbright/10 px-2.5 py-1">
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-goldbright">
              ★ Golden Road — swept all six titles
            </span>
          </div>
        )}
      </div>

      {/* International title holders — with the winning roster that lifted it */}
      {intls.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
            International Champions
          </div>
          <div className="space-y-2">
            {intls.map((event) => {
              const roster = intlChampRoster(entry, event);
              return (
                <div key={event} className="border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px] flex-wrap">
                    <LeagueIcon league={event} size={14} />
                    <span className="text-rift-muted/80">{INTERNATIONAL_LABELS[event]}:</span>
                    <TeamRef team={entry.intlChampions[event]!} size={12} />
                    {entry.intlRunnersUp?.[event] && (
                      <>
                        <span className="text-rift-muted/50 text-[9px] uppercase tracking-[0.2em]">def.</span>
                        <TeamRef team={entry.intlRunnersUp[event]!} size={11} muted />
                      </>
                    )}
                    {roster?.coach && (
                      <span className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/70">
                        coach {roster.coach}
                      </span>
                    )}
                  </div>
                  {roster && roster.players.length > 0 && (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                      {roster.players.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[9px]">
                          <LaneIcon lane={p.lane} size="xs" />
                          <span className={`px-1 border font-display text-[8px] ${STAGE_TIER_CLS[p.tier] ?? ""}`}>
                            {p.tier}
                          </span>
                          <span className="text-rift-mutedbright truncate max-w-[80px]">{p.name ?? "—"}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Split champions board */}
      {splits.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
            Split Champions
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2">
            {splits.map((split) => (
              <div key={split} className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2">
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
                  {SPLIT_LABELS[split]}
                </div>
                <div className="space-y-0.5">
                  {LEAGUE_IDS.map((league) => {
                    const team = entry.splitChampions[split]?.[league];
                    if (!team) return null;
                    const ru = entry.splitRunnersUp?.[split]?.[league];
                    return (
                      <div
                        key={league}
                        className="flex items-center gap-1.5 text-[10px]"
                      >
                        <span className="w-10 text-rift-muted/70 uppercase text-[8px] tracking-[0.2em] flex-shrink-0">
                          {league}
                        </span>
                        <TeamIcon
                          iconKey={team.iconKey}
                          logoUrl={team.logoUrl ?? logoForTeamName(team.name)}
                          size={11}
                          color={team.color}
                        />
                        <span className="truncate text-rift-mutedbright">
                          {team.name}
                        </span>
                        {ru && (
                          <span className="inline-flex items-center gap-1 text-rift-muted/50 truncate">
                            <span className="text-[8px] uppercase tracking-[0.15em]">def.</span>
                            <TeamIcon iconKey={ru.iconKey} logoUrl={ru.logoUrl ?? logoForTeamName(ru.name)} size={9} color={ru.color} />
                            <span className="truncate">{ru.name}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* International event MVPs — a player from each event's champion team */}
      {entry.intlMvps && entry.intlMvps.length > 0 && (
        <IntlMvpsPanel mvps={entry.intlMvps} />
      )}

      {/* Split MVPs — a player from each split champion, per league */}
      {entry.splitMvps && entry.splitMvps.length > 0 && (
        <SplitMvpsPanel mvps={entry.splitMvps} />
      )}

      {/* All-Pro teams — season of the year, per-split global, per-league */}
      {entry.allProTeams && entry.allProTeams.length > 0 && (
        <AllProTeamsPanel entry={entry} />
      )}

      {/* Narrative story recap (archived seasons that carry one). */}
      {entry.story && (
        <SeasonStoryCard story={entry.story} title="Story of the Season" />
      )}

      {/* Stage rosters — who played each split / international */}
      {entry.phaseRosters && entry.phaseRosters.length > 0 && (
        <StageRosters entry={entry} />
      )}

      {/* Transfer log — every roster move of the year, recap-able forever */}
      {entry.transfers && entry.transfers.length > 0 && (
        <TransferLog transfers={entry.transfers} />
      )}

      {/* Meta story */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          The Meta · Start → Finish
        </div>
        <MetaStory entry={entry} />
      </div>
    </div>
  );
}

// ─── All-Pro teams ───────────────────────────────────────────────────────────
// One All-Pro team's five members, on a single wrapping row.
function AllProMembers({ members }: { members: SeasonHistoryAllProMember[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {members.map((m, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[9px]">
          <LaneIcon lane={m.lane} size="xs" />
          <TeamIcon
            iconKey={m.team.iconKey}
            logoUrl={m.team.logoUrl ?? logoForTeamName(m.team.name)}
            size={11}
            color={m.team.color}
          />
          <span className="text-rift-mutedbright truncate max-w-[90px]">
            {m.playerName ?? m.team.name}
          </span>
          <span className="text-rift-gold/70 tabular-nums" title={`${m.games} games`}>
            ★{m.avgRating.toFixed(1)}
          </span>
        </span>
      ))}
    </div>
  );
}

// Season-of-the-year team, each split's global team, and every league's
// per-split team — all derived from per-game performance ratings.
function AllProTeamsPanel({ entry }: { entry: SeasonHistoryEntry }) {
  const teams = entry.allProTeams ?? [];
  const season = teams.find((t) => t.scope === "season-global");
  const splitGlobal = (split: SplitId) =>
    teams.find((t) => t.scope === "split-global" && t.split === split);
  const splitLeague = (split: SplitId) =>
    teams
      .filter((t) => t.scope === "split-league" && t.split === split)
      .sort((a, b) => (a.leagueId ?? "").localeCompare(b.leagueId ?? ""));
  const splits = SPLIT_ORDER.filter(
    (s) => splitGlobal(s) || splitLeague(s).length > 0,
  );
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        All-Pro Teams
      </div>
      {season && (
        <div className="border-2 border-rift-gold/50 bg-rift-gold/[0.06] px-3 py-2 mb-2">
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-goldbright mb-1">
            ★ All-Pro Team of the Year
          </div>
          <AllProMembers members={season.members} />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2">
        {splits.map((split) => {
          const global = splitGlobal(split);
          const leagues = splitLeague(split);
          return (
            <div key={split} className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
                {SPLIT_LABELS[split]}
              </div>
              {global && (
                <div className="mb-1.5">
                  <div className="text-[7px] uppercase tracking-[0.25em] text-rift-mutedbright/60 mb-0.5">
                    Global
                  </div>
                  <AllProMembers members={global.members} />
                </div>
              )}
              {leagues.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-[7px] uppercase tracking-[0.25em] text-rift-blue/70 hover:text-rift-bluebright">
                    Per-league ({leagues.length})
                  </summary>
                  <div className="space-y-1 mt-1">
                    {leagues.map((t, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-1 text-[7px] uppercase tracking-[0.2em] text-rift-muted/60">
                          {t.leagueId && <LeagueIcon league={t.leagueId} size={11} />}
                          {t.leagueId ? LEAGUE_NAMES[t.leagueId] : "—"}
                        </div>
                        <AllProMembers members={t.members} />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// International event MVPs — the finals MVP (a player from the champion team)
// of each international, in event order.
function IntlMvpsPanel({ mvps }: { mvps: SeasonHistoryIntlMvp[] }) {
  const ordered = INTL_ORDER.map((ev) => mvps.find((m) => m.event === ev)).filter(
    (m): m is SeasonHistoryIntlMvp => !!m,
  );
  if (ordered.length === 0) return null;
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        International Event MVPs
      </div>
      <div className="space-y-1">
        {ordered.map((m) => (
          <div
            key={m.event}
            className="flex flex-wrap items-center gap-1.5 border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5 text-[10px]"
          >
            <LeagueIcon league={m.event} size={14} />
            <span className="text-rift-muted/80">{INTERNATIONAL_LABELS[m.event]}:</span>
            <LaneIcon lane={m.lane} size="xs" />
            <TeamRef team={m.team} size={12} />
            <span className="font-display tracking-wide text-rift-goldbright">
              {m.playerName ?? `${m.team.name} ${m.lane}`}
            </span>
            <span className="ml-auto text-rift-gold/70 tabular-nums" title={`${m.games} games in the final`}>
              ★{m.avgRating.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Split MVPs — the finals MVP (a player from the split champion) of each
// domestic split, grouped by split then league.
function SplitMvpsPanel({ mvps }: { mvps: SeasonHistorySplitMvp[] }) {
  const splits = SPLIT_ORDER.filter((s) => mvps.some((m) => m.split === s));
  if (splits.length === 0) return null;
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        Split MVPs
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2">
        {splits.map((split) => (
          <div key={split} className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
              {SPLIT_LABELS[split]}
            </div>
            <div className="space-y-0.5">
              {mvps
                .filter((m) => m.split === split)
                .sort((a, b) => a.leagueId.localeCompare(b.leagueId))
                .map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <LeagueIcon league={m.leagueId} size={11} />
                    <LaneIcon lane={m.lane} size="xs" />
                    <span className="text-rift-goldbright truncate">
                      {m.playerName ?? `${m.team.name} ${m.lane}`}
                    </span>
                    <TeamIcon
                      iconKey={m.team.iconKey}
                      logoUrl={m.team.logoUrl ?? logoForTeamName(m.team.name)}
                      size={10}
                      color={m.team.color}
                    />
                    <span className="ml-auto text-rift-gold/70 tabular-nums" title={`${m.games} games in the final`}>
                      ★{m.avgRating.toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Browse every team's roster at any split / international of the year, with the
// stage's champion flagged. Rosters shift between stages via transfer windows,
// so each stage shows who actually played it.
const STAGE_TIER_CLS: Record<string, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};
function StageRosters({ entry }: { entry: SeasonHistoryEntry }) {
  const phases = entry.phaseRosters ?? [];
  const [phaseIdx, setPhaseIdx] = useState(phases.length - 1);
  const [league, setLeague] = useState<LeagueId>("LCK");
  const phase = phases[phaseIdx] ?? phases[phases.length - 1];
  if (!phase) return null;
  const teams = phase.teams.filter((t) => t.leagueId === league);
  // Which team won this stage? (champions are archived as team refs by name.)
  const champRef =
    phase.kind === "split" && phase.split
      ? entry.splitChampions[phase.split]?.[league]
      : phase.kind === "international" && phase.event
        ? entry.intlChampions[phase.event]
        : null;
  const champName = champRef?.name ?? null;

  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        Stage Rosters
      </div>
      {/* Stage selector */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {phases.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPhaseIdx(i)}
            className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.2em] transition-all ${
              i === phaseIdx ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Region selector */}
      <div className="flex flex-wrap gap-1 mb-2">
        {LEAGUE_IDS.map((lg) => (
          <button
            key={lg}
            type="button"
            onClick={() => setLeague(lg)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[8px] uppercase tracking-[0.2em] transition-all ${
              lg === league ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"
            }`}
          >
            <LeagueIcon league={lg} size={11} />
            {lg}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {teams.map((t) => {
          const isChamp = !!champName && t.teamName === champName;
          return (
            <div
              key={t.teamId}
              className={`border px-2 py-1.5 ${isChamp ? "border-rift-gold/60 bg-rift-gold/[0.06]" : "border-rift-line/40 bg-rift-bg/30"}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <TeamIcon iconKey="shield" logoUrl={t.logoUrl ?? logoForTeamName(t.teamName)} size={13} />
                <span className="text-[11px] text-rift-mutedbright truncate">{t.teamName}</span>
                {isChamp && <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-rift-goldbright">★ champion</span>}
              </div>
              {t.coach && (
                <div className="flex items-center gap-1 mb-1 text-[9px]">
                  <span className="shrink-0 px-1 border border-rift-blue/40 text-rift-blue/80 text-[7px] uppercase tracking-[0.15em]">
                    Coach
                  </span>
                  <span className="text-rift-mutedbright truncate max-w-[110px]">{t.coach.name}</span>
                  <span className="text-rift-gold/70 tabular-nums">★{t.coach.rating.toFixed(1)}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {t.players.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[9px]">
                    <LaneIcon lane={p.lane} size="xs" />
                    <span className={`px-1 border font-display text-[8px] ${STAGE_TIER_CLS[p.tier] ?? ""}`}>{p.tier}</span>
                    <span className="text-rift-mutedbright truncate max-w-[80px]">{p.name ?? "—"}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Transfer log — every roster move of the year, grouped by the window it
// happened in (post First Stand / post MSI / post Worlds offseason). Each move
// is a lane swap between two clubs; we show who arrived on each side.
const XFER_TIER_CLS = STAGE_TIER_CLS;
function TransferLog({ transfers }: { transfers: HistoryTransfer[] }) {
  const byEvent = new Map<InternationalId, HistoryTransfer[]>();
  for (const t of transfers) {
    const arr = byEvent.get(t.event) ?? [];
    arr.push(t);
    byEvent.set(t.event, arr);
  }
  const teamChip = (team: HistoryTransfer["from"]) =>
    team ? (
      <span className="inline-flex items-center gap-1 min-w-0">
        <TeamIcon iconKey={team.iconKey} logoUrl={team.logoUrl ?? logoForTeamName(team.name)} size={12} color={team.color} />
        <span className="text-rift-mutedbright truncate max-w-[84px]">{team.name}</span>
      </span>
    ) : (
      <span className="text-rift-muted">—</span>
    );
  const tier = (t: string) => (
    <span className={`px-1 border font-display text-[8px] ${XFER_TIER_CLS[t] ?? ""}`}>{t}</span>
  );
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
        Transfers
      </div>
      <div className="space-y-2">
        {INTL_ORDER.filter((e) => byEvent.has(e)).map((event) => (
          <div key={event}>
            <div className="text-[8px] uppercase tracking-[0.25em] text-rift-muted/55 mb-1">
              Post {INTERNATIONAL_LABELS[event]} — {byEvent.get(event)!.length} move
              {byEvent.get(event)!.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-1">
              {byEvent.get(event)!.map((t, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] border border-rift-line/40 bg-rift-bg/30 px-2 py-1"
                >
                  <LaneIcon lane={t.lane} size="xs" className="shrink-0 opacity-80" />
                  {/* Star arrives on `to`; swap goes back to `from`. */}
                  {tier(t.inTier)}
                  <span className="text-rift-mutedbright truncate max-w-[90px]">{t.inName ?? "—"}</span>
                  <span className="text-rift-gold/60">▸</span>
                  {teamChip(t.to)}
                  <span className="text-rift-muted/40 mx-0.5">⇄</span>
                  {tier(t.outTier)}
                  <span className="text-rift-mutedbright truncate max-w-[90px]">{t.outName ?? "—"}</span>
                  <span className="text-rift-gold/60">▸</span>
                  {teamChip(t.from)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// One all-time leaderboard card: top teams by some title count.
function RecordBoard({
  title,
  records,
  count,
  detail,
}: {
  title: string;
  records: TeamRecord[];
  count: (r: TeamRecord) => number;
  detail?: (r: TeamRecord) => string;
}) {
  // Every franchise with at least one title — the list scrolls so no team
  // is hidden, however many have won.
  const rows = [...records]
    .filter((r) => count(r) > 0)
    .sort((a, b) => count(b) - count(a) || a.team.name.localeCompare(b.team.name));
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30">
      <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-[10px] italic text-rift-muted">
          No titles recorded yet
        </p>
      ) : (
        <div className="divide-y divide-rift-line/15 max-h-56 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
              <span className="w-4 text-right text-[9px] tabular-nums text-rift-muted/70 flex-shrink-0">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <TeamRef team={r.team} size={13} muted={i > 0} />
              </span>
              {detail && (
                <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/70 flex-shrink-0">
                  {detail(r)}
                </span>
              )}
              <span
                className={`tabular-nums font-semibold flex-shrink-0 ${i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright"}`}
              >
                {count(r)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Records & Dynasties — all-time stats computed across every archived
// season. Franchises are matched by team name within the same league.
const LANE_SHORT: Record<Lane, string> = {
  top: "TOP",
  jungle: "JNG",
  middle: "MID",
  bottom: "BOT",
  support: "SUP",
};

function DynastyBadge({ tier }: { tier: DynastyTier }) {
  if (tier === "none") return null;
  const legendary = tier === "legendary";
  return (
    <span
      className={`px-1.5 py-px border text-[8px] uppercase tracking-[0.25em] flex-shrink-0 ${
        legendary
          ? "border-rift-goldbright bg-rift-goldbright/15 text-rift-goldbright"
          : "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
      }`}
    >
      {legendary ? "Legendary Dynasty" : "Dynasty"}
    </span>
  );
}

function RecordsPanel({ entries }: { entries: SeasonHistoryEntry[] }) {
  const records = useMemo(() => computeTeamRecords(entries), [entries]);
  const byRegion = useMemo(() => splitWinnersByRegion(records), [records]);
  // Only franchises that earned a dynasty — strongest tier first, then
  // by how many titles their dominant window held.
  const dynasties = useMemo(
    () =>
      records
        .filter((r) => r.dynasty.tier !== "none")
        .sort(
          (a, b) =>
            (b.dynasty.tier === "legendary" ? 1 : 0) -
              (a.dynasty.tier === "legendary" ? 1 : 0) ||
            b.dynasty.windowTitles - a.dynasty.windowTitles ||
            b.totalTitles - a.totalTitles,
        ),
    [records],
  );
  const bestByRegion = useMemo(() => bestTeamPerRegion(records), [records]);
  const regionStrength = useMemo(
    () => computeRegionStrength(records, entries),
    [records, entries],
  );
  const streaks = useMemo(
    () =>
      computeTitleStreaks(entries)
        .filter((s) => s.longestStreak >= 2 || s.longestDrought >= 2)
        .slice(0, 8),
    [entries],
  );
  // Golden Roads — perfect seasons (one team swept all six titles).
  const goldenRoads = useMemo(
    () =>
      entries
        .map((e) => ({
          team: goldenRoadTeam(e),
          season: e.name,
          at: e.archivedAt,
        }))
        .filter(
          (g): g is { team: SeasonHistoryTeamRef; season: string; at: number } =>
            g.team != null,
        )
        .sort((a, b) => b.at - a.at),
    [entries],
  );
  const players = useMemo(() => computePlayerAllTime(entries), [entries]);
  const topMVP = useMemo(
    () =>
      [...players]
        .filter((p) => p.mvp > 0)
        .sort((a, b) => b.mvp - a.mvp || b.allPro - a.allPro)
        .slice(0, 5),
    [players],
  );
  const topAllPro = useMemo(
    () =>
      [...players]
        .filter((p) => p.allPro > 0)
        .sort((a, b) => b.allPro - a.allPro || b.mvp - a.mvp)
        .slice(0, 5),
    [players],
  );
  // Career boards — by stable player id, following a player across teams/years.
  const careers = useMemo(() => computePlayerCareers(entries), [entries]);
  const careerBoards = useMemo(() => {
    const top = (key: (p: PlayerCareerLine) => number) =>
      [...careers].filter((p) => key(p) > 0).sort((a, b) => key(b) - key(a)).slice(0, 5);
    return [
      { label: "Most MVPs", rows: top((p) => p.mvps), val: (p: PlayerCareerLine) => `${p.mvps}` },
      { label: "Most Intl MVPs", rows: top((p) => p.intlMvps), val: (p: PlayerCareerLine) => `${p.intlMvps}` },
      { label: "Most Split MVPs", rows: top((p) => p.splitMvps), val: (p: PlayerCareerLine) => `${p.splitMvps}` },
      { label: "Most Kills", rows: top((p) => p.kills), val: (p: PlayerCareerLine) => `${p.kills}` },
      { label: "Most All-Pro", rows: top((p) => p.allPro), val: (p: PlayerCareerLine) => `${p.allPro}` },
      { label: "Region Titles", rows: top((p) => p.splitTitles), val: (p: PlayerCareerLine) => `${p.splitTitles}` },
      { label: "Intl Appearances", rows: top((p) => p.intlAppearances), val: (p: PlayerCareerLine) => `${p.intlAppearances}` },
      { label: "Intl Titles", rows: top((p) => p.intlTitles), val: (p: PlayerCareerLine) => `${p.intlTitles}` },
    ].filter((b) => b.rows.length > 0);
  }, [careers]);
  const intlDetail = (r: TeamRecord) =>
    INTL_ORDER.filter((e) => (r.intlTitles[e] ?? 0) > 0)
      .map((e) => `${r.intlTitles[e]}× ${INTERNATIONAL_LABELS[e]}`)
      .join(" · ");
  // Chronological roll of honour for each international — every season's
  // winner of First Stand, MSI, and Worlds, oldest first.
  const intlRoll = useMemo(() => {
    const chrono = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
    return INTL_ORDER.map((event) => ({
      event,
      winners: chrono
        .map((e) => ({ season: e.name, team: e.intlChampions[event] ?? null }))
        .filter(
          (w): w is { season: string; team: SeasonHistoryTeamRef } =>
            w.team != null,
        ),
    }));
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* All-time leaderboards */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          All-Time Records · {entries.length} season{entries.length === 1 ? "" : "s"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RecordBoard
            title="Most Titles"
            records={records}
            count={(r) => r.totalTitles}
            detail={(r) => `${r.splitTitles} splits · ${r.intlTotal} intl`}
          />
          <RecordBoard
            title="Most Split Titles"
            records={records}
            count={(r) => r.splitTitles}
          />
          <RecordBoard
            title="Most International Trophies"
            records={records}
            count={(r) => r.intlTotal}
            detail={intlDetail}
          />
          <RecordBoard
            title="Most Worlds Titles"
            records={records}
            count={(r) => r.worldsTitles}
          />
        </div>
      </div>

      {/* International champions — full roll of honour, oldest first */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          International Champions
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {intlRoll.map(({ event, winners }) => (
            <div
              key={event}
              className="border border-rift-line/40 bg-rift-bg/30"
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                <LeagueIcon league={event} size={15} />
                {INTERNATIONAL_LABELS[event]}
              </div>
              {winners.length === 0 ? (
                <p className="px-3 py-2 text-[10px] italic text-rift-muted">
                  No {INTERNATIONAL_LABELS[event]} winner recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-rift-line/15 max-h-56 overflow-y-auto">
                  {winners.map((w, i) => (
                    <div
                      key={`${event}:${i}:${w.season}`}
                      className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                    >
                      <span className="w-4 text-right text-[9px] tabular-nums text-rift-muted/70 flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <TeamRef team={w.team} size={13} />
                      </span>
                      <span className="text-[8px] uppercase tracking-[0.18em] text-rift-mutedbright/60 flex-shrink-0 truncate max-w-[40%]">
                        {w.season}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Best team per region (all-time, by total titles) */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Best Team per Region
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {LEAGUE_IDS.map((league) => {
            const best = bestByRegion[league];
            return (
              <div
                key={league}
                className="border border-rift-line/40 bg-rift-bg/30 px-3 py-2"
              >
                <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1">
                  <LeagueIcon league={league} size={14} />
                  {LEAGUE_NAMES[league]}
                </div>
                {best ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1">
                      <TeamRef team={best.team} size={14} />
                    </span>
                    <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/70 flex-shrink-0">
                      {best.splitTitles}s · {best.intlTotal}i
                    </span>
                    <span className="tabular-nums font-semibold text-rift-goldbright flex-shrink-0">
                      {best.totalTitles}×
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] italic text-rift-muted">
                    No titles yet
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Region strength — silverware pulled in per region */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Region Strength
        </div>
        <div className="border border-rift-line/40 bg-rift-bg/30">
          <div className="grid grid-cols-[1.6fr_repeat(4,0.7fr)] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.2em] text-rift-muted/70">
            <span>Region</span>
            <span className="text-right">Worlds</span>
            <span className="text-right">Intl</span>
            <span className="text-right">W-Finals</span>
            <span className="text-right">Splits</span>
          </div>
          <div className="divide-y divide-rift-line/15">
            {regionStrength.map((row, i) => (
              <div
                key={row.league}
                className="grid grid-cols-[1.6fr_repeat(4,0.7fr)] gap-2 px-3 py-1.5 text-[11px] items-center"
              >
                <span
                  className={`uppercase tracking-[0.15em] ${i === 0 ? "text-rift-goldbright font-semibold" : "text-rift-mutedbright"}`}
                >
                  {row.league}
                </span>
                <span className="text-right tabular-nums text-rift-goldbright">
                  {row.worldsTitles}
                </span>
                <span className="text-right tabular-nums text-rift-mutedbright">
                  {row.intlTitles}
                </span>
                <span className="text-right tabular-nums text-rift-mutedbright">
                  {row.worldsFinals}
                </span>
                <span className="text-right tabular-nums text-rift-mutedbright">
                  {row.splitTitles}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Golden Roads — perfect seasons (a six-title sweep) */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Golden Roads
        </div>
        {goldenRoads.length === 0 ? (
          <p className="text-[10px] italic text-rift-muted">
            No Golden Roads yet — a franchise earns one by winning all three
            of its splits (Winter, Spring, Summer) AND all three
            internationals (First Stand, MSI, Worlds) in a single season.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {goldenRoads.map((g) => (
              <div
                key={`${g.season}-${g.team.leagueId}-${g.team.name}`}
                className="flex items-center gap-2 px-3 py-2 border border-rift-goldbright/50 bg-gradient-to-r from-rift-gold/10 to-rift-goldbright/10 text-[11px]"
                title={`${g.team.name} swept all six titles in ${g.season}`}
              >
                <span aria-hidden className="text-rift-goldbright">
                  ★
                </span>
                <span className="min-w-0 flex-1">
                  <TeamRef team={g.team} size={14} />
                  <span className="block text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/60 mt-0.5">
                    {g.season}
                  </span>
                </span>
                <span className="px-1.5 py-px border border-rift-goldbright/60 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] flex-shrink-0">
                  Golden Road
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dynasties — concentrated dominance, not lifetime totals */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Dynasties
        </div>
        {dynasties.length === 0 ? (
          <p className="text-[10px] italic text-rift-muted">
            No dynasties yet — a franchise earns one with 4+ major titles
            <strong className="text-rift-mutedbright"> including at least one
            international</strong> within any {DYNASTY_WINDOW}-season window
            (a splits-only run never qualifies). A Worlds title plus 6+ majors
            in the window makes a Legendary Dynasty.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {dynasties.map((r) => (
              <div
                key={r.key}
                className="flex items-center gap-2 px-3 py-2 border border-rift-line/40 bg-rift-bg/30 text-[11px]"
                title={
                  r.dynasty.windowSpan
                    ? `${r.dynasty.windowTitles} major titles (${r.dynasty.windowIntl}× international${r.dynasty.windowWorlds > 0 ? `, ${r.dynasty.windowWorlds}× Worlds` : ""}) across ${r.dynasty.windowSpan[0]} → ${r.dynasty.windowSpan[1]}`
                    : undefined
                }
              >
                <span className="min-w-0 flex-1">
                  <TeamRef team={r.team} size={14} />
                  <span className="block text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/60 mt-0.5">
                    {r.dynasty.windowTitles} titles
                    {r.dynasty.windowSpan
                      ? ` · ${r.dynasty.windowSpan[0]}${r.dynasty.windowSpan[0] !== r.dynasty.windowSpan[1] ? `–${r.dynasty.windowSpan[1]}` : ""}`
                      : ""}
                  </span>
                </span>
                <DynastyBadge tier={r.dynasty.tier} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Title streaks & droughts across seasons */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Title Streaks &amp; Droughts
        </div>
        {streaks.length === 0 ? (
          <p className="text-[10px] italic text-rift-muted">
            Multi-season streaks and droughts appear once franchises start
            winning across consecutive seasons.
          </p>
        ) : (
          <div className="border border-rift-line/40 bg-rift-bg/30">
            <div className="grid grid-cols-[1.8fr_repeat(3,0.8fr)] gap-2 px-3 py-1.5 border-b border-rift-line/30 text-[8px] uppercase tracking-[0.2em] text-rift-muted/70">
              <span>Franchise</span>
              <span className="text-right">Streak</span>
              <span className="text-right">Drought</span>
              <span className="text-right">Titles</span>
            </div>
            <div className="divide-y divide-rift-line/15">
              {streaks.map((s) => (
                <div
                  key={`${s.team.leagueId}:${s.team.name}`}
                  className="grid grid-cols-[1.8fr_repeat(3,0.8fr)] gap-2 px-3 py-1.5 text-[11px] items-center"
                >
                  <span className="min-w-0">
                    <TeamRef team={s.team} size={13} />
                  </span>
                  <span className="text-right tabular-nums text-rift-goldbright">
                    {s.longestStreak >= 2 ? `${s.longestStreak}×` : "—"}
                  </span>
                  <span className="text-right tabular-nums text-rift-mutedbright">
                    {s.longestDrought >= 1 ? s.longestDrought : "—"}
                  </span>
                  <span className="text-right tabular-nums text-rift-mutedbright">
                    {s.totalTitles}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[9px] italic text-rift-muted">
          Streak = consecutive archived seasons winning at least one major;
          drought = longest gap, in seasons, between a franchise&apos;s titles.
        </p>
      </div>

      {/* Player all-time (team-position MVP / All-Pro tallies) */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Player All-Time
        </div>
        {topMVP.length === 0 && topAllPro.length === 0 ? (
          <p className="text-[10px] italic text-rift-muted">
            MVP and All-Pro tallies are recorded for seasons archived from now
            on — finish and archive a season to start the all-time boards.
            Players are tracked by team &amp; position (e.g. T1 · MID).
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-rift-line/40 bg-rift-bg/30">
              <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
                Most MVPs
              </div>
              <div className="divide-y divide-rift-line/15">
                {topMVP.map((p, i) => (
                  <div
                    key={`mvp:${p.team.leagueId}:${p.team.name}:${p.lane}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="w-4 text-right text-[9px] tabular-nums text-rift-muted/70 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <TeamRef team={p.team} size={13} muted={i > 0} />
                    </span>
                    {p.playerName && (
                      <span
                        className="text-[10px] font-medium text-rift-mutedbright truncate max-w-[84px] flex-shrink-0"
                        title={p.playerName}
                      >
                        {p.playerName}
                      </span>
                    )}
                    <LaneIcon lane={p.lane} size="xs" className="flex-shrink-0" />
                    <span
                      className={`tabular-nums font-semibold flex-shrink-0 ${i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright"}`}
                    >
                      {p.mvp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-rift-line/40 bg-rift-bg/30">
              <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.35em] text-rift-gold/70">
                Most All-Pro Selections
              </div>
              <div className="divide-y divide-rift-line/15">
                {topAllPro.map((p, i) => (
                  <div
                    key={`ap:${p.team.leagueId}:${p.team.name}:${p.lane}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="w-4 text-right text-[9px] tabular-nums text-rift-muted/70 flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <TeamRef team={p.team} size={13} muted={i > 0} />
                    </span>
                    {p.playerName && (
                      <span
                        className="text-[10px] font-medium text-rift-mutedbright truncate max-w-[84px] flex-shrink-0"
                        title={p.playerName}
                      >
                        {p.playerName}
                      </span>
                    )}
                    <LaneIcon lane={p.lane} size="xs" className="flex-shrink-0" />
                    <span
                      className={`tabular-nums font-semibold flex-shrink-0 ${i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright"}`}
                    >
                      {p.allPro}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player careers — aggregated by stable id across every archived
            season, so a player's record follows them across teams and years. */}
        {careerBoards.length > 0 && (
          <div className="mt-4">
            <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/70 mb-1.5">
              Player Careers
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {careerBoards.map((b) => (
                <div key={b.label} className="border border-rift-line/40 bg-rift-bg/30">
                  <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                    {b.label}
                  </div>
                  <div className="divide-y divide-rift-line/15">
                    {b.rows.map((p, i) => (
                      <div key={p.playerId} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                        <span className="w-4 text-right text-[9px] tabular-nums text-rift-muted/70 flex-shrink-0">
                          {i + 1}
                        </span>
                        {p.teamName && (
                          <TeamIcon iconKey="shield" logoUrl={logoForTeamName(p.teamName)} size={13} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-rift-mutedbright font-medium">
                          {p.playerName || "—"}
                        </span>
                        {p.leagueId && (
                          <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 flex-shrink-0">
                            {p.leagueId}
                          </span>
                        )}
                        <span className={`tabular-nums font-semibold flex-shrink-0 ${i === 0 ? "text-rift-goldbright" : "text-rift-mutedbright"}`}>
                          {b.val(p)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Per-region split winners */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
          Split Winners by Region
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {LEAGUE_IDS.map((league) => {
            const winners = byRegion[league];
            if (!winners) return null;
            return (
              <div key={league} className="border border-rift-line/40 bg-rift-bg/30">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
                  <LeagueIcon league={league} size={15} />
                  {LEAGUE_NAMES[league]}
                </div>
                <div className="divide-y divide-rift-line/15">
                  {winners.map((r) => (
                    <div
                      key={r.key}
                      className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                      title={r.splitTitleLabels.join("\n")}
                    >
                      <span className="min-w-0 flex-1">
                        <TeamRef team={r.team} size={13} />
                      </span>
                      <DynastyBadge tier={r.dynasty.tier} />
                      <span className="tabular-nums font-semibold text-rift-mutedbright flex-shrink-0">
                        {r.splitTitles}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[9px] italic text-rift-muted">
          Teams are matched across seasons by name within the same league —
          a team keeping its name season to season builds one record.
        </p>
      </div>
    </div>
  );
}

// A real chronological timeline of every archived season (oldest at the
// top), threaded on a vertical rail. The region filter switches what each
// node shows: "Internationals" lists the season's First Stand / MSI /
// Worlds winners; a league lists that region's split winners.
function OverallTimeline({ entries }: { entries: SeasonHistoryEntry[] }) {
  const [filter, setFilter] = useState<"intl" | LeagueId>("intl");
  const chrono = useMemo(
    () => [...entries].sort((a, b) => a.archivedAt - b.archivedAt),
    [entries],
  );

  const filters = [
    { id: "intl" as const, label: "Internationals" },
    ...LEAGUE_IDS.map((l) => ({ id: l, label: l })),
  ];

  // The winner rows for one season under the current filter.
  const rowsFor = (entry: SeasonHistoryEntry) => {
    if (filter === "intl") {
      return INTL_ORDER.map((event) => ({
        key: event,
        label: INTERNATIONAL_LABELS[event],
        team: entry.intlChampions[event] ?? null,
      }));
    }
    return SPLIT_ORDER.map((split) => ({
      key: split,
      label: SPLIT_LABELS[split],
      team: entry.splitChampions[split]?.[filter] ?? null,
    }));
  };

  return (
    <div>
      {/* Region / internationals filter */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.2em] transition-all ${
              filter === f.id
                ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {chrono.length === 0 ? (
        <p className="text-[11px] italic text-rift-muted">No seasons yet.</p>
      ) : (
        <ol className="relative ml-3 border-l border-rift-line/40 space-y-5">
          {chrono.map((entry) => {
            const date = new Date(entry.archivedAt);
            const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const rows = rowsFor(entry);
            const champ = entry.champion;
            return (
              <li key={entry.id} className="relative pl-5">
                {/* Node on the rail */}
                <span
                  className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-rift-gold/80 ring-2 ring-rift-bg"
                  aria-hidden
                />
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-display text-sm tracking-wider text-rift-goldbright truncate">
                    {entry.name}
                    {filter === "intl" && champ && (
                      <span
                        className="ml-1.5 text-[10px] tracking-normal text-rift-mutedbright"
                        title="Worlds champion"
                      >
                        🏆 {champ.name}
                      </span>
                    )}
                  </span>
                  <span className="text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/50 flex-shrink-0 tabular-nums">
                    {dateLabel}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {rows.map((row) => {
                    const roster = !row.team
                      ? null
                      : filter === "intl"
                        ? intlChampRoster(entry, row.key as InternationalId)
                        : splitChampRoster(entry, row.key as SplitId, filter);
                    return (
                      <div
                        key={row.key}
                        className="border border-rift-line/30 bg-rift-bg/30 px-2 py-1 text-[10px] min-w-0"
                      >
                        <div className="flex items-center gap-1.5">
                          {filter === "intl" && (
                            <LeagueIcon league={row.key as InternationalId} size={13} />
                          )}
                          <span className="text-[7px] uppercase tracking-[0.2em] text-rift-gold/60 w-12 flex-shrink-0">
                            {row.label}
                          </span>
                          {row.team ? (
                            <span className="min-w-0 flex-1">
                              <TeamRef team={row.team} size={12} />
                            </span>
                          ) : (
                            <span className="italic text-rift-muted/60">—</span>
                          )}
                        </div>
                        {roster && roster.players.length > 0 && (
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 pl-1">
                            {roster.players.map((p, i) => (
                              <span key={i} className="inline-flex items-center gap-0.5 text-[8px]">
                                <LaneIcon lane={p.lane} size="xs" />
                                <span className="text-rift-mutedbright truncate max-w-[64px]">{p.name ?? "—"}</span>
                              </span>
                            ))}
                            {roster.coach && (
                              <span className="text-[7px] uppercase tracking-[0.15em] text-rift-blue/70 w-full">
                                coach {roster.coach}
                              </span>
                            )}
                          </div>
                        )}
                        {(() => {
                          const mvp =
                            filter === "intl"
                              ? entry.intlMvps?.find((m) => m.event === row.key)
                              : entry.splitMvps?.find(
                                  (m) => m.split === row.key && m.leagueId === filter,
                                );
                          return mvp ? (
                            <div className="mt-0.5 pl-1 flex items-center gap-1 text-[8px] text-rift-goldbright">
                              <span className="uppercase tracking-[0.15em] text-rift-gold/55">MVP</span>
                              <LaneIcon lane={mvp.lane} size="xs" />
                              <span className="truncate max-w-[90px]">{mvp.playerName ?? `${mvp.team.name} ${mvp.lane}`}</span>
                              <span className="text-rift-gold/60 tabular-nums">★{mvp.avgRating.toFixed(1)}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Search (Liquipedia-style profiles) ──────────────────────────────────────

function StatChip({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1 text-center">
      <div className={`text-[12px] font-display tabular-nums ${tone ?? "text-rift-goldbright"}`}>{value}</div>
      <div className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/60">{label}</div>
    </div>
  );
}

// Career-average formatting from the summed PlayerCareerLine accumulators.
const avg1 = (sum: number, n: number) => (n > 0 ? (sum / n).toFixed(1) : "—");
const perGame = (total: number, games: number) => (games > 0 ? (total / games).toFixed(1) : "—");
const kdaOf = (k: number, d: number, a: number) => (k + a === 0 && d === 0 ? "—" : (d > 0 ? (k + a) / d : k + a).toFixed(2));
const goldDiff = (sum: number, n: number) => {
  if (n <= 0) return { text: "—", tone: "text-rift-muted/60" };
  const v = Math.round(sum / n);
  return { text: `${v >= 0 ? "+" : ""}${v}`, tone: v > 50 ? "text-emerald-400" : v < -50 ? "text-rift-redbright" : "text-rift-mutedbright" };
};

function RosterChips({ roster }: { roster: Array<{ name?: string; tier: PlayerTier; lane: Lane }> }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {[...roster]
        .sort((a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane))
        .map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[9px]">
            <LaneIcon lane={p.lane} size="xs" />
            <span className={`px-1 border font-display text-[8px] ${STAGE_TIER_CLS[p.tier] ?? ""}`}>{p.tier}</span>
            <span className="text-rift-mutedbright truncate max-w-[80px]">{p.name ?? "—"}</span>
          </span>
        ))}
    </div>
  );
}

// Titles broken out as Splits + each international (First Stand / MSI / Worlds).
function IntlTitleChips({ splitTitles, intl }: { splitTitles: number; intl: Partial<Record<InternationalId, number>> }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/55 mb-1">Titles</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[8px] uppercase tracking-[0.2em] text-rift-blue/70">Splits</span>
          <span className="font-display text-rift-goldbright tabular-nums">{splitTitles}</span>
        </span>
        {INTL_ORDER.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5" title={INTERNATIONAL_LABELS[e]}>
            <LeagueIcon league={e} size={13} />
            <span className="text-[8px] uppercase tracking-[0.2em] text-rift-gold/60">{INTERNATIONAL_LABELS[e]}</span>
            <span className="font-display text-rift-goldbright tabular-nums">{intl[e] ?? 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Inline title tally for a tenure row: 🏆 + intl event icons + split labels.
function TitleTallyInline({ titles }: { titles: { splits: SplitId[]; intl: InternationalId[] } }) {
  if (titles.splits.length === 0 && titles.intl.length === 0) return null;
  return (
    <span className="ml-auto inline-flex flex-wrap items-center gap-1.5 text-[8px] uppercase tracking-[0.15em] text-rift-goldbright">
      🏆
      {titles.intl.map((e) => (
        <span key={e} className="inline-flex items-center gap-0.5">
          <LeagueIcon league={e} size={10} />
          {INTERNATIONAL_LABELS[e]}
        </span>
      ))}
      {titles.splits.map((s) => (
        <span key={s} className="text-rift-blue/80">{SPLIT_LABELS[s]}</span>
      ))}
    </span>
  );
}

// A scrollable champion pool: every champion the player has been recorded on,
// with games played and win rate. Most-played first.
function ChampPool({
  champs,
  champById,
}: {
  champs: PlayerChampStat[];
  champById: Map<number, Champion>;
}) {
  if (champs.length === 0)
    return <p className="text-[10px] italic text-rift-muted/70">No champion data recorded.</p>;
  return (
    <div className="max-h-44 overflow-y-auto pr-1 space-y-0.5">
      {champs.map((cs) => {
        const champ = champById.get(cs.championId);
        const wr = cs.games > 0 ? Math.round((cs.wins / cs.games) * 100) : 0;
        return (
          <div key={cs.championId} className="flex items-center gap-2 text-[10px]">
            {champ?.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={champ.iconUrl} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
            )}
            <span className="truncate flex-1 text-rift-mutedbright">
              {champ?.name ?? `#${cs.championId}`}
            </span>
            <span className="tabular-nums text-rift-muted/70 w-8 text-right">{cs.games}g</span>
            <span
              className={`tabular-nums w-9 text-right ${wr >= 50 ? "text-rift-bluebright" : "text-rift-redbright/80"}`}
            >
              {wr}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerProfileView({ entries, id }: { entries: SeasonHistoryEntry[]; id: string }) {
  const p = useMemo(() => playerProfile(entries, id), [entries, id]);
  const champions = useDraftStore((s) => s.champions);
  const champById = useMemo(
    () => new Map(champions.map((ch) => [ch.id, ch])),
    [champions],
  );
  if (!p) return <p className="text-[11px] italic text-rift-muted">No data.</p>;
  const c = p.career;
  const gd = c ? goldDiff(c.goldDiffSum, c.goldDiffGames) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {p.lane && <LaneIcon lane={p.lane} size="sm" />}
        {p.tier && <span className={`w-5 text-center border font-display text-[10px] ${STAGE_TIER_CLS[p.tier] ?? ""}`}>{p.tier}</span>}
        <span className="font-display text-lg tracking-wide text-rift-goldbright">{p.name}</span>
        {p.age != null && (
          <span className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/70 border border-rift-line/40 px-1.5 py-0.5">
            Age {p.age}
          </span>
        )}
        {p.retired && (
          <span className="text-[9px] uppercase tracking-[0.2em] text-rift-redbright/80 border border-rift-red/40 bg-rift-red/10 px-1.5 py-0.5">
            Retired
          </span>
        )}
      </div>
      {c && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <StatChip label="Seasons" value={c.seasons} />
            <StatChip label="Games" value={c.games} />
            <StatChip label="Avg grade" value={avg1(c.ratingSum, c.ratingGames)} />
            <StatChip label="Avg gold ±" value={gd!.text} tone={gd!.tone} />
            <StatChip label="Kills/game" value={perGame(c.kills, c.games)} />
            <StatChip label="KDA" value={kdaOf(c.kills, c.deaths, c.assists)} />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <StatChip label="Kills" value={c.kills} />
            <StatChip label="Pentas" value={c.pentakills} />
            <StatChip label="MVPs" value={c.mvps} />
            <StatChip label="All-Pro" value={c.allPro} />
            <StatChip label="All-Pro Split" value={c.allProSplit} />
            <StatChip label="All-Pro Season" value={c.allProSeason} />
            <StatChip label="Intl MVPs" value={c.intlMvps} />
            <StatChip label="Split MVPs" value={c.splitMvps} />
          </div>
        </>
      )}
      <IntlTitleChips splitTitles={p.splitTitles} intl={p.intlTitles} />
      {c && c.champs.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
            Champion Pool · Career
          </div>
          <ChampPool champs={c.champs} champById={champById} />
        </div>
      )}
      {p.seasons.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
            By Season
          </div>
          <div className="space-y-1.5">
            {p.seasons.map((s, i) => (
              <details key={i} className="border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5">
                <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] cursor-pointer">
                  <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 w-16 flex-shrink-0">{s.season}</span>
                  {s.age != null && <span className="text-rift-muted/70">Age {s.age}</span>}
                  {s.allProSeason > 0 && (
                    <span className="text-[8px] uppercase tracking-[0.15em] text-rift-goldbright">★ Team of the Year</span>
                  )}
                  {s.intlMvpEvents.map((ev) => (
                    <span key={ev} className="inline-flex items-center gap-0.5 text-[8px] uppercase tracking-[0.15em] text-rift-goldbright">
                      <LeagueIcon league={ev} size={10} /> {INTERNATIONAL_LABELS[ev]} MVP
                    </span>
                  ))}
                  {s.splitMvps.map((sp, k) => (
                    <span key={`sm${k}`} className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/80">
                      {SPLIT_LABELS[sp]} MVP
                    </span>
                  ))}
                  {s.allProSplit > 0 && (
                    <span className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/80">{s.allProSplit}× Split All-Pro</span>
                  )}
                  {s.allPro > 0 && (
                    <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/60">{s.allPro} All-Pro picks</span>
                  )}
                  <span className="ml-auto text-rift-muted/40 text-[8px]">{s.champs.length} champs</span>
                </summary>
                <div className="mt-1.5">
                  <ChampPool champs={s.champs} champById={champById} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">Team History</div>
        <div className="space-y-1.5">
          {p.tenures.map((t, i) => (
            <div key={i} className="border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5 text-[10px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 w-16 flex-shrink-0">{t.season}</span>
                {/* Each stint = a team across some stages; >1 = transferred mid-year. */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                  {t.stints.map((st, j) => (
                    <span key={j} className="inline-flex items-center gap-1">
                      {j > 0 && <span className="text-rift-muted/40">→</span>}
                      <TeamRef team={st.team} size={12} />
                      <LaneIcon lane={st.lane} size="xs" />
                      <span className={`px-1 border font-display text-[8px] ${STAGE_TIER_CLS[st.tier] ?? ""}`}>{st.tier}</span>
                      <span className="text-[7px] uppercase tracking-[0.15em] text-rift-muted/45">{st.stages.join(", ")}</span>
                    </span>
                  ))}
                </div>
                <TitleTallyInline titles={t.titles} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamProfileView({ entries, teamKey }: { entries: SeasonHistoryEntry[]; teamKey: string }) {
  const t = useMemo(() => teamProfile(entries, teamKey), [entries, teamKey]);
  if (!t) return <p className="text-[11px] italic text-rift-muted">No data.</p>;
  const r = t.record;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TeamRef team={t.team} size={20} />
        <span className="text-[9px] uppercase tracking-[0.2em] text-rift-muted/60">{t.team.leagueId}</span>
        {t.star != null && (
          <span className="ml-auto text-[11px] text-rift-gold/85 tabular-nums" title="Most-recent roster rating">
            {t.star}★
          </span>
        )}
      </div>
      {r && (
        <>
          <IntlTitleChips splitTitles={r.splitTitles} intl={r.intlTitles} />
          <div className="grid grid-cols-3 gap-1.5">
            <StatChip label="Intl titles" value={r.intlTotal} />
            <StatChip label="Total titles" value={r.totalTitles} />
            <StatChip label="Dynasty" value={r.dynasty.tier === "none" ? "—" : r.dynasty.tier} />
          </div>
        </>
      )}
      {/* Results history — a trophy line per season across all years */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">Results History</div>
        <div className="space-y-1">
          {t.seasons.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border border-rift-line/25 bg-rift-bg/15 px-2.5 py-1 text-[10px]">
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 w-16 flex-shrink-0">{s.season}</span>
              {s.worlds === "champion" && <span className="text-[8px] uppercase tracking-[0.15em] text-rift-goldbright">🏆 World Champion</span>}
              {s.worlds === "finalist" && <span className="text-[8px] uppercase tracking-[0.15em] text-rift-mutedbright">Worlds Finalist</span>}
              {s.intlTitles.map((e) => (
                <span key={e} className="inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] text-rift-gold/80">
                  <LeagueIcon league={e} size={11} />
                  {INTERNATIONAL_LABELS[e]}
                </span>
              ))}
              {s.splitTitles.map((sp) => (
                <span key={sp} className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/70">🏅 {SPLIT_LABELS[sp]}</span>
              ))}
              {!s.worlds && s.intlTitles.length === 0 && s.splitTitles.length === 0 && (
                <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/40">no titles</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* All stage rosters across the years */}
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">Stage Rosters</div>
        <div className="space-y-2">
          {t.seasons.filter((s) => s.stages.length > 0).map((s, i) => (
            <div key={i} className="border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5">
              <div className="text-[8px] uppercase tracking-[0.2em] text-rift-gold/55 mb-1">{s.season}</div>
              <div className="space-y-1">
                {s.stages.map((stage, j) => (
                  <div key={j}>
                    <div className="flex flex-wrap items-center gap-x-2 text-[9px] mb-0.5">
                      <span className="uppercase tracking-[0.15em] text-rift-mutedbright/70 w-28 flex-shrink-0">{stage.label}</span>
                      {stage.coach && <span className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/70">coach {stage.coach}</span>}
                    </div>
                    <RosterChips roster={stage.roster} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CoachProfileView({ entries, name }: { entries: SeasonHistoryEntry[]; name: string }) {
  const c = useMemo(() => coachProfile(entries, name), [entries, name]);
  if (!c) return <p className="text-[11px] italic text-rift-muted">No data.</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-display text-lg tracking-wide text-rift-bluebright">{c.name}</span>
        <span className="text-[8px] uppercase tracking-[0.2em] text-rift-blue/60 border border-rift-blue/40 px-1">Coach</span>
        {c.playstyle && (
          <span className="text-[8px] uppercase tracking-[0.2em] text-rift-gold/70 border border-rift-gold/40 px-1" title="Drafting playstyle">
            {c.playstyle}
          </span>
        )}
        {c.team && (
          <span className="inline-flex items-center gap-1 text-[9px] text-rift-muted/70">
            <TeamIcon iconKey={c.team.iconKey} logoUrl={c.team.logoUrl ?? logoForTeamName(c.team.name)} size={14} color={c.team.color} />
            {c.team.name}
          </span>
        )}
        {c.tenures[0] && (
          <span className="text-[10px] text-rift-gold/85 tabular-nums" title="Most-recent rating">★{c.tenures[0].rating.toFixed(1)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatChip label="Seasons" value={c.tenures.length} />
        <StatChip label="Total titles" value={c.splitTitles + Object.values(c.intlTitles).reduce((s, n) => s + (n ?? 0), 0)} />
      </div>
      <IntlTitleChips splitTitles={c.splitTitles} intl={c.intlTitles} />
      <div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">Coaching History</div>
        <div className="space-y-1.5">
          {c.tenures.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-rift-line/30 bg-rift-bg/20 px-2.5 py-1.5 text-[10px]">
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 w-16 flex-shrink-0">{t.season}</span>
              <TeamRef team={t.team} size={13} />
              <span className="text-rift-gold/80 tabular-nums text-[9px]">★{t.rating.toFixed(1)}</span>
              {t.playstyle && <span className="text-[8px] uppercase tracking-[0.15em] text-rift-blue/70">{t.playstyle}</span>}
              <TitleTallyInline titles={t.titles} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchPanel({ entries }: { entries: SeasonHistoryEntry[] }) {
  const [kind, setKind] = useState<"players" | "teams" | "coaches">("players");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [laneFilter, setLaneFilter] = useState<Lane | null>(null); // players
  const [regionFilter, setRegionFilter] = useState<LeagueId | null>(null); // teams
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "retired">("all"); // players

  const players = useMemo(() => listPlayers(entries), [entries]);
  const teams = useMemo(() => listTeams(entries), [entries]);
  const stars = useMemo(() => teamStars(entries), [entries]);
  const coaches = useMemo(() => listCoachesRich(entries), [entries]);

  const q = query.normalize("NFKD").toLowerCase().trim();
  // Result rows carry icon + rating data: lane/tier (players), team ref + star
  // (teams), rating + team (coaches). regionFilter applies to teams AND coaches.
  const results = useMemo(() => {
    if (kind === "players") {
      return players
        .filter(
          (p) =>
            (!laneFilter || p.lane === laneFilter) &&
            (!regionFilter || p.leagueId === regionFilter) &&
            (statusFilter === "all" || (statusFilter === "retired" ? p.retired : !p.retired)) &&
            (!q ||
              p.name.toLowerCase().includes(q) ||
              p.team?.name.toLowerCase().includes(q) ||
              p.leagueId?.toLowerCase().includes(q)),
        )
        .map((p) => ({
          id: p.id,
          label: p.name,
          sub: p.leagueId ?? "",
          lane: p.lane,
          tier: p.tier,
          team: p.team,
          star: null as number | null,
          rating: null as number | null,
          retired: p.retired,
        }));
    }
    if (kind === "teams") {
      return teams
        .filter((t) => (!regionFilter || t.leagueId === regionFilter) && (!q || t.name.toLowerCase().includes(q) || t.leagueId.toLowerCase().includes(q)))
        .map((t) => ({
          id: `${t.leagueId}:${t.name}`,
          label: t.name,
          sub: t.leagueId,
          lane: null as Lane | null,
          tier: null as PlayerTier | null,
          team: t,
          star: stars.get(`${t.leagueId}:${t.name}`) ?? null,
          rating: null as number | null,
          retired: false,
        }));
    }
    return coaches
      .filter((c) => (!regionFilter || c.team?.leagueId === regionFilter) && (!q || c.name.toLowerCase().includes(q) || c.team?.name.toLowerCase().includes(q) || (c.playstyle?.toLowerCase().includes(q) ?? false)))
      .map((c) => ({
        id: c.name,
        label: c.name,
        // Fold the playstyle into the sub line so it shows in the list.
        sub: [c.team ? c.team.name : "Coach", c.playstyle].filter(Boolean).join(" · "),
        lane: null as Lane | null,
        tier: null as PlayerTier | null,
        team: c.team,
        star: null as number | null,
        rating: c.rating,
        retired: false,
      }));
  }, [kind, q, laneFilter, regionFilter, statusFilter, players, teams, stars, coaches]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-start">
      <div>
        {/* Entity type */}
        <div className="flex items-center gap-1 mb-2">
          {(
            [
              { id: "players", label: "Players" },
              { id: "teams", label: "Teams" },
              { id: "coaches", label: "Coaches" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setKind(id);
                setSelected(null);
              }}
              className={`px-2.5 py-1 border text-[9px] uppercase tracking-[0.2em] transition-all ${
                kind === id ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "players" ? "Search by player, team or region…" : kind === "teams" ? "Search by team or region…" : "Search coach…"}
          className="w-full mb-2 px-2.5 py-1.5 border border-rift-line/60 bg-rift-bg/40 text-[11px] text-rift-mutedbright placeholder:text-rift-muted/40 focus:border-rift-gold/50 focus:outline-none"
        />
        {/* Position filter (players) */}
        {kind === "players" && (
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              type="button"
              onClick={() => setLaneFilter(null)}
              className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${laneFilter == null ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"}`}
            >
              All
            </button>
            {LANE_ORDER.map((lane) => (
              <button
                key={lane}
                type="button"
                onClick={() => setLaneFilter(lane)}
                className={`inline-flex items-center px-1.5 py-0.5 border transition-all ${laneFilter === lane ? "border-rift-gold/70 bg-rift-gold/10" : "border-rift-line/50 hover:border-rift-gold/40"}`}
                title={lane}
              >
                <LaneIcon lane={lane} size="xs" />
              </button>
            ))}
          </div>
        )}
        {/* Active / retired filter (players) */}
        {kind === "players" && (
          <div className="flex flex-wrap gap-1 mb-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "retired", label: "Retired" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${statusFilter === id ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {/* Region filter (all entity types) */}
        <div className="flex flex-wrap gap-1 mb-2">
          <button
            type="button"
            onClick={() => setRegionFilter(null)}
            className={`px-2 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${regionFilter == null ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"}`}
          >
            All
          </button>
          {LEAGUE_IDS.map((lg) => (
            <button
              key={lg}
              type="button"
              onClick={() => setRegionFilter(lg)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${regionFilter === lg ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40"}`}
            >
              <LeagueIcon league={lg} size={11} />
              {lg}
            </button>
          ))}
        </div>
        <div className="space-y-1 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-1">
          {results.length === 0 ? (
            <p className="text-[10px] italic text-rift-muted px-1">No matches.</p>
          ) : (
            results.slice(0, 200).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={`w-full text-left px-2.5 py-1.5 border transition-colors flex items-center gap-1.5 ${
                  selected === r.id ? "border-rift-gold/70 bg-rift-gold/[0.07]" : "border-rift-line/50 bg-rift-bg/30 hover:border-rift-gold/40"
                }`}
              >
                {r.lane && <LaneIcon lane={r.lane} size="xs" />}
                {r.tier && (
                  <span className={`w-4 text-center border font-display text-[8px] shrink-0 ${STAGE_TIER_CLS[r.tier] ?? ""}`}>{r.tier}</span>
                )}
                {r.team && <TeamIcon iconKey={r.team.iconKey} logoUrl={r.team.logoUrl ?? logoForTeamName(r.team.name)} size={14} color={r.team.color} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-rift-mutedbright truncate">{r.label}</span>
                  {/* Players: team logo's region; teams/coaches: the sub line. */}
                  <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] text-rift-muted/50 truncate">
                    {kind === "players" && r.team && <LeagueIcon league={r.team.leagueId} size={9} />}
                    {r.sub}
                  </span>
                </span>
                {r.retired && (
                  <span className="text-[7px] uppercase tracking-[0.15em] text-rift-redbright/70 border border-rift-red/40 px-1 shrink-0" title="Retired">
                    Ret
                  </span>
                )}
                {r.star != null && <span className="text-[9px] text-rift-gold/85 tabular-nums shrink-0">{r.star}★</span>}
                {r.rating != null && <span className="text-[9px] text-rift-gold/85 tabular-nums shrink-0">★{r.rating.toFixed(1)}</span>}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="min-w-0">
        {selected == null ? (
          <p className="text-[11px] italic text-rift-muted">Pick a {kind.slice(0, -1)} to see their full history.</p>
        ) : kind === "players" ? (
          <PlayerProfileView entries={entries} id={selected} />
        ) : kind === "teams" ? (
          <TeamProfileView entries={entries} teamKey={selected} />
        ) : (
          <CoachProfileView entries={entries} name={selected} />
        )}
      </div>
    </div>
  );
}

export default function SeasonHistoryView({ onBack }: { onBack: () => void }) {
  // Season mode and Realities each keep their OWN Hall — season mode doesn't
  // carry rosters between years, realities do, so they never mix. The user
  // picks which to view up top; default to the live context.
  const globalHistory = useDraftStore((s) => s.seasonHistory);
  const realities = useDraftStore((s) => s.realities);
  const liveFid = useDraftStore((s) => s.season?.franchise?.id ?? null);
  // source: "season" = one-off Hall; otherwise a reality id.
  const [source, setSource] = useState<string>(() => liveFid ?? "season");
  const realityId = source === "season" ? undefined : source;
  const seasonHistory =
    realityId != null
      ? (realities.find((r) => r.id === realityId)?.history ?? [])
      : globalHistory;
  const removeSeasonFromHistory = useDraftStore(
    (s) => s.removeSeasonFromHistory,
  );
  const clearSeasonHistory = useDraftStore((s) => s.clearSeasonHistory);
  const importSeasonHistory = useDraftStore((s) => s.importSeasonHistory);
  const champions = useDraftStore((s) => s.champions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"timeline" | "records" | "search">("timeline");
  // Within the Timeline tab: "seasons" = the list + selected-season résumé;
  // "overall" = a single chronological timeline across all seasons.
  const [timelineView, setTimelineView] = useState<"seasons" | "overall">(
    "seasons",
  );
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"all" | "one" | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportMsg, setExportMsg] = useState<{
    where: "all" | "one" | "import";
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const selected =
    seasonHistory.find((e) => e.id === selectedId) ?? seasonHistory[0] ?? null;
  const confirmEntry =
    confirmRemove && confirmRemove !== "all"
      ? seasonHistory.find((e) => e.id === confirmRemove)
      : null;
  const nameByAlias = useMemo(
    () => new Map(champions.map((c) => [c.alias, c.name])),
    [champions],
  );

  // Styled .xlsx — opens in Google Sheets / Excel with colors intact.
  const runExport = async (target: "all" | "one") => {
    if (exporting) return;
    setExporting(target);
    setExportMsg(null);
    const result =
      target === "all"
        ? await exportAllSeasonsXlsx(seasonHistory, nameByAlias, Date.now())
        : selected
          ? await exportSeasonXlsx(selected, nameByAlias)
          : { ok: false as const, error: "No season selected" };
    setExporting(null);
    if (result.ok) {
      setExportMsg({ where: target, kind: "ok", text: "Exported ✓" });
    } else if (result.error !== "cancelled") {
      setExportMsg({
        where: target,
        kind: "err",
        text: `Export failed: ${result.error}`,
      });
    }
    setTimeout(() => setExportMsg(null), 4000);
  };

  // Import a previously exported workbook (whole hall or one season).
  // New exports carry a hidden lossless data sheet; older ones fall
  // back to parsing the styled sheets (icons/meta don't survive those).
  // Import one or many workbooks at once. Every selected file is parsed,
  // its seasons collected, and the whole batch is merged in a single store
  // update so duplicate ids dedupe cleanly across files. Per-file parse
  // failures are tallied but don't abort the rest of the batch.
  const handleImportBuffers = async (buffers: ArrayBuffer[]) => {
    if (buffers.length === 0) return;
    setImporting(true);
    setExportMsg(null);
    const allEntries: SeasonHistoryEntry[] = [];
    let failed = 0;
    let firstError = "";
    for (const buf of buffers) {
      const parsed = await parseHistoryWorkbook(buf, Date.now());
      if (parsed.ok) {
        allEntries.push(...parsed.entries);
      } else {
        failed += 1;
        if (!firstError) firstError = parsed.error;
      }
    }
    setImporting(false);
    if (allEntries.length === 0) {
      setExportMsg({
        where: "import",
        kind: "err",
        text: firstError || "No seasons found in the selected file(s).",
      });
    } else {
      const { added, updated } = importSeasonHistory(allEntries);
      const total = added + updated;
      const fileNote =
        buffers.length > 1 ? ` from ${buffers.length} files` : "";
      const failNote =
        failed > 0 ? ` · ${failed} file${failed === 1 ? "" : "s"} failed` : "";
      setExportMsg({
        where: "import",
        kind: failed > 0 ? "err" : "ok",
        text: `Imported ${total} season${total === 1 ? "" : "s"}${fileNote}${updated > 0 ? ` (${updated} updated)` : ""}${failNote} ✓`,
      });
    }
    setTimeout(() => setExportMsg(null), 6000);
  };

  const runImport = async () => {
    if (importing || exporting) return;
    if (isDesktop()) {
      const result = await openBinaryFileNative({
        filters: [
          { name: "Excel / Google Sheets Workbook", extensions: ["xlsx"] },
        ],
        multiple: true,
      });
      if (result.ok && result.contents && result.contents.length > 0) {
        // Detach each from any shared buffer before handing off.
        const buffers = result.contents.map((bytes) =>
          new Uint8Array(bytes).buffer,
        );
        await handleImportBuffers(buffers);
      } else if (result.error !== "cancelled") {
        setExportMsg({
          where: "import",
          kind: "err",
          text: `Import failed: ${result.error}`,
        });
        setTimeout(() => setExportMsg(null), 6000);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const onImportFilePicked = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file(s)
    if (files.length === 0) return;
    const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
    await handleImportBuffers(buffers);
  };

  return (
    <div className="min-h-screen px-4 py-10 md:py-14">
      <div className="max-w-6xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 mb-6 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h10" strokeLinecap="round" />
          </svg>
          Main Menu
        </button>

        <div className="flex items-end justify-between gap-3 flex-wrap mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
              Hall of Seasons
            </div>
            <h1 className="font-display text-3xl md:text-4xl tracking-[0.12em] text-rift-goldbright">
              Season History
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {(exportMsg?.where === "all" || exportMsg?.where === "import") && (
              <span
                className={`text-[9px] uppercase tracking-[0.2em] ${
                  exportMsg.kind === "ok"
                    ? "text-rift-goldbright"
                    : "text-rift-redbright"
                }`}
              >
                {exportMsg.text}
              </span>
            )}
            <button
              type="button"
              onClick={runImport}
              disabled={importing || exporting != null}
              title="Import one or more previously exported Hall of Seasons or single-season .xlsx files"
              className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import (.xlsx)"}
            </button>
            {seasonHistory.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => runExport("all")}
                  disabled={importing || exporting != null}
                  title="Styled .xlsx — open or import it in Google Sheets / Excel with all colors intact"
                  className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors disabled:opacity-50"
                >
                  {exporting === "all" ? "Exporting…" : "Export All (.xlsx)"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove("all")}
                  className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70 hover:text-rift-redbright transition-colors"
                >
                  Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Which Hall to view — Season mode vs. each Reality. They never mix:
            season mode starts fresh each year, realities carry rosters forward. */}
        {realities.length > 0 && (
          <div className="mb-6 border border-rift-line/40 bg-rift-panel/30 px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-muted/55 mb-1.5">
              Viewing history of
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[{ id: "season", name: "Season Mode" }, ...realities.map((r) => ({ id: r.id, name: r.name }))].map(
                (opt) => {
                  const on = source === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSource(opt.id);
                        setSelectedId(null);
                      }}
                      className={`px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] border transition-all ${
                        on
                          ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                          : "border-rift-line text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright"
                      }`}
                    >
                      {opt.id === "season" ? opt.name : `Reality · ${opt.name}`}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}

        {/* Web fallback for the import file picker (desktop uses the
            native Open dialog instead). */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onImportFilePicked}
        />

        {/* Timeline ↔ Records tabs */}
        {seasonHistory.length > 0 && (
          <div className="flex items-center gap-1 mb-5">
            {(
              [
                { id: "timeline", label: "Timeline" },
                { id: "records", label: "Records & Dynasties" },
                { id: "search", label: "Search" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
                  tab === id
                    ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                    : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {seasonHistory.length === 0 ? (
          <p className="text-[11px] md:text-xs text-rift-mutedbright leading-snug max-w-2xl">
            No seasons archived yet. Finish a season and use “Add to Season
            History” on its dashboard — or archive a completed saved season
            from the Saved Seasons list — to build your timeline of
            champions, finalists, and the metas they played on. You can also
            restore a previously exported archive with “Import (.xlsx)”.
          </p>
        ) : tab === "records" ? (
          <RecordsPanel entries={seasonHistory} />
        ) : tab === "search" ? (
          <SearchPanel entries={seasonHistory} />
        ) : (
          <>
            {/* Timeline sub-views: per-season résumé, or one overall timeline */}
            <div className="flex items-center gap-1 mb-4">
              {(
                [
                  { id: "seasons", label: "By Season" },
                  { id: "overall", label: "Overall" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTimelineView(id)}
                  className={`px-3 py-1.5 border text-[9px] uppercase tracking-[0.25em] transition-all ${
                    timelineView === id
                      ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
                      : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {timelineView === "overall" ? (
              <OverallTimeline entries={seasonHistory} />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
            {/* Timeline list — scrollable so every season stays reachable
                while the selected season's résumé stays in view */}
            <div className="space-y-1.5 lg:max-h-[72vh] lg:overflow-y-auto lg:pr-1">
              {seasonHistory.map((entry) => {
                const active = entry.id === selected?.id;
                const date = new Date(entry.archivedAt);
                const dateLabel = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                return (
                  <div
                    key={entry.id}
                    className={`border transition-colors ${
                      active
                        ? "border-rift-gold/70 bg-rift-gold/[0.07]"
                        : "border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className="w-full text-left px-3 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-sm tracking-wider text-rift-goldbright truncate">
                          {entry.name}
                          {goldenRoadTeam(entry) && (
                            <span
                              className="ml-1.5 text-rift-goldbright"
                              title="Golden Road — a six-title sweep"
                              aria-label="Golden Road"
                            >
                              ★
                            </span>
                          )}
                        </span>
                        <span className="text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/50 flex-shrink-0 tabular-nums">
                          {dateLabel}
                        </span>
                      </div>
                      {entry.champion ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                          <span aria-hidden>🏆</span>
                          <TeamIcon
                            iconKey={entry.champion.iconKey}
                            logoUrl={
                              entry.champion.logoUrl ??
                              logoForTeamName(entry.champion.name)
                            }
                            size={12}
                            color={entry.champion.color}
                          />
                          <span className="truncate text-rift-mutedbright">
                            {entry.champion.name}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[9px] italic text-rift-muted">
                          {entry.complete
                            ? "No champion recorded"
                            : "Unfinished"}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(entry.id)}
                      className="w-full px-3 py-0.5 border-t border-rift-line/20 text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/30 hover:text-rift-redbright hover:bg-rift-red/5 transition-colors text-right"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Selected season */}
            {selected && (
              <div className="min-w-0 lg:sticky lg:top-4">
                <div className="flex items-center justify-end gap-4 mb-2">
                  {exportMsg?.where === "one" && (
                    <span
                      className={`text-[9px] uppercase tracking-[0.2em] ${
                        exportMsg.kind === "ok"
                          ? "text-rift-goldbright"
                          : "text-rift-redbright"
                      }`}
                    >
                      {exportMsg.text}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => runExport("one")}
                    disabled={exporting != null}
                    title="Export this season as a styled .xlsx — open or import it in Google Sheets / Excel"
                    className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/80 hover:text-rift-goldbright transition-colors disabled:opacity-50"
                  >
                    {exporting === "one" ? "Exporting…" : "Export Season (.xlsx)"}
                  </button>
                </div>
                <SeasonDetail entry={selected} />
              </div>
            )}
            </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={confirmRemove === "all"}
        title="Clear Season History?"
        message="Every archived season résumé will be permanently deleted. This cannot be undone."
        confirmLabel="Clear All"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          clearSeasonHistory(realityId);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
      <Modal
        open={confirmRemove != null && confirmRemove !== "all"}
        title="Remove From History?"
        message={`"${confirmEntry?.name ?? "This season"}" will be removed from the season history.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => {
          if (confirmRemove) removeSeasonFromHistory(confirmRemove, realityId);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
