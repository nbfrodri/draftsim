// Identity strategic profiles. Each comp identity (Wombo, Pick, Dive,
// etc.) gets a curated profile describing how it wants to play, when it
// peaks, what wins it games, and what beats it. Surfaced in the
// TeamComparison panel as a scouting report so the user understands the
// "story" of each draft beyond the raw stat bars.
//
// Sources of truth:
//   • Curated from 2024-2026 patches and pro/high-elo play.
//   • Win condition = the macro pattern the comp is *trying* to execute.
//   • Weakness = what hard-counters that pattern.
//   • Power spike = the game minute the comp is at its peak relative to
//     average — useful for "who needs to fight first" decisions.
//   • Versus matrix = how this identity fares against each other identity:
//        +2 = strong favorite, +1 = edge, 0 = even, -1 = unfavored,
//        -2 = hard counter.

import type { GameDuration, IdentityVsIdentity } from "./identitiesTypes";

export type IdentityLabel =
  | "Wombo Combo"
  | "Protect The Carry"
  | "Hyper Engage"
  | "Pick Comp"
  | "Poke / Siege"
  | "Dive Comp"
  | "Tank Stack"
  | "1-3-1 Splitpush"
  | "AP Burst"
  | "Bruiser Brawl"
  | "Standard Teamfight";

// Game-time "phase" the comp peaks in. Mid = 18-26 min, Late = 28+ min.
export type IdentityPeak = "early" | "mid" | "mid-late" | "late";

export interface IdentityProfile {
  label: IdentityLabel;
  // One-sentence description shown as the headline in the scouting report.
  tagline: string;
  // What the comp is trying to do — the macro plan.
  winCondition: string;
  // What loses the game for this comp; what to avoid.
  weakness: string;
  // Game minute window the comp is strongest. Used for "you need to close
  // by min X" or "you need to stall to min Y" framing.
  peak: IdentityPeak;
  peakMinutes: GameDuration;
  // Key champion roles this comp NEEDS to function. If a draft is missing
  // these, the comp is "incomplete" and the bar in the UI shows so.
  needs: string[];
  // 2-4 short bullet points the user can read as "tips" for piloting.
  playstyle: string[];
  // Versus matrix — how this comp fares against each other identity. Used
  // to render the "Wombo edges Pick Comp" matchup line in the UI. Missing
  // entries default to 0 (even).
  vs: Partial<Record<IdentityLabel, IdentityVsIdentity>>;
}

