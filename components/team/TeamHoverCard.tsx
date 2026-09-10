"use client";
import { useHydrated } from "@/lib/useHydrated";

import {
useCallback,
useEffect,
useId,
useLayoutEffect,
useRef,
useState,
type MouseEvent,
type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { isDesktop } from "@/lib/desktopStorage";
import type { TeamCardData } from "@/lib/season/teamCard";
import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import TierChip from "../season/TierChip";
import { useTeamCardContext,type TeamCardHint } from "./TeamCardContext";

const SHOW_DELAY_MS = 240;
const HIDE_DELAY_MS = 110;
const CARD_W = 276;
const EDGE_PAD = 10;
const GAP = 10;

const LANE_LABEL: Record<string, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};

function scrollParents(el: HTMLElement | null): (HTMLElement | Window)[] {
  const out: (HTMLElement | Window)[] = [window];
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const { overflow, overflowX, overflowY } = getComputedStyle(node);
    const scrollable = /auto|scroll|overlay/.test(
      `${overflow} ${overflowX} ${overflowY}`,
    );
    if (scrollable) out.push(node);
    node = node.parentElement;
  }
  return out;
}

function anchorEl(trigger: HTMLElement): HTMLElement {
  const child = trigger.firstElementChild;
  if (child instanceof HTMLElement) {
    const onlyChild =
      !child.nextElementSibling ||
      (child.nextElementSibling === trigger.lastElementChild &&
        trigger.childElementCount <= 2);
    if (onlyChild || child.tagName === "BUTTON") return child;
  }
  return trigger;
}

type Pointer = { x: number; y: number };
type Placement = { top: number; left: number };

