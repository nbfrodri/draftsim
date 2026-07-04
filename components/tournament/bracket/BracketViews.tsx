"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { useDraftStore } from "@/store/draftStore";
import { formatHeaderLabel } from "@/components/tournament/shared";
import {
  tripleElimLosses,
  tripleElimEliminated,
  TRIPLE_ELIM_LIVES,
} from "@/lib/tournament";
import TeamIcon from "@/components/TeamIcon";
import { MatchCard } from "./MatchCard";
import { BracketConnectorRoot, MatchAnchor } from "./BracketConnectors";
import type { TournamentMatch, TournamentState, TournamentTeam } from "@/lib/tournament";

// ─── Header ────────────────────────────────────────────────────────────

export function Header({
  tournament,
  champion,
  totalRounds,
}: {
  tournament: TournamentState;
  champion: TournamentTeam | null;
  totalRounds: number;
}) {
  const completed = tournament.matches.filter((m) => m.winner).length;
  const total = tournament.matches.length;
  const crownRef = useRef<HTMLDivElement | null>(null);

  // Animate the crown banner on mount when a champion is set. Scoped via
  // gsap.context so multiple dashboard mounts don't double-animate.
  // Tweens: flash + scale-in for the wreath, glow pulse for the border,
  // and a stagger for the inner text. Honors prefers-reduced-motion via
  // GSAP's matchMedia for accessibility.
  useEffect(() => {
    if (!champion || !crownRef.current) return;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.from(crownRef.current, {
          scale: 0.6,
          opacity: 0,
          duration: 0.55,
          ease: "back.out(1.7)",
        })
          .from(
            ".crown-label",
            { y: -8, opacity: 0, duration: 0.35, ease: "power2.out" },
            "-=0.2",
          )
          .from(
            ".crown-name",
            { y: 8, opacity: 0, duration: 0.4, ease: "power2.out" },
            "<",
          )
          .to(
            crownRef.current,
            {
              boxShadow:
                "0 0 30px rgba(240, 200, 100, 0.55), 0 0 60px rgba(240, 200, 100, 0.25)",
              duration: 0.8,
              repeat: 2,
              yoyo: true,
              ease: "sine.inOut",
            },
            "-=0.1",
          );
      });
      // Reduced-motion: just fade in.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.from(crownRef.current, { opacity: 0, duration: 0.3 });
      });
    }, crownRef);
    return () => ctx.revert();
  }, [champion]);

  return (
    <div className="text-center mb-6 md:mb-8">
      <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70">
        {formatHeaderLabel(tournament.format)}
        {" · "}
        {tournament.teams.length} Teams · {totalRounds} Round{totalRounds > 1 ? "s" : ""}
      </div>
      <h1 className="font-display text-3xl md:text-5xl tracking-[0.15em] text-rift-goldbright mt-2 truncate">
        {tournament.name}
      </h1>
      {champion ? (
        <div
          ref={crownRef}
          className="mt-3 inline-flex items-center gap-3 px-5 py-2.5 border-2 border-rift-gold bg-rift-gold/10 shadow-glow-gold relative"
        >
          {/* Decorative laurel marks — pure typography so no asset cost */}
          <span aria-hidden className="text-rift-gold/70 text-base">
            &#x2766;
          </span>
          <span className="crown-label text-[9px] uppercase tracking-[0.4em] text-rift-gold/80">
            Champion
          </span>
          <span className="crown-name font-display text-lg md:text-2xl text-rift-goldbright tracking-wider">
            {champion.name}
          </span>
          <span aria-hidden className="text-rift-gold/70 text-base">
            &#x2766;
          </span>
        </div>
      ) : (
        <div className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-rift-mutedbright/70 mt-2">
          {completed}/{total} matches complete
        </div>
      )}
    </div>
  );
}

// ─── Round column ──────────────────────────────────────────────────────

