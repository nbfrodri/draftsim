"use client";

import { useMemo, useState } from "react";
import { computeChampionAttribution, getTeam } from "@/lib/tournament";
import type { ChampionAttribution, TournamentState } from "@/lib/tournament";
import type { Champion } from "@/lib/types";

// Champion search panel: type a name (or alias prefix), get the
// champion's tournament-wide picks/bans/wins/losses + which teams played
// them most. Picks-only matches the search results when there's a clear
// single hit (e.g. typing "Aatr" → Aatrox); ambiguous queries show a
// suggestion list.
export function ChampionSearchPanel({
  tournament,
  byId,
}: {
  tournament: TournamentState;
  byId: Map<number, Champion>;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const champions = useMemo(() => Array.from(byId.values()), [byId]);
  // Restrict suggestions to champions that actually appear in the
  // tournament — we don't want to drown the panel in unused roster.
  const tournamentChampionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of tournament.matches) {
      if (!m.series) continue;
      for (const g of m.series.games) {
        for (const id of [
          ...g.bluePicks,
          ...g.redPicks,
          ...g.blueBans,
          ...g.redBans,
        ]) {
          if (id != null) ids.add(id);
        }
      }
    }
    return ids;
  }, [tournament]);

  // Sorted list of every champion that appeared in this tournament,
  // alphabetically. Powers the browse-all expandable section.
  const allTournamentChampions = useMemo(() => {
    return champions
      .filter((c) => tournamentChampionIds.has(c.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, tournamentChampionIds]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return champions
      .filter(
        (c) =>
          tournamentChampionIds.has(c.id) &&
          (c.name.toLowerCase().includes(q) ||
            c.alias.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, champions, tournamentChampionIds]);

  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;
  const attribution = useMemo(() => {
    if (selectedId == null) return null;
    return computeChampionAttribution(tournament, selectedId);
  }, [tournament, selectedId]);

  return (
    <div className="border border-rift-line/50 bg-rift-panel/40 p-3 md:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Champion Lookup
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          {tournamentChampionIds.size} champions in tournament
        </span>
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a champion name…"
          className="w-full bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-sm px-3 py-2 outline-none focus:border-rift-gold/60"
        />
        {suggestions.length > 0 && query.trim() && (
          <div className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-y-auto border border-rift-line bg-rift-panel shadow-lg">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setQuery("");
                }}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-rift-gold/10 transition-colors"
              >
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className="w-7 h-7 border border-rift-line/60"
                />
                <span className="text-[12px] font-display tracking-wider text-rift-mutedbright">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Browse-all expandable. A scrollable grid of every champion
          that appeared in the tournament — useful when you don't
          remember the exact name to search. */}
      {allTournamentChampions.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setBrowseOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 border border-rift-line text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            <span>
              {browseOpen ? "Hide" : "Browse"} all champions played
            </span>
            <span className="text-rift-gold/60">
              {browseOpen ? "▾" : "▸"}
            </span>
          </button>
          {browseOpen && (
            <div className="mt-2 max-h-72 overflow-y-auto border border-rift-line/40 bg-rift-bg/30 p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
              {allTournamentChampions.map((c) => {
                const isSelected = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setQuery("");
                    }}
                    className={`flex items-center gap-1.5 px-1.5 py-1 border text-left transition-colors ${
                      isSelected
                        ? "border-rift-gold bg-rift-gold/10"
                        : "border-rift-line/30 hover:border-rift-gold/50 hover:bg-rift-gold/5"
                    }`}
                  >
                    <img
                      src={c.iconUrl}
                      alt={c.name}
                      className="w-6 h-6 border border-rift-line/60 flex-shrink-0"
                    />
                    <span className="text-[10px] font-display tracking-wider text-rift-mutedbright truncate">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selected && attribution && (
        <ChampionAttributionView
          tournament={tournament}
          champion={selected}
          attribution={attribution}
          onClear={() => setSelectedId(null)}
        />
      )}
      {selectedId != null && !attribution && (
        <div className="mt-3 text-[11px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
          {selected?.name ?? "Champion"} did not appear in any pick or ban.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-rift-goldbright",
}: {
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
        {label}
      </div>
      <div className={`font-display text-base tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function ChampionAttributionView({
  tournament,
  champion,
  attribution,
  onClear,
}: {
  tournament: TournamentState;
  champion: Champion;
  attribution: ChampionAttribution;
  onClear: () => void;
}) {
  const games = attribution.totalWins + attribution.totalLosses;
  const wrPct = games > 0 ? Math.round((attribution.totalWins / games) * 100) : null;
  const wrColor =
    wrPct == null
      ? "text-rift-mutedbright/40"
      : wrPct >= 60
      ? "text-emerald-300"
      : wrPct < 40
      ? "text-rift-redbright"
      : "text-rift-mutedbright";
  const topTeam =
    attribution.byTeam.find((row) => row.picks > 0) ?? null;
  const topTeamObj = topTeam ? getTeam(tournament, topTeam.teamId) : null;
  return (
    <div className="mt-3 border border-rift-gold/40 bg-rift-bg/40 p-3">
      <div className="flex items-start gap-3">
        <img
          src={champion.iconUrl}
          alt={champion.name}
          className="w-14 h-14 md:w-16 md:h-16 border-2 border-rift-gold/60 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <div className="font-display text-xl tracking-wider text-rift-goldbright truncate">
              {champion.name}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 hover:text-rift-redbright transition-colors ml-auto"
            >
              Clear
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat label="Picks" value={attribution.totalPicks} />
            <Stat label="Bans" value={attribution.totalBans} />
            <Stat label="Wins" value={attribution.totalWins} />
            <Stat label="Losses" value={attribution.totalLosses} />
            <Stat
              label="WR"
              value={wrPct != null ? `${wrPct}%` : "—"}
              valueClass={wrColor}
            />
          </div>
        </div>
      </div>
      {topTeamObj && (
        <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          Most picked by:&nbsp;
          <span className="text-rift-goldbright font-display tracking-wider">
            {topTeamObj.name}
          </span>
          <span className="text-rift-mutedbright/50">
            &nbsp;· {topTeam!.picks} picks · {topTeam!.wins}-{topTeam!.losses}
          </span>
        </div>
      )}
      {/* Per-team breakdown for THIS champion */}
      <div className="mt-3 border-t border-rift-line/40 pt-2">
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60 mb-1.5">
          Per-team breakdown
        </div>
        <div className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] gap-2 px-2 py-1 text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/55">
          <span>Team</span>
          <span className="text-center">P</span>
          <span className="text-center">B</span>
          <span className="text-center">W-L</span>
        </div>
        {attribution.byTeam.map((row) => {
          const team = getTeam(tournament, row.teamId);
          if (!team) return null;
          return (
            <div
              key={row.teamId}
              className="grid grid-cols-[1fr_2.5rem_2.5rem_3rem] gap-2 px-2 py-1 text-[10px] md:text-[11px] border-t border-rift-line/15"
            >
              <span className="font-display tracking-wider text-rift-mutedbright truncate">
                {team.name}
              </span>
              <span className="text-center tabular-nums text-rift-bluebright">
                {row.picks}
              </span>
              <span className="text-center tabular-nums text-rift-redbright">
                {row.bans}
              </span>
              <span className="text-center tabular-nums text-rift-mutedbright/85">
                {row.wins}-{row.losses}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
