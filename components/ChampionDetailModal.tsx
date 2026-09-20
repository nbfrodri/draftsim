"use client";
import { useEscapeLayer } from "@/lib/useEscapeLayer";
import { useHydrated } from "@/lib/useHydrated";

import { getAbilityProfile } from "@/lib/championAbilities";
import {
getActiveCounterOverride,
getActiveSynergies,
getMetaTier,
type MetaTier,
} from "@/lib/championMeta";
import { HARD_COUNTERS } from "@/lib/draftAI/data";
import { metaFor } from "@/lib/draftAI/helpers";
import type { Champion,Lane } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import gsap from "gsap";
import { useEffect,useMemo,useRef } from "react";
import { createPortal } from "react-dom";
import LaneIcon from "./LaneIcon";

interface Props {
  champion: Champion | null;
  champions: Champion[];
  byId: Map<number, Champion>;
  onClose: () => void;
}

const ROLES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jg" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Sup" },
];

const TIER_BG: Record<MetaTier, string> = {
  "S+": "border-rift-gold/80 bg-rift-gold/15 text-rift-goldbright",
  S: "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright",
  A: "border-rift-blue/50 bg-rift-blue/10 text-rift-bluebright",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-rift-line/60 text-rift-muted",
  D: "border-rift-red/40 bg-rift-red/5 text-rift-red",
};

// Build alphabetical alias → Champion lookup so synergy / counter resolution
// is O(1). Computed per-render via useMemo against the champions array.
function indexByAlias(champions: Champion[]): Map<string, Champion> {
  const out = new Map<string, Champion>();
  for (const c of champions) out.set(c.alias, c);
  return out;
}

// Build a sorted list of synergies involving this champion, paired with
// the partner champion entity for icon + name display. Sorted by bonus
// (S-tier combos first), then alphabetically.
interface SynergyEntry {
  partner: Champion;
  bonus: number;
  tag: string;
}
function synergiesFor(
  champion: Champion,
  byAlias: Map<string, Champion>,
): SynergyEntry[] {
  const out: SynergyEntry[] = [];
  for (const s of getActiveSynergies()) {
    const [a, b] = s.champs;
    let partnerAlias: string | null = null;
    if (a === champion.alias) partnerAlias = b;
    else if (b === champion.alias) partnerAlias = a;
    if (!partnerAlias) continue;
    const partner = byAlias.get(partnerAlias);
    if (!partner) continue;
    out.push({ partner, bonus: s.bonus, tag: s.tag });
  }
  out.sort((x, y) => {
    if (y.bonus !== x.bonus) return y.bonus - x.bonus;
    return x.partner.name.localeCompare(y.partner.name);
  });
  return out;
}

interface CounterEntry {
  other: Champion;
  bonus: number; // positive = good vs us, negative = we win
}

// Counters in BOTH directions. The HARD_COUNTERS table is `[counter, victim,
// bonus]`. We split into two lists:
//   - "vs us": entries where the candidate is the VICTIM and someone else
//     counters them (positive bonus). Negative bonus rows where they're
//     the victim go into "we win" too (the opposite half).
//   - "we beat": entries where the candidate is the COUNTER (positive
//     bonus to us). Plus negative-bonus rows where they're the counter
//     but the victim still wins (those favor us).
function countersFor(
  champion: Champion,
  byAlias: Map<string, Champion>,
): { vsUs: CounterEntry[]; weBeat: CounterEntry[] } {
  const vsUs: CounterEntry[] = [];
  const weBeat: CounterEntry[] = [];
  // Use the active counter list (override or baseline) so the modal
  // reflects randomized counters when the user has toggled them on.
  const source = getActiveCounterOverride() ?? HARD_COUNTERS;
  for (const [counter, victim, bonus] of source) {
    if (counter === champion.alias) {
      // Candidate is the counter. Positive bonus → we beat `victim`.
      const other = byAlias.get(victim);
      if (!other) continue;
      if (bonus > 0) weBeat.push({ other, bonus });
      else vsUs.push({ other, bonus: -bonus });
    } else if (victim === champion.alias) {
      // Candidate is the victim. Positive bonus → counter beats us.
      const other = byAlias.get(counter);
      if (!other) continue;
      if (bonus > 0) vsUs.push({ other, bonus });
      else weBeat.push({ other, bonus: -bonus });
    }
  }
  vsUs.sort((a, b) => b.bonus - a.bonus);
  weBeat.sort((a, b) => b.bonus - a.bonus);
  return { vsUs, weBeat };
}

