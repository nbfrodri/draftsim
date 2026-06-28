"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { MAIN_POOL, LANE_ORDER } from "@/lib/players";
import {
  transferCandidates,
  userTransferCount,
  USER_MAX_TRANSFERS_PER_WINDOW,
} from "@/lib/season/transfers";
import {
  INTERNATIONAL_LABELS,
  seasonTeam,
  type PlayerTransfer,
  type SeasonState,
  type TransferPlayer,
} from "@/lib/season/types";
import type { Champion, Lane, PlayerTier } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import LaneIcon from "./LaneIcon";
import { ChemScore, ProjectedChemScore } from "./ChemistryRow";

// Transfer-window UI: the league-wide recap of roster moves at each window
// (after First Stand and MSI), plus the followed team's pending decisions with
// full player detail — skill tier, this split's grade, and champion pool. The
// season pauses on a transfer phase only while the user has decisions to make.

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};
const noteColor = (n: number | null) =>
  n == null ? "text-rift-muted/45" : n >= 7 ? "text-emerald-400" : n < 5.5 ? "text-rift-redbright" : "text-rift-mutedbright";
const fmtNote = (n: number | null) => (n == null ? "–" : n.toFixed(1));

// The qualifying-split the window's grades are drawn from, for the criteria note.
const WINDOW_SPLIT: Record<string, string> = {
  "first-stand": "Winter Split + First Stand",
  msi: "Spring Split + MSI",
};

// Skill tier + split grade + champion pool for one moving player.
function PlayerChip({
  p,
  byId,
}: {
  p: TransferPlayer;
  byId: Map<number, Champion>;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {p.name && (
        <span className="text-[10px] text-rift-mutedbright font-medium max-w-[72px] truncate" title={p.name}>
          {p.name}
        </span>
      )}
      <span className={`w-4 text-center border text-[10px] font-display ${TIER_CLS[p.tier]}`}>
        {p.tier}
      </span>
      <span className={`text-[9px] tabular-nums ${noteColor(p.grade)}`} title="Split grade (1-10)">
        {fmtNote(p.grade)}
      </span>
      <span className="inline-flex gap-0.5" title="Champion pool (mains first)">
        {p.goodChamps.map((id, i) => {
          const c = byId.get(id);
          if (!c) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={c.iconUrl}
              alt={c.name}
              title={`${c.name}${i < MAIN_POOL ? " (main)" : ""}`}
              className={`w-4 h-4 object-cover border border-rift-line/40 ${i >= MAIN_POOL ? "opacity-50" : ""}`}
            />
          );
        })}
      </span>
    </span>
  );
}

