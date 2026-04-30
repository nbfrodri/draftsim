"use client";

import { useMemo, useState } from "react";
import type { AIAlternative, AIRationale, ScoreComponent } from "@/lib/draftAI";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  rationale: AIRationale;
  champions: Champion[];
  // The currently-selected champion (driven by the hover phase). Falls back
  // to the rationale's championId when the hover hasn't fired yet.
  selectedChamp: Champion | null;
}

// Compact rationale display shown in the lock-in bar while the AI is on the
// clock. Compact view shows top-3 components inline; expanded view drops
// down a full list with rich explanations per component.
//
// Re-keyed by championId in the parent so each new AI decision triggers
// a fresh fade-in animation (the panel literally remounts).
export default function AIRationalePanel({
  rationale,
  champions,
  selectedChamp,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<number, Champion>();
    for (const c of champions) m.set(c.id, c);
    return m;
  }, [champions]);

  const displayedChamp =
    selectedChamp ?? byId.get(rationale.championId) ?? null;
  const isBan = rationale.kind === "ban";
  const compactComponents = rationale.components.slice(0, 3);
  const alternatives = rationale.alternatives.slice(0, 3);
  const hasMore = rationale.components.length > 3;

  return (
    <div className="animate-rationale flex items-center gap-2 md:gap-3 flex-1 min-w-0 relative">
      {displayedChamp && (
        <div className="slot-frame w-9 h-9 md:w-10 md:h-10 overflow-hidden shrink-0">
          <img
            src={displayedChamp.iconUrl}
            alt={displayedChamp.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {/* Top line: AI Hover · TOP / BAN */}
        <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-rift-goldbright">
          <span>AI Hover</span>
          {isBan ? (
            <>
              <span className="text-rift-muted">·</span>
              <span className="text-rift-redbright">BAN</span>
            </>
          ) : rationale.intendedLane ? (
            <>
              <span className="text-rift-muted">·</span>
              <LaneIcon lane={rationale.intendedLane} size="xs" />
              <span>{rationale.intendedLane}</span>
            </>
          ) : null}
          {hasMore && (
            <>
              <span className="text-rift-muted">·</span>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-rift-gold/80 hover:text-rift-goldbright cursor-pointer normal-case tracking-normal text-[10px]"
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse breakdown" : "Expand breakdown"}
                title={expanded ? "Show less" : "Show full breakdown"}
              >
                {expanded ? "▲" : `▼ +${rationale.components.length - 3}`}
              </button>
            </>
          )}
        </div>

        {/* Champion name */}
        {displayedChamp && (
          <div className="text-sm md:text-base text-rift-goldbright font-semibold truncate">
            {displayedChamp.name}
          </div>
        )}

        {/* Score breakdown — compact (top-3) by default, full when expanded.
            Each chip has a tabular-nums numeric prefix and a subtle pill
            background colored by sign — denser visual hierarchy than plain
            text spans. */}
        {!expanded && compactComponents.length > 0 && (
          <div className="text-[8px] md:text-[10px] flex gap-1 md:gap-1.5 flex-wrap mt-0.5">
            {compactComponents.map((c, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-0.5 px-1.5 py-px tabular-nums ${
                  c.value >= 0
                    ? "bg-rift-blue/15 text-rift-bluebright border border-rift-blue/25"
                    : "bg-rift-red/15 text-rift-redbright border border-rift-red/25"
                } ${i === 2 ? "hidden sm:inline-flex" : ""}`}
                title={`${c.label}: ${c.value > 0 ? "+" : ""}${c.value.toFixed(1)}`}
              >
                <span className="font-semibold">
                  {c.value >= 0 ? "+" : ""}
                  {Math.round(c.value)}
                </span>
                <span className="opacity-80">{compactLabel(c.label)}</span>
              </span>
            ))}
          </div>
        )}

        {/* Alternatives row — small icons of "also considered" picks */}
        {!expanded && alternatives.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 mt-0.5 text-[9px] text-rift-muted">
            <span className="uppercase tracking-[0.2em]">Also:</span>
            {alternatives.map((alt) => (
              <AlternativeChip
                key={alt.championId}
                alt={alt}
                champ={byId.get(alt.championId) ?? null}
                chosenScore={rationale.total}
              />
            ))}
          </div>
        )}
      </div>

      {/* Expanded panel — drops upward as a popover so the lock-in bar
          stays single-row when collapsed. Z-indexed above the grid; click
          on the chevron toggles. */}
      {expanded && (
        <ExpandedBreakdown
          rationale={rationale}
          byId={byId}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

function ExpandedBreakdown({
  rationale,
  byId,
  onClose,
}: {
  rationale: AIRationale;
  byId: Map<number, Champion>;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 z-30 border border-rift-gold/40 bg-rift-bgdeep/95 backdrop-blur-md p-3 md:p-4 shadow-[0_-4px_30px_rgba(0,0,0,0.6)] animate-rationale max-h-[60vh] overflow-y-auto"
      role="region"
      aria-label="Full AI scoring breakdown"
    >
      {/* Header with total score */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-rift-gold/20">
        <div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted">
            Decision breakdown
          </div>
          <div className="font-display text-sm md:text-base text-rift-goldbright">
            Total score: {rationale.total.toFixed(1)}
            {rationale.identityLabel && (
              <span className="text-rift-gold/70 ml-2 text-[11px]">
                · targeting {rationale.identityLabel}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-rift-muted hover:text-rift-goldbright text-lg leading-none px-2"
          aria-label="Close breakdown"
        >
          ×
        </button>
      </div>

      {/* All components with explanations */}
      <div className="space-y-1.5">
        {rationale.components.map((c, i) => (
          <ComponentRow key={i} component={c} rationale={rationale} />
        ))}
      </div>

      {/* Alternatives expanded */}
      {rationale.alternatives.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-rift-gold/20">
          <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted mb-1.5">
            Also considered
          </div>
          <div className="flex flex-col gap-1">
            {rationale.alternatives.map((alt) => {
              const champ = byId.get(alt.championId);
              if (!champ) return null;
              const delta = alt.score - rationale.total;
              return (
                <div
                  key={alt.championId}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    className="w-5 h-5 rounded-sm object-cover"
                  />
                  <span className="text-rift-goldbright/90 flex-1">
                    {champ.name}
                  </span>
                  <span className="text-rift-muted tabular-nums">
                    {alt.score.toFixed(1)}
                  </span>
                  <span
                    className={`tabular-nums w-12 text-right ${
                      delta >= 0
                        ? "text-rift-bluebright/80"
                        : "text-rift-redbright/80"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentRow({
  component,
  rationale,
}: {
  component: ScoreComponent;
  rationale: AIRationale;
}) {
  const positive = component.value >= 0;
  return (
    <div className="flex items-baseline gap-3 text-[11px]">
      <span
        className={`tabular-nums w-12 shrink-0 text-right ${
          positive ? "text-rift-bluebright" : "text-rift-redbright"
        }`}
      >
        {positive ? "+" : ""}
        {component.value.toFixed(1)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-rift-goldbright/90 truncate">{component.label}</div>
        <div className="text-[10px] text-rift-muted leading-snug">
          {explainComponent(component, rationale.intendedLane)}
        </div>
      </div>
    </div>
  );
}

function AlternativeChip({
  alt,
  champ,
  chosenScore,
}: {
  alt: AIAlternative;
  champ: Champion | null;
  chosenScore: number;
}) {
  if (!champ) return null;
  const delta = alt.score - chosenScore;
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${champ.name}: ${alt.score.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} vs chosen)`}
    >
      <img
        src={champ.iconUrl}
        alt={champ.name}
        className="w-4 h-4 rounded-sm object-cover"
        loading="lazy"
      />
      <span className="text-rift-muted/80">
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(1)}
      </span>
    </span>
  );
}

// Plain-language explanation of a score component. Generated from the
// label (which is structured by scorePick / scoreBan), keyed off prefixes
// rather than exact matches so dynamic labels like "Lane fit (top, tier×3)"
// or "Counter Yone" still resolve. Returns "" if no explanation available;
// the caller renders nothing in that case.
function explainComponent(
  c: ScoreComponent,
  intendedLane: Lane | null,
): string {
  const l = c.label;
  if (l.startsWith("Lane fit ")) {
    return `Champion's meta tier in ${intendedLane ?? "lane"}, weighted ×3.`;
  }
  if (l === "No open lane")
    return "Champion can't play any of the team's still-open lanes.";
  if (l === "Fills tank gap")
    return "Team has zero tanks — frontline is the highest-priority gap.";
  if (l === "Fills engage gap")
    return "Without engage the team has no opener and no peel against it.";
  if (l === "Fills hyper-carry gap")
    return "Team needs a late-game scaling carry.";
  if (l === "Adds peel")
    return "Team has fewer than 2 peelers; backline support added.";
  if (l === "Damage gap fill")
    return "Filling absent damage type (AP into 0 APs, or AD into 0 ADs).";
  if (l === "Damage stack penalty")
    return "Team is already top-heavy in this damage type — diminishing returns.";
  if (l.startsWith("Completes ")) {
    return `Pick contributes to the team's emerging comp identity.`;
  }
  if (l === "Explicit synergy")
    return "Curated pair bonus from CHAMPION_SYNERGIES table.";
  if (l === "Archetype synergy")
    return "Implicit pair bonus (engage+AOE, hyper-carry+peel, etc.).";
  if (l.startsWith("Counter ") || l.startsWith("Counters "))
    return "Hard counter to a champion the opponent has drafted in this lane.";
  if (l.startsWith("Bad matchup vs "))
    return "Champion is at a meaningful disadvantage in lane vs this opponent.";
  if (l === "Engage vs enemy poke")
    return "Engage tools close the gap on a poke comp.";
  if (l === "Peel vs enemy dive")
    return "Peel/enchanters cancel enemy dive composition.";
  if (l === "DPS vs tank wall")
    return "Hyper-carry damage shreds enemy frontline.";
  if (l === "Dive vs unprotected carry")
    return "Enemy carry has no peel — dive composition wins.";
  if (l === "Flex pick (early)")
    return "Multi-lane flex preserves draft optionality for later picks.";
  if (l === "Enemy banned archetype")
    return "Enemy banned multiple champions of this archetype — they fear it.";
  if (l === "Save for later games")
    return "Premium S+ pick — held back for future games in fearless format.";
  if (l === "Jitter") return "Small random factor for variety across runs.";
  if (l === "Lane prio (enables plays)")
    return "Early-game / pushing champ — gains lane prio that enables roams and objectives.";
  if (l === "Ranged lane pressure")
    return "Ranged kit denies CS in lane and forces the opponent into safe play.";
  if (l === "Need DPS to break tanks")
    return "Team lacks sustained damage; enemy tank stack would wall us out.";
  if (l === "Damage saturated")
    return "Team already has 3+ damage threats — diminishing returns from stacking more.";
  if (l === "Denies enemy counter")
    return "Picking this removes a hard-counter to our drafted comp from the enemy pool.";
  if (l.startsWith("Walled mono-"))
    return "Adding a 4th of this damage type — enemy tanks will stack the matching resist.";
  if (l === "Forces split-resist")
    return "Mixed AP/AD damage forces enemy tanks to split-build resists; less effective overall.";
  if (l === "Wombo amp vs no disengage")
    return "Our team has wombo+engage and the enemy has no peel — AOE finisher hits everyone.";
  if (l === "Stacks dive vs unprotected")
    return "Dive comp + unprotected enemy carry = stacked diver multiplies the kill threat.";
  if (l === "Stacks protect identity")
    return "Hyper-carry + peeler already locked; another peeler amplifies the carry's damage.";
  if (l === "Pick comp amp")
    return "Pick locked + enemy has no peel — second picker amplifies the catch threat.";
  if (l.startsWith("Fits weakside top"))
    return "Team has bot-invest comp (carry + peel sup); a sustain top frees jungler resources.";
  if (l.startsWith("Fits weakside bot"))
    return "Team has top-invest comp (carry + dive); a poke/sustain bot frees jungler resources.";
  // Ban-specific
  if (l.startsWith("Meta tier"))
    return "Champion's strongest tier across all lanes. High-tier = banworthy.";
  if (l === "Flex denial")
    return "Banning a multi-lane champ denies more options to the enemy.";
  if (l.startsWith("Threat: dive"))
    return "Enemy carry is unprotected — divers must be denied.";
  if (l.startsWith("Threat: engage"))
    return "Our poke comp would lose to enemy engage if not banned.";
  if (l.startsWith("Threat: enemy carry"))
    return "We have no tank; an enemy hyper-carry would steamroll.";
  if (l === "Denies enemy synergy")
    return "Banning this champion breaks a synergy with what the enemy already locked.";
  if (l === "Anticipates enemy pick")
    return "Predicted top-3 of the enemy's next pick — denied.";
  return "";
}

// Abbreviate common phrases so three components fit on one row even on
// narrow viewports. Full label is in the title attribute.
function compactLabel(label: string): string {
  let s = label
    .replace(/Counter-picks /, "Counter ")
    .replace(/Bad matchup vs /, "Bad vs ")
    .replace(/Denies enemy counter/, "Deny counter")
    .replace(/Lane prio \(enables plays\)/, "Lane prio")
    .replace(/Ranged lane pressure/, "Ranged prio")
    .replace(/Need DPS to break tanks/, "Need DPS")
    .replace(/Damage saturated/, "Dmg saturated")
    .replace(/Walled mono-AP vs tanks/, "Walled mono-AP")
    .replace(/Walled mono-AD vs tanks/, "Walled mono-AD")
    .replace(/Forces split-resist/, "Split-resist")
    .replace(/Wombo amp vs no disengage/, "Wombo amp")
    .replace(/Stacks dive vs unprotected/, "Dive amp")
    .replace(/Stacks protect identity/, "Protect amp")
    .replace(/Pick comp amp/, "Pick amp")
    .replace(/Fits weakside top \(resources to bot\)/, "Weakside top")
    .replace(/Fits weakside bot \(resources to top\)/, "Weakside bot")
    .replace(/Fills (.*?) gap/, "Fill $1")
    .replace(/Completes /, "Build ")
    .replace(/Damage gap fill/, "Dmg gap")
    .replace(/Damage stack penalty/, "Dmg stack")
    .replace(/Adds peel/, "Peel")
    .replace(/Save for later games/, "Save")
    .replace(/Flex pick \(early\)/, "Flex")
    .replace(/Enemy banned archetype/, "Enemy fears")
    .replace(/Anticipates enemy pick/, "Pre-empt")
    .replace(/Denies enemy synergy/, "Deny syn")
    .replace(/Threat: /, "")
    .replace(/Lane fit /, "")
    .replace(/Meta tier × \d+(\.\d+)?/, "Meta tier")
    .replace(/Flex denial/, "Flex deny")
    .replace(/ × \d+(\.\d+)?/, "")
    .replace(/Explicit synergy/, "Synergy")
    .replace(/Archetype synergy/, "Archetype")
    .replace(/Engage vs enemy poke/, "Eng vs poke")
    .replace(/Peel vs enemy dive/, "Peel vs dive")
    .replace(/DPS vs tank wall/, "DPS vs tanks")
    .replace(/Dive vs unprotected carry/, "Dive carry")
    .replace(/Jitter/, "Variance");
  if (s.length > 26) {
    const space = s.lastIndexOf(" ", 24);
    s = (space > 8 ? s.slice(0, space) : s.slice(0, 24)) + "…";
  }
  return s;
}
