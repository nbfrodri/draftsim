"use client";

import { useMemo, useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  diffMetaOverrides,
  goldenRoadTeam,
  type SeasonHistoryEntry,
  type SeasonHistoryTeamRef,
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
  DYNASTY_WINDOW,
  type TeamRecord,
  type DynastyTier,
} from "@/lib/season/historyRecords";
import { logoForTeamName } from "@/lib/season/realTeams";
import { isDesktop, openBinaryFileNative } from "@/lib/desktopStorage";
import {
  CHAMPION_META,
  TIER_ORDER,
  type MetaOverride,
  type MetaTier,
} from "@/lib/championMeta";
import type { Lane } from "@/lib/types";
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

      {/* International title holders */}
      {intls.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-[0.35em] text-rift-gold/60 mb-1.5">
            International Champions
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
            {intls.map((event) => (
              <span key={event} className="inline-flex items-center gap-1.5">
                <LeagueIcon league={event} size={14} />
                <span className="text-rift-muted/80">
                  {INTERNATIONAL_LABELS[event]}:
                </span>
                <TeamRef team={entry.intlChampions[event]!} size={12} />
              </span>
            ))}
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
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative story recap (archived seasons that carry one). */}
      {entry.story && (
        <SeasonStoryCard story={entry.story} title="Story of the Season" />
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
                    <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 flex-shrink-0">
                      {LANE_SHORT[p.lane]}
                    </span>
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
                    <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/70 flex-shrink-0">
                      {LANE_SHORT[p.lane]}
                    </span>
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
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center gap-1.5 border border-rift-line/30 bg-rift-bg/30 px-2 py-1 text-[10px] min-w-0"
                    >
                      {filter === "intl" && (
                        <LeagueIcon
                          league={row.key as InternationalId}
                          size={13}
                        />
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
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function SeasonHistoryView({ onBack }: { onBack: () => void }) {
  const seasonHistory = useDraftStore((s) => s.seasonHistory);
  const removeSeasonFromHistory = useDraftStore(
    (s) => s.removeSeasonFromHistory,
  );
  const clearSeasonHistory = useDraftStore((s) => s.clearSeasonHistory);
  const importSeasonHistory = useDraftStore((s) => s.importSeasonHistory);
  const champions = useDraftStore((s) => s.champions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"timeline" | "records">("timeline");
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
          clearSeasonHistory();
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
          if (confirmRemove) removeSeasonFromHistory(confirmRemove);
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}
