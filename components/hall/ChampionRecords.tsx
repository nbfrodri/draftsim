"use client";
import { useMemo, useState } from "react";
import { championRecords } from "@/lib/season/championRecords";
import type { SeasonHistoryEntry } from "@/lib/season/history";
import { useDraftStore } from "@/store/draftStore";
import PlaygroundSelect from "./PlaygroundSelect";
import PlayerNameLink from "../player/PlayerNameLink";
import LaneIcon from "../LaneIcon";

const columns =
  "grid grid-cols-[minmax(140px,1fr)_repeat(4,6rem)] items-center gap-3";
const number = (n: number) => n.toLocaleString();
const winRateTone = (wins: number, games: number) =>
  wins * 2 > games ? "text-rift-bluebright" : wins * 2 < games ? "text-rift-redbright" : "text-rift-mutedbright";
export default function ChampionRecords({
  entries,
}: {
  entries: SeasonHistoryEntry[];
}) {
  const [limit, setLimit] = useState("10");
  const [playersLimit, setPlayersLimit] = useState("3");
  const champions = useDraftStore((s) => s.champions);
  const catalogue = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );
  const data = useMemo(() => championRecords(entries), [entries]);
  const rows = limit === "all" ? data.rows : data.rows.slice(0, Number(limit));
  return (
    <section
      aria-label="Most played champions"
      className="border border-rift-line/40 bg-rift-panel/20 p-3"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/70">
            Most played champions
          </h3>
          <p className="mt-1 text-[10px] text-rift-mutedbright">
            Recorded picks across this history · {data.seasons} seasons. Open a
            champion to see its most frequent players.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PlaygroundSelect
            label="Champions shown"
            value={limit}
            onChange={setLimit}
            options={[
              { value: "10", label: "Top 10" },
              { value: "25", label: "Top 25" },
              { value: "50", label: "Top 50" },
              { value: "all", label: "All champions" },
            ]}
          />
          <PlaygroundSelect
            label="Players per champion"
            value={playersLimit}
            onChange={setPlayersLimit}
            options={[
              { value: "3", label: "Top 3" },
              { value: "5", label: "Top 5" },
              { value: "10", label: "Top 10" },
            ]}
          />
        </div>
      </div>
      {data.incompleteSeasons > 0 && (
        <p
          role="status"
          className="mb-3 border border-rift-gold/30 bg-rift-gold/5 p-2 text-[10px] text-rift-goldbright"
        >
          {data.incompleteSeasons} season(s) have missing or incomplete champion
          pools, including older capped archives. Only recorded picks are
          counted.
        </p>
      )}
      <p aria-live="polite" className="mb-2 text-[9px] text-rift-mutedbright">
        Showing {rows.length} of {data.rows.length} champions · Player position
        follows their latest recorded season on that champion.
      </p>
      {!rows.length ? (
        <p className="py-6 text-center text-[11px] text-rift-mutedbright">
          No champion usage recorded in this history yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[700px] max-h-[640px] overflow-y-auto pr-3 [scrollbar-gutter:stable]">
            <div
              className={
                columns +
                " sticky top-0 z-10 bg-rift-bg border-b border-rift-line/40 px-2 py-2 text-[8px] uppercase tracking-[0.15em] text-rift-mutedbright"
              }
            >
              <span>Champion / player</span>
              <span className="text-center">Games</span>
              <span className="text-center">Wins</span>
              <span className="text-center">Losses</span>
              <span className="text-center" title="Wins divided by total games">
                WR
              </span>
            </div>
            <div>
              {rows.map((row, index) => {
                const champ = catalogue.get(row.championId);
                return (
                  <details
                    key={row.championId}
                    className="group border-b border-rift-line/30"
                  >
                    <summary
                      aria-label={`${champ?.name ?? "#" + row.championId}: ${row.games} games`}
                      className={
                        columns +
                        " cursor-pointer list-none px-2 py-2.5 text-[11px] hover:bg-rift-gold/5 focus-visible:outline focus-visible:outline-rift-gold"
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-[9px] text-rift-mutedbright">
                          {index + 1}
                        </span>
                        {champ?.iconUrl && (
                          <img
                            src={champ.iconUrl}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-sm border border-rift-line/50"
                          />
                        )}
                        <span className="truncate text-rift-goldbright">
                          {champ?.name ?? `Champion #${row.championId}`}
                        </span>
                        <span
                          aria-hidden
                          className="ml-auto text-rift-gold/60 group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </span>
                      <span className="text-center tabular-nums text-rift-goldbright">
                        {number(row.games)}
                      </span>
                      <span className="text-center tabular-nums text-rift-bluebright">
                        {number(row.wins)}
                      </span>
                      <span className="text-center tabular-nums text-rift-redbright">
                        {number(row.losses)}
                      </span>
                      <span className={`text-center tabular-nums font-semibold ${winRateTone(row.wins, row.games)}`}>
                        {((row.wins / row.games) * 100).toFixed(1)}%
                      </span>
                    </summary>
                    <div className="mb-2 border-l border-rift-gold/30 bg-rift-bg/30 ml-7">
                      <p className="px-2 py-2 text-[8px] uppercase tracking-[0.15em] text-rift-gold/70">
                        Most frequent players · Top {playersLimit}
                      </p>
                      {row.players
                        .slice(0, Number(playersLimit))
                        .map((player, i) => (
                          <div
                            key={player.id}
                            className={columns + " px-2 py-1.5 text-[10px]"}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="w-4 text-[9px] text-rift-mutedbright">
                                {i + 1}
                              </span>
                              {player.lane && (
                                <LaneIcon lane={player.lane} size="sm" />
                              )}
                              <PlayerNameLink
                                playerId={player.id}
                                name={player.name}
                                seasonId={player.seasonId}
                                className="min-w-0 text-rift-goldbright"
                              />
                            </span>
                            <span className="text-center tabular-nums text-rift-mutedbright">
                              {number(player.games)}
                            </span>
                            <span className="text-center tabular-nums text-rift-bluebright">
                              {number(player.wins)}
                            </span>
                            <span className="text-center tabular-nums text-rift-redbright">
                              {number(player.losses)}
                            </span>
                            <span className={`text-center tabular-nums font-semibold ${winRateTone(player.wins, player.games)}`}>
                              {((player.wins / player.games) * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
