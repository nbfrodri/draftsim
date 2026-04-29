"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { currentGame } from "@/lib/series";
import { assignLanesToPicks, currentAction } from "@/lib/draftEngine";
import { getSynergy } from "@/lib/championMeta";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  champions: Champion[];
  side: Side;
}

export default function TeamPanel({ champions, side }: Props) {
  const series = useDraftStore((s) => s.series)!;
  const selectedId = useDraftStore((s) => s.selectedChampionId);
  const game = currentGame(series);
  const action = currentAction(game);

  const byId = new Map(champions.map((c) => [c.id, c]));

  const picks = side === "blue" ? game.bluePicks : game.redPicks;
  const bans = side === "blue" ? game.blueBans : game.redBans;
  const teamName = side === "blue" ? series.blueTeam : series.redTeam;

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
          {teamName}
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

      {/* Picks — mobile: 5 small squares across. desktop: vertical list of horizontal rows */}
      <div className="p-2 md:p-2 grid grid-cols-5 md:grid-cols-1 gap-1.5 md:gap-1.5 md:flex-1 md:min-h-0 md:content-start">
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
          return (
            <PickSlot
              key={`pick-${slot}`}
              champ={showChamp}
              isCurrent={isCurrent}
              isPreview={preview != null && id == null}
              side={side}
              locked={id != null}
              role={id != null ? liveRoles[slot] : null}
            />
          );
        })}
      </div>

      {/* Live synergies — shown only when at least one pair fires. */}
      {activeSynergies.length > 0 && (
        <div
          className={`border-t ${sideConfig.borderColor} px-2 py-1.5 shrink-0 max-h-[120px] overflow-y-auto custom-scroll`}
        >
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
    </aside>
  );
}

function PickSlot({
  champ,
  isCurrent,
  isPreview,
  side,
  locked,
  role,
}: {
  champ: Champion | undefined;
  isCurrent: boolean;
  isPreview: boolean;
  side: Side;
  locked: boolean;
  role: Lane | null;
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
