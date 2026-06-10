"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { formatHeaderLabel } from "@/components/tournament/shared";
import { MatchCard } from "./MatchCard";
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
}: {
  round: number;
  totalRounds: number;
  matches: TournamentMatch[];
  tournament: TournamentState;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  const roundLabel =
    round === totalRounds
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
}

// Losers-bracket round labels differ from W-side. R1 is "Losers R1",
// terminal round is "Losers Final", penultimate is "Losers Semifinal".
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
    round === totalRounds
      ? "Losers Final"
      : round === totalRounds - 1
      ? "Losers Semi"
      : `Losers R${round}`;
  return (
    <div className="flex-1 min-w-[200px] md:min-w-[220px] flex flex-col">
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-redbright/55 text-center mb-3">
        {roundLabel}
      </div>
      <div className="flex-1 flex flex-col gap-3 md:gap-4 justify-around">
        {matches.map((m) => (
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
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
          Winners Bracket
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
            style={{ minWidth: `${wTotal * 220}px` }}
          >
            {winnersByRound.map((roundMatches, idx) => (
              <RoundColumn
                key={idx}
                round={idx + 1}
                totalRounds={wTotal}
                matches={roundMatches}
                tournament={tournament}
                onStartMatch={onStartMatch}
                onViewMatch={onViewMatch}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
          Losers Bracket
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
            style={{ minWidth: `${lTotal * 220}px` }}
          >
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

      {grandFinal && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
            Grand Final
          </div>
          <div className="max-w-md">
            <MatchCard
              match={grandFinal}
              tournament={tournament}
              onStart={() => onStartMatch(grandFinal.id)}
              onView={
                onViewMatch ? () => onViewMatch(grandFinal.id) : undefined
              }
            />
          </div>
          {!grandFinalReset && (
            <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
              W-side wins outright. L-side win forces a bracket reset.
            </div>
          )}
        </div>
      )}

      {grandFinalReset && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
            Grand Final · Reset
          </div>
          <div className="max-w-md">
            <MatchCard
              match={grandFinalReset}
              tournament={tournament}
              onStart={() => onStartMatch(grandFinalReset.id)}
              onView={
                onViewMatch ? () => onViewMatch(grandFinalReset.id) : undefined
              }
            />
          </div>
          <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
            L-side forced a reset — this match decides the tournament.
          </div>
        </div>
      )}
    </div>
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
  kind: "single-elim" | "double-elim";
  advancing: number;
  onStartMatch: (matchId: string) => void;
  onViewMatch?: (matchId: string) => void;
}) {
  // Group matches by round for SE rendering. DE gets its own filter
  // path further down.
  const seRoundsByRound: TournamentMatch[][] = (() => {
    if (kind !== "single-elim") return [];
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
          {kind === "double-elim" ? "Double-Elim" : "Single-Elim"} ·{" "}
          {advancing} teams
        </div>
      </div>

      {kind === "single-elim" ? (
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
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
              Winners Bracket
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
                style={{ minWidth: `${winnersByRound.length * 220}px` }}
              >
                {winnersByRound.map((roundMatches, idx) => (
                  <RoundColumn
                    key={idx}
                    round={idx + 1}
                    totalRounds={winnersByRound.length}
                    matches={roundMatches}
                    tournament={tournament}
                    onStartMatch={onStartMatch}
                    onViewMatch={onViewMatch}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-redbright/65 mb-2">
              Losers Bracket
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className="inline-flex items-stretch gap-4 md:gap-6 min-w-full"
                style={{ minWidth: `${losersByRound.length * 220}px` }}
              >
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
          {grandFinal && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                Grand Final
              </div>
              <div className="max-w-md">
                <MatchCard
                  match={grandFinal}
                  tournament={tournament}
                  onStart={() => onStartMatch(grandFinal.id)}
                  onView={
                    onViewMatch ? () => onViewMatch(grandFinal.id) : undefined
                  }
                />
              </div>
              {!grandFinalReset && (
                <div className="text-[8px] uppercase tracking-[0.3em] text-rift-mutedbright/40 mt-1">
                  W-side wins outright. L-side win forces a bracket reset.
                </div>
              )}
            </div>
          )}
          {grandFinalReset && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold mb-2">
                Grand Final · Reset
              </div>
              <div className="max-w-md">
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
              </div>
              <div className="text-[8px] uppercase tracking-[0.3em] text-rift-gold/60 mt-1">
                L-side forced a reset — this match decides the tournament.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
