import {
  IconArrowsExchange,
  IconArrowsRightLeft,
  IconArrowMergeRight,
  IconBolt,
  IconBug,
  IconBuildingCastle,
  IconCoins,
  IconCrosshair,
  IconCrown,
  IconDiamondFilled,
  IconDoorEnter,
  IconDroplet,
  IconEye,
  IconFishHook,
  IconFlame,
  IconFlameFilled,
  IconHandGrab,
  IconRadar2,
  IconRipple,
  IconRoute2,
  IconShieldHalfFilled,
  IconSkull,
  IconStarFilled,
  IconSword,
  IconSwords,
  IconTrendingUp,
  IconWall,
} from "@tabler/icons-react";
import type { EventType } from "@/lib/matchSimulator";

interface Props {
  type: EventType;
  size?: number;
  className?: string;
}

// Event icons sourced from Tabler Icons. Tabler covers ~95% of our event
// vocabulary cleanly (skulls, swords, shields, crowns, etc.); the few LoL-
// specific monsters (Baron, Scuttle, the dragons) are mapped to the
// closest semantic Tabler icon — Baron → skull, Atakhan → crown, dragons
// → flame variants, scuttle → bug. The set looks consistent because every
// icon shares the same Tabler stroke profile and weight.
//
// `currentColor` is preserved (Tabler icons inherit it via stroke), so
// theme classes on parent nodes still propagate.
export default function EventIcon({ type, size = 16, className = "" }: Props) {
  // Tabler stroke is 2 by default — that's a touch thick at 16px. 1.6
  // matches the rift-gold rune feel better.
  const common = {
    size,
    stroke: 1.6,
    className: `inline-block flex-shrink-0 ${className}`,
  };

  switch (type) {
    // First blood — droplet (blood drop is the iconic FB visual in pro casts).
    case "first-blood":
      return <IconDroplet {...common} fill="currentColor" fillOpacity={0.4} />;

    // Solo kill — single sword (the 1v1 outlaw).
    case "solo-kill":
      return <IconSword {...common} />;

    // Gank — crosshair / target ambush.
    case "gank":
      return <IconCrosshair {...common} />;

    // Counter-gank — half-shield (the parry / save).
    case "counter-gank":
      return <IconShieldHalfFilled {...common} />;

    // Plates — wall blocks.
    case "plates":
      return <IconWall {...common} />;

    // Dragon — flame outline (the fire-breathing classic).
    case "dragon":
      return <IconFlame {...common} />;

    // Soul — filled star (the soul is the rewarded power-up after 4 drakes).
    case "soul":
      return <IconStarFilled {...common} />;

    // Atakhan — crown (lord of the rift / dominant boss).
    case "atakhan":
      return <IconCrown {...common} />;

    // Voidgrubs — bug (literal Tabler icon for the swarm).
    case "grubs":
      return <IconBug {...common} />;

    // Rift Herald — eye (the giant eye on the rift wall is iconic).
    case "herald":
      return <IconEye {...common} />;

    // Tower — castle silhouette (the tower turret motif).
    case "tower":
      return <IconBuildingCastle {...common} />;

    // Inhibitor — diamond crystal.
    case "inhibitor":
      return <IconDiamondFilled {...common} />;

    // Skirmish — paired swords (smaller fight).
    case "skirmish":
      return <IconSwords {...common} />;

    // Pick — fish hook (literal hook champ — Blitzcrank, Thresh, Pyke).
    case "pick":
      return <IconFishHook {...common} />;

    // Teamfight — paired swords with chaos vibe (use Swords; we'll style
    // bigger via wrapping or accept it's similar to skirmish — context
    // disambiguates: skirmish is small text, teamfight is emphasis-styled).
    case "teamfight":
      return <IconSwords {...common} stroke={2} />;

    // Baron — skull (Tabler's Skull is the closest to the Baron beast).
    case "baron":
      return <IconSkull {...common} />;

    // Ace — filled star (clutch moment, gold-tier).
    case "ace":
      return <IconStarFilled {...common} />;

    // Elder dragon — bigger flame (filled, not outline).
    case "elder":
      return <IconFlameFilled {...common} />;

    // Nexus — diamond (the crystal heart).
    case "nexus":
      return <IconDiamondFilled {...common} stroke={2} />;

    // Invade — route into enemy territory (Tabler has no IconFootprint;
    // IconRoute2 reads as "they took the path into our jungle").
    case "invade":
      return <IconRoute2 {...common} />;

    // Scuttle crab — Tabler has no crab; use bug as the close semantic.
    // Combined with the row label "Scuttle" the user reads it as "the
    // little jungle bug objective".
    case "scuttle":
      return <IconBug {...common} stroke={1.4} />;

    // Roam — merge-right arrow (mid laner roaming to a side lane).
    case "roam":
      return <IconArrowMergeRight {...common} />;

    // Buff steal — hand grabbing (the steal motion).
    case "buff-steal":
      return <IconHandGrab {...common} />;

    // Shutdown — coins (the bounty paid out on the kill).
    case "shutdown":
      return <IconCoins {...common} />;

    // Backdoor — door entering (sneaky push to the nexus).
    case "backdoor":
      return <IconDoorEnter {...common} />;

    // Vision — radar (vision sweep / ward placement).
    case "vision":
      return <IconRadar2 {...common} />;

    // Outplay — bolt (the play of the game / lightning moment).
    case "outplay":
      return <IconBolt {...common} fill="currentColor" fillOpacity={0.3} />;

    // Objective trade — left/right exchange.
    case "objective-trade":
      return <IconArrowsExchange {...common} />;

    // Wave crash — ripple (Tabler's closest to "wave crashing").
    case "wave-crash":
      return <IconRipple {...common} />;

    // Power spike — trending up (item completion → power increase).
    case "power-spike":
      return <IconTrendingUp {...common} stroke={2} />;

    default:
      // Unknown event: stay graceful with a neutral arrow.
      return <IconArrowsRightLeft {...common} />;
  }
}
