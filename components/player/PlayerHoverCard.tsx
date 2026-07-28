"use client";

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

import LaneIcon from "../LaneIcon";
import LeagueIcon from "../LeagueIcon";
import TeamIcon from "../TeamIcon";
import { isDesktop } from "@/lib/desktopStorage";
import type { PlayerCardData, PlayerCardStatus } from "@/lib/season/playerCard";
import type { Champion, PlayerTier } from "@/lib/types";
import {
  usePlayerCardContext,
  type PlayerCardHint,
} from "./PlayerCardContext";

/** How long the pointer must rest on a name before the card appears. */
const SHOW_DELAY_MS = 240;
/** Grace period so the pointer can travel from the name onto the card. */
const HIDE_DELAY_MS = 110;
const CARD_W = 276;
const EDGE_PAD = 10;
const GAP = 10;

/** Scroll containers between the trigger and the document root. */
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

/** Prefer the interactive child — wide flex rows shouldn't anchor on the whole row. */
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

  // Wide flex triggers (FA rows): anchor beside the pointer, not the row box.
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

/**
 * Each tier owns the whole card's chrome — border gradient, wash, rail, badge.
 * Straight from the rift palette so an S+ card glows like the gold UI and a D
 * card reads in the same red the sim uses for a losing side.
 */
const TIER_ACCENT: Record<PlayerTier, { hex: string; soft: string; text: string }> = {
  "S+": { hex: "#f0e6d2", soft: "rgba(240, 230, 210, 0.20)", text: "#f0e6d2" },
  S: { hex: "#c8aa6e", soft: "rgba(200, 170, 110, 0.18)", text: "#f0e6d2" },
  A: { hex: "#0ac8b9", soft: "rgba(10, 200, 185, 0.15)", text: "#cdfafa" },
  B: { hex: "#a09b8c", soft: "rgba(160, 155, 140, 0.12)", text: "#f0e6d2" },
  C: { hex: "#ffb454", soft: "rgba(255, 180, 84, 0.13)", text: "#ffd9a0" },
  D: { hex: "#e84057", soft: "rgba(232, 64, 87, 0.13)", text: "#ff9aa4" },
};
const NEUTRAL_ACCENT = { hex: "#5b5a56", soft: "rgba(91, 90, 86, 0.12)", text: "#a09b8c" };

const STATUS_CHIP: Record<
  Exclude<PlayerCardStatus, "active">,
  { label: string; cls: string }
> = {
  academy: { label: "Acy", cls: "text-amber-300/90 border-amber-500/45 bg-amber-500/10" },
  "free-agent": { label: "FA", cls: "text-sky-300/90 border-sky-500/45 bg-sky-500/10" },
  retired: { label: "Ret", cls: "text-rift-redbright/85 border-rift-red/45 bg-rift-red/10" },
};

const LANE_LABEL: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  support: "Support",
};

const num = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(digits);
const pct = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : `${Math.round(n * 100)}%`;
const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;

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

