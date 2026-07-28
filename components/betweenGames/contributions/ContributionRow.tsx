"use client";

import type { LaneKDA } from "@/lib/matchSimulator";
import type { Archetype, CC, ChampionMeta, Phase } from "@/lib/championMeta";
import type { Champion, Lane, Side } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";
import PlayerNameLink from "@/components/player/PlayerNameLink";

// ─── Pill components ──────────────────────────────────────────────────────────

function PhasePill({ phase }: { phase: Phase }) {
  // Phase colors are kept neutral on purpose — side colors (blue/red) are
  // reserved for team identity, so phase uses Riot's class palette.
  const cls =
    phase === "early"
      ? "border-rift-marksman/50 text-rift-marksman bg-rift-marksman/10"
      : phase === "late"
      ? "border-rift-mage/50 text-rift-mage bg-rift-mage/10"
      : phase === "mid-late"
      ? "border-rift-gold/50 text-rift-goldbright bg-rift-gold/10"
      : "border-rift-line text-rift-mutedbright";
  return (
    <span
      className={`text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border ${cls}`}
    >
      {phase}
    </span>
  );
}

function ArchetypePill({ archetype }: { archetype: Archetype }) {
  return (
    <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border border-rift-line/70 bg-rift-line/30 text-rift-mutedbright">
      {archetype}
    </span>
  );
}

function CCPill({ cc }: { cc: CC }) {
  if (cc === "none") {
    return (
      <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border border-rift-line text-rift-muted">
        no cc
      </span>
    );
  }
  const cls =
    cc === "hard"
      ? "border-rift-gold/60 text-rift-goldbright"
      : "border-rift-line/70 text-rift-mutedbright";
  return (
    <span
      className={`text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1 py-px border ${cls}`}
    >
      {cc} cc
    </span>
  );
}

// ─── RatingBadge ──────────────────────────────────────────────────────────────

// Compact 1-10 rating chip. Color-coded: ≥8 gold, ≥6.5 green, ≥5 muted,
// <5 red. Shown next to KDA in the post-match contribution row.
export function RatingBadge({ rating }: { rating: number }) {
  const cls =
    rating >= 8
      ? "bg-rift-gold/20 border-rift-gold/60 text-rift-goldbright"
      : rating >= 6.5
      ? "bg-emerald-900/30 border-emerald-500/50 text-emerald-300"
      : rating >= 5
      ? "bg-rift-bg/60 border-rift-line text-rift-mutedbright"
      : "bg-rift-red/15 border-rift-red/40 text-rift-redbright/80";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px border text-[9px] tabular-nums font-semibold tracking-wide ${cls}`}
      title={`Player rating: ${rating.toFixed(1)}/10`}
      aria-label={`Rating ${rating.toFixed(1)}`}
    >
      {rating.toFixed(1)}
    </span>
  );
}

// ─── FormIndicator ────────────────────────────────────────────────────────────

// Small "in form" / "cold" arrow indicator. Threshold |form| >= 0.25.
function FormIndicator({ form }: { form: number }) {
  if (Math.abs(form) < 0.25) return null;
  const isHot = form > 0;
  const label = isHot ? `In form (+${form.toFixed(2)})` : `Cold (${form.toFixed(2)})`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`text-[10px] leading-none ${isHot ? "text-emerald-400" : "text-rift-redbright/80"}`}
    >
      {isHot ? "▲" : "▼"}
    </span>
  );
}

// ─── ContributionRow ──────────────────────────────────────────────────────────

export function ContributionRow({
  champ,
  meta,
  lane,
  side,
  kda,
  damageShare,
  rating,
  form,
  playerName,
  playerId,
}: {
  champ: Champion;
  meta: ChampionMeta | null;
  lane: Lane | null;
  side: Side;
  kda: LaneKDA | null;
  // Null = pre-match; number = 0..1 share of team damage.
  damageShare: number | null;
  // Optional 1-10 performance rating for this player's game.
  rating?: number;
  // Optional form value in [-1, 1] for this player.
  form?: number;
  // Optional player handle (e.g. "Faker"). Renders near champion name.
  playerName?: string | null;
  // Stable id behind the handle, so the name opens a player card.
  playerId?: string | null;
}) {
  const accent = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const barCls = side === "blue" ? "bg-rift-blue" : "bg-rift-red";
  const barTrackCls =
    side === "blue" ? "bg-rift-blue/15" : "bg-rift-red/15";
  const sharePct = damageShare != null ? Math.round(damageShare * 100) : null;
  return (
    <div className="flex items-center gap-2.5 md:gap-3">
      <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 border-2 border-rift-line overflow-hidden bg-rift-bg">
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {lane && <LaneIcon lane={lane} size="xs" />}
            <span
              className={`${accent} text-xs md:text-sm font-display tracking-wider truncate`}
            >
              {champ.name}
            </span>
            {playerName && (
              <PlayerNameLink
                playerId={playerId ?? undefined}
                name={playerName}
                className="text-[10px] font-medium text-rift-mutedbright truncate"
              />
            )}
            {form != null && <FormIndicator form={form} />}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {kda && (
              <span className="text-[10px] md:text-[11px] tabular-nums tracking-tight text-rift-mutedbright">
                {/* Fixed KDA palette so colors carry meaning instead of
                    side identity: kills = emerald (good), deaths = red
                    (bad), assists = gold. */}
                <span className="text-emerald-300">{kda.k}</span>
                <span className="text-rift-muted">/</span>
                <span className="text-rift-redbright/80">{kda.d}</span>
                <span className="text-rift-muted">/</span>
                <span className="text-rift-goldbright/85">{kda.a}</span>
              </span>
            )}
            {rating != null && <RatingBadge rating={rating} />}
          </div>
        </div>
        {/* Damage-share bar — only post-match. Bar uses the team's accent
            color; track is a faded version. Percentage label sits inside
            the track so we don't waste vertical space. */}
        {sharePct != null ? (
          <div className={`relative h-2.5 ${barTrackCls} rounded-sm`}>
            <div
              className={`h-full ${barCls} rounded-sm transition-all`}
              style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
            />
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] tabular-nums text-rift-mutedbright/90 leading-none">
              {sharePct}%
            </span>
          </div>
        ) : meta ? (
          <div className="flex items-center gap-1 flex-wrap">
            <PhasePill phase={meta.phase} />
            {meta.archetypes.slice(0, 3).map((a) => (
              <ArchetypePill key={a} archetype={a} />
            ))}
            <CCPill cc={meta.cc} />
          </div>
        ) : (
          <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted/70">
            No data
          </div>
        )}
      </div>
    </div>
  );
}
