"use client";
import { useHydrated } from "@/lib/useHydrated";

import {
useCallback,
useEffect,
useId,
useLayoutEffect,
useRef,
useState,
type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { faBadgeYears,type FaBoardRow } from "@/lib/season/faMarket";
import { ACADEMY_YEARS_MAX } from "@/lib/season/playerLifecycle";
import type { PlayerTier } from "@/lib/types";

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

const fmt = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? "–" : n.toFixed(digits);

type Pos = { top: number; left: number; place: "above" | "below" };

/**
 * Rift-themed hover/focus popover for inactive-market board rows (FA + academy).
 * Portaled to body so scroll containers don't clip it. Sign/Call-up actions stay
 * outside the trigger so the tip never blocks them.
 */
export default function InactiveBoardTip({
  row,
  children,
}: {
  row: FaBoardRow;
  children: ReactNode;
}) {
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const mounted = useHydrated();



  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const show = useCallback(() => {
    clearHide();
    setOpen(true);
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setOpen(false), 80);
  }, []);

  const hideNow = useCallback(() => {
    clearHide();
    setOpen(false);
  }, []);

  useEffect(() => () => clearHide(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        hideNow();
        triggerRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, hideNow]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const t = triggerRef.current;
      const tip = tipRef.current;
      if (!t || !tip) return;
      const r = t.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const pad = 8;
      const gap = 6;
      let left = r.left + r.width / 2 - tw / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
      const aboveTop = r.top - th - gap;
      const belowTop = r.bottom + gap;
      const placeAbove = aboveTop >= pad;
      const top = placeAbove
        ? aboveTop
        : Math.min(belowTop, window.innerHeight - th - pad);
      setPos({ top, left, place: placeAbove ? "above" : "below" });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, row]);

  const { entry, breakdown, value, yearsLeftToRetire, yearsLeftToFa, upgradeVsSlot } = row;
  const p = entry.player;
  const years = Math.max(1, entry.inactiveYears < 1 ? 1 : entry.inactiveYears);
  const isAcademy = entry.status === "academy";
  const yearsLabel = isAcademy
    ? `${Math.min(ACADEMY_YEARS_MAX, years)}y in academy · ${yearsLeftToFa}y to FA`
    : entry.status === "free-agent"
      ? `${faBadgeYears(years)}y as FA · ${yearsLeftToRetire}y to retire`
      : "Retired";
  const lastTeam = entry.lastTeamName ?? entry.lastTeamId ?? "—";

  const tip =
    mounted && open
      ? createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            className="fixed z-[80] w-[240px] pointer-events-auto border border-rift-gold/35 bg-rift-bg shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="px-2.5 py-1.5 border-b border-rift-gold/20 flex items-center gap-1.5">
              <span className={`w-5 text-center border text-[10px] font-display ${TIER_CLS[p.tier]}`}>
                {p.tier}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-rift-goldbright font-medium truncate">
                  {p.name ?? "Unknown"}
                </div>
                <div className="text-[8px] uppercase tracking-[0.18em] text-rift-muted/60">
                  {p.lane}
                  {p.age != null ? ` · age ${p.age}` : ""}
                  {p.potential && p.potential !== p.tier ? ` · pot ${p.potential}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 text-[7px] uppercase tracking-[0.15em] px-1 border ${
                  isAcademy
                    ? "border-amber-500/40 text-amber-300/85"
                    : "border-sky-500/40 text-sky-400/85"
                }`}
              >
                {isAcademy ? "Academy" : "FA"}
              </span>
            </div>

            <div className="px-2.5 py-1.5 space-y-1.5">
              <section>
                <div className="text-[7px] uppercase tracking-[0.22em] text-rift-gold/55 mb-0.5">
                  Form
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-rift-mutedbright">
                  <span>Last grade</span>
                  <span>{fmt(entry.lastActiveGrade)}</span>
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-rift-mutedbright">
                  <span>Shadow</span>
                  <span>{fmt(entry.shadowGrade)}</span>
                </div>
              </section>

              <section>
                <div className="text-[7px] uppercase tracking-[0.22em] text-rift-gold/55 mb-0.5">
                  Value
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-rift-goldbright">
                  <span>Total</span>
                  <span>{value.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-[9px] tabular-nums text-rift-muted/70">
                  <span>Tier / form / meta</span>
                  <span>
                    {breakdown.tier.toFixed(1)} / {breakdown.form.toFixed(1)} /{" "}
                    {breakdown.metaFit.toFixed(1)}
                  </span>
                </div>
                {upgradeVsSlot != null && (
                  <div
                    className={`flex justify-between text-[10px] tabular-nums ${
                      upgradeVsSlot >= 0 ? "text-emerald-400/90" : "text-rift-redbright/80"
                    }`}
                  >
                    <span>vs your slot</span>
                    <span>
                      {upgradeVsSlot >= 0 ? "+" : ""}
                      {upgradeVsSlot.toFixed(1)}
                    </span>
                  </div>
                )}
              </section>

              <section>
                <div className="text-[7px] uppercase tracking-[0.22em] text-rift-gold/55 mb-0.5">
                  Years
                </div>
                <div className="text-[10px] text-rift-mutedbright">{yearsLabel}</div>
                {isAcademy && (
                  <div className="text-[8px] text-rift-muted/55 mt-0.5 leading-snug">
                    Develops slowly in academy — call up to main roster to accelerate.
                  </div>
                )}
              </section>

              <section>
                <div className="text-[7px] uppercase tracking-[0.22em] text-rift-gold/55 mb-0.5">
                  Last team
                </div>
                <div className="text-[10px] text-rift-mutedbright truncate">{lastTeam}</div>
              </section>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 outline-none focus-visible:ring-1 focus-visible:ring-rift-gold/50"
        tabIndex={0}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        {children}
      </span>
      {tip}
    </>
  );
}