function ChampPool({
  ids,
  championsById,
  tone,
}: {
  ids: number[];
  championsById: Map<number, Champion>;
  tone: "good" | "bad";
}) {
  if (ids.length === 0) return null;
  const ring = tone === "good" ? "ring-rift-blue/50" : "ring-rift-red/45";
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span
        className={`text-[9px] leading-none ${
          tone === "good" ? "text-rift-blue/70" : "text-rift-red/70"
        }`}
        aria-hidden
      >
        {tone === "good" ? "▲" : "▼"}
      </span>
      {ids.slice(0, 3).map((id) => {
        const champ = championsById.get(id);
        return champ ? (
          <img
            key={id}
            src={champ.iconUrl}
            alt={champ.name}
            title={champ.name}
            draggable={false}
            loading="lazy"
            decoding="async"
            className={`w-[18px] h-[18px] rounded-sm ring-1 ${ring} ${
              tone === "bad" ? "grayscale-[0.5] opacity-80" : ""
            }`}
          />
        ) : (
          <span
            key={id}
            className="w-[18px] h-[18px] rounded-sm bg-rift-line/50"
            aria-hidden
          />
        );
      })}
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

/**
 * The card itself. Split out from the hover plumbing so it can be dropped into
 * a static context (docs, tests) with a hand-built `PlayerCardData`.
 */
export function PlayerCardBody({
  data,
  championsById,
  clickable,
}: {
  data: PlayerCardData;
  championsById: Map<number, Champion>;
  clickable: boolean;
}) {
  const accent = data.tier ? TIER_ACCENT[data.tier] : NEUTRAL_ACCENT;
  const chip = data.status === "active" ? null : STATUS_CHIP[data.status];
  const season = data.season;
  const career = data.career;
  const hasPool = data.goodChamps.length > 0 || data.badChamps.length > 0;
  const kda =
    season && season.deaths > 0
      ? (season.kills + season.assists) / season.deaths
      : season
        ? season.kills + season.assists
        : null;
  const isImport = data.acclimation != null && data.acclimation < 0.999;

  return (
    <div
      className="player-card w-[276px] text-left"
      style={
        {
          "--pc-accent": accent.hex,
          "--pc-accent-soft": accent.soft,
        } as React.CSSProperties
      }
    >
      <div className="player-card-body">
        <div className="player-card-rail" />

        {/* Identity */}
        <div className="player-card-hatch relative px-3 pt-2 pb-2 flex items-start gap-2">
          <span
            className="player-card-pennant shrink-0 w-7 h-7 grid place-items-center font-display text-[13px] leading-none border"
            style={{
              borderColor: accent.hex,
              color: accent.text,
              background: accent.soft,
            }}
          >
            {data.tier ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] leading-tight tracking-[0.04em] text-rift-goldbright truncate">
              {data.name}
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              {data.lane && <LaneIcon lane={data.lane} size="xs" />}
              <span className="text-[8px] uppercase tracking-[0.2em] text-rift-mutedbright/70 truncate">
                {data.lane ? LANE_LABEL[data.lane] : "—"}
                {data.age != null ? ` · ${data.age}y` : ""}
                {data.potential && data.potential !== data.tier
                  ? ` · pot ${data.potential}`
                  : ""}
              </span>
            </div>
          </div>
          {chip && (
            <span
              className={`shrink-0 text-[7px] uppercase tracking-[0.16em] px-1 py-px border ${chip.cls}`}
            >
              {chip.label}
              {data.statusYears != null ? ` ${data.statusYears}y` : ""}
            </span>
          )}
        </div>

        {/* Club — skip org-less FA (no last team name/id). */}
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
              {data.teamLabel}
            </span>
          </div>
        )}

        {/* Production for the scope this card covers */}
        {season && season.games > 0 && (
          <Section label={season.label}>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">
              <Stat label="Games" value={`${season.games}`} />
              <Stat
                label="Win%"
                value={season.wins != null ? pct(season.wins / Math.max(1, season.games)) : "—"}
              />
              <Stat label="KDA" value={num(kda, 2)} />
              <Stat
                label="Rating"
                value={num(season.avgRating)}
                tone={
                  season.avgRating != null && season.avgRating >= 6.5
                    ? "text-emerald-300"
                    : ""
                }
              />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[9px] tabular-nums text-rift-mutedbright/70">
              <span>
                {season.kills}/{season.deaths}/{season.assists}
              </span>
              {season.mvps > 0 && (
                <span className="text-rift-gold/80">MVP ×{season.mvps}</span>
              )}
              {season.pentakills > 0 && (
                <span className="text-rift-blue/80">Penta ×{season.pentakills}</span>
              )}
              {!!season.splitTitles && (
                <span className="text-rift-goldbright/80">
                  {season.splitTitles}× split
                </span>
              )}
              {!!season.intlTitles && (
                <span className="text-rift-goldbright/80">
                  {season.intlTitles}× intl
                </span>
              )}
            </div>
          </Section>
        )}

        {/* Live hot/cold streak — only meaningful on an active roster. */}
        {data.form != null && Math.abs(data.form) > 0.005 && (
          <Section label="Form">
            <FormMeter form={data.form} />
          </Section>
        )}

        {/* Inactive market read — grades carried while out of the league. */}
        {(data.lastActiveGrade != null || data.shadowGrade != null) && (
          <Section label="Shape">
            <div className="grid grid-cols-3 gap-x-2">
              <Stat label="Last grade" value={num(data.lastActiveGrade)} />
              <Stat label="Shadow" value={num(data.shadowGrade)} />
              {data.value != null && (
                <Stat label="Value" value={num(data.value)} />
              )}
            </div>
            {data.valueBreakdown && (
              <div className="mt-1 text-[8px] tabular-nums text-rift-muted/60">
                tier {num(data.valueBreakdown.tier)} · form{" "}
                {num(data.valueBreakdown.form)} · meta{" "}
                {num(data.valueBreakdown.metaFit)}
              </div>
            )}
            {data.upgradeVsSlot != null && (
              <div
                className={`mt-0.5 text-[9px] tabular-nums ${
                  data.upgradeVsSlot >= 0
                    ? "text-emerald-400/90"
                    : "text-rift-redbright/80"
                }`}
              >
                {signed(data.upgradeVsSlot)} vs your slot
              </div>
            )}
          </Section>
        )}

        {/* Where the lifecycle clock stands. */}
        {data.status !== "active" && (
          <Section label="Clock">
            <div className="text-[10px] text-rift-mutedbright/85 leading-snug">
              {data.status === "academy" &&
                `${data.statusYears ?? 1}y in academy · ${data.yearsLeftToFa ?? 0}y to free agency`}
              {data.status === "free-agent" &&
                `${data.statusYears ?? 1}y as a free agent · ${data.yearsLeftToRetire ?? 0}y to retirement`}
              {data.status === "retired" &&
                `Retired${data.statusYears != null ? ` after ${data.statusYears}y inactive` : ""}`}
            </div>
          </Section>
        )}

        {/* Champion pools */}
        {hasPool && (
          <Section label="Pool">
            <div className="flex items-center gap-3 flex-wrap">
              <ChampPool
                ids={data.goodChamps}
                championsById={championsById}
                tone="good"
              />
              <ChampPool
                ids={data.badChamps}
                championsById={championsById}
                tone="bad"
              />
            </div>
          </Section>
        )}

        {/* Career to date, from the Hall archive. */}
        {career && career.games > 0 && (
          <Section label="Career">
            <div className="grid grid-cols-4 gap-x-2">
              <Stat label="Games" value={`${career.games}`} />
              <Stat label="Win%" value={pct(career.winRate)} />
              <Stat label="Grade" value={num(career.grade)} />
              <Stat label="Titles" value={`${career.titles}`} />
            </div>
            {data.highlights.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
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

        {/* Provenance + affordance */}
        <div className="px-3 py-1.5 border-t border-rift-gold/15 flex items-center gap-2 bg-rift-gold/[0.03]">
          <span className="text-[7px] uppercase tracking-[0.2em] text-rift-muted/60 truncate">
            {data.archived ? "Archived · " : ""}
            {data.scope}
          </span>
          {isImport && (
            <span
              className="text-[7px] uppercase tracking-[0.16em] text-amber-400/70 shrink-0"
              title={`Import — ${Math.round((1 - (data.acclimation ?? 1)) * 100)}% settling penalty`}
            >
              Import
            </span>
          )}
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

type Placement = { top: number; left: number };

/**
 * Hover plumbing around {@link PlayerCardBody}: portaled to `document.body` so
 * scroll containers can't clip it, resolved lazily on open (nothing is computed
 * for the hundreds of names on screen), and flipped to whichever side of the
 * trigger has room.
 */
export default function PlayerHoverCard({
  playerId,
  seasonId,
  hint,
  disabled,
  className = "",
  children,
}: {
  playerId?: string;
  seasonId?: string;
  hint?: PlayerCardHint;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ctx = usePlayerCardContext();
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const [data, setData] = useState<PlayerCardData | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  // Hover cards are a desktop-only affordance — web/mobile names stay plain text.
  const active =
    isDesktop() && !disabled && !!ctx && (!!playerId || !!hint?.player);

  const open = useCallback(
    (immediate = false) => {
      if (!active || !ctx) return;
      clearTimers();
      const run = () => {
        const resolved = ctx.resolve(playerId, {
          ...(seasonId ? { seasonId } : {}),
          ...(hint ? { hint } : {}),
        });
        if (resolved) setData(resolved);
      };
      if (immediate) run();
      else showTimer.current = setTimeout(run, SHOW_DELAY_MS);
    },
    [active, ctx, playerId, seasonId, hint],
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

  // Escape always dismisses, and the trigger gives up focus so it can't
  // immediately re-open from the focus ring.
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

  const card =
    mounted && data
      ? createPortal(
          <div
            ref={cardRef}
            id={tipId}
            role="tooltip"
            onMouseEnter={() => open(true)}
            onMouseLeave={() => close()}
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            className="fixed z-[90] pointer-events-auto"
          >
            <PlayerCardBody
              data={data}
              championsById={ctx?.championsById ?? new Map()}
              clickable={!!ctx?.canOpenProfile(playerId)}
            />
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