export default function ChampionDetailModal({
  champion,
  champions,
  byId,
  onClose,
}: Props) {
  const open = champion != null;
  const mounted = useHydrated();
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<Element | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);



  // Mount-time focus + entry animation. Re-runs when the champion changes
  // (clicking a different champion swaps content with a new entry).
  useEffect(() => {
    if (!open || !panelRef.current) return;
    lastFocusedRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const ctx = gsap.context(() => {
      gsap.from(panelRef.current, {
        opacity: 0,
        scale: 0.96,
        y: 10,
        duration: 0.25,
        ease: "power3.out",
      });
      gsap.from(backdropRef.current, {
        opacity: 0,
        duration: 0.18,
      });
    }, panelRef);
    return () => {
      ctx.revert();
      // Restore focus when modal closes (a11y).
      if (lastFocusedRef.current instanceof HTMLElement) {
        lastFocusedRef.current.focus();
      }
    };
  }, [open, champion?.id]);

  // Escape-to-close.
  useEscapeLayer(open, onClose);

  const byAlias = useMemo(() => indexByAlias(champions), [champions]);
  // Subscribe to override versions so a randomize/reset re-renders the
  // synergy and counter lists with the new active data.
  const synergyVersion = useDraftStore((s) => s.synergyVersion);
  const counterVersion = useDraftStore((s) => s.counterVersion);
  const synergies = useMemo(
    () => (champion ? synergiesFor(champion, byAlias) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [champion, byAlias, synergyVersion],
  );
  const counters = useMemo(
    () =>
      champion
        ? countersFor(champion, byAlias)
        : { vsUs: [] as CounterEntry[], weBeat: [] as CounterEntry[] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [champion, byAlias, counterVersion],
  );

  if (!open || !champion || !mounted) return null;

  const meta = metaFor(champion);
  const ability = getAbilityProfile(champion.alias);

  const overlay = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[200] bg-rift-bg/85 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="champ-detail-title"
        className="relative bg-rift-panel border-2 border-rift-gold/50 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-glow-gold"
      >
        {/* Decorative corner pennants */}
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" aria-hidden />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" aria-hidden />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" aria-hidden />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" aria-hidden />

        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 md:gap-4 px-4 md:px-6 pt-4 md:pt-5 pb-4 border-b border-rift-gold/20">
          <img
            src={champion.iconUrl}
            alt={champion.name}
            className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 border-2 border-rift-gold/60 object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Champion Profile
            </div>
            <h2
              id="champ-detail-title"
              className="font-display text-2xl md:text-3xl tracking-wider text-rift-goldbright mt-0.5 truncate"
            >
              {champion.name}
            </h2>
            {champion.roles.length > 0 && (
              <div className="text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-rift-mutedbright/80 mt-0.5">
                {champion.roles.join(" · ")}
              </div>
            )}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close champion detail"
            className="w-9 h-9 flex items-center justify-center text-rift-mutedbright hover:text-rift-goldbright hover:bg-rift-gold/10 transition-colors border border-rift-line hover:border-rift-gold/60 flex-shrink-0"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          {/* ─── Tier per lane ─────────────────────────────────────────── */}
          <Section label="Tier per lane">
            <div className="grid grid-cols-5 gap-1.5 md:gap-2">
              {ROLES.map(({ lane, label }) => {
                const tier = getMetaTier(champion.alias, lane);
                const cls = tier
                  ? `border ${TIER_BG[tier]}`
                  : "border border-rift-line/40 text-rift-muted/50 bg-rift-bg/40";
                return (
                  <div
                    key={lane}
                    className={`flex flex-col items-center gap-0.5 py-2 ${cls}`}
                  >
                    <span className="flex items-center gap-1 text-[8px] md:text-[9px] uppercase tracking-[0.25em]">
                      <LaneIcon lane={lane} size="xs" />
                      {label}
                    </span>
                    <span className="font-display text-base md:text-lg tabular-nums">
                      {tier ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ─── Profile pills ─────────────────────────────────────────── */}
          <Section label="Profile">
            <div className="flex flex-wrap gap-1.5">
              <ProfilePill label="Phase" value={meta.phase} />
              <ProfilePill label="Mobility" value={meta.mobility} />
              <ProfilePill
                label="CC"
                value={meta.cc === "none" ? "no cc" : `${meta.cc} cc`}
              />
              {meta.archetypes.map((a) => (
                <ProfilePill
                  key={a}
                  label="Archetype"
                  value={a}
                  variant="archetype"
                />
              ))}
            </div>
          </Section>

          {/* ─── Combat fingerprint ───────────────────────────────────── */}
          <Section label="Combat fingerprint">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-[11px]">
              <Stat label="Hard CC" value={`${ability.hardCCDuration.toFixed(1)}s`} hint="Max stun/knockup duration in kit" />
              <Stat label="Ult CD" value={`${ability.ultCooldown}s`} hint="Cooldown of R at rank 1" />
              <Stat label="Ult cast" value={`${ability.ultCastTime.toFixed(2)}s`} hint="0 = instant" />
              <Stat
                label="Burst window"
                value={`${ability.burstWindowSeconds}s`}
                hint="Approximate damage dump duration"
              />
              <Stat
                label="Resets"
                value={ability.hasResets ? "Yes" : "No"}
                hint="Has takedown / charge resets"
              />
            </div>
          </Section>

          {/* ─── Synergies ────────────────────────────────────────────── */}
          {synergies.length > 0 && (
            <Section
              label={`Synergies (${synergies.length})`}
              hint="Champions that combo with their kit"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {synergies.map((s) => (
                  <SynergyRow
                    key={`${s.partner.alias}-${s.tag}`}
                    entry={s}
                    byId={byId}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* ─── Counters ─────────────────────────────────────────────── */}
          {(counters.vsUs.length > 0 || counters.weBeat.length > 0) && (
            <Section
              label="Lane matchups"
              hint="Curated hard counters in either direction"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CounterColumn
                  title={`Counters ${champion.name}`}
                  subtitle="Strong picks against them"
                  entries={counters.vsUs}
                  byId={byId}
                  accent="text-rift-redbright"
                  border="border-rift-red/40"
                />
                <CounterColumn
                  title={`${champion.name} counters`}
                  subtitle="Beat these in lane"
                  entries={counters.weBeat}
                  byId={byId}
                  accent="text-rift-bluebright"
                  border="border-rift-blue/40"
                />
              </div>
            </Section>
          )}

          {synergies.length === 0 &&
            counters.vsUs.length === 0 &&
            counters.weBeat.length === 0 && (
              <div className="text-center text-[11px] uppercase tracking-[0.3em] text-rift-mutedbright/60 italic py-2">
                No curated synergies or matchups for this champion yet
              </div>
            )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55">
          {label}
        </div>
        {hint && (
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/40">
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ProfilePill({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "archetype";
}) {
  const cls =
    variant === "archetype"
      ? "border-rift-gold/40 bg-rift-gold/10 text-rift-goldbright"
      : "border-rift-line bg-rift-bg/60 text-rift-mutedbright";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 border ${cls}`}
    >
      <span className="text-rift-mutedbright/60">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-rift-line/60 bg-rift-bg/40 px-2.5 py-1.5">
      <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
        {label}
      </div>
      <div className="font-display text-sm md:text-base tabular-nums text-rift-goldbright leading-tight mt-0.5">
        {value}
      </div>
      {hint && (
        <div className="text-[8px] tracking-[0.1em] text-rift-mutedbright/50 mt-0.5 leading-tight">
          {hint}
        </div>
      )}
    </div>
  );
}

function SynergyRow({
  entry,
  byId,
}: {
  entry: SynergyEntry;
  byId: Map<number, Champion>;
}) {
  const c = byId.get(entry.partner.id);
  if (!c) return null;
  // Bonus 3 = iconic combo (gold), 2 = strong (silver), 1 = minor (muted).
  const bonusCls =
    entry.bonus >= 3
      ? "text-rift-goldbright"
      : entry.bonus >= 2
      ? "text-rift-bluebright"
      : "text-rift-mutedbright";
  return (
    <div className="flex items-center gap-2 py-1 px-1.5 border border-rift-line/50 bg-rift-bg/40 hover:border-rift-gold/40 hover:bg-rift-gold/5 transition-colors">
      <img
        src={c.iconUrl}
        alt={c.name}
        className="w-7 h-7 md:w-8 md:h-8 flex-shrink-0 border border-rift-line"
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] md:text-xs font-display tracking-wider text-rift-mutedbright truncate">
          {c.name}
        </div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-rift-mutedbright/60 truncate">
          {entry.tag}
        </div>
      </div>
      <span
        className={`text-[10px] md:text-[11px] font-display tabular-nums tracking-tight ${bonusCls} flex-shrink-0`}
        title={`Synergy bonus +${entry.bonus}`}
      >
        +{entry.bonus}
      </span>
    </div>
  );
}

function CounterColumn({
  title,
  subtitle,
  entries,
  byId,
  accent,
  border,
}: {
  title: string;
  subtitle: string;
  entries: CounterEntry[];
  byId: Map<number, Champion>;
  accent: string;
  border: string;
}) {
  // Split by severity for visual hierarchy: hard counters land at the top
  // in a HARD-tagged sub-section, soft below. Bonus magnitudes:
  //   >= 4 → hard (lane is genuinely lost in equal skill)
  //   2-3  → soft (matchup favored, not unwinnable)
  //   1    → situational
  const hard = entries.filter((e) => e.bonus >= 4);
  const soft = entries.filter((e) => e.bonus >= 2 && e.bonus < 4);
  const situational = entries.filter((e) => e.bonus < 2);
  return (
    <div className={`border ${border} bg-rift-bg/40 p-2.5`}>
      <div className={`text-[10px] md:text-[11px] font-display uppercase tracking-[0.25em] ${accent} truncate`}>
        {title}
      </div>
      <div className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/55 mt-0.5 mb-2">
        {subtitle}
      </div>
      {entries.length === 0 ? (
        <div className="text-[10px] uppercase tracking-[0.25em] text-rift-mutedbright/45 italic">
          None curated
        </div>
      ) : (
        <div className="space-y-2">
          {hard.length > 0 && (
            <CounterSubgroup
              label="Hard"
              tone="hard"
              entries={hard}
              byId={byId}
            />
          )}
          {soft.length > 0 && (
            <CounterSubgroup
              label="Soft"
              tone="soft"
              entries={soft}
              byId={byId}
            />
          )}
          {situational.length > 0 && (
            <CounterSubgroup
              label="Situational"
              tone="situational"
              entries={situational}
              byId={byId}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CounterSubgroup({
  label,
  tone,
  entries,
  byId,
}: {
  label: string;
  tone: "hard" | "soft" | "situational";
  entries: CounterEntry[];
  byId: Map<number, Champion>;
}) {
  // Tone-specific styling so the user can scan severity at a glance.
  // Hard counters get a stronger badge and warm glow on the bonus number.
  const labelCls =
    tone === "hard"
      ? "text-rift-redbright/80 border-rift-red/50 bg-rift-red/10"
      : tone === "soft"
      ? "text-rift-goldbright/80 border-rift-gold/40 bg-rift-gold/5"
      : "text-rift-mutedbright/60 border-rift-line/60 bg-rift-bg/40";
  const bonusCls =
    tone === "hard"
      ? "text-rift-redbright"
      : tone === "soft"
      ? "text-rift-goldbright"
      : "text-rift-mutedbright/70";
  return (
    <div>
      <div className={`inline-flex items-center gap-1 px-1.5 py-px text-[8px] uppercase tracking-[0.3em] border ${labelCls} mb-1`}>
        {label}
        <span className="tabular-nums opacity-60">{entries.length}</span>
      </div>
      <div className="space-y-1">
        {entries.map((e) => {
          const c = byId.get(e.other.id);
          if (!c) return null;
          return (
            <div
              key={`${e.other.alias}-${e.bonus}`}
              className="flex items-center gap-2 py-0.5"
            >
              <img
                src={c.iconUrl}
                alt={c.name}
                className="w-6 h-6 flex-shrink-0 border border-rift-line"
              />
              <span className="text-[11px] font-display tracking-wider text-rift-mutedbright truncate flex-1">
                {c.name}
              </span>
              <span
                className={`text-[10px] font-display tabular-nums flex-shrink-0 ${bonusCls}`}
              >
                +{e.bonus}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