// Master profile table. Order roughly by how often the identity appears
// in pro play / high elo solo queue.
export const IDENTITY_PROFILES: Record<IdentityLabel, IdentityProfile> = {
  "Wombo Combo": {
    label: "Wombo Combo",
    tagline: "Stack AOE crowd control and chain it into one decisive teamfight.",
    winCondition:
      "Force a 5v5 around an objective (Drake/Baron pit) where every champion lands their AOE simultaneously, instantly winning the fight.",
    weakness:
      "Peel + disengage shuts the engage down before the chain triggers. Pick comps catch wombo champs out before they can group up.",
    peak: "mid-late",
    peakMinutes: { min: 22, max: 32 },
    needs: ["AOE engage (e.g. Malphite/Amumu)", "Follow-up wombo (Yasuo/MissFortune)"],
    playstyle: [
      "Group at 5 around objective timers; never split.",
      "Initiate FROM the front — your engage is what triggers the chain.",
      "Avoid open mid before R is up — you lose every skirmish.",
    ],
    vs: {
      "Pick Comp": -1, // Picks chip you down before you group
      "Poke / Siege": -1, // Poke disengages you
      "Protect The Carry": +1, // Their squishies fold to AOE
      "Standard Teamfight": +1,
      "Hyper Engage": 0,
      "Dive Comp": +1, // Your AOE hits the divers
      "1-3-1 Splitpush": +1, // You need 5v5; they're scattered
      "Tank Stack": -1, // Tanks soak your AOE without dying
      "AP Burst": 0,
      "Bruiser Brawl": +1,
    },
  },

  "Protect The Carry": {
    label: "Protect The Carry",
    tagline: "Build the entire team around shielding one hyper-carry to scaling.",
    winCondition:
      "Reach 3+ items on your hyper-carry and let them auto-attack through the enemy team while peelers wall off divers.",
    weakness:
      "Pick comps that catch the carry alone. Frontline-heavy comps that you can't burst through. Heavy poke that whittles you down before you hit power.",
    peak: "late",
    peakMinutes: { min: 28, max: 45 },
    needs: ["Hyper-carry (Vayne/Aphelios/Jinx)", "Peeler/enchanter (Lulu/Janna/Milio)"],
    playstyle: [
      "Stall the early game — give up turrets if they cost you fights.",
      "Group around the carry; they are your win condition.",
      "Pick a side lane to rotate through; never fight in the open mid.",
    ],
    vs: {
      "Wombo Combo": -1,
      "Pick Comp": -2, // Picks shred protect comps
      "Hyper Engage": -1,
      "Dive Comp": -2, // Divers ignore the peel
      "Tank Stack": -1, // Can't break their HP wall fast enough
      "Standard Teamfight": +1,
      "Poke / Siege": -1, // Poke keeps you off objectives
      "Bruiser Brawl": +1,
      "1-3-1 Splitpush": 0,
      "AP Burst": -1,
    },
  },

  "Hyper Engage": {
    label: "Hyper Engage",
    tagline: "Multiple engage tools — they pick the fight, every time.",
    winCondition:
      "Force fights on cooldown. With 2+ engage champions, even if one gets blown up, the second wave engage closes the kill.",
    weakness:
      "Counter-engage / disengage that punishes the FIRST engage hard before the second arrives. Slippery comps that just walk away.",
    peak: "mid",
    peakMinutes: { min: 18, max: 26 },
    needs: ["Two AOE engage champions"],
    playstyle: [
      "Stagger your engages — don't burn both ults at once.",
      "Take fights at choke points where peel can't escape.",
      "Aggressive jungle invade — your tempo is now.",
    ],
    vs: {
      "Wombo Combo": 0,
      "Pick Comp": +1, // You catch their pick comp picking
      "Protect The Carry": +1,
      "Dive Comp": 0,
      "Standard Teamfight": +1,
      "Tank Stack": -1,
      "Poke / Siege": -1, // Poke kites your engage
      "Bruiser Brawl": +1,
      "1-3-1 Splitpush": +1,
      "AP Burst": +1,
    },
  },

  "Pick Comp": {
    label: "Pick Comp",
    tagline: "Catch a single enemy out of position and snowball the 5v4.",
    winCondition:
      "Land a hook/long-range CC on a stray enemy and burst them down before their team can react. Convert the kill into objective control.",
    weakness:
      "Vision-controlled enemies who never walk alone. Heavy frontline that absorbs the burst. Comps with cleanse/Quicksilver.",
    peak: "mid",
    peakMinutes: { min: 14, max: 26 },
    needs: ["Hook/catch (Blitz/Thresh/Pyke/Morgana)", "Burst follow-up (Veigar/Leblanc/Brand)"],
    playstyle: [
      "Control vision aggressively — your hooks come from the fog.",
      "Never engage 5v5; only catch isolated targets.",
      "After a pick, pivot to Drake/Baron immediately.",
    ],
    vs: {
      "Wombo Combo": +1, // Pick before they group
      "Protect The Carry": +2, // Hook the carry, fight's over
      "Hyper Engage": -1, // They engage on YOU
      "Dive Comp": -1,
      "Tank Stack": -2, // Can't burst tanks; nothing to pick
      "Standard Teamfight": 0,
      "Poke / Siege": +1,
      "Bruiser Brawl": 0,
      "1-3-1 Splitpush": +1, // Splitpushers walk alone
      "AP Burst": +1,
    },
  },

  "Poke / Siege": {
    label: "Poke / Siege",
    tagline: "Whittle them down with long-range damage before any fight starts.",
    winCondition:
      "Out-range the enemy at every objective. By the time fight breaks, the enemy frontline is at 50% HP and folds.",
    weakness:
      "Hard engage that closes the gap before you rotate. Hyper-mobility that dodges your skillshots. Comps that all-in 5-man and ignore the chip.",
    peak: "mid-late",
    peakMinutes: { min: 20, max: 30 },
    needs: ["2+ poke champions (Caitlyn/Xerath/Jayce/Varus)"],
    playstyle: [
      "Establish vision around objectives — you need space to poke.",
      "Never let them close to 100 units of you.",
      "Save defensive ults for when their engage finally lands.",
    ],
    vs: {
      "Wombo Combo": +1,
      "Pick Comp": -1, // Picks catch you positioning for poke
      "Protect The Carry": +1,
      "Hyper Engage": -2, // They run down your immobile poke
      "Dive Comp": -2, // Dive ignores poke
      "Tank Stack": 0, // Hard to chip through tanks
      "Standard Teamfight": +1,
      "Bruiser Brawl": 0,
      "1-3-1 Splitpush": +1,
      "AP Burst": 0,
    },
  },

  "Dive Comp": {
    label: "Dive Comp",
    tagline: "Multiple champions that jump on the enemy backline simultaneously.",
    winCondition:
      "Collapse on the enemy ADC/mid in 5v5; with multiple dive threats, peel can only stop one.",
    weakness:
      "Coordinated peel + Quicksilver/Zhonya's. Comps with multiple peelers that wall off the dive. Hyper-mobility that escapes.",
    peak: "mid",
    peakMinutes: { min: 16, max: 26 },
    needs: ["2+ dive champions (Camille/Vi/Jarvan/Diana)", "Tank front to absorb peel"],
    playstyle: [
      "Identify the enemy carry and dive in unison.",
      "Force fights at the enemy turrets — they can't kite.",
      "Never let the enemy carry get behind 2+ peelers.",
    ],
    vs: {
      "Wombo Combo": -1,
      "Pick Comp": +1,
      "Protect The Carry": +2, // Multiple divers > peel
      "Hyper Engage": 0,
      "Tank Stack": -1, // Tanks just soak you
      "Standard Teamfight": +1,
      "Poke / Siege": +2, // Run them down
      "Bruiser Brawl": 0,
      "1-3-1 Splitpush": 0,
      "AP Burst": +1,
    },
  },

  "Tank Stack": {
    label: "Tank Stack",
    tagline: "Multiple tanks soak damage; CC chains lock the enemy down.",
    winCondition:
      "Layered CC (2+ tanks initiating) means the enemy can't reposition. Out-stat them with sheer effective HP.",
    weakness:
      "Hyper-carries with %HP damage (Vayne, Kog'Maw, Fiora). Mixed AP/AD damage that defeats single-resist itemization.",
    peak: "mid-late",
    peakMinutes: { min: 22, max: 35 },
    needs: ["2+ tanks", "Backline damage (any carry)"],
    playstyle: [
      "Group at 5 and walk down chokes — you out-trade everyone.",
      "Initiate first; your tank R is the fight starter.",
      "Build to counter their damage type (mercs vs AP, plate vs AD).",
    ],
    vs: {
      "Wombo Combo": +1,
      "Pick Comp": +2, // Nothing to pick
      "Protect The Carry": +1, // Out-stat their carry's burst window
      "Hyper Engage": +1,
      "Dive Comp": +1,
      "Standard Teamfight": +1,
      "Poke / Siege": 0,
      "Bruiser Brawl": 0,
      "1-3-1 Splitpush": -1,
      "AP Burst": -1, // Burst chunks tanks 50% HP
    },
  },

  "1-3-1 Splitpush": {
    label: "1-3-1 Splitpush",
    tagline: "Force 1v1s on side lanes; pressure all three lanes simultaneously.",
    winCondition:
      "Your splitpushers crack side towers while your 3 mid hold or trade. Enemy can never group at 5 without losing a tower.",
    weakness:
      "Comps that group up and force 5v3 — you can't catch 4. Strong global pressure (TF/Pantheon) that flanks your splitpush.",
    peak: "late",
    peakMinutes: { min: 26, max: 40 },
    needs: ["1-2 strong 1v1 champions (Fiora/Camille/Jax/Trundle)"],
    playstyle: [
      "Always have wave pressure on a side lane.",
      "Mid 3 must threaten objectives so enemy can't all collapse on splitter.",
      "TP/teleport timers are EVERYTHING — coordinate them.",
    ],
    vs: {
      "Wombo Combo": -1,
      "Pick Comp": -1,
      "Protect The Carry": 0,
      "Hyper Engage": -1,
      "Dive Comp": 0,
      "Tank Stack": +1, // Splitpush around tanks
      "Standard Teamfight": +1,
      "Poke / Siege": -1,
      "Bruiser Brawl": 0,
      "AP Burst": +1,
    },
  },

  "AP Burst": {
    label: "AP Burst",
    tagline: "Chain burst combos that delete a single target in one rotation.",
    winCondition:
      "Catch and instakill the enemy carry / squishy. With 2+ burst threats, even peel can't save the target.",
    weakness:
      "MR stacking. Tank-heavy frontline that eats your combos. Banshee's/Edge of Night that absorbs the first burst spell.",
    peak: "mid",
    peakMinutes: { min: 14, max: 24 },
    needs: ["2+ burst mages/assassins (Veigar/Leblanc/Diana/Akali)"],
    playstyle: [
      "Land your CC FIRST, then chain burst before they react.",
      "Pick low-MR backline targets; ignore the tank.",
      "Don't overstay — your value drops sharply post-combo.",
    ],
    vs: {
      "Wombo Combo": 0,
      "Pick Comp": -1,
      "Protect The Carry": +1,
      "Hyper Engage": -1,
      "Dive Comp": -1,
      "Tank Stack": +1, // Burst chunks tanks
      "Standard Teamfight": 0,
      "Poke / Siege": 0,
      "Bruiser Brawl": -1,
      "1-3-1 Splitpush": -1,
    },
  },

  "Bruiser Brawl": {
    label: "Bruiser Brawl",
    tagline: "Five sustain-fighters that win prolonged 5v5 trades.",
    winCondition:
      "Drag every fight past 8 seconds. Your sustain outlasts their burst; you walk over them in the second wave of damage.",
    weakness:
      "Hard CC chains that prevent sustained DPS. Anti-heal items / Grevious Wounds. Burst comps that nuke before sustain ramps.",
    peak: "mid-late",
    peakMinutes: { min: 20, max: 32 },
    needs: ["3+ skirmish/sustain fighters (Aatrox/Sett/Olaf/Riven)"],
    playstyle: [
      "Force prolonged fights at neutral objectives.",
      "Avoid burst windows — never get chunked at start of fight.",
      "Itemize for sustained DPS over burst.",
    ],
    vs: {
      "Wombo Combo": -1,
      "Pick Comp": 0,
      "Protect The Carry": -1, // Carries kite you
      "Hyper Engage": -1,
      "Dive Comp": 0,
      "Tank Stack": 0,
      "Standard Teamfight": +1,
      "Poke / Siege": 0,
      "AP Burst": +1,
      "1-3-1 Splitpush": 0,
    },
  },

  "Standard Teamfight": {
    label: "Standard Teamfight",
    tagline: "Balanced 5v5 setup with engage, frontline, peel, and a hyper-carry.",
    winCondition:
      "Win standard 5v5 teamfights at neutral objectives. Engage CC starts the fight, peel keeps the carry alive, carry executes.",
    weakness:
      "Cheese comps (early dive, splitpush) that avoid 5v5. Picks that dismantle the structure. Stronger engage that out-initiates yours.",
    peak: "mid-late",
    peakMinutes: { min: 22, max: 32 },
    needs: ["1 engage", "1 peel", "1 hyper-carry"],
    playstyle: [
      "Force fights at Drake/Baron — your composition shines in 5v5.",
      "Engage first; never let them dictate the fight.",
      "Protect the carry with peel; they win the fight in extended trades.",
    ],
    vs: {
      "Wombo Combo": -1,
      "Pick Comp": 0,
      "Protect The Carry": -1,
      "Hyper Engage": -1,
      "Dive Comp": -1,
      "Tank Stack": -1,
      "Poke / Siege": -1,
      "1-3-1 Splitpush": -1, // They avoid your fights
      "AP Burst": 0,
      "Bruiser Brawl": -1,
    },
  },
};

