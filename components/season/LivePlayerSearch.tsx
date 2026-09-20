"use client";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
import {
  memo,
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useDraftStore } from "@/store/draftStore";
import {
  buildLivePlayerFeed,
  mergeLivePlayerSearch,
} from "@/lib/season/livePlayerSearch";
import type {
  SimResultEntry,
  SimResultTeamRef,
} from "@/lib/season/simResultsSummary";
import type { SeasonState } from "@/lib/season/types";
import type { MarketInactive } from "@/lib/season/faMarket";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import LaneIcon from "../LaneIcon";
import TeamIcon from "../TeamIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TierChip from "./TierChip";

const EMPTY_TEAMS: SeasonState["teams"] = [];
const EMPTY_POOL: MarketInactive[] = [];
const control =
  "inline-flex items-center gap-2 border border-rift-gold/40 bg-rift-gold/10 px-3 py-2 text-[9px] uppercase tracking-[0.15em] text-rift-goldbright hover:border-rift-gold hover:bg-rift-gold/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";
type Props = { entries: SimResultEntry[]; loading: boolean };

const STATUS: Record<string, { label: string; cls: string }> = {
  Academy: {
    label: "Acy",
    cls: "text-amber-300/90 border-amber-500/45 bg-amber-500/10",
  },
  "Free agent": {
    label: "FA",
    cls: "text-sky-300/90 border-sky-500/45 bg-sky-500/10",
  },
  Retired: {
    label: "Ret",
    cls: "text-rift-redbright/85 border-rift-red/45 bg-rift-red/10",
  },
};
function StatusBadge({ status }: { status: string }) {
  const badge = STATUS[status];
  return (
    <span
      title={status}
      aria-label={status}
      className={`shrink-0 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] ${badge?.cls ?? "border-rift-line text-rift-mutedbright bg-rift-bg/40"}`}
    >
      {badge?.label ?? status}
    </span>
  );
}
const TeamLabel = memo(function TeamLabel({
  team,
}: {
  team: SimResultTeamRef;
}) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      title={team.name}
    >
      <TeamIcon
        iconKey={team.iconKey}
        logoUrl={resolveTeamLogo(team.name, team.logoUrl)}
        color={team.color}
        size={16}
        className="shrink-0"
      />
      <span className="truncate">{team.name}</span>
    </span>
  );
});
function MoveEndpoint({
  name,
  team,
}: {
  name: string;
  team?: SimResultTeamRef;
}) {
  return team ? (
    <TeamLabel team={team} />
  ) : STATUS[name] ? (
    <StatusBadge status={name} />
  ) : (
    <span>{name}</span>
  );
}

/** Closed search has no store subscriptions, index construction or input rendering. */
export default function LivePlayerSearch(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  return (
    <div className="shrink-0 border-b border-rift-gold/20 bg-rift-panel/60">
      <div className="px-3 py-2">
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setOpen(true))}
          className={control}
        >
          <IconSearch size={13} aria-hidden="true" />
          Find a player
        </button>
      </div>
      {open && <SearchPanel {...props} panelId={panelId} onClose={close} />}
    </div>
  );
}
function SearchPanel({
  entries,
  loading,
  panelId,
  onClose,
}: Props & { panelId: string; onClose: () => void }) {
  useEscapeLayer(true, onClose, 20);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  return (
    <section
      id={panelId}
      aria-label="Find a player"
      onWheel={event => event.stopPropagation()}
      className="max-h-[45vh] overflow-y-auto overscroll-contain px-3 pb-3 text-xs"
    >
      <div className="flex gap-2">
        <input
          autoFocus
          aria-label="Search player names"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player names..."
          className="min-w-0 flex-1 border border-rift-line bg-rift-bg px-3 py-2 text-xs text-rift-mutedbright placeholder:text-rift-muted focus:border-rift-gold focus:outline-none"
        />
        <button
          type="button"
          aria-label="Close player search"
          onClick={onClose}
          className={control}
        >
          <IconX size={14} aria-hidden="true" />
        </button>
      </div>
      {deferredQuery.trim() ? (
        <SearchResults
          entries={entries}
          loading={loading}
          query={deferredQuery}
        />
      ) : (
        <p className="mt-2 text-[10px] text-rift-mutedbright">
          Search active players, academy players, free agents and retired
          players.
        </p>
      )}
    </section>
  );
}

