"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame, fearlessLockedSet } from "@/lib/series";
import { assignLanesToPicks, currentAction } from "@/lib/draftEngine";
import { getSynergy } from "@/lib/championMeta";
import { MAIN_POOL, playerForLane, poolBias } from "@/lib/players";
import type { Champion, Lane, PlayerTier, Roster, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";
import TeamName from "./TeamName";

// Per-tier styling for the small player-tier badge on a locked pick slot.
const TIER_BADGE: Record<PlayerTier, string> = {
  S: "text-rift-goldbright border-rift-gold/60 bg-rift-gold/10",
  A: "text-rift-bluebright border-rift-blue/50 bg-rift-blue/10",
  B: "text-rift-mutedbright border-rift-line",
  C: "text-rift-muted border-rift-line/60",
  D: "text-rift-muted border-rift-red/30",
};

interface Props {
  champions: Champion[];
  side: Side;
}

export default function TeamPanel({ champions, side }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const selectedId = useDraftStore((s) => s.selectedChampionId);
  const game = currentGame(series);
  const action = currentAction(game);

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c])),
    [champions],
  );

  const picks = side === "blue" ? game.bluePicks : game.redPicks;
  const bans = side === "blue" ? game.blueBans : game.redBans;
  const teamName = side === "blue" ? series.blueTeam : series.redTeam;
  // Player roster for this side (when configured). Drives the per-slot tier
  // badge and the good/bad pool-fit indicator.
  const roster = side === "blue" ? series.bluePlayers : series.redPlayers;

  // Availability of any champion right now, for the pool display: champions
  // banned/picked this game, or locked out by fearless from earlier games,
  // are shown dimmed so the pool reflects what's actually still draftable.
  const fearlessLocked = useMemo(() => fearlessLockedSet(series), [series]);
  const champStatus = useCallback(
    (id: number): ChampStatus => {
      if (fearlessLocked.has(id)) return "fearless";
      if (game.blueBans.includes(id) || game.redBans.includes(id))
        return "banned";
      if (game.bluePicks.includes(id) || game.redPicks.includes(id))
        return "picked";
      return "available";
    },
    [fearlessLocked, game],
  );

  // Whether this side has any champion-pool data to show.
  const hasPools = !!roster?.some(
    (p) => p.goodChamps.length > 0 || p.badChamps.length > 0,
  );

  const sideConfig = side === "blue"
    ? {
        textColor: "text-rift-blue",
        brightColor: "text-rift-bluebright",
        borderColor: "border-rift-blue/40",
        bgHeader: "bg-gradient-to-b from-rift-bluedeep/60 to-rift-blue/10",
        accentBar: "bg-gradient-to-r from-transparent via-rift-blue to-transparent",
      }
    : {
        textColor: "text-rift-red",
        brightColor: "text-rift-redbright",
        borderColor: "border-rift-red/40",
        bgHeader: "bg-gradient-to-b from-rift-reddeep/60 to-rift-red/10",
        accentBar: "bg-gradient-to-r from-transparent via-rift-red to-transparent",
      };

  const isOurActiveAction = action?.side === side;
  const previewing =
    isOurActiveAction && selectedId != null
      ? { kind: action.kind, slot: action.slot, id: selectedId }
      : null;

  // Live role assignment shown during draft. Null picks stay null so we only
  // show a lane icon for champions that have actually been locked in.
  const liveRoles = useMemo<(Lane | null)[]>(
    () => assignLanesToPicks(picks, champions),
    [picks, champions],
  );

  // Live champion-pair synergies — recomputed every time picks change so
  // the moment a synergistic pair locks in, the badge appears in the panel.
  const activeSynergies = useMemo(() => {
    const aliases: string[] = [];
    for (const id of picks) {
      if (id == null) continue;
      const c = byId.get(id);
      if (c) aliases.push(c.alias);
    }
    const out: { tag: string; bonus: number }[] = [];
    for (let i = 0; i < aliases.length; i++) {
      for (let j = i + 1; j < aliases.length; j++) {
        const s = getSynergy(aliases[i], aliases[j]);
        if (s) out.push({ tag: s.tag, bonus: s.bonus });
      }
    }
    out.sort((a, b) => b.bonus - a.bonus);
    return out;
  }, [picks, byId]);

  return (
    <aside
      className={`flex flex-col border ${sideConfig.borderColor} bg-rift-panel/50 backdrop-blur-sm shrink-0 md:w-[var(--panel-w)] overflow-hidden`}
    >
      {/* Team name header */}
      <div
        className={`relative px-3 md:px-4 py-2 border-b ${sideConfig.borderColor} ${sideConfig.bgHeader} text-center shrink-0`}
      >
        <div
          className={`font-display text-sm md:text-base ${sideConfig.brightColor} tracking-[0.2em] uppercase truncate`}
        >
          <TeamName name={teamName} size={18} />
        </div>
        <div
          className={`text-[9px] md:text-[10px] uppercase tracking-[0.35em] ${sideConfig.textColor}/70 mt-0.5`}
        >
          {side} side
        </div>
        <div className={`absolute left-0 right-0 bottom-0 h-[1px] ${sideConfig.accentBar}`} />
      </div>

      {/* Bans — on TOP */}
      <div
        className={`border-b ${sideConfig.borderColor} px-2 md:px-3 py-1.5 md:py-2 shrink-0`}
      >
        <div
          className={`text-[9px] md:text-[10px] uppercase tracking-[0.35em] ${sideConfig.textColor}/70 mb-1.5 text-center`}
        >
          Bans
        </div>
        <div className="flex gap-1 md:gap-1.5 justify-center flex-wrap">
          {bans.map((id, slot) => {
            const preview =
              previewing?.kind === "ban" && previewing.slot === slot
                ? previewing.id
                : null;
            const showId = id ?? preview;
            const showChamp = showId != null ? byId.get(showId) : undefined;
            const isCurrent =
              !id &&
              action?.kind === "ban" &&
              action.side === side &&
              action.slot === slot;
            return (
              <BanSlot
                key={`ban-${slot}`}
                champ={showChamp}
                isCurrent={isCurrent}
                isPreview={preview != null && id == null}
                side={side}
                locked={id != null}
              />
            );
          })}
        </div>
      </div>

      {/* Picks — mobile: 5 small squares across. desktop: vertical list of
          horizontal rows. Natural height (shrink-0) so all five slots always
          show; the info region below absorbs the leftover space. */}
      <div className="p-2 md:p-2 grid grid-cols-5 md:grid-cols-1 gap-1.5 md:gap-1.5 md:content-start shrink-0">
        {picks.map((id, slot) => {
          const preview =
            previewing?.kind === "pick" && previewing.slot === slot
              ? previewing.id
              : null;
          const showId = id ?? preview;
          const showChamp = showId != null ? byId.get(showId) : undefined;
          const isCurrent =
            !id &&
            action?.kind === "pick" &&
            action.side === side &&
            action.slot === slot;
          const slotLane = id != null ? liveRoles[slot] : null;
          const slotPlayer = playerForLane(roster, slotLane);
          return (
            <PickSlot
              key={`pick-${slot}`}
              champ={showChamp}
              isCurrent={isCurrent}
              isPreview={preview != null && id == null}
              side={side}
              locked={id != null}
              role={id != null ? liveRoles[slot] : null}
              playerTier={id != null ? slotPlayer?.tier ?? null : null}
              poolSign={id != null && slotPlayer ? poolBias(slotPlayer, id) : 0}
            />
          );
        })}
      </div>

      {/* Info region — live synergies + champion pools share whatever vertical
          space is left below the picks and scroll together. Keeping them in one
          flex-1/min-h-0 scroll container means adding the synergies section (or
          a long champion-pool list) never clips the panel or pushes a pick off
          screen — the region just scrolls. */}
      {(activeSynergies.length > 0 || hasPools) && (
        <div className="md:flex-1 md:min-h-0 overflow-y-auto custom-scroll flex flex-col">
          {/* Live synergies — shown only when at least one pair fires. */}
          {activeSynergies.length > 0 && (
            <div className={`border-t ${sideConfig.borderColor} px-2 py-1.5 shrink-0`}>
              <div
                className={`text-[8px] md:text-[9px] uppercase tracking-[0.35em] ${sideConfig.textColor}/70 mb-1 text-center`}
              >
                Synergies · {activeSynergies.length}
              </div>
              <div className="flex flex-wrap gap-1">
                {activeSynergies.map((s, i) => (
                  <span
                    key={`${s.tag}-${i}`}
                    className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border border-rift-gold/50 bg-gradient-to-r from-rift-gold/10 to-rift-gold/5 text-rift-goldbright leading-tight"
                    title={`Bonus +${s.bonus}`}
                  >
                    ★ {s.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Champion pools — each player's comfort (good) and weak (bad)
              picks, plus a team aggregate, so the user can target bans and
              anticipate picks during the draft. */}
          {hasPools && roster && (
            <ChampPools
              roster={roster}
              byId={byId}
              champStatus={champStatus}
              textColor={sideConfig.textColor}
              borderColor={sideConfig.borderColor}
            />
          )}
        </div>
      )}
    </aside>
  );
}

// Draftability of a pool champion right now. Anything not "available" is
// off the board and rendered dimmed/struck-through.
type ChampStatus = "available" | "banned" | "picked" | "fearless";

const STATUS_LABEL: Record<Exclude<ChampStatus, "available">, string> = {
  banned: "Banned this game",
  picked: "Already picked",
  fearless: "Used earlier — fearless lock",
};

// A single champion chip in a pool row. Green ring = comfort, red ring =
// off-pool. When the champion is no longer draftable (banned/picked this
// game, or fearless-locked from a prior game) it greys out with a slash so
// the pool reflects what's actually still on the board.
function PoolChip({
  champ,
  tone,
  status,
  subtle = false,
}: {
  champ: Champion;
  tone: "good" | "bad";
  status: ChampStatus;
  // A secondary ("flex") liked pick — same green family, dimmed so the
  // first-three mains read as the signature pool at a glance.
  subtle?: boolean;
}) {
  const ring =
    tone === "good"
      ? subtle
        ? "ring-rift-support/40"
        : "ring-rift-support/70"
      : "ring-rift-red/60";
  const toneLabel =
    tone === "good" ? (subtle ? "Secondary" : "Main") : "Bad";
  const gone = status !== "available";
  const dim = gone ? "grayscale opacity-40" : subtle ? "opacity-75" : "";
  const title = gone
    ? `${toneLabel}: ${champ.name} · ${STATUS_LABEL[status]}`
    : `${toneLabel}: ${champ.name}`;
  return (
    <span className="relative inline-flex shrink-0" title={title}>
      <img
        src={champ.iconUrl}
        alt={champ.name}
        draggable={false}
        className={`w-5 h-5 rounded-sm ring-1 ${ring} ${dim}`}
      />
      {gone && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-[150%] h-[1.5px] bg-rift-redbright/80 rotate-45 rounded-full" />
        </span>
      )}
    </span>
  );
}

// One good/bad row: a coloured accent bar + tinted track + champion chips.
// Returns null when empty so a player with only good (or only bad) picks
// doesn't render a blank line.
function PoolRow({
  ids,
  tone,
  byId,
  champStatus,
  tiered = false,
}: {
  ids: number[];
  tone: "good" | "bad";
  byId: Map<number, Champion>;
  champStatus: (id: number) => ChampStatus;
  // Per-player liked rows are ordered (mains first), so split the first
  // MAIN_POOL as mains and dim the rest. The team-aggregate union has no
  // meaningful order, so it leaves this off.
  tiered?: boolean;
}) {
  if (ids.length === 0) return null;
  const isGood = tone === "good";
  const bar = isGood ? "bg-rift-support" : "bg-rift-red";
  const tint = isGood ? "bg-rift-support/[0.06]" : "bg-rift-red/[0.06]";
  const splitMains = tiered && isGood && ids.length > MAIN_POOL;
  return (
    <div className={`flex items-stretch gap-1.5 rounded-sm ${tint} pr-1`}>
      <span className={`shrink-0 w-[2px] rounded-full ${bar}`} aria-hidden />
      <div className="flex flex-wrap gap-0.5 py-0.5">
        {ids.map((id, idx) => {
          const c = byId.get(id);
          if (!c) return null;
          const subtle = tiered && isGood && idx >= MAIN_POOL;
          return (
            <Fragment key={id}>
              {/* Thin divider between mains and secondary picks. */}
              {splitMains && idx === MAIN_POOL && (
                <span
                  className="self-stretch w-px bg-rift-support/30 mx-0.5"
                  aria-hidden
                />
              )}
              <PoolChip
                champ={c}
                tone={tone}
                status={champStatus(id)}
                subtle={subtle}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Small dim section label ("Team", "By Player").
function PoolSubhead({ children }: { children: ReactNode }) {
  return (
    <div className="text-[7px] uppercase tracking-[0.3em] text-rift-muted/70 mb-1">
      {children}
    </div>
  );
}

function ChampPools({
  roster,
  byId,
  champStatus,
  textColor,
  borderColor,
}: {
  roster: Roster;
  byId: Map<number, Champion>;
  champStatus: (id: number) => ChampStatus;
  textColor: string;
  borderColor: string;
}) {
  // Team aggregate = union of every player's pools. A champion someone is
  // good at outranks one someone else is bad at, so it shows only as good.
  const { teamGood, teamBad } = useMemo(() => {
    const good = new Set<number>();
    const bad = new Set<number>();
    for (const p of roster) {
      for (const id of p.goodChamps) good.add(id);
      for (const id of p.badChamps) bad.add(id);
    }
    for (const id of good) bad.delete(id);
    return { teamGood: [...good], teamBad: [...bad] };
  }, [roster]);

  // Only list players that actually have a pool configured.
  const players = roster.filter(
    (p) => p.goodChamps.length > 0 || p.badChamps.length > 0,
  );

  return (
    <div className={`border-t ${borderColor} px-2 py-1.5 shrink-0`}>
      <div
        className={`text-[8px] md:text-[9px] uppercase tracking-[0.35em] ${textColor}/70 mb-0.5 text-center`}
      >
        Champion Pools
      </div>
      {/* Legend — teaches the green/red coding and the dimmed = taken rule. */}
      <div className="flex items-center justify-center gap-2 mb-1.5 text-[7px] uppercase tracking-[0.15em] text-rift-muted/70">
        <span className="flex items-center gap-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rift-support" /> Good
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rift-red" /> Bad
        </span>
        <span className="text-rift-muted/60">
          bright = main · faded = flex
        </span>
        <span className="text-rift-muted/50">dimmed = taken</span>
      </div>

      {/* Team aggregate */}
      <div className="mb-2 pb-2 border-b border-rift-line/40">
        <PoolSubhead>Team</PoolSubhead>
        <div className="space-y-0.5">
          <PoolRow ids={teamGood} tone="good" byId={byId} champStatus={champStatus} />
          <PoolRow ids={teamBad} tone="bad" byId={byId} champStatus={champStatus} />
        </div>
      </div>

      {/* Per-player */}
      {players.length > 0 && (
        <div>
          <PoolSubhead>By Player</PoolSubhead>
          <div className="space-y-1.5">
            {players.map((p, i) => (
              <div key={`${p.lane}-${i}`} className="flex items-center gap-1.5">
                <div className="shrink-0 flex items-center gap-1">
                  <div className="bg-black/40 border border-rift-gold/20 rounded-sm p-0.5 flex items-center justify-center">
                    <LaneIcon lane={p.lane} size="xs" />
                  </div>
                  <span
                    className={`w-4 h-4 flex items-center justify-center border rounded-sm font-display text-[9px] ${TIER_BADGE[p.tier]}`}
                    title={`Player tier: ${p.tier}`}
                  >
                    {p.tier}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <PoolRow ids={p.goodChamps} tone="good" byId={byId} champStatus={champStatus} tiered />
                  <PoolRow ids={p.badChamps} tone="bad" byId={byId} champStatus={champStatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PickSlot({
  champ,
  isCurrent,
  isPreview,
  side,
  locked,
  role,
  playerTier = null,
  poolSign = 0,
}: {
  champ: Champion | undefined;
  isCurrent: boolean;
  isPreview: boolean;
  side: Side;
  locked: boolean;
  role: Lane | null;
  playerTier?: PlayerTier | null;
  poolSign?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prevLockedRef = useRef(locked);

  useEffect(() => {
    if (locked && !prevLockedRef.current && ref.current) {
      gsap.fromTo(
        ref.current,
        { scale: 0.85, opacity: 0.3, filter: "brightness(2.5) saturate(0.3)" },
        {
          scale: 1,
          opacity: 1,
          filter: "brightness(1) saturate(1)",
          duration: 0.55,
          ease: "power2.out",
        },
      );
    }
    prevLockedRef.current = locked;
  }, [locked]);

  const pulseClass = isCurrent
    ? side === "blue"
      ? "animate-slot-pulse-blue"
      : "animate-slot-pulse-red"
    : "";
  const sideBorderActive =
    isCurrent && (side === "blue"
      ? "border-rift-blue"
      : "border-rift-red");
  const activeClass = isCurrent ? `${sideBorderActive} ${pulseClass}` : "";
  const previewClass = isPreview ? "opacity-70" : "";

  // Mobile: square icon-only slot. Desktop: horizontal row with icon + name.
  return (
    <div
      ref={ref}
      className={`slot-frame relative overflow-hidden aspect-square md:aspect-auto md:h-[52px] lg:h-[58px] md:flex md:items-center md:gap-2 ${activeClass} ${previewClass}`}
    >
      {isCurrent && <div className={`slot-sweep ${side}`} />}

      {/* Icon — square on mobile, thumbnail on desktop */}
      <div className="w-full h-full md:w-[52px] md:h-full lg:w-[58px] md:shrink-0 relative overflow-hidden">
        {champ ? (
          <img
            src={champ.iconUrl}
            alt={champ.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className={`w-4 h-4 md:w-5 md:h-5 rotate-45 border ${
                side === "blue" ? "border-rift-blue/30" : "border-rift-red/30"
              }`}
            />
          </div>
        )}
        {/* Role badge — mobile places it on the thumbnail bottom-right */}
        {role && locked && (
          <div className="md:hidden absolute bottom-0.5 right-0.5 bg-black/75 rounded-sm p-0.5 flex items-center justify-center">
            <LaneIcon lane={role} size="xs" />
          </div>
        )}
        {/* Pool-fit dot: green = the assigned player is comfortable on this
            champion, red = it's one they're bad at. */}
        {locked && poolSign !== 0 && (
          <div
            className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full ${
              poolSign > 0 ? "bg-rift-support" : "bg-rift-red"
            } ring-1 ring-black/50`}
            title={poolSign > 0 ? "Player comfort pick" : "Off-pool for this player"}
          />
        )}
      </div>

      {/* Name + role — desktop only */}
      <div className="hidden md:flex md:flex-1 md:min-w-0 md:items-center md:gap-1.5 md:pr-2">
        {champ ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-xs lg:text-sm text-rift-goldbright font-semibold truncate tracking-wide">
                {champ.name}
              </div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted truncate">
                {champ.roles.slice(0, 2).join(" · ")}
              </div>
            </div>
            {playerTier && (
              <div
                className={`shrink-0 w-5 h-5 flex items-center justify-center border rounded-sm font-display text-[10px] ${TIER_BADGE[playerTier]}`}
                title={`Player tier: ${playerTier}`}
              >
                {playerTier}
              </div>
            )}
            {role && (
              <div className="shrink-0 bg-black/40 border border-rift-gold/30 rounded-sm p-1 flex items-center justify-center">
                <LaneIcon lane={role} size="sm" />
              </div>
            )}
          </>
        ) : (
          <div className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-muted">
            Pick
          </div>
        )}
      </div>
    </div>
  );
}

function BanSlot({
  champ,
  isCurrent,
  isPreview,
  side,
  locked,
}: {
  champ: Champion | undefined;
  isCurrent: boolean;
  isPreview: boolean;
  side: Side;
  locked: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prevLockedRef = useRef(locked);

  useEffect(() => {
    if (locked && !prevLockedRef.current && ref.current) {
      gsap.fromTo(
        ref.current,
        { rotation: -25, opacity: 0.2, scale: 0.8 },
        { rotation: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" },
      );
    }
    prevLockedRef.current = locked;
  }, [locked]);

  const pulseClass = isCurrent
    ? side === "blue"
      ? "animate-slot-pulse-blue"
      : "animate-slot-pulse-red"
    : "";
  const sideBorderActive =
    isCurrent && (side === "blue"
      ? "border-rift-blue"
      : "border-rift-red");
  const activeClass = isCurrent ? `${sideBorderActive} ${pulseClass}` : "";
  const previewClass = isPreview ? "opacity-70" : "";
  const bannedClass = locked && champ ? "banned" : "";

  return (
    <div
      ref={ref}
      className={`slot-frame w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 relative overflow-hidden ${activeClass} ${previewClass} ${bannedClass}`}
    >
      {isCurrent && <div className={`slot-sweep ${side}`} />}
      {champ ? (
        <>
          <img
            src={champ.iconUrl}
            alt={champ.name}
            className="w-full h-full object-cover"
          />
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[140%] h-[2.5px] bg-rift-red/90 rotate-45 shadow-[0_0_6px_rgba(232,64,87,0.85)]" />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
