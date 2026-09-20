"use client";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
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
import type { CoachCardData } from "@/lib/season/coachCard";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import { useCoachCardContext,type CoachCardHint } from "./CoachCardContext";

const SHOW_DELAY_MS = 240;
const HIDE_DELAY_MS = 110;
const CARD_W = 276;
const EDGE_PAD = 10;
const GAP = 10;

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
  else
    left =
      roomRight >= roomLeft
        ? vp.left + vp.width - cardW - EDGE_PAD
        : vp.left + EDGE_PAD;

  const minTop = vp.top + EDGE_PAD;
  const maxTop = vp.top + vp.height - cardH - EDGE_PAD;
  const idealTop = anchorY - cardH / 2;
  const top =
    cardH > 0
      ? Math.max(minTop, Math.min(idealTop, maxTop))
      : Math.max(minTop, idealTop);

  return { top, left };
}

const pct = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${Math.round(n * 100)}%`;

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

export function CoachCardBody({
  data,
  clickable,
}: {
  data: CoachCardData;
  clickable: boolean;
}) {
  const accentHex = "#0397ab";
  const accentSoft = "rgba(3, 151, 171, 0.16)";
  const titles = data.titleCounts;

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
          <span
            className="player-card-pennant shrink-0 w-7 h-7 grid place-items-center font-display text-[11px] leading-none border"
            style={{
              borderColor: accentHex,
              color: "#cdfafa",
              background: accentSoft,
            }}
            title="Coach rating"
          >
            ★{data.rating.toFixed(1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] leading-tight tracking-[0.04em] text-rift-goldbright truncate">
              {data.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-blue/70 truncate">
                Coach
                {data.playstyle ? ` · ${data.playstyle}` : ""}
              </span>
            </div>
          </div>
        </div>

        {data.team?.name && (
          <div className="px-3 py-1.5 border-t border-rift-line/30 flex items-center gap-1.5 min-w-0">
            <TeamIcon
              iconKey={data.team.iconKey ?? "shield"}
              logoUrl={data.team.logoUrl}
              color={data.team.color}
              size={15}
            />
            <span className="font-display text-[11px] tracking-wide text-rift-mutedbright truncate">
              {data.team.name}
            </span>
            {data.team.leagueId && (
              <LeagueIcon league={data.team.leagueId} size={12} />
            )}
            <span className="ml-auto shrink-0 text-[7px] uppercase tracking-[0.2em] text-rift-muted/50">
              Team
            </span>
          </div>
        )}

        {(data.adaptability != null || data.motivation != null) && (
          <Section label="Traits">
            <div className="grid grid-cols-2 gap-x-2">
              {data.adaptability != null && (
                <Stat label="Adapt" value={pct(data.adaptability)} />
              )}
              {data.motivation != null && (
                <Stat label="Motivate" value={pct(data.motivation)} />
              )}
            </div>
          </Section>
        )}

        {(data.seasons != null ||
          (titles != null && titles.total > 0) ||
          data.highlights.length > 0) && (
          <Section label="Career">
            <div className="grid grid-cols-3 gap-x-2 mb-1">
              {data.seasons != null && (
                <Stat label="Seasons" value={`${data.seasons}`} />
              )}
              {titles != null && titles.total > 0 && (
                <>
                  <Stat label="Split" value={`${titles.split}`} />
                  <Stat
                    label="Titles"
                    value={`${titles.total}`}
                    tone={titles.worlds > 0 ? "text-rift-goldbright" : ""}
                  />
                </>
              )}
            </div>
            {titles != null && titles.total > 0 && (
              <div className="text-[9px] tabular-nums text-rift-mutedbright/70 mb-1">
                {titles.intl > 0 ? `${titles.intl} intl` : null}
                {titles.intl > 0 && titles.worlds > 0 ? " · " : null}
                {titles.worlds > 0 ? `${titles.worlds}× Worlds` : null}
              </div>
            )}
            {data.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.highlights.map((h) => (
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
        )}

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

export default function CoachHoverCard({
  coachName,
  seasonId,
  hint,
  disabled,
  className = "",
  children,
}: {
  coachName?: string;
  seasonId?: string;
  hint?: CoachCardHint;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useCoachCardContext();
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const clickStartRef = useRef<Pointer | null>(null);
  const [data, setData] = useState<CoachCardData | null>(null);
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
    isDesktop() &&
    !disabled &&
    !!ctx &&
    (!!coachName || !!hint?.coach || !!hint?.name);

  const open = useCallback(
    (immediate = false) => {
      if (!active || !ctx) return;
      clearTimers();
      const run = () => {
        const resolved = ctx.resolve(coachName, {
          ...(seasonId ? { seasonId } : {}),
          ...(hint ? { hint } : {}),
        });
        if (resolved) setData(resolved);
      };
      if (immediate) run();
      else showTimer.current = setTimeout(run, SHOW_DELAY_MS);
    },
    [active, ctx, coachName, seasonId, hint],
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

  useEscapeLayer(!!data, () => {
    clearTimers();
    setData(null);
    triggerRef.current?.blur();
  }, 200, false);

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

  const canOpenProfile = !!ctx?.canOpenProfile(data?.name);
  const profileKey = data?.name;

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
            <CoachCardBody data={data} clickable={canOpenProfile} />
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
