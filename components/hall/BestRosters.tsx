"use client";
import { useMemo, useState } from "react";
import { IconTrophy } from "@tabler/icons-react";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { LEAGUE_IDS, type LeagueId } from "@/lib/season/types";
import { bestRosters } from "@/lib/season/bestRosters";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import {
  buildTitleDataset,
  TROPHIES,
  TROPHY_LABELS,
  type Trophy,
  type TitleAward,
} from "@/lib/season/titlePlayground";
import LeagueIcon from "../LeagueIcon";
import LaneIcon from "../LaneIcon";
import SplitIcon from "../season/SplitIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamNameLink from "../team/TeamNameLink";
import PlaygroundSelect from "./PlaygroundSelect";
import GoToSeasonButton from "./GoToSeasonButton";
import { HallPager } from "./RecordRows";

const button =
  "inline-flex items-center justify-center gap-2 border px-3 py-2 text-[9px] uppercase tracking-[0.15em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold";
const on = "border-rift-gold/60 bg-rift-gold/10 text-rift-goldbright";
const off =
  "border-rift-line text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright";
function TrophyIcon({ trophy }: { trophy: Trophy }) {
  return trophy === "winter" || trophy === "spring" || trophy === "summer" ? (
    <SplitIcon split={trophy} size={15} />
  ) : (
    <LeagueIcon league={trophy} size={15} />
  );
}
export default function BestRosters({
  entries,
  onGoToSeason,
}: {
  entries: SeasonHistoryEntry[];
  onGoToSeason?: (id: string) => void;
}) {
  const data = useMemo(() => buildTitleDataset(entries), [entries]);
  const [regions, setRegions] = useState<LeagueId[]>([...LEAGUE_IDS]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState("10");
  const [page, setPage] = useState(0);
  const fromYear = from ? Number(from) : -Infinity;
  const toYear = to ? Number(to) : Infinity;
  const { rows, missingRosters } = useMemo(
    () => bestRosters(data, { regions, from: fromYear, to: toYear }),
    [data, regions, fromYear, toYear],
  );
  const years = [...new Set(data.years)]
    .sort((a, b) => a - b)
    .map((year) => ({ value: String(year), label: `Year ${year}` }));
  const capped = limit === "all" ? rows : rows.slice(0, Number(limit));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(capped.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = capped.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <section aria-label="Best rosters of all time" className="space-y-4">
      <header className="border border-rift-gold/25 bg-rift-panel/50 p-4">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.2em] text-rift-goldbright">
          <IconTrophy size={19} />
          Best Rosters of All Time
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-rift-mutedbright">
          The same five players, ranked by international titles, then split
          titles. Titles stay with the exact lineup that won them, even if it
          later reunited or changed clubs.
        </p>
        <p className="mt-1 text-[10px] text-rift-muted">
          Region filters use the club represented when each title was won. Tied
          records share a rank.
        </p>
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Roster regions"
        >
          <button
            type="button"
            aria-pressed={regions.length === LEAGUE_IDS.length}
            className={`${button} ${regions.length === LEAGUE_IDS.length ? on : off}`}
              onClick={() => {
                setRegions([...LEAGUE_IDS]);
                setPage(0);
              }}
            >
              All regions
            </button>
            {LEAGUE_IDS.map((region) => (
              <button
                key={region}
                type="button"
                aria-pressed={regions.includes(region)}
                className={`${button} ${regions.includes(region) ? on : off}`}
                onClick={() => {
                  setPage(0);
                  setRegions((current) =>
                    current.length === LEAGUE_IDS.length
                      ? [region]
                      : current.includes(region)
                        ? current.filter((value) => value !== region)
                        : [...current, region],
                  );
                }}
              >
              <LeagueIcon league={region} size={16} />
              {region}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-rift-line pt-4">
          <PlaygroundSelect
            label="From year"
            value={from}
            options={[{ value: "", label: "Beginning" }, ...years]}
            onChange={(value) => {
              setFrom(value);
              if (value && Number(value) > toYear) setTo(value);
              setPage(0);
            }}
          />
          <PlaygroundSelect
            label="To year"
            value={to}
            options={[{ value: "", label: "Latest" }, ...years]}
            onChange={(value) => {
              setTo(value);
              if (value && Number(value) < fromYear) setFrom(value);
              setPage(0);
            }}
          />
          <PlaygroundSelect
            label="Show rosters"
            value={limit}
            options={[
              { value: "10", label: "Top 10" },
              { value: "25", label: "Top 25" },
              { value: "all", label: "All rosters" },
            ]}
            onChange={(value) => {
              setLimit(value);
              setPage(0);
            }}
          />
          <button
            type="button"
            className={`${button} ${off}`}
            onClick={() => {
              setRegions([...LEAGUE_IDS]);
              setFrom("");
              setTo("");
              setPage(0);
            }}
          >
            Reset filters
          </button>
        </div>
      </header>
      {data.inferredYears && (
        <p className="text-[11px] text-rift-mutedbright">
          Archives without a year label use their chronological archive order.
        </p>
      )}
      {missingRosters > 0 && (
        <p
          role="status"
          className="border border-rift-gold/20 bg-rift-gold/5 p-3 text-xs text-rift-mutedbright"
        >
          {missingRosters} title{missingRosters === 1 ? "" : "s"} excluded: a
          complete five-player event snapshot is unavailable.
        </p>
      )}
      <p className="text-[10px] uppercase tracking-[0.15em] text-rift-mutedbright">
        {rows.length} winning roster{rows.length === 1 ? "" : "s"}
        {limit !== "all" ? ` · capped to top ${capped.length}` : ""}
      </p>
      {!rows.length && (
        <p className="border border-dashed border-rift-line p-6 text-center text-sm text-rift-mutedbright">
          No winning rosters with five recorded players match these filters.
        </p>
      )}
      <div>
      <ol className="space-y-3">
        {visible.map((row) => {
          const latest = row.awards[0];
          const clubs = [
            ...new Map(
              row.awards.map((award) => [
                `${award.team.leagueId}:${award.team.name}`,
                award,
              ]),
            ).values(),
          ];
          return (
            <li
              key={row.id}
              className="border border-rift-gold/25 bg-rift-panel/40 p-4"
              aria-label={`Roster rank ${row.rank}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-xl text-rift-goldbright">
                    #{row.rank}
                  </span>
                  {clubs.map((award) => (
                    <span
                      key={`${award.team.leagueId}:${award.team.name}`}
                      className="inline-flex items-center gap-2 text-xs text-rift-goldbright"
                    >
                      <LeagueIcon league={award.team.leagueId} size={15} />
                      <TeamNameLink
                        name={award.team.name}
                        leagueId={award.team.leagueId}
                        seasonId={award.seasonId}
                        phaseScope={award.trophy}
                        hint={award.team}
                        logoUrl={resolveTeamLogo(
                          award.team.name,
                          award.team.logoUrl,
                        )}
                        iconKey={award.team.iconKey}
                        color={award.team.color}
                      />
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-5 text-center tabular-nums">
                  <div>
                    <strong className="block font-display text-xl text-rift-goldbright">
                      {row.internationals}
                    </strong>
                    <span className="text-[9px] uppercase tracking-wider text-rift-mutedbright">
                      International titles
                    </span>
                  </div>
                  <div>
                    <strong className="block font-display text-xl text-rift-mutedbright">
                      {row.splits}
                    </strong>
                    <span className="text-[9px] uppercase tracking-wider text-rift-mutedbright">
                      Split titles
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-rift-muted">
                Latest winning snapshot: Year {latest.year} /{" "}
                {TROPHY_LABELS[latest.trophy]}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {row.players.map((player) => (
                  <div
                    key={player.id}
                    className="min-w-0 border border-rift-line/60 bg-rift-bg/40 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[9px] uppercase text-rift-mutedbright">
                      <LaneIcon lane={player.lane!} size="sm" />
                      {player.lane === "middle"
                        ? "Mid"
                        : player.lane === "bottom"
                          ? "Bot"
                          : player.lane}
                    </div>
                    <PlayerNameLink
                      playerId={player.id}
                      name={player.name}
                      seasonId={latest.seasonId}
                      phaseScope={latest.trophy}
                      className="block truncate text-xs text-rift-goldbright"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {TROPHIES.filter((trophy) => row.counts[trophy] > 0).map(
                  (trophy) => (
                    <span
                      key={trophy}
                      className="inline-flex items-center gap-1.5 border border-rift-line/50 px-2 py-1 text-[10px] text-rift-mutedbright"
                    >
                      <TrophyIcon trophy={trophy} />
                      {TROPHY_LABELS[trophy]}{" "}
                      <strong className="text-rift-goldbright">
                        {row.counts[trophy]}
                      </strong>
                    </span>
                  ),
                )}
              </div>
              <RosterTitleHistory
                awards={row.awards}
                onGoToSeason={onGoToSeason}
              />
            </li>
          );
        })}
      </ol>
      <HallPager
        page={currentPage}
        pageCount={pageCount}
        total={capped.length}
        pageSize={pageSize}
        label="Best roster pages"
        previousLabel="Previous rosters"
        nextLabel="Next rosters"
        onChange={setPage}
      />
      </div>
    </section>
  );
}

function RosterTitleHistory({
  awards,
  onGoToSeason,
}: {
  awards: TitleAward[];
  onGoToSeason?: (id: string) => void;
}) {
  const [trophy, setTrophy] = useState<Trophy | null>(null);
  const filtered = trophy
    ? awards.filter((award) => award.trophy === trophy)
    : awards;
  return (
    <details className="mt-3 border-t border-rift-line/50 pt-3">
      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.12em] text-rift-goldbright">
        Title history ({awards.length})
      </summary>
      <div
        role="group"
        aria-label="Filter title history by event"
        className="mt-3 flex flex-wrap gap-2"
      >
        <button
          type="button"
          aria-pressed={trophy === null}
          className={`${button} ${trophy === null ? on : off}`}
          onClick={() => setTrophy(null)}
        >
          All titles
        </button>
        {TROPHIES.map((event) => (
          <button
            key={event}
            type="button"
            aria-label={TROPHY_LABELS[event]}
            aria-pressed={trophy === event}
            className={`${button} ${trophy === event ? on : off}`}
            onClick={() =>
              setTrophy((current) => (current === event ? null : event))
            }
          >
            <TrophyIcon trophy={event} />
            {TROPHY_LABELS[event]}
            <span className="border-l border-current/20 pl-2 tabular-nums opacity-70">
              {awards.filter((award) => award.trophy === event).length}
            </span>
          </button>
        ))}
      </div>
      <p role="status" className="mt-3 text-[10px] text-rift-mutedbright">
        {filtered.length} of {awards.length} titles
      </p>
      {!filtered.length && (
        <p className="mt-2 border border-dashed border-rift-line p-3 text-xs text-rift-mutedbright">
          No {trophy ? TROPHY_LABELS[trophy] : "matching"} titles within the
          selected regions and years.
        </p>
      )}
      <ul
        aria-label="Title history results"
        className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-3"
      >
        {filtered.map((award) => (
          <li
            key={award.id}
            className="flex flex-wrap items-center gap-3 border border-rift-line/40 px-3 py-2 text-[11px] text-rift-mutedbright"
          >
            <span className="text-rift-goldbright">Year {award.year}</span>
            <GoToSeasonButton
              seasonId={award.seasonId}
              seasonLabel={award.seasonName}
              onGoToSeason={onGoToSeason}
            />
            <TrophyIcon trophy={award.trophy} />
            <span>{TROPHY_LABELS[award.trophy]}</span>
            <LeagueIcon league={award.team.leagueId} size={14} />
            <TeamNameLink
              name={award.team.name}
              leagueId={award.team.leagueId}
              seasonId={award.seasonId}
              phaseScope={award.trophy}
              hint={award.team}
              logoUrl={resolveTeamLogo(award.team.name, award.team.logoUrl)}
              iconKey={award.team.iconKey}
              color={award.team.color}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