// Lookup helper for the UI.
export function getIdentityProfile(label: string | null): IdentityProfile | null {
  if (label == null) return null;
  return IDENTITY_PROFILES[label as IdentityLabel] ?? null;
}

// Compute matchup edge between two identities. Positive = blue identity
// favored, negative = red identity favored. Bounded -2..+2.
export function identityMatchupEdge(
  blueLabel: string | null,
  redLabel: string | null,
): { edge: number; phrase: string } {
  if (!blueLabel || !redLabel) {
    return { edge: 0, phrase: "—" };
  }
  const blueProfile = getIdentityProfile(blueLabel);
  const redProfile = getIdentityProfile(redLabel);
  if (!blueProfile || !redProfile) {
    return { edge: 0, phrase: `${blueLabel} vs ${redLabel}` };
  }
  // Blue's vs Red plus inverse of Red's vs Blue, averaged. Catches asymmetric
  // entries (one side has stronger opinion than the other).
  const blueVsRed = blueProfile.vs[redLabel as IdentityLabel] ?? 0;
  const redVsBlue = redProfile.vs[blueLabel as IdentityLabel] ?? 0;
  const edge = (blueVsRed - redVsBlue) / 2;
  let phrase: string;
  if (edge >= 1.5) phrase = `${blueLabel} hard-counters ${redLabel}`;
  else if (edge >= 0.5) phrase = `${blueLabel} edges ${redLabel}`;
  else if (edge <= -1.5) phrase = `${redLabel} hard-counters ${blueLabel}`;
  else if (edge <= -0.5) phrase = `${redLabel} edges ${blueLabel}`;
  else phrase = `${blueLabel} vs ${redLabel} — even`;
  return { edge, phrase };
}