// One completed (auto-applied or accepted) move: the star goes from→to, the
// swap comes back the other way.
function TransferRow({
  tr,
  season,
  byId,
}: {
  tr: PlayerTransfer;
  season: SeasonState;
  byId: Map<number, Champion>;
}) {
  const from = seasonTeam(season, tr.fromTeamId);
  const to = seasonTeam(season, tr.toTeamId);
  const controlledId = season.config.controlledTeamId;
  const mine = !!controlledId && (tr.fromTeamId === controlledId || tr.toTeamId === controlledId);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] py-1 border-t border-rift-line/15 first:border-t-0 ${mine ? "bg-rift-blue/[0.06]" : ""}`}
    >
      <LaneIcon lane={tr.lane} size="xs" className="shrink-0" />
      {mine && (
        <span className="px-1 border border-rift-blue/50 text-rift-bluebright text-[7px] uppercase tracking-[0.2em]">
          You
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-rift-mutedbright">
        <TeamIcon iconKey={from?.iconKey ?? "shield"} logoUrl={from?.logoUrl} size={12} color={from?.color} />
        <span className="truncate max-w-[88px]">{from?.name ?? "—"}</span>
        <span className="text-rift-gold/60">→</span>
        <TeamIcon iconKey={to?.iconKey ?? "shield"} logoUrl={to?.logoUrl} size={12} color={to?.color} />
        <span className="truncate max-w-[88px]">{to?.name ?? "—"}</span>
      </span>
      <PlayerChip p={tr.star} byId={byId} />
      <span className="text-rift-muted/40">⇄</span>
      <PlayerChip p={tr.swap} byId={byId} />
    </div>
  );
}

export default function TransferWindowPanel() {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const resolveSeasonTransfer = useDraftStore((s) => s.resolveSeasonTransfer);
  const aiDecideSeasonTransfers = useDraftStore((s) => s.aiDecideSeasonTransfers);
  const advanceSeasonTransfers = useDraftStore((s) => s.advanceSeasonTransfers);
  const shopSeasonTransfer = useDraftStore((s) => s.shopSeasonTransfer);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [shopLane, setShopLane] = useState<Lane | null>(null);

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c] as const)),
    [champions],
  );
  // Candidate swaps for the lane the user is shopping (willing teams first).
  const candidates = useMemo(
    () => (season && shopLane ? transferCandidates(season, champions, shopLane) : []),
    [season, champions, shopLane],
  );

  if (!season || !season.config.playerTransfers) return null;

  const phase = season.phases[season.phaseIndex];
  const atWindow = phase?.kind === "transfer" && phase.status === "in-progress";
  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const byEvent = season.transfersByEvent ?? {};
  // Roles your team has already used this window — one move per role.
  const movedLanes = new Set<Lane>();
  if (atWindow && phase?.event && controlled) {
    for (const m of byEvent[phase.event] ?? []) {
      if (m.fromTeamId === controlled.id || m.toTeamId === controlled.id) {
        movedLanes.add(m.lane);
      }
    }
  }
  // Per-window transfer cap (distinct roles already enforced by movedLanes).
  const usedCount =
    atWindow && phase?.event && controlled
      ? userTransferCount(season, phase.event, controlled.id)
      : 0;
  const capReached = usedCount >= USER_MAX_TRANSFERS_PER_WINDOW;
  // Hide any leftover proposal on a role already transacted.
  const proposals = (season.proposedTransfers ?? []).filter((p) => !movedLanes.has(p.lane));
  const windows = (Object.keys(byEvent) as Array<keyof typeof byEvent>).filter(
    (e) => (byEvent[e]?.length ?? 0) > 0,
  );

  // Nothing to show yet.
  if (!atWindow && windows.length === 0) return null;

  // Next split label for the proceed button.
  const nextPhase = season.phases[season.phaseIndex + 1];
  const nextLabel = nextPhase?.label ?? "next split";

  // In a reality, tag each window with the franchise year so the timeline is
  // legible across many seasons ("post First Stand · Year 3").
  const yr = season.franchise ? ` · Year ${season.franchise.year}` : "";

  return (
    <div className="mb-8 border border-rift-gold/30 bg-rift-gold/[0.03]">
      <div className="px-3 py-1.5 border-b border-rift-gold/25 flex items-center gap-2">
        <span className="font-display text-sm tracking-wider text-rift-goldbright">
          Transfer Window
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted/55">
          between splits
        </span>
      </div>

      {/* Followed team's pending decisions */}
      {atWindow && (
        <div className="px-3 py-2 border-b border-rift-gold/20 bg-rift-gold/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
              Your decisions{phase?.event ? ` — post ${INTERNATIONAL_LABELS[phase.event]}${yr}` : ""}
            </span>
            {!capReached && (
              <button
                type="button"
                onClick={() => aiDecideSeasonTransfers()}
                className="ml-auto px-2 py-0.5 border border-rift-blue/50 text-rift-bluebright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-blue/10 transition-all"
                title="Let the AI resolve your proposals and shop the best upgrades for you"
              >
                Let AI decide
              </button>
            )}
          </div>
          {proposals.length === 0 ? (
            <div className="text-[10px] italic text-rift-muted mb-2">
              No moves involving your team this window.
            </div>
          ) : (
            <div className="space-y-1.5 mb-2">
              {proposals.map((pr, i) => {
                const other = seasonTeam(season, pr.otherTeamId);
                const incoming = pr.kind === "incoming";
                return (
                  <div
                    key={`${pr.lane}-${pr.otherTeamId}-${i}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]"
                  >
                    <LaneIcon lane={pr.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      {incoming ? "Sign from" : "Poach by"}{" "}
                      <span className="text-rift-bluebright">{other?.name ?? "—"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[8px] uppercase tracking-[0.2em] text-emerald-400/70">In</span>
                      <PlayerChip p={pr.theirs} byId={byId} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[8px] uppercase tracking-[0.2em] text-rift-redbright/70">Out</span>
                      <PlayerChip p={pr.mine} byId={byId} />
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => resolveSeasonTransfer(i, true)}
                        className="px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveSeasonTransfer(i, false)}
                        className="px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-red/50 hover:text-rift-redbright transition-all"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shop your roster — pick a slot, see who's tradeable for it */}
          {controlled && (
            <div className="mb-2 border-t border-rift-gold/15 pt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
                  Shop your roster
                </span>
                <span
                  className={`ml-auto text-[8px] uppercase tracking-[0.2em] tabular-nums ${capReached ? "text-rift-redbright/80" : "text-rift-muted/60"}`}
                  title={`Up to ${USER_MAX_TRANSFERS_PER_WINDOW} transfers per window, one per role`}
                >
                  {usedCount}/{USER_MAX_TRANSFERS_PER_WINDOW} signed
                </span>
              </div>
              <div className="space-y-1">
                {LANE_ORDER.map((lane, li) => {
                  const p = controlled.players[li];
                  if (!p) return null;
                  const open = shopLane === lane;
                  const willing = candidates.filter((c) => c.willing);
                  return (
                    <div key={lane}>
                      <div className="flex items-center gap-2 text-[10px]">
                        <LaneIcon lane={lane} size="sm" className="shrink-0" />
                        <PlayerChip
                          p={{ name: p.name, tier: p.tier, grade: null, goodChamps: p.goodChamps }}
                          byId={byId}
                        />
                        <ChemScore me={p} roster={controlled.players} />
                        {movedLanes.has(lane) ? (
                          <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-emerald-400/80">
                            ✓ signed this window
                          </span>
                        ) : capReached ? (
                          <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-rift-muted/50">
                            cap reached
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShopLane(open ? null : lane)}
                            className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
                          >
                            {open ? "Close" : "Find transfers"}
                          </button>
                        )}
                      </div>
                      {open && !movedLanes.has(lane) && (
                        <div className="ml-8 mt-1 space-y-1">
                          {willing.length === 0 ? (
                            <div className="text-[9px] italic text-rift-muted">
                              No team will trade for this slot right now.
                            </div>
                          ) : (
                            willing.slice(0, 6).map((c) => {
                              const other = seasonTeam(season, c.otherTeamId);
                              const incoming = other?.players[li];
                              return (
                                <div
                                  key={c.otherTeamId}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]"
                                >
                                  <span className="inline-flex items-center gap-1 text-rift-mutedbright">
                                    <TeamIcon
                                      iconKey={other?.iconKey ?? "shield"}
                                      logoUrl={other?.logoUrl}
                                      size={12}
                                      color={other?.color}
                                    />
                                    <span className="truncate max-w-[96px]">{other?.name ?? "—"}</span>
                                  </span>
                                  <PlayerChip p={c.theirs} byId={byId} />
                                  {incoming && (
                                    <ProjectedChemScore
                                      roster={controlled.players}
                                      incoming={incoming}
                                      lane={lane}
                                    />
                                  )}
                                  <span
                                    className={`text-[9px] tabular-nums ${c.upgrade > 0.05 ? "text-emerald-400" : c.upgrade < -0.05 ? "text-rift-redbright" : "text-rift-muted/60"}`}
                                    title="Value change for your team"
                                  >
                                    {c.upgrade >= 0 ? "+" : ""}
                                    {c.upgrade.toFixed(1)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      shopSeasonTransfer(lane, c.otherTeamId);
                                      setShopLane(null);
                                    }}
                                    className="ml-auto px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                                  >
                                    Offer swap
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => advanceSeasonTransfers()}
            className="w-full py-1.5 border border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[10px] uppercase tracking-[0.25em] hover:bg-rift-gold/20 transition-all"
          >
            Proceed to {nextLabel} →
          </button>
        </div>
      )}

      {/* League-wide recap, per window */}
      <div className="px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/55 mb-1">
          Around the leagues
        </div>
        <p className="text-[9px] text-rift-muted/60 mb-2 leading-relaxed">
          Players are valued by skill tier, their grades over the{" "}
          {WINDOW_SPLIT[(phase?.event as string) ?? windows[0] ?? "first-stand"] ?? "recent split"},
          and how well their champion pool fits the new patch. The most underrated
          players move up to the best-finishing teams; weak links drop down. Cross-region.
        </p>
        {windows.length === 0 ? (
          <div className="text-[10px] italic text-rift-muted">
            No completed transfers yet.
          </div>
        ) : (
          windows.map((e) => {
            const moves = byEvent[e] ?? [];
            const isOpen = openEvent === e || windows.length === 1;
            return (
              <div key={e} className="mb-1.5">
                <button
                  type="button"
                  onClick={() => setOpenEvent(isOpen ? "__none__" : (e as string))}
                  className="w-full flex items-center justify-between px-2 py-1 border border-rift-line/40 bg-rift-bg/30 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright transition-all"
                >
                  <span>
                    Post {INTERNATIONAL_LABELS[e]}{yr} — {moves.length} move{moves.length === 1 ? "" : "s"}
                  </span>
                  <span>{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div className="px-2 py-1 border border-t-0 border-rift-line/30">
                    {moves.map((tr, i) => (
                      <TransferRow key={i} tr={tr} season={season} byId={byId} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
