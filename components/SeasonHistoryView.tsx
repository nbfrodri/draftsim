"use client";

import { useMemo, useRef, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  diffMetaOverrides,
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
  DYNASTY_THRESHOLD,
  type TeamRecord,
} from "@/lib/season/historyRecords";
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
  type SplitId,
} from "@/lib/season/types";
import TeamIcon from "./TeamIcon";
import Modal from "./Modal";
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
      <TeamIcon iconKey={team.iconKey} size={size} color={team.color} />
      <span
        className={`truncate ${muted ? "text-rift-mutedbright" : "text-rift-goldbright"}`}
      >
        {team.name}
      </span>
      <span className="text-[9px] uppercase tracking-[0.15em] text-rift-muted/70 flex-shrink-0">
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
  const rows = [...records]
    .filter((r) => count(r) > 0)
    .sort((a, b) => count(b) - count(a) || a.team.name.localeCompare(b.team.name))
    .slice(0, 5);
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
        <div className="divide-y divide-rift-line/15">
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
function RecordsPanel({ entries }: { entries: SeasonHistoryEntry[] }) {
  const records = useMemo(() => computeTeamRecords(entries), [entries]);
  const byRegion = useMemo(() => splitWinnersByRegion(records), [records]);
  const intlDetail = (r: TeamRecord) =>
    INTL_ORDER.filter((e) => (r.intlTitles[e] ?? 0) > 0)
      .map((e) => `${r.intlTitles[e]}× ${INTERNATIONAL_LABELS[e]}`)
      .join(" · ");

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

      {/* Per-region split winners — dynasty badge at 3+ titles */}
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
                <div className="px-3 py-1.5 border-b border-rift-line/30 text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
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
                      {r.splitTitles >= DYNASTY_THRESHOLD && (
                        <span className="px-1.5 py-px border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.25em] flex-shrink-0">
                          Dynasty
                        </span>
                      )}
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
  const handleImportBytes = async (data: ArrayBuffer) => {
    setImporting(true);
    setExportMsg(null);
    const parsed = await parseHistoryWorkbook(data, Date.now());
    setImporting(false);
    if (!parsed.ok) {
      setExportMsg({ where: "import", kind: "err", text: parsed.error });
    } else {
      const { added, updated } = importSeasonHistory(parsed.entries);
      const total = added + updated;
      setExportMsg({
        where: "import",
        kind: "ok",
        text: `Imported ${total} season${total === 1 ? "" : "s"}${updated > 0 ? ` (${updated} updated)` : ""} ✓`,
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
      });
      if (result.ok && result.content) {
        const bytes = result.content;
        const copy = new Uint8Array(bytes); // detach from any shared buffer
        await handleImportBytes(copy.buffer);
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
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    await handleImportBytes(await file.arrayBuffer());
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
              title="Import a previously exported Hall of Seasons or single-season .xlsx"
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
          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
            {/* Timeline list */}
            <div className="space-y-1.5">
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
              <div className="min-w-0">
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
