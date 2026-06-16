"use client";

import {
  IconAlien,
  IconAnchor,
  IconAnkh,
  IconApple,
  IconAtom,
  IconAward,
  IconAxe,
  IconBackpack,
  IconBat,
  IconBeach,
  IconBell,
  IconBolt,
  IconBone,
  IconBow,
  IconBulb,
  IconButterfly,
  IconCactus,
  IconCandle,
  IconCarrot,
  IconCat,
  IconCherry,
  IconClock,
  IconCloud,
  IconClubs,
  IconCoffin,
  IconCompass,
  IconCookie,
  IconCrown,
  IconDiamond,
  IconDiamonds,
  IconDog,
  IconEgg,
  IconEye,
  IconFeather,
  IconFingerprint,
  IconFish,
  IconFlag,
  IconFlame,
  IconFlower,
  IconFountain,
  IconGalaxy,
  IconGhost,
  IconHammer,
  IconHeart,
  IconHelmet,
  IconHexagon,
  IconHorse,
  IconHorseshoe,
  IconHourglass,
  IconKey,
  IconLeaf,
  IconLemon,
  IconLifebuoy,
  IconLock,
  IconMagnet,
  IconMask,
  IconMoon,
  IconMountain,
  IconMusic,
  IconOctagon,
  IconParachute,
  IconPaw,
  IconPlanet,
  IconPyramid,
  IconRocket,
  IconSailboat,
  IconScissors,
  IconShield,
  IconSkull,
  IconSnowflake,
  IconSpade,
  IconSparkles,
  IconSphere,
  IconSpider,
  IconSpiral,
  IconSquare,
  IconStar,
  IconStars,
  IconSun,
  IconSword,
  IconTelescope,
  IconTent,
  IconTornado,
  IconTower,
  IconTrident,
  IconUmbrella,
  IconWand,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { TeamIconKey } from "@/lib/tournament";

// Map curated TeamIconKey → Tabler React component. The set is grown
// to 64+ distinct icons so 32-team tournaments don't repeat.
const ICON_MAP: Record<string, typeof IconShield> = {
  // Originals (kept for backwards compatibility with persisted teams)
  shield: IconShield,
  sword: IconSword,
  crown: IconCrown,
  flame: IconFlame,
  skull: IconSkull,
  wolf: IconPaw,
  dragon: IconAlien,
  phoenix: IconStar,
  lion: IconCat,
  tiger: IconCat,
  eagle: IconFeather,
  ghost: IconGhost,
  bolt: IconBolt,
  spade: IconSpade,
  anchor: IconAnchor,
  horseshoe: IconHorseshoe,
  hexagon: IconHexagon,
  snowflake: IconSnowflake,
  axe: IconAxe,
  trident: IconTrident,
  // Expanded set (Phase 5+)
  star: IconStar,
  stars: IconStars,
  heart: IconHeart,
  diamond: IconDiamond,
  diamonds: IconDiamonds,
  clubs: IconClubs,
  square: IconSquare,
  octagon: IconOctagon,
  bow: IconBow,
  hammer: IconHammer,
  helmet: IconHelmet,
  cat: IconCat,
  paw: IconPaw,
  feather: IconFeather,
  alien: IconAlien,
  cloud: IconCloud,
  sun: IconSun,
  moon: IconMoon,
  rocket: IconRocket,
  leaf: IconLeaf,
  mountain: IconMountain,
  fish: IconFish,
  butterfly: IconButterfly,
  spider: IconSpider,
  horse: IconHorse,
  dog: IconDog,
  bat: IconBat,
  carrot: IconCarrot,
  cherry: IconCherry,
  apple: IconApple,
  lemon: IconLemon,
  cookie: IconCookie,
  egg: IconEgg,
  cactus: IconCactus,
  flower: IconFlower,
  fountain: IconFountain,
  pyramid: IconPyramid,
  beach: IconBeach,
  sailboat: IconSailboat,
  tower: IconTower,
  tent: IconTent,
  candle: IconCandle,
  coffin: IconCoffin,
  ankh: IconAnkh,
  bone: IconBone,
  bulb: IconBulb,
  bell: IconBell,
  flag: IconFlag,
  award: IconAward,
  mask: IconMask,
  eye: IconEye,
  fingerprint: IconFingerprint,
  compass: IconCompass,
  key: IconKey,
  lock: IconLock,
  magnet: IconMagnet,
  lifebuoy: IconLifebuoy,
  scissors: IconScissors,
  parachute: IconParachute,
  backpack: IconBackpack,
  hourglass: IconHourglass,
  clock: IconClock,
  music: IconMusic,
  atom: IconAtom,
  galaxy: IconGalaxy,
  planet: IconPlanet,
  telescope: IconTelescope,
  tornado: IconTornado,
  umbrella: IconUmbrella,
  spiral: IconSpiral,
  sparkles: IconSparkles,
  sphere: IconSphere,
  wand: IconWand,
};

export interface TeamIconProps {
  iconKey?: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  // Optional explicit color (hex, rgb, etc). When provided, takes
  // precedence over any parent `currentColor`. Used so a team's
  // chosen color always paints its icon, even nested inside elements
  // that set their own text color.
  color?: string;
  // Optional real-team logo URL. When present (and it loads), the logo
  // is shown instead of the Tabler icon; on a load error we fall back to
  // the colored icon so a dead URL never leaves a blank space.
  logoUrl?: string;
}

export default function TeamIcon({
  iconKey,
  size = 16,
  className = "",
  strokeWidth = 1.6,
  color,
  logoUrl,
}: TeamIconProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  // Reset the failure flag when the URL changes so a new logo gets a
  // fresh chance to load.
  useEffect(() => setLogoFailed(false), [logoUrl]);

  if (logoUrl && !logoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote esports
      // CDN host; next/image would need per-host config and offers no win
      // for a tiny icon.
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
        onError={() => setLogoFailed(true)}
      />
    );
  }

  const Component = (iconKey && ICON_MAP[iconKey]) || ICON_MAP.shield;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      color={color}
    />
  );
}