function viewportBox() {
  const vv = window.visualViewport;
  return {
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function computePlacement(
  trigger: HTMLElement,
  card: HTMLElement,
  pointer: Pointer | null,
): Placement {
  const anchor = anchorEl(trigger);
  const r = anchor.getBoundingClientRect();
  const cardW = card.offsetWidth || CARD_W;
  const cardH = card.offsetHeight || 0;
  const vp = viewportBox();

  const wideTrigger = r.width > cardW * 1.35;
  const anchorX = wideTrigger && pointer ? pointer.x : r.right;
  const anchorY = wideTrigger && pointer ? pointer.y : r.top + r.height / 2;
  const anchorLeft = wideTrigger && pointer ? pointer.x : r.left;

  const roomRight = vp.left + vp.width - anchorX - GAP - EDGE_PAD;
  const roomLeft = anchorLeft - GAP - EDGE_PAD - vp.left;
  let left: number;
  if (roomRight >= cardW) left = anchorX + GAP;
  else if (roomLeft >= cardW) left = anchorLeft - GAP - cardW;
  else left = roomRight >= roomLeft ? vp.left + vp.width - cardW - EDGE_PAD : vp.left + EDGE_PAD;

  const minTop = vp.top + EDGE_PAD;
  const maxTop = vp.top + vp.height - cardH - EDGE_PAD;
  const idealTop = anchorY - cardH / 2;
  const top =
    cardH > 0
      ? Math.max(minTop, Math.min(idealTop, maxTop))
      : Math.max(minTop, idealTop);

  return { top, left };
}

const signed = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

const pct = (rate: number | null | undefined) =>
  rate != null ? `${Math.round(rate * 100)}%` : "—";

const wlLabel = (w: number, l: number) => `${w}-${l}`;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3 py-1.5 border-t border-rift-line/30">
      <div className="text-[7px] uppercase tracking-[0.28em] text-rift-gold/50 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[7px] uppercase tracking-[0.16em] text-rift-muted/60 truncate">
        {label}
      </div>
      <div
        className={`font-display text-[12px] tabular-nums leading-tight truncate ${
          tone || "text-rift-goldbright"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FormMeter({ form }: { form: number }) {
  const magnitude = Math.min(1, Math.abs(form)) * 50;
  const hot = form >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="player-card-meter relative h-[5px] flex-1 overflow-hidden">
        <span
          className={`absolute top-0 bottom-0 ${
            hot ? "bg-emerald-400/80" : "bg-rift-red/80"
          }`}
          style={
            hot
              ? { left: "50%", width: `${magnitude}%` }
              : { left: `${50 - magnitude}%`, width: `${magnitude}%` }
          }
        />
      </div>
      <span
        className={`text-[10px] tabular-nums shrink-0 ${
          hot ? "text-emerald-400/90" : "text-rift-redbright/85"
        }`}
      >
        {signed(form, 2)}
      </span>
    </div>
  );
}

export function TeamCardBody({
  data,
  clickable,
}: {
  data: TeamCardData;
  clickable: boolean;
}) {
  const accentHex = data.color && data.color.length > 3 ? data.color : "#c8aa6e";
  const accentSoft =
    data.color && data.color.length > 3
      ? `${accentHex}33`
      : "rgba(200, 170, 110, 0.16)";

  return (
    <div
      className="player-card w-[276px] text-left"
      style={
        {
          "--pc-accent": accentHex,
          "--pc-accent-soft": accentSoft,
        } as React.CSSProperties
      }
    >
      <div className="player-card-body">
        <div className="player-card-rail" />

        <div className="player-card-hatch relative px-3 pt-2 pb-2 flex items-start gap-2">
          <TeamIcon
            iconKey={data.iconKey ?? "shield"}
            logoUrl={data.logoUrl}
            color={data.color}
            size={28}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] leading-tight tracking-[0.04em] text-rift-goldbright truncate">
              {data.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <LeagueIcon league={data.leagueId} size={12} />
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/70 truncate">
                {data.leagueId}
                {data.starRating ? ` · ${data.starRating}★` : ""}
              </span>
            </div>
          </div>
          <span className="shrink-0 text-[7px] uppercase tracking-[0.16em] px-1 py-px border border-rift-gold/35 text-rift-gold/80 bg-rift-gold/10">
            {data.avgTier}
          </span>
        </div>

        <Section label="Main roster">
          <div className="space-y-0.5">
            {data.roster.map((line) => (
              <div
                key={line.lane}
                className="flex items-center gap-1.5 text-[10px] min-w-0"
              >
                <LaneIcon lane={line.lane} size="xs" className="shrink-0" />
                <span className="w-7 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                  {LANE_LABEL[line.lane]}
                </span>
                <TierChip tier={line.tier} size="xs" />
                <span className="truncate text-rift-mutedbright/85 min-w-0">
                  {line.name ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Org">
          <div className="grid grid-cols-3 gap-x-2">
            <Stat label="Academy" value={`${data.academyCount}`} />
            <Stat label="Stars" value={`${data.starRating}★`} />
            <Stat label="Avg tier" value={data.avgTier} />
          </div>
          {data.standing && (
            <div className="mt-1 text-[9px] text-rift-mutedbright/80 tabular-nums">
              {data.standing}
            </div>
          )}
        </Section>

        {data.form != null && Math.abs(data.form) > 0.005 && (
          <Section label="Form">
            <FormMeter form={data.form} />
          </Section>
        )}

        {(() => {
          const wr = data.winRates;
          if (!wr) return null;
          const seriesPlayed =
            wr.overall.wins + wr.overall.losses > 0 || wr.recent.sampleSize > 0;
          if (!seriesPlayed) return null;
          return (
            <Section label="Series record">
              <div className="grid grid-cols-2 gap-x-2">
                <Stat
                  label="Overall"
                  value={`${pct(wr.overall.winRate)} · ${wlLabel(wr.overall.wins, wr.overall.losses)}`}
                />
                <Stat
                  label={
                    wr.recent.sampleSize > 0 && wr.recent.sampleSize < 20
                      ? `Last ${wr.recent.sampleSize}`
                      : "Last 20"
                  }
                  value={`${pct(wr.recent.winRate)} · ${wlLabel(wr.recent.wins, wr.recent.losses)}`}
                />
              </div>
            </Section>
          );
        })()}

        {(() => {
          const h2h = data.h2h;
          if (!h2h || h2h.meetings <= 0) return null;
          return (
            <Section label={`H2H vs ${h2h.opponentName}`}>
              <div className="grid grid-cols-2 gap-x-2">
                <Stat
                  label="Overall (all-time)"
                  value={`${pct(h2h.overall.winRate)} · ${wlLabel(h2h.overall.wins, h2h.overall.losses)}`}
                />
                {h2h.recent.sampleSize > 0 ? (
                  <Stat
                    label={`Recent (last ${h2h.recent.sampleSize})`}
                    value={`${pct(h2h.recent.winRate)} · ${wlLabel(h2h.recent.wins, h2h.recent.losses)}`}
                  />
                ) : (
                  <Stat
                    label="Meetings"
                    value={`${h2h.meetings}`}
                  />
                )}
              </div>
            </Section>
          );
        })()}

        {(() => {
          const titles = data.titleCounts;
          const chips = data.highlights;
          const showCounts = titles != null && titles.total > 0;
          const showChips = chips.length > 0;
          if (!showCounts && !showChips) return null;
          return (
            <Section label="Titles">
              {showCounts && (
                <div className="grid grid-cols-3 gap-x-2 mb-1">
                  <Stat label="Split" value={`${titles.split}`} />
                  <Stat label="Intl" value={`${titles.intl}`} />
                  <Stat
                    label="Worlds"
                    value={`${titles.worlds}`}
                    tone={titles.worlds > 0 ? "text-rift-goldbright" : ""}
                  />
                </div>
              )}
              {showChips && (
                <div className="flex flex-wrap gap-1">
                  {chips.map((h) => (
                    <span
                      key={h}
                      className="text-[7px] uppercase tracking-[0.14em] px-1 py-px border border-rift-gold/25 text-rift-gold/75"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          );
        })()}

        <div className="px-3 py-1.5 border-t border-rift-gold/15 flex items-center gap-2 bg-rift-gold/[0.03]">
          <span className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/60 truncate">
            {data.archived ? "Archived · " : ""}
            {data.scope}
          </span>
          {clickable && (
            <span className="ml-auto shrink-0 text-[7px] uppercase tracking-[0.2em] text-rift-gold/70">
              Click ▸ Profile
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamHoverCard({
  teamId,
  seasonId,
  phaseScope,
  hint,
  opponentTeamId,
  opponentHint,
  disabled,
  className = "",
  children,
}: {
  teamId?: string;
  seasonId?: string;
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId;
  hint?: TeamCardHint;
  opponentTeamId?: string;
  opponentHint?: TeamCardHint;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useTeamCardContext();
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const clickStartRef = useRef<Pointer | null>(null);
  const [data, setData] = useState<TeamCardData | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const mounted = useHydrated();



  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  const active =
    isDesktop() && !disabled && !!ctx && (!!teamId || !!hint?.name || !!hint?.team);

  const open = useCallback(
    (immediate = false) => {
      if (!active || !ctx) return;
      clearTimers();
      const run = () => {
        const resolved = ctx.resolve(teamId, {
          ...(seasonId ? { seasonId } : {}),
          ...(phaseScope ? { phaseScope } : {}),
          ...(hint ? { hint } : {}),
          ...(opponentTeamId ? { opponentTeamId } : {}),
          ...(opponentHint ? { opponentHint } : {}),
        });
        if (resolved) setData(resolved);
      };
      if (immediate) run();
      else showTimer.current = setTimeout(run, SHOW_DELAY_MS);
    },
    [active, ctx, teamId, seasonId, phaseScope, hint, opponentTeamId, opponentHint],
  );

  const close = useCallback((immediate = false) => {
    clearTimers();
    if (immediate) setData(null);
    else hideTimer.current = setTimeout(() => setData(null), HIDE_DELAY_MS);
  }, []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    setPos(computePlacement(trigger, card, pointerRef.current));
  }, []);

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      clearTimers();
      setData(null);
      triggerRef.current?.blur();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [data]);

  useLayoutEffect(() => {
    if (!data) {
      // Layout state tracks the measured portal position and is reset before paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;
      setPos(computePlacement(trigger, card, pointerRef.current));
    };
    place();
    const raf = requestAnimationFrame(place);
    const scrollables = scrollParents(triggerRef.current);
    for (const node of scrollables) {
      node.addEventListener("scroll", place, { passive: true, capture: true });
    }
    window.addEventListener("resize", place, { passive: true });
    window.visualViewport?.addEventListener("resize", place, { passive: true });
    window.visualViewport?.addEventListener("scroll", place, { passive: true });
    const ro = new ResizeObserver(place);
    if (triggerRef.current) ro.observe(triggerRef.current);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => {
      cancelAnimationFrame(raf);
      for (const node of scrollables) {
        node.removeEventListener("scroll", place, true);
      }
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      ro.disconnect();
    };
  }, [data]);

  const canOpenProfile = !!ctx?.canOpenProfile(data?.navKey);
  const profileKey = data?.navKey;

  const onCardMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    if (!canOpenProfile) return;
    clickStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const onCardClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!canOpenProfile || !ctx || !profileKey) return;
    const start = clickStartRef.current;
    clickStartRef.current = null;
    if (start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > 64) return;
    }
    ctx.openProfile(profileKey);
    close(true);
  };

  const card =
    mounted && data
      ? createPortal(
          <div
            ref={cardRef}
            id={tipId}
            role="tooltip"
            onMouseEnter={() => open(true)}
            onMouseLeave={() => close()}
            onMouseDown={onCardMouseDown}
            onClick={onCardClick}
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            className={`fixed z-[90] pointer-events-auto${
              canOpenProfile ? " cursor-pointer" : ""
            }`}
          >
            <TeamCardBody data={data} clickable={canOpenProfile} />
          </div>,
          document.body,
        )
      : null;

  if (!active) {
    return <span className={className}>{children}</span>;
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center min-w-0 ${className}`}
        aria-describedby={data ? tipId : undefined}
        onMouseEnter={(e) => {
          pointerRef.current = { x: e.clientX, y: e.clientY };
          open();
        }}
        onMouseMove={(e) => {
          pointerRef.current = { x: e.clientX, y: e.clientY };
          if (data) reposition();
        }}
        onMouseLeave={() => close()}
        onFocus={() => open(true)}
        onBlur={() => close(true)}
      >
        {children}
      </span>
      {card}
    </>
  );
}