const SearchResults = memo(function SearchResults({
  entries,
  loading,
  query,
}: Props & { query: string }) {
  // Match scores, standings and other season updates do not rebuild this search.
  const teams = useDraftStore((state) => state.season?.teams ?? EMPTY_TEAMS);
  const inactive = useDraftStore(
    (state) => state.season?.franchise?.inactivePool ?? EMPTY_POOL,
  );
  const feed = useMemo(() => buildLivePlayerFeed(entries), [entries]);
  const players = useMemo(
    () => mergeLivePlayerSearch(feed, teams, inactive),
    [feed, teams, inactive],
  );
  const names = useMemo(
    () =>
      players.map((player) => ({
        player,
        search: player.name.toLocaleLowerCase(),
      })),
    [players],
  );
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return names
      .filter((row) => row.search.includes(term))
      .map((row) => row.player);
  }, [names, query]);
  const [selection, setSelection] = useState<{
    id: string;
    query: string;
  } | null>(null);
  const selected =
    selection?.query === query
      ? players.find((player) => player.id === selection.id)
      : undefined;
  return (
    <>
      {!selected && (
        <div className="mt-2 max-h-48 overflow-y-auto pr-3">
          <p role="status" className="mb-2 text-[10px] text-rift-mutedbright">
            {matches.length} matches
            {matches.length > 30
              ? " - showing first 30, refine your search"
              : ""}
          </p>
          {matches.slice(0, 30).map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => setSelection({ id: player.id, query })}
              className="flex w-full flex-wrap items-center gap-2 border-b border-rift-line/30 px-2 py-2 text-left text-rift-mutedbright hover:bg-rift-gold/10 focus-visible:outline focus-visible:outline-rift-gold"
            >
              <LaneIcon lane={player.lane} size="xs" />
              <span className="min-w-0 flex-1 truncate">{player.name}</span>
              {player.team && (
                <span className="max-w-[45%] text-[10px]">
                  <TeamLabel team={player.team} />
                </span>
              )}
              <StatusBadge status={player.status} />
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-3 border border-rift-gold/25 bg-rift-bg/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <LaneIcon lane={selected.lane} size="sm" />
            <PlayerNameLink
              playerId={selected.id}
              name={selected.name}
              noNavigate={loading}
              hint={{
                player: selected.player ?? {
                  id: selected.id,
                  name: selected.name,
                  lane: selected.lane,
                  tier: selected.tier,
                  goodChamps: [],
                  badChamps: [],
                },
                teamName: selected.team?.name,
                lane: selected.lane,
              }}
              className="font-display text-sm text-rift-goldbright"
            />
            <TierChip tier={selected.tier} />
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="ml-auto px-2 py-1 text-[10px] text-rift-mutedbright hover:text-rift-goldbright"
            >
              Back to results
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-rift-mutedbright">
            <StatusBadge status={selected.status} />
            {selected.team && <TeamLabel team={selected.team} />}
          </div>
          <h4 className="mt-3 text-[9px] uppercase tracking-[0.15em] text-rift-gold">
            Roster moves in this live
          </h4>
          <p className="mt-1 text-[10px] text-rift-muted">
            {loading ? "Status updates as the simulation progresses. " : ""}
            Moves are limited to the detailed years retained in this feed.
          </p>
          <ul
            aria-label="Player roster moves"
            className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-3 text-[11px] text-rift-mutedbright"
          >
            {[...selected.moves].reverse().map((move, index) => (
              <li key={index} className="border border-rift-line/40 px-2 py-2">
                <span className="text-rift-goldbright">Year {move.year}</span> /{" "}
                {move.label}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <MoveEndpoint name={move.from} team={move.fromTeam} />
                  <span aria-hidden="true">&rarr;</span>
                  <MoveEndpoint name={move.to} team={move.toTeam} />
                </div>
              </li>
            ))}
          </ul>
          {!selected.moves.length && (
            <p className="mt-2 text-[11px] text-rift-muted">
              No roster moves recorded for this player in this live.
            </p>
          )}
        </div>
      )}
    </>
  );
});