export function RoundColumn({
  round,
  totalRounds,
  matches,
  tournament,
  onStartMatch,
  onViewMatch,
  kind = "se",
}: {
  round: number;
  totalRounds: number;
  matches: TournamentMatch[];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
  // "se": this column belongs to a single-elim tree, so the last round
  // IS the final and SE names (Quarterfinals/Semifinals/Final) apply.
  // "de-winners": this is the upper bracket of a double-elim — its last
  // round feeds the GRAND final, so SE names would mislabel rounds
  // (the "Semifinals" series-format setting targets the Winners +
  // Losers Finals, not Winners round N-1). Use DE names instead.
  // "stepladder": a linear gauntlet — each round is one "rung", so use
  // plain "Round k" with a "Final" at the top.
  kind?: "se" | "de-winners" | "stepladder";
}) {
  const roundLabel =
    kind === "de-winners"
      ? round === totalRounds
        ? "Winners Final"
        : `Winners Round ${round}`
      : kind === "stepladder"
      ? round === totalRounds
        ? "Final"
        : `Rung ${round}`
      : round === totalRounds
      ? "Final"
      : round === totalRounds - 1
      ? "Semifinals"
      : round === totalRounds - 2
      ? "Quarterfinals"
      : `Round ${round}`;
  return (
    <div className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/55 text-center mb-3">
        {roundLabel}
      </div>
      <div
        className="flex-1 flex flex-col gap-3 md:gap-4 justify-around"
      >
        {matches.map((m) => (
          <MatchAnchor key={m.id} matchId={m.id}>
            <MatchCard
              match={m}
              tournament={tournament}
              onStart={() => onStartMatch(m.id)}
              onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
            />
          </MatchAnchor>
        ))}
      </div>
    </div>
  );
}

