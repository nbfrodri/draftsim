import type { EventType } from "@/lib/matchSimulator";

interface Props {
  type: EventType;
  size?: number;
  className?: string;
}

// Inline SVG icons — drawn rather than fetched so they're cache-free, theme
// the rift gold/blue/red palette via currentColor, and stay legible at 14px.
export default function EventIcon({ type, size = 14, className = "" }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: `inline-block flex-shrink-0 ${className}`,
  };

  switch (type) {
    // Skull — paired hollows for sockets, jaw teeth.
    case "first-blood":
      return (
        <svg {...common}>
          <path d="M8 1.5c-3 0-5 2.2-5 5.2 0 1.6.7 2.9 1.5 3.6v2.2h2v1.5h1v-1.5h1v1.5h1v-1.5h2v-2.2c.8-.7 1.5-2 1.5-3.6 0-3-2-5.2-5-5.2z" fill="currentColor" fillOpacity="0.18" />
          <circle cx="6" cy="7.5" r="1.3" fill="currentColor" />
          <circle cx="10" cy="7.5" r="1.3" fill="currentColor" />
        </svg>
      );

    // Generic dragon — lizard silhouette, single eye dot.
    case "dragon":
      return (
        <svg {...common}>
          <path d="M2 7.5c2-3 5-3 6-1.5C9 4.5 12 4.5 14 7.5c-1 1.5-3 1-4 .5 0 2-1 3.5-2 5-1-1.5-2-3-2-5-1 .5-3 1-4-.5z" fill="currentColor" fillOpacity="0.22" />
          <circle cx="8" cy="6" r="0.5" fill="currentColor" />
        </svg>
      );

    // Soul — radiant orb, double ring.
    case "soul":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" fill="currentColor" fillOpacity="0.15" />
          <circle cx="8" cy="8" r="3.5" fill="currentColor" fillOpacity="0.45" />
          <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5" strokeWidth="0.9" />
        </svg>
      );

    // Atakhan — spiked crown / blood crown silhouette.
    case "atakhan":
      return (
        <svg {...common}>
          <path d="M2.5 11V6.5l2.5 2L8 4l3 4.5 2.5-2V11z" fill="currentColor" fillOpacity="0.22" />
          <line x1="3" y1="13" x2="13" y2="13" />
          <circle cx="5" cy="9" r="0.5" fill="currentColor" />
          <circle cx="11" cy="9" r="0.5" fill="currentColor" />
        </svg>
      );

    // Voidgrubs — wave of small worms.
    case "grubs":
      return (
        <svg {...common} strokeWidth={1.5}>
          <path d="M2 10c1.5-3 3-3 4 0s2.5 3 4 0 2.5-3 4 0" />
          <circle cx="2.5" cy="9.5" r="0.7" fill="currentColor" />
        </svg>
      );

    // Rift Herald — single fierce eye.
    case "herald":
      return (
        <svg {...common}>
          <path d="M2 8c1.5-2.5 3.5-3.5 6-3.5S12.5 5.5 14 8c-1.5 2.5-3.5 3.5-6 3.5S3.5 10.5 2 8z" fill="currentColor" fillOpacity="0.18" />
          <circle cx="8" cy="8" r="2.5" fill="currentColor" fillOpacity="0.7" />
          <circle cx="8" cy="8" r="0.9" fill="#000" />
        </svg>
      );

    // Tower — turret with crenellated top.
    case "tower":
      return (
        <svg {...common}>
          <path d="M5 14h6v-3h1V9h-1V6h-1V4L8 2 6 4v2H5v3H4v2h1z" fill="currentColor" fillOpacity="0.22" />
          <line x1="6.5" y1="2.5" x2="6.5" y2="4" />
          <line x1="9.5" y1="2.5" x2="9.5" y2="4" />
        </svg>
      );

    // Inhibitor — diamond crystal with internal lines.
    case "inhibitor":
      return (
        <svg {...common}>
          <path d="M8 2l5 4v6l-5 2-5-2V6z" fill="currentColor" fillOpacity="0.2" />
          <path d="M8 2v12M3 6l10 6M3 12l10-6" strokeWidth="0.7" opacity="0.6" />
        </svg>
      );

    // Solo kill — lone vertical sword striking down.
    case "solo-kill":
      return (
        <svg {...common} strokeWidth={1.5}>
          <path d="M8 1v11" strokeLinecap="round" strokeWidth={1.8} />
          <path d="M5.5 9L8 12l2.5-3" strokeLinecap="round" />
          <path d="M6.5 1.5h3M5.5 3h5" strokeWidth={1.2} />
        </svg>
      );

    // Gank — three converging arrows surprising the lane.
    case "gank":
      return (
        <svg {...common} strokeWidth={1.5} strokeLinecap="round">
          <circle cx="8" cy="9" r="2" fill="currentColor" fillOpacity="0.3" />
          <path d="M2 3l4 4M14 3l-4 4M8 1v3" />
          <path d="M3 6l3-1M13 6l-3-1" strokeWidth={1.1} />
        </svg>
      );

    // Counter-gank — flipped chevron / shield + arrow.
    case "counter-gank":
      return (
        <svg {...common} strokeWidth={1.5} strokeLinecap="round">
          <path d="M8 14l-4-4 4-4 4 4-4 4z" fill="currentColor" fillOpacity="0.2" />
          <path d="M8 4v-2M5 5l-2-2M11 5l2-2" />
        </svg>
      );

    // Plates — three small armor plates stacked.
    case "plates":
      return (
        <svg {...common} strokeWidth={1.3}>
          <path d="M3 3h10v3H3zM3 7h10v3H3zM3 11h10v3H3z" fill="currentColor" fillOpacity="0.2" />
          <path d="M5 4.5h6M5 8.5h6M5 12.5h6" strokeWidth={0.8} opacity="0.5" />
        </svg>
      );

    // Skirmish — single crossed swords (smaller fight).
    case "skirmish":
      return (
        <svg {...common} strokeWidth={1.6}>
          <path d="M3 13l8-8M3 5l8 8" />
        </svg>
      );

    // Pick — shepherd hook curve with chain dot.
    case "pick":
      return (
        <svg {...common} strokeWidth={1.5}>
          <path d="M11 2v7c0 2.5-1.5 4-4 4s-4-1.5-4-4" />
          <path d="M3 9H1.5M3 9l2-2" />
          <circle cx="11" cy="2" r="0.6" fill="currentColor" />
        </svg>
      );

    // Teamfight — bigger crossed swords with hilts.
    case "teamfight":
      return (
        <svg {...common} strokeWidth={1.6}>
          <path d="M2 14L14 2M2 2l12 12" />
          <path d="M2 4l2-2M14 12l-2 2M12 2l2 2M2 14l2-2" strokeWidth="2" />
        </svg>
      );

    // Baron — large skull with horns sweeping out.
    case "baron":
      return (
        <svg {...common}>
          <path d="M3 1l2 3M11 4l2-3" />
          <path d="M8 3c-3 0-5 2-5 5 0 1.7 1 3.2 1.5 3.7V14h7v-2.3c.5-.5 1.5-2 1.5-3.7 0-3-2-5-5-5z" fill="currentColor" fillOpacity="0.25" />
          <circle cx="6" cy="8" r="1.2" fill="currentColor" />
          <circle cx="10" cy="8" r="1.2" fill="currentColor" />
          <path d="M7 12.5h2" strokeWidth="0.9" />
        </svg>
      );

    // Ace — five-point star.
    case "ace":
      return (
        <svg {...common} strokeWidth={1.4}>
          <path d="M8 1.5l1.7 4.5h4.8l-3.9 2.9 1.5 4.7L8 11l-4.1 2.6 1.5-4.7L1.5 6h4.8z" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );

    // Elder — dragon with halo above.
    case "elder":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="2.5" rx="3" ry="1" />
          <path d="M2 9c2-3 5-3 6-1.5C9 6 12 6 14 9c-1 1.5-3 1-4 .5 0 2-1 3.5-2 5-1-1.5-2-3-2-5-1 .5-3 1-4-.5z" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );

    // Nexus — diamond facets, the win condition.
    case "nexus":
      return (
        <svg {...common} strokeWidth={1.4}>
          <path d="M8 1l6 7-6 7-6-7z" fill="currentColor" fillOpacity="0.3" />
          <path d="M8 1v14M2 8h12" strokeWidth="0.7" opacity="0.6" />
        </svg>
      );
  }
}