// Losers-bracket round labels differ from W-side. Terminal round is
// "Losers Final" (one of the two matches feeding the grand final, so
// it pairs with "Winners Final"); everything before is a numbered
// round — deliberately NOT "Losers Semi", which would clash with the
// Semifinals series-format setting that targets only the two finals.
export function LosersRoundColumn({
  round,
  totalRounds,
  matches,
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  round: number;
  totalRounds: number;
  matches: TournamentMatch[];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const roundLabel =
    round === totalRounds ? "Losers Final" : `Losers Round ${round}`;
  return (
    <div className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-redbright/55 text-center mb-3">
        {roundLabel}
      </div>
      <div className="flex-1 flex flex-col gap-3 md:gap-4 justify-around">
        {matches.map((m) => (
          <MatchAnchor key={m.id} matchId={m.id}>
            <MatchCard
              match={m}
              tournament={tournament}
              onStart={() => onStartMatch(m.id)}
              onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
            />
          </MatchAnchor>
        ))}
      </div>
    </div>
  );
}

// ─── Double-elim view ──────────────────────────────────────────────────
// Stacks the winners bracket on top, losers bracket below, and the
// grand-final card at the bottom. Each bracket is its own horizontal
// scroller so the rounds align column-wise within their own scope.
export function DoubleElimView({
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const winners = tournament.matches.filter((m) => m.bracket === "winners");
  const losers = tournament.matches.filter((m) => m.bracket === "losers");
  const grandFinal =
    tournament.matches.find((m) => m.bracket === "grand-final") ?? null;
  const grandFinalReset =
    tournament.matches.find((m) => m.bracket === "grand-final-reset") ?? null;
  const groupByRound = (matches: TournamentMatch[]): TournamentMatch[][] => {
    const max = matches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const rounds: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = matches.filter((m) => m.round === r);
      if (inRound.length > 0) rounds.push(inRound);
    }
    return rounds;
  };
  const winnersByRound = groupByRound(winners);
  const losersByRound = groupByRound(losers);
  const wTotal = winnersByRound.length;
  const lTotal = losersByRound.length;
  const connectorMatches = [
    ...winners,
    ...losers,
    ...(grandFinal ? [grandFinal] : []),
    ...(grandFinalReset ? [grandFinalReset] : []),
  ];
  // One unified horizontal scroll wraps BracketConnectorRoot so the SVG
  // overlay and every match card share the same coordinate/scroll space.
  // Previously, separate overflow-x-auto containers for W and L brackets
  // caused the SVG (outside those containers) to draw lines to clipped-away
  // cards, producing orphaned/mispositioned connector paths on scroll.
  return (
    <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
      <BracketConnectorRoot
        matches={connectorMatches}
        className="inline-flex flex-row items-stretch gap-6"
      >
        {/* W-bracket + L-bracket stacked vertically; rounds are plain flex
            columns — no nested scroll containers. */}
        <div className="flex flex-col gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Winners Bracket
            </div>
            <div className="flex items-stretch gap-4 md:gap-6">
              {winnersByRound.map((roundMatches, idx) => (
                <RoundColumn
                  key={idx}
                  round={idx + 1}
                  totalRounds={wTotal}
                  matches={roundMatches}
                  tournament={tournament}
                  onStartMatch={onStartMatch}
                  onViewMatch={onViewMatch}
                  kind="de-winners"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
              Losers Bracket
            </div>
            <div className="flex items-stretch gap-4 md:gap-6">
              {losersByRound.map((roundMatches, idx) => (
                <LosersRoundColumn
                  key={idx}
                  round={idx + 1}
                  totalRounds={lTotal}
                  matches={roundMatches}
                  tournament={tournament}
                  onStartMatch={onStartMatch}
                  onViewMatch={onViewMatch}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Grand Final — always to the right, vertically centred within the
            scroll unit. No xl: breakpoint needed since layout is always row. */}
        {grandFinal && (
          <div className="flex-shrink-0 w-[240px] flex flex-col justify-center pl-6 border-l border-rift-gold/20">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                Grand Final
              </div>
              <MatchAnchor matchId={grandFinal.id}>
                <MatchCard
                  match={grandFinal}
                  tournament={tournament}
                  onStart={() => onStartMatch(grandFinal.id)}
                  onView={
                    onViewMatch ? () => onViewMatch(grandFinal.id) : undefined
                  }
                />
              </MatchAnchor>
              {!grandFinalReset && (
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
                  W-side wins outright. L-side win forces a bracket reset.
                </div>
              )}
            </div>

            {grandFinalReset && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                  Grand Final · Reset
                </div>
                <MatchAnchor matchId={grandFinalReset.id}>
                  <MatchCard
                    match={grandFinalReset}
                    tournament={tournament}
                    onStart={() => onStartMatch(grandFinalReset.id)}
                    onView={
                      onViewMatch
                        ? () => onViewMatch(grandFinalReset.id)
                        : undefined
                    }
                  />
                </MatchAnchor>
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
                  L-side forced a reset — this match decides the tournament.
                </div>
              </div>
            )}
          </div>
        )}
      </BracketConnectorRoot>
    </div>
  );
}

// ─── Triple-elim view ──────────────────────────────────────────────────
// Three bracket bands by loss tier — Winners (0 losses), Losers (1),
// Last-Chance (2) — each a horizontal column-per-round scroller, with the
// grand-final race at the bottom. Mirrors the double-elim layout so the
// format reads as "brackets", even though pairings are generated
// dynamically by loss count (a team is out after its 3rd loss).
function TripleElimBand({
  label,
  sub,
  band,
  rounds,
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  label: string;
  sub: string;
  band: "winners" | "losers" | "elimination";
  rounds: TournamentMatch[][];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const simulateMatches = useDraftStore((s) => s.simulateMatches);
  if (rounds.length === 0) return null;
  const flat = rounds.flat();
  const pendingIds = flat
    .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
    .map((m) => m.id);
  const done = flat.filter((m) => m.winner).length;
  // Per-tier accent: winners gold, losers amber, last-chance red.
  const style =
    band === "winners"
      ? { border: "border-rift-gold/40", bar: "bg-rift-gold/[0.06]", text: "text-rift-goldbright", label: "text-rift-gold/75" }
      : band === "losers"
        ? { border: "border-amber-500/40", bar: "bg-amber-500/[0.05]", text: "text-amber-300", label: "text-amber-300/75" }
        : { border: "border-rift-red/45", bar: "bg-rift-red/[0.05]", text: "text-rift-redbright", label: "text-rift-redbright/80" };
  return (
    <div className={`border ${style.border}`}>
      <div className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b ${style.border} ${style.bar}`}>
        <div className="min-w-0">
          <div className={`text-[10px] uppercase tracking-[0.4em] ${style.label}`}>
            {label}
          </div>
          <div className="text-[8px] uppercase tracking-[0.25em] text-rift-mutedbright/55">
            {sub}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/55 tabular-nums">
            {done}/{flat.length}
          </span>
          {pendingIds.length > 0 && (
            <button
              type="button"
              onClick={() => simulateMatches(pendingIds)}
              className={`px-2 py-0.5 border ${style.border} ${style.text} hover:brightness-125 text-[9px] uppercase tracking-[0.25em] transition-all`}
              title={`Auto-play every pending match in the ${label}`}
            >
              Sim Bracket
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto p-2">
        <div
          className="inline-flex items-stretch gap-3 md:gap-5 min-w-full"
          style={{ minWidth: `${rounds.length * 220}px` }}
        >
          {rounds.map((roundMatches, idx) => {
            const roundPending = roundMatches
              .filter((m) => !m.winner && m.blueTeamId && m.redTeamId)
              .map((m) => m.id);
            return (
              <div
                key={idx}
                className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col"
              >
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-gold/55">
                    Round {idx + 1}
                  </span>
                  {roundPending.length > 1 && (
                    <button
                      type="button"
                      onClick={() => simulateMatches(roundPending)}
                      className="px-1 py-px border border-rift-line/50 text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 text-[8px] uppercase tracking-[0.2em] transition-all"
                      title="Auto-play this round"
                    >
                      Sim
                    </button>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-3 md:gap-4 justify-around">
                  {roundMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      tournament={tournament}
                      onStart={() => onStartMatch(m.id)}
                      onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// At-a-glance "lives" board: every team with its remaining lives as pips
// (filled = loss taken), sorted by losses then seed, eliminated teams
// dimmed. Makes the 3-life state legible without reading every bracket.
function TripleElimLivesBoard({
  teams,
  matches,
}: {
  teams: TournamentTeam[];
  matches: TournamentMatch[];
}) {
  const losses = useMemo(() => tripleElimLosses(matches), [matches]);
  // Out = 3 losses OR lost the consolation final (3rd place).
  const eliminated = useMemo(() => tripleElimEliminated(matches), [matches]);
  const rows = useMemo(
    () =>
      [...teams].sort(
        (a, b) =>
          (losses.get(a.id) ?? 0) - (losses.get(b.id) ?? 0) ||
          a.seed - b.seed,
      ),
    [teams, losses],
  );
  const aliveCount = teams.filter((t) => !eliminated.has(t.id)).length;
  return (
    <div className="border border-rift-line/50 bg-rift-panel/40">
      <div className="flex items-baseline justify-between px-3 py-1.5 border-b border-rift-line/40">
        <span className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Lives
        </span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 tabular-nums">
          {aliveCount} alive · {teams.length - aliveCount} out
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-0.5 p-2">
        {rows.map((team) => {
          const l = losses.get(team.id) ?? 0;
          const out = eliminated.has(team.id);
          return (
            <div
              key={team.id}
              className={`flex items-center gap-1.5 text-[11px] py-0.5 ${
                out ? "opacity-40" : ""
              }`}
            >
              <TeamIcon iconKey={team.iconKey} logoUrl={team.logoUrl} size={12} color={team.color ?? undefined} />
              <span
                className={`truncate flex-1 ${
                  out ? "line-through text-rift-mutedbright/70" : "text-rift-mutedbright"
                }`}
              >
                {team.name}
              </span>
              <span className="flex items-center gap-0.5 flex-shrink-0" title={`${l} loss${l === 1 ? "" : "es"}`}>
                {Array.from({ length: TRIPLE_ELIM_LIVES }, (_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      i < l
                        ? "bg-rift-red/80"
                        : "bg-transparent border border-rift-gold/50"
                    }`}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shared triple-elim renderer — lives board + three loss-tier bands +
// the grand-final race. Operates on a given match subset + team list, so
// it serves both a standalone triple-elim tournament (all matches / all
// teams) and a stage+TE playoff bracket (only the bracketed matches +
// the teams that advanced).
function TripleElimBracketBody({
  tournament,
  matches,
  teams,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const groupByRound = (ms: TournamentMatch[]): TournamentMatch[][] => {
    const max = ms.reduce((acc, m) => Math.max(acc, m.round), 0);
    const min = ms.reduce(
      (acc, m) => Math.min(acc, m.round),
      Number.POSITIVE_INFINITY,
    );
    const out: TournamentMatch[][] = [];
    if (!Number.isFinite(min)) return out;
    for (let r = min; r <= max; r++) {
      const inRound = ms.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  };
  const winners = groupByRound(matches.filter((m) => m.bracket === "winners"));
  const losers = groupByRound(matches.filter((m) => m.bracket === "losers"));
  const lastChance = groupByRound(
    matches.filter((m) => m.bracket === "elimination"),
  );
  const consolation = matches.filter((m) => m.bracket === "consolation");
  const grandFinals = matches.filter((m) => m.bracket === "grand-final");
  return (
    <div className="space-y-5">
      <TripleElimLivesBoard teams={teams} matches={matches} />
      <TripleElimBand
        label="Winners Bracket"
        sub="0 losses"
        band="winners"
        rounds={winners}
        tournament={tournament}
        onStartMatch={onStartMatch}
        onViewMatch={onViewMatch}
      />
      <TripleElimBand
        label="Losers Bracket"
        sub="1 loss — one more drops to last chance"
        band="losers"
        rounds={losers}
        tournament={tournament}
        onStartMatch={onStartMatch}
        onViewMatch={onViewMatch}
      />
      <TripleElimBand
        label="Last-Chance Bracket"
        sub="2 losses — lose again and you're out"
        band="elimination"
        rounds={lastChance}
        tournament={tournament}
        onStartMatch={onStartMatch}
        onViewMatch={onViewMatch}
      />
      {(consolation.length > 0 || grandFinals.length > 0) && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
            Finals
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            {consolation.map((m) => (
              <div key={m.id}>
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-redbright/70 mb-1">
                  Consolation Final · loser takes 3rd
                </div>
                <MatchCard
                  match={m}
                  tournament={tournament}
                  onStart={() => onStartMatch(m.id)}
                  onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
                />
              </div>
            ))}
            {grandFinals.map((m) => (
              <div key={m.id}>
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-goldbright/80 mb-1">
                  Grand Final · vs the undefeated Winners champ
                </div>
                <MatchCard
                  match={m}
                  tournament={tournament}
                  onStart={() => onStartMatch(m.id)}
                  onView={onViewMatch ? () => onViewMatch(m.id) : undefined}
                />
              </div>
            ))}
          </div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
            Three bracket champions reach the finals: the Losers &amp;
            Last-Chance champs play the Consolation Final, then the survivor
            faces the undefeated Winners champ for the title.
          </div>
        </div>
      )}
    </div>
  );
}

// Standalone triple-elim tournament view (whole field, every match).
export function TripleElimView({
  tournament,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  return (
    <TripleElimBracketBody
      tournament={tournament}
      matches={tournament.matches}
      teams={tournament.teams}
      onStartMatch={onStartMatch}
      onViewMatch={onViewMatch}
    />
  );
}

// Reusable playoff bracket section — renders either a single-elim
// column layout or a double-elim winners + losers + grand-final stack
// depending on `kind`. Used by SwissView, GroupsPlayoffsView, and the
// round-robin-playoffs branch of RoundRobinView so the same code paths
// drive every stage-format playoff bracket.
export function PlayoffBracketSection({
  tournament,
  playoffMatches,
  kind,
  advancing,
  onStartMatch,
  onViewMatch,
}: {
  tournament: TournamentState;
  playoffMatches: TournamentMatch[];
  kind: "single-elim" | "double-elim" | "triple-elim" | "stepladder";
  advancing: number;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  // Teams that advanced to the playoff bracket (derived from the bracket
  // matches) — used by the triple-elim lives board.
  const teTeams = (() => {
    if (kind !== "triple-elim") return [];
    const ids = new Set<string>();
    for (const m of playoffMatches) {
      if (m.blueTeamId) ids.add(m.blueTeamId);
      if (m.redTeamId) ids.add(m.redTeamId);
    }
    return tournament.teams.filter((t) => ids.has(t.id));
  })();
  // Group matches by round for SE rendering. DE gets its own filter
  // path further down.
  const seRoundsByRound: TournamentMatch[][] = (() => {
    if (kind !== "single-elim" && kind !== "stepladder") return [];
    const max = playoffMatches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const out: TournamentMatch[][] = [];
    for (let r = 1; r <= max; r++) {
      const inRound = playoffMatches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  })();

  const winners =
    kind === "double-elim"
      ? playoffMatches.filter((m) => m.bracket === "winners")
      : [];
  const losers =
    kind === "double-elim"
      ? playoffMatches.filter((m) => m.bracket === "losers")
      : [];
  const grandFinal =
    kind === "double-elim"
      ? playoffMatches.find((m) => m.bracket === "grand-final") ?? null
      : null;
  const grandFinalReset =
    kind === "double-elim"
      ? playoffMatches.find((m) => m.bracket === "grand-final-reset") ?? null
      : null;

  const groupByRound = (matches: TournamentMatch[]): TournamentMatch[][] => {
    const max = matches.reduce((acc, m) => Math.max(acc, m.round), 0);
    const minRound = matches.reduce(
      (acc, m) => Math.min(acc, m.round),
      Number.POSITIVE_INFINITY,
    );
    const out: TournamentMatch[][] = [];
    if (!Number.isFinite(minRound)) return out;
    for (let r = minRound; r <= max; r++) {
      const inRound = matches.filter((m) => m.round === r);
      if (inRound.length > 0) out.push(inRound);
    }
    return out;
  };
  const winnersByRound = groupByRound(winners);
  const losersByRound = groupByRound(losers);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-rift-gold/40">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Knockout Stage
          </div>
          <div className="font-display text-2xl tracking-wider text-rift-goldbright">
            Playoffs
          </div>
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60">
          {kind === "triple-elim"
            ? "Triple-Elim"
            : kind === "double-elim"
              ? "Double-Elim"
              : kind === "stepladder"
                ? "Stepladder"
                : "Single-Elim"}{" "}
          · {advancing} teams
        </div>
      </div>

      {kind === "triple-elim" ? (
        <TripleElimBracketBody
          tournament={tournament}
          matches={playoffMatches}
          teams={teTeams}
          onStartMatch={onStartMatch}
          onViewMatch={onViewMatch}
        />
      ) : kind === "single-elim" || kind === "stepladder" ? (
        <BracketConnectorRoot matches={playoffMatches}>
          <div className="overflow-x-auto pb-2">
            <div
              className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
              style={{ minWidth: `${seRoundsByRound.length * 220}px` }}
            >
              {seRoundsByRound.map((roundMatches, idx) => (
                <RoundColumn
                  key={idx}
                  round={idx + 1}
                  totalRounds={seRoundsByRound.length}
                  matches={roundMatches}
                  tournament={tournament}
                  onStartMatch={onStartMatch}
                  onViewMatch={onViewMatch}
                  kind={kind === "stepladder" ? "stepladder" : "se"}
                />
              ))}
            </div>
          </div>
        </BracketConnectorRoot>
      ) : (
        // Same unified-scroll fix as DoubleElimView: one overflow-x-auto
        // outside BracketConnectorRoot so the SVG and cards share one scroll
        // space. Previously separate W/L scroll containers broke connector sync.
        <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
          <BracketConnectorRoot
            matches={[
              ...winners,
              ...losers,
              ...(grandFinal ? [grandFinal] : []),
              ...(grandFinalReset ? [grandFinalReset] : []),
            ]}
            className="inline-flex flex-row items-stretch gap-6"
          >
            {/* W + L brackets: stacked rows, plain flex — no nested scroll */}
            <div className="flex flex-col gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
                  Winners Bracket
                </div>
                <div className="flex items-stretch gap-4 md:gap-6">
                  {winnersByRound.map((roundMatches, idx) => (
                    <RoundColumn
                      key={idx}
                      round={idx + 1}
                      totalRounds={winnersByRound.length}
                      matches={roundMatches}
                      tournament={tournament}
                      onStartMatch={onStartMatch}
                      onViewMatch={onViewMatch}
                      kind="de-winners"
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
                  Losers Bracket
                </div>
                <div className="flex items-stretch gap-4 md:gap-6">
                  {losersByRound.map((roundMatches, idx) => (
                    <LosersRoundColumn
                      key={idx}
                      round={idx + 1}
                      totalRounds={losersByRound.length}
                      matches={roundMatches}
                      tournament={tournament}
                      onStartMatch={onStartMatch}
                      onViewMatch={onViewMatch}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Grand Final — always to the right in the unified scroll row */}
            {grandFinal && (
              <div className="flex-shrink-0 w-[240px] flex flex-col justify-center pl-6 border-l border-rift-gold/20">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                    Grand Final
                  </div>
                  <MatchAnchor matchId={grandFinal.id}>
                    <MatchCard
                      match={grandFinal}
                      tournament={tournament}
                      onStart={() => onStartMatch(grandFinal.id)}
                      onView={
                        onViewMatch
                          ? () => onViewMatch(grandFinal.id)
                          : undefined
                      }
                    />
                  </MatchAnchor>
                  {!grandFinalReset && (
                    <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
                      W-side wins outright. L-side win forces a bracket reset.
                    </div>
                  )}
                </div>
                {grandFinalReset && (
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                      Grand Final · Reset
                    </div>
                    <MatchAnchor matchId={grandFinalReset.id}>
                      <MatchCard
                        match={grandFinalReset}
                        tournament={tournament}
                        onStart={() => onStartMatch(grandFinalReset.id)}
                        onView={
                          onViewMatch
                            ? () => onViewMatch(grandFinalReset.id)
                            : undefined
                        }
                      />
                    </MatchAnchor>
                    <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
                      L-side forced a reset — this match decides the tournament.
                    </div>
                  </div>
                )}
              </div>
            )}
          </BracketConnectorRoot>
        </div>
      )}
    </section>
  );
}
